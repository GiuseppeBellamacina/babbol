/*
 * Riassunto leggibile di unità/esami per la revisione delle chiavi di risposta.
 *   node tools/review-dump.js a2-01 a2-02 ...    -> build/review/<id>.txt
 *   node tools/review-dump.js exam-b2 placement
 * Ogni esercizio ha un riferimento "lezione#indice" (o "parte#indice") per ritrovarlo nel JSON.
 * La risposta giusta è marcata con [*].
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "build", "review");
fs.mkdirSync(OUT, { recursive: true });

function opts(o, a) { return o.map((x, i) => (i === a ? "[*] " : "    ") + x).join("\n      "); }
function step(s) {
  const L = [];
  const why = s.why ? "\n      why: " + s.why : "";
  switch (s.t) {
    case "note": return "NOTE «" + s.title + "»: " + s.body.replace(/\n/g, " / ") + (s.ex ? " | ex: " + s.ex.map((e) => e[0] + " = " + e[1]).join(" ; ") : "");
    case "words": case "drill": return s.t.toUpperCase();
    case "mc": return "MC " + s.q + (s.text ? " | " + s.text : "") + "\n      " + opts(s.opts, s.a) + why;
    case "gap": return "GAP " + s.s + (s.it ? " (" + s.it + ")" : "") + "\n      " + opts(s.opts, s.a) + why;
    case "type": return "TYPE " + s.q + " | " + (s.text || s.s) + "\n      accepted: " + s.answers.join(" || ") + why;
    case "transform": return "TRANSFORM " + s.s1 + " [" + s.key + "] -> " + s.s2 + "\n      accepted: " + s.answers.join(" || ") + why;
    case "wordform": return "WORDFORM " + s.s + " [" + s.root + "]\n      accepted: " + s.answers.join(" || ") + why;
    case "fix": return "FIX " + s.s + "\n      accepted: " + s.answers.join(" || ") + why;
    case "order": return "ORDER it: " + s.it + "\n      en: " + s.en + " | extra: " + (s.extra || []).join(", ") + (s.alts && s.alts.length ? " | alts: " + s.alts.join(" || ") : "");
    case "match": return "MATCH " + s.pairs.map((p) => p[0] + " = " + p[1]).join(" ; ");
    case "dictation": return "DICTATION " + s.en;
    case "speak": return "SPEAK " + s.en;
    case "speakTask": return "SPEAKTASK " + s.q + " | model: " + s.model;
    case "write": return "WRITE " + s.q + " (" + s.min + "-" + s.max + ") | model: " + s.model.replace(/\n/g, " / ");
    case "dialog":
      return "DIALOG " + (s.title || "") + "\n      " + s.lines.map((l) => typeof l[1] === "object" ? l[0] + ": \n        " + opts(l[1].opts, l[1].a).replace(/\n      /g, "\n        ") : l[0] + ": " + l[1]).join("\n      ") + why;
    case "read": case "listen": {
      const txt = s.t === "read" ? s.text.replace(/\n+/g, " / ") : s.lines.map((l) => l[0] + ": " + l[1]).join(" / ");
      L.push(s.t.toUpperCase() + " «" + (s.title || "") + "»: " + txt);
      s.qs.forEach((q, i) => L.push("      Q" + (i + 1) + " " + q.q + "\n        " + (q.answers ? "accepted: " + q.answers.join(" || ") : opts(q.opts, q.a).replace(/\n      /g, "\n        ")) + (q.why ? "\n        why: " + q.why : "")));
      return L.join("\n");
    }
    case "cloze":
      return "CLOZE (" + s.mode + "): " + s.text.replace(/\n+/g, " / ") + "\n      " +
        s.gaps.map((g, i) => "(" + (i + 1) + ") " + (s.mode === "mc" ? g.opts.map((o, k) => (k === g.a ? "[*]" : "") + o).join(" | ") : (g.root ? "[" + g.root + "] " : "") + g.answers.join(" || "))).join("\n      ");
    default: return s.t + " " + JSON.stringify(s);
  }
}

function dumpUnit(id) {
  const u = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "units", id + ".json"), "utf8"));
  const out = ["UNIT " + u.id + " (" + u.level + ") " + u.title + " | grammar: " + u.grammar + " | topic: " + u.topic, ""];
  u.lessons.forEach((l) => {
    out.push("=== " + l.id + " (" + l.kind + ") " + l.title);
    (l.words || []).forEach((w) => out.push("  word " + w.id + ": " + w.en + " /" + w.ipa + "/ = " + w.it + " | " + w.ex[0] + " = " + w.ex[1] + (w.note ? " | note: " + w.note : "")));
    l.steps.forEach((s, i) => out.push("  " + l.id + "#" + i + " " + step(s)));
    out.push("");
  });
  return out.join("\n");
}
function dumpExam(id) {
  const file = id === "placement" ? path.join(ROOT, "content", "placement.json") : path.join(ROOT, "content", "exams", id + ".json");
  const e = JSON.parse(fs.readFileSync(file, "utf8"));
  const out = [e.title, ""];
  if (e.steps) e.steps.forEach((s, i) => out.push("  steps#" + i + " [" + s.lv + "] " + step(s)));
  (e.parts || []).forEach((p, pi) => {
    out.push("=== parts[" + pi + "] " + p.title + " (" + p.skill + ")");
    p.steps.forEach((s, i) => out.push("  parts[" + pi + "].steps#" + i + " " + step(s)));
    out.push("");
  });
  return out.join("\n");
}

process.argv.slice(2).forEach((id) => {
  const txt = /^(exam-|placement)/.test(id) ? dumpExam(id) : dumpUnit(id);
  fs.writeFileSync(path.join(OUT, id + ".txt"), txt);
  console.log(id + ": " + txt.length + " caratteri");
});
