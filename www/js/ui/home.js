/* Schermata "Percorso": obiettivo di oggi, livelli A2/B1/B2 con le loro unità e la simulazione d'esame. */
(function (B) {
  "use strict";
  var h = B.h, S = B.store, R = B.repo, P = B.path, UI = B.ui, E = B.engine;

  function ring(pct, size, inner) {
    var deg = Math.round(360 * B.clamp(pct, 0, 1));
    return h("div", { class: "ring", style: { width: size + "px", height: size + "px", background: "conic-gradient(var(--accent) " + deg + "deg, var(--line) 0)" } },
      h("div", { class: "ring-in" }, inner));
  }

  // prossima lezione consigliata: la prima non fatta dell'unità corrente (il test per ultimo)
  function nextLesson() {
    var u = P.currentUnit();
    if (!u) return null;
    var ls = R.lessons(u.id);
    return ls.filter(function (l) { return !S.lessonDone(l.id) && l.kind !== "test"; })[0] || ls.filter(function (l) { return l.kind === "test"; })[0] || null;
  }
  function startLesson(l) { B.session.start(E.lessonSession(l.id)); }

  function todayCard() {
    var min = S.minutesToday(), goal = S.get().goal, done = min >= goal;
    var nl = nextLesson();
    var due = S.dueWords().length + E.mistakesCount();
    var card = h("div", { class: "card today" },
      h("div", { class: "today-top" },
        ring(min / goal, 62, done ? B.icon("check", 24) : h("span", { class: "ring-num" }, min + "'")),
        h("div", { class: "grow" },
          h("div", { class: "goal-title" }, done ? "Obiettivo di oggi raggiunto" : "Oggi: " + min + " di " + goal + " minuti"),
          h("div", { class: "muted" }, S.streak() ? "Serie: " + B.pluralize(S.streak(), "giorno", "giorni") : "Inizia la tua serie oggi"))));
    if (nl) {
      var u = R.unit(nl.unit);
      card.appendChild(h("button", { class: "btn primary big", onclick: function () { startLesson(nl); } },
        "CONTINUA: " + (nl.kind === "test" ? "TEST DELL'UNITÀ" : nl.title.toUpperCase())));
      card.appendChild(h("div", { class: "muted small center" }, u.level + " · Unità " + u.position + " · " + u.title + " · circa " + nl.minutes + " min"));
    }
    if (due) {
      card.appendChild(h("button", { class: "btn ghost", onclick: function () { UI.goTab("practice"); } }, B.icon("review", 18), " Ripasso: " + due + " elementi in scadenza"));
    }
    return card;
  }

  function placementCard() {
    if (S.get().placement || Object.keys(S.get().lessons).length || !R.placement()) return null;
    return h("div", { class: "card placement" },
      h("div", { class: "row gap" }, B.icon("compass", 30, "accent"), h("div", { class: "grow" },
        h("div", { class: "goal-title" }, "Da che livello parti?"),
        h("div", { class: "muted" }, "Il test d'ingresso (15-20 minuti) ti fa saltare quello che sai già."))),
      h("div", { class: "row gap" },
        h("button", { class: "btn primary", onclick: function () { B.session.start(E.placementSession()); } }, "FAI IL TEST"),
        h("button", { class: "btn ghost", onclick: function () { S.setPlacement("A2", {}); UI.refresh(); } }, "PARTO DA A2")));
  }

  function unitCard(u, current) {
    var unlocked = P.unitUnlocked(u), passed = P.unitPassed(u), pr = P.unitProgress(u);
    var skipped = !passed && u.index < P.startIndex();
    var cls = "card unit-card" + (passed ? " passed" : "") + (!unlocked ? " locked" : "") + (current ? " current" : "");
    var dots = h("div", { class: "dots" }, R.lessons(u.id).map(function (l) {
      return h("i", { class: S.lessonDone(l.id) ? (l.kind === "test" && !passed ? "half" : "on") : "" });
    }));
    return h("button", { class: cls, style: { "--c": R.level(u.level).color || "var(--accent)" }, onclick: function () {
      if (!unlocked) return UI.alert("Unità bloccata", "Supera il test dell'unità precedente (almeno il 70%) per sbloccarla. Puoi anche fare subito il test di un'unità per saltarla.");
      UI.push(u.level + " · Unità " + u.position, function () { return unitPage(u); });
    } },
      h("div", { class: "unit-num" }, unlocked ? (passed ? B.icon("check", 22) : String(u.position)) : B.icon("lock", 20)),
      h("div", { class: "grow" },
        h("div", { class: "unit-title" }, u.title),
        h("div", { class: "muted small" }, u.grammar),
        h("div", { class: "muted small" }, u.situation),
        dots),
      current ? h("div", { class: "badge-now" }, "ORA") : skipped ? h("div", { class: "badge-skip" }, "facoltativa") : null);
  }

  function examCard(level) {
    var e = R.exam(level);
    if (!e) return null;
    var open = P.examUnlocked(level), res = S.examResult(e.id);
    return h("button", { class: "card exam-card" + (open ? "" : " locked"), onclick: function () {
      if (!open) return UI.alert("Simulazione bloccata", "Si sblocca quando hai superato i test di tutte le unità di " + level + ".");
      UI.push(e.title, function () { return examPage(level); });
    } },
      h("div", { class: "row-icon" }, B.icon(open ? "exam" : "lock", 26)),
      h("div", { class: "grow" }, h("div", { class: "row-title" }, e.title),
        h("div", { class: "muted small" }, res ? "Miglior risultato: " + res.best + "%" : e.parts.length + " parti · circa " + e.parts.reduce(function (a, p) { return a + p.minutes; }, 0) + " minuti")),
      h("div", { class: "chev" }, B.icon("chevron", 18)));
  }

  B.ui.register("home", function () {
    var root = h("div", { class: "home" });
    var pc = placementCard();
    if (pc) root.appendChild(pc);
    root.appendChild(todayCard());
    var cur = P.currentUnit();
    R.LEVELS.forEach(function (lv) {
      var units = R.units(lv);
      if (!units.length) return;
      var L = R.level(lv);
      root.appendChild(h("div", { class: "level-head", style: { "--c": L.color || "var(--accent)" } },
        h("div", { class: "level-badge" }, lv),
        h("div", { class: "grow" }, h("div", { class: "level-title" }, L.title), h("div", { class: "muted small" }, L.sub || "")),
        h("div", { class: "level-prog" }, P.levelPassedUnits(lv) + "/" + units.length)));
      units.forEach(function (u) { root.appendChild(unitCard(u, cur && cur.id === u.id)); });
      var ec = examCard(lv);
      if (ec) root.appendChild(ec);
    });
    if (!R.units().length) root.appendChild(h("div", { class: "card center muted" }, "Contenuti non ancora disponibili: collegati a internet per scaricarli."));
    return root;
  });

  // ---------------------------------------------------------------- pagina dell'unità
  function unitPage(u) {
    var root = h("div", { class: "list" },
      h("div", { class: "card unit-hero", style: { "--c": R.level(u.level).color || "var(--accent)" } },
        h("div", { class: "muted small" }, u.level + " · Unità " + u.position),
        h("h2", null, u.title),
        h("div", { class: "kv" }, h("b", null, "Grammatica: "), u.grammar),
        h("div", { class: "kv" }, h("b", null, "Lessico: "), u.topic),
        h("div", { class: "kv" }, h("b", null, "Situazione: "), u.situation)));
    R.lessons(u.id).forEach(function (l) {
      var best = S.lessonBest(l.id), done = S.lessonDone(l.id), test = l.kind === "test";
      var right = done ? h("div", { class: "score" + (test && best < (l.pass || 70) ? " low" : "") }, best + "%") : null;
      root.appendChild(UI.rowCard(B.KIND_ICON[l.kind], (test ? "" : E.KIND_NAME[l.kind] + ": ") + l.title,
        (test ? "Supera con il " + (l.pass || 70) + "% per sbloccare l'unità successiva · " : "") + "circa " + l.minutes + " min", right,
        function () { startLesson(l); }, test ? "test-row" : done ? "done" : ""));
    });
    root.appendChild(h("p", { class: "muted small center" }, "Ordine consigliato dall'alto in basso. Se l'argomento ti è già chiaro, puoi fare subito il test."));
    return root;
  }

  // ---------------------------------------------------------------- pagina dell'esame
  function examPage(level) {
    var e = R.exam(level), res = S.examResult(e.id);
    var root = h("div", { class: "list" },
      h("div", { class: "card" }, h("h2", { class: "no-top" }, e.title), B.rich(e.intro || ""),
        res ? h("p", { class: "muted" }, "Miglior risultato: " + res.best + "% (" + res.runs + (res.runs === 1 ? " tentativo" : " tentativi") + ")") : null,
        h("button", { class: "btn primary big", onclick: function () { B.session.start(E.examSession(level)); } }, "ESAME COMPLETO")),
      UI.sectionTitle("Allenati su una parte", "Le singole parti non contano per il risultato dell'esame"));
    e.parts.forEach(function (p, i) {
      var pr = res && res.parts && res.parts[p.id];
      root.appendChild(UI.rowCard({ reading: "book", use: "puzzle", listening: "headphones", writing: "pencil", speaking: "mic" }[p.skill] || "exam",
        p.title, p.minutes + " min · " + p.steps.length + (p.steps.length === 1 ? " compito" : " compiti"),
        pr != null ? h("div", { class: "score" }, pr + "%") : null,
        function () { B.session.start(E.examSession(level, i)); }));
    });
    return root;
  }
})(window.B);
