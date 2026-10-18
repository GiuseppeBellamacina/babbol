/*
 * Shell dell'interfaccia: barra superiore, tab bar, pila di pagine, modali, toast.
 * Le schermate stanno in home.js / practice.js / resources.js / profile.js (e auth.js per l'accesso)
 * e si registrano con B.ui.register(nome, funzioneDiRender).
 */
(function (B) {
  "use strict";
  var h = B.h;

  var TABS = [
    { id: "home", icon: "path", label: "Percorso" },
    { id: "practice", icon: "review", label: "Ripasso" },
    { id: "resources", icon: "library", label: "Risorse" },
    { id: "profile", icon: "user", label: "Profilo" }
  ];

  var views = {};            // nome tab -> () => HTMLElement
  var tab = "home";
  var stack = [];            // pagine "dettaglio": { title, render, opts }
  var els = {};
  var firstHome = true;

  var UI = B.ui = {
    register: function (name, fn) { views[name] = fn; },

    init: function () {
      var app = document.getElementById("app");
      app.innerHTML = "";
      els = {};
      UI.applyTheme();
      if (!B.cloud.loggedIn()) {
        // accesso obbligatorio: finché non c'è una sessione si vede solo la schermata di login
        app.appendChild(views.auth());
        return;
      }
      els.top = h("div", { class: "topbar" });
      els.screen = h("main", { class: "screen" });
      els.tabs = h("nav", { class: "tabbar" }, TABS.map(function (t) {
        return h("button", { class: "tab", "data-tab": t.id, onclick: function () { UI.goTab(t.id); } },
          B.icon(t.icon, 24, "tab-icon"), h("span", { class: "tab-label" }, t.label));
      }));
      app.appendChild(els.top); app.appendChild(els.screen); app.appendChild(els.tabs);
      tab = "home"; stack = []; firstHome = true;
      UI.refresh(true);
    },

    applyTheme: function () {
      var t = B.store.settings().theme;
      if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
      else document.documentElement.removeAttribute("data-theme");
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", UI.isDark() ? "#121a20" : "#ffffff");
      if (window.AndroidBridge && window.AndroidBridge.setStatusBar) {
        try { window.AndroidBridge.setStatusBar(UI.isDark()); } catch (e) { /* ignorato */ }
      }
    },
    isDark: function () {
      var t = B.store.settings().theme;
      return t === "dark" || (t !== "light" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
    },

    goTab: function (id) {
      B.speech.stop();
      tab = id; stack = [];
      firstHome = true;
      UI.refresh(true);
    },
    push: function (title, render, opts) {
      stack.push({ title: title, render: render, opts: opts || {} });
      UI.refresh(true);
    },
    pop: function () {
      if (!stack.length) return false;
      B.speech.stop();
      stack.pop(); UI.refresh(true); return true;
    },

    // Ridisegna la schermata corrente. fromTop=true => parte dall'alto, altrimenti conserva lo scroll.
    refresh: function (fromTop) {
      if (!els.screen) return;
      var st = els.screen.scrollTop;
      var page = stack.length ? stack[stack.length - 1] : null;
      els.screen.innerHTML = "";
      els.screen.appendChild(page ? page.render() : views[tab]());
      els.screen.scrollTop = fromTop ? 0 : st;
      UI.drawTop(page);
      Array.prototype.forEach.call(els.tabs.children, function (b) { b.classList.toggle("active", b.getAttribute("data-tab") === tab); });
      if (tab === "home" && !page && fromTop && firstHome) {
        firstHome = false;
        var cur = els.screen.querySelector(".unit-card.current");
        if (cur) setTimeout(function () { cur.scrollIntoView({ block: "center" }); }, 30);
      }
    },

    drawTop: function (page) {
      var S = B.store;
      els.top.innerHTML = "";
      if (page) {
        els.top.appendChild(h("button", { class: "icon-btn", "aria-label": "Indietro", onclick: UI.pop }, B.icon("back", 22)));
        els.top.appendChild(h("div", { class: "top-title" }, page.title));
        els.top.appendChild(h("div", { class: "spacer" }));
        return;
      }
      els.top.appendChild(h("div", { class: "brand" }, "Babbol"));
      var cefr = B.path.cefr();
      els.top.appendChild(h("div", { class: "pills" },
        h("button", { class: "pill level", onclick: function () { UI.goTab("profile"); } }, cefr.current),
        h("button", { class: "pill streak" + (S.streak() ? "" : " off"), onclick: UI.explainStreak }, B.icon("flame", 18), " " + S.streak()),
        h("button", { class: "pill time", onclick: UI.explainGoal }, B.icon("clock", 18), " " + S.minutesToday() + "/" + S.get().goal + "'")));
    },

    explainStreak: function () {
      var s = B.store.streak();
      UI.alert("Serie giornaliera", s
        ? "Studi da " + B.pluralize(s, "giorno", "giorni") + " di fila. Basta una sessione al giorno per non interromperla."
        : "Completa una sessione oggi per iniziare la tua serie.");
    },
    explainGoal: function () {
      var S = B.store;
      UI.alert("Obiettivo di oggi", "Hai studiato " + S.minutesToday() + " minuti su " + S.get().goal + ". " +
        "Per passare da A2 a B2 servono circa 300-400 ore di studio: con un'ora al giorno sono 10-12 mesi. Puoi cambiare l'obiettivo dal Profilo.");
    },

    // ---------- tasto indietro di Android ----------
    back: function () {
      if (document.getElementById("modal").classList.contains("open")) { UI.closeModal(false); return true; }
      if (B.session.isOpen()) { B.session.back(); return true; }
      if (UI.pop()) return true;
      if (els.tabs && tab !== "home") { UI.goTab("home"); return true; }
      if (views.auth && views.auth.back && views.auth.back()) return true;
      return false; // lascia chiudere l'app
    },

    // ---------- modali ----------
    _resolve: null,
    modal: function (opts) {
      var m = document.getElementById("modal");
      m.innerHTML = "";
      var sheet = h("div", { class: "sheet" + (opts.center ? " center" : "") + (opts.tall ? " tall" : "") });
      if (opts.icon) sheet.appendChild(h("div", { class: "sheet-icon" }, B.icon(opts.icon, 40)));
      sheet.appendChild(h("h3", null, opts.title));
      if (opts.body) sheet.appendChild(typeof opts.body === "string" ? h("p", { class: "sheet-text" }, opts.body) : opts.body);
      var actions = h("div", { class: "sheet-actions" });
      (opts.buttons || []).forEach(function (b) {
        actions.appendChild(h("button", { class: "btn " + (b.cls || "ghost"), onclick: function () { UI.closeModal(b.value); } }, b.label));
      });
      sheet.appendChild(actions);
      m.appendChild(sheet);
      m.classList.add("open");
      m.onclick = function (e) { if (e.target === m) UI.closeModal(false); };
      return new Promise(function (res) { UI._resolve = res; });
    },
    closeModal: function (val) {
      var m = document.getElementById("modal");
      m.classList.remove("open");
      m.innerHTML = "";
      var r = UI._resolve; UI._resolve = null;
      if (r) r(val);
    },
    confirm: function (o) {
      return UI.modal({ title: o.title, body: o.text, center: true, buttons: [
        { label: o.cancel || "ANNULLA", value: false, cls: "primary" },
        { label: o.ok || "OK", value: true, cls: o.danger ? "danger-outline" : "ghost" }
      ] });
    },
    alert: function (title, text) {
      return UI.modal({ title: title, body: text, center: true, buttons: [{ label: "OK", value: true, cls: "primary" }] });
    },
    toast: function (msg) {
      var t = h("div", { class: "toast" }, msg);
      document.body.appendChild(t);
      setTimeout(function () { t.classList.add("out"); }, 2200);
      setTimeout(function () { t.remove(); }, 2700);
    },

    // piccole componenti riusabili
    sectionTitle: function (text, sub) {
      return h("div", { class: "section-title" }, h("h3", null, text), sub ? h("p", { class: "muted" }, sub) : null);
    },
    speakable: function (en, it, cls) {
      return h("div", { class: "speakable " + (cls || ""), onclick: function () { B.speech.speak(en); B.sfx.tap(); } },
        h("div", { class: "sp-en" }, en, " ", B.icon("speaker", 15, "mini")), it ? h("div", { class: "sp-it" }, it) : null);
    },
    rowCard: function (icon, title, sub, right, onclick, cls) {
      return h("button", { class: "card row-card" + (cls ? " " + cls : ""), onclick: onclick },
        h("div", { class: "row-icon" }, B.icon(icon, 24)),
        h("div", { class: "grow" }, h("div", { class: "row-title" }, title), sub ? h("div", { class: "muted" }, sub) : null),
        right == null ? h("div", { class: "chev" }, B.icon("chevron", 18)) : right);
    }
  };

  window.__back = function () { return UI.back(); };
})(window.B);
