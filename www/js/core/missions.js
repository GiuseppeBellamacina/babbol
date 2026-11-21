/*
 * Missioni giornaliere, settimanali e mensili, e gettoni.
 *
 * Tutto è DETERMINISTICO e DERIVATO: le missioni di un periodo si generano da un seme (la data), quindi sono uguali su ogni telefono,
 * e il progresso si calcola dai contatori già nello stato (days[giorno]: minuti, risposte a, lezioni l, parole w, k per abilità).
 * L'unica cosa memorizzata è il riscatto (rewards.claimed), che si unisce tra dispositivi.
 * Gettoni = premi riscattati + regalo + rimborsi dei doppioni - scatole aperte x costo. Vedi docs/DATA_MODEL.md.
 */
(function (B) {
  "use strict";
  var S = B.store, R = B.repo, P = B.path;
  var BOX_COST = 30, GIFT_COINS = 90;
  var SKILL_KEYS = ["grammar", "vocab", "reading", "listening", "speaking", "writing"];
  var ANN_KEY = "babbol.missions.announced";

  // ---------------------------------------------------------------- utilità
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    var a = hash(seed);
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function level() { return { A2: 0, B1: 1, B2: 2 }[P.cefr().current] || 0; }

  // giorni (chiavi AAAA-MM-GG) di un periodo
  function dayKeys(period, now) {
    var d = new Date(now || Date.now()), out = [], i;
    if (period === "d") return [B.dayKey(d)];
    if (period === "w") {
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));            // lunedì
      for (i = 0; i < 7; i++) { out.push(B.dayKey(d)); d.setDate(d.getDate() + 1); }
      return out;
    }
    var y = d.getFullYear(), m = d.getMonth(), n = new Date(y, m + 1, 0).getDate();
    for (i = 1; i <= n; i++) out.push(B.dayKey(new Date(y, m, i)));
    return out;
  }
  function periodKey(period, now) {
    var k = dayKeys(period, now);
    return period === "d" ? k[0] : period === "w" ? k[0] : k[0].slice(0, 7);
  }
  function span(keys) { return [new Date(keys[0] + "T00:00:00").getTime(), new Date(keys[keys.length - 1] + "T23:59:59").getTime()]; }

  // ---------------------------------------------------------------- metriche (dal registro dei giorni)
  function metric(name, keys) {
    var days = S.get().days, sum = 0, k;
    if (name === "units") {                                   // test d'unità superati nel periodo
      var sp = span(keys), ls = S.get().lessons;
      return R.units().filter(function (u) { var l = ls[P.testId(u)]; return l && l.at >= sp[0] && l.at <= sp[1] && l.best >= P.passMark(u); }).length;
    }
    keys.forEach(function (day) {
      var d = days[day]; if (!d) return;
      if (name === "minutes") sum += d.s / 60;
      else if (name === "days") sum += d.s > 0 ? 1 : 0;
      else if (name === "answers") sum += d.a || 0;
      else if (name === "lessons") sum += d.l || 0;
      else if (name === "words") sum += d.w || 0;
      else if (name.indexOf("skill:") === 0) sum += (d.k && d.k[name.slice(6)]) || 0;
    });
    return Math.floor(sum);
  }

  // ---------------------------------------------------------------- modelli
  var SKILL_NAME = { grammar: "grammatica", vocab: "lessico", reading: "lettura", listening: "ascolto", speaking: "parlato", writing: "scrittura" };
  function T(id, icon, text, metricName, targets, reward) { return { id: id, icon: icon, text: text, metric: metricName, targets: targets, reward: reward }; }
  var DAILY_EASY = [
    T("min", "clock", function (n) { return "Studia per " + n + " minuti"; }, "minutes", [10, 12, 15], 5),
    T("les", "star", function () { return "Completa una lezione"; }, "lessons", [1, 1, 1], 5),
    T("wrd", "cards", function (n) { return "Ripassa " + n + " parole"; }, "words", [10, 12, 15], 5)
  ];
  var DAILY_STRETCH = [
    T("ans", "target", function (n) { return "Rispondi a " + n + " domande"; }, "answers", [25, 30, 40], 8),
    T("min2", "flame", function (n) { return "Studia per " + n + " minuti"; }, "minutes", [25, 30, 35], 8)
  ];
  var WEEK_B = [
    T("les", "star", function (n) { return "Completa " + n + " lezioni"; }, "lessons", [4, 5, 6], 25),
    T("wrd", "cards", function (n) { return "Ripassa " + n + " parole"; }, "words", [40, 50, 60], 22)
  ];
  var WEEK_C = [
    T("min", "clock", function (n) { return "Studia per " + n + " minuti"; }, "minutes", [90, 120, 150], 25),
    T("ans", "target", function (n) { return "Rispondi a " + n + " domande"; }, "answers", [120, 150, 200], 25)
  ];

  function build(period, now) {
    var keys = dayKeys(period, now), pk = periodKey(period, now), r = rng(period + ":" + pk), lv = level(), list = [];
    function add(t, i, target) {
      target = target == null ? t.targets[lv] : target;
      list.push({ key: period + ":" + pk + ":" + i, period: period, icon: t.icon, title: t.text(target), metric: t.metric, target: target, reward: t.reward, keys: keys });
    }
    if (period === "d") {
      add(pick(r, DAILY_EASY), 0);
      var sk = pick(r, SKILL_KEYS), low = sk === "speaking" || sk === "writing", n = low ? [3, 4, 5][lv] : [8, 10, 12][lv];
      add({ icon: B.engine.SKILLS[sk].icon, reward: 7, metric: "skill:" + sk, text: function (x) { return "Rispondi a " + x + " domande di " + SKILL_NAME[sk]; } }, 1, n);
      add(pick(r, DAILY_STRETCH), 2);
    } else if (period === "w") {
      add(T("days", "calendar", function (x) { return "Studia in " + x + " giorni diversi"; }, "days", [4, 4, 5], 20), 0);
      add(pick(r, WEEK_B), 1); add(pick(r, WEEK_C), 2);
    } else {
      add(T("days", "flame", function (x) { return "Studia in " + x + " giorni del mese"; }, "days", [14, 16, 18], 60), 0);
      add(T("units", "trophy", function () { return "Supera il test di un'unità"; }, "units", [1, 1, 1], 80), 1);
      add(T("min", "clock", function (x) { return "Studia per " + (x / 60) + " ore"; }, "minutes", [300, 360, 420], 70), 2);
    }
    return list;
  }

  var BONUS = { d: 5, w: 15, m: 40 };
  var CLAIM = function (key) { return S.get().rewards.claimed[key] || null; };

  function list(period, now) {
    var ms = build(period, now);
    ms.forEach(function (m) {
      m.value = Math.min(m.target, metric(m.metric, m.keys));
      m.done = m.value >= m.target; m.claimed = !!CLAIM(m.key);
    });
    // premio extra per aver finito tutte le missioni del periodo
    var done = ms.filter(function (m) { return m.done; }).length;
    var bk = ms[0].key.replace(/:0$/, ":bonus");
    ms.push({ key: bk, period: period, icon: "trophy", title: "Completa tutte le missioni", target: ms.length, value: done, done: done >= ms.length, claimed: !!CLAIM(bk), reward: BONUS[period], bonus: true });
    return ms;
  }

  function allOpen() { return list("d").concat(list("w"), list("m")); }

  // ---------------------------------------------------------------- gettoni
  function earned() {
    var rw = S.get().rewards, sum = rw.gift ? GIFT_COINS : 0, id, c = rw.claimed;
    for (id in c) sum += c[id].c || 0;
    return sum;
  }
  function refunds() {
    var an = S.get().rewards.animals, sum = 0;
    for (var id in an) if (an[id].n > 1) sum += (an[id].n - 1) * B.album.refund(id);
    return sum;
  }
  function balance() { return earned() + refunds() - S.get().rewards.boxes * BOX_COST; }

  function seenAnnounced() { try { return JSON.parse(localStorage.getItem(ANN_KEY) || "{}"); } catch (e) { return {}; } }

  B.missions = {
    BOX_COST: BOX_COST, GIFT_COINS: GIFT_COINS,
    list: list,
    balance: balance,
    claim: function (m) {
      if (!m.done || m.claimed) return false;
      S.claimMission(m.key, m.reward);
      return true;
    },
    /** Missioni finite e non ancora riscattate (puntino rosso). */
    pending: function () { return allOpen().filter(function (m) { return m.done && !m.claimed; }); },
    /** Missioni appena completate di cui non si è ancora parlato (si usa a fine sessione). */
    announce: function () {
      var seen = seenAnnounced(), fresh = B.missions.pending().filter(function (m) { return !seen[m.key]; });
      if (fresh.length) {
        fresh.forEach(function (m) { seen[m.key] = 1; });
        var ks = Object.keys(seen); if (ks.length > 200) ks.slice(0, ks.length - 200).forEach(function (k) { delete seen[k]; });
        try { localStorage.setItem(ANN_KEY, JSON.stringify(seen)); } catch (e) { /* ignorato */ }
      }
      return fresh;
    },
    /** Una riga per le notifiche: la prima missione di oggi non ancora finita. */
    todayLine: function () {
      try {
        var m = list("d").filter(function (x) { return !x.done && !x.bonus; })[0];
        return m ? "Missione di oggi: " + m.title.toLowerCase() + " (" + m.value + "/" + m.target + ")." : null;
      } catch (e) { return null; }
    },
    rng: rng, hash: hash,
    _dayKeys: dayKeys
  };
})(window.B);
