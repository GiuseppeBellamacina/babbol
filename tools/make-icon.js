/*
 * Icone del launcher Android dalla mascotte (www/img/logo.svg), renderizzate con Chromium.
 *   docker run --rm -v "$PWD":/app babbol-build node tools/make-icon.js
 * Scrive android/res/mipmap-<densità>/ic_launcher.png e android/icon-512.png.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const owl = fs.readFileSync(path.join(ROOT, "www", "img", "logo.svg"), "utf8");

// sfondo: quadrato arrotondato azzurro chiaro con bordo blu, gufo al centro
const page = (px) => `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:${px}px;height:${px}px;border-radius:22%;background:linear-gradient(160deg,#ffffff,#d6e8ff);
  box-sizing:border-box;border:${Math.max(1, Math.round(px * 0.03))}px solid #2b7de9;display:flex;align-items:center;justify-content:center">
  <div style="width:78%;height:78%">${owl.replace("<svg ", '<svg width="100%" height="100%" ')}</div>
</div></body></html>`;

(async () => {
  const b = await chromium.launch();
  const shot = async (px, out) => {
    const p = await b.newPage({ viewport: { width: px, height: px } });
    await p.setContent(page(px));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await p.screenshot({ path: out, omitBackground: true });
    await p.close();
    console.log(path.relative(ROOT, out) + " (" + px + "px)");
  };
  for (const [name, px] of Object.entries(SIZES)) await shot(px, path.join(ROOT, "android", "res", "mipmap-" + name, "ic_launcher.png"));
  await shot(512, path.join(ROOT, "android", "icon-512.png"));
  await b.close();
})();
