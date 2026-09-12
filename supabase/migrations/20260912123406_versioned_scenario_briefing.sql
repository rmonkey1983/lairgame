create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (btrim(slug) <> ''),
  title text not null check (btrim(title) <> ''),
  created_at timestamptz not null default now()
);

create table public.scenario_versions (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  status text not null check (status in ('draft', 'published')),
  briefing_title text not null check (btrim(briefing_title) <> ''),
  briefing_body text not null check (btrim(briefing_body) <> ''),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (scenario_id, version_number)
);

alter table public.games add column scenario_version_id uuid references public.scenario_versions(id) on delete restrict;

alter table public.scenarios enable row level security;
alter table public.scenario_versions enable row level security;
revoke all on table public.scenarios, public.scenario_versions from public, anon, authenticated;

create or replace function private.prevent_published_scenario_version_mutation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception 'PUBLISHED_SCENARIO_IMMUTABLE' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke all on function private.prevent_published_scenario_version_mutation() from public, anon, authenticated;

create trigger scenario_versions_published_immutable
before update or delete on public.scenario_versions
for each row execute function private.prevent_published_scenario_version_mutation();

insert into public.scenarios (id, slug, title)
values ('d0000000-0000-0000-0000-000000000015', 'a-cena-con-il-bugiardo', 'A Cena Con Il Bugiardo')
on conflict (slug) do nothing;

insert into public.scenario_versions (id, scenario_id, version_number, status, briefing_title, briefing_body, published_at)
values (
  'e0000000-0000-0000-0000-000000000015',
  'd0000000-0000-0000-0000-000000000015',
  1,
  'published',
  'Benvenuti a cena',
  'La serata comincia ora. Ascoltate la Regia e osservate ciò che accade al vostro tavolo.',
  now()
)
on conflict (id) do nothing;

drop function if exists public.get_my_player_state(text);
drop function if exists private.get_my_player_state_impl(text);

create or replace function private.get_my_player_state_impl(p_game_code text)
returns table (game_id uuid, lifecycle text, narrative_phase text, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean, scenario_title text, briefing_title text, briefing_body text)
language plpgsql security definer set search_path = ''
as $$
declare v_game_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then raise exception 'AUTH_ANONYMOUS_REQUIRED' using errcode = 'P0001'; end if;
  select g.id into v_game_id from public.games g where upper(btrim(g.code)) = upper(btrim(coalesce(p_game_code, '')));
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  return query
  select g.id, g.lifecycle, g.narrative_phase, p.nickname, gt.table_number, p.seat_number,
    case when g.narrative_phase = 'lobby' then null when r.role in ('liar','accomplice','investigator') then r.role when r.role = 'scapegoat' then 'investigator' else null end,
    (a.player_id is not null),
    case when g.narrative_phase in ('briefing','discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then s.title else null end,
    case when g.narrative_phase in ('briefing','discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then sv.briefing_title else null end,
    case when g.narrative_phase in ('briefing','discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then sv.briefing_body else null end
  from public.players p join public.games g on g.id = p.game_id
  join public.game_tables gt on gt.id = p.table_id and gt.game_id = p.game_id
  left join public.game_role_assignments r on r.player_id = p.id and r.game_id = p.game_id
  left join public.game_role_acknowledgements a on a.player_id = p.id and a.game_id = p.game_id
  left join public.scenario_versions sv on sv.id = g.scenario_version_id
  left join public.scenarios s on s.id = sv.scenario_id
  where p.auth_user_id = auth.uid() and p.game_id = v_game_id;
end;
$$;

create or replace function public.get_my_player_state(game_code text)
returns table (game_id uuid, lifecycle text, narrative_phase text, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean, scenario_title text, briefing_title text, briefing_body text)
language sql security invoker
as $$ select * from private.get_my_player_state_impl($1); $$;
revoke execute on function public.get_my_player_state(text) from public, anon, authenticated;
grant execute on function public.get_my_player_state(text) to authenticated;

drop function if exists public.get_staff_game_overview(text);
drop function if exists private.get_staff_game_overview_impl(text);
create or replace function private.get_staff_game_overview_impl(p_game_code text)
returns table (id uuid, code text, lifecycle text, narrative_phase text, created_at timestamptz, event_name text, starts_at timestamptz, venue_name text, table_count integer, player_count integer, scenario_title text, scenario_version_number integer, briefing_title text, briefing_body text)
language plpgsql security definer set search_path = ''
as $$
declare v_code text := upper(btrim(coalesce(p_game_code, '')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  return query select g.id, g.code, g.lifecycle, g.narrative_phase, g.created_at, e.name, e.starts_at, e.venue_name,
    (select count(*)::integer from public.game_tables gt where gt.game_id = g.id),
    (select count(*)::integer from public.players p where p.game_id = g.id),
    s.title, sv.version_number, sv.briefing_title, sv.briefing_body
  from public.games g join public.events e on e.id = g.event_id
  left join public.scenario_versions sv on sv.id = g.scenario_version_id
  left join public.scenarios s on s.id = sv.scenario_id
  where upper(btrim(g.code)) = v_code;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
end;
$$;

revoke all on function private.get_staff_game_overview_impl(text) from public, anon, authenticated;
grant execute on function private.get_staff_game_overview_impl(text) to authenticated;

create or replace function public.get_staff_game_overview(p_game_code text)
returns table (id uuid, code text, lifecycle text, narrative_phase text, created_at timestamptz, event_name text, starts_at timestamptz, venue_name text, table_count integer, player_count integer, scenario_title text, scenario_version_number integer, briefing_title text, briefing_body text)
language sql security invoker
as $$ select * from private.get_staff_game_overview_impl($1); $$;
revoke execute on function public.get_staff_game_overview(text) from public, anon, authenticated;
grant execute on function public.get_staff_game_overview(text) to authenticated;
