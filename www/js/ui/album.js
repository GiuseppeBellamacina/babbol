/*
 * Collezione di creature: scatole a sorpresa, album e carta di una creatura.
 * La creatura di una scatola dipende SOLO dal numero d'ordine della scatola (rewards.boxes): stessa scatola = stessa creatura su ogni telefono.
 * Le garanzie (pity) sono sul numero d'ordine: ogni 5 scatole almeno non comune, 12 raro, 25 epico, 60 leggendario, 150 mitico.
 */
(function (B) {
  "use strict";
  var h = B.h, S = B.store, UI = B.ui;
  var LIST = B.data.animals, RAR = B.data.rarities;
  var BY_ID = {}; LIST.forEach(function (a) { BY_ID[a.id] = a; });
  // strizzate d'occhio alla cultura pop (per il traguardo dedicato)
  var POP = ["chicken", "horse", "owl", "stag", "eagle", "spider", "mammoth", "penguin", "trex", "dragon", "robot", "mirror-ball", "ring", "parrot", "shark", "sloth",
    "wolf", "phoenix", "alien", "fairy", "wizard", "ogre", "volcano", "turtle", "lion", "bear", "clownfish", "snake", "troll", "elf"];
  var PITY = [[150, 5], [60, 4], [25, 3], [12, 2], [5, 1]];

  function pickAt(i) {
    var r = B.missions.rng("box:" + i), n = i + 1, tier = 0, x = r() * 100, acc = 0, min = 0, k;
    for (k = 0; k < RAR.length; k++) { acc += RAR[k].w; if (x < acc) { tier = k; break; } tier = k; }
    for (k = 0; k < PITY.length; k++) if (n % PITY[k][0] === 0) { min = PITY[k][1]; break; }
    tier = Math.max(tier, min);
    var pool = LIST.filter(function (a) { return a.r === tier; });
    return pool[Math.floor(r() * pool.length)];
  }

  function owned() { return S.get().rewards.animals; }
  function ownedCount() { return Object.keys(owned()).filter(function (id) { return BY_ID[id]; }).length; }

  // ---------------------------------------------------------------- carta
  function card(a, opts) {
    opts = opts || {};
    var n = (owned()[a.id] || {}).n || 0, rar = RAR[a.r];
    var c = h("div", { class: "ccard r" + a.r + (opts.big ? " big" : "") });
    c.style.setProperty("--rc", rar.color);
    if (a.r === 5) for (var i = 0; i < 7; i++) c.appendChild(h("i", { class: "spark s" + i }));
    c.appendChild(h("div", { class: "c-rar" }, rar.name));
    c.appendChild(h("img", { class: "c-img", src: "img/a/" + a.id + ".svg", alt: a.en }));
    c.appendChild(h("div", { class: "c-name" }, a.en));
    c.appendChild(h("div", { class: "ipa" }, "/" + a.ipa + "/"));
    c.appendChild(h("div", { class: "muted" }, a.it));
    if (opts.big) {
      c.appendChild(h("div", { class: "c-fact" }, a.f[0], h("div", { class: "muted small" }, a.f[1])));
      if (opts.dup != null) c.appendChild(h("div", { class: "c-dup" }, opts.dup ? "Doppione: +" + rar.refund + " gettoni" : "Nuova creatura!"));
      else if (n > 1) c.appendChild(h("div", { class: "muted small" }, "Ne hai " + n));
    }
    return c;
  }

  // ---------------------------------------------------------------- scatola
  function canOpen() { return B.missions.balance() >= B.missions.BOX_COST; }

  function openBox() {
    if (!canOpen()) return UI.alert("Gettoni insufficienti", "Servono " + B.missions.BOX_COST + " gettoni: completa le missioni e riscatta i premi.");
    var idx = S.get().rewards.boxes, a = pickAt(idx), dup = !!owned()[a.id];
    S.openedBox(a.id);
    B.badges.check();
    var stage = h("div", { class: "reveal" }, h("div", { class: "gift-box" }, "🎁"));
    var again = canOpen();
    var p = UI.modal({ title: "Scatola a sorpresa", body: stage, center: true, buttons: [
      again ? { label: "APRI UN'ALTRA (" + Math.floor(B.missions.balance() / B.missions.BOX_COST) + ")", value: "again", cls: "ghost" } : null,
      { label: "OK", value: true, cls: "primary" }
    ].filter(Boolean) });
    setTimeout(function () {
      stage.innerHTML = "";
      stage.appendChild(card(a, { big: true, dup: dup }));
      B.sfx.rare(a.r);
      B.speech.speak(a.en);
      stage.className = "reveal done";
    }, 1100);
    return p.then(function (v) { UI.refresh(); if (v === "again") return openBox(); });
  }

  // ---------------------------------------------------------------- album
  function albumPage() {
    var root = h("div", { class: "list" });
    var rw = S.get().rewards, got = ownedCount();
    root.appendChild(h("div", { class: "card album-head" },
      h("div", { class: "goal-title" }, got + " / " + LIST.length + " creature trovate"),
      h("div", { class: "bar thin" }, h("div", { class: "bar-fill", style: { width: Math.round(100 * got / LIST.length) + "%" } })),
      h("div", { class: "rar-row" }, RAR.map(function (r, i) {
        var all = LIST.filter(function (a) { return a.r === i; }), mine = all.filter(function (a) { return owned()[a.id]; }).length;
        return h("div", { class: "rar-chip", style: { "--rc": r.color } }, h("b", null, mine + "/" + all.length), h("span", null, r.name));
      })),
      h("div", { class: "muted small" }, B.pluralize(rw.boxes, "scatola aperta", "scatole aperte") + " · " + B.missions.balance() + " gettoni"),
      h("button", { class: "btn primary big", onclick: function () { openBox(); } }, "APRI UNA SCATOLA (" + B.missions.BOX_COST + " gettoni)")));
    var grid = h("div", { class: "album-grid" });
    LIST.slice().sort(function (a, b) { return a.r - b.r; }).forEach(function (a) {
      var mine = owned()[a.id], rar = RAR[a.r];
      grid.appendChild(h("button", { class: "mini r" + a.r + (mine ? "" : " locked"), style: { "--rc": rar.color }, onclick: function () {
        if (!mine) return UI.toast("Non l'hai ancora trovata: " + rar.name.toLowerCase());
        B.speech.speak(a.en);
        UI.modal({ title: "", body: card(a, { big: true }), center: true, buttons: [{ label: "OK", value: true, cls: "primary" }] });
      } },
        h("img", { src: "img/a/" + a.id + ".svg", alt: "" }),
        h("div", { class: "mini-name" }, mine ? a.en : "???"),
        mine && mine.n > 1 ? h("span", { class: "mini-n" }, "x" + mine.n) : null));
    });
    root.appendChild(grid);
    return root;
  }

  B.album = {
    list: LIST, byId: BY_ID, pop: POP, owned: owned, count: ownedCount,
    refund: function (id) { return BY_ID[id] ? RAR[BY_ID[id].r].refund : 0; },
    pickAt: pickAt, card: card, openBox: openBox, canOpen: canOpen,
    page: function () { UI.push("Album", albumPage); }
  };
})(window.B);
