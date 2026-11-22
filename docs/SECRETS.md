# Segreti di Babbol: dove stanno e come recuperarli

Questo file è pubblico: contiene **solo posizioni e comandi, mai i valori**. I valori stanno nel database Supabase del progetto
`babbol` (id `xmitklupdqpnzcviimvx`, eu-central-1), tabella `private.secrets`, che non è raggiungibile dall'API
(nessun permesso ad `anon` e `authenticated`, RLS senza policy): si legge e si scrive solo come proprietario del progetto,
cioè con il plugin/MCP Supabase (`execute_sql`) o dal dashboard (SQL editor).

## Cosa serve e dove va messo nel repository

| Segreto in `private.secrets` | Va salvato in | A cosa serve | Nel database |
|---|---|---|---|
| `android-keystore` | `android/debug.keystore` | firma dell'APK (`build.sh`). Senza la stessa chiave Android rifiuta l'aggiornamento: l'utente dovrebbe disinstallare e reinstallare | già inserita (file in base64) |
| `publish-key` | `.secrets/publish-key` | chiave per `node tools/content.js publish` (pubblica i contenuti) | inserita (valore in chiaro; il suo hash, usato dal server, è in `private.publish_keys`) |
| `publisher-login` | `.secrets/publisher-login` (email e password, due righe) | account "publisher" per `content.js publish` | inserito |

`android/debug.keystore` e `.secrets/` sono in `.gitignore`: non vanno mai committati. Se mancano i file locali, o un agente li
cerca in una sessione nuova, si recuperano da qui.

Senza `.secrets/` si può comunque aggiornare un contenuto con `node tools/content.js sql` (genera l'SQL) + `execute_sql`, poi
`node tools/content.js bundle <rev>`; vedi `docs/CONTENT_SCHEMA.md`.

## Altre tabelle dello schema `private` (non sono vecchie, non vanno tolte)

| Tabella | A cosa serve |
|---|---|
| `private.secrets` | i valori dei segreti (questa pagina) |
| `private.publish_keys` | hash SHA-256 della `publish-key`: lo controlla `publish_content` |
| `private.publishers` | utenti autorizzati a pubblicare: lo controlla `publish_content` |

`publish_content` legge `publish_keys` e `publishers`: cancellarle blocca la pubblicazione. Verifica che la chiave in `secrets` sia quella giusta:
`select encode(extensions.digest(content, 'sha256'), 'hex') from private.secrets where name = 'publish-key';` deve dare lo stesso valore di `select hash from private.publish_keys;`.

## Leggere (recuperare)

Con il MCP Supabase, `execute_sql` sul progetto `xmitklupdqpnzcviimvx`:

```sql
select name, kind, note from private.secrets;                       -- elenco
select content from private.secrets where name = 'android-keystore'; -- valore
```

Un segreto `kind = 'file-base64'` si decodifica in un file; `kind = 'text'` è testo semplice. Esempio (bash o Git Bash), con il
valore incollato in `$B64`:

```bash
printf '%s' "$B64" | base64 -d > android/debug.keystore
sha256sum android/debug.keystore    # deve coincidere con lo SHA-256 scritto nel campo note del segreto
```

PowerShell: `[IO.File]::WriteAllBytes("android\debug.keystore", [Convert]::FromBase64String($b64))`.

Verifica della chiave già nel database (senza estrarla):

```sql
select encode(extensions.digest(decode(content, 'base64'), 'sha256'), 'hex') from private.secrets where name = 'android-keystore';
```

## Scrivere (aggiungere o aggiornare)

```sql
insert into private.secrets (name, kind, content, note)
values ('publish-key', 'text', '<valore>', 'chiave per tools/content.js publish')
on conflict (name) do update set content = excluded.content, note = excluded.note, updated_at = now();

-- file binario: content = base64 del file (base64 -w0 file)
-- publisher-login: kind 'text', content = email, a capo, password
```

Se si cambia la publish-key bisogna anche registrarne l'hash: vedi `supabase/migrations/005_publish_content.sql`.

## Note

- Non scrivere i valori in file del repository, nei messaggi di commit o nelle issue: il repository GitHub è pubblico.
- Chiave di firma in uso dalla 1.4.2 (creata il 2026-11-21). La chiave della 1.4.1 non è recuperabile dall'APK; se esiste ancora
  sul PC di casa come `android/debug.keystore` si può caricarla qui come `android-keystore-1.4.1`.
- La tabella è creata dalla migrazione `supabase/migrations/009_secrets.sql`.
