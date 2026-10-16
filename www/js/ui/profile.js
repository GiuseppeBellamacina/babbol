/* Scheda "Profilo": livello stimato, ore, abilità, settimana, traguardi, impostazioni, account. */
(function (B) {
  "use strict";
  var h = B.h, S = B.store, R = B.repo, P = B.path, UI = B.ui, E = B.engine;
  var DAYS = ["D", "L", "M", "M", "G", "V", "S"];

  function hero() {
    var c = P.cefr(), hours = S.hoursTotal();
    var user = B.cloud.user();
    var passed = R.units().filter(P.unitPassed).length, total = R.units().length;
    return h("div", { class: "card hero" },
      h("div", { class: "avatar" }, c.current),
      h("div", { class: "grow" },
        h("div", { class: "goal-title" }, c.reached ? "Livello raggiunto: " + c.reached : "In viaggio verso " + c.current),
        h("div", { class: "muted small" }, user ? user.email : ""),
        h("div", { class: "bar thin" }, h("div", { class: "bar-fill", style: { width: Math.round(100 * passed / Math.max(1, total)) + "%" } })),
        h("div", { class: "muted small" }, passed + "/" + total + " unità superate · " + (hours < 10 ? hours.toFixed(1) : Math.round(hours)) + " ore di studio")));
  }

  function skills() {
    var box = h("div", { class: "card" }, h("h4", { class: "no-top" }, "Le tue abilità (risposte giuste)"));
    S.SKILLS.forEach(function (k) {
      var pct = S.skillPct(k), s = S.get().skills[k];
      box.appendChild(h("div", { class: "skill-row" },
        h("span", { class: "skill-name" }, B.icon(E.SKILLS[k].icon, 16), " " + E.SKILLS[k].name),
        h("div", { class: "bar thin grow" }, h("div", { class: "bar-fill", style: { width: (pct || 0) + "%" } })),
        h("span", { class: "skill-val" }, pct == null ? "-" : pct + "%"),
        h("span", { class: "muted small" }, s ? "(" + s[1] + ")" : "")));
    });
    return box;
  }

  function stats() {
    var s = S.get(), st = s.stats;
    var cells = [
      ["star", s.xp, "XP totali"], ["flame", S.streak(), "Serie attuale"], ["medal", s.bestStreak, "Serie migliore"],
      ["cards", S.seenCount(), "Parole viste"], ["brain", S.masteredCount(), "Parole consolidate"], ["pencil", st.written || 0, "Parole scritte"]
    ];
    return h("div", { class: "stat-grid" }, cells.map(function (c) {
      return h("div", { class: "stat-cell" }, B.icon(c[0], 22, "accent"), h("div", { class: "stat-num" }, c[1]), h("div", { class: "muted small" }, c[2]));
    }));
  }

  function weekChart() {
    var days = S.lastDays(7), goal = S.get().goal;
    var max = Math.max(goal, Math.max.apply(null, days.map(function (d) { return d.min; })));
    var bars = h("div", { class: "chart" });
    days.forEach(function (d, i) {
      var pct = Math.round(100 * d.min / max);
      bars.appendChild(h("div", { class: "chart-col" },
        h("div", { class: "chart-val" }, d.min ? d.min + "'" : ""),
        h("div", { class: "chart-bar-wrap" }, h("div", { class: "chart-bar" + (d.min >= goal ? " hit" : "") + (i === 6 ? " today" : ""), style: { height: Math.max(pct, d.min ? 6 : 0) + "%" } })),
        h("div", { class: "chart-day" }, DAYS[d.date.getDay()])));
    });
    return h("div", { class: "card" }, h("h4", { class: "no-top" }, "Ultimi 7 giorni (minuti di studio)"), bars,
      h("div", { class: "muted center small" }, "Obiettivo: " + goal + " minuti al giorno"));
  }

  function badges() {
    var wrap = h("div", { class: "badges" });
    B.badges.defs.forEach(function (d) {
      var on = S.hasBadge(d.id);
      wrap.appendChild(h("button", { class: "badge" + (on ? " on" : ""), onclick: function () { UI.alert(d.name, d.desc + (on ? "\n\nConquistato." : "")); } },
        B.icon(on ? d.icon : "lock", 26), h("div", { class: "badge-name" }, d.name)));
    });
    return wrap;
  }

  function segmented(options, current, onPick) {
    return h("div", { class: "seg" }, options.map(function (o) {
      return h("button", { class: "seg-b" + (String(o[0]) === String(current) ? " on" : ""), onclick: function () { onPick(o[0]); } }, o[1]);
    }));
  }
  function toggle(label, sub, key) {
    var on = S.settings()[key];
    return h("button", { class: "set-row", onclick: function () { S.setSetting(key, !on); UI.refresh(); } },
      h("div", { class: "grow" }, h("div", { class: "row-title" }, label), sub ? h("div", { class: "muted small" }, sub) : null),
      h("div", { class: "switch" + (on ? " on" : "") }, h("i")));
  }
  function action(label, sub, fn, danger) {
    return h("button", { class: "set-row", onclick: fn },
      h("div", { class: "grow" }, h("div", { class: "row-title" + (danger ? " danger-text" : "") }, label), sub ? h("div", { class: "muted small" }, sub) : null),
      h("div", { class: "chev" }, B.icon("chevron", 18)));
  }

  function settings() {
    var st = S.settings();
    var rate = h("input", { type: "range", min: "0.6", max: "1.2", step: "0.05", value: st.rate, class: "range" });
    rate.addEventListener("change", function () { S.setSetting("rate", parseFloat(rate.value)); });
    return h("div", { class: "card settings" },
      h("div", { class: "set-block" }, h("div", { class: "row-title" }, "Obiettivo giornaliero"),
        segmented([[15, "15'"], [30, "30'"], [60, "1 ora"], [90, "1h30"], [120, "2 ore"]], S.get().goal, function (v) { S.setGoal(v); UI.refresh(); }),
        h("div", { class: "muted small" }, "Da A2 a B2 servono circa 300-400 ore: 1 ora al giorno = 10-12 mesi, 2 ore = circa 6 mesi.")),
      h("div", { class: "set-block" }, h("div", { class: "row-title" }, "Accento principale della voce"),
        segmented([["en-GB", "Britannico"], ["en-US", "Americano"]], st.accent, function (v) { S.setSetting("accent", v); B.speech.speak("Hello, nice to meet you."); UI.refresh(); }),
        h("div", { class: "muted small" }, "Nei dialoghi le voci si alternano tra i due accenti.")),
      h("div", { class: "set-block" }, h("div", { class: "row-title" }, "Velocità della voce"), rate,
        h("div", { class: "row between muted small" }, h("span", null, "Lenta"), h("span", null, "Naturale")),
        h("button", { class: "btn ghost small", onclick: function () { B.speech.speak("The quick brown fox jumps over the lazy dog."); } }, B.icon("speaker", 16), " Prova la voce")),
      h("div", { class: "set-block" }, h("div", { class: "row-title" }, "Tema"),
        segmented([["auto", "Auto"], ["light", "Chiaro"], ["dark", "Scuro"]], st.theme, function (v) { S.setSetting("theme", v); UI.applyTheme(); UI.refresh(); })),
      toggle("Insulti quando sbagli", "In inglese, volgari, con traduzione e consiglio", "roast"),
      toggle("Effetti sonori", "Suoni per risposte giuste e sbagliate", "sound"),
      toggle("Sblocca tutto", "Tutte le unità e gli esami accessibili subito", "unlockAll"));
  }

  function startLevel() {
    var pl = S.get().placement;
    return h("div", { class: "card settings" },
      h("div", { class: "set-block" }, h("div", { class: "row-title" }, "Livello di partenza"),
        segmented([["A2", "A2"], ["B1", "B1"], ["B2", "B2"]], pl ? pl.level : "A2", function (v) { S.setPlacement(v, pl ? pl.scores : {}); UI.refresh(); }),
        h("div", { class: "muted small" }, "Le unità prima del livello di partenza restano aperte e facoltative.")),
      R.placement() ? action("Rifai il test d'ingresso", pl && pl.scores && pl.scores.A2 != null ? "Ultimo: " + Object.keys(pl.scores).map(function (k) { return k + " " + pl.scores[k] + "%"; }).join(", ") : null,
        function () { B.session.start(E.placementSession()); }) : null);
  }

  function account() {
    return h("div", { class: "card settings" },
      action("Esci", "I progressi restano salvati sul tuo account", function () {
        UI.confirm({ title: "Vuoi uscire?", text: "Al prossimo accesso ritroverai tutti i progressi.", ok: "ESCI", cancel: "ANNULLA" }).then(function (y) {
          if (!y) return;
          B.cloud.signOut().catch(function (e) {
            if (e.code !== "unsynced") return UI.alert("Errore", e.message);
            UI.confirm({ title: "Progressi non salvati", text: e.message + " Se esci ora li perderai. Riprova quando sei online.", ok: "ESCI COMUNQUE", cancel: "RESTA", danger: true })
              .then(function (force) { if (force) B.cloud.signOut(true); });
          });
        });
      }),
      action("Azzera i progressi", "Ricomincia da capo (le impostazioni restano)", function () {
        UI.confirm({ title: "Azzerare tutto?", text: "Perderai XP, serie, lezioni, esami e ripasso, anche sul server.", ok: "AZZERA", cancel: "ANNULLA", danger: true })
          .then(function (y) { if (y) { S.reset(); B.cloud.sync(true).catch(function () {}); UI.toast("Progressi azzerati"); UI.refresh(true); } });
      }, true),
      action("Elimina l'account", "Cancella definitivamente account e progressi", function () {
        UI.confirm({ title: "Eliminare l'account?", text: "L'operazione è definitiva: account e progressi verranno cancellati dal server.", ok: "ELIMINA", cancel: "ANNULLA", danger: true })
          .then(function (y) {
            if (!y) return;
            B.cloud.deleteAccount().then(function () { UI.toast("Account eliminato"); }, function (e) { UI.alert("Impossibile eliminare l'account", e.message + " Riprova con la connessione attiva."); });
          });
      }, true));
  }

  UI.register("profile", function () {
    var root = h("div", { class: "list profile" });
    root.appendChild(hero());
    root.appendChild(skills());
    root.appendChild(weekChart());
    root.appendChild(stats());
    root.appendChild(UI.sectionTitle("Traguardi", Object.keys(S.get().badges).length + " / " + B.badges.defs.length));
    root.appendChild(badges());
    root.appendChild(UI.sectionTitle("Impostazioni"));
    root.appendChild(settings());
    root.appendChild(UI.sectionTitle("Percorso"));
    root.appendChild(startLevel());
    root.appendChild(UI.sectionTitle("Account"));
    root.appendChild(account());
    root.appendChild(h("p", { class: "muted center small" }, "Babbol " + B.VERSION + " · contenuti rev. " + R.rev() + " · " + R.units().length + " unità, " + R.allWords().length + " parole"));
    return root;
  });
})(window.B);
