/*
 * Scheda "Risorse": schede di grammatica (dalle lezioni), dizionario, flashcard e schede di consultazione
 * (verbi irregolari, phrasal verbs, falsi amici, modi di dire, connettivi, pronuncia), ognuna con un quiz veloce.
 */
(function (B) {
  "use strict";
  var h = B.h, S = B.store, R = B.repo, UI = B.ui;

  function searchBox(ph, onInput) {
    var input = h("input", { class: "search", type: "search", placeholder: ph, autocomplete: "off", spellcheck: "false" });
    input.addEventListener("input", function () { onInput(B.norm(input.value)); });
    return input;
  }
  function has(q) { var fields = Array.prototype.slice.call(arguments, 1); return !q || fields.some(function (f) { return f && B.norm(f).indexOf(q) >= 0; }); }
  function quizBtn(label, fn) { return h("button", { class: "btn blue", onclick: fn }, B.icon("bolt", 18), " " + label); }
  function session(title, steps) { B.session.start({ mode: "practice", title: title, steps: steps, xpPer: 1, bonus: 3, retry: true }); }
  function mcStep(base, correct, wrongs) {
    var opts = B.shuffle([correct].concat(wrongs.filter(function (w) { return w !== correct; }).slice(0, 3)));
    return Object.assign({ t: "mc", opts: opts, a: opts.indexOf(correct), _skill: "vocab" }, base);
  }
  function lvTag(lv) { return lv ? h("span", { class: "lv-tag" }, lv) : null; }

  // ---------------------------------------------------------------- grammatica
  function grammarList() {
    var root = h("div", { class: "list" }, h("p", { class: "muted" }, "Tutte le regole spiegate nelle lezioni di grammatica, raccolte per livello."));
    var sheets = R.grammarSheets();
    R.LEVELS.forEach(function (lv) {
      var mine = sheets.filter(function (s) { return s.unit.level === lv; });
      if (!mine.length) return;
      root.appendChild(UI.sectionTitle(lv + " · " + R.level(lv).title));
      mine.forEach(function (s) {
        root.appendChild(UI.rowCard("puzzle", s.unit.grammar, "Unità " + s.unit.position + " · " + s.notes.length + " schede", null,
          function () { UI.push(s.unit.grammar, function () { return grammarDetail(s); }); }));
      });
    });
    return root;
  }
  function grammarDetail(s) {
    var root = h("div", { class: "detail" });
    s.notes.forEach(function (n) { root.appendChild(B.noteCard(n)); });
    root.appendChild(h("button", { class: "btn primary big", onclick: function () { B.session.start(B.engine.lessonSession(s.lesson.id)); } }, "FAI LA LEZIONE"));
    return root;
  }

  // ---------------------------------------------------------------- dizionario
  function dictionary() {
    var root = h("div", { class: "list" }), list = h("div", { class: "dict-list" }), count = h("div", { class: "muted center" });
    var words = R.allWords().slice().sort(function (a, b) { return a.en.localeCompare(b.en); });
    function draw(q) {
      list.innerHTML = "";
      var shown = words.filter(function (w) { return has(q, w.en, w.it); });
      count.textContent = shown.length + " parole";
      shown.slice(0, 150).forEach(function (w) {
        var st = S.word(w.id);
        list.appendChild(h("button", { class: "card dict-row", onclick: function () { B.speech.speak(w.en); } },
          B.pic(w, "dict-pic"),
          h("div", { class: "grow" },
            h("div", { class: "row-title" }, w.en, " ", h("span", { class: "ipa" }, "/" + w.ipa + "/"), " ", lvTag(w.level)),
            h("div", { class: "muted" }, w.it), B.synLine(w), w.ex ? h("div", { class: "dict-ex" }, w.ex[0]) : null),
          h("div", { class: "box-dots", title: "Memoria" }, [0, 1, 2, 3, 4].map(function (k) { return h("i", { class: st && st.b > k ? "on" : "" }); }))));
      });
      if (shown.length > 150) list.appendChild(h("p", { class: "muted center" }, "Scrivi qualcosa per restringere la ricerca."));
    }
    root.appendChild(searchBox("Cerca in italiano o in inglese", draw));
    root.appendChild(count); root.appendChild(list);
    draw("");
    return root;
  }

  // ---------------------------------------------------------------- flashcard
  // tutte le parole con cui fare le carte: quelle delle unità e quelle delle liste per tema (id "rw:parola")
  function cardWords() {
    var out = R.allWords().slice();
    R.resources().forEach(function (r) {
      if (r.kind !== "words") return;
      (r.items || []).forEach(function (x) { out.push(Object.assign({ id: "rw:" + String(x.en).toLowerCase(), level: x.lv || r.lv }, x)); });
    });
    return out;
  }
  // una parola mai vista si propone solo se l'unità (o il livello, per le liste) è sbloccata
  function cardOpen(w) {
    var u = w.unit ? R.unit(w.unit) : R.units().filter(function (x) { return x.level === w.level; })[0];
    return !u || B.path.unitUnlocked(u);
  }
  var COOLDOWN = 20 * 60 * 1000;
  /**
   * Mazzo a rotazione: n carte divise in parti uguali tra i tipi di parola (nome, verbo, aggettivo, espressione...).
   * In ogni tipo si prendono prima le mai viste, poi quelle viste da più tempo (campo last; le deboli contano come più vecchie). Le carte viste da meno
   * di 20 minuti si usano solo se mancano le altre, così due mazzi di fila non si ripetono.
   */
  function pickDeck(n) {
    var now = Date.now(), groups = {}, recent = [];
    B.shuffle(cardWords()).forEach(function (w) {
      var st = S.word(w.id), last = st ? (st.last || 0) : -1;
      if (last < 0 && !cardOpen(w)) return;
      // le parole deboli (box 0-2) passano avanti come se fossero state viste 3 giorni prima
      var item = { w: w, last: last < 0 ? last : last - (st.b <= 2 ? 3 * 86400000 : 0), raw: last };
      if (item.raw > now - COOLDOWN) recent.push(item); else (groups[w.pos || "n"] = groups[w.pos || "n"] || []).push(item);
    });
    var keys = B.shuffle(Object.keys(groups)), deck = [];
    keys.forEach(function (k) { groups[k].sort(function (a, b) { return a.last - b.last; }); });
    while (deck.length < n && keys.some(function (k) { return groups[k].length; })) {
      keys.forEach(function (k) { if (deck.length < n && groups[k].length) deck.push(groups[k].shift().w); });
    }
    recent.sort(function (a, b) { return a.last - b.last; });
    while (deck.length < n && recent.length) deck.push(recent.shift().w);
    return B.shuffle(deck);
  }
  function flashcards() {
    var deck = pickDeck(20);
    var idx = 0, known = 0, flipped = false, t0 = Date.now();
    var root = h("div", { class: "flash" });
    function draw() {
      root.innerHTML = "";
      if (!deck.length) { root.appendChild(h("p", { class: "muted center" }, "Nessuna parola disponibile: inizia una lezione di lessico.")); return; }
      if (idx >= deck.length) return end();
      var w = deck[idx];
      root.appendChild(h("div", { class: "bar thin" }, h("div", { class: "bar-fill", style: { width: Math.round(100 * idx / deck.length) + "%" } })));
      root.appendChild(h("div", { class: "muted center" }, (idx + 1) + " / " + deck.length));
      var card = h("button", { class: "fcard" + (flipped ? " flipped" : ""), onclick: function () { if (!flipped) { flipped = true; B.speech.speak(w.en); draw(); } } });
      if (B.hasPic(w)) card.appendChild(B.pic(w, "fc-pic"));
      if (!flipped) {
        card.appendChild(h("div", { class: "fc-main" }, w.it));
        card.appendChild(h("div", { class: "muted" }, "Pensa alla parola inglese, poi tocca per girare"));
      } else {
        card.appendChild(h("div", { class: "fc-main" }, w.en));
        card.appendChild(h("div", { class: "ipa" }, "/" + w.ipa + "/"));
        if (w.syn && w.syn.length) card.appendChild(B.synLine(w, "fc-syn"));
        if (w.ex) { card.appendChild(h("div", { class: "fc-ex" }, w.ex[0])); card.appendChild(h("div", { class: "muted" }, w.ex[1])); }
      }
      root.appendChild(card);
      if (flipped) {
        root.appendChild(h("div", { class: "row gap" },
          h("button", { class: "btn danger-outline grow", onclick: function () { answer(false); } }, "DA RIVEDERE"),
          h("button", { class: "btn primary grow", onclick: function () { answer(true); } }, "LA SAPEVO")));
      }
    }
    function answer(ok) { S.recordWord(deck[idx].id, ok); if (ok) known++; idx++; flipped = false; draw(); }
    function end() {
      S.addXp(Math.min(15, known), Math.round((Date.now() - t0) / 1000));
      B.sfx.win();
      root.appendChild(h("div", { class: "end" }, h("div", { class: "end-icon" }, B.icon("cards", 54)), h("h2", null, "Mazzo finito"),
        h("p", { class: "muted center" }, "Sapevi " + known + " carte su " + deck.length),
        h("button", { class: "btn primary big", onclick: function () { UI.pop(); } }, "FINITO"),
        h("button", { class: "btn ghost big", onclick: function () { UI.pop(); UI.push("Flashcard", flashcards); } }, "UN ALTRO MAZZO")));
    }
    draw();
    return root;
  }

  // ---------------------------------------------------------------- schede di consultazione
  var KINDS = {
    verbs: {
      icon: "swap", search: function (v, q) { return has(q, v.base, v.past, v.pp, v.it); },
      row: function (v) {
        return h("button", { class: "vrow", onclick: function () { B.speech.playLines([["A", v.base], ["A", v.past.split(" / ")[0]], ["A", v.pp.split(" / ")[0]]]); } },
          h("span", { class: "b" }, v.base), h("span", null, v.past), h("span", null, v.pp), h("span", { class: "muted" }, v.it));
      },
      wrap: function (rows) { return h("div", { class: "vtable" }, h("div", { class: "vrow head" }, h("span", null, "Base"), h("span", null, "Past"), h("span", null, "Participio"), h("span", null, "Italiano")), rows); },
      quiz: function (items) {
        return B.sample(items, 10).map(function (v, i) {
          if (i % 2) return { t: "type", q: "Participio passato di «" + v.base + "»", text: v.it, answers: v.pp.split(/\s*\/\s*/), sayAfter: v.pp, _skill: "grammar" };
          return { t: "type", q: "Past simple di «" + v.base + "»", text: v.it, answers: v.past.split(/\s*\/\s*/), sayAfter: v.past, _skill: "grammar" };
        });
      }
    },
    phrasal: {
      icon: "bolt", search: function (x, q) { return has(q, x.en, x.it); },
      row: function (x) { return card(x.en, x.it, x.ex, x.lv); },
      quiz: function (items) { return B.sample(items, 10).map(function (x) { return mcStep({ q: "Che cosa significa?", text: x.en, say: x.en, sayAfter: x.ex && x.ex[0] }, x.it, B.sample(items, 5).map(function (o) { return o.it; })); }); }
    },
    falsefriends: {
      icon: "warn", search: function (x, q) { return has(q, x.en, x.trap, x.real); },
      row: function (f) {
        return h("div", { class: "card ff" },
          h("div", { class: "ff-head", onclick: function () { B.speech.speak(f.en); } }, h("span", { class: "ff-en" }, f.en), f.ipa ? h("span", { class: "ipa" }, " /" + f.ipa + "/") : null),
          h("div", { class: "ff-line no" }, B.icon("x", 16), " Non significa «" + f.trap + "»"),
          h("div", { class: "ff-line yes" }, B.icon("check", 16), " Significa «" + f.real + "»"),
          h("div", { class: "ff-line fix" }, "Per dire «" + f.trap.replace(/ \(.*\)/, "") + "»: " + f.fix),
          f.ex ? UI.speakable(f.ex[0], f.ex[1], "ex") : null);
      },
      quiz: function (items) {
        return B.sample(items, 10).map(function (f) {
          return mcStep({ q: "Che cosa significa davvero?", text: f.en, say: f.en, why: "«" + f.en + "» significa «" + f.real + "». Per dire «" + f.trap + "» si usa «" + f.fix + "»." },
            f.real, [f.trap].concat(B.sample(items, 4).map(function (o) { return o.real; })));
        });
      }
    },
    idioms: {
      icon: "chat", search: function (x, q) { return has(q, x.en, x.it); },
      row: function (d) { return card(d.en, d.it, d.ex, d.lv, d.lit ? "Alla lettera: " + d.lit : null); },
      quiz: function (items) { return B.sample(items, 10).map(function (d) { return mcStep({ q: "Che cosa significa?", text: d.en, say: d.en }, d.it, B.sample(items, 5).map(function (o) { return o.it; })); }); }
    },
    connectors: {
      icon: "swap", search: function (x, q) { return has(q, x.en, x.it, x.use); },
      row: function (c) { return card(c.en, c.it, c.ex, c.lv, c.use); },
      quiz: function (items) {
        return B.sample(items.filter(function (c) { return c.ex && new RegExp("\\b" + c.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(c.ex[0]); }), 10).map(function (c) {
          var re = new RegExp("\\b" + c.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
          return { t: "gap", s: c.ex[0].replace(re, "___"), it: c.ex[1], opts: B.shuffle([c.en].concat(B.sample(items.filter(function (o) { return o !== c; }), 2).map(function (o) { return o.en; }))), a: -1, _connector: c.en, _skill: "writing" };
        }).map(function (s) { s.a = s.opts.indexOf(s._connector); return s; });
      }
    },
    // parole per tema: foto o emoji, pronuncia, traduzione e frase d'uso; quiz misto (significato, scrittura, ascolto, immagine)
    words: {
      icon: "cards", search: function (x, q) { return has(q, x.en, x.it); },
      row: function (x) {
        return h("button", { class: "card word-card", onclick: function () { B.speech.speak(x.en); } },
          B.hasPic(x) ? h("div", { class: "wc-pic" }, B.pic(x)) : null,
          h("div", { class: "grow" },
            h("div", { class: "word-en" }, x.en, " ", x.pos ? h("span", { class: "word-pos" }, x.pos) : null, " ", B.icon("speaker", 14, "mini"), " ", lvTag(x.lv)),
            x.ipa ? h("div", { class: "word-ipa" }, "/" + x.ipa + "/") : null, h("div", { class: "word-it" }, x.it), B.synLine(x),
            x.ex ? h("div", { class: "hint-ex" }, x.ex[0], h("div", { class: "muted small" }, x.ex[1])) : null));
      },
      quiz: function (items) {
        return B.sample(items, 10).map(function (x, i) {
          var wrongs = B.sample(items.filter(function (o) { return o !== x; }), 6);
          if (i % 4 === 3 && x.syn && x.syn.length) {
            var sw = items.filter(function (o) { return o !== x && o.pos === x.pos && o.en !== x.en && x.syn.indexOf(o.en) < 0 && (o.syn || []).indexOf(x.en) < 0 && !(o.syn || []).some(function (s) { return x.syn.indexOf(s) >= 0; }); });
            if (sw.length >= 3) return mcStep({ q: "Quale parola ha un significato simile?", text: x.en, sub: x.ipa ? "/" + x.ipa + "/" : null, say: x.en }, B.pick(x.syn), B.sample(sw, 3).map(function (o) { return o.en; }));
          }
          if (i % 4 === 0) return { t: "type", q: "Scrivi in inglese", text: x.it, answers: [x.en].concat(x.alts || []), sayAfter: x.en, word: true, _skill: "vocab" };
          if (i % 4 === 1) return mcStep({ q: "Che cosa significa?", text: x.en, sub: x.ipa ? "/" + x.ipa + "/" : null, say: x.en }, x.it, wrongs.map(function (o) { return o.it; }));
          if (i % 4 === 2 && B.hasPic(x)) return mcStep({ q: "Che cos'è?", emoji: x.emoji, photo: x.photo, img: x.img, sayAfter: x.en }, x.en, wrongs.map(function (o) { return o.en; }));
          return mcStep({ q: "Ascolta e scegli il significato", say: x.en, hide: true }, x.it, wrongs.map(function (o) { return o.it; }));
        });
      }
    },
    // collocazioni (make a decision, take a break...): quiz sul verbo giusto
    collocations: {
      icon: "swap", search: function (x, q) { return has(q, x.en, x.it, x.group); },
      row: function (x) { return card(x.en, x.it, x.ex, x.lv, x.group ? "Gruppo: " + x.group : null); },
      quiz: function (items) {
        var groups = B.uniq(items.map(function (x) { return x.group; }).filter(Boolean));
        return B.sample(items, 10).map(function (x) {
          var g = x.group && x.en.indexOf(x.group + " ") === 0 && groups.length >= 3 ? x.group : null;
          if (g) return mcStep({ q: "Quale verbo completa la collocazione?", text: "___ " + x.en.slice(g.length + 1), sub: x.it, sayAfter: x.en }, g, B.sample(groups.filter(function (o) { return o !== g; }), 3));
          return mcStep({ q: "Che cosa significa?", text: x.en, say: x.en, sayAfter: x.en }, x.it, B.sample(items.filter(function (o) { return o !== x; }), 4).map(function (o) { return o.it; }));
        });
      }
    },
    // errori tipici degli italiani: sbagliato -> corretto, con la spiegazione
    mistakes: {
      icon: "warn", search: function (x, q) { return has(q, x.wrong, x.right, x.topic); },
      row: function (x) {
        return h("div", { class: "card mistake" },
          h("div", { class: "ms-wrong" }, B.icon("x", 16), h("span", null, x.wrong)),
          h("button", { class: "ms-right", onclick: function () { B.speech.speak(x.right); } }, B.icon("check", 16), h("span", null, x.right), " ", B.icon("speaker", 14, "mini")),
          h("div", { class: "muted small" }, x.why), x.topic || x.lv ? h("div", { class: "ms-tags" }, x.topic ? h("span", { class: "chip" }, x.topic) : null, lvTag(x.lv)) : null);
      },
      quiz: function (items) {
        return B.sample(items, 10).map(function (x, i) {
          if (i % 5 < 3) return { t: "fix", q: "Correggi l'errore e riscrivi la frase", s: x.wrong, answers: [x.right].concat(x.alts || []), why: x.why, sayAfter: x.right, _skill: "grammar" };
          return mcStep({ q: "Qual è la frase corretta?", why: x.why, sayAfter: x.right, _skill: "grammar" }, x.right, [x.wrong].concat(x.more || []));
        });
      }
    },
    // come si dicono numeri, date, orari, prezzi, indirizzi: da leggere e da scrivere sotto dettatura
    sayit: {
      icon: "clock", search: function (x, q) { return has(q, x.written, x.spoken, x.group); },
      row: function (x) {
        return h("button", { class: "card sayit", onclick: function () { B.speech.speak(x.spoken); } },
          h("div", { class: "si-w" }, x.written), h("div", { class: "grow" }, h("div", { class: "si-s" }, x.spoken, " ", B.icon("speaker", 14, "mini")), h("div", { class: "muted small" }, x.it + (x.note ? " - " + x.note : ""))));
      },
      quiz: function (items) {
        return B.sample(items, 10).map(function (x, i) {
          if (i % 2 === 0) return { t: "type", q: "Ascolta e scrivi", say: x.spoken, hide: true, answers: [x.written].concat(x.alts || []), sayAfter: x.spoken, word: true, _skill: "listening" };
          return mcStep({ q: "Come si legge?", text: x.written, sayAfter: x.spoken, _skill: "listening" }, x.spoken, B.sample(items.filter(function (o) { return o !== x; }), 4).map(function (o) { return o.spoken; }));
        });
      }
    },
    // frasi utili per situazione (aeroporto, ristorante, telefono...)
    phrases: {
      icon: "chat", search: function (x, q) { return has(q, x.en, x.it, x.group); },
      row: function (x) { return card(x.en, x.it, x.ex, x.lv, x.group); },
      quiz: function (items) {
        return B.sample(items, 10).map(function (x, i) {
          var wrongs = B.sample(items.filter(function (o) { return o !== x; }), 4);
          if (i % 3 === 0) return { t: "speak", en: x.en, it: x.it };
          if (i % 3 === 1) return mcStep({ q: "Che cosa significa?", text: x.en, say: x.en }, x.it, wrongs.map(function (o) { return o.it; }));
          return mcStep({ q: "Come si dice in inglese?", text: x.it, sayAfter: x.en }, x.en, wrongs.map(function (o) { return o.en; }));
        });
      }
    },
    // "Descrivi la foto" (stile esame di parlato Cambridge): una o due foto, domanda, aiuti e risposta modello
    photos: {
      icon: "image", search: function (x, q) { return has(q, x.q, x.lv); },
      row: function (x) {
        var ids = x.photos || [x.photo];
        return h("button", { class: "card photo-task", onclick: function () {
          B.session.start({ mode: "practice", title: "Descrivi la foto", xpPer: 2, bonus: 5, retry: false, steps: [{ t: "speakTask", q: x.q, it: x.it, hints: x.hints, model: x.model, min: x.min || 30, photo: x.photo, photos: x.photos, _skill: "speaking" }] });
        } },
          h("div", { class: "pt-pics" }, ids.map(function (id) { return B.photo(id, "pt-pic", ""); })),
          h("div", { class: "grow" }, h("div", { class: "row-title" }, x.q), h("div", { class: "muted small" }, (x.photos ? "Confronta due foto" : "Descrivi una foto") + " · " + x.lv)));
      }
    },
    pron: {
      icon: "mic", search: function (x, q) { return has(q, x.title, x.sound); },
      row: function (p) {
        return UI.rowCard("speaker", p.title + "  /" + p.sound + "/", p.words.slice(0, 4).map(function (w) { return w[0]; }).join(" · "), null,
          function () { UI.push(p.title, function () { return pronDetail(p); }); });
      },
      quiz: function (items) {
        var steps = [];
        B.sample(items, 5).forEach(function (p) {
          B.sample(p.words, 2).forEach(function (w) { steps.push({ t: "speak", en: w[0], it: "/" + w[1] + "/ · " + w[2] }); });
        });
        return steps;
      }
    }
  };
  function card(en, it, ex, lv, extra) {
    return h("div", { class: "card idiom" },
      h("div", { class: "idiom-en", onclick: function () { B.speech.speak(en); } }, en, " ", B.icon("speaker", 15, "mini"), " ", lvTag(lv)),
      h("div", { class: "idiom-it" }, it),
      extra ? h("div", { class: "muted small" }, extra) : null,
      ex ? UI.speakable(ex[0], ex[1], "ex") : null);
  }
  function pronDetail(p) {
    var root = h("div", { class: "detail" }, h("div", { class: "big-sound" }, "/" + p.sound + "/"), h("h2", null, p.title),
      h("div", { class: "card" }, B.rich(p.tip)), h("h4", null, "Ascolta e ripeti"));
    p.words.forEach(function (w) {
      root.appendChild(UI.rowCard("speaker", w[0], "/" + w[1] + "/ · " + w[2], h("span"), function () { B.speech.speak(w[0]); }));
    });
    root.appendChild(h("button", { class: "btn primary big", onclick: function () {
      session("Pronuncia: " + p.title, p.words.map(function (w) { return { t: "speak", en: w[0], it: "/" + w[1] + "/ · " + w[2] }; }));
    } }, "ESERCITATI A VOCE"));
    return root;
  }

  var GROUP_NAMES = { words: "Parole per tema", phrases: "Frasi utili per situazione", photos: "Descrivi la foto", mistakes: "Errori tipici degli italiani", sayit: "Numeri, date, orari e prezzi", collocations: "Collocazioni" };
  // elenco di più risorse dello stesso tipo
  function groupPage(list, K) {
    var root = h("div", { class: "list" });
    var byLevel = {};
    list.forEach(function (res) { var lv = res.lv || ""; (byLevel[lv] = byLevel[lv] || []).push(res); });
    Object.keys(byLevel).sort().forEach(function (lv) {
      if (lv) root.appendChild(UI.sectionTitle(lv));
      byLevel[lv].forEach(function (res) {
        root.appendChild(UI.rowCard(K.icon, res.title, res.items.length + " voci", null, function () { UI.push(res.title, function () { return resourcePage(res); }); }));
      });
    });
    return root;
  }

  function resourcePage(res) {
    var K = KINDS[res.kind];
    var root = h("div", { class: "list" }), body = h("div", { class: "res-body" });
    if (res.intro) root.appendChild(h("p", { class: "muted" }, res.intro));
    if (K.quiz) root.appendChild(quizBtn("Quiz veloce", function () { session(res.title, K.quiz(res.items)); }));
    function draw(q) {
      body.innerHTML = "";
      var rows = res.items.filter(function (x) { return K.search(x, q); }).map(K.row);
      body.appendChild(K.wrap ? K.wrap(rows) : h("div", null, rows));
      if (!rows.length) body.appendChild(h("p", { class: "muted center" }, "Nessun risultato."));
    }
    if (res.items.length > 12) root.appendChild(searchBox("Cerca", draw));
    root.appendChild(body);
    draw("");
    return root;
  }

  B.resources = {
    open: function (id) {
      var res = R.resource(id);
      if (res && KINDS[res.kind]) UI.push(res.title, function () { return resourcePage(res); });
      return !!res;
    }
  };

  UI.register("resources", function () {
    var root = h("div", { class: "list" });
    root.appendChild(UI.sectionTitle("Studia e consulta", "Tutto quello che serve oltre alle lezioni"));
    root.appendChild(UI.rowCard("puzzle", "Grammatica", R.grammarSheets().length + " argomenti, dall'A2 al B2", null, function () { UI.push("Grammatica", grammarList); }));
    root.appendChild(UI.rowCard("search", "Dizionario", R.allWords().length + " parole del corso", null, function () { UI.push("Dizionario", dictionary); }));
    root.appendChild(UI.rowCard("cards", "Flashcard", "Mazzi da 20 parole a rotazione: prima le nuove e quelle viste da più tempo", null, function () { UI.push("Flashcard", flashcards); }));
    var byKind = {}, order = [];
    R.resources().forEach(function (res) {
      if (!KINDS[res.kind]) return;
      if (!byKind[res.kind]) { byKind[res.kind] = []; order.push(res.kind); }
      byKind[res.kind].push(res);
    });
    order.forEach(function (kind) {
      var list = byKind[kind], K = KINDS[kind];
      if (list.length === 1) {
        var res = list[0];
        root.appendChild(UI.rowCard(K.icon, res.title, res.items.length + " voci", null, function () { UI.push(res.title, function () { return resourcePage(res); }); }));
      } else {
        var total = list.reduce(function (a, r) { return a + r.items.length; }, 0), name = GROUP_NAMES[kind] || kind;
        root.appendChild(UI.rowCard(K.icon, name, list.length + " elenchi, " + total + " voci", null, function () { UI.push(name, function () { return groupPage(list, K); }); }));
      }
    });
    return root;
  });
})(window.B);
