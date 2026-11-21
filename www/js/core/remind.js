/*
 * Promemoria di studio (notifiche locali, solo Android).
 *
 * La pagina calcola i prossimi 7 giorni e li passa al guscio nativo (AndroidBridge.scheduleReminders): una sola notifica al
 * giorno, all'ora scelta (default 19:00), mai oggi se si è già studiato. Si ricalcola all'avvio, quando l'app va in
 * background e a ogni modifica dei progressi, così quello che c'è scritto resta aggiornato. Dopo 14 giorni senza studiare
 * si smette (niente spam). Fuori da Android non fa nulla.
 */
(function (B) {
  "use strict";
  var native = window.AndroidBridge || null;
  var S = B.store, R = B.repo, P = B.path;
  var HOURS = [9, 13, 19, 21], DAYS = 7, GIVE_UP = 14, timer = null;

  function cfg() { var r = S.settings().remind; return { on: !r || r.on !== false, hour: r && HOURS.indexOf(r.hour) >= 0 ? r.hour : 19 }; }
  function dayNum(key) { return Math.floor(new Date(key + "T12:00:00").getTime() / 86400000); }
  function can(fn) { return !!(native && typeof native[fn] === "function"); }

  // un messaggio per giorno: serie in pericolo, inviti gentili se ci si è fermati, ogni tanto "a che punto sei"
  function message(date, key) {
    var st = S.get(), gap = st.lastDay ? dayNum(key) - dayNum(st.lastDay) : 99, seed = dayNum(key);
    var cu = P.currentUnit(), nl = P.nextLesson();
    var line = B.missions && B.missions.todayLine ? B.missions.todayLine() : null;
    if (gap <= 1 && st.streak >= 2) {
      return ["Serie di " + st.streak + " giorni", "Oggi non hai ancora studiato: bastano 10 minuti per tenerla viva." + (line ? " " + line : "")];
    }
    if (gap >= 4) {
      return ["Babbol ti aspetta", ["Dieci minuti oggi e si riparte: ti basta una lezione.", "Il tuo inglese ti sta aspettando: una lezione breve e sei di nuovo in pista.", "Non serve molto: una sola lezione per rimetterti in carreggiata."][seed % 3]];
    }
    if (gap >= 2) {
      return ["Ti sei fermato un attimo?", "Una lezione di oggi tiene la memoria viva: le parole nuove si dimenticano in fretta."];
    }
    if (cu && nl && seed % 3 === 0) {
      return ["A che punto sei", cu.level + " · unità " + cu.position + " «" + cu.title + "»: la prossima è «" + nl.title + "». Quanti minuti oggi?"];
    }
    if (line && seed % 3 === 1) return ["Missioni di oggi", line];
    return [["È l'ora di Babbol", "Un po' di inglese oggi?", "Cinque minuti di inglese?"][seed % 3], ["Oggi hai ancora un obiettivo da raggiungere: " + st.goal + " minuti.", "Una lezione veloce prima di cena: ti va?", "Piccoli passi ogni giorno: fai una lezione o un ripasso."][seed % 3]];
  }

  function plan() {
    var c = cfg(), now = Date.now(), out = [], st = S.get(), today = B.dayKey();
    if (st.lastDay && dayNum(today) - dayNum(st.lastDay) > GIVE_UP) return out;
    for (var d = 0; d < DAYS; d++) {
      var date = new Date(); date.setDate(date.getDate() + d); date.setHours(c.hour, 0, 0, 0);
      var key = B.dayKey(date);
      if (date.getTime() <= now + 60000) continue;
      if (st.lastDay && dayNum(key) - dayNum(st.lastDay) > GIVE_UP) break;
      if (d === 0 && st.lastDay === today) continue;       // oggi ha già studiato
      var m = message(date, key);
      out.push({ at: date.getTime(), title: m[0], text: m[1] });
    }
    return out;
  }

  var Remind = B.remind = {
    available: function () { return can("scheduleReminders"); },
    config: cfg,
    hours: HOURS,
    allowed: function () { return can("notificationsAllowed") ? !!native.notificationsAllowed() : false; },
    /** Ricalcola e passa al guscio nativo i promemoria (o li annulla se spenti). */
    refresh: function () {
      if (!Remind.available() || !B.cloud.loggedIn()) { if (can("cancelReminders")) native.cancelReminders(); return; }
      try {
        if (!cfg().on) native.cancelReminders(); else native.scheduleReminders(JSON.stringify(plan()));
      } catch (e) { console.warn("remind", e); }
    },
    later: function () { clearTimeout(timer); timer = setTimeout(Remind.refresh, 2500); },
    setOn: function (on) {
      S.setSetting("remind", { on: on, hour: cfg().hour });
      if (on && can("askNotificationPermission")) native.askNotificationPermission();
      Remind.refresh();
    },
    setHour: function (h) { S.setSetting("remind", { on: cfg().on, hour: h }); Remind.refresh(); },
    test: function () { if (can("testReminder")) native.testReminder("Babbol", "Prova riuscita: i promemoria arrivano così.", 5); },
    /** Al primo avvio dopo l'aggiornamento chiede il permesso (Android 13+), una volta sola. */
    askOnce: function () {
      if (!Remind.available() || !cfg().on || S.settings().remindAsked || !can("askNotificationPermission")) return;
      S.setSetting("remindAsked", true);
      native.askNotificationPermission();
    }
  };

  window.__onNotifPermission = function (ok) {
    if (!ok && B.ui && B.ui.alert) B.ui.alert("Notifiche disattivate", "Per ricevere i promemoria attiva le notifiche di Babbol dalle impostazioni del telefono (App > Babbol > Notifiche).");
    Remind.refresh();
  };
  S.subscribe(function () { Remind.later(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) Remind.refresh(); });
})(window.B);
