#!/usr/bin/env node
/**
 * Headless-browser stream extractor for sites that defeat scrapers by
 * rendering the player with JavaScript (e.g. PornHub, modern Vimeo, etc).
 *
 * Launches Chromium, loads the page, and watches the network for HLS / DASH /
 * progressive MP4 requests. Returns the best stream URL it sees.
 *
 * Usage:  node browser_extract.mjs <url>
 * Stdout: single-line JSON  { streamUrl, type, title, headers? }  or  { error }
 */
import { chromium } from "playwright";
import net from "node:net";

const url = process.argv[2];
if (!url) {
  process.stdout.write(JSON.stringify({ error: "no URL supplied" }) + "\n");
  process.exit(2);
}

const NAV_TIMEOUT = 25000;
const SETTLE_MS = 6000;

// SSRF guard: block any sub-request the rendered page tries to make against
// private / loopback / link-local / cloud-metadata addresses, even after
// redirects. The server.js SSRF check only validates the initial URL.
function isPrivateAddress(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return true;
  // Cloud metadata services
  if (h === "169.254.169.254" || h === "metadata.google.internal") return true;
  const family = net.isIP(h);
  if (family === 4) {
    const p = h.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] >= 224) return true; // multicast / reserved
  } else if (family === 6) {
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA
    if (h.startsWith("fe80:")) return true; // link-local
    if (h.startsWith("::ffff:")) {
      // IPv4-mapped IPv6
      return isPrivateAddress(h.slice(7));
    }
  }
  return false;
}

function classify(u) {
  const lower = u.split("?")[0].toLowerCase();
  if (lower.endsWith(".m3u8")) return "hls";
  if (lower.endsWith(".mpd")) return "dash";
  if (lower.endsWith(".mp4") || lower.endsWith(".m4v") || lower.endsWith(".webm")) return "mp4";
  if (lower.endsWith(".mkv")) return "mkv";
  return null;
}

let __browserRef = null;
async function __cleanupAndExit(code) {
  try { await __browserRef?.close(); } catch { /* ignore */ }
  process.exit(code);
}
process.on("SIGTERM", () => __cleanupAndExit(0));
process.on("SIGINT", () => __cleanupAndExit(0));

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--mute-audio"],
    });
    __browserRef = browser;
    const ctx = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      locale: "en-US",
      extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
    });

    // Pre-set common age-gate cookies so consent walls don't block playback.
    try {
      const u = new URL(url);
      const domain = "." + u.hostname.replace(/^www\./, "");
      const baseCookie = { domain, path: "/", httpOnly: false, secure: true, sameSite: "Lax" };
      await ctx.addCookies([
        { ...baseCookie, name: "age_verified", value: "1" },
        { ...baseCookie, name: "platform", value: "pc" },
        { ...baseCookie, name: "accessAgeDisclaimerPH", value: "1" },
        { ...baseCookie, name: "accessAgeDisclaimerUK", value: "1" },
        { ...baseCookie, name: "accessPH", value: "1" },
        { ...baseCookie, name: "cookiesBannerSeen", value: "1" },
      ]);
    } catch {
      /* ignore */
    }

    const candidates = new Map(); // url -> { type, ts }
    let mp4Best = null; // largest mp4 by content-length

    ctx.on("response", async (resp) => {
      try {
        const ru = resp.url();
        const t = classify(ru);
        if (!t) return;
        if (t === "mp4" || t === "mkv") {
          // Skip tiny segment-style mp4s that come from MSE (.mp4?range= etc small)
          const len = Number(resp.headers()["content-length"] || 0);
          if (!mp4Best || len > mp4Best.size) {
            mp4Best = { url: ru, size: len, type: t };
          }
          candidates.set(ru, { type: t, ts: Date.now() });
        } else {
          // Prefer "master"/"playlist" m3u8 over media playlists
          candidates.set(ru, { type: t, ts: Date.now() });
        }
      } catch {
        /* ignore */
      }
    });

    const page = await ctx.newPage();
    // Block heavy junk + enforce SSRF protection on every sub-request.
    await page.route("**/*", (route) => {
      const r = route.request();
      const rt = r.resourceType();
      let host = "";
      try { host = new URL(r.url()).hostname; } catch { /* malformed */ }
      if (isPrivateAddress(host)) return route.abort();
      if (rt === "image" || rt === "font") return route.abort();
      return route.continue();
    });

    let title = "";
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      title = (await page.title().catch(() => "")) || "";
      // Try to trigger playback
      await page.evaluate(() => {
        const v = document.querySelector("video");
        if (v) {
          v.muted = true;
          v.play().catch(() => {});
        }
        document.querySelectorAll("button,div,span").forEach((el) => {
          const t = (el.textContent || "").trim().toLowerCase();
          if (/^(play|i agree|enter|continue|accept|got it|ok)$/.test(t)) {
            try { el.click(); } catch {}
          }
        });
      }).catch(() => {});
      // Let network requests settle
      await page.waitForTimeout(SETTLE_MS);
      // Try one more play() in case the player loaded late
      await page.evaluate(() => {
        const v = document.querySelector("video");
        if (v) v.play().catch(() => {});
      }).catch(() => {});
      await page.waitForTimeout(2000);
    } catch (e) {
      // Continue with whatever we caught so far
    }

    // Pick best candidate: HLS master > DASH > MP4 > any
    const all = Array.from(candidates.entries()).map(([u, v]) => ({ url: u, ...v }));
    const hlsMaster = all.find((c) => c.type === "hls" && /master|index|playlist/i.test(c.url));
    const hlsAny = all.find((c) => c.type === "hls");
    const dash = all.find((c) => c.type === "dash");
    const mp4 = mp4Best || all.find((c) => c.type === "mp4");

    const pick = hlsMaster || hlsAny || dash || mp4;
    if (!pick) {
      process.stdout.write(
        JSON.stringify({ error: "No video stream detected on the page within timeout." }) + "\n",
      );
      process.exit(0);
    }

    process.stdout.write(
      JSON.stringify({
        streamUrl: pick.url,
        type: pick.type === "mkv" ? "mp4" : pick.type,
        title: title || "",
      }) + "\n",
    );
  } catch (e) {
    process.stdout.write(
      JSON.stringify({ error: `${e?.name || "Error"}: ${String(e?.message || e).slice(0, 240)}` }) +
        "\n",
    );
    process.exit(0);
  } finally {
    try { await browser?.close(); } catch {}
  }
})();
