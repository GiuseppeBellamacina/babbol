/* Avvio dell'app. */
(function (B) {
  "use strict";
  B.repo.init();

  // cambio di login (accesso, uscita, account eliminato): si ridisegna tutto
  B.cloud.onChange = function () { if (B.session.isOpen()) B.session._state().close(); B.ui.init(); };
  // link dall'email (conferma registrazione o recupero password)
  B.cloud.onCallback = function (url) {
    B.cloud.handleCallback(url).then(function (type) {
      if (type === "recovery") B.auth.askNewPassword();
      else B.ui.toast("Email confermata: benvenuto.");
    }, function (e) { B.ui.alert("Link non valido", e.message); });
  };

  function start() {
    B.ui.init();
    if (B.cloud.loggedIn()) {
      B.badges.check();
      B.cloud.wake();
    }
    // link arrivato mentre l'app si avviava (lo passa il guscio Android)
    if (window.__pendingAuthUrl) { var u = window.__pendingAuthUrl; window.__pendingAuthUrl = null; B.cloud.onCallback(u); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(window.B);
