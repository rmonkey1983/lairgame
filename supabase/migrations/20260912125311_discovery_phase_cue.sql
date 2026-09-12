alter table public.scenario_versions
  add column discovery_title text not null default 'Guardatevi intorno',
  add column discovery_body text not null default 'Alzate gli occhi dal telefono e parlate con chi è al vostro tavolo.';

alter table public.scenario_versions
  drop constraint if exists scenario_versions_discovery_title_check,
  drop constraint if exists scenario_versions_discovery_body_check;

alter table public.scenario_versions
  add constraint scenario_versions_discovery_title_check check (btrim(discovery_title) <> ''),
  add constraint scenario_versions_discovery_body_check check (btrim(discovery_body) <> '');

alter table public.scenario_versions
  alter column discovery_title drop default,
  alter column discovery_body drop default;

drop function if exists public.get_my_player_state(text);
drop function if exists private.get_my_player_state_impl(text);

create or replace function private.get_my_player_state_impl(p_game_code text)
returns table (game_id uuid, lifecycle text, narrative_phase text, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean, scenario_title text, briefing_title text, briefing_body text, discovery_title text, discovery_body text)
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
    case when g.narrative_phase = 'briefing' then sv.briefing_title else null end,
    case when g.narrative_phase = 'briefing' then sv.briefing_body else null end,
    case when g.narrative_phase = 'discovery' then sv.discovery_title else null end,
    case when g.narrative_phase = 'discovery' then sv.discovery_body else null end
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
returns table (game_id uuid, lifecycle text, narrative_phase text, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean, scenario_title text, briefing_title text, briefing_body text, discovery_title text, discovery_body text)
language sql security invoker
as $$ select * from private.get_my_player_state_impl($1); $$;
revoke execute on function public.get_my_player_state(text) from public, anon, authenticated;
grant execute on function public.get_my_player_state(text) to authenticated;

drop function if exists public.get_staff_game_overview(text);
drop function if exists private.get_staff_game_overview_impl(text);

create or replace function private.get_staff_game_overview_impl(p_game_code text)
returns table (id uuid, code text, lifecycle text, narrative_phase text, created_at timestamptz, event_name text, starts_at timestamptz, venue_name text, table_count integer, player_count integer, scenario_title text, scenario_version_number integer, briefing_title text, briefing_body text, discovery_title text, discovery_body text)
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
    s.title, sv.version_number,
    case when g.narrative_phase = 'briefing' then sv.briefing_title else null end,
    case when g.narrative_phase = 'briefing' then sv.briefing_body else null end,
    case when g.narrative_phase = 'discovery' then sv.discovery_title else null end,
    case when g.narrative_phase = 'discovery' then sv.discovery_body else null end
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
returns table (id uuid, code text, lifecycle text, narrative_phase text, created_at timestamptz, event_name text, starts_at timestamptz, venue_name text, table_count integer, player_count integer, scenario_title text, scenario_version_number integer, briefing_title text, briefing_body text, discovery_title text, discovery_body text)
language sql security invoker
as $$ select * from private.get_staff_game_overview_impl($1); $$;
revoke execute on function public.get_staff_game_overview(text) from public, anon, authenticated;
grant execute on function public.get_staff_game_overview(text) to authenticated;
