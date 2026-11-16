-- Applicata al progetto "babbol" (xmitklupdqpnzcviimvx).
-- Blindatura: chi non ha fatto l'accesso non può fare niente, e chi l'ha fatto vede e scrive solo ciò che gli serve.

-- 1) Tabelle: nessun permesso ad anon; authenticated solo il necessario (le policy RLS restringono le righe).
revoke all on public.content, public.user_progress, public.issue_reports from public, anon, authenticated;
grant select on public.content to authenticated;                        -- contenuti del corso (sola lettura)
grant select, insert, update on public.user_progress to authenticated;  -- solo la propria riga (RLS); niente delete/truncate
-- issue_reports: nessun permesso diretto, si scrive solo con report_issue()

-- 2) Sequenze: non servono a nessun utente (gli insert passano da funzioni del proprietario)
revoke all on all sequences in schema public from public, anon, authenticated;

-- 3) Cose create in futuro: niente permessi automatici ad anon e authenticated
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- 4) Pubblicazione dei contenuti: solo un utente autenticato registrato come "publisher" E con la chiave segreta
create table private.publishers (uid uuid primary key);
revoke all on private.publishers from public, anon, authenticated;

create or replace function public.publish_content(p_key text, p_rows jsonb, p_prune boolean default false, p_ids text[] default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
  pruned int := 0;
begin
  if auth.uid() is null or not exists (select 1 from private.publishers p where p.uid = auth.uid()) then
    raise exception 'not a publisher' using errcode = '42501';
  end if;
  if not exists (select 1 from private.publish_keys k where k.hash = encode(extensions.digest(p_key, 'sha256'), 'hex')) then
    raise exception 'invalid publish key' using errcode = '42501';
  end if;

  with src as (
    select r->>'id' as id, r->>'kind' as kind, r->>'parent' as parent, coalesce((r->>'position')::int, 0) as position, r->'data' as data
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  ), up as (
    insert into public.content as c (id, kind, parent, position, data, deleted)
    select id, kind, parent, position, data, false from src
    on conflict (id) do update
      set kind = excluded.kind, parent = excluded.parent, position = excluded.position, data = excluded.data, deleted = false
      where c.data is distinct from excluded.data or c.position <> excluded.position
         or c.parent is distinct from excluded.parent or c.kind <> excluded.kind or c.deleted
    returning 1
  )
  select count(*) into n from up;

  if p_prune and p_ids is not null then
    update public.content set deleted = true where not deleted and id <> all (p_ids);
    get diagnostics pruned = row_count;
  end if;

  return jsonb_build_object('changed', n, 'pruned', pruned, 'rev', (select coalesce(max(rev), 0) from public.content));
end $$;
revoke all on function public.publish_content(text, jsonb, boolean, text[]) from public, anon, authenticated;
grant execute on function public.publish_content(text, jsonb, boolean, text[]) to authenticated;
-- Per registrare un publisher (dopo che l'utente ha un account): insert into private.publishers values ('<uuid dell''utente>');
