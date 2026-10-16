/* Utilità generiche: DOM, random, normalizzazione risposte, distanza di edit. */
(function (B) {
  "use strict";

  // Mini "hyperscript": B.h("div", {class:"x", onclick:fn}, "testo", [figli]) -> HTMLElement
  B.h = function (tag, props) {
    var el = document.createElement(tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "html") el.innerHTML = v;
        else if (k === "style" && typeof v === "object") {
          for (var sk in v) {
            // le variabili CSS (--x) vanno impostate con setProperty, non come proprietà
            if (sk.slice(0, 2) === "--") el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk];
          }
        }
        else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { append(el, x); });
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }

  B.esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  B.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  B.sample = function (arr, n) { return B.shuffle(arr).slice(0, n); };
  B.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  B.uniq = function (arr) { return arr.filter(function (x, i) { return arr.indexOf(x) === i; }); };

  // Data locale AAAA-MM-GG (non UTC: la "giornata" dell'utente è quella del suo fuso).
  B.dayKey = function (d) {
    d = d || new Date();
    var m = d.getMonth() + 1, g = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (g < 10 ? "0" : "") + g;
  };
  B.daysAgo = function (n) { var d = new Date(); d.setDate(d.getDate() - n); return B.dayKey(d); };

  // --- Confronto risposte ---------------------------------------------------
  var CONTRACTIONS = [
    [/\bi'm\b/g, "i am"], [/\byou're\b/g, "you are"], [/\bhe's\b/g, "he is"], [/\bshe's\b/g, "she is"],
    [/\bit's\b/g, "it is"], [/\bwe're\b/g, "we are"], [/\bthey're\b/g, "they are"], [/\bthat's\b/g, "that is"],
    [/\bthere's\b/g, "there is"], [/\bwhat's\b/g, "what is"], [/\bwhere's\b/g, "where is"], [/\bhow's\b/g, "how is"],
    [/\bdon't\b/g, "do not"], [/\bdoesn't\b/g, "does not"], [/\bdidn't\b/g, "did not"], [/\bcan't\b/g, "can not"],
    [/\bcannot\b/g, "can not"], [/\bisn't\b/g, "is not"], [/\baren't\b/g, "are not"], [/\bi'd\b/g, "i would"],
    [/\bi'll\b/g, "i will"], [/\bwon't\b/g, "will not"], [/\blet's\b/g, "let us"]
  ];
  // Minuscolo, apostrofi tipografici -> ', contrazioni espanse, senza punteggiatura.
  B.norm = function (s) {
    s = String(s).toLowerCase().replace(/[’‘`´]/g, "'").trim();
    CONTRACTIONS.forEach(function (c) { s = s.replace(c[0], c[1]); });
    // contrazioni non ambigue con qualsiasi soggetto ('d e 's restano: would/had, is/has/genitivo)
    s = s.replace(/\b([a-z]+)'ll\b/g, "$1 will").replace(/\b([a-z]+)'ve\b/g, "$1 have").replace(/\b([a-z]+)'re\b/g, "$1 are")
      .replace(/\bshouldn't\b/g, "should not").replace(/\bwouldn't\b/g, "would not").replace(/\bcouldn't\b/g, "could not")
      .replace(/\bhaven't\b/g, "have not").replace(/\bhasn't\b/g, "has not").replace(/\bhadn't\b/g, "had not")
      .replace(/\bwasn't\b/g, "was not").replace(/\bweren't\b/g, "were not").replace(/\bmustn't\b/g, "must not")
      .replace(/\bneedn't\b/g, "need not").replace(/\bmightn't\b/g, "might not");
    // ortografia britannica e americana equivalenti: realise/realize, analyse/analyze
    s = s.replace(/([a-z]{3,})iz(e|es|ed|ing|ation|ations)\b/g, "$1is$2").replace(/([a-z]{2,})yz(e|es|ed|ing)\b/g, "$1ys$2");
    return s.replace(/[.,!?;:"“”¿¡()]/g, "").replace(/\s+/g, " ").trim();
  };

  // Distanza di edit in cui anche lo scambio di due lettere vicine conta 1 (recieve/receive).
  B.lev = function (a, b) {
    var m = a.length, n = b.length, i, j, pp = null, prev = [], cur;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (pp && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
      }
      pp = prev; prev = cur;
    }
    return prev[n];
  };
  // Somiglianza 0..1 tra due testi già normalizzati.
  B.similarity = function (a, b) {
    if (!a && !b) return 1;
    var d = B.lev(a, b), L = Math.max(a.length, b.length);
    return L ? 1 - d / L : 1;
  };

  // Un refuso è tollerato solo dentro una parola lunga e mai nella desinenza:
  // «recieve» per «receive» passa, «watches» per «watched» o «has» per «had» no (sono errori di grammatica).
  function typoOnly(a, b) {
    if (a.length < 5 || b.length < 5 || B.lev(a, b) > 1) return false;
    return a.slice(-2) === b.slice(-2);
  }
  function closeEnough(n, g) {
    var A = n.split(" "), G = g.split(" ");
    if (A.length !== G.length) return false;
    var diff = 0;
    for (var i = 0; i < A.length; i++) {
      if (A[i] === G[i]) continue;
      if (++diff > 1 || !typoOnly(A[i], G[i])) return false;
    }
    return diff === 1;
  }

  /**
   * Valuta una risposta digitata.
   * Ritorna "ok" (esatta), "close" (un refuso, accettata ma mostra la forma giusta) o "no".
   */
  B.judgeTyped = function (given, accepted) {
    var g = B.norm(given);
    if (!g) return "no";
    var best = "no";
    accepted.forEach(function (a) {
      var n = B.norm(a);
      if (n === g) best = "ok";
      else if (best !== "ok" && closeEnough(n, g)) best = "close";
    });
    return best;
  };

  B.wordCount = function (s) { return (String(s).match(/[A-Za-z0-9'’-]+/g) || []).length; };

  /**
   * Markup minimo dei contenuti -> DOM: riga vuota = paragrafo, "- " = elenco, **grassetto**.
   * Costruisce nodi di testo (niente innerHTML con dati remoti).
   */
  B.rich = function (text, cls) {
    var root = B.h("div", { class: "rich" + (cls ? " " + cls : "") });
    function inline(line) {
      var out = [], parts = String(line).split("**");
      parts.forEach(function (p, i) { if (p) out.push(i % 2 ? B.h("b", null, p) : p); });
      return out;
    }
    String(text || "").split(/\n\s*\n/).forEach(function (block) {
      var lines = block.split("\n"), list = null, para = [];
      function flushPara() { if (para.length) { root.appendChild(B.h("p", null, inline(para.join(" ")))); para = []; } }
      lines.forEach(function (ln) {
        if (/^\s*-\s+/.test(ln)) {
          flushPara();
          if (!list) { list = B.h("ul"); root.appendChild(list); }
          list.appendChild(B.h("li", null, inline(ln.replace(/^\s*-\s+/, ""))));
        } else { list = null; if (ln.trim()) para.push(ln.trim()); }
      });
      flushPara();
    });
    return root;
  };

  B.pluralize = function (n, one, many) { return n + " " + (n === 1 ? one : many); };
  B.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
})(window.B);
