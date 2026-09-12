alter table public.scenario_versions
  add column comparison_title text not null default 'Confrontate i frammenti',
  add column comparison_body text not null default 'Parlate con il tavolo indicato e ascoltate ciò che ha osservato.';

alter table public.scenario_versions
  add constraint scenario_versions_comparison_title_check check (btrim(comparison_title) <> ''),
  add constraint scenario_versions_comparison_body_check check (btrim(comparison_body) <> '');

alter table public.scenario_versions
  alter column comparison_title drop default,
  alter column comparison_body drop default;

create table public.scenario_table_comparisons (
  id uuid primary key default gen_random_uuid(),
  scenario_version_id uuid not null references public.scenario_versions(id) on delete restrict,
  source_table_number integer not null check (source_table_number between 1 and 5),
  target_table_number integer not null check (target_table_number between 1 and 5),
  instruction text not null check (btrim(instruction) <> ''),
  created_at timestamptz not null default now(),
  unique (scenario_version_id, source_table_number),
  check (source_table_number <> target_table_number)
);

alter table public.scenario_table_comparisons enable row level security;
revoke all on table public.scenario_table_comparisons from public, anon, authenticated;

create or replace function private.prevent_published_scenario_table_comparison_mutation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.scenario_versions sv
    where sv.id = coalesce(new.scenario_version_id, old.scenario_version_id)
      and sv.status = 'published'
  ) then
    raise exception 'PUBLISHED_SCENARIO_IMMUTABLE' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.prevent_published_scenario_table_comparison_mutation() from public, anon, authenticated;

insert into public.scenario_table_comparisons (id, scenario_version_id, source_table_number, target_table_number, instruction)
values
  ('f0000000-0000-0000-0000-000000000181', 'e0000000-0000-0000-0000-000000000015', 1, 2, 'Confrontate a voce il vostro frammento con il Tavolo 2. Non mostrate il telefono.'),
  ('f0000000-0000-0000-0000-000000000182', 'e0000000-0000-0000-0000-000000000015', 2, 3, 'Confrontate a voce il vostro frammento con il Tavolo 3. Non mostrate il telefono.'),
  ('f0000000-0000-0000-0000-000000000183', 'e0000000-0000-0000-0000-000000000015', 3, 4, 'Confrontate a voce il vostro frammento con il Tavolo 4. Non mostrate il telefono.'),
  ('f0000000-0000-0000-0000-000000000184', 'e0000000-0000-0000-0000-000000000015', 4, 5, 'Confrontate a voce il vostro frammento con il Tavolo 5. Non mostrate il telefono.'),
  ('f0000000-0000-0000-0000-000000000185', 'e0000000-0000-0000-0000-000000000015', 5, 1, 'Confrontate a voce il vostro frammento con il Tavolo 1. Non mostrate il telefono.');

create trigger scenario_table_comparisons_published_immutable
before insert or update or delete on public.scenario_table_comparisons
for each row execute function private.prevent_published_scenario_table_comparison_mutation();

drop function if exists public.get_my_player_state(text);
drop function if exists private.get_my_player_state_impl(text);

create or replace function private.get_my_player_state_impl(p_game_code text)
returns table (game_id uuid, lifecycle text, narrative_phase text, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean, scenario_title text, briefing_title text, briefing_body text, discovery_title text, discovery_body text, clue_title text, clue_body text, comparison_title text, comparison_body text, comparison_target_table_number integer, comparison_instruction text)
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
    case when g.narrative_phase = 'lobby' then null when ra.role in ('liar','accomplice','investigator') then ra.role when ra.role = 'scapegoat' then 'investigator' else null end,
    (ack.player_id is not null),
    case when g.narrative_phase in ('briefing','discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then s.title else null end,
    case when g.narrative_phase = 'briefing' then sv.briefing_title else null end,
    case when g.narrative_phase = 'briefing' then sv.briefing_body else null end,
    case when g.narrative_phase = 'discovery' then sv.discovery_title else null end,
    case when g.narrative_phase = 'discovery' then sv.discovery_body else null end,
    case when g.narrative_phase in ('discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then clue.title else null end,
    case when g.narrative_phase in ('discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then clue.body else null end,
    case when g.narrative_phase = 'comparison' then sv.comparison_title else null end,
    case when g.narrative_phase = 'comparison' then sv.comparison_body else null end,
    case when g.narrative_phase = 'comparison' then route.target_table_number else null end,
    case when g.narrative_phase = 'comparison' then route.instruction else null end
  from public.players p
  join public.games g on g.id = p.game_id
  join public.game_tables gt on gt.id = p.table_id and gt.game_id = p.game_id
  left join public.game_role_assignments ra on ra.player_id = p.id and ra.game_id = p.game_id
  left join public.game_role_acknowledgements ack on ack.player_id = p.id and ack.game_id = p.game_id
  left join public.scenario_versions sv on sv.id = g.scenario_version_id
  left join public.scenarios s on s.id = sv.scenario_id
  left join public.scenario_table_clues clue on clue.scenario_version_id = g.scenario_version_id and clue.table_number = gt.table_number
  left join public.scenario_table_comparisons route on route.scenario_version_id = g.scenario_version_id and route.source_table_number = gt.table_number
  where p.auth_user_id = auth.uid() and p.game_id = v_game_id;
end;
$$;

create or replace function public.get_my_player_state(game_code text)
returns table (game_id uuid, lifecycle text, narrative_phase text, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean, scenario_title text, briefing_title text, briefing_body text, discovery_title text, discovery_body text, clue_title text, clue_body text, comparison_title text, comparison_body text, comparison_target_table_number integer, comparison_instruction text)
language sql security invoker
as $$ select * from private.get_my_player_state_impl($1); $$;
revoke execute on function public.get_my_player_state(text) from public, anon, authenticated;
grant execute on function public.get_my_player_state(text) to authenticated;

drop function if exists public.get_staff_game_overview(text);
drop function if exists private.get_staff_game_overview_impl(text);

create or replace function private.get_staff_game_overview_impl(p_game_code text)
returns table (id uuid, code text, lifecycle text, narrative_phase text, created_at timestamptz, event_name text, starts_at timestamptz, venue_name text, table_count integer, player_count integer, scenario_title text, scenario_version_number integer, briefing_title text, briefing_body text, discovery_title text, discovery_body text, comparison_title text, comparison_body text)
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
    case when g.narrative_phase = 'discovery' then sv.discovery_body else null end,
    case when g.narrative_phase = 'comparison' then sv.comparison_title else null end,
    case when g.narrative_phase = 'comparison' then sv.comparison_body else null end
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
returns table (id uuid, code text, lifecycle text, narrative_phase text, created_at timestamptz, event_name text, starts_at timestamptz, venue_name text, table_count integer, player_count integer, scenario_title text, scenario_version_number integer, briefing_title text, briefing_body text, discovery_title text, discovery_body text, comparison_title text, comparison_body text)
language sql security invoker
as $$ select * from private.get_staff_game_overview_impl($1); $$;
revoke execute on function public.get_staff_game_overview(text) from public, anon, authenticated;
grant execute on function public.get_staff_game_overview(text) to authenticated;

create or replace function private.get_staff_game_comparisons_impl(p_game_code text)
returns table (source_table_number integer, target_table_number integer, instruction text)
language plpgsql security definer set search_path = ''
as $$
declare v_code text := upper(btrim(coalesce(p_game_code, '')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  return query
  select c.source_table_number, c.target_table_number, c.instruction
  from public.games g join public.scenario_table_comparisons c on c.scenario_version_id = g.scenario_version_id
  where upper(btrim(g.code)) = v_code order by c.source_table_number;
  if not found and not exists (select 1 from public.games g where upper(btrim(g.code)) = v_code) then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
end;
$$;

revoke all on function private.get_staff_game_comparisons_impl(text) from public, anon, authenticated;
grant execute on function private.get_staff_game_comparisons_impl(text) to authenticated;

create or replace function public.get_staff_game_comparisons(game_code text)
returns table (source_table_number integer, target_table_number integer, instruction text)
language sql security invoker
as $$ select * from private.get_staff_game_comparisons_impl($1); $$;
revoke execute on function public.get_staff_game_comparisons(text) from public, anon, authenticated;
grant execute on function public.get_staff_game_comparisons(text) to authenticated;
