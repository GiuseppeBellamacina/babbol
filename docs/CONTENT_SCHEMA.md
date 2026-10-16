# Formato dei contenuti di Babbol

I contenuti stanno in `content/` (sorgente versionata) e, una volta caricati, nella tabella `public.content` di Supabase.
L'app li riceve con `get_course_changes(rev)` e li tiene in cache; lo snapshot `www/content/course.js` (generato) serve al primo avvio.

**Regole generali**
- **Emoji solo come immagine di una parola** (campo `emoji`, una sola emoji, per oggetti semplici). Vietate in tutti gli altri campi. Le scene complesse sono SVG in `www/img/v/<nome>.svg`, referenziate dal campo `img` di una parola o di uno step.
- Gli `id` sono **stabili**: progressi e ripasso sono legati agli id. Non rinumerare mai; per togliere qualcosa si usa `deleted`.
- Spiegazioni, istruzioni e traduzioni in **italiano**; frasi da imparare in **inglese britannico** (ortografia UK).
- Difficoltà da adulti: niente domande ovvie, distrattori plausibili (errori tipici degli italiani), più risposte scritte che a scelta.
- Nei campi `answers` metti **tutte** le varianti corrette ragionevoli (contrazioni comprese: l'app espande già `I'm`, `don't`, ecc.).
  Il confronto ignora maiuscole e punteggiatura finale.
- Testo con markup minimo: `**grassetto**`, righe che iniziano con `- ` = elenco, riga vuota = nuovo paragrafo.

## File

```
content/
  meta.json            -> { "levels": [ { "id": "A2", "title", "sub", "color", "hours" } ] }
  placement.json       -> test d'ingresso
  units/a2-01.json     -> un'unità con le sue 7 lezioni
  exams/exam-b1.json   -> simulazione B1 Preliminary   (exam-a2, exam-b1, exam-b2)
  resources/*.json     -> schede di consultazione (verbi, phrasal verbs, falsi amici...)
```

## Unità (`content/units/<id>.json`)

```jsonc
{
  "id": "b1-03", "level": "B1", "position": 3,
  "title": "Storie e ricordi",                          // titolo breve in italiano
  "sub": "Past perfect - raccontare un viaggio",        // sottotitolo
  "grammar": "Past perfect e narrative tenses",         // focus grammaticale
  "topic": "Viaggi ed esperienze",                      // tema lessicale
  "situation": "Raccontare un imprevisto in vacanza",   // situazione reale
  "lessons": [ /* 7 lezioni, in quest'ordine di kind */ ]
}
```

Le 7 lezioni, con `id` = `<unità>-<kind>`:

| kind | Scopo | Contenuto minimo |
|---|---|---|
| `grammar` | regola + pratica | 3-5 `note` (spiegazione in italiano, tabella, errori tipici degli italiani) e 14-18 esercizi misti (`gap`, `type`, `transform`, `fix`, `order`, `mc`) dal facile al difficile |
| `vocab` | lessico del tema | 12-16 `words`, poi `{ "t": "words" }`, `{ "t": "drill", "n": 10 }` e 5-7 esercizi a frase (collocazioni, `wordform`, `gap`, `type`, `match`) |
| `reading` | comprensione scritta | 1 `read` (lunghezza per livello, sotto) con 6-8 domande e 3-4 esercizi sul lessico del testo |
| `listening` | comprensione orale | 1-2 `listen` con 5-7 domande, 2 `dictation`, 1 `speak` |
| `situation` | vita reale | 1-2 `note` di frasi funzionali, 2 `dialog`, `match`, `order`, 3 `speak`, 1 `speakTask` |
| `production` | scrivere e parlare | `note` con frasi utili e connettivi, 3-4 esercizi di preparazione, 1 `write`, 2 `speakTask` |
| `test` | verifica dell'unità | 20-25 esercizi valutati senza `note` (grammatica, lessico, un `cloze` o `read` breve, un `listen` breve). Campo `"pass": 70` |

**Lunghezze dei testi**:

| Livello | `read` (parole) | `listen` (parole di copione) | `write` (parole) |
|---|---|---|---|
| A2 | 180-250 | 120-180 | 60-80 |
| B1 | 300-400 | 200-300 | 100-120 |
| B2 | 450-600 | 300-450 | 140-190 |

Lezione:

```jsonc
{
  "id": "b1-03-vocab", "kind": "vocab",
  "title": "In viaggio",
  "intro": "Una o due frasi in italiano: cosa imparerai e perché serve.",
  "minutes": 15,                                  // durata stimata
  "words": [                                      // solo per vocab (facoltativo altrove)
    { "id": "b1-03-w01", "en": "luggage", "it": "bagagli", "ipa": "ˈlʌɡɪdʒ", "pos": "n",
      "ex": ["My luggage got lost in Paris.", "I miei bagagli si sono persi a Parigi."],
      "note": "Non numerabile: mai «luggages».", "emoji": "🧳" }
  ],
  "steps": [ /* vedi sotto */ ],
  "pass": 70                                      // solo per kind = test
}
```
`pos`: n, v, adj, adv, phr (espressione), pv (phrasal verb). `emoji` (una sola) per oggetti concreti semplici; `img` (SVG) solo per scene complesse o cose senza emoji adatta.

## Tipi di step (`t`)

Ogni step valutato può avere `why`: spiegazione in italiano mostrata dopo la risposta (fortemente consigliata).

### Non valutati
```jsonc
{ "t": "note", "title": "Quando si usa", "body": "Testo in italiano con **grassetto** e\n- elenchi",
  "ex": [["I had already left.", "Ero già uscito."]],              // facoltativo, esempi ascoltabili
  "table": [["", "Affermativa", "Negativa"], ["I/you/he...", "had gone", "hadn't gone"]] }   // facoltativo
{ "t": "words" }                     // mostra le parole della lezione (4 per pagina)
{ "t": "drill", "n": 10 }            // n esercizi generati automaticamente sulle parole della lezione
```

### Scelta
```jsonc
{ "t": "mc", "q": "Domanda (it o en)", "text": "Frase/contesto in inglese (facoltativo)", "audio": false,
  "opts": ["...", "...", "...", "..."], "a": 0, "why": "..." }
{ "t": "gap", "s": "By the time we arrived, the film ___ .", "opts": ["had started", "has started", "started"], "a": 0,
  "it": "Quando siamo arrivati il film era già iniziato.", "why": "..." }
{ "t": "match", "pairs": [["make a decision", "prendere una decisione"], ["do research", "fare ricerca"]] }   // 4-6 coppie
{ "t": "dialog", "title": "Al check-in", "it": "Scegli la battuta giusta.",
  "lines": [["Agent", "Good morning. Can I see your passport?"],
            ["Tu", { "opts": ["Here you are.", "Here you go to.", "Take it you."], "a": 0 }],
            ["Agent", "Thank you. Any bags to check in?"]] }
```
`a` è l'indice (da 0) dell'opzione giusta. L'app mescola le opzioni.

### Scrittura
```jsonc
{ "t": "type", "q": "Traduci in inglese", "text": "Non lo vedo da anni.", "answers": ["I haven't seen him for years", "I have not seen him in years"] }
{ "t": "type", "q": "Completa con UNA parola", "s": "She's been working here ___ 2019.", "answers": ["since"] }
{ "t": "order", "it": "Non sapevo che fosse già partita.", "en": "I didn't know she had already left", "extra": ["has", "yet"], "alts": [] }
{ "t": "transform", "s1": "I started learning English three years ago.", "key": "BEEN",
  "s2": "I ___ English for three years.", "answers": ["have been learning", "'ve been learning"], "why": "..." }   // 2-5 parole, key compresa
{ "t": "wordform", "s": "The trip was a complete ___ .", "root": "DISASTER", "answers": ["disaster"] }   // la forma giusta della parola-radice
{ "t": "fix", "q": "Correggi l'errore", "s": "I am living here since 2015.", "answers": ["I have been living here since 2015", "I have lived here since 2015"], "why": "..." }
{ "t": "dictation", "en": "The train was delayed because of the snow.", "it": "Il treno era in ritardo per la neve." }
```
In `type` si usa `text` (frase da tradurre/trasformare) **oppure** `s` (frase con `___` da completare).

### Testi
```jsonc
{ "t": "read", "title": "A weekend in Edinburgh", "genre": "blog",
  "text": "Paragrafo 1...\n\nParagrafo 2...",
  "qs": [ { "q": "Why did the writer go to Edinburgh?", "opts": ["...", "...", "..."], "a": 1, "why": "Paragrafo 2: «...»" },
          { "q": "The hotel was cheaper than expected.", "opts": ["True", "False", "Not given"], "a": 2 } ] }
{ "t": "cloze", "title": "Facoltativo", "mode": "mc",     // mc | open | wordform
  "text": "Last summer I {1} to Spain with my friends. We {2} a car ...",
  "gaps": [ { "opts": ["went", "gone", "have gone", "go"], "a": 0 }, { "opts": ["..."], "a": 2 } ] }
  // mode open:     "gaps": [ { "answers": ["had"] } ]
  // mode wordform: "gaps": [ { "root": "ACCEPT", "answers": ["unacceptable"] } ]
{ "t": "listen", "title": "Booking a table", "it": "Ascolta la telefonata. Puoi riascoltarla.",
  "lines": [["Waiter", "Good evening, Luigi's."], ["Customer", "Hi, I'd like to book a table for four."]],
  "qs": [ { "q": "How many people is the table for?", "opts": ["2", "4", "6"], "a": 1 } ] }
```
Nelle `qs` di `read` e `listen` una domanda può anche essere a risposta scritta: `{ "q": "The museum opens at ___ .", "answers": ["9.30", "half past nine"] }`
(utile per sentence completion e note-taking).
Un monologo è un `listen` con un solo speaker. Le voci sono assegnate per speaker (accento e tono diversi).
Il copione si vede solo dopo aver risposto.

### Parlato
```jsonc
{ "t": "speak", "en": "I'd like to make a complaint.", "it": "Vorrei fare un reclamo." }   // ripeti: valutato col riconoscimento vocale
{ "t": "speakTask", "q": "Describe a journey that went wrong.", "it": "Racconta un viaggio andato storto (almeno 4 frasi).",
  "hints": ["Where were you going?", "What happened?", "How did you feel?"], "min": 30,
  "model": "Risposta modello in inglese..." }   // si parla liberamente; si confronta con il modello e si autovaluta
{ "t": "write", "q": "Write an email to a friend about...", "it": "Istruzioni in italiano", "min": 100, "max": 120,
  "checklist": ["Ho usato almeno due verbi al past perfect", "Ho salutato e chiuso in modo informale"],
  "useful": ["I'm writing to tell you...", "Anyway, ..."], "model": "Testo modello..." }
```

## Test d'ingresso (`content/placement.json`)
```jsonc
{ "id": "placement", "title": "Test d'ingresso", "intro": "...",
  "steps": [ { "lv": "A2", "t": "gap", ... }, { "lv": "B1", "t": "type", ... } ] }   // circa 12 per livello A2/B1/B2
```
Si parte dal primo livello sotto il 70%.

## Esame (`content/exams/exam-b2.json`)
```jsonc
{ "id": "exam-b2", "level": "B2", "title": "Simulazione B2 First", "intro": "...",
  "parts": [ { "id": "rue1", "title": "Reading & Use of English - Part 1", "skill": "use", "minutes": 10,
               "it": "Istruzioni", "steps": [ { "t": "cloze", "mode": "mc", ... } ] } ] }
```
`skill`: `reading`, `use`, `listening`, `writing`, `speaking`. Negli esami gli audio si possono ascoltare solo 2 volte.

## Risorse (`content/resources/<id>.json`)
```jsonc
{ "id": "res-verbs", "kind": "verbs", "title": "Verbi irregolari", "intro": "...",
  "items": [ { "base": "go", "past": "went", "pp": "gone", "it": "andare", "ex": ["She has gone home.", "È andata a casa."] } ] }
```
Tipi di `kind` e campi degli `items`:

| kind | campi |
|---|---|
| `verbs` | `base`, `past`, `pp`, `it`, `ex` |
| `phrasal` | `en`, `it`, `ex`, `lv` |
| `falsefriends` | `en`, `trap`, `real`, `fix`, `ex` |
| `idioms` | `en`, `it`, `lit`, `ex`, `lv` |
| `connectors` | `en`, `it`, `use`, `ex`, `lv` |
| `pron` | `title`, `sound`, `tip`, `words` |

Le schede di grammatica non sono una risorsa a parte: l'app le ricava dalle `note` delle lezioni `grammar`.
