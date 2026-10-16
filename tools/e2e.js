/*
 * Test end-to-end di Babbol nel Chromium headless (viewport da telefono), con Supabase simulato.
 *
 *   docker run --rm -v "$PWD":/app babbol-build node tools/e2e.js          (FULL=1 per giocare tutte le lezioni)
 *
 * Verifica:
 *  - nessun errore JS e nessuna emoji visibile in nessuna schermata
 *  - accesso obbligatorio: registrazione con conferma email, errori di login, login, logout
 *  - ogni tipo di step giocato cliccando davvero (risposte giuste e sbagliate)
 *  - test di unità: bocciatura e superamento con sblocco dell'unità successiva; esami e test d'ingresso
 *  - ripasso, errori, allenamenti per abilità, risorse, profilo, tema scuro
 *  - sincronizzazione dei progressi (anche con conflitto tra dispositivi) e delta dei contenuti
 *  - numero di richieste a Supabase contenuto
 *  - contratto con il ponte Android simulato (voce, riconoscimento, deep link)
 *  - screenshot in build/shots
 */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, "build", "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const PAGE = "file://" + path.join(ROOT, "www", "index.html");
const API = "https://xmitklupdqpnzcviimvx.supabase.co";
const FULL = !!process.env.FULL;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;
// testo visibile senza le immagini-emoji dei vocaboli (le uniche emoji ammesse)
const TEXT_NO_PICS = () => { const c = document.body.cloneNode(true); c.querySelectorAll(".emoji-pic").forEach((e) => e.remove()); return c.textContent; };

let failures = 0;
function ok(cond, msg) {
  if (cond) console.log("  ok  " + msg);
  else { failures++; console.log("  FALLITO: " + msg); }
}

// ---------------------------------------------------------------- Supabase finto
function bundleRows() {
  const src = fs.readFileSync(path.join(ROOT, "www", "content", "course.js"), "utf8");
  return JSON.parse(src.slice(src.indexOf("=") + 1).trim().replace(/;$/, ""));
}
function makeServer() {
  const base = bundleRows();
  // come dopo una vera pubblicazione: il server ha le stesse righe dello snapshot, con lo stesso rev
  if (!base.rev) throw new Error("lo snapshot deve avere rev >= 1 (node tools/content.js bundle 1, o publish)");
  const content = base.items.map((r) => Object.assign({}, r, { rev: base.rev, deleted: false }));
  const S = {
    users: {}, progress: {}, content, calls: [], conflictOnce: false,
    session(u) { return { access_token: "tok-" + u.id + "-" + Date.now(), refresh_token: "ref-" + u.id, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u.id, email: u.email } }; },
    maxRev() { return Math.max(0, ...S.content.map((r) => r.rev)); },
    touch(id, fn) { const r = S.content.find((x) => x.id === id); fn(r); r.rev = S.maxRev() + 1; },
    uid(req) { const a = req.headers()["authorization"] || ""; const m = /tok-(u\d+)-/.exec(a); return m ? m[1] : null; }
  };
  S.handle = async (route) => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors() });
    S.calls.push(method + " " + p + url.search);
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const json = (status, obj) => route.fulfill({ status, contentType: "application/json", headers: cors(), body: obj == null ? "" : JSON.stringify(obj) });
    if (p === "/auth/v1/signup") {
      if (Object.values(S.users).some((u) => u.email === body.email)) return json(200, { id: "x", email: body.email, identities: [] });
      const id = "u" + (Object.keys(S.users).length + 1);
      S.users[id] = { id, email: body.email, password: body.password, confirmed: false };
      return json(200, { id, email: body.email, identities: [{ id: "i" }] });
    }
    if (p === "/auth/v1/token") {
      const gt = url.searchParams.get("grant_type");
      if (gt === "password") {
        const u = Object.values(S.users).find((x) => x.email === body.email && x.password === body.password);
        if (!u) return json(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
        if (!u.confirmed) return json(400, { error_code: "email_not_confirmed", msg: "Email not confirmed" });
        return json(200, S.session(u));
      }
      const u = S.users[(body.refresh_token || "").replace("ref-", "")];
      return u ? json(200, S.session(u)) : json(400, { error_code: "refresh_token_not_found" });
    }
    if (p === "/auth/v1/user") { const u = S.users[S.uid(req)]; return u ? json(200, { id: u.id, email: u.email }) : json(401, { msg: "bad jwt" }); }
    if (p === "/auth/v1/logout") return json(204, null);
    if (p === "/auth/v1/recover" || p === "/auth/v1/resend") return json(200, {});
    const uid = S.uid(req);
    if (p.startsWith("/rest/") && !uid) return json(401, { message: "JWT required" });
    if (p === "/rest/v1/rpc/get_course_changes") {
      const since = body.p_since || 0;
      const items = S.content.filter((r) => r.rev > since && (since > 0 || !r.deleted)).sort((a, b) => a.rev - b.rev)
        .map((r) => ({ id: r.id, kind: r.kind, parent: r.parent, position: r.position, data: r.deleted ? null : r.data, deleted: r.deleted }));
      return json(200, { rev: S.maxRev(), items });
    }
    if (p === "/rest/v1/user_progress") { const pr = S.progress[uid]; return json(200, pr ? [{ state: pr.state, rev: pr.rev }] : []); }
    if (p === "/rest/v1/rpc/save_progress") {
      const cur = S.progress[uid];
      if (S.conflictOnce && cur) {
        // un "altro dispositivo" ha salvato nel frattempo con più XP e un badge in più
        S.conflictOnce = false;
        cur.state = Object.assign({}, cur.state, { xp: (cur.state.xp || 0) + 1000, badges: Object.assign({ other_device: 1 }, cur.state.badges) });
        cur.rev++;
      }
      if (!cur) { S.progress[uid] = { state: body.p_state, rev: 1 }; return json(200, { ok: true, rev: 1 }); }
      if (cur.rev !== body.p_base_rev) return json(200, { ok: false, rev: cur.rev, state: cur.state });
      cur.state = body.p_state; cur.rev++;
      return json(200, { ok: true, rev: cur.rev });
    }
    if (p === "/rest/v1/rpc/delete_my_account") { delete S.users[uid]; delete S.progress[uid]; return json(200, null); }
    return json(404, { message: "not mocked " + p });
  };
  return S;
}
function cors() { return { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }; }

// ---------------------------------------------------------------- solver delle sessioni
async function solveStep(page, mode) {
  // mode: "right" | "wrong" | "mixed"
  const st = await page.evaluate(() => {
    const s = B.session._state();
    if (!s) return null;
    return { phase: s.phase, step: s.step, quiet: !!s.cfg.quiet };
  });
  if (!st) return "closed";
  const main = page.locator(".s-foot .btn");
  if (st.phase === "done") { await main.click(); return "closed"; }
  if (st.phase === "feedback") { await main.click(); return "next"; }
  const s = st.step;
  const wrong = mode === "wrong" || (mode === "mixed" && Math.random() < 0.3);
  const body = page.locator(".s-body");
  const clickOpt = async (scope, label) => scope.locator(".opt", { hasText: label }).filter({ hasText: new RegExp("^" + esc(label) + "$") }).first().click();
  const pickWrong = (opts, a) => opts.find((_, i) => i !== a);
  const fill = async (sel, value) => { const el = body.locator(sel).first(); await el.fill(value); };
  switch (s.t) {
    case "learn": case "note": case "partIntro":
      await main.click(); return "next";
    case "mc": case "gap":
      await clickOpt(body, wrong ? pickWrong(s.opts, s.a) : s.opts[s.a]); break;
    case "type": case "transform": case "wordform":
      await fill(".answer", wrong ? "zzz" : s.answers[0]); break;
    case "fix":
      await fill(".answer", wrong ? s.s : s.answers[0]); break;
    case "dictation":
      await fill(".answer", wrong ? "nothing" : s.en); break;
    case "order": {
      const words = s.en.replace(/[.!?]+$/, "").split(/\s+/);
      if (wrong) await body.locator(".bank .tok:not(.ghost)").first().click();
      else for (const w of words) await body.locator(".bank button.tok", { hasText: new RegExp("^" + esc(w) + "$") }).first().click();
      break;
    }
    case "match": {
      if (wrong) {
        // errore voluto: il primo inglese con il secondo italiano
        await body.locator(".col").nth(0).locator(".opt", { hasText: new RegExp("^" + esc(s.pairs[0][0]) + "$") }).click();
        await body.locator(".col").nth(1).locator(".opt", { hasText: new RegExp("^" + esc(s.pairs[1][1]) + "$") }).click();
        await page.waitForTimeout(460);
      }
      for (const [en, it] of s.pairs) {
        await body.locator(".col").nth(0).locator(".opt", { hasText: new RegExp("^" + esc(en) + "$") }).click();
        await body.locator(".col").nth(1).locator(".opt", { hasText: new RegExp("^" + esc(it) + "$") }).click();
      }
      await page.waitForTimeout(450);
      return "next";
    }
    case "dialog": {
      const choices = s.lines.filter((l) => typeof l[1] === "object");
      const bubbles = body.locator(".bubble.choice");
      for (let i = 0; i < choices.length; i++) {
        const c = choices[i][1];
        await clickOpt(bubbles.nth(i), wrong ? pickWrong(c.opts, c.a) : c.opts[c.a]);
      }
      break;
    }
    case "read": case "listen": {
      const boxes = body.locator(".qbox");
      for (let i = 0; i < s.qs.length; i++) {
        const q = s.qs[i];
        if (q.answers) await boxes.nth(i).locator(".answer").fill(wrong ? "zzz" : q.answers[0]);
        else await clickOpt(boxes.nth(i), wrong ? pickWrong(q.opts, q.a) : q.opts[q.a]);
      }
      break;
    }
    case "cloze": {
      const f = body.locator(".cloze-text .gap-sel, .cloze-text .answer");
      for (let i = 0; i < s.gaps.length; i++) {
        const g = s.gaps[i];
        if (s.mode === "mc") await f.nth(i).selectOption(String(wrong ? (g.a + 1) % g.opts.length : g.a));
        else await f.nth(i).fill(wrong ? "zzz" : g.answers[0]);
      }
      break;
    }
    case "speak":
      await body.locator(".btn.primary", { hasText: "FATTO" }).click(); return "next";
    case "speakTask":
      await body.locator(".btn.blue", { hasText: "CONFRONTA" }).click();
      await body.locator(".self-rate .btn").nth(wrong ? 2 : 0).click();
      return "next";
    case "write": {
      // errore voluto: testo inviabile ma sotto la lunghezza minima
      const all = (s.model + " ").repeat(3).split(/\s+/).filter(Boolean);
      const words = all.slice(0, wrong ? Math.ceil(Math.max(10, s.min * 0.6)) + 1 : s.min + 2).join(" ");
      await fill("textarea.answer", words);
      await body.locator(".btn.blue", { hasText: "HO FINITO" }).click();
      if (!wrong) { const boxes = body.locator(".check-row input"); for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check(); }
      await body.locator(".btn.primary", { hasText: "CONFERMA" }).click();
      return "next";
    }
    default:
      throw new Error("tipo di step non gestito dal test: " + s.t);
  }
  await main.click();
  return "next";
}
function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

async function play(page, cfgExpr, mode, seen, arg) {
  await page.evaluate(cfgExpr, arg);
  let guard = 0, emojiFound = null;
  for (;;) {
    if (++guard > 400) throw new Error("sessione infinita");
    const t = await page.evaluate(() => { const s = B.session._state(); return s && s.step ? s.step.t : null; });
    if (t && seen) seen[t] = (seen[t] || 0) + 1;
    const txt = await page.evaluate(TEXT_NO_PICS);
    if (EMOJI.test(txt) && !emojiFound) emojiFound = txt.match(EMOJI)[0];
    if ((await solveStep(page, mode)) === "closed") break;
  }
  return emojiFound;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const server = makeServer();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, locale: "it-IT" });
  // niente riconoscimento vocale del browser: gli step "parla" vanno in modalità manuale (FATTO)
  await ctx.addInitScript(() => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; });
  await ctx.route(API + "/**", server.handle);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/status of (400|401|404)/.test(m.text())) errors.push("console: " + m.text()); });
  page.on("dialog", (d) => d.dismiss());
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });
  const noEmoji = async (where) => {
    const txt = await page.evaluate(TEXT_NO_PICS);
    const m = txt.match(EMOJI);
    ok(!m, "nessuna emoji fuori dalle immagini dei vocaboli: " + where + (m ? " (trovata " + m[0] + ")" : ""));
  };

  await page.goto(PAGE);

  // ---------------------------------------------------------------- contenuti inclusi
  console.log("Contenuti");
  const c = await page.evaluate(() => ({ units: B.repo.units().length, lessons: B.repo.allLessons().length, words: B.repo.allWords().length, rev: B.repo.rev(), res: B.repo.resources().length }));
  ok(c.units >= 1 && c.lessons === c.units * 7, "unità caricate dallo snapshot (" + c.units + " unità, " + c.lessons + " lezioni, " + c.words + " parole)");

  // ---------------------------------------------------------------- accesso
  console.log("Accesso obbligatorio");
  await page.waitForSelector(".auth");
  ok(await page.locator(".tabbar").count() === 0, "senza login non si vede l'app, solo la schermata di accesso");
  await shot("01-login");
  await noEmoji("login");
  await page.locator(".link-btn", { hasText: "Registrati" }).click();
  const inputs = page.locator(".auth-form input");
  await inputs.nth(0).fill("mario@example.com"); await inputs.nth(1).fill("short"); await inputs.nth(2).fill("short");
  await page.locator(".auth-form .btn").click();
  ok(/almeno 8 caratteri/.test(await page.locator(".auth-err").first().innerText()), "password debole rifiutata lato app");
  await inputs.nth(1).fill("Password123"); await inputs.nth(2).fill("Password123");
  await page.locator(".auth-form .btn").click();
  await page.waitForSelector(".auth-mail");
  ok(true, "dopo la registrazione: schermata «conferma la tua email»");
  await shot("02-check-email");
  await page.locator(".btn", { hasText: "HO CONFERMATO" }).click();
  await page.locator(".auth-form input").nth(0).fill("mario@example.com");
  await page.locator(".auth-form input").nth(1).fill("Password123");
  await page.locator(".auth-form .btn").click();
  await page.waitForSelector(".auth-mail");
  ok(true, "login prima della conferma: rimanda a «conferma la tua email»");
  server.users.u1.confirmed = true;
  await page.locator(".btn", { hasText: "HO CONFERMATO" }).click();
  await page.locator(".auth-form input").nth(1).fill("Sbagliata1");
  await page.locator(".auth-form .btn").click();
  await page.waitForFunction(() => /non corretti/.test(document.querySelector(".auth-err").textContent));
  ok(true, "password sbagliata: messaggio in italiano");
  await page.locator(".auth-form input").nth(1).fill("Password123");
  await page.locator(".auth-form .btn").click();
  await page.waitForSelector(".tabbar");
  ok(await page.evaluate(() => B.store.owner() === "u1"), "login riuscito: i progressi appartengono all'utente");
  ok(server.calls.some((x) => x.includes("get_course_changes")) && server.calls.some((x) => x.includes("user_progress")), "al login: progressi e contenuti letti dal server");

  // ---------------------------------------------------------------- percorso
  console.log("Percorso");
  await page.waitForSelector(".today");
  ok(await page.locator(".pill.hearts").count() === 0 && !/cuori|vite/i.test(await page.evaluate(() => document.body.innerText)), "niente cuori né vite");
  await shot("03-home");
  await noEmoji("home");
  const hasPlacement = await page.evaluate(() => !!B.repo.placement());
  if (hasPlacement) {
    ok(await page.locator(".placement").count() === 1, "nuovo utente: proposta del test d'ingresso");
    await play(page, () => B.session.start(B.engine.placementSession()), "right");
    ok(await page.evaluate(() => B.store.get().placement && B.store.get().placement.level === "B2"), "test d'ingresso tutto giusto -> parte da B2");
    await page.evaluate(() => { B.store.setPlacement("A2", {}); B.ui.refresh(); });
  } else {
    console.log("  (test d'ingresso non ancora presente nei contenuti)");
    await page.evaluate(() => { B.store.setPlacement("A2", {}); B.ui.refresh(); });
  }
  ok(await page.evaluate(() => B.store.get().placement.level === "A2"), "livello di partenza A2");

  const units = await page.evaluate(() => B.repo.units().map((u) => u.id));
  const firstUnit = units[0];
  await page.locator(".unit-card").first().click();
  await shot("04-unit");
  await noEmoji("pagina unità");
  await page.evaluate(() => B.ui.pop());

  // gioca tutte le lezioni della prima unità (o di tutte con FULL=1)
  const seen = {};
  const toPlay = FULL ? units : [firstUnit];
  let emojiInSessions = null;
  for (const uid of toPlay) {
    const lessons = await page.evaluate((u) => B.repo.lessons(u).map((l) => l.id), uid);
    for (const lid of lessons) {
      const mode = lid.endsWith("-test") ? "right" : "mixed";
      const e = await play(page, (id) => B.session.start(B.engine.lessonSession(id)), mode, seen, lid);
      emojiInSessions = emojiInSessions || e;
    }
  }
  ok(true, "lezioni giocate: " + toPlay.length + " unità");
  ok(!emojiInSessions, "nessuna emoji (fuori dalle immagini dei vocaboli) durante le sessioni" + (emojiInSessions ? " (" + emojiInSessions + ")" : ""));
  console.log("  tipi di step visti: " + JSON.stringify(seen));
  ["note", "learn", "mc", "gap", "type", "transform", "wordform", "fix", "order", "match", "dialog", "read", "listen", "cloze", "dictation", "speak", "speakTask", "write"]
    .forEach((t) => ok(seen[t] > 0, "step «" + t + "» giocato"));
  ok(await page.evaluate((u) => B.repo.lessons(u).every((l) => B.store.lessonDone(l.id)), firstUnit), "tutte le lezioni della prima unità registrate");
  ok(await page.evaluate((u) => B.path.unitPassed(B.repo.unit(u)), firstUnit), "test dell'unità superato con risposte giuste");
  ok(await page.evaluate(() => Object.keys(B.store.get().words).length > 0), "le parole entrano nella ripetizione spaziata");
  ok(await page.evaluate(() => B.store.openMistakes().length > 0), "gli esercizi sbagliati finiscono tra gli errori da rifare");

  // test bocciato: non sblocca
  if (units.length > 1 && !FULL) {
    const u2 = units[1];
    await play(page, (id) => B.session.start(B.engine.lessonSession(id + "-test")), "wrong", null, u2);
    ok(!(await page.evaluate((u) => B.path.unitPassed(B.repo.unit(u)), u2)), "test sbagliato: unità non superata");
    ok(!(await page.evaluate((u) => B.path.unitUnlocked(B.repo.units()[B.repo.unit(u).index + 1] || B.repo.unit(u)), u2)) || units.length === 2, "unità successiva ancora bloccata");
  }

  // ---------------------------------------------------------------- sessione: controlli specifici
  console.log("Sessioni");
  await page.evaluate((u) => B.session.start(B.engine.lessonSession(u + "-grammar")), firstUnit);
  await page.waitForSelector(".note-step");
  await shot("05-note");
  await page.evaluate(() => B.session._state().close());
  // un esercizio sbagliato in lezione torna in coda e mostra la spiegazione
  await page.evaluate(() => B.session.start({ mode: "practice", title: "t", steps: [{ t: "gap", s: "She ___ here.", opts: ["works", "work"], a: 0, why: "Terza persona: -s." }], xpPer: 1, retry: true }));
  await page.locator(".opt", { hasText: /^work$/ }).click();
  await page.locator(".s-foot .btn").click();
  ok(/Terza persona/.test(await page.locator(".fb").innerText()), "correzione con spiegazione in italiano");
  await shot("06-feedback-wrong");
  await page.locator(".s-foot .btn").click();
  ok(await page.evaluate(() => B.session._state().step._retry === true), "l'esercizio sbagliato torna in coda una volta");
  await page.evaluate(() => B.session._state().close());

  // ---------------------------------------------------------------- ripasso e abilità
  console.log("Ripasso");
  await page.evaluate(() => B.ui.goTab("practice"));
  await shot("07-review");
  await noEmoji("ripasso");
  await play(page, () => B.session.start(B.engine.reviewSession(true)), "right");
  ok(true, "ripasso giocato");
  for (const sk of ["grammar", "vocab", "reading", "listening", "speaking", "writing"]) {
    const has = await page.evaluate((k) => !!B.engine.skillSession(k), sk);
    ok(has, "allenamento disponibile: " + sk);
    if (has) await play(page, (k) => B.session.start(B.engine.skillSession(k)), "mixed", null, sk);
  }

  // ---------------------------------------------------------------- esami
  const levels = await page.evaluate(() => B.repo.LEVELS.filter((l) => !!B.repo.exam(l)));
  for (const lv of levels) {
    await page.evaluate(() => B.store.setSetting("unlockAll", true));
    await play(page, (l) => B.session.start(B.engine.examSession(l)), "right", seen, lv);
    ok(await page.evaluate((l) => B.path.examPassed(l), lv), "simulazione " + lv + " superata con risposte giuste");
    await page.evaluate(() => B.store.setSetting("unlockAll", false));
  }

  // ---------------------------------------------------------------- risorse e profilo
  console.log("Risorse e profilo");
  await page.evaluate(() => B.ui.goTab("resources"));
  await shot("08-resources");
  await noEmoji("risorse");
  const resCards = await page.locator(".screen .row-card").count();
  for (let i = 0; i < resCards; i++) {
    await page.locator(".screen .row-card").nth(i).click();
    await noEmoji("risorsa " + i);
    if (i === 0) await shot("09-grammar-sheets");
    await page.evaluate(() => B.ui.pop());
  }
  await page.evaluate(() => B.ui.goTab("profile"));
  await shot("10-profile");
  await noEmoji("profilo");
  await page.evaluate(() => { B.store.setSetting("theme", "dark"); B.ui.applyTheme(); B.ui.goTab("home"); });
  await shot("11-home-dark");
  await page.evaluate(() => { B.store.setSetting("theme", "auto"); B.ui.applyTheme(); });

  // ---------------------------------------------------------------- sincronizzazione
  console.log("Sincronizzazione");
  const before = server.calls.length;
  await page.evaluate(() => B.cloud.sync(true));
  ok(server.progress.u1 && server.progress.u1.state.xp === (await page.evaluate(() => B.store.get().xp)), "progressi salvati sul server");
  ok(!(await page.evaluate(() => B.store.get().dirty)), "dopo il salvataggio lo stato non è più «da salvare»");
  await page.evaluate(() => B.store.bump("sessions"));
  server.conflictOnce = true;
  const xpBefore = await page.evaluate(() => B.store.get().xp);
  await page.evaluate(() => B.cloud.sync(true));
  ok((await page.evaluate(() => B.store.get().xp)) === xpBefore + 1000 && (await page.evaluate(() => B.store.hasBadge("other_device"))), "conflitto tra dispositivi: stati uniti senza perdere nulla");
  ok(server.progress.u1.state.xp === xpBefore + 1000, "lo stato unito torna sul server");
  const r1 = server.calls.length;
  await page.evaluate(() => B.cloud.sync(false));
  await page.evaluate(() => B.cloud.sync(false));
  ok(server.calls.length === r1, "senza modifiche nessuna richiesta di salvataggio");
  await page.evaluate(() => B.store.bump("sessions"));
  await page.evaluate(() => B.cloud.sync(false));
  ok(server.calls.length === r1, "salvataggio limitato: al massimo uno ogni 3 minuti");
  await page.evaluate(() => B.cloud.checkContent(false));
  ok(server.calls.length === r1, "contenuti: niente richieste se controllati da meno di 24 ore");
  console.log("  richieste totali finora: " + server.calls.length + " (" + (server.calls.length - before) + " in questa fase)");

  // ---------------------------------------------------------------- delta dei contenuti
  console.log("Aggiornamento contenuti");
  server.touch(firstUnit + "-vocab", (r) => { r.data = Object.assign({}, r.data, { title: "Lessico (dal server)" }); });
  const revBefore = await page.evaluate(() => B.repo.rev());
  const n = await page.evaluate(() => B.cloud.checkContent(true));
  ok(n === 1, "scaricata solo la lezione cambiata (" + n + ")");
  ok((await page.evaluate((u) => B.repo.lesson(u + "-vocab").title, firstUnit)) === "Lessico (dal server)", "la lezione aggiornata è in uso");
  ok((await page.evaluate(() => B.repo.rev())) > revBefore, "il rev locale avanza");
  await page.reload();
  await page.waitForSelector(".tabbar");
  ok((await page.evaluate((u) => B.repo.lesson(u + "-vocab").title, firstUnit)) === "Lessico (dal server)", "dopo il riavvio i contenuti aggiornati restano (cache offline)");
  const lastTouched = server.content.find((r) => r.id === firstUnit + "-vocab");
  lastTouched.deleted = true; lastTouched.rev = server.maxRev() + 1;
  await page.evaluate(() => B.cloud.checkContent(true));
  ok(!(await page.evaluate((u) => !!B.repo.lesson(u + "-vocab"), firstUnit)), "una lezione segnata come eliminata sparisce");
  lastTouched.deleted = false; lastTouched.rev = server.maxRev() + 1;
  await page.evaluate(() => B.cloud.checkContent(true));
  const storage = await page.evaluate(() => { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + localStorage.getItem(k).length; } return { total: n, cache: B.repo._cacheSize() }; });
  ok(storage.total < 1000000, "localStorage ben sotto il limite della WebView (" + storage.total + " caratteri, cache contenuti " + storage.cache + ")");

  // ---------------------------------------------------------------- logout e nuovo dispositivo
  console.log("Logout e secondo dispositivo");
  await page.evaluate(() => B.cloud.signOut());
  await page.waitForSelector(".auth");
  ok(await page.evaluate(() => B.store.get().xp === 0 && !B.store.owner()), "dopo il logout i dati locali sono cancellati");
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctx2.route(API + "/**", server.handle);
  const p2 = await ctx2.newPage();
  await p2.goto(PAGE);
  await p2.locator(".auth-form input").nth(0).fill("mario@example.com");
  await p2.locator(".auth-form input").nth(1).fill("Password123");
  await p2.locator(".auth-form .btn").click();
  await p2.waitForSelector(".tabbar");
  await p2.waitForFunction(() => B.store.get().xp > 0);
  ok(await p2.evaluate((u) => B.path.unitPassed(B.repo.unit(u)), firstUnit), "su un nuovo dispositivo si ritrovano i progressi");

  // ---------------------------------------------------------------- deep link (conferma email / recupero password)
  console.log("Link dall'email");
  await p2.evaluate(() => B.cloud.signOut());
  await p2.waitForSelector(".auth");
  const s = server.session(server.users.u1);
  await p2.evaluate((x) => window.__onAuthCallback("babbol://auth-callback#access_token=" + x.access_token + "&refresh_token=" + x.refresh_token + "&expires_in=3600&type=recovery"), s);
  await p2.waitForSelector(".tabbar");
  await p2.waitForSelector(".modal.open");
  ok(/nuova password/i.test(await p2.locator(".modal").innerText()), "link di recupero: accesso fatto e richiesta della nuova password");
  await p2.evaluate(() => B.ui.closeModal(false));
  await p2.evaluate(() => window.__onAuthCallback("babbol://auth-callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid"));
  await p2.waitForSelector(".modal.open");
  ok(/scaduto/.test(await p2.locator(".modal").innerText()), "link scaduto: messaggio chiaro");
  await ctx2.close();

  // ---------------------------------------------------------------- ponte Android simulato
  console.log("Ponte Android");
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctx3.route(API + "/**", server.handle);
  await ctx3.addInitScript(() => {
    window.__bridge = [];
    window.AndroidBridge = {
      speak: (t, l, r) => window.__bridge.push(["speak", t, l]),
      speakQueued: (t, l, r) => window.__bridge.push(["speakQueued", t, l]),
      speakVoice: (t, l, r, p, id, q) => { window.__bridge.push(["speakVoice", t, l, p, id, q]); if (id) setTimeout(() => window.__onTtsDone(id), 5); },
      stopSpeaking: () => window.__bridge.push(["stop"]),
      listen: (l) => { window.__bridge.push(["listen", l]); setTimeout(() => window.__onSpeech(JSON.stringify({ ok: true, results: [window.__say || ""] })), 10); },
      setStatusBar: (d) => window.__bridge.push(["bar", d])
    };
  });
  const p3 = await ctx3.newPage();
  const err3 = [];
  p3.on("pageerror", (e) => err3.push(e.message));
  await p3.goto(PAGE);
  await p3.locator(".auth-form input").nth(0).fill("mario@example.com");
  await p3.locator(".auth-form input").nth(1).fill("Password123");
  await p3.locator(".auth-form .btn").click();
  await p3.waitForSelector(".tabbar");
  await p3.evaluate(() => B.speech.playLines([["A", "Hello there."], ["B", "Hi, how are you?"], ["A", "Fine, thanks."]]));
  const calls = await p3.evaluate(() => window.__bridge.filter((c) => c[0] === "speakVoice"));
  ok(calls.length === 3 && calls[0][2] !== calls[1][2] && calls[0][2] === calls[2][2], "dialoghi: voci diverse per speaker (accento alternato)");
  ok(calls[2][4] && calls[2][5] === true, "l'ultima frase porta l'id per sapere quando l'audio finisce");
  await p3.evaluate(() => B.session.start({ mode: "practice", title: "t", steps: [{ t: "speak", en: "Nice to meet you." }], xpPer: 1 }));
  await p3.evaluate(() => { window.__say = "nice to meet you"; });
  await p3.locator(".mic").click();
  await p3.waitForSelector(".s-foot.good");
  ok(true, "riconoscimento vocale nativo: frase giusta accettata");
  await p3.evaluate(() => B.session._state().close());
  ok(err3.length === 0, "nessun errore con il ponte nativo " + (err3.length ? JSON.stringify(err3) : ""));
  await ctx3.close();

  // ---------------------------------------------------------------- riepilogo richieste
  const perKind = {};
  server.calls.forEach((x) => { const k = x.replace(/\?.*/, ""); perKind[k] = (perKind[k] || 0) + 1; });
  console.log("Richieste a Supabase in tutto il test: " + server.calls.length + " " + JSON.stringify(perKind));
  ok(errors.length === 0, "nessun errore JS " + (errors.length ? JSON.stringify(errors.slice(0, 5)) : ""));

  await browser.close();
  console.log(failures ? "\n" + failures + " CONTROLLI FALLITI" : "\nTUTTO OK");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
