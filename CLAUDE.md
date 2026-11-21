# Babbol

App Android (WebView + JS senza dipendenze) per imparare l'inglese; account, progressi e contenuti su Supabase (progetto `babbol`,
id `xmitklupdqpnzcviimvx`). Architettura, build in Docker e comandi: `README.md`.

**Segreti (chiave di firma dell'APK, accessi di pubblicazione):** non sono nel repository (`android/debug.keystore` e `.secrets/` sono gitignored e possono mancare).
Se `android/debug.keystore` o `.secrets/` mancano, recuperali dal database con il MCP Supabase come descritto in
[docs/SECRETS.md](docs/SECRETS.md) (tabella `private.secrets`). Non scrivere mai i valori in file versionati: il repo è pubblico.
