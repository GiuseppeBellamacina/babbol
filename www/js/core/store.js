/*
 * Store dei progressi: unico punto che legge/scrive lo stato dell'utente.
 *
 * Lo stato vive in localStorage (l'app funziona offline) e viene sincronizzato con Supabase da cloud.js:
 * ogni modifica segna `dirty`; cloud.js salva quando serve e, in caso di conflitto tra dispositivi, usa merge().
 *
 * Contiene: XP, serie, minuti di studio, punteggi di lezioni/esami, ripetizione spaziata delle parole,
 * esercizi sbagliati da ripassare, statistiche per abilità, badge, impostazioni.
 */
(function (B) {
  "use strict";

  var KEY = "babbol.progress.v2";
  var BOX_DAYS = [0, 1, 3, 7, 14, 30, 60]; // intervalli Leitner (box 0..6)
  var SKILLS = ["grammar", "vocab", "reading", "listening", "speaking", "writing"];
  var MAX_MISTAKES = 300;

  function fresh() {
    return {
      v: 2, owner: null, rev: 0, dirty: false, t: 0,
      placement: null,            // { level: "B1", scores: {A2:90,B1:55,B2:20}, at }
      xp: 0, streak: 0, bestStreak: 0, lastDay: null,
      goal: 30,                   // minuti al giorno
      lessons: {},                // id -> { best: 0..100, runs, at }
      exams: {},                  // id -> { best, parts: {partId: pct}, runs, at }
      words: {},                  // id -> { b, due: "AAAA-MM-GG", ok, ko }
      mistakes: {},               // "lessonId#indice" -> { n, at, fixed }
      skills: {},                 // skill -> [corrette, totali]
      days: {},                   // "AAAA-MM-GG" -> { xp, s }
      badges: {},                 // id -> timestamp
      stats: { answered: 0, correct: 0, sessions: 0, seconds: 0, spoken: 0, written: 0 },
      settings: { accent: "en-GB", rate: 0.95, sound: true, theme: "auto", roast: false, unlockAll: false }
    };
  }

  function load() {
    var base = fresh();
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) assign(base, JSON.parse(raw));
    } catch (e) { /* storage non disponibile o corrotto: si riparte puliti */ }
    return base;
  }
  // merge superficiale: i campi nuovi restano ai default
  function assign(base, s) {
    for (var k in s) {
      if (s[k] && typeof s[k] === "object" && !Array.isArray(s[k]) && base[k] && typeof base[k] === "object") Object.assign(base[k], s[k]);
      else base[k] = s[k];
    }
    return base;
  }

  var state = load();
  var listeners = [];
  var saveTimer = null;

  function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 150); }
  function flush() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignorato */ }
  }
  function touch() { state.dirty = true; state.t = Date.now(); }
  function emit() { listeners.forEach(function (f) { try { f(state); } catch (e) { console.error(e); } }); }
  function commit() { touch(); persist(); emit(); }

  // ---------- unione di due stati (sincronizzazione tra dispositivi) ----------
  function maxMap(a, b, pick) {
    var out = {}, k;
    for (k in a) out[k] = a[k];
    for (k in b) out[k] = out[k] == null ? b[k] : pick(out[k], b[k]);
    return out;
  }
  function merge(a, b) {
    var newer = (a.t || 0) >= (b.t || 0) ? a : b;
    var m = assign(fresh(), newer);
    m.xp = Math.max(a.xp || 0, b.xp || 0);
    m.bestStreak = Math.max(a.bestStreak || 0, b.bestStreak || 0);
    var later = (a.lastDay || "") >= (b.lastDay || "") ? a : b;
    m.lastDay = later.lastDay; m.streak = later.streak;
    m.lessons = maxMap(a.lessons || {}, b.lessons || {}, function (x, y) {
      return { best: Math.max(x.best, y.best), runs: Math.max(x.runs, y.runs), at: Math.max(x.at || 0, y.at || 0) };
    });
    m.exams = maxMap(a.exams || {}, b.exams || {}, function (x, y) {
      var r = x.best >= y.best ? x : y;
      return { best: r.best, parts: r.parts, runs: Math.max(x.runs, y.runs), at: Math.max(x.at || 0, y.at || 0) };
    });
    m.words = maxMap(a.words || {}, b.words || {}, function (x, y) {
      var nx = x.ok + x.ko, ny = y.ok + y.ko;
      return nx !== ny ? (nx > ny ? x : y) : (x.due >= y.due ? x : y);
    });
    m.mistakes = maxMap(a.mistakes || {}, b.mistakes || {}, function (x, y) { return (x.at || 0) >= (y.at || 0) ? x : y; });
    m.skills = maxMap(a.skills || {}, b.skills || {}, function (x, y) { return x[1] >= y[1] ? x : y; });
    m.days = maxMap(a.days || {}, b.days || {}, function (x, y) { return { xp: Math.max(x.xp, y.xp), s: Math.max(x.s, y.s) }; });
    m.badges = maxMap(a.badges || {}, b.badges || {}, Math.min);
    m.stats = maxMap(a.stats || {}, b.stats || {}, Math.max);
    var pa = a.placement, pb = b.placement;
    m.placement = pa && pb ? (pa.at >= pb.at ? pa : pb) : (pa || pb || null);
    return m;
  }

  var S = B.store = {
    SKILLS: SKILLS,
    get: function () { return state; },
    settings: function () { return state.settings; },
    subscribe: function (f) { listeners.push(f); },
    flush: flush,
    merge: merge,

    // ---------- sincronizzazione (usate da cloud.js) ----------
    owner: function () { return state.owner; },
    // nuovo utente su questo dispositivo: si riparte puliti (le impostazioni restano)
    claim: function (userId) {
      if (state.owner === userId) return;
      var settings = state.settings;
      state = fresh(); state.settings = settings; state.owner = userId;
      flush(); emit();
    },
    // stato arrivato dal server: lo si unisce a quello locale
    absorb: function (remote, rev) {
      var dirty = state.dirty, owner = state.owner;
      state = remote ? merge(state, remote) : state;
      state.owner = owner; state.rev = rev; state.dirty = dirty || !!remote;
      flush(); emit();
    },
    // sentT = versione locale inviata: se nel frattempo è cambiato qualcosa resta "dirty"
    markSynced: function (rev, sentT) { state.rev = rev; if (sentT == null || state.t === sentT) state.dirty = false; flush(); },
    snapshot: function () {
      var c = JSON.parse(JSON.stringify(state));
      delete c.dirty; delete c.rev; delete c.owner;
      return c;
    },

    // ---------- XP, serie, tempo ----------
    addXp: function (n, seconds) {
      var today = B.dayKey();
      var d = state.days[today] || { xp: 0, s: 0 };
      d.xp += Math.max(0, n || 0); d.s += Math.max(0, seconds || 0);
      state.days[today] = d;
      state.xp += Math.max(0, n || 0);
      state.stats.seconds += Math.max(0, seconds || 0);
      if (state.lastDay !== today) {
        state.streak = state.lastDay === B.daysAgo(1) ? state.streak + 1 : 1;
        state.lastDay = today;
        state.bestStreak = Math.max(state.bestStreak, state.streak);
      }
      commit();
    },
    // la serie è "viva" se hai studiato oggi o ieri
    streak: function () {
      if (!state.lastDay) return 0;
      return (state.lastDay === B.dayKey() || state.lastDay === B.daysAgo(1)) ? state.streak : 0;
    },
    minutesToday: function () { var d = state.days[B.dayKey()]; return d ? Math.round(d.s / 60) : 0; },
    lastDays: function (n) {
      var out = [];
      for (var i = n - 1; i >= 0; i--) {
        var k = B.daysAgo(i), d = state.days[k] || { xp: 0, s: 0 };
        out.push({ key: k, xp: d.xp, min: Math.round(d.s / 60), date: new Date(k + "T12:00:00") });
      }
      return out;
    },
    hoursTotal: function () { return state.stats.seconds / 3600; },

    // ---------- lezioni ed esami ----------
    lessonBest: function (id) { return (state.lessons[id] && state.lessons[id].best) || 0; },
    lessonDone: function (id) { return !!state.lessons[id]; },
    recordLesson: function (id, pct) {
      var cur = state.lessons[id] || { best: 0, runs: 0 };
      cur.best = Math.max(cur.best, pct); cur.runs++; cur.at = Date.now();
      state.lessons[id] = cur;
      commit();
    },
    examResult: function (id) { return state.exams[id] || null; },
    recordExam: function (id, pct, parts) {
      var cur = state.exams[id] || { best: 0, parts: {}, runs: 0 };
      if (pct >= cur.best) { cur.best = pct; cur.parts = parts; }
      cur.runs++; cur.at = Date.now();
      state.exams[id] = cur;
      commit();
    },
    setPlacement: function (level, scores) {
      state.placement = { level: level, scores: scores, at: Date.now() };
      commit();
    },

    // ---------- abilità ----------
    recordSkill: function (skill, right, total) {
      if (!skill || !total) return;
      var s = state.skills[skill] || [0, 0];
      s[0] += right; s[1] += total;
      state.skills[skill] = s;
      state.stats.answered += total; state.stats.correct += right;
      touch(); persist();
    },
    skillPct: function (skill) { var s = state.skills[skill]; return s && s[1] ? Math.round(100 * s[0] / s[1]) : null; },

    // ---------- esercizi sbagliati (ripasso degli errori) ----------
    recordMistake: function (key, wrong) {
      var m = state.mistakes[key];
      if (wrong) m = { n: (m ? m.n : 0) + 1, at: Date.now(), fixed: false };
      else if (m && !m.fixed) m = { n: m.n, at: Date.now(), fixed: true };
      else return;
      state.mistakes[key] = m;
      var keys = Object.keys(state.mistakes);
      if (keys.length > MAX_MISTAKES) {
        keys.sort(function (a, b) { return state.mistakes[a].at - state.mistakes[b].at; })
          .slice(0, keys.length - MAX_MISTAKES).forEach(function (k) { delete state.mistakes[k]; });
      }
      touch(); persist();
    },
    openMistakes: function () {
      return Object.keys(state.mistakes).filter(function (k) { return !state.mistakes[k].fixed; })
        .sort(function (a, b) { return state.mistakes[b].n - state.mistakes[a].n || state.mistakes[a].at - state.mistakes[b].at; });
    },

    // ---------- parole (ripetizione spaziata, Leitner a 7 box) ----------
    word: function (id) { return state.words[id] || null; },
    recordWord: function (id, ok) {
      var w = state.words[id] || { b: 0, due: B.dayKey(), ok: 0, ko: 0 };
      if (ok) { w.b = Math.min(BOX_DAYS.length - 1, w.b + 1); w.ok++; } else { w.b = 0; w.ko++; }
      var d = new Date(); d.setDate(d.getDate() + BOX_DAYS[w.b]);
      w.due = B.dayKey(d);
      state.words[id] = w;
      touch(); persist();
    },
    dueWords: function () {
      var today = B.dayKey(), out = [];
      for (var id in state.words) {
        var w = state.words[id];
        if (w.due <= today) out.push({ id: id, b: w.b, due: w.due });
      }
      out.sort(function (a, b) { return a.b - b.b || (a.due < b.due ? -1 : 1); });
      return out;
    },
    seenCount: function () { return Object.keys(state.words).length; },
    masteredCount: function () {
      var n = 0;
      for (var id in state.words) if (state.words[id].b >= 4) n++;
      return n;
    },

    // ---------- statistiche, badge ----------
    bump: function (field, n) { state.stats[field] = (state.stats[field] || 0) + (n || 1); touch(); persist(); },
    hasBadge: function (id) { return !!state.badges[id]; },
    giveBadge: function (id) {
      if (state.badges[id]) return false;
      state.badges[id] = Date.now(); commit(); return true;
    },

    // ---------- impostazioni / reset ----------
    setSetting: function (k, v) { state.settings[k] = v; commit(); },
    setGoal: function (n) { state.goal = n; commit(); },
    reset: function () {
      var keep = { settings: state.settings, owner: state.owner, rev: state.rev };
      state = fresh(); Object.assign(state, keep);
      commit();
    },
    // logout: i dati locali vengono cancellati (restano sul server)
    wipe: function () {
      var settings = state.settings;
      state = fresh(); state.settings = settings;
      flush(); emit();
    }
  };

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () { if (document.hidden) flush(); });
})(window.B);
