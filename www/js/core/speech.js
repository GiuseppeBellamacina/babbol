/*
 * Voce: sintesi (TTS) e riconoscimento.
 *
 * Su Android usa il ponte nativo `AndroidBridge` (TextToSpeech + RecognizerIntent), gratuito e offline se la voce è installata.
 * Nel browser (test/sviluppo) ripiega su speechSynthesis / webkitSpeechRecognition.
 * Ogni funzione degrada con grazia: se la voce non c'è, l'app resta usabile.
 */
(function (B) {
  "use strict";

  var native = window.AndroidBridge || null;
  var pendingListen = null;
  var doneCbs = {}, seq = 0;

  // Il ponte nativo chiama questa funzione con l'esito del riconoscimento:
  // json = {"ok":true,"results":["..."]} oppure {"ok":false,"error":"cancelled|unavailable|..."}
  window.__onSpeech = function (json) {
    var cb = pendingListen; pendingListen = null;
    if (!cb) return;
    var r;
    try { r = typeof json === "string" ? JSON.parse(json) : json; } catch (e) { r = { ok: false, error: "parse" }; }
    if (r.ok) cb.resolve(r.results || []); else cb.reject(new Error(r.error || "error"));
  };
  // fine di una sequenza di frasi (dialoghi): chiamata dal ponte nativo con l'id dell'ultima frase
  window.__onTtsDone = function (id) { var f = doneCbs[id]; delete doneCbs[id]; if (f) f(); };

  function pickWebVoice(lang) {
    if (!window.speechSynthesis) return null;
    var voices = speechSynthesis.getVoices();
    return voices.filter(function (v) { return v.lang === lang; })[0] ||
           voices.filter(function (v) { return v.lang.replace("_", "-") === lang; })[0] ||
           voices.filter(function (v) { return v.lang.indexOf("en") === 0; })[0] || null;
  }
  function webUtter(text, lang, rate, pitch) {
    var u = new SpeechSynthesisUtterance(String(text));
    u.lang = lang; u.rate = rate; u.pitch = pitch || 1;
    var v = pickWebVoice(lang);
    if (v) u.voice = v;
    return u;
  }
  function other(accent) { return accent === "en-US" ? "en-GB" : "en-US"; }

  var Speech = B.speech = {
    isNative: !!native,
    canSpeak: function () { return !!native || !!window.speechSynthesis; },

    speak: function (text, opts) {
      opts = opts || {};
      var st = B.store.settings();
      var rate = opts.rate || st.rate || 0.95, lang = opts.lang || st.accent || "en-GB", pitch = opts.pitch || 1;
      if (native) {
        try {
          if (native.speakVoice) native.speakVoice(String(text), lang, rate, pitch, "", false);
          else native.speak(String(text), lang, rate);
        } catch (e) { console.error(e); }
        return;
      }
      if (!window.speechSynthesis) return;
      speechSynthesis.cancel();
      speechSynthesis.speak(webUtter(text, lang, rate, pitch));
    },
    slow: function (text) { Speech.speak(text, { rate: 0.6 }); },

    /** Voce per lo speaker n-esimo di un dialogo: accento e tono alternati, così si distinguono. */
    voiceFor: function (n) {
      var acc = B.store.settings().accent || "en-GB";
      var V = [{ lang: acc, pitch: 1.0 }, { lang: other(acc), pitch: 0.82 }, { lang: acc, pitch: 1.22 }, { lang: other(acc), pitch: 0.7 }];
      return V[n % V.length];
    },

    /**
     * Legge un dialogo/monologo: lines = [[speaker, testo], ...]. onDone() alla fine (se il motore lo segnala).
     * opts.rate per rallentare.
     */
    playLines: function (lines, onDone, opts) {
      opts = opts || {};
      var st = B.store.settings(), rate = opts.rate || st.rate || 0.95;
      var speakers = [];
      lines.forEach(function (l) { if (speakers.indexOf(l[0]) < 0) speakers.push(l[0]); });
      Speech.stop();
      var id = "seq" + (++seq);
      if (onDone) doneCbs[id] = onDone;
      if (native) {
        try {
          lines.forEach(function (l, i) {
            var v = Speech.voiceFor(speakers.indexOf(l[0]));
            var last = i === lines.length - 1;
            if (native.speakVoice) native.speakVoice(String(l[1]), v.lang, rate, v.pitch, last ? id : "", true);
            else native.speakQueued(String(l[1]), v.lang, rate);
          });
          if (!native.speakVoice && onDone) setTimeout(function () { window.__onTtsDone(id); }, 400 * lines.join(" ").length / 6);
        } catch (e) { console.error(e); }
        return;
      }
      if (!window.speechSynthesis) { if (onDone) setTimeout(function () { window.__onTtsDone(id); }, 50); return; }
      lines.forEach(function (l, i) {
        var v = Speech.voiceFor(speakers.indexOf(l[0]));
        var u = webUtter(l[1], v.lang, rate, v.pitch);
        if (i === lines.length - 1) { u.onend = function () { window.__onTtsDone(id); }; u.onerror = u.onend; }
        speechSynthesis.speak(u);
      });
    },
    stop: function () {
      doneCbs = {};
      try { if (native) native.stopSpeaking(); else if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* ignorato */ }
    },

    canListen: function () {
      return !!native || !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    },
    // Ritorna una Promise con le trascrizioni candidate (array di stringhe).
    listen: function () {
      var lang = B.store.settings().accent || "en-GB";
      return new Promise(function (resolve, reject) {
        if (native) {
          pendingListen = { resolve: resolve, reject: reject };
          try { native.listen(lang); } catch (e) { pendingListen = null; reject(e); }
          return;
        }
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) return reject(new Error("unavailable"));
        var r = new SR();
        r.lang = lang; r.maxAlternatives = 5; r.interimResults = false;
        r.onresult = function (ev) {
          var out = [];
          for (var i = 0; i < ev.results[0].length; i++) out.push(ev.results[0][i].transcript);
          resolve(out);
        };
        r.onerror = function (ev) { reject(new Error(ev.error || "error")); };
        r.onnomatch = function () { reject(new Error("nomatch")); };
        r.start();
      });
    },

    /**
     * Punteggio di pronuncia 0..1: la migliore somiglianza tra le trascrizioni candidate e il testo atteso.
     * Il riconoscimento non è perfetto, quindi la soglia di "ok" è indulgente (vedi PASS).
     */
    score: function (expected, heardList) {
      var e = B.norm(expected), best = 0;
      heardList.forEach(function (h) { best = Math.max(best, B.similarity(B.norm(h), e)); });
      return best;
    },
    PASS: 0.75
  };
})(window.B);
