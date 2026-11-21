#!/usr/bin/env node
/*
 * Scarica le illustrazioni delle creature (Noto Emoji, licenza Apache 2.0) in www/img/a/<id>.svg.
 *   node tools/fetch-creatures.js          scarica quelle che mancano e riporta le mancanti
 * L'elenco e i codici Unicode stanno in www/js/data/animals.js.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "www", "img", "a");
const BASE = "https://raw.githubusercontent.com/googlefonts/noto-emoji/main/2D/svg/emoji_u";

const sandbox = { window: { B: {} } };
sandbox.window.B = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, "www", "js", "data", "animals.js"), "utf8").replace("(window.B)", "(window.B)"), Object.assign(sandbox, { window: sandbox.window }));
const list = sandbox.window.B.data.animals;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const missing = [];
  for (const a of list) {
    const file = path.join(OUT, a.id + ".svg");
    if (fs.existsSync(file) && fs.statSync(file).size > 200) continue;
    const url = BASE + a.c.replace(/-/g, "_") + ".svg";
    const res = await fetch(url);
    if (!res.ok) { missing.push(a.id + " (" + a.c + ") HTTP " + res.status); continue; }
    fs.writeFileSync(file, await res.text());
  }
  const total = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(list.length + " creature, " + (list.length - missing.length) + " illustrazioni, " + Math.round(total / 1024) + " KB in www/img/a");
  if (missing.length) { console.log("MANCANTI:\n  " + missing.join("\n  ")); process.exit(1); }
})();
