/*
 * Voce: sintesi (TTS) e riconoscimento.
 *
 * Su Android usa il ponte nativo `AndroidBridge` (TextToSpeech + RecognizerIntent), gratuito e offline se la voce è installata.
 * Nel browser (test/sviluppo) ripiega su speechSynthesis / webkitSpeechRecognition.
 * Ogni funzione degrada con grazia: se la voce non c'è, l'app resta usabile.
 *
 * Voci dei dialoghi: ogni speaker ha un genere (dal nome, o da un terzo elemento "m"/"f" nella riga dei contenuti);
 * il guscio Android sceglie una voce maschile o femminile tra quelle installate, e se non ne trova usa il tono.
 */
(function (B) {
  "use strict";

  var native = window.AndroidBridge || null;
  var pendingListen = null;
  var doneCbs = {}, seq = 0, webToken = 0;

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

  // ---------------------------------------------------------------- genere degli speaker
  var MALE = "marco ben tom jack jake dan daniel luke mark owen paul paolo rob luca raj omar karim jonas james john david peter mike michael george harry oliver liam noah sean simon andrew ian nick tim joe max leo ethan adam alex ryan jacob will william robert richard steve stephen thomas matt matthew jim bob bill frank henry mr sir man boy dad father brother he".split(" ");
  var FEMALE = "helen emma kate anna priya laura ruth aisha sarah maria nina sofia mia elena claire lena marta chloe ana hannah ella tina clara karen rita anita lucy mei zoe sophie lily emily alice amy jane mary kim julia sara giulia eva eve ivy grace ruby ella isla amelia mrs ms miss madam woman girl mum mom mother sister she".split(" ");
  var genderCache = {};
  // "m", "f" oppure "" se non si capisce dal nome (Receptionist, Doctor, Tu...)
  function genderOf(name) {
    var k = String(name).toLowerCase();
    if (k in genderCache) return genderCache[k];
    var words = k.replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean), g = "";
    for (var i = 0; i < words.length && !g; i++) {
      if (MALE.indexOf(words[i]) >= 0) g = "m"; else if (FEMALE.indexOf(words[i]) >= 0) g = "f";
    }
    return (genderCache[k] = g);
  }

  function other(accent) { return accent === "en-US" ? "en-GB" : "en-US"; }

  /**
   * Assegna una voce a ogni speaker di lines ([[speaker, testo, genere?], ...]).
   * Genere noto -> quello; sconosciuto -> il genere meno usato finora (alternando). Ritorna { speaker: {lang, pitch, gender, variant} }.
   */
  function assignVoices(lines) {
    var acc = B.store.settings().accent || "en-GB";
    var order = [], explicit = {};
    lines.forEach(function (l) {
      if (order.indexOf(l[0]) < 0) order.push(l[0]);
      if (l[2] === "m" || l[2] === "f") explicit[l[0]] = l[2];
    });
    var used = { m: 0, f: 0 }, last = "", genders = {};
    order.forEach(function (s) {
      var g = explicit[s] || genderOf(s);
      if (g) { genders[s] = g; used[g]++; last = g; }
    });
    order.forEach(function (s) {
      if (genders[s]) return;
      var g = used.m === used.f ? (last === "m" ? "f" : "m") : (used.m < used.f ? "m" : "f");
      genders[s] = g; used[g]++; last = g;
    });
    var idx = { m: 0, f: 0 }, out = {};
    var P = { m: [0.85, 0.72, 0.65], f: [1.08, 1.22, 1.32] };
    order.forEach(function (s) {
      var g = genders[s], k = idx[g]++;
      out[s] = { gender: g, variant: k, lang: k % 2 ? other(acc) : acc, pitch: P[g][k % 3] };
    });
    return out;
  }

  // ---------------------------------------------------------------- browser (fallback)
  function pickWebVoice(lang, gender) {
    if (!window.speechSynthesis) return null;
    var voices = speechSynthesis.getVoices().filter(function (v) { return v.lang.replace("_", "-").indexOf("en") === 0; });
    var exact = voices.filter(function (v) { return v.lang.replace("_", "-") === lang; });
    var pool = exact.length ? exact : voices;
    if (gender) {
      var re = gender === "f" ? /female|woman|zira|hazel|susan|samantha|serena|kate|fiona|karen|libby|sonia|aria|jenny/i : /(^|[^e])male|\bman\b|david|mark|daniel|george|alex|ryan|guy|thomas|oliver/i;
      var hit = pool.filter(function (v) { return re.test(v.name); })[0];
      if (hit) return hit;
    }
    return pool[0] || null;
  }
  function webUtter(text, lang, rate, pitch, gender) {
    var u = new SpeechSynthesisUtterance(String(text));
    u.lang = lang; u.rate = rate; u.pitch = pitch || 1;
    var v = pickWebVoice(lang, gender);
    if (v) u.voice = v;
    return u;
  }
  // frasi in catena (con pause): serve a dividere e rallentare davvero
  function webSequence(items, onDone) {
    var token = ++webToken, i = 0;
    function next() {
      if (token !== webToken) return;
      if (i >= items.length) { if (onDone) onDone(); return; }
      var it = items[i++];
      if (it.pause) { setTimeout(next, it.pause); return; }
      var u = webUtter(it.text, it.lang, it.rate, it.pitch, it.gender);
      u.onend = next; u.onerror = next;
      speechSynthesis.speak(u);
    }
    speechSynthesis.cancel();
    next();
  }

  // ---------------------------------------------------------------- testo -> pezzi per il parlato lento
  // parlato lento: UNA parola alla volta, con una pausa in mezzo (più lunga dopo virgola e punto):
  // le parole restano ben staccate anche se il telefono ignora la velocità
  function slowItems(text, voice, rate) {
    var items = [], gap = Speech.slowGap(), words = String(text).trim().split(/\s+/).filter(Boolean);
    words.forEach(function (w, i) {
      if (i) {
        var prev = words[i - 1], extra = /[.!?]["')]*$/.test(prev) ? 450 : /[,;:]["')]*$/.test(prev) ? 250 : 0;
        if (gap + extra > 0) items.push({ pause: gap + extra });
      }
      items.push({ text: w, lang: voice.lang, rate: rate, pitch: voice.pitch, gender: voice.gender, variant: voice.variant });
    });
    return items;
  }

  // frasi di un testo (non spezza "Mr. Doyle" né "9.30"), per il lettore navigabile
  function splitSentences(text) {
    var out = [];
    (String(text).match(/[\s\S]+?(?:[.!?]+["')]*(?=\s|$)|$)/g) || [String(text)]).forEach(function (p) {
      p = p.trim();
      if (!p) return;
      if (out.length && /(^|\s)(Mr|Mrs|Ms|Dr|St|No|vs)\.$/i.test(out[out.length - 1])) out[out.length - 1] += " " + p; else out.push(p);
    });
    return out;
  }

  // ---------------------------------------------------------------- invio (nativo o browser)
  var active = null, internal = false;
  function play(items, onDone) {
    Speech.stop();
    var id = "seq" + (++seq);
    if (onDone) doneCbs[id] = onDone;
    if (native) {
      try {
        var lastText = -1;
        items.forEach(function (it, i) { if (!it.pause) lastText = i; });
        items.forEach(function (it, i) {
          if (it.pause) { if (native.silence) native.silence(it.pause); return; }
          native.speakVoice(String(it.text), it.lang, it.rate, it.pitch, i === lastText ? id : "", i > 0, it.gender || "", it.variant || 0);
        });
      } catch (e) { console.error(e); if (onDone) setTimeout(function () { window.__onTtsDone(id); }, 50); }
      return;
    }
    if (!window.speechSynthesis) { if (onDone) setTimeout(function () { window.__onTtsDone(id); }, 50); return; }
    webSequence(items, function () { window.__onTtsDone(id); });
  }

  var Speech = B.speech = {
    isNative: !!native,
    canSpeak: function () { return !!native || !!window.speechSynthesis; },
    genderOf: genderOf,
    assignVoices: assignVoices,

    // velocità normale (0.6-1.4) e "tartaruga" (0.25-0.9), regolabili dall'utente
    rate: function () { return B.store.settings().rate || 0.95; },
    slowRate: function () { return B.store.settings().slowRate || 0.55; },
    // pausa tra una parola e l'altra nel parlato lento, in millisecondi (0-800)
    slowGap: function () { var g = B.store.settings().slowGap; return g == null ? 350 : g; },

    speak: function (text, opts) {
      opts = opts || {};
      var st = B.store.settings();
      var voice = { lang: opts.lang || st.accent || "en-GB", pitch: opts.pitch || 1, gender: "", variant: 0 };
      play([{ text: text, lang: voice.lang, rate: opts.rate || Speech.rate(), pitch: voice.pitch }]);
    },
    // lenta davvero: velocità "tartaruga" + frasi spezzate a gruppi di parole con pause
    slow: function (text, onDone) {
      var st = B.store.settings();
      var voice = { lang: st.accent || "en-GB", pitch: 1, gender: "", variant: 0 };
      play(slowItems(text, voice, Speech.slowRate()), onDone);
    },

    // una frase con la voce già assegnata a uno speaker (vedi assignVoices)
    speakAs: function (text, voice) {
      play([{ text: text, lang: voice.lang, rate: Speech.rate(), pitch: voice.pitch, gender: voice.gender, variant: voice.variant }]);
    },

    /** Voce per lo speaker n-esimo (compatibilità): usa il genere se noto. */
    voiceFor: function (n, name) {
      var acc = B.store.settings().accent || "en-GB";
      var g = name ? genderOf(name) : "";
      var m = [{ lang: acc, pitch: 0.85, gender: "m" }, { lang: other(acc), pitch: 0.72, gender: "m" }];
      var f = [{ lang: acc, pitch: 1.1, gender: "f" }, { lang: other(acc), pitch: 1.25, gender: "f" }];
      var pool = g === "m" ? m : g === "f" ? f : (n % 2 ? m : f);
      return pool[Math.floor(n / 2) % pool.length];
    },

    /**
     * Legge un dialogo/monologo: lines = [[speaker, testo, genere?], ...]. onDone() alla fine.
     * opts.slow = parlato lento (velocità tartaruga + frasi spezzate con pause).
     */
    playLines: function (lines, onDone, opts) {
      opts = opts || {};
      var voices = assignVoices(lines), items = [];
      var rate = opts.slow ? Speech.slowRate() : (opts.rate || Speech.rate());
      lines.forEach(function (l, i) {
        var v = voices[l[0]];
        if (opts.slow) {
          if (i) items.push({ pause: 600 + Speech.slowGap() });
          slowItems(l[1], v, rate).forEach(function (it) { items.push(it); });
        } else {
          items.push({ text: l[1], lang: v.lang, rate: rate, pitch: v.pitch, gender: v.gender, variant: v.variant });
        }
      });
      play(items, onDone);
    },

    /**
     * Lettore navigabile per i listening: una frase alla volta, così si può mettere in pausa, andare avanti/indietro
     * e cambiare velocità a metà ascolto (la frase in corso riparte con la nuova velocità).
     * Ritorna { n, i, slow, state: idle|playing|paused|done, play(), pause(), toggle(), seek(k), refresh(), dispose() };
     * opts.onChange(c) a ogni cambio, opts.onDone() a fine ascolto.
     */
    track: function (lines, opts) {
      opts = opts || {};
      if (active) active.dispose();
      var voices = assignVoices(lines), segs = [], gen = 0, deb = null;
      lines.forEach(function (l, li) {
        splitSentences(l[1]).forEach(function (t) { segs.push({ li: li, text: t, v: voices[l[0]] }); });
      });
      var c = { n: segs.length, i: 0, slow: !!opts.slow, state: "idle" };
      function emit() { if (opts.onChange) opts.onChange(c); }
      function halt() { gen++; clearTimeout(deb); if (c.state === "playing") { c.state = "paused"; emit(); } }
      function say(lead) {
        var my = ++gen, s = segs[c.i], items = [];
        c.state = "playing"; emit();
        if (lead && c.i && segs[c.i - 1].li !== s.li) items.push({ pause: 350 + (c.slow ? Speech.slowGap() : 0) });
        (c.slow ? slowItems(s.text, s.v, Speech.slowRate()) : [{ text: s.text, lang: s.v.lang, rate: Speech.rate(), pitch: s.v.pitch, gender: s.v.gender, variant: s.v.variant }])
          .forEach(function (it) { items.push(it); });
        internal = true;
        try {
          play(items, function () {
            if (my !== gen) return;
            if (c.i + 1 < c.n) { c.i++; say(true); } else { c.state = "done"; emit(); if (opts.onDone) opts.onDone(); }
          });
        } finally { internal = false; }
      }
      function quiet() { gen++; internal = true; try { Speech.stop(); } finally { internal = false; } }
      c.halt = halt;
      c.play = function () { if (!c.n) return; if (c.state === "done") c.i = 0; say(false); };
      c.pause = function () { if (c.state !== "playing") return; quiet(); c.state = "paused"; emit(); };
      c.toggle = function () { if (c.state === "playing") c.pause(); else c.play(); };
      c.seek = function (k) {
        c.i = Math.max(0, Math.min(c.n - 1, k));
        if (c.state === "playing") say(false); else emit();
      };
      // dopo un cambio di velocità o di modalità: la frase in corso riparte subito (con un attimo di anticipo per non riavviarla a ogni passo dello slider)
      c.refresh = function () {
        if (c.state !== "playing") return;
        clearTimeout(deb); deb = setTimeout(function () { if (c.state === "playing") say(false); }, 150);
      };
      c.dispose = function () { clearTimeout(deb); if (c.state === "playing") quiet(); c.state = "idle"; if (active === c) active = null; };
      active = c;
      return c;
    },
    refresh: function () { if (active) active.refresh(); },

    stop: function () {
      if (active && !internal) active.halt();
      doneCbs = {}; webToken++;
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
