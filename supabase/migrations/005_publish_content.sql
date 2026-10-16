-- Applicata al progetto "babbol" (xmitklupdqpnzcviimvx).
-- Pubblicazione dei contenuti dal repository (tools/content.js publish), senza chiave service_role.
-- La chiave di pubblicazione è conservata solo come hash SHA-256 in uno schema NON esposto dalle API.
-- La chiave in chiaro sta in .secrets/publish-key (fuori da git). Per cambiarla:
--   insert into private.publish_keys (hash, note) values (encode(extensions.digest('<nuova chiave>', 'sha256'), 'hex'), '...');
--   delete from private.publish_keys where hash = '<vecchio hash>';
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.publish_keys (
  hash text primary key,
  note text,
  created_at timestamptz not null default now()
);
revoke all on private.publish_keys from public, anon, authenticated;

-- p_rows: [{id, kind, parent, position, data}]; aggiorna solo ciò che è cambiato (così il rev non cresce inutilmente).
-- p_prune = true: le righe non presenti in p_ids vengono segnate come eliminate (pubblicazione completa).
create function public.publish_content(p_key text, p_rows jsonb, p_prune boolean default false, p_ids text[] default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
  pruned int := 0;
begin
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

revoke all on function public.publish_content(text, jsonb, boolean, text[]) from public;
grant execute on function public.publish_content(text, jsonb, boolean, text[]) to anon, authenticated;

-- l'hash della chiave è stato inserito a parte (non versionato qui)
