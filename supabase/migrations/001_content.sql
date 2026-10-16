-- Applicata al progetto "babbol" (xmitklupdqpnzcviimvx).
-- Contenuti del corso: una riga per unità, lezione, esame, test d'ingresso, risorsa o meta.
-- Ogni insert/update prende un nuovo `rev` globale: l'app scarica solo ciò che ha rev > ultimo rev visto.
-- Per eliminare un elemento: deleted = true (una DELETE fisica non arriverebbe ai dispositivi).
create sequence public.content_rev;

create table public.content (
  id         text primary key,
  kind       text not null check (kind in ('meta','unit','lesson','exam','placement','resource')),
  parent     text,
  position   int not null default 0,
  data       jsonb not null,
  deleted    boolean not null default false,
  rev        bigint not null default nextval('public.content_rev'),
  updated_at timestamptz not null default now()
);
create index content_rev_idx on public.content (rev);

create function public.content_bump() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.rev := nextval('public.content_rev');
  new.updated_at := now();
  return new;
end $$;

create trigger content_bump before insert or update on public.content
for each row execute function public.content_bump();

alter table public.content enable row level security;
create policy content_read on public.content for select to authenticated using (true);

-- Delta dei contenuti in UNA richiesta. p_since = 0 -> tutto (senza gli eliminati).
create function public.get_course_changes(p_since bigint default 0) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'rev', coalesce((select max(c.rev) from public.content c), 0),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'kind', c.kind, 'parent', c.parent, 'position', c.position,
               'data', case when c.deleted then null else c.data end, 'deleted', c.deleted)
             order by c.rev)
      from public.content c
      where c.rev > p_since and (p_since > 0 or not c.deleted)), '[]'::jsonb));
$$;
