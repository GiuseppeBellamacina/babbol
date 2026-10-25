/*
 * Aggiornamento dell'app dall'app stessa (solo su Android).
 *
 * All'avvio si chiede a GitHub l'ultima release del progetto (una sola richiesta, senza account). Se la versione è più
 * recente di quella installata si mostrano le novità e, su conferma, il guscio Android scarica babbol.apk, ne controlla
 * dimensione e SHA-256 e apre l'installatore di sistema. Android accetta l'aggiornamento solo se l'APK è firmato con la
 * stessa chiave di quello installato, quindi un file sostituito non potrebbe installarsi.
 *
 * Convenzione delle release: tag = numero di versione ("1.2.0"), allegato "babbol.apk". Nelle note della release
 * il testo dopo "**Installazione" non viene mostrato nella finestra.
 */
(function (B) {
  "use strict";
  var h = B.h;
  var REPO = "GiuseppeBellamacina/babbol";
  var KEY = "babbol.update.v1";
  var REMIND_MS = 12 * 3600 * 1000;   // "Più tardi": per la stessa versione non si richiede prima di 12 ore
  var native = window.AndroidBridge || null;

  function parts(v) { return String(v).replace(/^v/i, "").split("-")[0].split(".").map(function (x) { return parseInt(x, 10) || 0; }); }
  // true se a è una versione più recente di b (1.10.0 > 1.9.9)
  function newer(a, b) {
    var x = parts(a), y = parts(b);
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0;
    }
    return false;
  }
  function remembered() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function remember(version) { try { localStorage.setItem(KEY, JSON.stringify({ version: version, at: Date.now() })); } catch (e) { /* ignorato */ } }

  var ERRORS = {
    permission: "Per aggiornare devi consentire a Babbol di installare app. Nella schermata che si è aperta attiva «Consenti da questa fonte», poi torna in Babbol e riprova.",
    network: "Download non riuscito: controlla la connessione e riprova.",
    size: "Il file scaricato non è valido. Riprova più tardi.",
    checksum: "Il file scaricato non corrisponde a quello pubblicato. Riprova più tardi.",
    installer: "Non riesco ad avviare l'installazione.",
    url: "Indirizzo di download non valido."
  };

  var U = B.update = {
    REPO: REPO,
    newer: newer,
    // l'aggiornamento automatico c'è solo nel guscio Android
    canInstall: function () { return !!(native && native.downloadUpdate); },
    version: function () {
      try { var v = native && native.getVersionName && native.getVersionName(); if (v) return v; } catch (e) { /* ignorato */ }
      return B.VERSION;
    },

    /** Ultima release se più recente di quella installata, altrimenti null. Rifiuta se la rete non risponde. */
    latest: function () {
      var ctl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
      return fetch("https://api.github.com/repos/" + REPO + "/releases/latest", { headers: { Accept: "application/vnd.github+json" }, signal: ctl ? ctl.signal : undefined })
        .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (j) {
          var asset = (j.assets || []).filter(function (a) { return a.name === "babbol.apk"; })[0];
          var version = String(j.tag_name || "").replace(/^v/i, "");
          if (!asset || !version || !newer(version, U.version())) return null;
          return {
            version: version, url: asset.browser_download_url, size: asset.size || 0, page: j.html_url,
            sha256: String(asset.digest || "").replace(/^sha256:/i, ""),
            notes: String(j.body || "").split(/\*\*Installazione/i)[0].replace(/^#+\s.*$/gm, "").trim()
          };
        });
    },

    /** Finestra con le novità: AGGIORNA ORA o PIÙ TARDI. */
    prompt: function (info) {
      var UI = B.ui;
      var mb = info.size ? " Download: " + (info.size / 1048576).toFixed(1) + " MB." : "";
      var body = h("div", { class: "update" },
        h("p", null, "È disponibile Babbol ", h("b", null, info.version), " (hai la " + U.version() + ")." + mb),
        info.notes ? B.rich(info.notes.slice(0, 900)) : null);
      return UI.modal({ icon: "rocket", title: "Nuova versione disponibile", body: body, buttons: [
        { label: "AGGIORNA ORA", value: "go", cls: "primary" },
        { label: "PIÙ TARDI", value: false, cls: "ghost" }
      ] }).then(function (v) {
        if (v === "go") U.download(info); else remember(info.version);
      });
    },

    /** Scarica e installa: barra di avanzamento, poi l'installatore di sistema chiede conferma. */
    download: function (info) {
      var UI = B.ui;
      var fill = h("div", { class: "bar-fill" }), msg = h("p", { class: "muted center" }, "Download in corso...");
      var body = h("div", { class: "update" }, msg, h("div", { class: "bar" }, fill));
      var finished = false;
      UI.modal({ icon: "rocket", title: "Aggiornamento a " + info.version, body: body, buttons: [{ label: "ANNULLA", value: "cancel", cls: "ghost" }] }).then(function (v) {
        if (!finished && v !== true) { try { native.cancelUpdate(); } catch (e) { /* ignorato */ } }
      });
      window.__onUpdateProgress = function (p) { fill.style.width = p + "%"; msg.textContent = "Download in corso... " + p + "%"; };
      window.__onUpdateReady = function () {
        finished = true; UI.closeModal(true);
        UI.toast("Conferma l'installazione per completare l'aggiornamento");
      };
      window.__onUpdateError = function (code) {
        finished = true; UI.closeModal(true);
        var buttons = code === "permission"
          ? [{ label: "RIPROVA", value: "retry", cls: "primary" }, { label: "CHIUDI", value: false, cls: "ghost" }]
          : [{ label: "SCARICA DAL BROWSER", value: "browser", cls: "primary" }, { label: "RIPROVA", value: "retry", cls: "ghost" }, { label: "CHIUDI", value: false, cls: "ghost" }];
        UI.modal({ icon: "warn", title: "Aggiornamento non riuscito", body: ERRORS[code] || ERRORS.network, center: true, buttons: buttons }).then(function (v) {
          if (v === "retry") U.download(info);
          else if (v === "browser" && native.openReleasePage) native.openReleasePage(info.page);
        });
      };
      native.downloadUpdate(info.url, info.sha256 || "");
    },

    /** All'avvio: se c'è una versione nuova (e non l'hai rimandata da poco) mostra la finestra. Errori di rete: silenzio. */
    checkAtStart: function () {
      if (!U.canInstall()) return Promise.resolve(null);
      return U.latest().then(function (info) {
        if (!info) return null;
        var r = remembered();
        if (r && r.version === info.version && Date.now() - r.at < REMIND_MS) return null;
        U.prompt(info);
        return info;
      }, function () { return null; });
    },

    /** Dal Profilo: controllo a richiesta, con risposta anche se sei già aggiornato. */
    manualCheck: function () {
      var UI = B.ui;
      if (!U.canInstall()) return UI.alert("Aggiornamenti", "L'aggiornamento dall'app funziona sul telefono Android. Le nuove versioni sono su github.com/" + REPO + "/releases.");
      UI.toast("Controllo gli aggiornamenti...");
      return U.latest().then(function (info) {
        if (info) U.prompt(info); else UI.toast("Hai già l'ultima versione (" + U.version() + ")");
      }, function () { UI.alert("Aggiornamenti", "Non riesco a controllare gli aggiornamenti: sei offline?"); });
    }
  };
})(window.B);
