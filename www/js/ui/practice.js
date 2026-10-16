/* Scheda "Ripasso": ripetizione spaziata, esercizi sbagliati, allenamento per abilità. */
(function (B) {
  "use strict";
  var h = B.h, S = B.store, E = B.engine, UI = B.ui;

  function start(cfg, emptyMsg) {
    if (cfg) B.session.start(cfg);
    else UI.alert("Niente da fare qui", emptyMsg);
  }

  UI.register("practice", function () {
    var root = h("div", { class: "list" });
    var due = S.dueWords().length, mistakes = E.mistakesCount();

    root.appendChild(h("div", { class: "card review-hero" },
      h("div", { class: "row gap" }, B.icon("brain", 34, "accent"), h("div", { class: "grow" },
        h("div", { class: "goal-title" }, due ? due + (due === 1 ? " parola da ripassare" : " parole da ripassare") : "Memoria in ordine"),
        h("div", { class: "muted" }, "Ripetizione spaziata: le parole sbagliate tornano subito, quelle sapute dopo 1, 3, 7, 14, 30 e 60 giorni."))),
      h("button", { class: "btn primary big", onclick: function () {
        start(E.reviewSession(!due && !mistakes), "Non hai ancora incontrato parole: inizia una lezione di lessico nel Percorso.");
      } }, due || mistakes ? "RIPASSA ORA" : "RIPASSO EXTRA")));

    root.appendChild(UI.rowCard("x", "I tuoi errori", mistakes ? mistakes + " esercizi sbagliati da rifare" : "Nessun errore da rifare: ottimo.",
      mistakes ? h("div", { class: "score low" }, String(mistakes)) : null,
      function () { start(E.mistakesSession(), "Gli esercizi che sbagli nelle lezioni finiscono qui, finché non li rifai giusti."); }));

    root.appendChild(UI.sectionTitle("Allenati per abilità", "10 esercizi dalle unità che hai sbloccato"));
    var grid = h("div", { class: "skill-grid" });
    S.SKILLS.forEach(function (k) {
      var sk = E.SKILLS[k], pct = S.skillPct(k);
      grid.appendChild(h("button", { class: "card skill", onclick: function () {
        start(E.skillSession(k), "Non ci sono ancora esercizi di questo tipo nelle unità sbloccate.");
      } },
        B.icon(sk.icon, 30, "accent"),
        h("div", { class: "row-title" }, sk.name),
        h("div", { class: "muted small" }, sk.desc),
        h("div", { class: "skill-pct" }, pct == null ? "-" : pct + "%")));
    });
    root.appendChild(grid);
    return root;
  });
})(window.B);
