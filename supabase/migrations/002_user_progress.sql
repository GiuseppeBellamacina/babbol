-- Applicata al progetto "babbol" (xmitklupdqpnzcviimvx).
-- Progressi: una riga per utente (stato JSON dell'app), visibile/modificabile solo dal proprietario.
create table public.user_progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  rev        int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.user_progress enable row level security;
create policy progress_select on public.user_progress for select to authenticated
  using ((select auth.uid()) = user_id);
create policy progress_insert on public.user_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy progress_update on public.user_progress for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Salvataggio con controllo di versione: se un altro dispositivo ha salvato nel frattempo
-- restituisce lo stato del server (il client lo unisce e riprova).
create function public.save_progress(p_state jsonb, p_base_rev int) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur_rev int;
  cur_state jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if octet_length(p_state::text) > 3000000 then raise exception 'state too large'; end if;

  select rev, state into cur_rev, cur_state from public.user_progress where user_id = uid for update;
  if not found then
    insert into public.user_progress (user_id, state, rev) values (uid, p_state, 1)
    on conflict (user_id) do nothing;
    if found then return jsonb_build_object('ok', true, 'rev', 1); end if;
    select rev, state into cur_rev, cur_state from public.user_progress where user_id = uid;
  end if;

  if cur_rev <> p_base_rev then
    return jsonb_build_object('ok', false, 'rev', cur_rev, 'state', cur_state);
  end if;
  update public.user_progress set state = p_state, rev = cur_rev + 1, updated_at = now() where user_id = uid;
  return jsonb_build_object('ok', true, 'rev', cur_rev + 1);
end $$;
