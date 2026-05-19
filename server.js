import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import dns from "node:dns/promises";
import net from "node:net";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import fsSync from "node:fs";

function isPrivateIp(ip) {
  if (!ip) return true;
  if (net.isIP(ip) === 4) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
    if (p[0] >= 224) return true;
    return false;
  }
  if (net.isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return false;
  }
  return true;
}

async function urlIsSafeForExtraction(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return false; }
  if (!/^https?:$/.test(parsed.protocol)) return false;
  const host = parsed.hostname.toLowerCase();
  if (!host) return false;
  const blockedHosts = ["localhost", "metadata.google.internal", "metadata"];
  if (blockedHosts.includes(host)) return false;
  if (host.endsWith(".internal") || host.endsWith(".local") || host.endsWith(".lan")) return false;
  if (net.isIP(host)) {
    return !isPrivateIp(host);
  }
  try {
    const records = await dns.lookup(host, { all: true });
    if (!records.length) return false;
    for (const r of records) {
      if (isPrivateIp(r.address)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const VALID_SOURCE_TYPES = ["youtube", "mp4", "hls", "dash"];

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DRM_KEYWORDS = [
  "netflix", "nflxvideo", "nflxso",
  "disneyplus", "disney-plus", "bamgrid", "dssott",
  "hulu.com", "huluim", "huluad",
  "primevideo", "amazonvideo", "atv-ext",
  "hbomax", "hbo.com", "max.com",
  "peacocktv", "peacock.com",
  "paramountplus", "paramount.com",
  "appletv", "tv.apple.com",
  "spotify.com",
];

function detectDrm(url) {
  const lower = String(url || "").toLowerCase();
  return DRM_KEYWORDS.some((k) => lower.includes(k));
}

function detectStreamType(url) {
  const u = String(url || "").toLowerCase().split("?")[0].split("#")[0];
  if (u.endsWith(".m3u8") || u.endsWith(".m3u")) return "hls";
  if (u.endsWith(".mpd")) return "dash";
  if (/\/manifest\.m3u8/i.test(url) || /format=m3u8/i.test(url)) return "hls";
  if (/\/manifest\.mpd/i.test(url) || /format=mpd/i.test(url)) return "dash";
  return "mp4";
}

const extractCache = new Map();
const EXTRACT_TTL_MS = 10 * 60 * 1000;
const EXTRACT_CACHE_MAX = 200;

// Server-side cookie jar: stores cookies from page fetches per domain
// so the HLS proxy can forward them (needed for PornHub-like sites).
// Map<string, { cookies: string, t: number }>
const domainCookies = new Map();
const COOKIE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function storeCookiesFromResponse(resp, url) {
  try {
    const setCookies = resp.headers.getSetCookie?.() || [];
    if (setCookies.length > 0) {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      const cookieStr = setCookies.map((c) => c.split(";")[0]).join("; ");
      domainCookies.set(domain, { cookies: cookieStr, t: Date.now() });
    }
  } catch { /* ignore */ }
}

function getCookiesForDomain(hostname) {
  const domain = hostname.replace(/^www\./, "");
  // Try exact match and parent domains
  for (const [d, entry] of domainCookies) {
    if (Date.now() - entry.t >= COOKIE_TTL_MS) { domainCookies.delete(d); continue; }
    if (domain === d || domain.endsWith("." + d) || d.endsWith("." + domain.split(".").slice(-2).join("."))) {
      return entry.cookies;
    }
  }
  return "";
}

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(SERVER_DIR, "data");
if (!fsSync.existsSync(DATA_DIR)) {
  fsSync.mkdirSync(DATA_DIR, { recursive: true });
}

let globalHistory = [];
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
try {
  if (fsSync.existsSync(HISTORY_FILE)) {
    globalHistory = JSON.parse(fsSync.readFileSync(HISTORY_FILE, "utf-8"));
  }
} catch (err) {
  console.error("Could not load history.json", err);
}

function appendGlobalHistory(entry) {
  globalHistory.unshift(entry);
  if (globalHistory.length > 500) globalHistory.pop(); // keep last 500 overall
  fs.writeFile(HISTORY_FILE, JSON.stringify(globalHistory)).catch(() => {});
}

// Periodically sweep expired extract cache entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of extractCache) {
    if (now - entry.t >= EXTRACT_TTL_MS) extractCache.delete(key);
  }
  for (const [d, entry] of domainCookies) {
    if (now - entry.t >= COOKIE_TTL_MS) domainCookies.delete(d);
  }
}, 5 * 60 * 1000).unref();

const YTDLP_WRAPPER = path.join(SERVER_DIR, "bin", "extract.py");
const BROWSER_EXTRACTOR = path.join(SERVER_DIR, "bin", "browser_extract.mjs");

function isIpBlockedHost(_url) {
  return false; 
}

let __browserExtractInFlight = 0;
const BROWSER_EXTRACT_MAX_CONCURRENT = 1;

function browserExtract(url) {
  if (__browserExtractInFlight >= BROWSER_EXTRACT_MAX_CONCURRENT) {
    return Promise.reject(new Error("Browser extractor is busy, try again in a few seconds."));
  }
  __browserExtractInFlight += 1;
  return new Promise((resolve, reject) => {
    const child = execFile(
      "node",
      [BROWSER_EXTRACTOR, url],
      { timeout: 60000, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        const line = String(stdout || "").split("\n").find((l) => l.trim().startsWith("{"));
        if (!line) {
          reject(new Error(err?.message || "Browser extractor produced no output"));
          return;
        }
        try {
          const parsed = JSON.parse(line);
          if (parsed.error && !parsed.streamUrl) {
            reject(new Error(parsed.error));
            return;
          }
          resolve(parsed);
        } catch {
          reject(new Error("Failed to parse browser extractor output"));
        }
      },
    );
    const release = () => { __browserExtractInFlight = Math.max(0, __browserExtractInFlight - 1); };
    child.once("exit", release);
    child.once("error", release);
  });
}

const PYTHON_CMD = process.platform === "win32" ? "python" : "python3";

function ytDlpExtract(url) {
  return new Promise((resolve, reject) => {
    execFile(
      PYTHON_CMD,
      [YTDLP_WRAPPER, url],
      { timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        let parsed = null;
        const line = String(stdout || "").split("\n").find((l) => l.trim().startsWith("{"));
        if (line) {
          try { parsed = JSON.parse(line); } catch { /* ignore */ }
        }
        if (parsed && parsed.error && !parsed.url && !parsed.formats) {
          reject(new Error(parsed.error));
          return;
        }
        if (parsed) { resolve(parsed); return; }
        if (err) {
          reject(new Error(stderr ? String(stderr).split("\n").pop().slice(0, 240) : err.message));
          return;
        }
        reject(new Error("Failed to parse extractor output"));
      },
    );
  });
}

function ytDlpFormatsToStreams(info) {
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const duration = info?.duration || 0;
  const streams = [];
  const seen = new Set();

  for (const f of formats) {
    if (!f?.url) continue;
    if (seen.has(f.url)) continue;
    if (f.vcodec === "none" && f.acodec !== "none") continue;
    seen.add(f.url);

    const height = f.height || 0;
    const tbr = f.tbr || f.vbr || 0;
    const isHls = (f.protocol || "").includes("m3u8") || (f.url || "").includes(".m3u8");
    const isDash = (f.protocol || "").includes("dash") || (f.url || "").includes(".mpd");
    const type = isHls ? "hls" : isDash ? "dash" : "mp4";

    let sizeMb = null;
    if (f.filesize) {
      sizeMb = Math.round(f.filesize / 1024 / 1024);
    } else if (tbr && duration) {
      sizeMb = Math.round((tbr * 1000 / 8 * duration) / 1024 / 1024);
    }

    const qualityLabel = height ? `${height}p` : (f.format_note || f.format_id || "stream");
    const sizeLabel = sizeMb ? ` · ~${sizeMb} MB` : (tbr ? ` · ~${Math.round(tbr)} kbps` : "");

    streams.push({
      url: f.url,
      type,
      quality: height ? String(height) : null,
      format: f.ext || null,
      label: qualityLabel + sizeLabel,
      sizeMb,
      tbr: tbr || null,
    });
  }

  if (streams.length === 0 && info?.url) {
    streams.push({ url: info.url, type: detectStreamType(info.url), quality: null, label: "stream" });
  }

  streams.sort((a, b) => {
    const ha = parseInt(a.quality, 10) || 0;
    const hb = parseInt(b.quality, 10) || 0;
    return (hb - ha) || ((b.tbr || 0) - (a.tbr || 0));
  });

  const labelSeen = new Set();
  return streams.filter((s) => {
    const key = s.quality || s.label;
    if (labelSeen.has(key)) return false;
    labelSeen.add(key);
    return true;
  });
}

function pickBestStream(info) {
  const formats = Array.isArray(info?.formats) ? info.formats : [];
  const playable = formats.filter((f) => f && f.url && (f.vcodec !== "none" || f.acodec !== "none"));
  const withVideo = playable.filter((f) => f.vcodec && f.vcodec !== "none");
  const candidates = withVideo.length ? withVideo : playable;
  const ranked = candidates
    .filter((f) => !!f.url)
    .map((f) => ({
      url: f.url,
      ext: f.ext,
      protocol: f.protocol || "",
      height: f.height || 0,
      tbr: f.tbr || 0,
      vcodec: f.vcodec,
      acodec: f.acodec,
    }))
    .sort((a, b) => (b.height - a.height) || (b.tbr - a.tbr));
  const top = ranked[0];
  if (!top && info?.url) return { url: info.url, type: detectStreamType(info.url) };
  if (!top) return null;
  let type = "mp4";
  if (top.protocol.includes("m3u8") || top.url.includes(".m3u8")) type = "hls";
  else if (top.protocol.includes("dash") || top.url.includes(".mpd")) type = "dash";
  return { url: top.url, type };
}

// Use SERVER_DIR (defined above) instead of re-deriving __dirname

const rawPort = process.env.PORT || "10000";
const PORT = Number(rawPort);

// --- التعديل هنا: توحيد المسار الأساسي ليطابق الواجهة ---
let BASE_PATH = process.env.BASE_PATH || "/watch-party/";
if (!BASE_PATH.endsWith("/")) BASE_PATH += "/";

// Security: Admin credentials — override via ADMIN_USERNAME / ADMIN_PASSWORD env vars.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "Admin1963";
const ADMIN_PASSWORD_VAL = process.env.ADMIN_PASSWORD || "Saad1963";
let activeSuperAdminSocketId = null;

const app = express();
app.disable("x-powered-by");

// Security headers middleware
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=(), payment=()"
  );
  next();
});

app.use(express.json({ limit: "8mb" }));

const httpServer = createServer(app);
// CORS: origin=true allows any origin. This is intentional for easy deployment
// (the app may be accessed from different domains). For stricter setups, set
// the ALLOWED_ORIGINS env var to a comma-separated list of allowed origins.
const corsOrigin = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : true;
const io = new Server(httpServer, {
  path: `${BASE_PATH}socket.io`,
  cors: { origin: corsOrigin, credentials: true },
});

const publicDir = path.join(SERVER_DIR, "public");
app.use(BASE_PATH, express.static(publicDir, { index: false }));

function sendIndex(_req, res) {
  res.sendFile(path.join(publicDir, "index.html"));
}
app.get(BASE_PATH, sendIndex);
app.get(`${BASE_PATH}r/:roomId`, sendIndex);
app.get(`${BASE_PATH}healthz`, (_req, res) => res.json({ status: "ok" }));

// --- التعديل هنا: تحويل الرابط الرئيسي ليفتح التطبيق فوراً ---
app.get("/", (req, res) => res.redirect(BASE_PATH));


app.post(`${BASE_PATH}api/extract`, async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }
  // YouTube URLs: use native IFrame player, skip yt-dlp (blocked by bot detection)
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    const vId = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/)?.[1];
    if (vId) return res.json({ youtube: true, videoId: vId, title: "YouTube Video" });
  }

  // Bilibili uses proprietary MSE segments and blocks embedding/scraping
  if (url.includes("bilibili.tv") || url.includes("bilibili.com")) {
    return res.status(200).json({ drm: true, error: "Bilibili content is heavily protected. Please use the 'Share browser tab' button to watch it." });
  }

  // Handle Twitch directly via iframe instead of scraping if we wanted, but let's stick to extraction for now.
  if (detectDrm(url)) {
    return res.status(200).json({ drm: true, error: "DRM-protected content is not supported." });
  }
  const safe = await urlIsSafeForExtraction(url);
  if (!safe) {
    return res.status(400).json({ error: "URL host is not allowed." });
  }
  if (isIpBlockedHost(url)) {
    return res.status(422).json({
      error:
        "This site blocks data-center IP addresses (the server hosting this app is on such a range), so its video pages can't be loaded from here. Open the video in your browser, copy the .m3u8 URL from DevTools \u2192 Network, and paste it directly into the source bar \u2014 the player handles HLS natively.",
    });
  }
  const cached = extractCache.get(url);
  if (cached && Date.now() - cached.t < EXTRACT_TTL_MS) {
    return res.json(cached.data);
  }
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": (() => { try { return new URL(url).origin + "/"; } catch { return url; } })(),
      },
      signal: controller.signal,
    });
    if (resp.ok) {
      storeCookiesFromResponse(resp, url);
      const html = await resp.text();
      const scanned = scanHtmlForStreams(html);
      if (scanned.streams && scanned.streams.length > 0) {
        const best = scanned.streams[0];
        const data = {
          streamUrl: best.url,
          type: best.type,
          title: scanned.title || null,
          duration: null,
          isLive: false,
          thumbnail: null,
          sourcePage: scanned.sourcePage || url,
          allStreams: scanned.streams,
        };
        if (extractCache.size >= EXTRACT_CACHE_MAX) {
          const oldest = extractCache.keys().next().value;
          if (oldest !== undefined) extractCache.delete(oldest);
        }
        extractCache.set(url, { t: Date.now(), data });
        return res.json(data);
      }
    }
  } catch { /* fall through to yt-dlp */ }
  try {
    let info;
    try {
      info = await ytDlpExtract(url);
    } catch (ytErr) {
      const browserResult = await browserExtract(url).catch(() => null);
      if (browserResult?.streamUrl) {
        const data = {
          streamUrl: browserResult.streamUrl,
          type: browserResult.type || detectStreamType(browserResult.streamUrl),
          title: browserResult.title || null,
          duration: null,
          isLive: false,
          thumbnail: null,
          sourcePage: url,
        };
        if (extractCache.size >= EXTRACT_CACHE_MAX) {
          const oldest = extractCache.keys().next().value;
          if (oldest !== undefined) extractCache.delete(oldest);
        }
        extractCache.set(url, { t: Date.now(), data });
        return res.json(data);
      }
      throw ytErr;
    }
    const best = pickBestStream(info);
    if (!best || !best.url) {
      return res.status(422).json({ error: "No playable stream found." });
    }
    const data = {
      streamUrl: best.url,
      type: best.type,
      title: info?.title || null,
      duration: info?.duration || null,
      isLive: !!info?.is_live,
      thumbnail: info?.thumbnail || null,
      sourcePage: url,
    };
    if (extractCache.size >= EXTRACT_CACHE_MAX) {
      const oldest = extractCache.keys().next().value;
      if (oldest !== undefined) extractCache.delete(oldest);
    }
    extractCache.set(url, { t: Date.now(), data });
    res.json(data);
  } catch (e) {
    let msg = String(e?.message || "Extraction failed");
    if (/drm|widevine|fairplay|playready/i.test(msg)) {
      return res.status(200).json({ drm: true, error: "DRM-protected content is not supported." });
    }
    if (/Unable to extract|unsupported url/i.test(msg)) {
      msg = "This site's video format isn't supported right now (the page structure recently changed and the extractor cannot find the stream). Try a direct .mp4/.m3u8 URL instead.";
    }
    res.status(422).json({ error: msg });
  }
});

function sliceBalancedJson(s, i) {
  const open = s[i];
  const close = open === "{" ? "}" : open === "[" ? "]" : null;
  if (!close) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return s.slice(i, j + 1);
    }
  }
  return null;
}

function pickFromMediaDefinitions(mediaDefs) {
  if (!Array.isArray(mediaDefs)) return null;
  const withUrl = mediaDefs.filter((m) => m && typeof m.videoUrl === "string" && m.videoUrl);
  const hls = withUrl.find((m) => /hls/i.test(m.format || "") || /\.m3u8(\?|$)/i.test(m.videoUrl));
  if (hls) return { url: hls.videoUrl, type: "hls" };
  const mp4s = withUrl
    .filter((m) => /mp4/i.test(m.format || "") || /\.mp4(\?|$)/i.test(m.videoUrl))
    .map((m) => ({ ...m, q: parseInt(String(m.quality), 10) || 0 }))
    .sort((a, b) => b.q - a.q);
  if (mp4s[0]) return { url: mp4s[0].videoUrl, type: "mp4" };
  return null;
}

function scanHtmlForStreams(html) {
  if (typeof html !== "string" || !html) return { streams: [], error: "Empty input." };

  let title = null;
  const ogm = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogm) title = ogm[1];
  else {
    const tm = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (tm) title = tm[1].trim();
  }

  let sourcePage = null;
  const canonM = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (canonM) sourcePage = canonM[1];
  if (!sourcePage) {
    const ogM = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i);
    if (ogM) sourcePage = ogM[1];
  }

  const streams = [];

  function addFromMediaDefs(arr, titleOverride) {
    if (!Array.isArray(arr)) return;
    for (const m of arr) {
      if (!m?.videoUrl || typeof m.videoUrl !== "string") continue;
      const isHls = /hls/i.test(m.format || "") || /\.m3u8(\?|$)/i.test(m.videoUrl);
      const isDash = /\.mpd(\?|$)/i.test(m.videoUrl);
      streams.push({
        url: m.videoUrl,
        type: isHls ? "hls" : isDash ? "dash" : "mp4",
        quality: m.quality ? String(m.quality) : null,
        format: m.format || null,
        label: m.quality ? `${m.quality}p` : (m.format || "stream"),
      });
    }
    if (titleOverride && !title) title = titleOverride;
  }

  const fvIdx = html.search(/var\s+flashvars_\d+\s*=\s*\{/);
  if (fvIdx !== -1) {
    const braceIdx = html.indexOf("{", fvIdx);
    const json = sliceBalancedJson(html, braceIdx);
    if (json) {
      try {
        const obj = JSON.parse(json);
        addFromMediaDefs(obj.mediaDefinitions, obj.video_title);
      } catch { /* fall through */ }
    }
  }

  if (streams.length === 0) {
    const mdIdx = html.search(/"mediaDefinitions"\s*:\s*\[/);
    if (mdIdx !== -1) {
      const arrStart = html.indexOf("[", mdIdx);
      const arr = sliceBalancedJson(html, arrStart);
      if (arr) {
        try { addFromMediaDefs(JSON.parse(arr)); } catch { /* ignore */ }
      }
    }
  }

  if (streams.length === 0) {
    const seen = new Set();
    for (const m of html.matchAll(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/gi)) {
      if (!seen.has(m[0])) { seen.add(m[0]); streams.push({ url: m[0], type: "hls", quality: null, label: "HLS" }); }
    }
    for (const m of html.matchAll(/https?:\/\/[^\s"'<>\\]+\.mpd[^\s"'<>\\]*/gi)) {
      if (!seen.has(m[0])) { seen.add(m[0]); streams.push({ url: m[0], type: "dash", quality: null, label: "DASH" }); }
    }
    let mp4Count = 0;
    for (const m of html.matchAll(/https?:\/\/[^\s"'<>\\]+\.mp4[^\s"'<>\\]*/gi)) {
      if (!seen.has(m[0]) && mp4Count < 6) { seen.add(m[0]); mp4Count++; streams.push({ url: m[0], type: "mp4", quality: null, label: "MP4" }); }
    }
  }

  const seen = new Set();
  const unique = streams.filter((s) => { if (seen.has(s.url)) return false; seen.add(s.url); return true; });

  unique.sort((a, b) => {
    if (a.type === "hls" && b.type !== "hls") return -1;
    if (b.type === "hls" && a.type !== "hls") return 1;
    return (parseInt(b.quality, 10) || 0) - (parseInt(a.quality, 10) || 0);
  });

  if (unique.length === 0) return { streams: [], error: "No stream URL found in the source.", title, sourcePage };
  return { streams: unique, title, sourcePage };
}

function parsePastedHtml(html) {
  const { streams, error, title, sourcePage } = scanHtmlForStreams(html);
  if (error && streams.length === 0) return { error };
  const best = streams[0];
  return { streamUrl: best.url, type: best.type, title, sourcePage, allStreams: streams };
}

function rewriteM3u8(text, baseUrl, proxyPath, ref) {
  const base = new URL(baseUrl);
  const mkProxyUrl = (abs) =>
    `${proxyPath}?url=${encodeURIComponent(abs)}&ref=${encodeURIComponent(ref)}`;
  return text.split("\n").map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
        const abs = new URL(uri, base).toString();
        return `URI="${mkProxyUrl(abs)}"`;
      });
    }
    if (!trimmed) return line;
    const abs = new URL(trimmed, base).toString();
    return mkProxyUrl(abs);
  }).join("\n");
}

app.get(`${BASE_PATH}api/hls-proxy`, async (req, res) => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!rawUrl) return res.status(400).send("Missing url param");

  let parsed;
  try { parsed = new URL(rawUrl); } catch { return res.status(400).send("Invalid URL"); }
  if (!["http:", "https:"].includes(parsed.protocol)) return res.status(400).send("Only http/https allowed");

  // NOTE (TOCTOU): DNS results can change between this check and the fetch() below.
  // This is a best-effort guard; a determined attacker with DNS rebinding could
  // bypass it. For full protection, use a custom DNS resolver or proxy.
  try {
    const addrs = await dns.resolve(parsed.hostname).catch(() => []);
    if (!addrs.length) { const a4 = await dns.resolve4(parsed.hostname).catch(() => []); addrs.push(...a4); }
    if (!addrs.length) return res.status(403).send("Cannot resolve hostname");
    for (const addr of addrs) {
      if (isPrivateIp(addr)) return res.status(403).send("Blocked");
    }
  } catch { return res.status(502).send("DNS error"); }

  const referer = typeof req.query.ref === "string" && req.query.ref ? req.query.ref : (parsed.origin + "/");
  const proxyPath = `/${BASE_PATH.replace(/^\//, "")}api/hls-proxy`;

  try {
    // Forward stored cookies from extraction (needed for PornHub-like CDNs)
    const storedCookies = getCookiesForDomain(parsed.hostname);
    const proxyHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": referer,
      "Origin": (() => { try { return new URL(referer).origin; } catch { return parsed.origin; } })(),
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    };
    if (storedCookies) proxyHeaders["Cookie"] = storedCookies;
    const upstream = await fetch(rawUrl, {
      headers: proxyHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) return res.status(upstream.status).send(`Upstream ${upstream.status}`);

    const ct = upstream.headers.get("content-type") || "";
    const isM3u8 = ct.includes("mpegurl") || ct.includes("x-mpegURL") ||
      rawUrl.split("?")[0].toLowerCase().endsWith(".m3u8") ||
      rawUrl.split("?")[0].toLowerCase().endsWith(".m3u");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");

    if (isM3u8) {
      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, rawUrl, proxyPath, referer);
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      return res.send(rewritten);
    }

    res.setHeader("Content-Type", ct || "application/octet-stream");
    const cl = upstream.headers.get("content-length");
    if (cl) res.setHeader("Content-Length", cl);
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(502).send("Proxy error: " + err.message);
  }
});

app.post(`${BASE_PATH}api/extract-from-html`, (req, res) => {
  const html = typeof req.body?.html === "string" ? req.body.html : "";
  if (!html || html.length < 20) return res.status(400).json({ error: "Paste the page source first." });
  if (html.length > 4 * 1024 * 1024) return res.status(413).json({ error: "Pasted content is too large (limit 4 MB)." });
  const result = scanHtmlForStreams(html);
  if (result.error && result.streams.length === 0) return res.status(422).json(result);
  res.json(result);
});

app.post(`${BASE_PATH}api/fetch-scan`, async (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: "Invalid URL." });

  // YouTube URLs: skip extraction entirely — the client uses the native YT IFrame player
  const ytId = parseYouTube(url);
  if (ytId) {
    return res.json({
      youtube: true,
      videoId: ytId,
      streams: [],
      title: null,
      error: "YouTube videos play natively — use the Load button or YT Quality button instead.",
    });
  }

  // Bilibili uses proprietary MSE segments and blocks embedding/scraping
  if (url.includes("bilibili.tv") || url.includes("bilibili.com")) {
    return res.status(200).json({ drm: true, streams: [], error: "Bilibili content is heavily protected. Please use the 'Share browser tab' button to watch it." });
  }

  if (detectDrm(url)) return res.status(200).json({ drm: true, streams: [], error: "DRM-protected site — use Share Browser Tab instead." });
  const safe = await urlIsSafeForExtraction(url);
  if (!safe) return res.status(400).json({ error: "URL host is not allowed." });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": (() => { try { return new URL(url).origin + "/"; } catch { return url; } })(),
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    if (resp.ok) {
      storeCookiesFromResponse(resp, url);
      const html = await resp.text();
      const result = scanHtmlForStreams(html);
      result.sourcePage = result.sourcePage || url;
      if (result.streams && result.streams.length > 0) return res.json(result);
    }
  } catch { /* fall through to yt-dlp */ }

  try {
    const info = await ytDlpExtract(url);
    const streams = ytDlpFormatsToStreams(info);
    if (streams.length === 0) return res.status(422).json({ streams: [], error: "No playable stream found for this URL." });
    return res.json({
      streams,
      title: info.title || null,
      duration: info.duration || null, 
      sourcePage: info.webpage_url || url,
    });
  } catch (ytErr) {
    const msg = String(ytErr?.message || "");
    if (/drm|widevine|fairplay|playready/i.test(msg)) {
      return res.status(200).json({ drm: true, streams: [], error: "DRM-protected — use Share Browser Tab instead." });
    }
    return res.status(422).json({ streams: [], error: `Could not find streams: ${msg.slice(0, 200)}` });
  }
});

app.post(`${BASE_PATH}api/rooms`, (req, res) => {
  const id = crypto.randomBytes(4).toString("hex");
  const password =
    typeof req.body?.password === "string" && req.body.password.trim()
      ? req.body.password.trim()
      : null;
  const token = crypto.randomBytes(8).toString("hex");
  const room = getOrCreateRoom(id);
  room.password = password;
  room.creatorToken = token;
  res.status(201).json({ id, token });
});

const ROOM_IDLE_TTL_MS = Number(process.env.ROOM_IDLE_TTL_MS) || 5 * 60 * 1000;
const ROOM_SWEEP_INTERVAL_MS =
  Number(process.env.ROOM_SWEEP_INTERVAL_MS) || 60 * 1000;

const rooms = new Map();

// Admin tokens: stored with creation timestamp for expiry.
// Map<string, number> — token → created-at timestamp
const ADMIN_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const ADMIN_TOKEN_MAX = 50;
const adminTokens = new Map();

// Sweep expired admin tokens every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, createdAt] of adminTokens) {
    if (now - createdAt >= ADMIN_TOKEN_TTL_MS) adminTokens.delete(token);
  }
}, 30 * 60 * 1000).unref();

// Admin login rate limiter: Map<socketId, { attempts, lockedUntil }>
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

function getOrCreateRoom(id) {
  let room = rooms.get(id);
  if (!room) {
    room = {
      source: null,
      sourceType: null,
      currentTime: 0,
      isPlaying: false,
      lastUpdated: Date.now(),
      hostSocketId: null,
      hostStreamKind: null,
      participants: new Map(),
      voipParticipants: new Set(),
      emptySince: Date.now(),
      password: null,
      creatorToken: null,
      roomHostId: null,
      hostKey: null,
      admins: new Set(),
      muted: new Set(),
      banned: new Map(),
      bannedClientIds: new Set(),
      votes: [],
      queue: [],
      suggestions: [],
      history: [],
      requireApproval: false,
      pending: new Map(),
      approvedClientIds: new Set(),
    };
    rooms.set(id, room);
  }
  return room;
}

function sweepIdleRooms() {
  const now = Date.now();
  for (const [id, room] of rooms) {
    for (const [socketId] of room.participants) {
      const sock = io.sockets.sockets.get(socketId);
      if (!sock || !sock.connected) {
        room.participants.delete(socketId);
        room.voipParticipants.delete(socketId);
        room.admins.delete(socketId);
        room.muted.delete(socketId);
        if (room.hostSocketId === socketId) {
          room.hostSocketId = null;
          room.hostStreamKind = null;
        }
        if (room.roomHostId === socketId) {
          room.roomHostId = null;
        }
      }
    }
    if (room.participants.size === 0) {
      if (!room.emptySince) room.emptySince = now;
      else if (now - room.emptySince >= ROOM_IDLE_TTL_MS) rooms.delete(id);
    }
  }
}

const sweepTimer = setInterval(sweepIdleRooms, ROOM_SWEEP_INTERVAL_MS);
sweepTimer.unref();

function projectedTime(room) {
  if (room.isPlaying && room.source) {
    return room.currentTime + (Date.now() - room.lastUpdated) / 1000;
  }
  return room.currentTime;
}

function getUserRole(socketId, room) {
  const sock = io.sockets.sockets.get(socketId);
  if (sock && sock.isSuperAdmin) return "superadmin";
  if (socketId === room.roomHostId) return "host";
  if (room.admins.has(socketId)) return "admin";
  if (room.muted.has(socketId)) return "muted";
  return "member";
}

function canControlPlayback(socket, room) {
  return (
    socket.isSuperAdmin ||
    socket.id === room.roomHostId ||
    room.admins.has(socket.id)
  );
}

function canModerate(socket, room) {
  return (
    socket.isSuperAdmin ||
    socket.id === room.roomHostId ||
    room.admins.has(socket.id)
  );
}

function canModerateTarget(socket, room, targetId) {
  if (!canModerate(socket, room)) return false;
  const targetSocket = io.sockets.sockets.get(targetId);
  if (targetSocket && targetSocket.isSuperAdmin) return false;
  const targetRole = getUserRole(targetId, room);
  if (targetRole === "superadmin") return false;
  if (targetRole === "host" && !socket.isSuperAdmin) return false;
  if (
    targetRole === "admin" &&
    !socket.isSuperAdmin &&
    socket.id !== room.roomHostId
  )
    return false;
  return true;
}

function buildParticipantList(room, includeSuperAdmins = true) {
  return [...room.participants.entries()]
    .filter(([id]) => {
      if (includeSuperAdmins) return true;
      const sock = io.sockets.sockets.get(id);
      return !(sock && sock.isSuperAdmin);
    })
    .map(([id, name]) => ({
      id,
      name,
      role: getUserRole(id, room),
    }));
}

function serializeVotes(votes) {
  return votes.map((v) => ({
    id: v.id,
    url: v.url,
    suggestedBy: v.suggestedBy,
    suggestedByName: v.suggestedByName,
    voteCount: v.voters.size,
    voters: [...v.voters],
  }));
}

function serializePending(room) {
  return [...room.pending.entries()].map(([id, info]) => ({
    id,
    name: info.name,
    at: info.at,
  }));
}

function broadcastPendingUpdate(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const list = serializePending(room);
  for (const [sid] of room.participants) {
    const sock = io.sockets.sockets.get(sid);
    if (!sock) continue;
    const role = getUserRole(sid, room);
    if (role === "host" || role === "admin" || sock.isSuperAdmin) {
      sock.emit("pending-updated", { pending: list });
    }
  }
}

function applyExtractedSource(room, url) {
  const yt = parseYouTube(url);
  if (yt) {
    room.source = yt;
    room.sourceType = "youtube";
  } else {
    room.source = url;
    room.sourceType = detectStreamType(url);
  }
  room.currentTime = 0;
  room.isPlaying = false;
  room.lastUpdated = Date.now();
}

function finalizeJoinOther(targetSocket, roomId, room, hostKey) {
  targetSocket.currentRoomId = roomId;
  targetSocket.join(roomId);

  const isFirstJoiner = room.participants.size === 0 && !room.roomHostId;
  room.participants.set(targetSocket.id, targetSocket.userName);
  room.emptySince = null;
  if (targetSocket.clientId) room.approvedClientIds.add(targetSocket.clientId);

  let assignedHostKey = null;
  if (isFirstJoiner) {
    room.roomHostId = targetSocket.id;
    room.hostKey = crypto.randomBytes(8).toString("hex");
    assignedHostKey = room.hostKey;
  } else if (
    !room.roomHostId &&
    room.hostKey &&
    typeof hostKey === "string" &&
    hostKey === room.hostKey
  ) {
    room.roomHostId = targetSocket.id;
    assignedHostKey = room.hostKey;
    io.to(roomId).emit("system-message", {
      text: `${targetSocket.userName} has reclaimed host`,
    });
  }

  const myRole = getUserRole(targetSocket.id, room);

  targetSocket.emit("state", {
    youId: targetSocket.id,
    source: room.source,
    sourceType: room.sourceType,
    sourcePage: room.sourcePage || null,
    currentTime: projectedTime(room),
    isPlaying: room.isPlaying,
    hostSocketId: room.hostSocketId,
    hostStreamKind: room.hostStreamKind,
    roomHostId: room.roomHostId,
    participants: buildParticipantList(room, targetSocket.isSuperAdmin),
    voipPeers: [...room.voipParticipants],
    votes: serializeVotes(room.votes),
    requireApproval: !!room.requireApproval,
    pending: (myRole === "host" || myRole === "admin" || targetSocket.isSuperAdmin)
      ? serializePending(room) : [],
    myRole,
    isSuperAdmin: targetSocket.isSuperAdmin,
    hostKey: assignedHostKey || undefined,
  });

  if (!targetSocket.isSuperAdmin) {
    targetSocket.to(roomId).emit("user-joined", {
      id: targetSocket.id,
      name: targetSocket.userName,
      role: myRole,
    });
  }
  broadcastRoomUpdate(roomId);
}

function broadcastRoomUpdate(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const publicList = buildParticipantList(room, false);
  const fullList = buildParticipantList(room, true);
  const votes = serializeVotes(room.votes);
  for (const [sid] of room.participants) {
    const sock = io.sockets.sockets.get(sid);
    if (!sock) continue;
    sock.emit("room-update", {
      roomHostId: room.roomHostId,
      participants: sock.isSuperAdmin ? fullList : publicList,
      votes,
      queue: room.queue,
      suggestions: room.suggestions,
      history: room.history,
    });
  }
}

function parseYouTube(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (u.hostname.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(
        /^\/(embed|shorts|live)\/([A-Za-z0-9_-]+)/,
      );
      if (m) return m[2];
    }
  } catch {
    /* ignore */
  }
  return null;
}

io.on("connection", (socket) => {
  socket.use(([, ...args], next) => {
    if (
      args.length > 0 &&
      (args[0] === null ||
        typeof args[0] !== "object" ||
        Array.isArray(args[0]))
    ) {
      return next(new Error("invalid payload"));
    }
    next();
  });

  socket.currentRoomId = null;
  socket.userName = "Guest";
  socket.isSuperAdmin = false;

  function requireMember() {
    const rid = socket.currentRoomId;
    if (!rid) return null;
    const room = rooms.get(rid);
    if (!room || !room.participants.has(socket.id)) {
      socket.currentRoomId = null;
      return null;
    }
    return { room, rid };
  }

  function forceLeaveSocket(targetSocket, roomId, room) {
    room.participants.delete(targetSocket.id);
    room.voipParticipants.delete(targetSocket.id);
    room.admins.delete(targetSocket.id);
    room.muted.delete(targetSocket.id);
    if (room.hostSocketId === targetSocket.id) {
      room.hostSocketId = null;
      room.hostStreamKind = null;
      targetSocket.to(roomId).emit("webrtc-host-stopped");
    }
    if (room.roomHostId === targetSocket.id) {
      room.roomHostId = null;
    }
    targetSocket.leave(roomId);
    targetSocket.currentRoomId = null;
  }

  function leaveCurrentRoom() {
    if (!socket.currentRoomId) return;
    const roomId = socket.currentRoomId;
    const room = rooms.get(roomId);
    if (room) {
      if (room.pending.has(socket.id)) {
        room.pending.delete(socket.id);
        socket.currentRoomId = null;
        broadcastPendingUpdate(roomId);
        return;
      }
      room.participants.delete(socket.id);
      room.admins.delete(socket.id);
      room.muted.delete(socket.id);
      if (room.voipParticipants.has(socket.id)) {
        room.voipParticipants.delete(socket.id);
        socket.to(roomId).emit("voip-peer-left", { id: socket.id });
      }
      if (!socket.isSuperAdmin) {
        socket.to(roomId).emit("user-left", { id: socket.id });
      }
      if (room.hostSocketId === socket.id) {
        room.hostSocketId = null;
        room.hostStreamKind = null;
        socket.to(roomId).emit("webrtc-host-stopped");
      }
      if (room.roomHostId === socket.id) {
        room.roomHostId = null;
        io.to(roomId).emit("system-message", {
          text: "Host has left the room",
        });
      }
      socket.leave(roomId);
      if (room.participants.size === 0) room.emptySince = Date.now();
      else broadcastRoomUpdate(roomId);
    }
    socket.currentRoomId = null;
  }

  function evictPreviousSuperAdmin() {
    if (activeSuperAdminSocketId && activeSuperAdminSocketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(activeSuperAdminSocketId);
      if (oldSocket) {
        oldSocket.isSuperAdmin = false;
        oldSocket.emit("admin-session-revoked", { reason: "Super Admin logged in from another session" });
      }
    }
    activeSuperAdminSocketId = socket.id;
  }

  socket.on("admin-login", ({ username, password }) => {
    if (typeof username !== "string" || typeof password !== "string") {
      socket.emit("admin-login-result", { success: false });
      return;
    }

    // Rate limiting: block brute-force login attempts
    const now = Date.now();
    let entry = loginAttempts.get(socket.id);
    if (!entry) {
      entry = { attempts: 0, windowStart: now, lockedUntil: 0 };
      loginAttempts.set(socket.id, entry);
    }
    if (now < entry.lockedUntil) {
      const waitSec = Math.ceil((entry.lockedUntil - now) / 1000);
      socket.emit("admin-login-result", {
        success: false,
        error: `Too many attempts. Try again in ${waitSec}s.`,
      });
      return;
    }
    // Reset window if expired
    if (now - entry.windowStart > LOGIN_WINDOW_MS) {
      entry.attempts = 0;
      entry.windowStart = now;
    }
    entry.attempts += 1;
    if (entry.attempts > LOGIN_MAX_ATTEMPTS) {
      entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
      socket.emit("admin-login-result", {
        success: false,
        error: "Too many failed attempts. Locked for 5 minutes.",
      });
      return;
    }

    if (
      ADMIN_USERNAME &&
      ADMIN_PASSWORD_VAL &&
      username === ADMIN_USERNAME &&
      password === ADMIN_PASSWORD_VAL
    ) {
      evictPreviousSuperAdmin();
      socket.isSuperAdmin = true;
      // Reset attempts on success
      loginAttempts.delete(socket.id);
      const token = crypto.randomBytes(16).toString("hex");
      // Enforce max token count
      if (adminTokens.size >= ADMIN_TOKEN_MAX) {
        const oldestKey = adminTokens.keys().next().value;
        if (oldestKey !== undefined) adminTokens.delete(oldestKey);
      }
      adminTokens.set(token, Date.now());
      socket.emit("admin-login-result", { success: true, token });
    } else {
      socket.emit("admin-login-result", { success: false });
    }
  });

  socket.on("admin-token-login", ({ token }) => {
    if (typeof token === "string" && adminTokens.has(token)) {
      // Verify token hasn't expired
      const createdAt = adminTokens.get(token);
      if (Date.now() - createdAt >= ADMIN_TOKEN_TTL_MS) {
        adminTokens.delete(token);
        return;
      }
      evictPreviousSuperAdmin();
      socket.isSuperAdmin = true;
      socket.emit("admin-login-result", { success: true, token });
    }
  });

  socket.on("admin-list-rooms", () => {
    if (!socket.isSuperAdmin) return;
    const roomList = [];
    for (const [id, room] of rooms) {
      roomList.push({
        id,
        participantCount: room.participants.size,
        hasPassword: !!room.password,
        hostName: room.roomHostId
          ? room.participants.get(room.roomHostId) || null
          : null,
      });
    }
    socket.emit("admin-rooms", { rooms: roomList });
  });

  socket.on("admin-delete-room", ({ roomId }) => {
    if (!socket.isSuperAdmin) return;
    if (typeof roomId !== "string") return;
    const room = rooms.get(roomId);
    if (!room) return;
    for (const [sid] of room.participants) {
      const s = io.sockets.sockets.get(sid);
      if (s) {
        s.emit("kicked", { reason: "Room deleted by admin" });
        s.leave(roomId);
        s.currentRoomId = null;
      }
    }
    rooms.delete(roomId);
    const updatedList = [];
    for (const [rid, r] of rooms) {
      updatedList.push({
        id: rid,
        participantCount: r.participants.size,
        hasPassword: !!r.password,
        hostName: r.roomHostId ? r.participants.get(r.roomHostId) || null : null,
      });
    }
    socket.emit("admin-rooms", { rooms: updatedList });
  });

  socket.on("admin-global-history", () => {
    if (!socket.isSuperAdmin) return;
    socket.emit("admin-global-history-result", { history: globalHistory });
  });

  socket.on("admin-room-history", ({ roomId }) => {
    if (!socket.isSuperAdmin) return;
    const room = rooms.get(roomId);
    socket.emit("admin-room-history-result", { history: room ? room.history : [] });
  });

  socket.on("join", ({ roomId, name, password, token, hostKey, clientId }) => {
    if (typeof roomId !== "string" || !roomId) return;
    leaveCurrentRoom();

    const room = getOrCreateRoom(roomId);
    socket.userName =
      typeof name === "string" && name.trim()
        ? name.trim().slice(0, 40)
        : "Guest";

    const cid = typeof clientId === "string" && clientId.trim() ? clientId.trim() : null;
    socket.clientId = cid;

    if (room.banned.has(socket.userName.toLowerCase()) ||
        (cid && room.bannedClientIds.has(cid))) {
      socket.emit("join-error", { reason: "banned" });
      return;
    }

    let creatorTokenOk = false;
    if (room.password && !socket.isSuperAdmin) {
      if (
        room.creatorToken &&
        typeof token === "string" &&
        token === room.creatorToken
      ) {
        room.creatorToken = null;
        creatorTokenOk = true;
      } else if (typeof password !== "string" || password !== room.password) {
        socket.emit("join-error", { reason: "password-required" });
        return;
      }
    } else if (
      room.creatorToken &&
      typeof token === "string" &&
      token === room.creatorToken
    ) {
      room.creatorToken = null;
      creatorTokenOk = true;
    }

    const wasApproved = cid && room.approvedClientIds.has(cid);
    const bypassApproval =
      socket.isSuperAdmin ||
      creatorTokenOk ||
      room.participants.size === 0 ||
      wasApproved ||
      (room.hostKey && typeof hostKey === "string" && hostKey === room.hostKey);

    if (room.requireApproval && !bypassApproval) {
      socket.currentRoomId = roomId;
      socket.pendingHostKey = typeof hostKey === "string" ? hostKey : null;
      room.pending.set(socket.id, {
        name: socket.userName,
        clientId: cid,
        at: Date.now(),
      });
      socket.emit("approval-pending", { roomId });
      broadcastPendingUpdate(roomId);
      return;
    }

    finalizeJoinOther(socket, roomId, room, hostKey);
  });

  socket.on("leave-room", () => leaveCurrentRoom());

  socket.on("set-source", ({ source, sourceType, sourcePage }) => {
    const ctx = requireMember();
    if (!ctx) return;
    if (typeof source !== "string" || typeof sourceType !== "string") return;
    if (!VALID_SOURCE_TYPES.includes(sourceType)) return;
    if (!canControlPlayback(socket, ctx.room)) return;
    if (ctx.room.hostSocketId) return;
    ctx.room.source = source;
    ctx.room.sourceType = sourceType;
    ctx.room.sourcePage = (typeof sourcePage === "string" && sourcePage) ? sourcePage : null;
    ctx.room.currentTime = 0;
    ctx.room.isPlaying = false;
    ctx.room.lastUpdated = Date.now();
    
    // Add to history
    const historyEntry = {
      id: crypto.randomBytes(4).toString("hex"),
      url: source,
      sourceType,
      sourcePage: ctx.room.sourcePage,
      playedBy: socket.id,
      playedByName: socket.userName,
      roomId: ctx.rid,
      timestamp: Date.now()
    };
    ctx.room.history.unshift(historyEntry);
    if (ctx.room.history.length > 50) ctx.room.history.pop();
    appendGlobalHistory(historyEntry);

    io.to(ctx.rid).emit("source-changed", { source, sourceType, sourcePage: ctx.room.sourcePage });
  });

  // Reaction events
  socket.on("reaction", ({ emoji }) => {
    const ctx = requireMember();
    if (!ctx) return;
    // Basic rate limit check could go here
    io.to(ctx.rid).emit("reaction", { emoji, from: socket.userName });
  });

  // Queue events
  socket.on("queue-suggest", ({ url, title }) => {
    const ctx = requireMember();
    if (!ctx) return;
    if (typeof url !== "string") return;
    const suggestion = {
      id: crypto.randomBytes(4).toString("hex"),
      url,
      title: title || "Suggested video",
      addedBy: socket.id,
      addedByName: socket.userName,
      timestamp: Date.now()
    };
    ctx.room.suggestions.push(suggestion);
    broadcastRoomUpdate(ctx.rid);
  });

  socket.on("queue-approve", ({ id }) => {
    const ctx = requireMember();
    if (!ctx) return;
    if (!socket.isSuperAdmin && ctx.room.roomHostId !== socket.id && !ctx.room.admins.has(socket.id)) return; // Admin/host only
    
    const idx = ctx.room.suggestions.findIndex(s => s.id === id);
    if (idx !== -1) {
      const item = ctx.room.suggestions.splice(idx, 1)[0];
      ctx.room.queue.push(item);
      broadcastRoomUpdate(ctx.rid);
    }
  });

  socket.on("queue-reject", ({ id }) => {
    const ctx = requireMember();
    if (!ctx) return;
    if (!socket.isSuperAdmin && ctx.room.roomHostId !== socket.id && !ctx.room.admins.has(socket.id)) return; // Admin/host only
    
    const idx = ctx.room.suggestions.findIndex(s => s.id === id);
    if (idx !== -1) {
      ctx.room.suggestions.splice(idx, 1);
      broadcastRoomUpdate(ctx.rid);
    }
  });

  socket.on("queue-remove", ({ id }) => {
    const ctx = requireMember();
    if (!ctx) return;
    if (!socket.isSuperAdmin && ctx.room.roomHostId !== socket.id && !ctx.room.admins.has(socket.id)) return;
    
    const idx = ctx.room.queue.findIndex(s => s.id === id);
    if (idx !== -1) {
      ctx.room.queue.splice(idx, 1);
      broadcastRoomUpdate(ctx.rid);
    }
  });

  socket.on("queue-reorder", ({ queue }) => {
    const ctx = requireMember();
    if (!ctx) return;
    if (!socket.isSuperAdmin && ctx.room.roomHostId !== socket.id && !ctx.room.admins.has(socket.id)) return;
    if (!Array.isArray(queue)) return;
    
    // Validate that the new queue is just a permutation of the old one
    const newQueue = [];
    for (const q of queue) {
      const existing = ctx.room.queue.find(x => x.id === q.id);
      if (existing) newQueue.push(existing);
    }
    ctx.room.queue = newQueue;
    broadcastRoomUpdate(ctx.rid);
  });

  socket.on("queue-next", () => {
    const ctx = requireMember();
    if (!ctx) return;
    if (!socket.isSuperAdmin && ctx.room.roomHostId !== socket.id && !ctx.room.admins.has(socket.id)) return;
    
    if (ctx.room.queue.length > 0) {
      const nextItem = ctx.room.queue.shift();
      broadcastRoomUpdate(ctx.rid);
      // Trigger extraction for the next item
      io.to(ctx.rid).emit("queue-play-item", { url: nextItem.url });
    }
  });

  socket.on("play", ({ time }) => {
    const ctx = requireMember();
    if (!ctx) return;
    if (!canControlPlayback(socket, ctx.room)) return;
    if (ctx.room.hostSocketId) return;
    ctx.room.currentTime = Number(time) || 0;
    ctx.room.isPlaying = true;
    ctx.room.lastUpdated = Date.now();
    socket.to(ctx.rid).emit("play", {
      time: ctx.room.currentTime,
      by: socket.id,
    });
  });

  socket.on("pause", ({ time }) => {
    const ctx = requireMember();
    if (!ctx) return;
    if (!canControlPlayback(socket, ctx.room)) return;
    if (ctx.room.hostSocketId) return;
    ctx.room.currentTime = Number(time) || 0;
    ctx.room.isPlaying = false;
    ctx.room.lastUpdated = Date.now();
    socket.to(ctx.rid).emit("pause", {
      time: ctx.room.currentTime,
      by: socket.id,
    });
  });

  socket.on("seek", ({ time }) => {
    const ctx = requireMember();
    if (!ctx) return;
    if (!canControlPlayback(socket, ctx.room)) return;
    if (ctx.room.hostSocketId) return;
    ctx.room.currentTime = Number(time) || 0;
    ctx.room.lastUpdated = Date.now();
    socket.to(ctx.rid).emit("seek", {
      time: ctx.room.currentTime,
      by: socket.id,
    });
  });

  socket.on("chat", (data) => {
    const ctx = requireMember();
    if (!ctx) return;
    if (ctx.room.muted.has(socket.id)) {
      socket.emit("chat-blocked", { reason: "You are muted" });
      return;
    }
    const type = data && data.type === "sticker" ? "sticker" : "text";
    if (type === "sticker") {
      if (typeof data.stickerUrl !== "string" || !data.stickerUrl) return;
      if (data.stickerUrl.length > 150000) return;
      const isBuiltin = /^\/watch-party\/stickers\/[a-z0-9-]+\.svg$/.test(
        data.stickerUrl,
      );
      const isDataUrl = /^data:image\/(png|jpeg|webp|gif);base64,/.test(
        data.stickerUrl,
      );
      if (!isBuiltin && !isDataUrl) return;
      io.to(ctx.rid).emit("chat", {
        id: crypto.randomBytes(6).toString("hex"),
        from: socket.id,
        name: socket.userName,
        type: "sticker",
        stickerUrl: data.stickerUrl,
        ts: Date.now(),
      });
    } else {
      if (typeof data.text !== "string") return;
      const trimmed = data.text.trim();
      if (!trimmed) return;
      io.to(ctx.rid).emit("chat", {
        id: crypto.randomBytes(6).toString("hex"),
        from: socket.id,
        name: socket.userName,
        type: "text",
        text: trimmed.slice(0, 1000),
        ts: Date.now(),
      });
    }
  });

  socket.on("mute-user", ({ targetId }) => {
    const ctx = requireMember();
    if (!ctx || typeof targetId !== "string") return;
    if (!ctx.room.participants.has(targetId)) return;
    if (!canModerateTarget(socket, ctx.room, targetId)) return;
    ctx.room.muted.add(targetId);
    ctx.room.admins.delete(targetId);
    const targetName = ctx.room.participants.get(targetId);
    io.to(ctx.rid).emit("system-message", {
      text: `${targetName} was muted`,
    });
    broadcastRoomUpdate(ctx.rid);
  });

  socket.on("unmute-user", ({ targetId }) => {
    const ctx = requireMember();
    if (!ctx || typeof targetId !== "string") return;
    if (!canModerate(socket, ctx.room)) return;
    ctx.room.muted.delete(targetId);
    const targetName = ctx.room.participants.get(targetId);
    if (targetName)
      io.to(ctx.rid).emit("system-message", {
        text: `${targetName} was unmuted`,
      });
    broadcastRoomUpdate(ctx.rid);
  });

  socket.on("kick-user", ({ targetId }) => {
    const ctx = requireMember();
    if (!ctx || typeof targetId !== "string") return;
    if (!ctx.room.participants.has(targetId)) return;
    if (!canModerateTarget(socket, ctx.room, targetId)) return;
    const targetName = ctx.room.participants.get(targetId);
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit("kicked", {
        reason: "You were kicked from the room",
      });
      forceLeaveSocket(targetSocket, ctx.rid, ctx.room);
    } else {
      ctx.room.participants.delete(targetId);
      ctx.room.voipParticipants.delete(targetId);
      ctx.room.admins.delete(targetId);
      ctx.room.muted.delete(targetId);
    }
    io.to(ctx.rid).emit("system-message", {
      text: `${targetName} was kicked`,
    });
    io.to(ctx.rid).emit("user-left", { id: targetId });
    broadcastRoomUpdate(ctx.rid);
    if (ctx.room.participants.size === 0) ctx.room.emptySince = Date.now();
  });

  socket.on("ban-user", ({ targetId }) => {
    const ctx = requireMember();
    if (!ctx || typeof targetId !== "string") return;
    if (!ctx.room.participants.has(targetId)) return;
    if (!canModerateTarget(socket, ctx.room, targetId)) return;
    const targetName = ctx.room.participants.get(targetId);
    ctx.room.banned.set(targetName.toLowerCase(), true);
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket && targetSocket.clientId) {
      ctx.room.bannedClientIds.add(targetSocket.clientId);
    }
    if (targetSocket) {
      targetSocket.emit("kicked", {
        reason: "You were banned from the room",
      });
      forceLeaveSocket(targetSocket, ctx.rid, ctx.room);
    } else {
      ctx.room.participants.delete(targetId);
      ctx.room.voipParticipants.delete(targetId);
      ctx.room.admins.delete(targetId);
      ctx.room.muted.delete(targetId);
    }
    io.to(ctx.rid).emit("system-message", {
      text: `${targetName} was banned`,
    });
    io.to(ctx.rid).emit("user-left", { id: targetId });
    broadcastRoomUpdate(ctx.rid);
    if (ctx.room.participants.size === 0) ctx.room.emptySince = Date.now();
  });

  socket.on("assign-admin", ({ targetId }) => {
    const ctx = requireMember();
    if (!ctx || typeof targetId !== "string") return;
    if (!ctx.room.participants.has(targetId)) return;
    if (socket.id !== ctx.room.roomHostId && !socket.isSuperAdmin) return;
    if (targetId === ctx.room.roomHostId) return;
    ctx.room.admins.add(targetId);
    ctx.room.muted.delete(targetId);
    const targetName = ctx.room.participants.get(targetId);
    io.to(ctx.rid).emit("system-message", {
      text: `${targetName} was promoted to Room Admin`,
    });
    broadcastRoomUpdate(ctx.rid);
  });

  socket.on("remove-admin", ({ targetId }) => {
    const ctx = requireMember();
    if (!ctx || typeof targetId !== "string") return;
    if (socket.id !== ctx.room.roomHostId && !socket.isSuperAdmin) return;
    ctx.room.admins.delete(targetId);
    const targetName = ctx.room.participants.get(targetId);
    if (targetName)
      io.to(ctx.rid).emit("system-message", {
        text: `${targetName} was removed from Room Admin`,
      });
    broadcastRoomUpdate(ctx.rid);
  });

  socket.on("transfer-host", ({ targetId }) => {
    const ctx = requireMember();
    if (!ctx || typeof targetId !== "string") return;
    if (socket.id !== ctx.room.roomHostId && !socket.isSuperAdmin) return;
    if (!ctx.room.participants.has(targetId)) return;
    if (targetId === ctx.room.roomHostId) return;
    const oldHostId = ctx.room.roomHostId;
    ctx.room.roomHostId = targetId;
    ctx.room.admins.delete(targetId);
    ctx.room.muted.delete(targetId);
    if (oldHostId && oldHostId !== targetId) {
      ctx.room.admins.add(oldHostId);
    }
    const newHostName = ctx.room.participants.get(targetId);
    const oldHostName = oldHostId ? ctx.room.participants.get(oldHostId) : null;
    io.to(ctx.rid).emit("system-message", {
      text: `${oldHostName || "Previous host"} transferred host to ${newHostName}`,
    });
    broadcastRoomUpdate(ctx.rid);
  });

  socket.on("remove-host", ({ targetId }) => {
    const ctx = requireMember();
    if (!ctx || typeof targetId !== "string") return;
    if (!socket.isSuperAdmin) return;
    if (targetId !== ctx.room.roomHostId) return;
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket && targetSocket.isSuperAdmin) return;
    const hostName = ctx.room.participants.get(targetId);
    ctx.room.roomHostId = null;
    ctx.room.admins.delete(targetId);
    io.to(ctx.rid).emit("system-message", {
      text: `${hostName} was removed as Host by Super Admin`,
    });
    broadcastRoomUpdate(ctx.rid);
  });

  socket.on("suggest-video", ({ url }) => {
    const ctx = requireMember();
    if (!ctx) return;
    if (typeof url !== "string" || !url.trim()) return;
    if (ctx.room.muted.has(socket.id)) return;
    if (ctx.room.votes.length >= 20) return;
    ctx.room.votes.push({
      id: crypto.randomBytes(4).toString("hex"),
      url: url.trim().slice(0, 500),
      suggestedBy: socket.id,
      suggestedByName: socket.userName,
      voters: new Set([socket.id]),
    });
    io.to(ctx.rid).emit("votes-updated", {
      votes: serializeVotes(ctx.room.votes),
    });
  });

  socket.on("vote-video", ({ voteId }) => {
    const ctx = requireMember();
    if (!ctx || typeof voteId !== "string") return;
    const vote = ctx.room.votes.find((v) => v.id === voteId);
    if (!vote) return;
    if (vote.voters.has(socket.id)) vote.voters.delete(socket.id);
    else vote.voters.add(socket.id);
    io.to(ctx.rid).emit("votes-updated", {
      votes: serializeVotes(ctx.room.votes),
    });
  });

  socket.on("approve-video", ({ voteId }) => {
    const ctx = requireMember();
    if (!ctx || typeof voteId !== "string") return;
    if (!canControlPlayback(socket, ctx.room)) return;
    const idx = ctx.room.votes.findIndex((v) => v.id === voteId);
    if (idx === -1) return;
    const vote = ctx.room.votes[idx];
    ctx.room.votes.splice(idx, 1);
    applyExtractedSource(ctx.room, vote.url);
    io.to(ctx.rid).emit("source-changed", {
      source: ctx.room.source,
      sourceType: ctx.room.sourceType,
      sourcePage: ctx.room.sourcePage || null,
    });
    io.to(ctx.rid).emit("votes-updated", {
      votes: serializeVotes(ctx.room.votes),
    });
    io.to(ctx.rid).emit("system-message", {
      text: `Video suggestion by ${vote.suggestedByName} was approved`,
    });
  });

  socket.on("reject-video", ({ voteId }) => {
    const ctx = requireMember();
    if (!ctx || typeof voteId !== "string") return;
    if (!canControlPlayback(socket, ctx.room)) return;
    const idx = ctx.room.votes.findIndex((v) => v.id === voteId);
    if (idx === -1) return;
    const vote = ctx.room.votes[idx];
    ctx.room.votes.splice(idx, 1);
    io.to(ctx.rid).emit("votes-updated", {
      votes: serializeVotes(ctx.room.votes),
    });
    io.to(ctx.rid).emit("system-message", {
      text: `Video suggestion by ${vote.suggestedByName} was rejected`,
    });
  });

  socket.on("set-room-password", ({ password }) => {
    const ctx = requireMember();
    if (!ctx) return;
    const isHost = socket.id === ctx.room.roomHostId;
    const isAdmin = ctx.room.admins.has(socket.id);
    if (!isHost && !isAdmin && !socket.isSuperAdmin) return;
    ctx.room.password =
      typeof password === "string" && password.trim()
        ? password.trim()
        : null;
    socket.emit("password-updated", {
      hasPassword: !!ctx.room.password,
      password: ctx.room.password,
    });
  });

  socket.on("set-room-approval", ({ enabled }) => {
    const ctx = requireMember();
    if (!ctx) return;
    const isHost = socket.id === ctx.room.roomHostId;
    const isAdmin = ctx.room.admins.has(socket.id);
    if (!isHost && !isAdmin && !socket.isSuperAdmin) return;
    ctx.room.requireApproval = !!enabled;
    io.to(ctx.rid).emit("approval-mode-updated", {
      requireApproval: ctx.room.requireApproval,
    });
    if (!ctx.room.requireApproval && ctx.room.pending.size > 0) {
      const ids = [...ctx.room.pending.keys()];
      for (const sid of ids) {
        const ps = io.sockets.sockets.get(sid);
        const info = ctx.room.pending.get(sid);
        ctx.room.pending.delete(sid);
        if (ps && info) {
          ps.userName = info.name;
          ps.clientId = info.clientId;
          finalizeJoinOther(ps, ctx.rid, ctx.room, ps.pendingHostKey);
        }
      }
      broadcastPendingUpdate(ctx.rid);
    }
  });

  socket.on("approve-join", ({ targetId }) => {
    const ctx = requireMember();
    if (!ctx || typeof targetId !== "string") return;
    const isHost = socket.id === ctx.room.roomHostId;
    const isAdmin = ctx.room.admins.has(socket.id);
    if (!isHost && !isAdmin && !socket.isSuperAdmin) return;
    const info = ctx.room.pending.get(targetId);
    if (!info) return;
    ctx.room.pending.delete(targetId);
    const ps = io.sockets.sockets.get(targetId);
    if (ps) {
      ps.userName = info.name;
      ps.clientId = info.clientId;
      finalizeJoinOther(ps, ctx.rid, ctx.room, ps.pendingHostKey);
    }
    broadcastPendingUpdate(ctx.rid);
  });

  socket.on("deny-join", ({ targetId }) => {
    const ctx = requireMember();
    if (!ctx || typeof targetId !== "string") return;
    const isHost = socket.id === ctx.room.roomHostId;
    const isAdmin = ctx.room.admins.has(socket.id);
    if (!isHost && !isAdmin && !socket.isSuperAdmin) return;
    if (!ctx.room.pending.has(targetId)) return;
    ctx.room.pending.delete(targetId);
    const ps = io.sockets.sockets.get(targetId);
    if (ps) {
      ps.emit("approval-denied");
      ps.currentRoomId = null;
    }
    broadcastPendingUpdate(ctx.rid);
  });

  socket.on("play-top-suggestion", () => {
    const ctx = requireMember();
    if (!ctx) return;
    if (!canControlPlayback(socket, ctx.room)) return;
    if (ctx.room.hostSocketId) return;
    if (ctx.room.votes.length === 0) return;
    const sorted = [...ctx.room.votes].sort((a, b) => b.voters.size - a.voters.size);
    const top = sorted[0];
    const idx = ctx.room.votes.findIndex((v) => v.id === top.id);
    if (idx === -1) return;
    ctx.room.votes.splice(idx, 1);
    applyExtractedSource(ctx.room, top.url);
    io.to(ctx.rid).emit("source-changed", {
      source: ctx.room.source,
      sourceType: ctx.room.sourceType,
      sourcePage: ctx.room.sourcePage || null,
    });
    io.to(ctx.rid).emit("votes-updated", {
      votes: serializeVotes(ctx.room.votes),
    });
    io.to(ctx.rid).emit("system-message", {
      text: `Top suggestion by ${top.suggestedByName} is now playing`,
    });
  });

  socket.on("get-room-password", () => {
    const ctx = requireMember();
    if (!ctx) return;
    const isHost = socket.id === ctx.room.roomHostId;
    const isAdmin = ctx.room.admins.has(socket.id);
    if (!isHost && !isAdmin && !socket.isSuperAdmin) return;
    socket.emit("room-password-info", {
      hasPassword: !!ctx.room.password,
      password: ctx.room.password,
    });
  });

  socket.on("webrtc-host-start", ({ kind }) => {
    const ctx = requireMember();
    if (!ctx) return;
    if (!["screen", "file"].includes(kind)) return;
    if (!canControlPlayback(socket, ctx.room)) return;
    if (ctx.room.hostSocketId && ctx.room.hostSocketId !== socket.id) {
      socket.emit("webrtc-host-busy", {
        hostId: ctx.room.hostSocketId,
        kind: ctx.room.hostStreamKind,
      });
      return;
    }
    ctx.room.hostSocketId = socket.id;
    ctx.room.hostStreamKind = kind;
    socket.to(ctx.rid).emit("webrtc-host-available", {
      hostId: socket.id,
      kind,
    });
  });

  socket.on("webrtc-host-stop", () => {
    const ctx = requireMember();
    if (!ctx) return;
    if (ctx.room.hostSocketId !== socket.id) return;
    ctx.room.hostSocketId = null;
    ctx.room.hostStreamKind = null;
    socket.to(ctx.rid).emit("webrtc-host-stopped");
  });

  function sameRoom(toId) {
    if (typeof toId !== "string") return false;
    const ctx = requireMember();
    if (!ctx) return false;
    return ctx.room.participants.has(toId);
  }
  socket.on("webrtc-offer", ({ to, sdp }) => {
    if (!sameRoom(to)) return;
    io.to(to).emit("webrtc-offer", { from: socket.id, sdp });
  });
  socket.on("webrtc-answer", ({ to, sdp }) => {
    if (!sameRoom(to)) return;
    io.to(to).emit("webrtc-answer", { from: socket.id, sdp });
  });
  socket.on("webrtc-ice", ({ to, candidate }) => {
    if (!sameRoom(to)) return;
    io.to(to).emit("webrtc-ice", { from: socket.id, candidate });
  });

  socket.on("voip-join", () => {
    const ctx = requireMember();
    if (!ctx) return;
    ctx.room.voipParticipants.add(socket.id);
    socket.emit("voip-peers", {
      peers: [...ctx.room.voipParticipants].filter((id) => id !== socket.id),
    });
    socket.to(ctx.rid).emit("voip-peer-joined", { id: socket.id });
  });

  socket.on("voip-leave", () => {
    const ctx = requireMember();
    if (!ctx) return;
    ctx.room.voipParticipants.delete(socket.id);
    socket.to(ctx.rid).emit("voip-peer-left", { id: socket.id });
  });

  socket.on("voip-offer", ({ to, sdp }) => {
    if (!sameRoom(to)) return;
    io.to(to).emit("voip-offer", { from: socket.id, sdp });
  });
  socket.on("voip-answer", ({ to, sdp }) => {
    if (!sameRoom(to)) return;
    io.to(to).emit("voip-answer", { from: socket.id, sdp });
  });
  socket.on("voip-ice", ({ to, candidate }) => {
    if (!sameRoom(to)) return;
    io.to(to).emit("voip-ice", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    if (socket.isSuperAdmin && activeSuperAdminSocketId === socket.id) {
      activeSuperAdminSocketId = null;
    }
    leaveCurrentRoom();
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Watch Party server listening on ${PORT} at ${BASE_PATH}`);
});
