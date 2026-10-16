/*
 * Accesso obbligatorio: login, registrazione (con conferma via email), password dimenticata.
 * Il link nell'email apre l'app (babbol://auth-callback) e cloud.js completa l'accesso.
 */
(function (B) {
  "use strict";
  var h = B.h, UI = B.ui;
  var mode = "login", email = "", pending = null;

  function field(type, ph, value, auto) {
    return h("input", { class: "answer", type: type, placeholder: ph, value: value || "", autocomplete: auto, autocapitalize: "none", autocorrect: "off", spellcheck: "false" });
  }
  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
  function go(m) { mode = m; UI.init(); }

  function form(opts) {
    var err = h("div", { class: "auth-err" });
    var btn = h("button", { class: "btn primary big" }, opts.cta);
    var root = h("form", { class: "auth-form", onsubmit: function (e) {
      e.preventDefault();
      if (pending) return;
      err.textContent = "";
      var p = opts.submit(function (m) { err.textContent = m; });
      if (!p) return;
      pending = p; btn.disabled = true; btn.textContent = "Attendi...";
      p.catch(function (e) { err.textContent = e.message || String(e); })
        .then(function () { pending = null; btn.disabled = false; btn.textContent = opts.cta; });
    } }, opts.fields, err, btn);
    return root;
  }

  function screen(title, sub, body, links) {
    return h("div", { class: "auth" },
      h("div", { class: "auth-brand" }, h("img", { src: "img/logo.svg", alt: "", class: "auth-logo" }), h("div", { class: "brand big" }, "Babbol")),
      h("p", { class: "auth-claim" }, "Dall'A2 al B2: grammatica, lettura, ascolto, scrittura e parlato."),
      h("div", { class: "card auth-card" }, h("h2", null, title), sub ? h("p", { class: "muted" }, sub) : null, body),
      links ? h("div", { class: "auth-links" }, links) : null);
  }
  function link(text, fn) { return h("button", { class: "link-btn", type: "button", onclick: fn }, text); }

  var views = {
    login: function () {
      var e = field("email", "Email", email, "email"), p = field("password", "Password", "", "current-password");
      return screen("Accedi", null, form({ cta: "ACCEDI", fields: [e, p], submit: function (fail) {
        email = e.value.trim();
        if (!validEmail(email)) return fail("Inserisci un'email valida.");
        if (!p.value) return fail("Inserisci la password.");
        return B.cloud.signIn(email, p.value).catch(function (x) {
          if (x.code === "email_not_confirmed") { mode = "check"; UI.init(); }
          throw x;
        });
      } }), [link("Non hai un account? Registrati", function () { go("signup"); }), link("Password dimenticata?", function () { go("forgot"); })]);
    },
    signup: function () {
      var e = field("email", "Email", email, "email"), p = field("password", "Password (almeno 8 caratteri)", "", "new-password"), p2 = field("password", "Ripeti la password", "", "new-password");
      return screen("Crea il tuo account", "I progressi vengono salvati sul tuo account e li ritrovi su qualsiasi telefono.",
        form({ cta: "REGISTRATI", fields: [e, p, p2], submit: function (fail) {
          email = e.value.trim();
          if (!validEmail(email)) return fail("Inserisci un'email valida.");
          if (p.value.length < 8 || !/[A-Za-z]/.test(p.value) || !/\d/.test(p.value)) return fail("La password deve avere almeno 8 caratteri, con lettere e numeri.");
          if (p.value !== p2.value) return fail("Le due password non coincidono.");
          return B.cloud.signUp(email, p.value).then(function (r) { if (!r.confirmed) go("check"); });
        } }), [link("Hai già un account? Accedi", function () { go("login"); })]);
    },
    check: function () {
      var info = h("div", null,
        h("div", { class: "auth-mail" }, B.icon("mail", 48)),
        h("p", null, "Ti abbiamo mandato un'email a ", h("b", null, email || "il tuo indirizzo"), ". Apri il link dal telefono: l'app si aprirà già con l'accesso fatto."),
        h("p", { class: "muted small" }, "Se aprendo il link vedi una pagina di errore, l'email è comunque confermata: torna qui e accedi. Controlla anche lo spam."));
      var msg = h("div", { class: "auth-err ok" });
      var resend = h("button", { class: "btn ghost", type: "button", onclick: function () {
        if (!validEmail(email)) return go("signup");
        resend.disabled = true;
        B.cloud.resendConfirmation(email).then(function () { msg.textContent = "Email inviata di nuovo."; }, function (e) { msg.className = "auth-err"; msg.textContent = e.message; })
          .then(function () { setTimeout(function () { resend.disabled = false; }, 30000); });
      } }, "INVIA DI NUOVO");
      return screen("Conferma la tua email", null, h("div", null, info, resend, msg),
        [h("button", { class: "btn primary", type: "button", onclick: function () { go("login"); } }, "HO CONFERMATO, ACCEDI")]);
    },
    forgot: function () {
      var e = field("email", "Email", email, "email");
      var done = h("div", { class: "auth-err ok" });
      return screen("Password dimenticata", "Ti mandiamo un link per sceglierne una nuova.",
        h("div", null, form({ cta: "INVIA IL LINK", fields: [e], submit: function (fail) {
          email = e.value.trim();
          if (!validEmail(email)) return fail("Inserisci un'email valida.");
          return B.cloud.recover(email).then(function () { done.textContent = "Se l'email è registrata riceverai il link a breve. Aprilo dal telefono."; });
        } }), done), [link("Torna all'accesso", function () { go("login"); })]);
    }
  };

  function render() { return (views[mode] || views.login)(); }
  // il tasto indietro di Android nelle schermate secondarie torna al login
  render.back = function () { if (mode !== "login") { go("login"); return true; } return false; };
  UI.register("auth", render);

  /** Dopo un link di recupero: chiede la nuova password (l'utente ha già la sessione). */
  B.auth = {
    askNewPassword: function () {
      var p = field("password", "Nuova password", "", "new-password");
      var err = h("div", { class: "auth-err" });
      var body = h("div", null, p, err);
      function ask() {
        return UI.modal({ icon: "lock", title: "Scegli una nuova password", body: body, buttons: [{ label: "SALVA", value: true, cls: "primary" }] }).then(function (ok) {
          if (!ok) return;
          if (p.value.length < 8 || !/[A-Za-z]/.test(p.value) || !/\d/.test(p.value)) { err.textContent = "Almeno 8 caratteri, con lettere e numeri."; return ask(); }
          return B.cloud.updatePassword(p.value).then(function () { UI.toast("Password aggiornata"); }, function (e) { err.textContent = e.message; return ask(); });
        });
      }
      return ask();
    },
    reset: function () { mode = "login"; }
  };
})(window.B);
