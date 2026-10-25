/*
 * Foto libere da Wikimedia Commons per l'app: cerca, fai scegliere guardando le miniature, scarica, riduci, registra i crediti.
 * Solo licenze che permettono il riuso: CC0, pubblico dominio, CC BY, CC BY-SA (con i crediti in app e in CREDITS.md).
 * Si esegue nel container (serve Chromium per le tavole di miniature e per la conversione in WebP):
 *
 *   docker run --rm -v "$PWD":/app babbol-build node tools/photos.js find  build/photos/query.json   # [{ "id": "suitcase", "q": "suitcase" }, ...]
 *   docker run --rm -v "$PWD":/app babbol-build node tools/photos.js pick  suitcase=3 passport=1      # id=numero della miniatura
 *   docker run --rm -v "$PWD":/app babbol-build node tools/photos.js credits                          # rigenera crediti e CREDITS.md
 *   docker run --rm -v "$PWD":/app babbol-build node tools/photos.js size                              # peso totale
 *
 * find  : per ogni id cerca su Commons, tiene le foto con licenza adatta e abbastanza grandi, scarica le miniature e scrive
 *         tavole build/photos/sheet-N.png con le miniature numerate (da guardare per scegliere).
 * pick  : scarica la foto scelta e la riduce, la converte in WebP (www/img/p/<id>.webp) e la registra in content/photos.json.
 * Le foto sono piccole di proposito (max 520x440 px, WebP qualità 0.5, circa 30 KB l'una): l'app resta leggera e funziona offline.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = process.env.PHOTOS_WORK ? path.resolve(ROOT, process.env.PHOTOS_WORK) : path.join(ROOT, "build", "photos");
const DIR = path.join(ROOT, "www", "img", "p");
const MANIFEST = path.join(ROOT, "content", "photos.json");
const CAND = path.join(OUT, "cand.json");
const UA = { "User-Agent": "BabbolApp/1.0 (https://github.com/GiuseppeBellamacina/babbol; materiale didattico)" };
const MAX_W = 640, OUT_W = 520, OUT_H = 440, QUALITY = 0.5;   // si scarica la miniatura da 640 px e si riduce a 520 (a 340 px di schermo non si vede la differenza, ma pesa la metà)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return d; } };
const strip = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

// licenze ammesse: CC0, pubblico dominio, CC BY e CC BY-SA (versioni 2.0-4.0); esclusi NC, ND, GFDL da sole, fair use
function licenseOk(name) {
  const n = String(name || "");
  if (/NC|ND|GFDL|fair use|non-free|copyrighted/i.test(n)) return false;
  return /^(CC0|Public domain|PD|CC BY(-SA)? [234]\.0|CC BY(-SA)? [234]\.0)/i.test(n) || /^CC BY(-SA)?( [0-9.]+)?( \w+)?$/i.test(n) || /^Attribution/i.test(n);
}

async function api(params) {
  const u = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams(Object.assign({ action: "query", format: "json", formatversion: "2" }, params));
  for (let k = 0; k < 3; k++) {
    const r = await fetch(u, { headers: UA });
    if (r.ok) return r.json();
    await sleep(1500 * (k + 1));
  }
  throw new Error("API Commons non raggiungibile");
}

async function search(q, n, cat, free) {
  const run = async (query) => {
    const j = await api({ generator: "search", gsrnamespace: "6", gsrlimit: "40", gsrsearch: query + " filetype:bitmap", prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata", iiurlwidth: String(MAX_W), iiextmetadatafilter: "LicenseShortName|Artist|Categories|Restrictions|ObjectName|LicenseUrl" });
    const pages = (j.query && j.query.pages) || [];
    return pages.sort((a, b) => a.index - b.index).map((p) => {
      const i = p.imageinfo && p.imageinfo[0]; if (!i) return null;
      const m = i.extmetadata || {};
      const cats = strip(m.Categories && m.Categories.value);
      const restr = strip(m.Restrictions && m.Restrictions.value);
      return { title: p.title.replace(/^File:/, ""), page: i.descriptionurl, thumb: i.thumburl, w: i.width, h: i.height, mime: i.mime,
        license: strip(m.LicenseShortName && m.LicenseShortName.value), licenseUrl: strip(m.LicenseUrl && m.LicenseUrl.value),
        author: strip(m.Artist && m.Artist.value).slice(0, 80), cats, restr, order: p.index };
    }).filter(Boolean);
  };
  const keep = (x) => x.mime === "image/jpeg" && x.w >= 900 && x.h >= 600 && licenseOk(x.license) && !/personality/i.test(x.restr) && x.thumb;
  // dal più preciso al più largo: categoria di Commons + immagini di qualità, categoria, testo libero + qualità, testo libero.
  // La categoria dà foto pertinenti (la ricerca libera per parole generiche spesso porta fuori strada).
  const attempts = [];
  if (cat && !free) { attempts.push('incategory:"' + cat + '" incategory:"Quality images"', 'incategory:"' + cat + '"', 'deepcat:"' + cat + '" incategory:"Quality images"', 'deepcat:"' + cat + '"'); }
  if (free) attempts.push(q);          // testo libero senza filtro di qualità: più risultati, ordinati per pertinenza
  attempts.push(q + ' incategory:"Quality images"');
  if (!free) attempts.push(q);
  let found = [];
  for (const a of attempts) {
    if (found.length >= n) break;
    let got = [];
    try { got = (await run(a)).filter(keep); } catch (e) { got = []; }
    got.forEach((x) => { if (!found.some((y) => y.title === x.title)) found.push(x); });
    await sleep(300);
  }
  const score = (x) => (x.w >= x.h ? 2 : 0) + (/Quality images|Featured pictures|Valued images/i.test(x.cats) ? 2 : 0) + (/^(CC0|Public domain|PD)/i.test(x.license) ? 1 : 0);
  const ranked = found.map((x, i) => Object.assign(x, { s: score(x) * 100 - i })).sort((a, b) => b.s - a.s);
  const seen = [], out = [];
  for (const x of ranked) { const k = x.title.toLowerCase().slice(0, 22); if (seen.indexOf(k) >= 0) continue; seen.push(k); out.push(x); }
  return out.slice(0, n);
}

async function download(url) {
  for (let k = 0; k < 4; k++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    await sleep(2000 * (k + 1));
  }
  throw new Error("download fallito: " + url);
}

async function withBrowser(fn) {
  const { chromium } = require("playwright");
  const b = await chromium.launch();
  try { return await fn(b); } finally { await b.close(); }
}

// ---------------------------------------------------------------- find
async function find(file) {
  const list = read(file, null);
  if (!Array.isArray(list)) throw new Error("serve un file JSON con [{ id, q, n? }]");
  fs.mkdirSync(OUT, { recursive: true });
  const cand = read(CAND, {});
  const used = new Set(Object.values(read(MANIFEST, {})).map((m) => m.title));
  for (const it of list) {
    const items = (await search(it.q, it.n || 6, it.cat, it.free)).filter((x) => !used.has(x.title));
    cand[it.id] = { q: it.cat ? it.q + " [" + it.cat + "]" : it.q, items };
    const d = path.join(OUT, "cand", it.id); fs.mkdirSync(d, { recursive: true });
    for (let i = 0; i < items.length; i++) {
      const f = path.join(d, (i + 1) + ".jpg");
      if (!fs.existsSync(f)) { fs.writeFileSync(f, await download(items[i].thumb)); await sleep(150); }
    }
    console.log(it.id + " (" + it.q + "): " + items.length + " candidate");
  }
  fs.writeFileSync(CAND, JSON.stringify(cand, null, 1));
  // tavole di miniature: 4 id per tavola
  const ids = list.map((x) => x.id);
  await withBrowser(async (b) => {
    const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
    for (let s = 0; s * 4 < ids.length; s++) {
      const part = ids.slice(s * 4, s * 4 + 4);
      const rows = part.map((id) => {
        const c = cand[id];
        const cells = c.items.map((x, i) => '<div class="c"><img src="file://' + path.join(OUT, "cand", id, (i + 1) + ".jpg").replace(/\\/g, "/") + '"><div class="n">' + (i + 1) + '</div><div class="t">' +
          x.title.slice(0, 34).replace(/[<&]/g, "") + "<br>" + x.license + " " + x.w + "x" + x.h + "</div></div>").join("");
        return '<div class="r"><div class="h">' + id + " - " + c.q.replace(/[<&]/g, "") + "</div>" + (cells || "<i>nessuna candidata</i>") + "</div>";
      }).join("");
      const html = path.join(OUT, "sheet-" + String(s + 1).padStart(2, "0") + ".html");
      fs.writeFileSync(html, '<body style="margin:0;font:12px sans-serif;background:#fff"><style>.r{padding:6px 8px;border-bottom:3px solid #888;display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start}.h{width:100%;font-weight:700;font-size:15px}.c{position:relative;width:236px}.c img{width:236px;height:150px;object-fit:cover;display:block}.n{position:absolute;left:0;top:0;background:#e5484d;color:#fff;font-weight:900;font-size:20px;padding:0 9px}.t{font-size:10px;color:#333;height:26px;overflow:hidden}</style>' + rows);
      await p.goto("file://" + html);
      await p.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
      const f = path.join(OUT, "sheet-" + String(s + 1).padStart(2, "0") + ".png");
      await p.screenshot({ path: f, fullPage: true });
      console.log("tavola: " + path.relative(ROOT, f) + " (" + part.join(", ") + ")");
    }
  });
}

// ---------------------------------------------------------------- pick
async function pick(args) {
  const cand = read(CAND, {});
  const added = {};
  fs.mkdirSync(DIR, { recursive: true });
  await withBrowser(async (b) => {
    const p = await b.newPage();
    for (const a of args) {
      const [id, nStr] = a.split("=");
      const c = cand[id] && cand[id].items[(+nStr || 0) - 1];
      if (!c) { console.log("ERRORE: " + id + "=" + nStr + " non è tra le candidate"); continue; }
      const jpg = await download(c.thumb);
      const b64 = await p.evaluate(async (o) => {
        const img = new Image(); img.src = "data:image/jpeg;base64," + o.b64; await img.decode();
        const s = Math.min(o.maxW / img.width, o.maxH / img.height, 1);
        const cv = document.createElement("canvas"); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        const blob = await new Promise((r) => cv.toBlob(r, "image/webp", o.q));
        const buf = new Uint8Array(await blob.arrayBuffer()); let bin = ""; for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
        return { w: cv.width, h: cv.height, data: btoa(bin) };
      }, { b64: jpg.toString("base64"), maxW: OUT_W, maxH: OUT_H, q: QUALITY });
      const buf = Buffer.from(b64.data, "base64");
      fs.writeFileSync(path.join(DIR, id + ".webp"), buf);
      added[id] = { title: c.title, page: c.page, author: c.author, license: c.license, licenseUrl: c.licenseUrl, w: b64.w, h: b64.h, bytes: buf.length, q: cand[id].q };
      console.log(id + ": " + b64.w + "x" + b64.h + " " + (buf.length / 1024).toFixed(1) + " KB  (" + c.license + ", " + c.author + ")");
    }
  });
  const manifest = Object.assign(read(MANIFEST, {}), added);
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
  credits();
}

// ---------------------------------------------------------------- credits
function credits() {
  const m = read(MANIFEST, {});
  const ids = Object.keys(m).sort();
  const short = {};
  ids.forEach((id) => { short[id] = [m[id].title.replace(/\.[a-z]+$/i, ""), m[id].author || "autore sconosciuto", m[id].license]; });
  fs.mkdirSync(path.join(ROOT, "www", "content"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "www", "content", "credits.js"), "/* Generato da tools/photos.js: non modificare. */\nB.data.credits = " + JSON.stringify(short) + ";\n");
  const lines = ["# Crediti delle foto", "",
    "Le foto di Babbol vengono da [Wikimedia Commons](https://commons.wikimedia.org/) con licenze che permettono il riuso (CC0, pubblico dominio, CC BY, CC BY-SA).",
    "Sono state ridimensionate (massimo 520 px) e convertite in WebP. Le condizioni di ogni licenza restano quelle dell'originale.", "",
    "| File | Titolo | Autore | Licenza | Originale |", "|---|---|---|---|---|"];
  ids.forEach((id) => { const x = m[id]; lines.push("| `" + id + ".webp` | " + x.title.replace(/\|/g, "/") + " | " + (x.author || "-").replace(/\|/g, "/") + " | " + (x.licenseUrl ? "[" + x.license + "](" + x.licenseUrl + ")" : x.license) + " | [pagina](" + x.page + ") |"); });
  fs.writeFileSync(path.join(ROOT, "CREDITS.md"), lines.join("\n") + "\n");
  console.log("crediti: " + ids.length + " foto (www/content/credits.js, CREDITS.md)");
}

// tavole delle foto già scelte (file finali), per controllarle a colpo d'occhio: review [id ...]  (senza id: tutte)
async function review(ids) {
  const manifest = read(MANIFEST, {});
  const list = (ids.length ? ids : Object.keys(manifest).sort()).filter((id) => fs.existsSync(path.join(DIR, id + ".webp")));
  fs.mkdirSync(OUT, { recursive: true });
  await withBrowser(async (b) => {
    const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
    for (let n = 0; n * 20 < list.length; n++) {
      const part = list.slice(n * 20, n * 20 + 20);
      const cells = part.map((id) => '<div class="c"><img src="file://' + path.join(DIR, id + ".webp") + '"><div class="t">' + id + " <i>" + (manifest[id] ? manifest[id].license : "") + "</i></div></div>").join("");
      const html = path.join(OUT, "review-" + String(n + 1).padStart(2, "0") + ".html");
      fs.writeFileSync(html, '<body style="margin:0;font:12px sans-serif;background:#fff;display:flex;flex-wrap:wrap;gap:8px;padding:8px"><style>.c{width:284px}.c img{width:284px;height:180px;object-fit:cover;display:block;background:#eee}.t{font-weight:700;padding:2px 0}.t i{font-weight:400;color:#666;font-size:10px}</style>' + cells);
      await p.goto("file://" + html);
      await p.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
      const out = path.join(OUT, "review-" + String(n + 1).padStart(2, "0") + ".png");
      await p.screenshot({ path: out, fullPage: true });
      console.log("tavola: " + path.relative(ROOT, out) + " (" + part.length + " foto)");
    }
  });
}

function size() {
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".webp")) : [];
  const total = files.reduce((a, f) => a + fs.statSync(path.join(DIR, f)).size, 0);
  console.log(files.length + " foto, " + (total / 1048576).toFixed(2) + " MB in tutto, " + (files.length ? (total / files.length / 1024).toFixed(1) : 0) + " KB in media");
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "find") await find(args[0]);
  else if (cmd === "pick") await pick(args);
  else if (cmd === "credits") credits();
  else if (cmd === "size") size();
  else if (cmd === "review") await review(args);
  else console.log("Uso: photos.js find <file.json> | pick id=n ... | credits | size");
})().catch((e) => { console.error(e.message); process.exit(1); });
