// Genera gli schemi di grammatica www/img/g/*.svg (le SVG sono la fonte; questo script serve solo a scriverle).
const fs = require("fs"), path = require("path");
const OUT = path.resolve(__dirname, "..", "www", "img", "g");
fs.mkdirSync(OUT, { recursive: true });

const C = { ink: "#1f2933", mute: "#5f6c7b", blue: "#2b7de9", blueL: "#cfe2ff", green: "#2fa84f", greenL: "#d5f1dd", orange: "#e08a00", orangeL: "#ffe8c2", red: "#e5484d", redL: "#fddede", purple: "#8e5cd9", purpleL: "#e9defa", line: "#9aa7b4", bg: "#f4f6f8" };
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "DejaVu Sans", sans-serif';
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---- elementi
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 12}" fill="${o.fill || C.ink}" font-weight="${o.w || 400}" text-anchor="${o.anchor || "start"}"${o.italic ? ' font-style="italic"' : ""}>${esc(s)}</text>`;
const R = (x, y, w, h, fill, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r == null ? 8 : o.r}" fill="${fill}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1.5}"` : ""}${o.op ? ` opacity="${o.op}"` : ""}/>`;
const L = (x1, y1, x2, y2, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.c || C.line}" stroke-width="${o.w || 2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""} stroke-linecap="round"/>`;
const D = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const arrowHead = (x, y, dir, c) => dir === "r" ? `<path d="M${x - 9} ${y - 5.5} L${x} ${y} L${x - 9} ${y + 5.5} Z" fill="${c}"/>` : dir === "d" ? `<path d="M${x - 5.5} ${y - 9} L${x} ${y} L${x + 5.5} ${y - 9} Z" fill="${c}"/>` : `<path d="M${x + 9} ${y - 5.5} L${x} ${y} L${x + 9} ${y + 5.5} Z" fill="${c}"/>`;
const axis = (y, x1 = 22, x2 = 340) => L(x1, y, x2 - 6, y, { c: C.mute, w: 2.5 }) + arrowHead(x2, y, "r", C.mute);
const now = (x, y1, y2, label = "ADESSO") => L(x, y1, x, y2, { c: C.red, w: 2.5, dash: "5 4" }) + T(x, y2 + 14, label, { size: 10.5, fill: C.red, w: 700, anchor: "middle" });
const badge = (x, y, s, fill, o = {}) => R(x, y, o.w || 30, o.h || 26, fill, { r: 13 }) + T(x + (o.w || 30) / 2, y + (o.h || 26) / 2 + 5, s, { size: o.size || 14, fill: "#fff", w: 800, anchor: "middle" });
const chip = (x, y, w, s, fill, ink, o = {}) => R(x, y, w, o.h || 24, fill, { r: 12 }) + T(x + w / 2, y + (o.h || 24) / 2 + 4.5, s, { size: o.size || 12, fill: ink || C.ink, w: 700, anchor: "middle" });

function svg(name, w, h, body, title) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family='${FONT}' role="img" aria-label="${esc(title)}">\n<rect width="${w}" height="${h}" rx="16" fill="${C.bg}"/>\n${body}\n</svg>\n`;
  fs.writeFileSync(path.join(OUT, name + ".svg"), s);
  return name;
}

const made = [];

// 1. present simple / present continuous
made.push(svg("tl-present", 360, 210,
  T(18, 24, "Present simple", { size: 14, fill: C.blue, w: 800 }) + T(18, 40, "abitudini e fatti stabili", { size: 11, fill: C.mute }) +
  [40, 80, 120, 160, 200, 240, 280, 320].map((x) => D(x, 62, 6, C.blue)).join("") +
  T(180, 86, "I get up at 7.  She works in a bank.", { size: 11.5, anchor: "middle" }) +
  axis(122) + now(190, 98, 140) + R(150, 110, 80, 24, C.orange, { r: 12, op: 0.92 }) + T(190, 126.5, "I'm working", { size: 12, fill: "#fff", w: 800, anchor: "middle" }) +
  T(18, 178, "Present continuous", { size: 14, fill: C.orange, w: 800 }) + T(18, 194, "adesso, in questo periodo, temporaneo", { size: 11, fill: C.mute }),
  "Present simple e present continuous su una linea del tempo"));

// 2. past simple + past continuous
made.push(svg("tl-past", 360, 200,
  T(18, 24, "Past continuous + past simple", { size: 14, fill: C.ink, w: 800 }) +
  axis(118, 22, 340) + now(312, 96, 122) +
  R(60, 104, 170, 28, C.blue, { r: 14, op: 0.9 }) + T(145, 123, "was walking", { size: 13, fill: "#fff", w: 800, anchor: "middle" }) +
  L(170, 60, 170, 104, { c: C.red, w: 2.5 }) + D(170, 58, 7, C.red) + T(170, 46, "heard a noise", { size: 12.5, fill: C.red, w: 800, anchor: "middle" }) +
  T(18, 160, "Past continuous: l'azione lunga, lo sfondo (stavo camminando)", { size: 11.5, fill: C.blue, w: 700 }) +
  T(18, 178, "Past simple: l'azione breve che interrompe (ho sentito)", { size: 11.5, fill: C.red, w: 700 }),
  "Azione lunga interrotta da un'azione breve"));

// 3. forme di futuro
made.push(svg("tl-future", 360, 210,
  T(18, 24, "Tre modi di parlare del futuro", { size: 14, w: 800 }) +
  [["will", C.blue, "decido adesso / previsione", "I'll help you.  I think it will rain.", 52], ["going to", C.green, "piano o prova evidente", "I'm going to study.", 100], ["present continuous", C.orange, "accordo già organizzato", "I'm meeting Anna at six.", 148]].map(([k, c, a, ex, y]) =>
    R(18, y, 118, 34, c, { r: 17 }) + T(77, y + 22, k, { size: 13, fill: "#fff", w: 800, anchor: "middle" }) +
    L(142, y + 17, 168, y + 17, { c, w: 3 }) + arrowHead(176, y + 17, "r", c) +
    T(186, y + 14, a, { size: 12, w: 700, fill: c }) + T(186, y + 30, ex, { size: 10.5, fill: C.mute })).join("") +
  T(18, 198, "Chiediti: quando ho deciso? l'ho già organizzato?", { size: 11, fill: C.mute, italic: true }),
  "will, going to e present continuous per il futuro"));

// 4. present perfect vs past simple
made.push(svg("tl-perfect", 360, 220,
  T(18, 22, "Present perfect", { size: 14, fill: C.green, w: 800 }) + T(130, 22, "il passato che arriva a oggi", { size: 11, fill: C.mute }) +
  axis(100, 22, 340) + now(296, 78, 104) +
  `<path d="M70 98 C 70 46, 296 46, 296 98" fill="none" stroke="${C.green}" stroke-width="3.5" stroke-linecap="round"/>` + arrowHead(296, 98, "d", C.green) +
  D(70, 100, 6, C.green) + T(70, 122, "since 2019", { size: 11, fill: C.green, w: 700, anchor: "middle" }) +
  T(183, 84, "I have lived here for 5 years.", { size: 12, anchor: "middle", w: 700 }) +
  L(18, 146, 342, 146, { c: "#d3dae1", w: 1.5 }) +
  T(18, 168, "Past simple", { size: 14, fill: C.blue, w: 800 }) + T(104, 168, "finito, con un tempo preciso", { size: 11, fill: C.mute }) +
  R(112, 178, 84, 26, C.blue, { r: 13, op: 0.9 }) + T(154, 196, "yesterday", { size: 12, fill: "#fff", w: 800, anchor: "middle" }) +
  T(212, 196, "I saw her yesterday.", { size: 12, w: 700 }),
  "Present perfect e past simple a confronto"));

// 5. narrative tenses
made.push(svg("tl-narrative", 360, 210,
  T(18, 24, "Raccontare al passato", { size: 14, w: 800 }) +
  axis(88, 22, 340) +
  D(60, 88, 7, C.green) + T(60, 62, "had left", { size: 12.5, fill: C.green, w: 800, anchor: "middle" }) + T(60, 114, "Past perfect", { size: 10.5, fill: C.green, anchor: "middle", w: 700 }) + T(60, 128, "(prima)", { size: 10, fill: C.mute, anchor: "middle" }) +
  D(200, 88, 7, C.blue) + T(200, 62, "arrived", { size: 12.5, fill: C.blue, w: 800, anchor: "middle" }) + T(212, 112, "Past simple", { size: 10.5, fill: C.blue, w: 700 }) +
  L(200, 95, 200, 142, { c: C.blue, w: 1.5, dash: "3 3" }) +
  R(120, 142, 190, 26, C.orange, { r: 13, op: 0.92 }) + T(215, 160, "it was raining", { size: 12.5, fill: "#fff", w: 800, anchor: "middle" }) + T(318, 160, "sfondo", { size: 10, fill: C.mute }) +
  T(18, 190, "When I arrived, it was raining: they had already left.", { size: 11, italic: true }) +
  T(18, 205, "Past perfect = prima  |  past simple = i fatti  |  past continuous = lo sfondo", { size: 9.5, fill: C.mute }),
  "Past perfect, past simple e past continuous nel racconto"));

// 6. periodi ipotetici
const cond = (y, n, c, lt, a, b, ex) => badge(16, y, n, c) + T(54, y + 12, a, { size: 12.5, w: 800, fill: c }) + T(54, y + 28, b, { size: 11.5, fill: C.ink, w: 700 }) + T(54, y + 44, ex, { size: 10.5, fill: C.mute, italic: true }) + chip(262, y + 2, 82, lt, "#fff", c, { size: 10, h: 22 }).replace(`fill="#fff"`, `fill="#fff" stroke="${c}" stroke-width="1.5"`);
made.push(svg("conditionals", 360, 250,
  T(18, 22, "I periodi ipotetici (conditionals)", { size: 14, w: 800 }) +
  cond(34, "0", C.mute, "sempre vero", "if + present", "-> present", "If you heat ice, it melts.") +
  cond(88, "1", C.green, "possibile", "if + present", "-> will + verbo", "If it rains, we'll stay home.") +
  cond(142, "2", C.blue, "irreale (ora)", "if + past simple", "-> would + verbo", "If I had money, I'd buy it.") +
  cond(196, "3", C.purple, "irreale (passato)", "if + past perfect", "-> would have + part. passato", "If I had known, I would have called.").replace("chip", "chip"),
  "I quattro periodi ipotetici"));

// 7. passivo
made.push(svg("passive", 360, 210,
  T(18, 24, "Dalla frase attiva alla passiva", { size: 14, w: 800 }) +
  T(18, 52, "ATTIVA", { size: 10.5, fill: C.mute, w: 800 }) +
  chip(18, 60, 88, "The chef", C.blueL, C.blue, { size: 13 }) + chip(114, 60, 80, "cooks", C.orangeL, C.orange, { size: 13 }) + chip(202, 60, 112, "the meal", C.greenL, C.green, { size: 13 }) +
  `<path d="M258 90 C 258 108, 76 108, 76 124" fill="none" stroke="${C.green}" stroke-width="2.5" stroke-linecap="round"/>` + arrowHead(76, 126, "d", C.green) +
  `<path d="M62 90 C 62 112, 290 112, 290 124" fill="none" stroke="${C.blue}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="5 4"/>` + arrowHead(290, 126, "d", C.blue) +
  T(18, 148, "PASSIVA", { size: 10.5, fill: C.mute, w: 800 }) +
  chip(18, 156, 112, "The meal", C.greenL, C.green, { size: 13 }) + chip(138, 156, 118, "is cooked", C.orangeL, C.orange, { size: 13 }) + chip(264, 156, 84, "by the chef", C.blueL, C.blue, { size: 12 }) +
  T(18, 198, "to be (al tempo giusto) + participio passato; by + chi agisce (se serve)", { size: 10.5, fill: C.mute, italic: true }),
  "Struttura della frase passiva"));

// 8. discorso indiretto
made.push(svg("reported", 360, 236,
  T(18, 22, "Discorso indiretto: i tempi fanno un passo indietro", { size: 13.5, w: 800 }) +
  [["present simple", "past simple", "like -> liked"], ["present continuous", "past continuous", "am working -> was working"], ["present perfect / past simple", "past perfect", "has left -> had left"], ["will", "would", "will call -> would call"], ["can", "could", "can come -> could come"]].map(([a, b, ex], i) => {
    const y = 36 + i * 36;
    return chip(14, y, 144, a, C.blueL, C.blue, { size: 10.5, h: 26 }) + L(164, y + 13, 190, y + 13, { c: C.mute, w: 2.5 }) + arrowHead(198, y + 13, "r", C.mute) + chip(206, y, 138, b, C.orangeL, C.orange, { size: 10.5, h: 26 });
  }).join("") + T(180, 226, "\"I like it\" -> She said she liked it.", { size: 11, italic: true, anchor: "middle" }),
  "Cambio dei tempi nel discorso indiretto"));

// 9. deduzione al presente
const meter = (x, y, w, pct, c) => R(x, y, w, 10, "#dfe5ea", { r: 5 }) + R(x, y, Math.max(8, w * pct / 100), 10, c, { r: 5 });
made.push(svg("modals-certainty", 360, 220,
  T(18, 22, "Quanto sei sicuro? (deduzioni)", { size: 14, w: 800 }) +
  [["must be", 95, C.green, "sono quasi certo che sia così", "He must be at work."], ["may / might / could be", 50, C.orange, "è possibile, non so", "He might be ill."], ["can't be", 4, C.red, "sono quasi certo che NON sia così", "He can't be at home."]].map(([k, p, c, d, ex], i) => {
    const y = 38 + i * 56;
    return T(18, y + 12, k, { size: 14, fill: c, w: 800 }) + meter(190, y + 3, 150, p, c) + T(18, y + 29, d, { size: 11, fill: C.mute }) + T(18, y + 44, ex, { size: 11.5, italic: true });
  }).join("") + T(190, 212, "0%", { size: 9.5, fill: C.mute }) + T(332, 212, "100%", { size: 9.5, fill: C.mute, anchor: "end" }),
  "Must be, might be, can't be: livelli di certezza"));

// 10. obbligo
made.push(svg("modals-obligation", 360, 214,
  T(18, 22, "Obbligo, consiglio, divieto", { size: 14, w: 800 }) +
  [["must / have to", C.red, "è obbligatorio", "You must wear a seat belt.", 36], ["should", C.orange, "è un consiglio", "You should see a doctor.", 74], ["don't have to", C.green, "non è necessario (ma puoi)", "You don't have to pay.", 112], ["mustn't", C.purple, "è vietato", "You mustn't smoke here.", 150]].map(([k, c, d, ex, y]) =>
    chip(18, y, 126, k, c, "#fff", { size: 13, h: 28 }) + T(154, y + 12, d, { size: 12, w: 700, fill: c }) + T(154, y + 27, ex, { size: 10.5, fill: C.mute, italic: true })).join("") +
  T(18, 204, "Attenzione: don't have to ≠ mustn't", { size: 11.5, fill: C.red, w: 800 }),
  "Must, should, don't have to e mustn't"));

// 11. futuro: continuous e perfect
made.push(svg("tl-future-perfect", 360, 210,
  T(18, 24, "Future continuous e future perfect", { size: 14, w: 800 }) +
  axis(110, 22, 340) + now(60, 88, 114) +
  R(170, 98, 60, 24, C.blue, { r: 12, op: 0.9 }) + T(200, 114, "at 8", { size: 12, fill: "#fff", w: 800, anchor: "middle" }) + T(200, 82, "I'll be working", { size: 12, fill: C.blue, w: 800, anchor: "middle" }) +
  L(290, 62, 290, 124, { c: C.green, w: 3 }) + T(290, 52, "by Friday", { size: 12, fill: C.green, w: 800, anchor: "middle" }) +
  `<path d="M70 100 C 120 140, 230 140, 286 104" fill="none" stroke="${C.green}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 6"/>` + arrowHead(290, 102, "d", C.green) +
  T(18, 168, "Future continuous: sarò nel mezzo di un'azione (a quell'ora)", { size: 11.5, fill: C.blue, w: 700 }) +
  T(18, 186, "Future perfect: l'azione sarà già finita (entro quel momento)", { size: 11.5, fill: C.green, w: 700 }) +
  T(18, 202, "I will have finished by Friday.", { size: 11, italic: true }),
  "Future continuous e future perfect"));

// 12. modali del passato
made.push(svg("modals-past", 360, 250,
  T(18, 22, "Modali al passato: cosa è successo?", { size: 14, w: 800 }) +
  [["must have + participio", 95, C.green, "sono sicuro che è successo", "She must have left."], ["might / could have + participio", 50, C.orange, "forse è successo", "She might have forgotten."], ["can't / couldn't have + participio", 4, C.red, "sono sicuro che NON è successo", "She can't have seen us."], ["should have + participio", 0, C.purple, "rimprovero o rimpianto", "You should have called!"]].map(([k, p, c, d, ex], i) => {
    const y = 36 + i * 52;
    return T(18, y + 12, k, { size: 13, fill: c, w: 800 }) + (p ? meter(250, y + 3, 94, p, c) : chip(250, y - 2, 94, "critica", c, "#fff", { size: 11, h: 22 })) + T(18, y + 28, d, { size: 11, fill: C.mute }) + T(18, y + 42, ex, { size: 11, italic: true });
  }).join(""),
  "Must have, might have, can't have, should have"));

// 13. in / on / at
made.push(svg("prep-time", 360, 220,
  T(18, 22, "Preposizioni di tempo: IN > ON > AT", { size: 14, w: 800 }) +
  `<path d="M24 40 L336 40 L296 94 L64 94 Z" fill="${C.blueL}"/>` + `<path d="M64 94 L296 94 L262 138 L98 138 Z" fill="${C.greenL}"/>` + `<path d="M98 138 L262 138 L226 182 L134 182 Z" fill="${C.orangeL}"/>` +
  T(180, 58, "IN", { size: 15, fill: C.blue, w: 900, anchor: "middle" }) + T(180, 76, "mesi, anni, stagioni, secoli", { size: 11, anchor: "middle" }) + T(180, 89, "in May, in 2024, in the morning", { size: 10, fill: C.mute, anchor: "middle", italic: true }) +
  T(180, 111, "ON", { size: 15, fill: C.green, w: 900, anchor: "middle" }) + T(180, 126, "giorni e date: on Monday, on 5 May", { size: 10.5, anchor: "middle" }) +
  T(180, 155, "AT", { size: 15, fill: C.orange, w: 900, anchor: "middle" }) + T(180, 170, "ora esatta: at 7.30, at night", { size: 10.5, anchor: "middle" }) +
  T(18, 208, "Dal periodo più ampio al momento preciso.", { size: 10.5, fill: C.mute, italic: true }),
  "In, on e at per il tempo"));

console.log("schemi:", made.join(", "));
