#!/usr/bin/env node
/*
 * Strumenti per i contenuti (vedi docs/CONTENT_SCHEMA.md).
 *
 *   node tools/content.js validate          controlla tutto content/ (exit 1 se ci sono errori)
 *   node tools/content.js bundle [rev]      scrive www/content/course.js (snapshot per l'APK)
 *   node tools/content.js sql [outDir]      scrive gli upsert SQL per Supabase a blocchi (default build/sql)
 *   node tools/content.js publish           carica content/ su Supabase (chiave in .secrets/publish-key) e rigenera lo snapshot
 *   node tools/content.js check-bundle      verifica che lo snapshot corrisponda a content/
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const C = path.join(ROOT, "content");
const IMG = path.join(ROOT, "www", "img", "v");
const PHOTO_DIR = path.join(ROOT, "www", "img", "p");
const GRAM_DIR = path.join(ROOT, "www", "img", "g");
const PHOTO_MANIFEST = path.join(C, "photos.json");
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]/u;
const KINDS = ["grammar", "vocab", "reading", "listening", "situation", "production", "test"];
const LEVELS = ["A2", "B1", "B2"];

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function list(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : []; }

// ---------------------------------------------------------------- caricamento
function load() {
  const out = { meta: readJson(path.join(C, "meta.json")), units: [], exams: [], resources: [], placement: null };
  const p = path.join(C, "placement.json");
  if (fs.existsSync(p)) out.placement = readJson(p);
  list(path.join(C, "units")).forEach((f) => out.units.push(Object.assign({ _file: "units/" + f }, readJson(path.join(C, "units", f)))));
  list(path.join(C, "exams")).forEach((f) => out.exams.push(Object.assign({ _file: "exams/" + f }, readJson(path.join(C, "exams", f)))));
  list(path.join(C, "resources")).forEach((f) => out.resources.push(Object.assign({ _file: "resources/" + f }, readJson(path.join(C, "resources", f)))));
  return out;
}

// ---------------------------------------------------------------- foto (campi "photo" e "photos" in qualsiasi punto)
function photoRefs(all) {
  const refs = [];  // { id, where, obj }
  const walk = (obj, where) => {
    JSON.stringify(obj, function (k, v) {
      if (k === "photo" && typeof v === "string") refs.push({ id: v, where, obj: this });
      if (k === "photos" && Array.isArray(v)) v.forEach((id) => refs.push({ id: String(id), where, obj: this, many: v.length }));
      return v;
    });
  };
  all.units.forEach((u) => walk(u, u._file));
  all.exams.forEach((e) => walk(e, e._file));
  if (all.placement) walk(all.placement, "placement.json");
  all.resources.forEach((r) => walk(r, r._file));
  return refs;
}

// ---------------------------------------------------------------- validazione
function validate(all) {
  const errs = [];
  const ids = {};
  const err = (where, msg) => errs.push(where + ": " + msg);
  const uniq = (id, where) => { if (!id) err(where, "id mancante"); else if (ids[id]) err(where, "id duplicato " + id); else ids[id] = 1; };
  const str = (v) => typeof v === "string" && v.trim().length > 0;
  const arrStr = (v, min) => Array.isArray(v) && v.length >= (min || 1) && v.every(str);
  const words = (s) => (String(s).match(/[A-Za-z0-9'’-]+/g) || []).length;

  // emoji ammesse SOLO come immagine di una parola (campo `emoji` delle words, una sola emoji); vietate ovunque altrove
  const ONE_EMOJI = /^\p{Extended_Pictographic}️?(‍\p{Extended_Pictographic}️?)*$/u;
  // sinonimi (facoltativi) di una parola: da 1 a 4, inglese semplice, mai la parola stessa
  function checkSyn(w, where) {
    if (w.syn == null) return;
    if (!(Array.isArray(w.syn) && w.syn.length >= 1 && w.syn.length <= 4)) return err(where, "syn deve essere un elenco di 1-4 sinonimi");
    const seen = {};
    w.syn.forEach((s) => {
      if (!/^[a-z][a-z' -]{0,23}$/.test(s)) err(where, "syn: «" + s + "» non valido (minuscolo, solo lettere, max 24)");
      if (s === String(w.en).toLowerCase()) err(where, "syn: «" + s + "» è la parola stessa");
      if (seen[s]) err(where, "syn: «" + s + "» ripetuto");
      seen[s] = 1;
    });
  }

  function scanEmoji(obj, where) {
    JSON.stringify(obj, function (k, v) {
      if (k === "emoji" && this && this.en && this.it) {
        if (typeof v !== "string" || !ONE_EMOJI.test(v)) err(where, "parola «" + this.en + "»: emoji deve essere una sola emoji");
        return undefined;
      }
      if (typeof v === "string" && EMOJI.test(v)) err(where, "emoji vietata in «" + v.slice(0, 50) + "» (ammessa solo nel campo emoji di una parola)");
      return v;
    });
  }

  function mcOk(o, where) {
    if (!arrStr(o.opts, 2)) return err(where, "opts: servono almeno 2 opzioni");
    if (!(Number.isInteger(o.a) && o.a >= 0 && o.a < o.opts.length)) err(where, "a fuori dalle opzioni");
    if (new Set(o.opts.map((x) => x.trim().toLowerCase())).size !== o.opts.length) err(where, "opzioni duplicate");
  }
  function qsOk(qs, where) {
    if (!Array.isArray(qs) || !qs.length) return err(where, "qs vuote");
    qs.forEach((q, i) => {
      const w = where + ".qs[" + i + "]";
      if (!str(q.q)) err(w, "q mancante");
      if (q.answers) { if (!arrStr(q.answers)) err(w, "answers non validi"); } else mcOk(q, w);
    });
  }

  function step(s, where, level, lesson) {
    if (!s || !s.t) return err(where, "step senza t");
    if (s.img && !fs.existsSync(path.join(IMG, s.img + ".svg"))) err(where, "img mancante: www/img/v/" + s.img + ".svg");
    switch (s.t) {
      case "note":
        if (!str(s.title) || !str(s.body)) err(where, "note: title/body");
        if (s.svg && !fs.existsSync(path.join(GRAM_DIR, s.svg + ".svg"))) err(where, "note: manca lo schema www/img/g/" + s.svg + ".svg");
        if (s.ex && !(Array.isArray(s.ex) && s.ex.every((p) => arrStr(p, 2)))) err(where, "note: ex deve essere [[en,it],...]");
        if (s.table && !(Array.isArray(s.table) && s.table.every((r) => Array.isArray(r)))) err(where, "note: table");
        break;
      case "words":
        if (!lesson || !lesson.words || !lesson.words.length) err(where, "words senza parole nella lezione");
        break;
      case "drill":
        if (!lesson || !lesson.words || lesson.words.length < 4) err(where, "drill: servono almeno 4 parole");
        if (!(s.n > 0)) err(where, "drill: n");
        break;
      case "mc":
        if (!str(s.q)) err(where, "mc: q");
        mcOk(s, where); break;
      case "gap":
        if (!str(s.s) || s.s.indexOf("___") < 0) err(where, "gap: s deve contenere ___");
        else {
          // più spazi: ogni opzione ha una parte per spazio, separate da " / " (es. "an / a")
          const blanks = (s.s.match(/___/g) || []).length;
          if (blanks > 1 && Array.isArray(s.opts) && s.opts.some((o) => String(o).split(" / ").length !== blanks)) err(where, "gap con " + blanks + " spazi: ogni opzione deve avere " + blanks + " parti separate da \" / \"");
        }
        mcOk(s, where); break;
      case "match":
        if (!(Array.isArray(s.pairs) && s.pairs.length >= 3 && s.pairs.length <= 6 && s.pairs.every((p) => arrStr(p, 2)))) err(where, "match: 3-6 coppie [en,it]");
        else {
          if (new Set(s.pairs.map((p) => p[0].toLowerCase())).size !== s.pairs.length) err(where, "match: inglese duplicato");
          if (new Set(s.pairs.map((p) => p[1].toLowerCase())).size !== s.pairs.length) err(where, "match: italiano duplicato");
        }
        break;
      case "dialog":
        if (!(Array.isArray(s.lines) && s.lines.length >= 3)) { err(where, "dialog: almeno 3 battute"); break; }
        var choices = 0;
        s.lines.forEach((l, i) => {
          if (!Array.isArray(l) || l.length < 2 || !str(l[0])) return err(where, "dialog: riga " + i);
          if (typeof l[1] === "object") { choices++; mcOk(l[1], where + ".lines[" + i + "]"); } else if (!str(l[1])) err(where, "dialog: riga " + i + " vuota");
        });
        if (!choices) err(where, "dialog: nessuna battuta da scegliere");
        break;
      case "type":
        if (!str(s.q)) err(where, "type: q");
        if (!str(s.text) && !(str(s.s) && s.s.indexOf("___") >= 0)) err(where, "type: serve text o s con ___");
        if (!arrStr(s.answers)) err(where, "type: answers");
        break;
      case "order":
        if (!str(s.it) || !str(s.en)) err(where, "order: it/en");
        if (str(s.en) && s.en.split(/\s+/).length > 16) err(where, "order: frase troppo lunga (max 16 parole)");
        break;
      case "transform":
        if (!str(s.s1) || !str(s.key) || !str(s.s2) || s.s2.indexOf("___") < 0 || !arrStr(s.answers)) err(where, "transform: s1/key/s2 con ___/answers");
        else {
          if (s.key !== s.key.toUpperCase()) err(where, "transform: key in MAIUSCOLO");
          s.answers.forEach((a) => {
            const uk = (x) => x.toLowerCase().replace(/iz(e|es|ed|ing)\b/g, "is$1");
            if (uk(a).split(/\s+/).indexOf(uk(s.key)) < 0 && !/['’]/.test(a)) err(where, "transform: la key non compare in «" + a + "»");
            if (words(a) > 6) err(where, "transform: risposta troppo lunga «" + a + "»");
          });
        }
        break;
      case "wordform":
        if (!str(s.s) || s.s.indexOf("___") < 0 || !str(s.root) || !arrStr(s.answers)) err(where, "wordform: s con ___/root/answers");
        break;
      case "fix":
        if (!str(s.s) || !arrStr(s.answers)) err(where, "fix: s/answers");
        else if (s.answers.some((a) => a.trim().toLowerCase() === s.s.trim().toLowerCase())) err(where, "fix: la risposta coincide con la frase sbagliata");
        break;
      case "dictation":
        if (!str(s.en)) err(where, "dictation: en"); break;
      case "speak":
        if (!str(s.en)) err(where, "speak: en"); break;
      case "speakTask":
        if (!str(s.q) || !str(s.model)) err(where, "speakTask: q/model"); break;
      case "write":
        if (!str(s.q) || !str(s.model) || !(s.min > 0) || !(s.max >= s.min) || !arrStr(s.checklist, 2)) err(where, "write: q/model/min/max/checklist(>=2)");
        break;
      case "read":
        if (!str(s.text)) { err(where, "read: text"); break; }
        qsOk(s.qs, where);
        break;
      case "listen":
        if (!(Array.isArray(s.lines) && s.lines.length && s.lines.every((l) => arrStr(l, 2)))) err(where, "listen: lines [[speaker,text]]");
        else s.lines.forEach((l) => { if (l.length > 3 || (l[2] != null && l[2] !== "m" && l[2] !== "f")) err(where, "listen: il terzo elemento di una riga è il genere, solo \"m\" o \"f\""); });
        qsOk(s.qs, where);
        break;
      case "cloze": {
        if (!str(s.text) || !Array.isArray(s.gaps)) { err(where, "cloze: text/gaps"); break; }
        const marks = (s.text.match(/\{(\d+)\}/g) || []).map((m) => +m.slice(1, -1));
        if (marks.length !== s.gaps.length) err(where, "cloze: " + marks.length + " segnaposto {n} ma " + s.gaps.length + " gaps");
        marks.forEach((n, i) => { if (n !== i + 1) err(where, "cloze: segnaposto non in ordine 1..n"); });
        s.gaps.forEach((g, i) => {
          const w = where + ".gaps[" + i + "]";
          if (s.mode === "mc") mcOk(g, w);
          else if (s.mode === "open") { if (!arrStr(g.answers)) err(w, "answers"); }
          else if (s.mode === "wordform") { if (!str(g.root) || !arrStr(g.answers)) err(w, "root/answers"); }
          else err(where, "cloze: mode deve essere mc|open|wordform");
        });
        break;
      }
      default:
        err(where, "tipo di step sconosciuto: " + s.t);
    }
  }

  // lunghezze dei testi per livello (con un po' di tolleranza rispetto a docs/CONTENT_SCHEMA.md)
  const LEN = {
    read: { A2: [160, 280], B1: [270, 440], B2: [400, 660] },
    listen: { A2: [100, 220], B1: [180, 340], B2: [270, 500] },
    write: { A2: [60, 80], B1: [100, 120], B2: [140, 190] }
  };
  const GRADED = ["mc", "gap", "match", "dialog", "type", "order", "transform", "wordform", "fix", "dictation", "speak", "speakTask", "write", "read", "listen", "cloze"];
  const count = (l, t) => l.steps.filter((s) => (Array.isArray(t) ? t.indexOf(s.t) >= 0 : s.t === t)).length;
  const wordsIn = (s) => s.t === "listen" ? words(s.lines.map((x) => x[1]).join(" ")) : words(s.text || "");
  const seenWords = {};

  function lessonOk(l, where, level) {
    uniq(l.id, where);
    if (!str(l.title) || !str(l.intro)) err(where, "title/intro");
    if (!(l.minutes > 0)) err(where, "minutes");
    if (l.words) {
      l.words.forEach((w, i) => {
        const ww = where + ".words[" + i + "]";
        uniq(w.id, ww);
        if (!str(w.en) || !str(w.it) || !str(w.ipa) || !(Array.isArray(w.ex) && w.ex.length === 2)) err(ww, "en/it/ipa/ex");
        if (w.img && !fs.existsSync(path.join(IMG, w.img + ".svg"))) err(ww, "img mancante: www/img/v/" + w.img + ".svg");
        if (w.img && w.emoji) err(ww, "usa emoji OPPURE img, non entrambi");
        checkSyn(w, ww);
        const k = String(w.en).toLowerCase().trim();
        if (seenWords[k]) err(ww, "parola «" + w.en + "» già presente in " + seenWords[k] + " (duplicherebbe il ripasso)");
        else seenWords[k] = l.id;
      });
    }
    if (!Array.isArray(l.steps) || !l.steps.length) return err(where, "steps vuoti");
    l.steps.forEach((s, i) => step(s, where + ".steps[" + i + "]", level, l));
    const graded = count(l, GRADED);

    // quantità minime per tipo di lezione
    const need = (cond, msg) => { if (!cond) err(where, msg); };
    switch (l.kind) {
      case "grammar":
        need(count(l, "note") >= 3 && count(l, "note") <= 6, "grammar: servono 3-5 note (trovate " + count(l, "note") + ")");
        need(graded >= 14, "grammar: servono almeno 14 esercizi (trovati " + graded + ")");
        need(count(l, ["transform", "fix", "type"]) >= 5, "grammar: almeno 5 esercizi scritti (type/transform/fix)");
        break;
      case "vocab":
        need((l.words || []).length >= 12 && (l.words || []).length <= 18, "vocab: servono 12-16 parole");
        need(count(l, "words") === 1 && count(l, "drill") === 1, "vocab: un passo words e un drill");
        need(graded >= 5, "vocab: almeno 5 esercizi a frase oltre al drill");
        break;
      case "reading":
        need(count(l, "read") >= 1, "reading: manca il read");
        l.steps.filter((s) => s.t === "read").forEach((s) => need(s.qs && s.qs.length >= 6, "reading: almeno 6 domande sul testo"));
        break;
      case "listening":
        need(count(l, "listen") >= 1 && count(l, "dictation") >= 2, "listening: almeno 1 listen e 2 dictation");
        l.steps.filter((s) => s.t === "listen").forEach((s) => need(s.qs && s.qs.length >= 5, "listening: almeno 5 domande per audio"));
        break;
      case "situation":
        need(count(l, "dialog") >= 2 && count(l, "speak") >= 3 && count(l, "speakTask") >= 1, "situation: servono 2 dialog, 3 speak, 1 speakTask");
        break;
      case "production":
        need(count(l, "write") >= 1 && count(l, "speakTask") >= 2, "production: servono 1 write e 2 speakTask");
        break;
      case "test":
        if (!(l.pass > 0)) err(where, "test: pass");
        if (l.steps.some((s) => s.t === "note" || s.t === "words" || s.t === "drill")) err(where, "test: niente note/words/drill");
        need(graded >= 18 && graded <= 28, "test: servono 20-25 esercizi (trovati " + graded + ")");
        need(count(l, ["read", "cloze"]) >= 1 && count(l, "listen") >= 1, "test: almeno un read o cloze e un listen");
        break;
    }
    // lunghezze dei testi nelle lezioni dedicate
    l.steps.forEach((s, i) => {
      const w = where + ".steps[" + i + "]";
      if (s.t === "read" && l.kind === "reading") { const n = wordsIn(s), r = LEN.read[level]; if (n < r[0] || n > r[1]) err(w, "read: " + n + " parole, per " + level + " servono " + r[0] + "-" + r[1]); }
      if (s.t === "listen" && l.kind === "listening") {
        const n = l.steps.filter((x) => x.t === "listen").reduce((a, x) => a + wordsIn(x), 0), r = LEN.listen[level];
        if (n < r[0] || n > r[1]) err(w, "listen: " + n + " parole di copione in tutta la lezione, per " + level + " servono " + r[0] + "-" + r[1]);
      }
      if (s.t === "write" && l.kind === "production") {
        const r = LEN.write[level];
        if (s.min !== r[0] || s.max !== r[1]) err(w, "write: per " + level + " usa min " + r[0] + " e max " + r[1]);
        const n = words(s.model);
        if (n < r[0] * 0.9 || n > r[1] * 1.1) err(w, "write: il modello ha " + n + " parole, deve stare in " + r[0] + "-" + r[1]);
      }
    });
  }

  // foto: ogni riferimento deve avere il file in www/img/p e la voce nei crediti (content/photos.json)
  const manifest = fs.existsSync(PHOTO_MANIFEST) ? JSON.parse(fs.readFileSync(PHOTO_MANIFEST, "utf8")) : {};
  photoRefs(all).forEach((r) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(r.id)) err(r.where, "foto «" + r.id + "»: id non valido (minuscole, numeri, trattini)");
    else {
      if (!manifest[r.id]) err(r.where, "foto «" + r.id + "»: manca in content/photos.json (crediti)");
      if (!fs.existsSync(path.join(PHOTO_DIR, r.id + ".webp"))) err(r.where, "foto «" + r.id + "»: manca www/img/p/" + r.id + ".webp");
    }
    if (r.many != null && r.many !== 2) err(r.where, "photos: servono esattamente 2 foto (confronto A/B)");
    if (r.obj && (r.obj.img || r.obj.emoji) && r.obj.en) err(r.where, "parola «" + r.obj.en + "»: usa emoji, img oppure photo, non più di uno");
  });

  // meta
  if (!Array.isArray(all.meta.levels) || all.meta.levels.map((x) => x.id).join() !== LEVELS.join()) err("meta.json", "levels deve essere A2,B1,B2");
  scanEmoji(all.meta, "meta.json");

  // unità
  const perLevel = {};
  all.units.forEach((u) => {
    const where = u._file;
    scanEmoji(u, where);
    uniq(u.id, where);
    if (path.basename(u._file, ".json") !== u.id) err(where, "il nome del file deve essere l'id");
    if (LEVELS.indexOf(u.level) < 0) err(where, "level");
    if (!u.id.startsWith(u.level.toLowerCase() + "-")) err(where, "l'id deve iniziare con il livello");
    ["title", "sub", "grammar", "topic", "situation"].forEach((k) => { if (!str(u[k])) err(where, k + " mancante"); });
    perLevel[u.level] = (perLevel[u.level] || []).concat(u.position);
    const kinds = (u.lessons || []).map((l) => l.kind);
    if (kinds.join() !== KINDS.join()) err(where, "lezioni: servono nell'ordine " + KINDS.join(", ") + " (trovate: " + kinds.join(", ") + ")");
    (u.lessons || []).forEach((l, i) => {
      if (l.id !== u.id + "-" + l.kind) err(where + ".lessons[" + i + "]", "id deve essere " + u.id + "-" + l.kind);
      lessonOk(l, where + "." + l.kind, u.level);
    });
  });
  Object.keys(perLevel).forEach((lv) => {
    const pos = perLevel[lv].slice().sort((a, b) => a - b);
    pos.forEach((p, i) => { if (p !== i + 1) err("units " + lv, "position non consecutive: " + pos.join(",")); });
  });

  // esami
  all.exams.forEach((e) => {
    const where = e._file;
    scanEmoji(e, where);
    uniq(e.id, where);
    if (!str(e.title) || LEVELS.indexOf(e.level) < 0 || !Array.isArray(e.parts) || !e.parts.length) return err(where, "title/level/parts");
    e.parts.forEach((p, i) => {
      const w = where + ".parts[" + i + "]";
      if (!str(p.title) || !str(p.it) || !(p.minutes > 0) || ["reading", "use", "listening", "writing", "speaking"].indexOf(p.skill) < 0) err(w, "title/it/minutes/skill");
      (p.steps || []).forEach((s, k) => {
        if (s.t === "note" || s.t === "words" || s.t === "drill") err(w, "niente note/words/drill negli esami");
        step(s, w + ".steps[" + k + "]", e.level, null);
      });
    });
  });

  // test d'ingresso
  if (all.placement) {
    scanEmoji(all.placement, "placement.json");
    uniq(all.placement.id, "placement.json");
    (all.placement.steps || []).forEach((s, i) => {
      if (LEVELS.indexOf(s.lv) < 0) err("placement.json.steps[" + i + "]", "lv mancante");
      step(s, "placement.json.steps[" + i + "]", s.lv, null);
    });
  }

  // risorse
  const RES = {
    verbs: ["base", "past", "pp", "it"], phrasal: ["en", "it"], falsefriends: ["en", "trap", "real", "fix"],
    idioms: ["en", "it"], connectors: ["en", "it", "use"], pron: ["title", "sound", "tip"],
    words: ["en", "it", "ipa"], collocations: ["en", "it"], mistakes: ["wrong", "right", "why"],
    sayit: ["written", "spoken", "it"], phrases: ["en", "it"], photos: ["q", "it", "model"]
  };
  // parole nuove: non devono ripetere quelle delle unità né quelle di un'altra lista
  const unitWords = new Set();
  all.units.forEach((u) => (u.lessons || []).forEach((l) => (l.words || []).forEach((w) => unitWords.add(String(w.en).toLowerCase()))));
  const listWords = {};
  const arrOf = (v) => Array.isArray(v) && v.every(str);
  all.resources.forEach((r) => {
    const where = r._file;
    scanEmoji(r, where);
    uniq(r.id, where);
    if (!RES[r.kind]) return err(where, "kind sconosciuto " + r.kind);
    if (!str(r.title) || !Array.isArray(r.items) || !r.items.length) return err(where, "title/items");
    if (r.lv != null && LEVELS.indexOf(r.lv) < 0) err(where, "lv deve essere A2, B1 o B2");
    const seen = {};
    r.items.forEach((it, i) => {
      const w = where + ".items[" + i + "]";
      RES[r.kind].forEach((k) => { if (!str(it[k])) err(w, k + " mancante"); });
      const key = String(it.en || it.base || it.title || it.wrong || it.written || it.q || "").toLowerCase();
      if (seen[key]) err(w, "duplicato " + key);
      seen[key] = 1;
      if (it.lv != null && LEVELS.indexOf(it.lv) < 0) err(w, "lv deve essere A2, B1 o B2");
      if (it.ex != null && !(Array.isArray(it.ex) && it.ex.length === 2 && it.ex.every(str))) err(w, "ex deve essere [inglese, italiano]");
      if (it.alts != null && !arrOf(it.alts)) err(w, "alts deve essere un elenco di stringhe");
      if (r.kind === "words") checkSyn(it, w);
      if (r.kind === "words") {
        if (!it.ex) err(w, "words: manca la frase d'esempio ex");
        if (unitWords.has(key)) err(w, "parola «" + it.en + "» già presente nelle unità");
        if (listWords[key]) err(w, "parola «" + it.en + "» già in " + listWords[key]);
        listWords[key] = where;
        if (!/^[A-Za-z' -]+$/.test(it.en)) err(w, "words: en con caratteri strani");
        if ((it.photo || it.img || it.emoji) && !(Number(!!it.photo) + Number(!!it.img) + Number(!!it.emoji) === 1)) err(w, "usa emoji, img oppure photo, non più di uno");
      }
      if (r.kind === "mistakes") {
        if (it.wrong.trim() === it.right.trim()) err(w, "mistakes: wrong e right sono uguali");
        if (it.more != null && !arrOf(it.more)) err(w, "mistakes: more deve essere un elenco di frasi sbagliate");
      }
      if (r.kind === "collocations" && it.group != null && !str(it.group)) err(w, "collocations: group");
      if (r.kind === "phrases" && !str(it.group)) err(w, "phrases: manca group (la situazione)");
      if (r.kind === "sayit" && !str(it.group)) err(w, "sayit: manca group");
      if (r.kind === "photos") {
        if (!!it.photo === !!it.photos) err(w, "photos: serve photo oppure photos (due foto), non entrambi");
        if (!it.lv) err(w, "photos: manca lv");
        if (!(Array.isArray(it.hints) && it.hints.length >= 3 && it.hints.every(str))) err(w, "photos: servono almeno 3 hints");
        const need = { A2: 30, B1: 55, B2: 90 }[it.lv] || 30, n = words(it.model);
        if (n < need) err(w, "photos: il modello ha " + n + " parole, per " + it.lv + " ne servono almeno " + need);
        if (it.photos && it.lv === "A2") err(w, "photos: il confronto di due foto è per B2");
      }
    });
  });

  return errs;
}

// ---------------------------------------------------------------- righe per il DB / snapshot
// Una riga = { id, kind, parent, position, data }: la stessa forma della tabella public.content.
function rows(all) {
  const out = [{ id: "meta", kind: "meta", parent: null, position: 0, data: all.meta }];
  if (all.placement) out.push({ id: all.placement.id, kind: "placement", parent: null, position: 0, data: strip(all.placement) });
  all.units.forEach((u) => {
    const unit = strip(u);
    delete unit.lessons;
    out.push({ id: u.id, kind: "unit", parent: u.level, position: u.position, data: unit });
    u.lessons.forEach((l, i) => out.push({ id: l.id, kind: "lesson", parent: u.id, position: i + 1, data: l }));
  });
  all.exams.forEach((e) => out.push({ id: e.id, kind: "exam", parent: e.level, position: 0, data: strip(e) }));
  all.resources.forEach((r, i) => out.push({ id: r.id, kind: "resource", parent: null, position: i + 1, data: strip(r) }));
  return out;
}
function strip(o) { const c = Object.assign({}, o); delete c._file; return c; }

function sqlQuote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
function toSql(batch) {
  const values = batch.map((r) => "(" + [sqlQuote(r.id), sqlQuote(r.kind), r.parent ? sqlQuote(r.parent) : "null", r.position,
    sqlQuote(JSON.stringify(r.data)) + "::jsonb", "false"].join(", ") + ")");
  // aggiorna solo se il contenuto è cambiato: così il rev (e quindi i download) non cresce inutilmente
  return "insert into public.content (id, kind, parent, position, data, deleted) values\n" + values.join(",\n") +
    "\non conflict (id) do update set kind = excluded.kind, parent = excluded.parent, position = excluded.position, data = excluded.data, deleted = false\n" +
    "where public.content.data is distinct from excluded.data or public.content.position <> excluded.position or public.content.deleted;\n";
}

// ---------------------------------------------------------------- pubblicazione su Supabase
// Carica tutto content/ con l'RPC publish_content (solo le righe cambiate prendono un nuovo rev),
// segna come eliminate le righe che non esistono più, poi rigenera lo snapshot dell'APK con il rev del server.
async function publish(all) {
  const boot = fs.readFileSync(path.join(ROOT, "www", "js", "core", "boot.js"), "utf8");
  const url = /supabaseUrl:\s*"([^"]+)"/.exec(boot)[1], apikey = /supabaseKey:\s*"([^"]+)"/.exec(boot)[1];
  const keyFile = path.join(ROOT, ".secrets", "publish-key");
  const key = (process.env.BABBOL_PUBLISH_KEY || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, "utf8") : "")).trim();
  if (!key) throw new Error("manca la chiave di pubblicazione (.secrets/publish-key o BABBOL_PUBLISH_KEY)");
  // la pubblicazione richiede un account "publisher" (registrato in private.publishers) oltre alla chiave: email e password
  // in .secrets/publisher-login (due righe) oppure BABBOL_PUBLISHER_EMAIL / BABBOL_PUBLISHER_PASSWORD
  const loginFile = path.join(ROOT, ".secrets", "publisher-login");
  const [fEmail, fPass] = fs.existsSync(loginFile) ? fs.readFileSync(loginFile, "utf8").split(/\r?\n/) : [];
  const email = (process.env.BABBOL_PUBLISHER_EMAIL || fEmail || "").trim(), password = (process.env.BABBOL_PUBLISHER_PASSWORD || fPass || "").trim();
  if (!email || !password) throw new Error("manca l'account publisher (.secrets/publisher-login: email e password su due righe)");
  const lr = await fetch(url + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const lj = await lr.json();
  if (!lr.ok || !lj.access_token) throw new Error("accesso del publisher non riuscito: " + (lj.msg || lj.error_description || lr.status));
  const r = rows(all), ids = r.map((x) => x.id);
  const call = async (body) => {
    const res = await fetch(url + "/rest/v1/rpc/publish_content", { method: "POST", headers: { apikey, Authorization: "Bearer " + lj.access_token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const t = await res.text();
    if (!res.ok) throw new Error("HTTP " + res.status + " " + t.slice(0, 300));
    return JSON.parse(t);
  };
  // blocchi da ~400 KB
  let batch = [], size = 0, changed = 0, out = null;
  const send = async (last) => {
    out = await call({ p_key: key, p_rows: batch, p_prune: !!last, p_ids: last ? ids : null });
    changed += out.changed; batch = []; size = 0;
  };
  for (const row of r) {
    const len = JSON.stringify(row).length;
    if (size + len > 400000 && batch.length) await send(false);
    batch.push(row); size += len;
  }
  await send(true);
  console.log("Pubblicato: " + r.length + " righe, " + changed + " cambiate, " + out.pruned + " eliminate, rev " + out.rev);
  const dir = path.join(ROOT, "www", "content");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "course.js"), "/* Generato da tools/content.js: non modificare. */\nB.data.course = " +
    JSON.stringify({ rev: out.rev, items: r }) + ";\n");
  console.log("Snapshot www/content/course.js aggiornato (rev " + out.rev + ")");
}

// ---------------------------------------------------------------- CLI
if (require.main === module) {
  const cmd = process.argv[2];
  const all = load();
  const errs = validate(all);
  if (cmd === "validate" || errs.length) {
    const n = { units: all.units.length, lessons: all.units.reduce((a, u) => a + (u.lessons || []).length, 0),
      steps: all.units.reduce((a, u) => a + (u.lessons || []).reduce((b, l) => b + (l.steps || []).length, 0), 0),
      words: all.units.reduce((a, u) => a + (u.lessons || []).reduce((b, l) => b + (l.words || []).length, 0), 0),
      exams: all.exams.length, resources: all.resources.length };
    console.log("Contenuti: " + JSON.stringify(n));
    if (errs.length) { console.log(errs.length + " errori:\n  " + errs.slice(0, 200).join("\n  ")); process.exit(1); }
    console.log("OK, nessun errore.");
    const usedPhotos = new Set(photoRefs(all).map((r) => r.id));
    const manifestAll = fs.existsSync(PHOTO_MANIFEST) ? JSON.parse(fs.readFileSync(PHOTO_MANIFEST, "utf8")) : {};
    const unusedPhotos = Object.keys(manifestAll).filter((id) => !usedPhotos.has(id));
    if (Object.keys(manifestAll).length) console.log("Foto: " + usedPhotos.size + " usate" + (unusedPhotos.length ? ", " + unusedPhotos.length + " non usate (pesano nell'APK senza servire): " + unusedPhotos.join(", ") : "") + ".");
    if (cmd === "validate") process.exit(0);
  }
  if (cmd === "bundle") {
    const rev = parseInt(process.argv[3] || "0", 10);
    const dir = path.join(ROOT, "www", "content");
    fs.mkdirSync(dir, { recursive: true });
    // .js e non .json: nella WebView fetch() sui file locali è bloccato, uno <script> no
    fs.writeFileSync(path.join(dir, "course.js"), "/* Generato da tools/content.js: non modificare. */\nB.data.course = " +
      JSON.stringify({ rev: rev, items: rows(all) }) + ";\n");
    console.log("Scritto www/content/course.js (rev " + rev + ")");
  } else if (cmd === "sql") {
    const dir = process.argv[3] || path.join(ROOT, "build", "sql");
    fs.mkdirSync(dir, { recursive: true });
    fs.readdirSync(dir).forEach((f) => fs.unlinkSync(path.join(dir, f)));
    const r = rows(all);
    // blocchi da ~200 KB: abbastanza piccoli per l'API SQL
    let batch = [], size = 0, n = 0;
    const flush = () => { if (!batch.length) return; n++; fs.writeFileSync(path.join(dir, String(n).padStart(3, "0") + ".sql"), toSql(batch)); batch = []; size = 0; };
    r.forEach((row) => { const len = JSON.stringify(row.data).length; if (size + len > 200000) flush(); batch.push(row); size += len; });
    flush();
    console.log("Scritti " + n + " file SQL in " + dir + " (" + r.length + " righe)");
  } else if (cmd === "publish") {
    publish(all).catch((e) => { console.error("Pubblicazione fallita: " + e.message); process.exit(1); });
  } else if (cmd === "check-bundle") {
    // lo snapshot dell'APK deve contenere esattamente i contenuti di content/ (cioè quelli caricati su Supabase)
    const file = path.join(ROOT, "www", "content", "course.js");
    if (!fs.existsSync(file)) { console.log("Manca www/content/course.js: esegui 'bundle <rev>'"); process.exit(1); }
    const src = fs.readFileSync(file, "utf8");
    const b = JSON.parse(src.slice(src.indexOf("=") + 1).trim().replace(/;$/, ""));
    const want = JSON.stringify(rows(all)), have = JSON.stringify(b.items);
    if (want !== have) { console.log("www/content/course.js NON corrisponde a content/: ricarica su Supabase (sql) e rigenera (bundle <rev>)"); process.exit(1); }
    console.log("Snapshot aggiornato (rev " + b.rev + ", " + b.items.length + " righe)");
  } else if (cmd !== "validate") {
    console.log("Uso: node tools/content.js validate | bundle [rev] | sql [dir] | check-bundle");
  }
}

module.exports = { load, validate, rows };
