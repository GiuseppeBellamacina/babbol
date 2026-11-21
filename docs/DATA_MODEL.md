# Modello dati e sincronizzazione

Schema completo in `supabase/migrations/`. Formato dei contenuti in [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md).

## Contenuti: `public.content`

| colonna | significato |
|---|---|
| `id` | id stabile (`meta`, `placement`, `a2-01`, `a2-01-grammar`, `exam-b2`, `res-verbs`, ...) |
| `kind` | `meta`, `unit`, `lesson`, `exam`, `placement`, `resource` |
| `parent` | per le lezioni l'unità; per unità ed esami il livello |
| `position` | ordine dentro il genitore |
| `data` | il JSON dell'elemento |
| `deleted` | eliminazione "morbida": l'app rimuove l'elemento al prossimo aggiornamento |
| `rev` | numero globale crescente, assegnato da un trigger a ogni insert/update |

L'app chiama `get_course_changes(p_since)` con l'ultimo `rev` che conosce e riceve `{ rev, items[] }` con le sole righe cambiate.
`B.repo` parte dallo snapshot incluso nell'APK (`www/content/course.js`, con il `rev` del server al momento della build) e tiene in localStorage **solo le righe cambiate** rispetto allo snapshot.

Se il server ha un `rev` più basso di quello locale (database ricaricato), l'app riscarica tutto.

## Progressi: `public.user_progress`

Una riga per utente: `state` è il JSON di `B.store` (vedi `www/js/core/store.js`), `rev` è la versione.
RLS: ogni utente legge e scrive solo la propria riga.

**Salvataggio**: `save_progress(p_state, p_base_rev)`.
- Se `p_base_rev` coincide con il `rev` sul server, salva e incrementa il `rev`.
- Altrimenti restituisce `{ ok: false, state, rev }`. Il client unisce i due stati con `B.store.merge` e riprova una volta.

**Regole di unione** (nessun progresso va perso):
- XP, statistiche, migliori serie: massimo
- lezioni ed esami: miglior punteggio
- parole: la versione con più risposte registrate
- giorni: massimo per giorno
- badge: unione
- impostazioni: lo stato modificato più di recente.

## Quando l'app parla con Supabase

| Momento | Richieste |
|---|---|
| Login | token + lettura progressi + delta contenuti |
| Avvio / ritorno in primo piano | delta contenuti (se l'ultimo controllo è di oltre 24 h); lettura progressi (se di oltre 6 h) |
| Fine di una sessione | salvataggio, solo se ci sono modifiche e l'ultimo è di oltre 3 minuti |
| App in background | salvataggio, solo se ci sono modifiche e l'ultimo è di oltre 1 minuto |
| Token scaduto (ogni ora di uso) | 1 rinnovo, solo quando serve una richiesta |

## Missioni, gettoni e creature (stato dei progressi, versione 1.5.0)

Nessuna tabella nuova: tutto sta in `user_progress.state` e si unisce tra dispositivi con `store.merge()`.

| Campo | Contenuto | Unione |
|---|---|---|
| `days[giorno]` | `xp`, `s` (secondi), `a` (risposte), `l` (lezioni finite), `w` (parole ripassate), `k` `{abilità: risposte}` | massimo per campo |
| `rewards.claimed` | `{ chiaveMissione: { t: timestamp, c: gettoni } }` | unione, vale il `t` più basso |
| `rewards.boxes` | scatole aperte | massimo |
| `rewards.animals` | `{ idCreatura: { n: quante volte, at } }` | `n` massimo |
| `rewards.gift` | timestamp del regalo di benvenuto (90 gettoni), 0 se non preso | minimo non nullo |
| `settings.remind` | `{ on, hour }` promemoria; `settings.remindAsked` | come le altre impostazioni |

- **Missioni** (`www/js/core/missions.js`): non sono memorizzate. Si generano da un seme (giorno, lunedì della settimana, mese), quindi sono uguali su ogni telefono; soglie scalate sul livello CEFR attuale; il progresso si calcola da `days`. Chiave = `d:AAAA-MM-GG:i`, `w:<lunedì>:i`, `m:AAAA-MM:i` (`:bonus` per il premio finale).
- **Gettoni** = premi riscattati + regalo + rimborsi dei doppioni - 30 per ogni scatola aperta. Sono derivati, così due telefoni offline non si contraddicono.
- **Scatole** (`www/js/ui/album.js`): la creatura dipende solo dal numero d'ordine della scatola (`rewards.boxes`), quindi è la stessa su ogni dispositivo. Garanzie sul numero d'ordine: ogni 5 almeno non comune, 12 raro, 25 epico, 60 leggendario, 150 mitico.
- **Creature**: `www/js/data/animals.js` (id, codice Noto, nomi, rarità, curiosità), illustrazioni in `www/img/a/` scaricate da `tools/fetch-creatures.js`.
- **Parole viste/consolidate**: contano solo le parole di unità sbloccate (`store.countable`); le liste per tema (`rw:`) non entrano nei conteggi.
