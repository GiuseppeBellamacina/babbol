/*
 * Motore delle sessioni: trasforma lezioni, test, esami e ripasso in una lista di step che la UI sa mostrare.
 *
 * Gli step sono quelli dei contenuti (docs/CONTENT_SCHEMA.md, campo `t`), più:
 *   learn -> pagina di vocaboli nuovi (generata da { t: "words" })
 * Gli step { t: "drill" } diventano esercizi sulle parole della lezione (mc / type / match con wordId).
 *
 * Campi aggiunti dal motore a ogni step:
 *   _key   "lezione#indice": per ritrovare l'esercizio nel ripasso degli errori
 *   _skill abilità che l'esercizio allena (grammar, vocab, reading, listening, speaking, writing)
 *   _part  (solo esami) indice della parte
 */
(function (B) {
  "use strict";
  var R = B.repo;

  var TYPE_SKILL = { read: "reading", listen: "listening", dictation: "listening", speak: "speaking", speakTask: "speaking", write: "writing", match: "vocab", wordform: "vocab" };
  var KIND_SKILL = { grammar: "grammar", vocab: "vocab", reading: "reading", listening: "listening", situation: "speaking", production: "writing", test: "grammar" };
  var GRADED = { mc: 1, gap: 1, match: 1, dialog: 1, type: 1, order: 1, transform: 1, wordform: 1, fix: 1, dictation: 1, speak: 1, speakTask: 1, write: 1, read: 1, listen: 1, cloze: 1 };

  function skillOf(step, lessonKind) {
    if (step.wordId || step.wordIds) return "vocab";
    return TYPE_SKILL[step.t] || (lessonKind === "situation" || lessonKind === "production" ? "grammar" : KIND_SKILL[lessonKind]) || "grammar";
  }

  // ---------------------------------------------------------------- esercizi sulle parole
  // distrattori: prima stessa lezione e stessa categoria grammaticale, poi stesso livello
  function others(w, n, field) {
    var pool = R.allWords();
    var same = B.shuffle(pool.filter(function (o) { return o.lesson === w.lesson && o.id !== w.id; }));
    var near = B.shuffle(pool.filter(function (o) { return o.lesson !== w.lesson && o.level === w.level && o.pos === w.pos; }));
    var rest = B.shuffle(pool.filter(function (o) { return o.lesson !== w.lesson; }));
    var out = [], seen = {};
    seen[String(w[field]).toLowerCase()] = 1;
    same.concat(near, rest).forEach(function (o) {
      var k = String(o[field]).toLowerCase();
      if (out.length < n && !seen[k]) { seen[k] = 1; out.push(o[field]); }
    });
    return out;
  }
  function mcWord(base, w, field) {
    var opts = B.shuffle([w[field]].concat(others(w, 3, field)));
    return Object.assign({ t: "mc", opts: opts, a: opts.indexOf(w[field]), wordId: w.id, _skill: "vocab" }, base);
  }
  var WORD_STEPS = {
    pic: function (w) { return mcWord({ q: "Che cos'è?", img: w.img, emoji: w.emoji, speakOnPick: true, sayAfter: w.en }, w, "en"); },
    itEn: function (w) { return mcWord({ q: "Come si dice in inglese?", text: w.it, speakOnPick: true, sayAfter: w.en }, w, "en"); },
    enIt: function (w) { return mcWord({ q: "Che cosa significa?", text: w.en, sub: "/" + w.ipa + "/", say: w.en }, w, "it"); },
    listen: function (w) { return mcWord({ q: "Ascolta e scegli il significato", say: w.en, hide: true }, w, "it"); },
    type: function (w) { return { t: "type", q: "Scrivi in inglese", text: w.it, answers: [w.en].concat(w.alts || []), wordId: w.id, sayAfter: w.en, _skill: "vocab", word: true }; },
    listenType: function (w) { return { t: "type", q: "Scrivi la parola che senti", say: w.en, hide: true, answers: [w.en].concat(w.alts || []), wordId: w.id, sayAfter: w.en, _skill: "vocab", word: true }; },
    useIt: function (w) {
      // la parola nella sua frase d'esempio, da completare a memoria
      var re = new RegExp("\\b" + w.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      if (!w.ex || !re.test(w.ex[0])) return WORD_STEPS.type(w);
      return { t: "type", q: "Completa la frase", s: w.ex[0].replace(re, "___"), sub: w.ex[1], answers: [w.en], wordId: w.id, sayAfter: w.ex[0], _skill: "vocab", word: true };
    }
  };
  function matchWords(ws) {
    return { t: "match", pairs: ws.map(function (w) { return [w.en, w.it]; }), wordIds: ws.map(function (w) { return w.id; }), _skill: "vocab" };
  }
  // n esercizi misti, ognuno su una parola diversa finché possibile, dal riconoscimento alla produzione
  function drill(words, n) {
    var order = ["itEn", "enIt", "listen", "pic", "useIt", "type", "listenType", "itEn", "useIt", "type"];
    var q = B.shuffle(words), out = [], i = 0;
    for (var k = 0; out.length < n; k++) {
      if (k === 3 && words.length >= 5) { out.push(matchWords(B.sample(words, 5))); continue; }
      var kind = order[i % order.length], w = q[i % q.length];
      i++;
      if (kind === "pic" && !B.hasPic(w)) kind = "enIt";
      out.push(WORD_STEPS[kind](w));
      if (k > n * 3) break;
    }
    return out;
  }
  // esercizio di ripasso adatto alla "forza" della parola
  function reviewWordStep(w, box) {
    if (box <= 1) return (B.hasPic(w) ? WORD_STEPS.pic : WORD_STEPS.itEn)(w);
    if (box <= 3) return B.pick([WORD_STEPS.enIt, WORD_STEPS.listen, WORD_STEPS.useIt])(w);
    return B.pick([WORD_STEPS.type, WORD_STEPS.listenType, WORD_STEPS.useIt])(w);
  }

  // ---------------------------------------------------------------- espansione di una lezione
  function expand(lesson, opts) {
    opts = opts || {};
    var out = [];
    lesson.steps.forEach(function (s, i) {
      if (s.t === "words") {
        for (var k = 0; k < (lesson.words || []).length; k += 4) out.push({ t: "learn", words: lesson.words.slice(k, k + 4) });
      } else if (s.t === "drill") {
        drill(lesson.words || [], s.n || 8).forEach(function (d) { out.push(d); });
      } else {
        out.push(Object.assign({}, s, { _key: lesson.id + "#" + i, _skill: s._skill || skillOf(s, lesson.kind) }));
      }
    });
    return out;
  }
  function graded(s) { return !!GRADED[s.t]; }
  function stepByKey(key) {
    var p = key.split("#"), l = R.lesson(p[0]), s = l && l.steps[+p[1]];
    return s && graded(s) ? Object.assign({}, s, { _key: key, _skill: skillOf(s, l.kind) }) : null;
  }

  // lezioni di unità già sbloccate (per gli allenamenti)
  function availableLessons(kind) {
    return R.units().filter(function (u) { return B.path.unitUnlocked(u); })
      .map(function (u) { return R.lesson(u.id + "-" + kind); }).filter(Boolean);
  }

  var Engine = B.engine = {
    expand: expand,
    graded: graded,

    lessonSession: function (lessonId) {
      var l = R.lesson(lessonId), u = R.unit(l.unit);
      var test = l.kind === "test";
      return {
        mode: test ? "test" : "lesson", lessonId: l.id, unitId: u.id, kind: l.kind,
        title: test ? "Test - " + u.title : l.title,
        steps: expand(l), xpPer: test ? 3 : 2, bonus: test ? 20 : 10,
        quiet: test, retry: !test, pass: test ? (l.pass || 70) : null
      };
    },

    /** Ripasso: parole in scadenza (ripetizione spaziata) + esercizi sbagliati. null se non c'è nulla. */
    reviewSession: function (force) {
      var steps = [];
      var due = B.store.dueWords().filter(function (d) { return R.word(d.id); });
      if (!due.length && force) {
        var seen = B.store.get().words;
        due = Object.keys(seen).filter(function (id) { return R.word(id); })
          .sort(function (a, b) { return seen[a].b - seen[b].b; }).slice(0, 12).map(function (id) { return { id: id, b: seen[id].b }; });
      }
      due.slice(0, 14).forEach(function (d) { steps.push(reviewWordStep(R.word(d.id), d.b)); });
      B.store.openMistakes().slice(0, 8).forEach(function (k) { var s = stepByKey(k); if (s) steps.push(s); });
      if (!steps.length) return null;
      return { mode: "review", title: "Ripasso", steps: B.shuffle(steps), xpPer: 1, bonus: 5, retry: true };
    },
    mistakesSession: function () {
      var steps = B.store.openMistakes().slice(0, 12).map(stepByKey).filter(Boolean);
      if (!steps.length) return null;
      return { mode: "review", title: "I tuoi errori", steps: steps, xpPer: 1, bonus: 5, retry: true };
    },
    mistakesCount: function () { return B.store.openMistakes().filter(stepByKey).length; },

    /** Allenamento su un'abilità con esercizi delle unità sbloccate. */
    skillSession: function (skill) {
      var steps = [], pool;
      if (skill === "vocab") {
        var seen = Object.keys(B.store.get().words).map(R.word).filter(Boolean);
        var words = seen.length >= 6 ? seen : availableLessons("vocab").reduce(function (a, l) { return a.concat((l.words || []).map(function (w) { return R.word(w.id); })); }, []);
        if (words.length < 4) return null;
        steps = drill(B.sample(words, Math.min(words.length, 12)), 10);
      } else if (skill === "grammar") {
        pool = [];
        availableLessons("grammar").forEach(function (l) { expand(l).forEach(function (s) { if (graded(s) && s.t !== "match") pool.push(s); }); });
        steps = B.sample(pool, 10);
      } else if (skill === "reading" || skill === "listening") {
        var t = skill === "reading" ? "read" : "listen";
        pool = [];
        availableLessons(skill).concat(availableLessons("test")).forEach(function (l) { expand(l).forEach(function (s) { if (s.t === t || (t === "listen" && s.t === "dictation")) pool.push(s); }); });
        var big = B.sample(pool.filter(function (s) { return s.t === t; }), 2);
        steps = big.concat(B.sample(pool.filter(function (s) { return s.t === "dictation"; }), skill === "listening" ? 3 : 0));
      } else if (skill === "speaking") {
        pool = [];
        availableLessons("situation").concat(availableLessons("listening"), availableLessons("production")).forEach(function (l) {
          expand(l).forEach(function (s) { if (s.t === "speak" || s.t === "speakTask") pool.push(s); });
        });
        steps = B.sample(pool.filter(function (s) { return s.t === "speak"; }), 6).concat(B.sample(pool.filter(function (s) { return s.t === "speakTask"; }), 2));
      } else if (skill === "writing") {
        pool = [];
        availableLessons("production").forEach(function (l) { expand(l).forEach(function (s) { if (s.t === "write") pool.push(s); }); });
        var tr = [];
        availableLessons("grammar").forEach(function (l) { expand(l).forEach(function (s) { if (s.t === "transform" || s.t === "fix") tr.push(s); }); });
        steps = B.sample(tr, 4).concat(B.sample(pool, 1));
      }
      if (!steps.length) return null;
      return { mode: "practice", title: Engine.SKILLS[skill].name, steps: steps, xpPer: 1, bonus: 5, retry: true };
    },

    /** Simulazione d'esame: tutte le parti o una sola (partIndex). */
    examSession: function (level, partIndex) {
      var e = R.exam(level);
      if (!e) return null;
      var parts = partIndex == null ? e.parts.map(function (p, i) { return i; }) : [partIndex];
      var steps = [];
      parts.forEach(function (pi) {
        var p = e.parts[pi];
        steps.push({ t: "partIntro", title: p.title, it: p.it, minutes: p.minutes, _part: pi });
        p.steps.forEach(function (s, k) {
          steps.push(Object.assign({}, s, { _part: pi, _key: null, _skill: { reading: "reading", use: "grammar", listening: "listening", writing: "writing", speaking: "speaking" }[p.skill] || skillOf(s), _maxPlays: 2 }));
        });
      });
      return {
        mode: "exam", examId: e.id, level: level, title: e.title + (partIndex == null ? "" : " - " + e.parts[partIndex].title),
        parts: e.parts, partsDone: parts, steps: steps, xpPer: 3, bonus: 30, quiet: true, retry: false,
        minutes: parts.reduce(function (a, pi) { return a + e.parts[pi].minutes; }, 0), full: partIndex == null
      };
    },

    placementSession: function () {
      var p = R.placement();
      if (!p) return null;
      return { mode: "placement", title: p.title, steps: p.steps.map(function (s) { return Object.assign({}, s, { _skill: skillOf(s) }); }), xpPer: 0, bonus: 0, quiet: true, retry: false };
    },
    /** Livello di partenza: il primo livello sotto il 70% di risposte giuste. */
    placementLevel: function (byLevel) {
      var lv = "A2";
      for (var i = 0; i < R.LEVELS.length; i++) {
        var L = R.LEVELS[i], s = byLevel[L];
        if (!s || !s.total || s.right / s.total < 0.7) { lv = L; break; }
        lv = R.LEVELS[Math.min(i + 1, R.LEVELS.length - 1)];
      }
      return lv;
    },

    SKILLS: {
      grammar: { name: "Grammatica", icon: "puzzle", desc: "Esercizi misti dalle lezioni di grammatica" },
      vocab: { name: "Lessico", icon: "cards", desc: "Le parole che hai incontrato" },
      reading: { name: "Lettura", icon: "book", desc: "Testi con domande di comprensione" },
      listening: { name: "Ascolto", icon: "headphones", desc: "Dialoghi, monologhi e dettati" },
      speaking: { name: "Parlato", icon: "mic", desc: "Ripeti e rispondi a voce" },
      writing: { name: "Scrittura", icon: "pencil", desc: "Trasformazioni e un testo da scrivere" }
    },
    KIND_NAME: { grammar: "Grammatica", vocab: "Lessico", reading: "Lettura", listening: "Ascolto", situation: "Situazione reale", production: "Scrivere e parlare", test: "Test dell'unità" }
  };
})(window.B);
