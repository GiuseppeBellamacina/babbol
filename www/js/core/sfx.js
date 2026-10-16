/* Effetti sonori sintetizzati con WebAudio (nessun file audio da distribuire). */
(function (B) {
  "use strict";
  var ctx = null;

  function ac() {
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { ctx = new C(); } catch (e) { return null; }
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, type, vol) {
    var a = ac(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + start;
    o.type = type || "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function on() { return B.store.settings().sound; }


  B.sfx = {
    ok: function () { if (on()) { tone(660, 0, 0.12, "triangle"); tone(880, 0.09, 0.2, "triangle"); } },
    bad: function () { if (on()) { tone(220, 0, 0.18, "sawtooth", 0.1); tone(165, 0.12, 0.25, "sawtooth", 0.1); } },
    tap: function () { if (on()) tone(520, 0, 0.05, "square", 0.04); },
    win: function () {
      if (!on()) return;
      [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.12, 0.25, "triangle", 0.16); });
    }
  };
})(window.B);
