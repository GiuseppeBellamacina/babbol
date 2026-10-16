# Come scrivere i contenuti di Babbol

Guida per chi scrive unità, esami e schede (persone o agenti). Leggere prima:

1. [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md): formato JSON di ogni tipo di esercizio.
2. [CURRICULUM.md](CURRICULUM.md): che cosa va in ogni unità (grammatica, lessico, situazione, produzione).
3. [../content/units/a2-01.json](../content/units/a2-01.json): **unità modello**. Va imitata per qualità, tono, quantità e varietà.

**I file JSON in `content/` sono l'unica sorgente.** Si modificano direttamente. Non generarli da script: rilanciando uno script si cancellerebbero le correzioni fatte dopo nel JSON.

## Validazione (obbligatoria)

Si esegue nel container Docker, non sul PC. Da Git Bash nella cartella del progetto:

```bash
cd /d/Codici/Workspace/babbol && MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)":/app babbol-build node tools/content.js validate
```

Un file è finito solo quando il validatore dice **"OK, nessun errore."**

Se segnala una parola già presente in un'altra unità, cambia la **tua** parola: non toccare le unità degli altri.

## Pubblico e livello

- Utenti italiani adulti con un inglese "scolastico", che vogliono arrivare a B2 in tutte e 4 le abilità.
- **Niente esercizi infantili**: niente domande ovvie, niente opzioni palesemente assurde.
- **Distrattori**: errori tipici degli italiani, per esempio:
  - «I am agree», «He said me», «I have 30 years»
  - present continuous al posto del present perfect
  - falsi amici, preposizioni calcate dall'italiano.
- **Lingua**:
  - inglese britannico (spelling UK: colour, organise, centre), naturale, come lo parlerebbe un madrelingua
  - spiegazioni (`intro`, `note`, `why`, `it`) in italiano chiaro, diretto, senza giri di parole.
- **Rispetto del livello**: in A2 nessuna struttura B2 negli esercizi. In B2 sì testi autentici, collocazioni, registro formale/informale.

## Regole sulle risposte (la parte più delicata)

- Ogni `answers` contiene **tutte** le varianti corrette ragionevoli. Prima di chiudere un esercizio scritto, chiediti: "in quanti modi giusti si può rispondere?" Pensa a:
  - ordine delle parole («Usually I...» / «I usually...»)
  - sinonimi (big/large)
  - for/in con il tempo
  - forme piene e contratte (l'app espande già I'm, don't, can't...; scrivi comunque entrambe se c'è «'s» ambiguo).
- Ogni `mc` / `gap` / `cloze` mc ha **una sola risposta difendibile**. Se un distrattore potrebbe essere giusto in un contesto plausibile, cambialo.
- Le `transform` (key word transformation) hanno risposte di 2-5 parole che **contengono la parola chiave invariata**, come nel B2 First.
- I `fix` contengono **un solo errore**, e `answers` è la frase intera corretta (con le varianti).
- `why` quasi sempre: spiega **perché**, non ripete la risposta.
- **`order` con parole trappola (`extra`)**: controlla che con le parole disponibili (frase + extra) non si possa costruire **un'altra frase corretta** con lo stesso significato. Esempio sbagliato: «We didn't see anyone» con extra «saw», «nobody» permette anche «We saw nobody...». Se esiste un'alternativa valida, cambia gli extra oppure aggiungila in `alts`.
- **Ogni variante in `answers` va riletta dentro la frase completa** (`s2`, `s`): deve suonare naturale una volta inserita, non solo essere grammaticale da sola.

## Testi

- **Originali**. Non copiare da esami Cambridge, libri di testo o siti: si scrive da zero ispirandosi ai **formati**.
- Generi vari: email, blog, articolo, recensione, annuncio, intervista, messaggi, storie.
- Lunghezze per livello: le controlla il validatore (vedi CONTENT_SCHEMA.md).
- I copioni `listen` devono suonare parlati: frasi brevi, esitazioni naturali («Well,», «Actually,»), domande e risposte; 2-3 speaker con nomi diversi.

## Immagini

**Oggetti semplici: emoji.** Per una parola concreta che ha un'emoji chiara e carina (suitcase, bread, guitar, train) metti nella parola `"emoji": "🧳"`: una sola emoji. È l'**unico** posto dove le emoji sono ammesse.

**Scene complesse: SVG.** Solo per ciò che un'emoji non rende: paesaggi, situazioni, foto da descrivere nel parlato (stile Cambridge), oggetti senza emoji adatta. Si mette `"img": "nome"` su una parola o su uno step (`mc`, `speakTask`, `read`...) e si crea `www/img/v/nome.svg`. Lo SVG deve essere **curato**, non schematico:
- scene: `viewBox="0 0 320 200"`, sfondo pieno (cielo, pareti, prato), più piani (sfondo, piano medio, primo piano), sfumature (`linearGradient`) e ombre morbide, persone stilizzate ma proporzionate, dettagli che danno contesto (finestre, alberi, insegne senza testo)
- palette coerente con l'app (blu #2b7de9, verdi, gialli caldi, grigi #607d8b/#cfd8dc), colori armoniosi, nessun testo dentro l'immagine
- deve leggersi bene sia su tema chiaro sia scuro (una scena con sfondo pieno va bene ovunque)
- controlla il risultato con `node tools/svg-preview.js` (immagine in `build/shots/svg-sheet.png`): se sembra un disegno da bambini, rifallo o non metterlo.

Per i concetti astratti niente immagini.

## Mai

- **Emoji** fuori dal campo `emoji` delle parole (il validatore le rifiuta), compresi simboli come ©, ™, frecce decorative.
- Riferimenti a vite, cuori, tempi di attesa.
- Contenuti offensivi o stereotipi su nazionalità.
