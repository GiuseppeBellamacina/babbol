/*
 * Collegamento con Supabase: autenticazione, sincronizzazione progressi, aggiornamento contenuti.
 *
 * Solo fetch() verso le API REST (niente librerie, niente timer in background) per tenere basso il numero di richieste:
 *  - token rinnovato solo quando è scaduto e serve davvero
 *  - contenuti: get_course_changes al massimo ogni contentCheckHours (solo i delta)
 *  - progressi: lettura al login e al massimo ogni 6 ore; salvataggio solo se ci sono modifiche,
 *    al massimo ogni syncMinSeconds (e quando l'app va in background)
 * Tipicamente 5-15 richieste al giorno per utente.
 */
(function (B) {
  "use strict";

  var CFG = B.config;
  var SKEY = "babbol.session.v1";
  var MKEY = "babbol.cloud.v1";
  var PULL_EVERY = 6 * 3600 * 1000;
  var session = read(SKEY);
  var meta = read(MKEY) || { contentAt: 0, syncAt: 0, pullAt: 0 };
  var syncing = null, refreshing = null;

  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function write(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignorato */ } }
  function saveMeta() { write(MKEY, meta); }

  // ---------------------------------------------------------------- HTTP
  var MESSAGES = {
    invalid_credentials: "Email o password non corretti.",
    email_not_confirmed: "Devi prima confermare l'email: apri il link che ti abbiamo mandato.",
    user_already_exists: "Esiste già un account con questa email. Prova ad accedere.",
    email_exists: "Esiste già un account con questa email. Prova ad accedere.",
    weak_password: "Password troppo debole: usa almeno 8 caratteri, con lettere e numeri.",
    over_email_send_rate_limit: "Abbiamo inviato troppe email in poco tempo. Riprova tra un'ora.",
    over_request_rate_limit: "Troppi tentativi. Aspetta qualche minuto.",
    email_address_invalid: "Indirizzo email non valido.",
    validation_failed: "Controlla i dati inseriti.",
    same_password: "La nuova password deve essere diversa dalla precedente.",
    otp_expired: "Il link è scaduto o è già stato usato. Richiedine uno nuovo.",
    // il servizio email integrato di Supabase scrive solo agli indirizzi del team finché non c'è uno SMTP proprio
    email_address_not_authorized: "Per ora la registrazione è aperta solo agli indirizzi invitati. Contatta chi ti ha dato l'app.",
    signup_mail_failed: "Non è stato possibile inviare l'email di conferma. Riprova più tardi o contatta chi ti ha dato l'app."
  };
  function CloudError(status, code, message) {
    var e = new Error(MESSAGES[code] || message || "Errore di rete");
    e.status = status; e.code = code || (status ? "http_" + status : "network");
    return e;
  }

  // niente keepalive: Chromium lo limita a ~64 KB di corpo e lo stato dei progressi può superarli.
  // Su Android la pagina non viene distrutta quando l'app va in background, quindi non serve.
  function request(method, path, body, opts) {
    opts = opts || {};
    var headers = { apikey: CFG.supabaseKey, "Content-Type": "application/json" };
    if (opts.token) headers.Authorization = "Bearer " + opts.token;
    return fetch(CFG.supabaseUrl + path, {
      method: method, headers: headers, body: body == null ? undefined : JSON.stringify(body)
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null;
        try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
        if (!r.ok) throw CloudError(r.status, j && (j.error_code || j.code || j.error), j && (j.msg || j.message || j.error_description));
        return j;
      });
    }, function () { throw CloudError(0, "network", "Sei offline o il server non risponde."); });
  }

  // ---------------------------------------------------------------- sessione
  function setSession(s) {
    session = s ? {
      access_token: s.access_token, refresh_token: s.refresh_token,
      expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
      user: { id: s.user.id, email: s.user.email }
    } : null;
    write(SKEY, session);
  }
  // token valido (rinnovato solo se scade entro un minuto)
  function token() {
    if (!session) return Promise.reject(CloudError(401, "no_session", "Non hai effettuato l'accesso."));
    if (session.expires_at - 60 > Date.now() / 1000) return Promise.resolve(session.access_token);
    if (!refreshing) {
      refreshing = request("POST", "/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh_token })
        .then(function (s) { setSession(s); return s.access_token; })
        .catch(function (e) {
          // refresh token revocato/scaduto: bisogna rifare l'accesso (offline invece si riprova più tardi).
          // I progressi locali NON si cancellano: se rientra lo stesso utente verranno uniti e salvati.
          if (e.status === 400 || e.status === 401) Cloud._signedOut(false);
          throw e;
        })
        .then(function (t) { refreshing = null; return t; }, function (e) { refreshing = null; throw e; });
    }
    return refreshing;
  }
  function rpc(name, args, opts) {
    return token().then(function (t) { return request("POST", "/rest/v1/rpc/" + name, args || {}, Object.assign({ token: t }, opts)); });
  }

  // ---------------------------------------------------------------- progressi
  function pull() {
    return token().then(function (t) {
      return request("GET", "/rest/v1/user_progress?select=state,rev", null, { token: t });
    }).then(function (rows) {
      var row = rows && rows[0];
      B.store.absorb(row ? row.state : null, row ? row.rev : 0);
      meta.pullAt = Date.now(); saveMeta();
    });
  }

  function save(retry) {
    var S = B.store, sentT = S.get().t;
    return rpc("save_progress", { p_state: S.snapshot(), p_base_rev: S.get().rev }).then(function (r) {
      if (r && r.ok) { S.markSynced(r.rev, sentT); meta.syncAt = Date.now(); saveMeta(); return true; }
      // un altro dispositivo ha salvato nel frattempo: si uniscono i due stati e si riprova una volta
      S.absorb(r.state, r.rev);
      return retry ? false : save(true);
    });
  }

  var Cloud = B.cloud = {
    user: function () { return session && session.user; },
    loggedIn: function () { return !!session; },
    onChange: null,            // chiamata quando cambia lo stato di login (impostata dalla UI)

    signUp: function (email, password) {
      return request("POST", "/auth/v1/signup?redirect_to=" + encodeURIComponent(CFG.authRedirect), { email: email, password: password })
        .then(function (r) {
          if (r && r.access_token) { setSession(r); return Cloud._afterLogin().then(function () { return { confirmed: true }; }); }
          // Supabase non rivela se l'email esiste già: in quel caso identities è vuoto
          if (r && r.identities && r.identities.length === 0) throw CloudError(422, "user_already_exists");
          return { confirmed: false };
        }, function (e) {
          // errore del server nell'invio dell'email di conferma (es. SMTP non configurato)
          if (e.status >= 500 || /sending confirmation|error sending/i.test(e.message)) throw CloudError(e.status, "signup_mail_failed");
          throw e;
        });
    },
    signIn: function (email, password) {
      return request("POST", "/auth/v1/token?grant_type=password", { email: email, password: password })
        .then(function (s) { setSession(s); return Cloud._afterLogin(); });
    },
    resendConfirmation: function (email) {
      return request("POST", "/auth/v1/resend", { type: "signup", email: email, options: { email_redirect_to: CFG.authRedirect } });
    },
    recover: function (email) {
      return request("POST", "/auth/v1/recover?redirect_to=" + encodeURIComponent(CFG.authRedirect), { email: email });
    },
    updatePassword: function (password) {
      return token().then(function (t) { return request("PUT", "/auth/v1/user", { password: password }, { token: t }); });
    },
    /**
     * Uscita volontaria. Prima si salvano i progressi: se non è possibile (offline) e force non è true,
     * la Promise viene rifiutata con code "unsynced" e la UI chiede conferma (uscendo si perderebbero).
     */
    signOut: function (force) {
      var done = function () { Cloud._signedOut(true); };
      return Cloud.sync(true).then(function () { return true; }, function () { return false; }).then(function (saved) {
        if (!saved && B.store.get().dirty && !force) throw CloudError(0, "unsynced", "Alcuni progressi non sono ancora stati salvati sul server (sei offline?).");
        return token().then(function (t) { return request("POST", "/auth/v1/logout", null, { token: t }); }).then(done, done);
      });
    },
    deleteAccount: function () {
      return rpc("delete_my_account").then(function () { Cloud._signedOut(true); });
    },

    /**
     * Link aperto dall'email (conferma registrazione o recupero password): babbol://auth-callback#access_token=...
     * Ritorna una Promise con il tipo ("signup", "recovery", ...).
     */
    handleCallback: function (url) {
      var frag = String(url || "").split("#")[1] || String(url || "").split("?")[1] || "";
      var p = {};
      frag.split("&").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, " ")); });
      if (p.error || p.error_code) return Promise.reject(CloudError(400, p.error_code, p.error_description));
      if (!p.access_token || !p.refresh_token) return Promise.reject(CloudError(400, "bad_link", "Link non valido."));
      return request("GET", "/auth/v1/user", null, { token: p.access_token }).then(function (user) {
        setSession({ access_token: p.access_token, refresh_token: p.refresh_token, expires_at: +p.expires_at || 0, expires_in: +p.expires_in || 3600, user: user });
        return Cloud._afterLogin().then(function () { return p.type || "signup"; });
      });
    },

    _afterLogin: function () {
      B.store.claim(session.user.id);
      if (Cloud.onChange) Cloud.onChange(true);
      // progressi del server (nuovo dispositivo o nuovo utente) + eventuali contenuti nuovi
      return Promise.all([pull().catch(function (e) { console.warn("pull", e); }), Cloud.checkContent(true).catch(function () { /* offline */ })]);
    },
    // wipe = true solo per uscita volontaria o account eliminato
    _signedOut: function (wipe) {
      setSession(null);
      meta = { contentAt: meta.contentAt, syncAt: 0, pullAt: 0 }; saveMeta();
      if (wipe) B.store.wipe();
      if (Cloud.onChange) Cloud.onChange(false);
    },

    /** Salva i progressi se ci sono modifiche. force = ignora l'intervallo minimo. */
    sync: function (force) {
      if (!session || !B.store.get().dirty) return Promise.resolve(false);
      if (!force && Date.now() - meta.syncAt < CFG.syncMinSeconds * 1000) return Promise.resolve(false);
      if (syncing) return syncing;
      syncing = save(false).then(function (r) { syncing = null; return r; }, function (e) { syncing = null; throw e; });
      return syncing;
    },

    /** Scarica i contenuti cambiati (al massimo una volta ogni contentCheckHours, salvo force). */
    checkContent: function (force) {
      if (!session) return Promise.resolve(0);
      if (!force && Date.now() - meta.contentAt < CFG.contentCheckHours * 3600 * 1000) return Promise.resolve(0);
      var since = B.repo.rev();
      return rpc("get_course_changes", { p_since: since }).then(function (r) {
        meta.contentAt = Date.now(); saveMeta();
        // il server ha un rev più basso (database ricaricato): si riscarica tutto
        if (r.rev < since) return rpc("get_course_changes", { p_since: 0 }).then(function (all) { B.repo.replaceAll(all); return all.items.length; });
        return r.items.length ? B.repo.applyChanges(r) : 0;
      }).then(function (n) {
        if (n && B.ui && B.ui.refresh && !(B.session && B.session.isOpen())) B.ui.refresh();
        return n;
      });
    },

    /** All'avvio e al ritorno in primo piano: tutto ciò che serve, rispettando gli intervalli. */
    wake: function () {
      if (!session) return Promise.resolve();
      var jobs = [Cloud.checkContent(false).catch(function () { /* offline */ })];
      if (Date.now() - meta.pullAt > PULL_EVERY) jobs.push(pull().catch(function () { /* offline */ }));
      return Promise.all(jobs).then(function () { return Cloud.sync(false).catch(function () { /* offline */ }); });
    }
  };

  // in background: si salva subito (con keepalive), ma non più di una volta ogni 30 secondi
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { if (Date.now() - meta.syncAt > 60000) Cloud.sync(true).catch(function () { /* offline */ }); }
    else Cloud.wake();
  });
  window.__onAuthCallback = function (url) { if (Cloud.onCallback) Cloud.onCallback(url); };
})(window.B);
