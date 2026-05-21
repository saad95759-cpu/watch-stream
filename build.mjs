/**
 * Custom build script: minifies the vanilla public/ app into dist/
 * Uses esbuild (bundled with Vite) — no extra dependencies needed.
 *
 * Outputs:
 *   dist/index.html   (updated script/link references)
 *   dist/main.js      (minified, no source maps)
 *   dist/style.css    (minified, no source maps)
 *   dist/*            (all other static assets copied as-is)
 */

import * as esbuild from "esbuild";
import { promises as fs } from "fs";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "public");
const OUT = path.join(__dirname, "dist");

// 1. Clean / create dist/
if (fsSync.existsSync(OUT)) await fs.rm(OUT, { recursive: true });
await fs.mkdir(OUT, { recursive: true });

// 2. Minify main.js → dist/main.js
await esbuild.build({
  entryPoints: [path.join(SRC, "main.js")],
  outfile: path.join(OUT, "main.js"),
  bundle: false,       // not a module — just minify in place
  minify: true,
  sourcemap: false,
  target: ["es2020"],
  format: "iife",
});
console.log("✅ main.js minified");

// 3. Minify style.css → dist/style.css
await esbuild.build({
  entryPoints: [path.join(SRC, "style.css")],
  outfile: path.join(OUT, "style.css"),
  bundle: false,
  minify: true,
  sourcemap: false,
});
console.log("✅ style.css minified");

// 4. Copy all other files except main.js and style.css
async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.name !== "main.js" && entry.name !== "style.css") {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
await copyDir(SRC, OUT);
console.log("✅ Static assets copied");

console.log("\n🚀 Build complete → dist/");
