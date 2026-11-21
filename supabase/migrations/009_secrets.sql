-- Applicata al progetto "babbol" (xmitklupdqpnzcviimvx).
-- Segreti del progetto (chiave di firma Android, accessi di pubblicazione). I VALORI non stanno mai nel repository:
-- si leggono e si scrivono con l'SQL del progetto (vedi docs/SECRETS.md). Nessun accesso dall'API: solo il proprietario.
create table private.secrets (
  name text primary key,
  kind text not null default 'text',      -- 'file-base64' | 'text'
  content text not null,
  note text,
  updated_at timestamptz not null default now()
);
alter table private.secrets enable row level security;   -- senza policy: nessuno oltre al proprietario
revoke all on private.secrets from public, anon, authenticated;
