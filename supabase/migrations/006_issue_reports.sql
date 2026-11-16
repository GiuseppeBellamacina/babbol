-- Applicata al progetto "babbol" (xmitklupdqpnzcviimvx).
-- Segnalazioni di errori nei contenuti (pulsante «Segnala» negli esercizi).
-- Si scrive solo con la funzione report_issue (max 20 al giorno per utente); si leggono dal dashboard (Table Editor).
create table public.issue_reports (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  ref        text not null,
  step       text not null default '',
  note       text not null default '',
  app_ver    text not null default '',
  created_at timestamptz not null default now(),
  done       boolean not null default false
);
create index issue_reports_user_day on public.issue_reports (user_id, created_at);
alter table public.issue_reports enable row level security;   -- nessuna policy: gli utenti non leggono né scrivono direttamente

create function public.report_issue(p_ref text, p_step text, p_note text, p_ver text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if coalesce(p_ref, '') = '' then raise exception 'ref required'; end if;
  if (select count(*) from public.issue_reports where user_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many reports';
  end if;
  insert into public.issue_reports (user_id, ref, step, note, app_ver)
  values (uid, left(p_ref, 200), left(coalesce(p_step, ''), 600), left(coalesce(p_note, ''), 500), left(coalesce(p_ver, ''), 20));
end $$;
revoke execute on function public.report_issue(text, text, text, text) from public, anon;
grant execute on function public.report_issue(text, text, text, text) to authenticated;
