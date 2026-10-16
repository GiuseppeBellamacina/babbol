/*
 * Anteprima di tutte le illustrazioni www/img/v/*.svg su sfondo chiaro e scuro -> build/shots/svg-sheet.png
 *   docker run --rm -v "$PWD":/app babbol-build node tools/svg-preview.js
 */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, ".."), DIR = path.join(ROOT, "www", "img", "v");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".svg")).sort();
const cell = (f, bg) => '<div style="background:' + bg + ';padding:6px;text-align:center;font:10px sans-serif;color:#888"><img src="file://' + path.join(DIR, f) + '" width="72" height="72"><br>' + f.replace(".svg", "") + "</div>";
const html = '<body style="margin:0;display:grid;grid-template-columns:repeat(8,1fr);gap:2px">' + files.map((f) => cell(f, "#fff") + cell(f, "#121a20")).join("") + "</body>";
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 200 } });
  const tmp = path.join(ROOT, "build", "svg-sheet.html");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, html);
  await p.goto("file://" + tmp);
  fs.mkdirSync(path.join(ROOT, "build", "shots"), { recursive: true });
  await p.screenshot({ path: path.join(ROOT, "build", "shots", "svg-sheet.png"), fullPage: true });
  await b.close();
  console.log(files.length + " svg -> build/shots/svg-sheet.png");
})();
