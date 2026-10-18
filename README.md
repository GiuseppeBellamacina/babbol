# Babbol - dall'A2 al B2, partendo dall'italiano

App Android per adulti italiani che vogliono passare da un inglese "scolastico" (A2) a un B2 vero, nelle quattro abilità: lettura, ascolto, scrittura e parlato.
Account e progressi su Supabase. Anche i contenuti delle lezioni stanno su Supabase e si aggiornano senza pubblicare una nuova versione dell'app.

**APK**: `dist/babbol-debug.apk` (firmato con chiave di debug, Android 6.0+), generato da `build.sh`.

## Il corso

| Area | Contenuto |
|---|---|
| **Test d'ingresso** | Stabilisce il livello di partenza (A2, B1 o B2). Le unità precedenti restano aperte e facoltative. |
| **Percorso** | 3 livelli (A2, B1, B2) da 10 unità ciascuno; vedi [docs/CURRICULUM.md](docs/CURRICULUM.md). |
| **Ogni unità** | 7 lezioni: grammatica, lessico, lettura, ascolto, situazione reale, scrittura e parlato, test. Si passa all'unità successiva con il 70% al test, che si può fare anche subito per saltare l'unità. |
| **Esami** | Simulazioni in stile A2 Key, B1 Preliminary e B2 First, con parti a tempo, punteggio per parte e stima indicativa della scala Cambridge. |
| **Esercizi** | Scelta multipla, completamento, traduzione scritta, frasi da riordinare, key word transformation, word formation, correzione di errori, cloze (a scelta, aperto, word formation), testi con domande, ascolti a più voci, dettati, dialoghi da completare, frasi da ripetere a voce, risposte orali libere, testi scritti con autovalutazione e testo modello. |
| **Ripasso** | Ripetizione spaziata delle parole (intervalli di 1, 3, 7, 14, 30 e 60 giorni), esercizi sbagliati da rifare, allenamento per abilità. |
| **Risorse** | Schede di grammatica (dalle lezioni), dizionario, flashcard, verbi irregolari, phrasal verbs, falsi amici, modi di dire, connettivi, pronuncia per italiani. |
| **Progressi** | Minuti di studio al giorno, serie, punteggio per abilità, livello stimato, traguardi. Niente vite e niente attese: si studia quanto si vuole. |
| **Voce** | Text-to-Speech del telefono (gratuito): nei dialoghi ogni speaker ha una voce maschile o femminile a seconda del nome (o del genere indicato nei contenuti), con accenti diversi; riconoscimento vocale per il parlato. Nessuna API a pagamento. |
| **Durante gli esercizi** | Tasto **INDIETRO** per tornare ai passi precedenti (la risposta e il punteggio vengono annullati), tasto **suggerimento** per aprire grammatica, parole con traduzione ed esempi e frasi utili dell'unità (non nei test e negli esami), due regolatori di velocità della voce: normale e tartaruga (che spezza la frase in gruppi di parole con pause). |

**Quanto ci vuole.** Cambridge stima circa 200 ore guidate per livello CEFR: da A2 a B2 sono 300-400 ore. Con 1 ora al giorno servono 10-12 mesi; con 2 ore circa 6. Il corso contiene circa 67 ore di materiale nuovo più 7 di esami: è lo scheletro completo, da affiancare a molta esposizione all'inglese (serie, podcast, letture) e da arricchire nel tempo con nuove unità pubblicate su Supabase.

Il riconoscimento vocale e l'autovalutazione aiutano, ma non sostituiscono un insegnante per scrittura e parlato. Per questo ci sono i testi modello e le checklist.

## Architettura

```text
www/                       l'app (HTML/CSS/JS senza dipendenze), caricata nella WebView
  content/course.js        snapshot dei contenuti incluso nell'APK (GENERATO da tools/content.js)
  img/v/*.svg              scene illustrate (paesaggi, situazioni); gli oggetti semplici usano un'emoji
  js/core/
    repo.js                unico accesso ai contenuti: snapshot + delta da Supabase in cache
    store.js               progressi (localStorage) + merge tra dispositivi
    cloud.js               Supabase: login, sincronizzazione, aggiornamento contenuti (solo fetch)
    engine.js              lezioni/test/esami/ripasso -> sequenze di step
    speech.js              voce: ponte Android o fallback del browser
  js/ui/                   schermate (auth, percorso, ripasso, risorse, profilo) e runner delle sessioni
content/                   SORGENTE dei contenuti (JSON): unità, esami, test d'ingresso, risorse
android/                   guscio nativo: WebView + TTS + riconoscimento vocale + deep link delle email
supabase/migrations/       schema del database (applicato al progetto "babbol")
tools/                     content.js (valida/pubblica), e2e.js (test), make-icon.js (icone dalla mascotte), svg-preview.js, docker/Dockerfile
docs/                      CONTENT_SCHEMA.md, CURRICULUM.md, AUTHORING.md, DATA_MODEL.md
```

### Supabase (progetto `babbol`, eu-central-1, piano gratuito)

| Elemento | Scopo |
|---|---|
| `content` | Una riga per unità, lezione, esame, test d'ingresso, risorsa. Ogni modifica prende un nuovo `rev`. |
| `get_course_changes(since)` | Restituisce solo ciò che è cambiato dopo `since`, in una richiesta. |
| `user_progress` | Una riga per utente (stato JSON), protetta da RLS. |
| `save_progress(state, base_rev)` | Salva i progressi; se un altro dispositivo ha salvato nel frattempo, restituisce lo stato del server e l'app unisce. |
| `delete_my_account()` | Cancellazione dell'account (richiesta da Google Play). |
| `publish_content(key, rows)` | Pubblicazione dal repository, protetta da una chiave segreta: gli avvisi dell'advisor su questa funzione sono attesi. |

**Richieste per utente**:
- token rinnovato solo quando scade
- contenuti controllati al massimo una volta al giorno (solo delta)
- progressi letti al login e al massimo ogni 6 ore, salvati solo se cambiati e al massimo ogni 3 minuti, più all'uscita.

In pratica 5-15 richieste al giorno.

## Lavorare al progetto (tutto in Docker, niente da installare)

```bash
docker build -t babbol-build tools/docker                                        # una volta
docker run --rm -v "$PWD":/app babbol-build node tools/content.js validate       # controlla i contenuti
docker run --rm -v "$PWD":/app babbol-build node tools/content.js publish        # carica su Supabase + snapshot
docker run --rm -v "$PWD":/app babbol-build node tools/e2e.js                    # test end-to-end (FULL=1 per tutte le lezioni)
docker run --rm -v "$PWD":/app babbol-build node tools/svg-preview.js            # anteprima delle illustrazioni
docker run --rm -v "$PWD":/app babbol-build ./build.sh                           # -> dist/babbol-debug.apk
```

Su Windows con Git Bash usa `MSYS_NO_PATHCONV=1` e `"$(pwd -W)"` al posto di `"$PWD"`.
Screenshot e APK finiscono nella cartella del progetto (`build/shots/`, `dist/`).

## Aggiornare i contenuti senza aggiornare l'app

**Dal repository (consigliato).** Modifica i JSON in `content/` seguendo [docs/AUTHORING.md](docs/AUTHORING.md), poi lancia `content.js publish`.
- Vengono caricate solo le righe cambiate.
- Ciò che hai tolto viene segnato come eliminato.
- Le app scaricano le modifiche entro 24 ore.

La chiave di pubblicazione è in `.secrets/publish-key`, fuori da git: conservala.

**Dal dashboard Supabase.** Si modifica il campo `data` della riga nella tabella `content` (Table Editor).
- Il `rev` si aggiorna da solo.
- Per eliminare qualcosa si imposta `deleted = true`, non si cancella la riga.

Ricordati poi di riportare la modifica in `content/`, altrimenti il prossimo `publish` la sovrascrive.

## Da fare nel dashboard Supabase

1. **Authentication > URL Configuration > Redirect URLs**: aggiungi `babbol://auth-callback`. Serve perché i link nelle email aprano l'app.
2. **SQL Editor**: esegui `supabase/migrations/004_delete_my_account.sql`. Il server MCP non permette di applicarla automaticamente.
3. **Email**: il servizio email integrato di Supabase manda le email solo ai membri del team del progetto, e circa 2 all'ora. Prima di aprire l'app ad altri utenti:
   - collega uno SMTP in Authentication > Emails > SMTP Settings (per esempio Brevo, piano gratuito)
   - traduci in italiano i template delle email.

## Scelte e limiti

- **Ibrido (WebView) e non Kotlin/Compose**: la logica e la UI sono testate davvero in un browser headless, e il guscio Java è minimo.
- **Guscio nativo non provato su un telefono vero**: lo si compila nel container, ma non c'è un emulatore (in Docker su Windows servirebbe KVM).
  - Deep link delle email, voci dei dialoghi e microfono vanno provati sul dispositivo.
  - Il contratto JS<->Java è verificato con un ponte simulato.
- **Voce dei dialoghi**: dipende dalle voci inglesi installate sul telefono (Impostazioni > Sintesi vocale). Se manca la voce US, si sente comunque il tono diverso.
- **Chiave di firma**: l'APK è firmato con `android/debug.keystore`, fuori da git perché chi la possiede può firmare finti aggiornamenti dell'app.
  - **Fanne un backup**: se la perdi, `build.sh` ne crea una nuova e gli APK firmati con quella non si installano sopra quelli già sui telefoni (bisogna disinstallare e si perdono i dati locali).
  - Per il Play Store serve una chiave di release, da tenere anch'essa fuori da git.
