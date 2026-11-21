/* Pagina «Missioni» (giorno, settimana, mese), regalo di benvenuto, e card nella schermata del percorso. */
(function (B) {
  "use strict";
  var h = B.h, S = B.store, UI = B.ui, M = B.missions;
  var tab = "d";
  var NAMES = { d: "Oggi", w: "Settimana", m: "Mese" };
  var RESET = { d: "Si rinnovano ogni giorno", w: "Si rinnovano ogni lunedì", m: "Si rinnovano il primo del mese" };

  function row(m) {
    var pct = Math.round(100 * m.value / m.target);
    var right = m.claimed ? h("div", { class: "m-done" }, B.icon("check", 22))
      : m.done ? h("button", { class: "btn primary m-claim", onclick: function () { if (M.claim(m)) { B.sfx.win(); UI.toast("+" + m.reward + " gettoni"); B.badges.check(); UI.refresh(); } } }, "RISCATTA +" + m.reward)
      : h("div", { class: "m-reward" }, "+" + m.reward);
    return h("div", { class: "card mission" + (m.claimed ? " claimed" : "") + (m.bonus ? " bonus" : "") },
      h("div", { class: "row-icon" }, B.icon(m.icon, 24)),
      h("div", { class: "grow" },
        h("div", { class: "row-title" }, m.title),
        h("div", { class: "bar thin" }, h("div", { class: "bar-fill", style: { width: pct + "%" } })),
        h("div", { class: "muted small" }, m.value + " / " + m.target)),
      right);
  }

  function page() {
    var root = h("div", { class: "list" }), rw = S.get().rewards, first = !rw.gift;
    if (first) S.takeGift();
    var bal = M.balance();
    if (first) root.appendChild(h("div", { class: "banner gold" }, B.icon("star", 20), " Regalo di benvenuto: " + M.GIFT_COINS + " gettoni, cioè " + (M.GIFT_COINS / M.BOX_COST) + " scatole a sorpresa!"));
    root.appendChild(h("div", { class: "card coins" },
      h("div", { class: "coin-num" }, B.icon("star", 26, "accent"), " " + bal, h("span", { class: "muted small" }, " gettoni")),
      h("div", { class: "row gap" },
        h("button", { class: "btn primary grow", onclick: function () { B.album.openBox(); } }, "APRI SCATOLA (" + M.BOX_COST + ")"),
        h("button", { class: "btn ghost grow", onclick: function () { B.album.page(); } }, "ALBUM " + B.album.count() + "/" + B.album.list.length))));
    root.appendChild(h("div", { class: "seg" }, ["d", "w", "m"].map(function (k) {
      return h("button", { class: "seg-b" + (tab === k ? " on" : ""), onclick: function () { tab = k; UI.refresh(); } }, NAMES[k]);
    })));
    root.appendChild(h("div", { class: "muted small center" }, RESET[tab] + ". Completa, riscatta e usa i gettoni per aprire scatole."));
    M.list(tab).forEach(function (m) { root.appendChild(row(m)); });
    return root;
  }

  // card nella schermata del percorso
  B.missionsCard = function () {
    var d = M.list("d").filter(function (m) { return !m.bonus; }), pend = M.pending().length;
    var done = d.filter(function (m) { return m.done; }).length;
    return h("button", { class: "card row-card mission-card", onclick: function () { UI.push("Missioni", page); } },
      h("div", { class: "row-icon" }, B.icon("target", 26)),
      h("div", { class: "grow" },
        h("div", { class: "row-title" }, "Missioni di oggi"),
        h("div", { class: "dots" }, d.map(function (m) { return h("i", { class: m.done ? "on" : "" }); })),
        h("div", { class: "muted small" }, done + "/" + d.length + " fatte · " + M.balance() + " gettoni")),
      pend ? h("div", { class: "score" }, String(pend)) : h("div", { class: "chev" }, B.icon("chevron", 18)));
  };
  B.missionsPage = page;
})(window.B);
