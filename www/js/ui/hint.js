/*
 * Pannelli "a scomparsa" usati negli esercizi:
 *  - B.ui.hintSheet(unitId, kind): suggerimento con la grammatica, le parole e le frasi utili dell'unità
 *  - B.ui.speedSheet(sample) / B.ui.speedControls(): regolazione della velocità della voce (normale e tartaruga)
 * B.noteCard(nota) disegna una scheda di teoria (la usa anche la pagina Risorse).
 */
(function (B) {
  "use strict";
  var h = B.h, R = B.repo, UI = B.ui;

  // ---------------------------------------------------------------- scheda di teoria
  B.noteCard = function (n) {
    var card = h("div", { class: "card note-card" }, h("h3", null, n.title), B.rich(n.body));
    if (n.svg) card.appendChild(h("img", { class: "note-svg", src: "img/g/" + n.svg + ".svg", alt: n.title }));
    if (n.table) {
      var t = h("table", { class: "gtable" });
      n.table.forEach(function (row, i) { t.appendChild(h("tr", null, row.map(function (c) { return h(i === 0 ? "th" : "td", null, c); }))); });
      card.appendChild(h("div", { class: "table-wrap" }, t));
    }
    if (n.ex) card.appendChild(h("div", { class: "examples" }, n.ex.map(function (p) { return UI.speakable(p[0], p[1], "ex"); })));
    return card;
  };

  function notesOf(lessonId) {
    var l = R.lesson(lessonId);
    return l ? l.steps.filter(function (s) { return s.t === "note"; }) : [];
  }

  function wordRow(w) {
    return h("button", { class: "hint-word", onclick: function () { B.speech.speak(w.en); } },
      B.hasPic(w) ? B.pic(w, "hint-pic") : null,
      h("div", { class: "grow" },
        h("div", { class: "word-en" }, w.en, " ", h("span", { class: "word-pos" }, w.pos || ""), " ", B.icon("speaker", 14, "mini")),
        h("div", { class: "word-ipa" }, "/" + w.ipa + "/"),
        h("div", { class: "word-it" }, w.it),
        B.synLine(w),
        w.note ? h("div", { class: "word-note" }, w.note) : null,
        w.ex ? h("div", { class: "hint-ex" }, w.ex[0], h("div", { class: "muted small" }, w.ex[1])) : null));
  }

  /**
   * Suggerimento dentro una lezione: tre schede.
   *  Grammatica = le note della lezione di grammatica dell'unità; Parole = il lessico con traduzione ed esempio d'uso;
   *  Frasi utili = le note delle lezioni "situazione" e "scrittura e parlato".
   */
  UI.hintSheet = function (unitId, kind) {
    var tabs = [
      { id: "grammar", label: "Grammatica", render: function () { var n = notesOf(unitId + "-grammar"); return n.length ? n.map(B.noteCard) : [h("p", { class: "muted" }, "Nessuna scheda di grammatica per questa unità.")]; } },
      { id: "words", label: "Parole", render: function () {
        var l = R.lesson(unitId + "-vocab");
        var ws = (l && l.words) || [];
        return ws.length ? ws.map(wordRow) : [h("p", { class: "muted" }, "Nessuna parola per questa unità.")];
      } },
      { id: "phrases", label: "Frasi utili", render: function () {
        var n = notesOf(unitId + "-situation").concat(notesOf(unitId + "-production"));
        return n.length ? n.map(B.noteCard) : [h("p", { class: "muted" }, "Nessuna frase utile per questa unità.")];
      } }
    ];
    var cur = kind === "vocab" ? "words" : (kind === "situation" || kind === "production") ? "phrases" : "grammar";
    var body = h("div", { class: "hint" }), seg = h("div", { class: "seg" }), content = h("div", { class: "hint-body" });
    function draw() {
      seg.innerHTML = ""; content.innerHTML = "";
      tabs.forEach(function (t) {
        seg.appendChild(h("button", { class: "seg-b" + (t.id === cur ? " on" : ""), onclick: function () { cur = t.id; draw(); } }, t.label));
      });
      tabs.filter(function (t) { return t.id === cur; })[0].render().forEach(function (n) { content.appendChild(n); });
      content.scrollTop = 0;
    }
    body.appendChild(seg); body.appendChild(content);
    draw();
    var u = R.unit(unitId);
    return UI.modal({ icon: "bulb", title: "Suggerimento" + (u ? ": " + u.title : ""), body: body, tall: true, buttons: [{ label: "TORNA ALL'ESERCIZIO", value: true, cls: "primary" }] });
  };

  // ---------------------------------------------------------------- velocità della voce
  // Tre regolatori: voce normale (0.6-1.4), "tartaruga" (0.25-0.9) e pausa tra le parole della tartaruga (0-800 ms).
  UI.speedControls = function (sample) {
    var S = B.store, st = S.settings();
    sample = sample || "The quick brown fox jumps over the lazy dog.";
    function slider(label, key, min, max, def, test, opt) {
      opt = opt || {};
      var cur = st[key] == null ? def : st[key];
      var val = h("span", { class: "speed-val" }), inp = h("input", { type: "range", min: String(min), max: String(max), step: String(opt.step || 0.05), value: cur, class: "range" });
      function show() { val.textContent = opt.ms ? Math.round(inp.value) + " ms" : parseFloat(inp.value).toFixed(2) + "x"; }
      // la velocità vale subito: un ascolto in corso riparte dalla frase corrente con la nuova velocità
      inp.addEventListener("input", function () { show(); S.setSetting(key, parseFloat(inp.value)); B.speech.refresh(); });
      show();
      return h("div", { class: "set-block" },
        h("div", { class: "row between" }, h("div", { class: "row-title" }, label), val), inp,
        h("div", { class: "row between muted small" }, h("span", null, opt.lo || "Più lenta"), h("span", null, opt.hi || "Più veloce")),
        h("button", { class: "btn ghost small", onclick: function () { S.setSetting(key, parseFloat(inp.value)); test(); } }, B.icon("speaker", 16), " Prova"));
    }
    return h("div", { class: "speed" },
      slider("Voce normale", "rate", 0.6, 1.4, 0.95, function () { B.speech.speak(sample); }),
      slider("Tartaruga: velocità di ogni parola", "slowRate", 0.25, 0.9, 0.55, function () { B.speech.slow(sample); }),
      slider("Tartaruga: pausa tra le parole", "slowGap", 0, 800, 350, function () { B.speech.slow(sample); }, { ms: true, step: 50, lo: "Parole attaccate", hi: "Molto staccate" }),
      h("p", { class: "muted small" }, "La tartaruga dice una parola alla volta, con una pausa in mezzo (più lunga dopo virgola e punto): le parole restano ben staccate anche se il telefono ignora la velocità."));
  };
  UI.speedSheet = function (sample) {
    return UI.modal({ icon: "speed", title: "Velocità della voce", body: UI.speedControls(sample), buttons: [{ label: "FATTO", value: true, cls: "primary" }] });
  };
})(window.B);
