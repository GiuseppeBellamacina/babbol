/*
 * Insulti "costruttivi" quando si sbaglia. Sceglie in base al tipo di esercizio (3 volte su 4)
 * oppure dal gruppo generico, senza mai ripetere lo stesso due volte di fila.
 */
(function (B) {
  "use strict";
  var last = {};

  function pickFrom(list, key) {
    if (list.length === 1) return list[0];
    var i;
    do { i = Math.floor(Math.random() * list.length); } while (i === last[key]);
    last[key] = i;
    return list[i];
  }

  // tipo di step -> categoria di insulti
  var CAT = { mc: "mc", gap: "mc", dialog: "mc", read: "mc", listen: "mc", cloze: "mc",
    type: "type", transform: "type", wordform: "type", fix: "type", dictation: "type", write: "type",
    order: "order", match: "match", speak: "speak", speakTask: "speak" };

  B.roast = {
    enabled: function () { return B.store.settings().roast !== false; },
    // ritorna [en, it] oppure null se la modalità è spenta
    pick: function (kind) {
      if (!B.roast.enabled()) return null;
      kind = CAT[kind] || "generic";
      var R = B.data.roasts, own = R[kind];
      if (own && own.length && Math.random() < 0.75) return pickFrom(own, kind);
      return pickFrom(R.generic, "generic");
    },
    // blocco DOM: inglese (toccabile per ascoltarlo) + traduzione
    element: function (pair) {
      return B.h("div", { class: "roast", onclick: function () { B.speech.speak(pair[0]); } },
        B.h("div", { class: "roast-en" }, B.icon("speaker", 14, "mini"), " " + pair[0]), B.h("div", { class: "roast-it" }, pair[1]));
    }
  };
})(window.B);
