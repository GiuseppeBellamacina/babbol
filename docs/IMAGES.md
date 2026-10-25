# Immagini: foto, emoji, SVG

Quattro tipi di immagine, ognuno per il suo scopo:

| Tipo | Dove | Quando |
|---|---|---|
| **Emoji** | campo `emoji` di una parola (una sola) | oggetti semplici che hanno già un'emoji chiara (valigia, uovo, chitarra) |
| **Foto** | campo `photo` di una parola, di una lettura o di un esercizio; `photos` (due) per il confronto | oggetti, luoghi e scene reali; testi di lettura; «Descrivi la foto» |
| **Schemi SVG** | campo `svg` di una nota di grammatica (`www/img/g/*.svg`) | linee del tempo e strutture che a parole sono difficili |
| **Icone SVG** | `www/js/ui/icons.js` | solo interfaccia |

Le emoji sono ammesse solo come immagine di una parola, mai nei testi. Le illustrazioni disegnate a mano per gli oggetti semplici sono state tolte: l'emoji è più chiara e più bella.

## Scaricare le foto nell'app o linkarle?

**Scelta: incluse nell'APK**, ridotte e convertite, con un ripiego se mancano.

| | Incluse nell'app | Solo link (Wikimedia, GitHub...) |
|---|---|---|
| Offline | funzionano sempre | senza rete non si vede niente |
| Velocità | immediata | latenza a ogni foto, ripetuta a ogni sessione |
| Peso dell'app | circa 2,5 MB (100 foto) | 0 |
| Dati mobili dell'utente | 0 | ogni foto, almeno la prima volta |
| Richieste a Supabase | 0 | 0 (ma altre richieste a siti di terzi) |
| Affidabilità | il file c'è e resta | i link si rompono, le pagine cambiano, Wikimedia limita i collegamenti diretti delle app |
| Privacy | nessuna richiesta | ogni foto rivela l'IP dell'utente al sito che la ospita |
| Licenze | crediti nell'app e in CREDITS.md | stessi obblighi |

Il peso si governa da solo: **520 x 440 px al massimo, WebP qualità 0.5, circa 25 KB a foto**. A 340 px di schermo (la larghezza reale nell'app) non si vede la differenza rispetto a 640 px con qualità 0.7, che pesa il doppio (misurato su una foto di mercato: 78 KB contro 37-45 KB). Cento foto sono circa 2,5 MB: l'APK passa da 0,6 a circa 3,2 MB.

**Ripiego** (`B.photo` in `www/js/ui/icons.js`), in ordine:

1. il file incluso nell'app (`img/p/<id>.webp`);
2. lo stesso file nel repository su GitHub (`B.config.photoBase`, solo se l'utente è online);
3. un segnaposto «Foto non disponibile».

Il secondo livello serve a non aggiornare l'app per ogni foto nuova: un contenuto pubblicato su Supabase può usare una foto aggiunta al repository dopo la build, che appare comunque. Il terzo evita sempre un'immagine rotta.

## Aggiungere foto

Lo strumento è `tools/photos.js`, da eseguire nel container (vedi l'intestazione del file). Le foto vengono da Wikimedia Commons, con licenze che permettono il riuso (CC0, pubblico dominio, CC BY, CC BY-SA); sono escluse NC, ND e le foto con restrizioni sui diritti della persona.

1. `find` cerca le candidate e scrive tavole di miniature numerate: **si guardano**, la scelta non è automatica.
2. `pick id=numero` scarica la foto scelta, la riduce, la converte e registra autore e licenza in `content/photos.json`.
3. Si aggiunge `"photo": "<id>"` dove serve; `content.js validate` controlla che esistano file e crediti.
4. `credits` rigenera `CREDITS.md` e `www/content/credits.js` (la pagina «Crediti delle foto» del Profilo).

Criteri di scelta: il soggetto è davvero la parola; nitida, ben illuminata, senza loghi in primo piano; niente persone riconoscibili in primo piano (folle, persone di spalle o piccole vanno bene); niente carte, schemi, disegni.

Le ricerche libere di Commons per parole generiche danno molti risultati fuori tema: meglio parole chiave brevi e specifiche, o una categoria di Commons. Se non c'è una foto davvero adatta, **si lascia la parola senza foto** (o con un'emoji).
