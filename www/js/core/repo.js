/*
 * Repository dei contenuti: unico punto da cui l'app legge unità, lezioni, esami e risorse.
 *
 * Fonte: righe { id, kind, parent, position, data } come nella tabella public.content di Supabase.
 *  - primo avvio: snapshot incluso nell'APK (www/content/course.js -> B.data.course)
 *  - poi: cache locale aggiornata con i delta di get_course_changes (vedi cloud.js)
 * Il resto dell'app non sa da dove arrivano i dati.
 */
(function (B) {
  "use strict";

  // In cache vanno SOLO le righe cambiate rispetto allo snapshot dell'APK (localStorage è limitato a ~5 MB):
  // { base: rev dello snapshot, rev, changed: { id: riga | null (= eliminata) } }
  var CACHE_KEY = "babbol.content.v3";
  var LEVELS = ["A2", "B1", "B2"];
  var rev = 0, rows = {}, idx = null, changed = {}, baseRev = 0;

  function byPos(a, b) { return a.position - b.position; }

  function build() {
    var i = { meta: { levels: [] }, units: [], lessons: {}, unitLessons: {}, exams: {}, placement: null, resources: [], words: {}, wordList: [] };
    var all = Object.keys(rows).map(function (k) { return rows[k]; });
    all.forEach(function (r) {
      var d = r.data;
      if (r.kind === "meta") i.meta = d;
      else if (r.kind === "unit") i.units.push(Object.assign({ position: r.position }, d));
      else if (r.kind === "lesson") {
        var l = Object.assign({ unit: r.parent, position: r.position }, d);
        i.lessons[l.id] = l;
        (i.unitLessons[r.parent] = i.unitLessons[r.parent] || []).push(l);
      }
      else if (r.kind === "exam") i.exams[d.level] = d;
      else if (r.kind === "placement") i.placement = d;
      else if (r.kind === "resource") i.resources.push(Object.assign({ position: r.position }, d));
    });
    i.units.sort(function (a, b) { return LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.position - b.position; });
    i.units.forEach(function (u, n) { u.index = n; });
    Object.keys(i.unitLessons).forEach(function (k) { i.unitLessons[k].sort(byPos); });
    i.resources.sort(byPos);
    i.units.forEach(function (u) {
      (i.unitLessons[u.id] || []).forEach(function (l) {
        (l.words || []).forEach(function (w) {
          var word = Object.assign({ lesson: l.id, unit: u.id, level: u.level }, w);
          i.words[w.id] = word; i.wordList.push(word);
        });
      });
    });
    idx = i;
  }

  function loadBundle() {
    var bundled = B.data.course || { rev: 0, items: [] };
    rows = {};
    (bundled.items || []).forEach(function (r) { if (!r.deleted) rows[r.id] = r; });
    baseRev = rev = bundled.rev || 0;
    changed = {};
  }
  function apply(items) {
    items.forEach(function (r) {
      if (r.deleted) { delete rows[r.id]; changed[r.id] = null; }
      else if (r.id && r.kind && r.data) { rows[r.id] = r; changed[r.id] = r; }
    });
  }
  function save() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ base: baseRev, rev: rev, changed: changed })); }
    catch (e) { console.warn("cache contenuti non salvata", e); }
  }

  var R = B.repo = {
    LEVELS: LEVELS,

    init: function () {
      loadBundle();
      try {
        var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        // una cache fatta su uno snapshot più vecchio (app aggiornata) non serve più
        if (cached && cached.base === baseRev && cached.changed) {
          Object.keys(cached.changed).forEach(function (id) {
            var r = cached.changed[id];
            if (r) rows[id] = r; else delete rows[id];
          });
          changed = cached.changed; rev = cached.rev;
        }
      } catch (e) { /* cache assente o corrotta: si usa lo snapshot incluso */ }
      try { localStorage.removeItem("babbol.content.v2"); } catch (e) { /* ignorato */ }
      build();
    },
    rev: function () { return rev; },

    /** Applica la risposta di get_course_changes. Ritorna il numero di elementi cambiati. */
    applyChanges: function (resp) {
      if (!resp || !Array.isArray(resp.items)) throw new Error("risposta contenuti non valida");
      apply(resp.items);
      rev = resp.rev;
      build();
      save();
      return resp.items.length;
    },
    /** Sostituisce tutto (risposta completa con since = 0, es. database ricaricato). */
    replaceAll: function (resp) {
      if (!resp || !Array.isArray(resp.items) || !resp.items.length) throw new Error("risposta contenuti vuota");
      loadBundle();
      var incoming = {};
      resp.items.forEach(function (r) { incoming[r.id] = 1; });
      // ciò che non c'è più sul server va eliminato; il resto si sovrascrive solo se diverso dallo snapshot
      Object.keys(rows).forEach(function (id) { if (!incoming[id]) { delete rows[id]; changed[id] = null; } });
      resp.items.forEach(function (r) {
        if (!rows[r.id] || JSON.stringify(rows[r.id].data) !== JSON.stringify(r.data) || rows[r.id].position !== r.position) { rows[r.id] = r; changed[r.id] = r; }
      });
      rev = resp.rev;
      build();
      save();
    },
    _cacheSize: function () { try { return (localStorage.getItem(CACHE_KEY) || "").length; } catch (e) { return -1; } },

    meta: function () { return idx.meta; },
    level: function (id) { return idx.meta.levels.filter(function (l) { return l.id === id; })[0] || { id: id, title: id }; },
    units: function (level) { return level ? idx.units.filter(function (u) { return u.level === level; }) : idx.units; },
    unit: function (id) { return idx.units.filter(function (u) { return u.id === id; })[0] || null; },
    lessons: function (unitId) { return idx.unitLessons[unitId] || []; },
    lesson: function (id) { return idx.lessons[id] || null; },
    allLessons: function () { return Object.keys(idx.lessons).map(function (k) { return idx.lessons[k]; }); },
    exam: function (level) { return idx.exams[level] || null; },
    placement: function () { return idx.placement; },
    resources: function () { return idx.resources; },
    resource: function (id) { return idx.resources.filter(function (r) { return r.id === id; })[0] || null; },
    word: function (id) { return idx.words[id] || null; },
    allWords: function () { return idx.wordList; },
    // schede di grammatica = note delle lezioni "grammar"
    grammarSheets: function () {
      var out = [];
      idx.units.forEach(function (u) {
        var g = idx.lessons[u.id + "-grammar"];
        if (g) out.push({ unit: u, lesson: g, notes: g.steps.filter(function (s) { return s.t === "note"; }) });
      });
      return out;
    }
  };

  // ---------------------------------------------------------------- percorso: sblocchi e livello
  var S = function () { return B.store; };
  var P = B.path = {
    testId: function (u) { return u.id + "-test"; },
    passMark: function (u) { var t = R.lesson(u.id + "-test"); return (t && t.pass) || 70; },
    unitPassed: function (u) { return S().lessonBest(P.testId(u)) >= P.passMark(u); },
    startIndex: function () {
      var pl = S().get().placement;
      if (!pl) return 0;
      var first = R.units(pl.level)[0];
      return first ? first.index : 0;
    },
    unitUnlocked: function (u) {
      if (S().settings().unlockAll || u.index <= P.startIndex()) return true;
      var prev = R.units()[u.index - 1];
      return !prev || P.unitPassed(prev);
    },
    // unità "corrente": la prima sbloccata e non superata
    currentUnit: function () {
      var us = R.units();
      for (var i = P.startIndex(); i < us.length; i++) if (P.unitUnlocked(us[i]) && !P.unitPassed(us[i])) return us[i];
      return null;
    },
    unitProgress: function (u) {
      var ls = R.lessons(u.id), done = ls.filter(function (l) { return S().lessonDone(l.id); }).length;
      return { done: done, total: ls.length };
    },
    levelPassedUnits: function (level) { return R.units(level).filter(P.unitPassed).length; },
    examUnlocked: function (level) {
      if (S().settings().unlockAll) return true;
      var us = R.units(level);
      return us.length > 0 && us.every(function (u) { return P.unitPassed(u) || u.index < P.startIndex(); });
    },
    examPassed: function (level) { var e = R.exam(level), r = e && S().examResult(e.id); return !!(r && r.best >= 60); },
    /** Stima del livello CEFR: ultimo livello con esame superato o tutte le unità passate. */
    cefr: function () {
      var reached = null, current = "A2";
      LEVELS.forEach(function (lv) {
        var us = R.units(lv), passed = P.levelPassedUnits(lv);
        if (P.examPassed(lv) || (us.length && passed === us.length)) reached = lv;
      });
      var pl = S().get().placement;
      if (!reached && pl && LEVELS.indexOf(pl.level) > 0) reached = LEVELS[LEVELS.indexOf(pl.level) - 1];
      var cu = P.currentUnit();
      current = cu ? cu.level : (reached || "A2");
      return { reached: reached, current: current };
    }
  };
})(window.B);
