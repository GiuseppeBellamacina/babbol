/*
 * Runner delle sessioni (schermo intero) + renderer dei tipi di step.
 *
 * Flusso: step -> CONTROLLA -> correzione (con spiegazione) -> CONTINUA.
 * Nessun limite: niente vite, si può sbagliare quanto si vuole.
 * Nelle lezioni un esercizio sbagliato torna in coda una volta; nei test e negli esami (cfg.quiet)
 * non si vedono correzioni fino alla fine, dove c'è il riepilogo degli errori.
 *
 * Ogni renderer ritorna { el, check(), onShow? } e check() ritorna
 *   { right, total, expected?, explain?, note?, noRetry?, review?: [testi degli errori] }
 * oppure { skip: true } (pagine non valutate) / { skipped: true } (saltato dall'utente).
 */
(function (B) {
  "use strict";
  var h = B.h;

  var CHEERS = ["Esatto.", "Giusto.", "Perfetto.", "Ottimo.", "Corretto."];

  // ---------------------------------------------------------------- componenti comuni
  function speakerButtons(text) {
    return h("div", { class: "audio-row" },
      h("button", { class: "speaker", "aria-label": "Ascolta", onclick: function () { B.speech.speak(text); } }, B.icon("speaker", 26)),
      h("button", { class: "speaker slow", "aria-label": "Ascolta lentamente", onclick: function () { B.speech.slow(text); } }, B.icon("turtle", 24)),
      h("button", { class: "speaker tiny", "aria-label": "Regola la velocità", onclick: function () { B.ui.speedSheet(text); } }, B.icon("speed", 18)));
  }
  function picture(step) {
    return h("div", { class: "q-pic" + (step.img && !step.emoji ? " scene" : "") }, B.pic(step));
  }
  function title(text) { return h("h2", { class: "q-title" }, text || ""); }
  function header(step, defTitle) {
    var el = h("div", { class: "q-head" }, title(step.q || defTitle));
    if (B.hasPic(step)) el.appendChild(picture(step));
    if (step.say) el.appendChild(speakerButtons(step.say));
    if (step.text && !step.hide) el.appendChild(h("div", { class: "q-text" }, step.text));
    if (step.sub) el.appendChild(h("div", { class: "q-sub" }, step.sub));
    return el;
  }
  // frase con lo spazio vuoto ___ sostituito da un nodo (testo scelto o campo)
  function sentenceWith(s, node) {
    var parts = String(s).split("___");
    return h("div", { class: "q-text sentence" }, parts[0], node, parts.slice(1).join("___"));
  }
  function input(opts) {
    opts = opts || {};
    var el = opts.multi
      ? h("textarea", { class: "answer", rows: opts.rows || 3, placeholder: opts.ph || "Scrivi qui in inglese", autocapitalize: "sentences", autocomplete: "off", spellcheck: "false" })
      : h("input", { class: "answer" + (opts.inline ? " inline" : ""), type: "text", placeholder: opts.ph || "", autocapitalize: "none", autocomplete: "off", autocorrect: "off", spellcheck: "false" });
    if (opts.value) el.value = opts.value;
    return el;
  }
  function judgeMany(value, answers) { return B.judgeTyped(value, answers); }

  // scelta tra opzioni: gestisce mescolamento, selezione e correzione. onPick(i) facoltativo.
  function optionGroup(opts, a, cfg) {
    cfg = cfg || {};
    var order = B.shuffle(opts.map(function (o, i) { return i; }));
    var sel = -1, btns = {};
    var wrap = h("div", { class: "opts" + (cfg.listy ? " listy" : "") + (cfg.compact ? " compact" : "") });
    order.forEach(function (i) {
      var b = h("button", { class: "opt", onclick: function () {
        if (wrap._locked) return;
        sel = i;
        Object.keys(btns).forEach(function (k) { btns[k].classList.toggle("selected", +k === i); });
        B.sfx.tap();
        if (cfg.onPick) cfg.onPick(i, opts[i]);
      } }, opts[i]);
      btns[i] = b; wrap.appendChild(b);
    });
    return {
      el: wrap,
      chosen: function () { return sel; },
      lock: function (reveal) {
        wrap._locked = true;
        Object.keys(btns).forEach(function (k) {
          btns[k].disabled = true;
          if (!reveal) return;
          if (+k === a) btns[k].classList.add("right");
          else if (+k === sel) btns[k].classList.add("wrong");
        });
      },
      correct: function () { return sel === a; }
    };
  }

  // lettore audio per listen/dictation: conta gli ascolti (negli esami max 2)
  function audioPlayer(lines, maxPlays, state) {
    state = state || {};
    var plays = state._plays || 0, playing = false;
    var label = h("span", null, "Ascolta");
    var count = h("div", { class: "muted small center" });
    var btn = h("button", { class: "btn blue play" }, B.icon("play", 20), label);
    var slowBtn = h("button", { class: "btn ghost small" }, B.icon("turtle", 18), " Lento");
    var speedBtn = h("button", { class: "btn ghost small", "aria-label": "Regola la velocità", onclick: function () { B.ui.speedSheet(lines.map(function (l) { return l[1]; }).join(" ").split(" ").slice(0, 14).join(" ")); } }, B.icon("speed", 18));
    function upd() {
      count.textContent = maxPlays ? "Ascolti: " + plays + " / " + maxPlays : (plays ? "Ascoltato " + plays + (plays === 1 ? " volta" : " volte") : "");
      var over = maxPlays && plays >= maxPlays;
      btn.disabled = over || playing; slowBtn.disabled = over || playing;
      state._plays = plays;
      label.textContent = playing ? "In riproduzione" : over ? "Ascolti finiti" : plays ? "Riascolta" : "Ascolta";
    }
    function play(slow) {
      if (maxPlays && plays >= maxPlays) return;
      plays++; playing = true; upd();
      B.speech.playLines(lines, function () { playing = false; upd(); }, slow ? { slow: true } : null);
      // sicurezza: se il motore non segnala la fine, si riabilita comunque
      var chars = lines.reduce(function (a, l) { return a + l[1].length; }, 0);
      setTimeout(function () { if (playing) { playing = false; upd(); } }, 2000 + chars * 110 / (slow ? Math.max(0.3, B.speech.slowRate()) * 0.8 : 1));
    }
    btn.addEventListener("click", function () { play(false); });
    slowBtn.addEventListener("click", function () { play(true); });
    upd();
    return { el: h("div", { class: "player" }, h("div", { class: "row center gap" }, btn, maxPlays ? null : slowBtn, speedBtn), count), play: play };
  }

  // domande di comprensione (read/listen): scelta o risposta scritta
  function questions(qs, ctx) {
    var wrap = h("div", { class: "qs" }), items = [];
    function update() { ctx.ready(items.every(function (it) { return it.answered(); })); }
    qs.forEach(function (q, i) {
      var box = h("div", { class: "qbox" }, h("div", { class: "qnum" }, (i + 1) + ". " + q.q));
      if (q.answers) {
        var inp = input({ ph: "Risposta" });
        inp.addEventListener("input", update);
        box.appendChild(inp);
        items.push({ q: q, answered: function () { return inp.value.trim().length > 0; },
          check: function (reveal) {
            inp.disabled = true;
            var ok = judgeMany(inp.value, q.answers) !== "no";
            if (reveal) { inp.classList.add(ok ? "ok" : "bad"); if (!ok) box.appendChild(h("div", { class: "fix-line" }, q.answers[0])); }
            return ok;
          } });
      } else {
        var g = optionGroup(q.opts, q.a, { listy: true, compact: true, onPick: update });
        box.appendChild(g.el);
        items.push({ q: q, answered: function () { return g.chosen() >= 0; },
          check: function (reveal) { g.lock(reveal); return g.correct(); } });
      }
      if (q.why) box._why = q.why;
      wrap.appendChild(box);
    });
    return {
      el: wrap,
      check: function (reveal) {
        var right = 0, review = [];
        items.forEach(function (it, i) {
          var ok = it.check(reveal);
          if (ok) right++;
          else review.push(it.q.q + " -> " + (it.q.answers ? it.q.answers[0] : it.q.opts[it.q.a]));
          if (reveal && it.q.why && !ok) wrap.children[i].appendChild(h("div", { class: "why" }, it.q.why));
        });
        return { right: right, total: items.length, review: review };
      }
    };
  }

  // ---------------------------------------------------------------- renderer
  var Renderers = {};

  Renderers.learn = function (step, ctx) {
    var el = h("div", { class: "learn" }, title("Parole nuove"), h("p", { class: "muted center" }, "Tocca una parola o un esempio per ascoltarlo"));
    step.words.forEach(function (w) {
      el.appendChild(h("div", { class: "word-row" },
        B.hasPic(w) ? h("div", { class: "word-pic" }, B.pic(w)) : null,
        h("div", { class: "word-main", onclick: function () { B.speech.speak(w.en); } },
          h("div", { class: "word-en" }, w.en, " ", h("span", { class: "word-pos" }, w.pos || ""), " ", B.icon("speaker", 16, "mini")),
          h("div", { class: "word-ipa" }, "/" + w.ipa + "/"),
          h("div", { class: "word-it" }, w.it),
          w.note ? h("div", { class: "word-note" }, w.note) : null),
        w.ex ? h("div", { class: "word-ex", onclick: function () { B.speech.speak(w.ex[0]); } }, h("div", null, w.ex[0]), h("div", { class: "muted" }, w.ex[1])) : null));
    });
    ctx.ready(true);
    return { el: el, check: function () { return { skip: true }; }, onShow: function () { B.speech.speak(step.words[0].en); } };
  };

  Renderers.note = function (step, ctx) {
    var el = h("div", { class: "note-step" }, h("div", { class: "note-kicker" }, B.icon("bulb", 18), " Teoria"), title(step.title), B.rich(step.body));
    if (step.table) {
      var t = h("table", { class: "gtable" });
      step.table.forEach(function (row, i) {
        t.appendChild(h("tr", null, row.map(function (c) { return h(i === 0 ? "th" : "td", null, c); })));
      });
      el.appendChild(h("div", { class: "table-wrap" }, t));
    }
    if (step.ex) el.appendChild(h("div", { class: "examples" }, step.ex.map(function (p) { return B.ui.speakable(p[0], p[1], "ex"); })));
    ctx.ready(true);
    return { el: el, check: function () { return { skip: true }; } };
  };

  Renderers.partIntro = function (step, ctx) {
    ctx.ready(true);
    return { el: h("div", { class: "note-step center" }, h("div", { class: "end-icon" }, B.icon("exam", 54)), title(step.title),
      h("p", { class: "muted" }, "Tempo indicativo: " + step.minutes + " minuti"), B.rich(step.it)), check: function () { return { skip: true }; } };
  };

  Renderers.mc = function (step, ctx) {
    var el = h("div", { class: "mc" }, header(step, "Scegli la risposta giusta"));
    var g = optionGroup(step.opts, step.a, { listy: step.opts.some(function (o) { return o.length > 24; }), onPick: function (i, label) {
      if (step.speakOnPick) B.speech.speak(label);
      ctx.ready(true);
    } });
    el.appendChild(g.el);
    return {
      el: el,
      check: function () { g.lock(!ctx.quiet); return { right: g.correct() ? 1 : 0, total: 1, expected: step.opts[step.a], explain: step.why }; },
      onShow: function () { if (step.say) setTimeout(function () { B.speech.speak(step.say); }, 350); }
    };
  };

  Renderers.gap = function (step, ctx) {
    var blank = h("span", { class: "blank" }, "     ");
    var el = h("div", { class: "mc" }, title(step.q || "Completa la frase"), sentenceWith(step.s, blank));
    if (step.it) el.appendChild(h("div", { class: "q-sub" }, step.it));
    var g = optionGroup(step.opts, step.a, { onPick: function (i, label) { blank.textContent = label; ctx.ready(true); } });
    el.appendChild(g.el);
    return { el: el, check: function () {
      g.lock(!ctx.quiet);
      return { right: g.correct() ? 1 : 0, total: 1, expected: step.s.replace("___", step.opts[step.a]), explain: step.why };
    } };
  };

  // risposta scritta generica (type, transform, wordform, fix, dictation)
  function typed(step, ctx, parts) {
    var el = h("div", { class: "typed" }, parts.head);
    var inp = parts.input;
    inp.addEventListener("input", function () { ctx.ready(inp.value.trim().length > 0); });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && inp.tagName === "INPUT") { e.preventDefault(); ctx.press(); } });
    if (!parts.inline) el.appendChild(inp);
    if (parts.after) el.appendChild(parts.after);
    if (step.say && !ctx.quiet) el.appendChild(h("button", { class: "link-btn", onclick: function () { ctx.submit({ skipped: true }); } }, "Non posso ascoltare adesso"));
    return {
      el: el,
      check: function () {
        inp.disabled = true;
        var j = judgeMany(inp.value, step.answers);
        if (!ctx.quiet) inp.classList.add(j === "no" ? "bad" : "ok");
        return { right: j === "no" ? 0 : 1, total: 1, expected: parts.expected || step.answers[0],
          note: j === "close" ? "Quasi: attenzione all'ortografia." : null, explain: step.why };
      },
      onShow: function () {
        if (step.say) setTimeout(function () { B.speech.speak(step.say); }, 350);
        setTimeout(function () { try { inp.focus(); } catch (e) { /* ignorato */ } }, 400);
      }
    };
  }

  Renderers.type = function (step, ctx) {
    if (step.s) {
      var inp = input({ inline: true, ph: "..." });
      var head = h("div", { class: "q-head" }, title(step.q || "Completa"), sentenceWith(step.s, inp), step.sub ? h("div", { class: "q-sub" }, step.sub) : null);
      return typed(step, ctx, { head: head, input: inp, inline: true, expected: step.s.replace("___", step.answers[0]) });
    }
    var long = !step.word && String(step.answers[0]).split(" ").length > 3;
    return typed(step, ctx, { head: header(step, "Scrivi in inglese"), input: input({ multi: long, rows: 2, ph: "Scrivi in inglese" }) });
  };

  Renderers.transform = function (step, ctx) {
    var inp = input({ inline: true, ph: "2-5 parole" });
    var head = h("div", { class: "q-head" }, title(step.q || "Completa la seconda frase in modo che abbia lo stesso significato"),
      h("div", { class: "q-text" }, step.s1),
      h("div", { class: "keyword" }, step.key),
      sentenceWith(step.s2, inp),
      h("div", { class: "muted small" }, "Usa da 2 a 5 parole, compresa la parola data, senza cambiarla."));
    return typed(step, ctx, { head: head, input: inp, inline: true, expected: step.s2.replace("___", step.answers[0]) });
  };

  Renderers.wordform = function (step, ctx) {
    var inp = input({ inline: true, ph: "..." });
    var head = h("div", { class: "q-head" }, title(step.q || "Scrivi la forma giusta della parola"),
      h("div", { class: "keyword" }, step.root), sentenceWith(step.s, inp));
    return typed(step, ctx, { head: head, input: inp, inline: true, expected: step.s.replace("___", step.answers[0]) });
  };

  Renderers.fix = function (step, ctx) {
    var head = h("div", { class: "q-head" }, title(step.q || "Correggi l'errore e riscrivi la frase"), h("div", { class: "q-text wrongline" }, step.s));
    return typed(step, ctx, { head: head, input: input({ multi: true, rows: 2, value: step.s }) });
  };

  Renderers.dictation = function (step, ctx) {
    var s = Object.assign({}, step, { say: step.en, hide: true, answers: [step.en], sub: null });
    var head = h("div", { class: "q-head" }, title("Ascolta e scrivi la frase"), speakerButtons(step.en));
    var r = typed(s, ctx, { head: head, input: input({ multi: true, rows: 2, ph: "Scrivi quello che senti" }) });
    var check = r.check;
    r.check = function () { var x = check(); x.explain = step.it || null; return x; };
    return r;
  };

  Renderers.order = function (step, ctx) {
    var el = h("div", { class: "order" }, h("div", { class: "q-head" }, title(step.q || "Traduci riordinando le parole"), h("div", { class: "q-text" }, step.it)));
    var words = step.en.replace(/[.!?]+$/, "").split(/\s+/);
    var toks = B.shuffle(words.concat(step.extra || []));
    if (toks.join(" ") === words.join(" ") && toks.length > 1) toks = toks.slice(1).concat(toks[0]);
    var tokens = toks.map(function (t, i) { return { t: t, id: i }; });
    var placed = [], locked = false;
    var ans = h("div", { class: "ans-line" }), bank = h("div", { class: "bank" });
    function draw() {
      ans.innerHTML = ""; bank.innerHTML = "";
      placed.forEach(function (tk) {
        ans.appendChild(h("button", { class: "tok", onclick: function () { if (locked) return; placed.splice(placed.indexOf(tk), 1); B.sfx.tap(); draw(); } }, tk.t));
      });
      tokens.forEach(function (tk) {
        if (placed.indexOf(tk) >= 0) { bank.appendChild(h("span", { class: "tok ghost" }, tk.t)); return; }
        bank.appendChild(h("button", { class: "tok", onclick: function () { if (locked) return; placed.push(tk); B.sfx.tap(); draw(); } }, tk.t));
      });
      ctx.ready(placed.length > 0);
    }
    el.appendChild(ans); el.appendChild(bank);
    draw();
    return { el: el, check: function () {
      locked = true;
      var given = placed.map(function (x) { return x.t; }).join(" ");
      var ok = [step.en].concat(step.alts || []).some(function (a) { return B.norm(a) === B.norm(given); });
      if (!ctx.quiet) ans.classList.add(ok ? "ok" : "bad");
      return { right: ok ? 1 : 0, total: 1, expected: step.en, explain: step.why, sayAfter: step.en };
    } };
  };

  Renderers.match = function (step, ctx) {
    var el = h("div", { class: "match" }, h("div", { class: "q-head" }, title("Abbina le coppie"), h("p", { class: "muted center" }, "Tocca un elemento a sinistra e il suo corrispondente a destra")));
    var pairs = step.pairs.map(function (p, i) { return { id: i, en: p[0], it: p[1] }; });
    var selL = null, selR = null, matched = 0, wrongs = 0, done = false;
    var colL = h("div", { class: "col" }), colR = h("div", { class: "col" }), bL = {}, bR = {};
    function tryPair() {
      if (selL == null || selR == null) return;
      var l = selL, r = selR; selL = selR = null;
      if (l === r) {
        [bL[l], bR[r]].forEach(function (b) { b.classList.remove("selected"); b.classList.add("done"); b.disabled = true; });
        B.sfx.ok(); matched++;
        if (matched === pairs.length) {
          done = true;
          setTimeout(function () {
            ctx.submit(wrongs <= 2 ? { right: 1, total: 1, note: wrongs ? "Con qualche tentativo in più." : null, noRetry: true }
              : { right: 0, total: 1, noRetry: true, expected: "Ripassa queste coppie", explain: pairs.map(function (p) { return p.en + " = " + p.it; }).join("  |  ") });
          }, 300);
        }
      } else {
        wrongs++; B.sfx.bad();
        [bL[l], bR[r]].forEach(function (x) { x.classList.remove("selected"); x.classList.add("shake"); setTimeout(function () { x.classList.remove("shake"); }, 450); });
      }
    }
    B.shuffle(pairs).forEach(function (p) {
      var b = h("button", { class: "opt", onclick: function () {
        if (done) return;
        if (selL != null) bL[selL].classList.remove("selected");
        selL = p.id; b.classList.add("selected"); B.speech.speak(p.en); tryPair();
      } }, p.en);
      bL[p.id] = b; colL.appendChild(b);
    });
    B.shuffle(pairs).forEach(function (p) {
      var b = h("button", { class: "opt", onclick: function () {
        if (done) return;
        if (selR != null) bR[selR].classList.remove("selected");
        selR = p.id; b.classList.add("selected"); B.sfx.tap(); tryPair();
      } }, p.it);
      bR[p.id] = b; colR.appendChild(b);
    });
    el.appendChild(h("div", { class: "cols" }, colL, colR));
    ctx.hideMain(true);
    return { el: el, check: function () { return { right: 1, total: 1 }; } };
  };

  Renderers.dialog = function (step, ctx) {
    var el = h("div", { class: "dialog" }, title(step.title || "Completa il dialogo"));
    if (step.it) el.appendChild(h("p", { class: "muted" }, step.it));
    var groups = [], speakers = [];
    step.lines.forEach(function (l) { if (speakers.indexOf(l[0]) < 0) speakers.push(l[0]); });
    var voices = B.speech.assignVoices(step.lines.map(function (l) { return [l[0], "", l[2]]; }));
    step.lines.forEach(function (l) {
      var side = speakers.indexOf(l[0]) % 2 ? "right" : "left";
      var bubble = h("div", { class: "bubble " + side }, h("div", { class: "who" }, l[0]));
      if (typeof l[1] === "object") {
        var g = optionGroup(l[1].opts, l[1].a, { listy: true, compact: true, onPick: function () {
          ctx.ready(groups.every(function (x) { return x.g.chosen() >= 0; }));
        } });
        groups.push({ g: g, line: l });
        bubble.appendChild(g.el);
        bubble.classList.add("choice");
      } else {
        bubble.appendChild(h("div", { class: "says", onclick: function () { B.speech.speakAs(l[1], voices[l[0]]); } }, l[1]));
      }
      el.appendChild(bubble);
    });
    return { el: el, check: function () {
      var right = 0, review = [];
      groups.forEach(function (x) {
        x.g.lock(!ctx.quiet);
        if (x.g.correct()) right++; else review.push(x.line[1].opts[x.line[1].a]);
      });
      if (!ctx.quiet) {
        var full = step.lines.map(function (l) { return [l[0], typeof l[1] === "object" ? l[1].opts[l[1].a] : l[1]]; });
        el.appendChild(h("button", { class: "btn ghost small", onclick: function () { B.speech.playLines(full); } }, B.icon("play", 16), " Ascolta il dialogo completo"));
      }
      return { right: right, total: groups.length, review: review, noRetry: true, explain: step.why };
    } };
  };

  Renderers.read = function (step, ctx) {
    var el = h("div", { class: "reading" }, title(step.title || "Leggi il testo"));
    if (step.genre) el.appendChild(h("div", { class: "genre" }, step.genre));
    el.appendChild(h("div", { class: "card passage" }, B.rich(step.text)));
    el.appendChild(h("h4", null, "Domande"));
    var qs = questions(step.qs, ctx);
    el.appendChild(qs.el);
    return { el: el, check: function () { var r = qs.check(!ctx.quiet); r.noRetry = true; return r; } };
  };

  Renderers.listen = function (step, ctx) {
    var el = h("div", { class: "listening" }, title(step.title || "Ascolta"));
    if (step.it) el.appendChild(h("p", { class: "muted" }, step.it));
    var player = audioPlayer(step.lines, ctx.quiet ? (step._maxPlays || 2) : 0, step);
    el.appendChild(player.el);
    el.appendChild(h("h4", null, "Domande"));
    var qs = questions(step.qs, ctx);
    el.appendChild(qs.el);
    return { el: el, check: function () {
      var r = qs.check(!ctx.quiet); r.noRetry = true;
      if (!ctx.quiet) {
        var script = h("div", { class: "card script" }, step.lines.map(function (l) { return h("p", null, h("b", null, l[0] + ": "), l[1]); }));
        el.appendChild(h("details", { class: "transcript" }, h("summary", null, "Mostra il testo dell'audio"), script));
      }
      return r;
    } };
  };

  Renderers.cloze = function (step, ctx) {
    var el = h("div", { class: "cloze" }, title(step.title || (step.mode === "mc" ? "Scegli la parola giusta per ogni spazio" : step.mode === "wordform" ? "Scrivi la forma giusta delle parole in maiuscolo" : "Scrivi UNA parola per ogni spazio")));
    var fields = [];
    var para = h("div", { class: "card passage cloze-text" });
    String(step.text).split(/\n\s*\n/).forEach(function (block) {
      var p = h("p");
      block.split(/(\{\d+\})/).forEach(function (chunk) {
        var m = /^\{(\d+)\}$/.exec(chunk);
        if (!m) { if (chunk) p.appendChild(document.createTextNode(chunk)); return; }
        var n = +m[1], g = step.gaps[n - 1], f;
        if (step.mode === "mc") {
          f = h("select", { class: "gap-sel" }, h("option", { value: "" }, "(" + n + ")"), g.opts.map(function (o, i) { return h("option", { value: String(i) }, o); }));
        } else {
          f = input({ inline: true, ph: "(" + n + ")" });
        }
        f.addEventListener("input", update); f.addEventListener("change", update);
        fields.push({ f: f, g: g, n: n });
        p.appendChild(f);
        if (step.mode === "wordform") p.appendChild(h("span", { class: "root" }, " (" + g.root + ") "));
      });
      para.appendChild(p);
    });
    function update() { ctx.ready(fields.every(function (x) { return x.f.value !== ""; })); }
    el.appendChild(para);
    return { el: el, check: function () {
      var right = 0, review = [];
      fields.forEach(function (x) {
        x.f.disabled = true;
        var ok, expected;
        if (step.mode === "mc") { ok = +x.f.value === x.g.a; expected = x.g.opts[x.g.a]; }
        else { ok = judgeMany(x.f.value, x.g.answers) === "ok"; expected = x.g.answers[0]; }
        if (ok) right++; else review.push("(" + x.n + ") " + expected);
        if (!ctx.quiet) {
          x.f.classList.add(ok ? "ok" : "bad");
          if (!ok) x.f.parentNode.insertBefore(h("span", { class: "fix-inline" }, expected), x.f.nextSibling);
        }
      });
      return { right: right, total: fields.length, review: review, noRetry: true };
    } };
  };

  // --- parlato: ripeti la frase (riconoscimento vocale gratuito del telefono)
  Renderers.speak = function (step, ctx) {
    var el = h("div", { class: "speak" }, h("div", { class: "q-head" }, title("Ripeti ad alta voce"),
      h("div", { class: "q-text" }, step.en), step.it ? h("div", { class: "q-sub" }, step.it) : null, speakerButtons(step.en)));
    var status = h("div", { class: "speak-status" }, "Tocca il microfono e ripeti la frase");
    var attempts = 0, busy = false;
    var mic = h("button", { class: "mic", "aria-label": "Parla" }, B.icon("mic", 34));
    ctx.hideMain(true);
    function manual() {
      status.textContent = "Il riconoscimento vocale non è disponibile. Ascolta, ripeti ad alta voce e premi FATTO.";
      mic.style.display = "none";
      el.appendChild(h("button", { class: "btn primary", onclick: function () { ctx.submit({ right: 1, total: 1, noRetry: true }); } }, "FATTO"));
    }
    if (!B.speech.canListen()) { el.appendChild(status); manual(); }
    else {
      mic.addEventListener("click", function () {
        if (busy) return;
        busy = true; attempts++;
        mic.classList.add("live"); status.textContent = "Ti ascolto...";
        B.speech.listen().then(function (heard) {
          busy = false; mic.classList.remove("live");
          var sc = B.speech.score(step.en, heard);
          if (sc >= B.speech.PASS) { B.store.bump("spoken"); ctx.submit({ right: 1, total: 1, noRetry: true, note: "Ho capito: «" + heard[0] + "»" }); }
          else if (attempts >= 3) ctx.submit({ right: 0, total: 1, noRetry: true, expected: step.en, note: "Ho capito: «" + (heard[0] || "...") + "»" });
          else status.textContent = "Ho capito: «" + (heard[0] || "...") + "». Riprova (" + attempts + "/3).";
        }).catch(function (e) {
          busy = false; mic.classList.remove("live");
          var m = String(e && e.message || e);
          if (m === "cancelled") status.textContent = "Annullato. Tocca il microfono per riprovare.";
          else if (m === "nomatch" || m === "no-speech") status.textContent = "Non ho sentito niente. Riprova.";
          else manual();
        });
      });
      el.appendChild(mic); el.appendChild(status);
    }
    el.appendChild(h("button", { class: "link-btn", onclick: function () { ctx.submit({ skipped: true }); } }, "Salta"));
    return { el: el, check: function () { return { right: 1, total: 1 }; }, onShow: function () { setTimeout(function () { B.speech.speak(step.en); }, 300); } };
  };

  // autovalutazione finale per write/speakTask: 3 livelli
  function selfRate(ctx, onRate) {
    var box = h("div", { class: "self-rate" }, h("div", { class: "row-title" }, "Com'è andata, confrontando con il modello?"));
    [["Bene", 1], ["In parte", 0.5], ["Da rifare", 0]].forEach(function (o) {
      box.appendChild(h("button", { class: "btn " + (o[1] === 1 ? "primary" : o[1] ? "ghost" : "danger-outline"), onclick: function () { onRate(o[1]); } }, o[0]));
    });
    return box;
  }

  // --- parlato libero: rispondi a voce, poi confronta con la risposta modello
  Renderers.speakTask = function (step, ctx) {
    var el = h("div", { class: "speak task" }, h("div", { class: "q-head" }, title("Rispondi a voce"),
      h("div", { class: "q-text" }, step.q), step.it ? h("div", { class: "q-sub" }, step.it) : null));
    if (step.hints) el.appendChild(h("ul", { class: "hints" }, step.hints.map(function (x) { return h("li", null, x); })));
    var said = [], transcript = h("div", { class: "transcript-live" });
    var status = h("div", { class: "speak-status" }, B.speech.canListen() ? "Tocca il microfono e parla (puoi farlo più volte)." : "Parla ad alta voce, poi confronta con il modello.");
    var mic = h("button", { class: "mic", "aria-label": "Parla" }, B.icon("mic", 34));
    var busy = false;
    function words() { return B.wordCount(said.join(" ")); }
    mic.addEventListener("click", function () {
      if (busy) return;
      busy = true; mic.classList.add("live"); status.textContent = "Ti ascolto...";
      B.speech.listen().then(function (heard) {
        busy = false; mic.classList.remove("live");
        if (heard[0]) { said.push(heard[0]); transcript.appendChild(h("p", null, heard[0])); }
        status.textContent = "Parole riconosciute: " + words() + (step.min ? " (obiettivo: " + step.min + ")" : "");
      }).catch(function () { busy = false; mic.classList.remove("live"); status.textContent = "Non ho sentito. Riprova o confronta direttamente con il modello."; });
    });
    if (B.speech.canListen()) el.appendChild(mic);
    el.appendChild(status); el.appendChild(transcript);
    ctx.hideMain(true);
    var reveal = h("button", { class: "btn blue", onclick: function () {
      reveal.remove(); mic.remove();
      if (said.length) B.store.bump("spoken");
      el.appendChild(h("div", { class: "card model" }, h("div", { class: "row-title" }, "Risposta modello"), B.rich(step.model),
        h("button", { class: "btn ghost small", onclick: function () { B.speech.speak(step.model); } }, B.icon("speaker", 16), " Ascolta")));
      el.appendChild(selfRate(ctx, function (v) { ctx.submit({ right: v, total: 1, noRetry: true }); }));
    } }, "CONFRONTA CON IL MODELLO");
    el.appendChild(reveal);
    return { el: el, check: function () { return { right: 1, total: 1 }; } };
  };

  // --- scrittura libera: conteggio parole, frasi utili, poi modello + checklist di autovalutazione
  Renderers.write = function (step, ctx) {
    var el = h("div", { class: "write" }, h("div", { class: "q-head" }, title("Scrivi"), h("div", { class: "q-text left" }, step.q), step.it ? h("div", { class: "q-sub left" }, step.it) : null));
    var area = input({ multi: true, rows: 9, ph: "Scrivi qui il tuo testo (" + step.min + "-" + step.max + " parole)" });
    var counter = h("div", { class: "counter" });
    function upd() {
      var n = B.wordCount(area.value);
      counter.textContent = n + " parole (richieste " + step.min + "-" + step.max + ")";
      counter.className = "counter" + (n >= step.min && n <= step.max ? " good" : n > step.max ? " over" : "");
      go.disabled = n < Math.max(10, Math.round(step.min * 0.6));
    }
    if (step.useful) {
      el.appendChild(h("div", { class: "chips useful" }, step.useful.map(function (u) {
        return h("button", { class: "chip", onclick: function () { area.value += (area.value && !/\s$/.test(area.value) ? " " : "") + u + " "; area.focus(); upd(); } }, u);
      })));
    }
    el.appendChild(area); el.appendChild(counter);
    ctx.hideMain(true);
    var go = h("button", { class: "btn blue", onclick: function () {
      area.disabled = true; go.remove();
      var n = B.wordCount(area.value);
      B.store.bump("written", n);
      var checks = step.checklist.map(function (c) { return h("label", { class: "check-row" }, h("input", { type: "checkbox" }), h("span", null, c)); });
      var lenOk = n >= step.min && n <= step.max;
      el.appendChild(h("div", { class: "card" }, h("div", { class: "row-title" }, "Controlla il tuo testo"),
        h("div", { class: "check-row auto " + (lenOk ? "ok" : "bad") }, B.icon(lenOk ? "check" : "x", 16), " Lunghezza: " + n + " parole"),
        checks));
      el.appendChild(h("div", { class: "card model" }, h("div", { class: "row-title" }, "Testo modello"), B.rich(step.model)));
      el.appendChild(h("button", { class: "btn primary", onclick: function () {
        var ticked = checks.filter(function (c) { return c.querySelector("input").checked; }).length + (lenOk ? 1 : 0);
        ctx.submit({ right: ticked / (checks.length + 1), total: 1, noRetry: true });
      } }, "CONFERMA"));
    } }, "HO FINITO: CONFRONTA");
    el.appendChild(go);
    area.addEventListener("input", upd);
    upd();
    return { el: el, check: function () { return { right: 1, total: 1 }; } };
  };

  // ---------------------------------------------------------------- runner
  var current = null;
  function byId(id) { return document.getElementById(id); }

  function start(cfg) {
    if (!cfg || !cfg.steps || !cfg.steps.length) return;
    var overlay = byId("overlay");
    var S = current = {
      cfg: cfg, queue: cfg.steps.slice(), total: cfg.steps.length, passed: 0,
      right: 0, items: 0, wrongSteps: 0, skipped: 0, t0: Date.now(), review: [],
      byLevel: {}, byPart: {}, step: null, renderer: null, phase: "idle",
      done: [], tok: 0   // done = passi gia' conclusi, per poter tornare indietro annullandone il punteggio
    };

    overlay.innerHTML = "";
    overlay.classList.add("open");
    var closeBtn = h("button", { class: "icon-btn", "aria-label": "Chiudi", onclick: askExit }, B.icon("x", 22));
    var bar = h("div", { class: "bar" }, h("div", { class: "bar-fill" }));
    var clock = h("div", { class: "s-clock" });
    var body = h("div", { class: "s-body" });
    var fb = h("div", { class: "fb" });
    var main = h("button", { class: "btn primary big" }, "CONTROLLA");
    var backBtn = h("button", { class: "btn ghost big back", "aria-label": "Indietro", style: { display: "none" }, onclick: function () { goBack(); } }, B.icon("back", 22), h("span", null, "INDIETRO"));
    var foot = h("div", { class: "s-foot" }, fb, h("div", { class: "s-actions" }, backBtn, main));
    // suggerimento (grammatica, parole, frasi utili dell'unita'): solo nelle lezioni, mai nei test e negli esami
    var hintBtn = cfg.mode === "lesson" && cfg.unitId
      ? h("button", { class: "icon-btn hint-btn", "aria-label": "Suggerimento: grammatica e parole", onclick: function () { B.ui.hintSheet(cfg.unitId, cfg.kind); } }, B.icon("bulb", 22))
      : null;
    overlay.appendChild(h("div", { class: "session" }, h("div", { class: "s-top" }, closeBtn, bar, clock, hintBtn), body, foot));
    S.ui = { bar: bar.firstChild, body: body, foot: foot, fb: fb, main: main, clock: clock, back: backBtn };
    function updateBack() { S.ui.back.style.display = S.done.length && (S.phase === "question" || S.phase === "feedback") ? "" : "none"; }

    // negli esami: tempo trascorso rispetto a quello indicativo
    if (cfg.minutes) {
      S.timer = setInterval(function () {
        var m = Math.floor((Date.now() - S.t0) / 60000);
        clock.textContent = m + "/" + cfg.minutes + " min";
        clock.classList.toggle("late", m > cfg.minutes);
      }, 1000);
    }

    var ctx = {
      quiet: !!cfg.quiet,
      ready: function (b) { S.ui.main.disabled = !b; },
      hideMain: function (b) { S.ui.main.style.display = b ? "none" : ""; },
      press: function () { if (!S.ui.main.disabled && S.ui.main.style.display !== "none") S.ui.main.click(); },
      submit: function (result) { if (S.phase === "question") resolve(result); }
    };

    function drawBar() { S.ui.bar.style.width = Math.round(100 * S.passed / S.total) + "%"; }

    function showStep() {
      if (!S.queue.length) return finish();
      S.step = S.queue.shift();
      S.phase = "question";
      var tok = ++S.tok;
      // ogni passo ha il suo ctx: un timer rimasto indietro (es. abbina) non puo' chiudere un altro passo
      var stepCtx = Object.assign({}, ctx, { submit: function (result) { if (tok === S.tok && S.phase === "question") resolve(result); } });
      S.ui.body.innerHTML = ""; S.ui.fb.innerHTML = "";
      S.ui.foot.className = "s-foot";
      S.ui.main.className = "btn primary big";
      S.ui.main.style.display = "";
      var info = !B.engine.graded(S.step);
      S.ui.main.textContent = info ? "CONTINUA" : "CONTROLLA";
      S.ui.main.disabled = true;
      var R = Renderers[S.step.t];
      if (!R) { console.warn("step sconosciuto", S.step.t); S.passed++; return showStep(); }
      S.renderer = R(S.step, stepCtx);
      S.ui.body.appendChild(S.renderer.el);
      S.ui.body.scrollTop = 0;
      drawBar(); updateBack();
      if (S.renderer.onShow) S.renderer.onShow();
    }

    function resolve(result) {
      var step = S.step;
      S.phase = "feedback";
      // e = tutto cio' che questo passo ha cambiato nella sessione, per poterlo annullare con INDIETRO
      var e = { step: step, passedInc: 0, applied: false, right: 0, total: 0, wrongStep: false, lv: null, part: null, review: null, retryCopy: null, skipped: false };
      S.done.push(e);
      if (result.skip) { S.passed++; e.passedInc = 1; return showStep(); }
      if (result.skipped) { S.skipped++; S.passed++; e.skipped = true; e.passedInc = 1; return showStep(); }

      var total = result.total || 1, right = Math.max(0, Math.min(total, result.right || 0));
      var ok = total === 1 ? right >= 0.5 : right / total >= 0.6;
      var firstTry = !step._retry;
      if (firstTry) { S.right += right; S.items += total; e.applied = true; e.right = right; e.total = total; }
      if (!ok && firstTry) { S.wrongSteps++; e.wrongStep = true; }

      // statistiche (non nel test d'ingresso): ripetizione spaziata, abilità, errori da ripassare
      if (cfg.mode !== "placement") {
        var ids = step.wordIds || (step.wordId ? [step.wordId] : []);
        ids.forEach(function (id) { B.store.recordWord(id, ok); });
        if (firstTry) B.store.recordSkill(step._skill, right, total);
        if (step._key && cfg.mode !== "exam") B.store.recordMistake(step._key, !ok);
      } else if (firstTry) {
        var lv = S.byLevel[step.lv] = S.byLevel[step.lv] || { right: 0, total: 0 };
        lv.right += right; lv.total += total; e.lv = step.lv;
      }
      if (step._part != null && firstTry) {
        var pt = S.byPart[step._part] = S.byPart[step._part] || { right: 0, total: 0 };
        pt.right += right; pt.total += total; e.part = step._part;
      }
      if (!ok || right < total) {
        var rv = result.review && result.review.length ? result.review : (result.expected ? [result.expected] : []);
        if (cfg.quiet && rv.length) { e.review = { title: step.title || step.q || step.s || step.s1 || step.en || "Esercizio", lines: rv, why: result.explain || step.why }; S.review.push(e.review); }
      }

      if (cfg.quiet) { S.passed++; e.passedInc = 1; drawBar(); return showStep(); }

      if (ok) { S.passed++; e.passedInc = 1; B.sfx.ok(); }
      else {
        B.sfx.bad();
        if (cfg.retry && firstTry && total === 1 && !result.noRetry) { e.retryCopy = Object.assign({}, step, { _retry: true }); S.queue.push(e.retryCopy); }
        else { S.passed++; e.passedInc = 1; }
      }
      drawBar();

      // pannello di correzione
      S.ui.foot.className = "s-foot " + (ok ? "good" : "bad");
      var msg = h("div", { class: "fb-msg" });
      if (total > 1) {
        msg.appendChild(h("div", { class: "fb-title" }, B.icon(ok ? "check" : "x", 20), " " + (right % 1 ? right.toFixed(1) : right) + " su " + total + " giuste"));
      } else if (ok) {
        msg.appendChild(h("div", { class: "fb-title" }, B.icon("check", 20), " " + (result.note && /Quasi/.test(result.note) ? "Quasi." : B.pick(CHEERS))));
        if (result.note && /Quasi/.test(result.note) && result.expected) msg.appendChild(h("div", { class: "fb-sub" }, "Si scrive: " + result.expected));
        else if (result.note) msg.appendChild(h("div", { class: "fb-sub" }, result.note));
      } else {
        msg.appendChild(h("div", { class: "fb-title" }, B.icon("x", 20), " " + (result.expected ? "Risposta corretta:" : "Non ancora.")));
        if (result.expected) msg.appendChild(h("div", { class: "fb-answer" }, result.expected));
        if (result.note) msg.appendChild(h("div", { class: "fb-sub" }, result.note));
      }
      if (result.explain) msg.appendChild(h("div", { class: "fb-why" }, result.explain));
      if (!ok) { var rp = B.roast.pick(step.t); if (rp) msg.appendChild(B.roast.element(rp)); }
      S.ui.fb.innerHTML = "";
      S.ui.fb.appendChild(msg);
      S.ui.main.style.display = "";
      S.ui.main.disabled = false;
      S.ui.main.textContent = "CONTINUA";
      S.ui.main.className = "btn big " + (ok ? "primary" : "danger");
      var after = step.sayAfter || result.sayAfter || (step.t === "gap" ? result.expected : null);
      if (after) setTimeout(function () { B.speech.speak(after); }, 250);
      updateBack();
    }

    // annulla cio' che un passo concluso aveva cambiato nella sessione (punteggio, errori, ripetizione in coda)
    function undo(e) {
      S.passed -= e.passedInc;
      if (e.applied) { S.right -= e.right; S.items -= e.total; }
      if (e.wrongStep) S.wrongSteps--;
      if (e.skipped) S.skipped--;
      if (e.lv && S.byLevel[e.lv]) { S.byLevel[e.lv].right -= e.right; S.byLevel[e.lv].total -= e.total; }
      if (e.part != null && S.byPart[e.part]) { S.byPart[e.part].right -= e.right; S.byPart[e.part].total -= e.total; }
      if (e.review) { var i = S.review.indexOf(e.review); if (i >= 0) S.review.splice(i, 1); }
      if (e.retryCopy) { var j = S.queue.indexOf(e.retryCopy); if (j >= 0) S.queue.splice(j, 1); }
    }
    // INDIETRO: torna al passo precedente (se hai gia' risposto a quello attuale, la risposta viene annullata)
    function goBack() {
      if (S.phase !== "question" && S.phase !== "feedback") return;
      if (!S.done.length) return;
      B.speech.stop();
      var cur = S.step;
      if (S.phase === "feedback") undo(S.done.pop());
      var prev = S.done.pop();
      if (prev) { undo(prev); S.queue.unshift(cur); S.queue.unshift(prev.step); }
      else S.queue.unshift(cur);
      drawBar();
      showStep();
    }
    S.ui.main.addEventListener("click", function () {
      if (S.ui.main.disabled) return;
      if (S.phase === "done") return close();
      if (S.phase === "question") resolve(S.renderer.check());
      else if (S.phase === "feedback") showStep();
    });

    function askExit() {
      B.ui.confirm({ title: "Vuoi uscire?", text: cfg.quiet ? "Il test non verrà salvato." : "I progressi di questa sessione andranno persi.",
        ok: "ESCI", cancel: "CONTINUA", danger: true }).then(function (yes) { if (yes) close(); });
    }

    // stima indicativa della scala Cambridge dalla percentuale
    function cambridge(level, pct) {
      var base = { A2: [120, 70, 1.33], B1: [140, 70, 1.33], B2: [160, 60, 1.0] }[level];
      if (!base) return null;
      return Math.round(B.clamp(base[0] + (pct - base[1]) * base[2], base[0] - 40, base[0] + 30));
    }

    function finish() {
      B.speech.stop();
      clearInterval(S.timer);
      S.phase = "done"; updateBack();
      var secs = Math.round((Date.now() - S.t0) / 1000);
      var pct = S.items ? Math.round(100 * S.right / S.items) : 100;
      var xp = Math.round(S.right * (cfg.xpPer || 0)), bonus = 0;
      var root = h("div", { class: "end" });
      var headline = "Sessione completata", sub = null, passed = true, icon = "check";

      if (cfg.mode === "lesson") {
        var first = !B.store.lessonDone(cfg.lessonId);
        bonus = first ? cfg.bonus : Math.round(cfg.bonus / 4);
        B.store.recordLesson(cfg.lessonId, pct);
        headline = "Lezione completata"; icon = "star";
      } else if (cfg.mode === "test") {
        var was = B.store.lessonBest(cfg.lessonId) >= cfg.pass;
        B.store.recordLesson(cfg.lessonId, pct);
        passed = pct >= cfg.pass;
        bonus = passed && !was ? cfg.bonus : 0;
        headline = passed ? "Test superato" : "Test non superato";
        sub = passed ? "Hai sbloccato l'unità successiva." : "Serve almeno il " + cfg.pass + "%. Ripassa le lezioni dell'unità e riprova: puoi rifarlo quando vuoi.";
        icon = passed ? "trophy" : "flag";
      } else if (cfg.mode === "exam") {
        var parts = {};
        Object.keys(S.byPart).forEach(function (k) { var p = S.byPart[k]; parts[cfg.parts[k].id] = Math.round(100 * p.right / Math.max(1, p.total)); });
        if (cfg.full) B.store.recordExam(cfg.examId, pct, parts);
        passed = pct >= 60;
        bonus = cfg.full && passed ? cfg.bonus : 0;
        headline = cfg.full ? (passed ? "Esame superato" : "Esame non superato") : "Parte completata";
        var sc = cambridge(cfg.level, pct);
        sub = cfg.full ? "Punteggio stimato sulla scala Cambridge: circa " + sc + " (stima indicativa, non ufficiale)." : null;
        icon = passed ? "trophy" : "flag";
        var list = h("div", { class: "card parts" });
        Object.keys(S.byPart).forEach(function (k) {
          var p = S.byPart[k];
          list.appendChild(h("div", { class: "part-row" }, h("span", null, cfg.parts[k].title), h("b", null, Math.round(100 * p.right / Math.max(1, p.total)) + "%")));
        });
        root._extra = list;
      } else if (cfg.mode === "placement") {
        var lv = B.engine.placementLevel(S.byLevel);
        var scores = {};
        Object.keys(S.byLevel).forEach(function (k) { scores[k] = Math.round(100 * S.byLevel[k].right / Math.max(1, S.byLevel[k].total)); });
        B.store.setPlacement(lv, scores);
        headline = "Ti consigliamo di partire da " + lv;
        sub = "Risultati: " + Object.keys(scores).map(function (k) { return k + " " + scores[k] + "%"; }).join(", ") + ". Puoi cambiare livello di partenza dal Profilo.";
        icon = "compass";
      } else {
        bonus = cfg.bonus || 0;
      }
      if (passed) B.sfx.win();
      B.store.bump("sessions");
      B.store.addXp(xp + bonus, secs);
      var newBadges = B.badges.check();
      B.cloud.sync(false).catch(function () { /* offline: si salverà più tardi */ });

      root.appendChild(h("div", { class: "end-icon" + (passed ? "" : " bad") }, B.icon(icon, 56)));
      root.appendChild(h("h2", null, headline));
      if (sub) root.appendChild(h("p", { class: "muted center" }, sub));
      root.appendChild(h("div", { class: "stat-row" },
        stat("target", pct + "%", "Risposte giuste", "green"),
        stat("star", "+" + (xp + bonus), "XP", "orange"),
        stat("clock", fmtTime(secs), "Tempo", "blue")));
      if (root._extra) root.appendChild(root._extra);
      newBadges.forEach(function (b) { root.appendChild(h("div", { class: "banner gold" }, B.icon(b.icon, 20), " Nuovo traguardo: " + b.name)); });
      if (S.review.length) {
        var rv = h("div", { class: "card review-list" }, h("h4", { class: "no-top" }, "Da rivedere (" + S.review.length + ")"));
        S.review.forEach(function (r) {
          rv.appendChild(h("div", { class: "rv-item" }, h("div", { class: "rv-q" }, r.title), r.lines.map(function (l) { return h("div", { class: "rv-a" }, l); }), r.why ? h("div", { class: "muted small" }, r.why) : null));
        });
        root.appendChild(rv);
      }
      S.ui.body.innerHTML = ""; S.ui.fb.innerHTML = "";
      S.ui.foot.className = "s-foot";
      S.ui.body.appendChild(root);
      S.ui.body.scrollTop = 0;
      S.ui.main.className = "btn primary big"; S.ui.main.style.display = ""; S.ui.main.disabled = false;
      S.ui.main.textContent = "CONTINUA";
      S.result = { pct: pct, passed: passed };
    }

    function stat(icon, val, label, tone) {
      return h("div", { class: "stat " + tone }, h("div", { class: "stat-v" }, B.icon(icon, 18), " " + val), h("div", { class: "stat-l" }, label));
    }
    function fmtTime(s) { return s >= 60 ? Math.floor(s / 60) + "m " + (s % 60) + "s" : s + "s"; }

    function close() {
      B.speech.stop();
      clearInterval(S.timer);
      overlay.classList.remove("open");
      overlay.innerHTML = "";
      current = null;
      if (cfg.onClose) cfg.onClose(S);
      B.ui.refresh();
    }

    S.close = close; S.askExit = askExit;
    showStep();
  }

  B.session = {
    start: start,
    renderers: Renderers,
    isOpen: function () { return !!current; },
    back: function () { if (current && current.phase !== "done") current.askExit(); else if (current) current.close(); },
    _state: function () { return current; }
  };
})(window.B);
