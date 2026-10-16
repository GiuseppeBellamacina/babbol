/* Traguardi (badge). check() assegna quelli appena raggiunti e li restituisce. Icone: nomi di B.icon. */
(function (B) {
  "use strict";
  var S = B.store;
  function passedUnits() { return B.repo.units().filter(B.path.unitPassed).length; }
  function examPassed(lv) { return B.path.examPassed(lv); }

  var DEFS = [
    { id: "first_lesson", icon: "seed", name: "Primo passo", desc: "Completa la tua prima lezione", test: function () { return Object.keys(S.get().lessons).length >= 1; } },
    { id: "unit_1", icon: "flag", name: "Prima unità", desc: "Supera il test di un'unità", test: function () { return passedUnits() >= 1; } },
    { id: "units_5", icon: "path", name: "In cammino", desc: "Supera 5 unità", test: function () { return passedUnits() >= 5; } },
    { id: "units_15", icon: "compass", name: "A metà strada", desc: "Supera 15 unità", test: function () { return passedUnits() >= 15; } },
    { id: "exam_a2", icon: "medal", name: "A2 Key", desc: "Supera la simulazione A2", test: function () { return examPassed("A2"); } },
    { id: "exam_b1", icon: "medal", name: "B1 Preliminary", desc: "Supera la simulazione B1", test: function () { return examPassed("B1"); } },
    { id: "exam_b2", icon: "trophy", name: "B2 First", desc: "Supera la simulazione B2", test: function () { return examPassed("B2"); } },
    { id: "streak_7", icon: "flame", name: "Una settimana", desc: "Studia 7 giorni di fila", test: function () { return S.get().bestStreak >= 7; } },
    { id: "streak_30", icon: "flame", name: "Un mese", desc: "Studia 30 giorni di fila", test: function () { return S.get().bestStreak >= 30; } },
    { id: "streak_100", icon: "rocket", name: "Cento giorni", desc: "Studia 100 giorni di fila", test: function () { return S.get().bestStreak >= 100; } },
    { id: "hours_10", icon: "clock", name: "10 ore", desc: "Studia per 10 ore in totale", test: function () { return S.hoursTotal() >= 10; } },
    { id: "hours_100", icon: "clock", name: "100 ore", desc: "Studia per 100 ore in totale", test: function () { return S.hoursTotal() >= 100; } },
    { id: "words_300", icon: "cards", name: "Vocabolario", desc: "Incontra 300 parole", test: function () { return S.seenCount() >= 300; } },
    { id: "mastered_200", icon: "brain", name: "Memoria di ferro", desc: "Consolida 200 parole nel ripasso", test: function () { return S.masteredCount() >= 200; } },
    { id: "speaker", icon: "mic", name: "Voce sicura", desc: "Pronuncia bene 50 frasi", test: function () { return (S.get().stats.spoken || 0) >= 50; } },
    { id: "writer", icon: "pencil", name: "Penna sciolta", desc: "Scrivi 2000 parole in inglese", test: function () { return (S.get().stats.written || 0) >= 2000; } }
  ];

  B.badges = {
    defs: DEFS,
    check: function () {
      var fresh = [];
      DEFS.forEach(function (d) {
        if (!S.hasBadge(d.id) && d.test()) { S.giveBadge(d.id); fresh.push(d); }
      });
      return fresh;
    }
  };
})(window.B);
