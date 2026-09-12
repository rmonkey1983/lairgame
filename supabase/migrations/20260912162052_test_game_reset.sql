alter table public.games
  add column reset_enabled boolean not null default false;

create table public.game_reset_commands (
  game_id uuid not null references public.games(id) on delete restrict,
  command_id uuid not null,
  staff_member_id uuid not null references public.staff_members(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (game_id, command_id)
);

alter table public.game_reset_commands enable row level security;
revoke all on table public.game_reset_commands from public, anon, authenticated;

create or replace function private.reset_game_for_testing_impl(
  p_game_code text,
  p_command_id uuid
)
returns table (
  game_id uuid,
  game_code text,
  lifecycle text,
  narrative_phase text,
  command_id uuid,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games%rowtype;
  v_staff_id uuid;
  v_audit public.game_reset_commands%rowtype;
  v_table public.game_tables%rowtype;
  v_balance bigint;
  v_reset_at timestamptz;
  v_code text := upper(btrim(coalesce(p_game_code, '')));
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  select s.id into v_staff_id
    from public.staff_members s
   where s.auth_user_id = auth.uid() and s.active = true;
  if not found then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001';
  end if;
  if v_code = '' or p_command_id is null then
    raise exception 'INVALID_COMMAND' using errcode = 'P0001';
  end if;

  select g.* into v_game
    from public.games g
   where upper(btrim(g.code)) = v_code
   for update;
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not v_game.reset_enabled then
    raise exception 'GAME_RESET_DISABLED' using errcode = 'P0001';
  end if;

  select r.* into v_audit
    from public.game_reset_commands r
   where r.game_id = v_game.id and r.command_id = p_command_id;
  if found then
    return query select v_audit.game_id, v_game.code, 'checkin_open'::text,
      'lobby'::text, v_audit.command_id, v_audit.created_at;
    return;
  end if;

  delete from public.game_role_acknowledgements a
   where a.game_id = v_game.id;
  delete from public.game_role_assignments r
   where r.game_id = v_game.id;
  delete from public.game_auction_commands c
   where c.game_id = v_game.id;
  delete from public.game_auction_bids b
   where b.game_auction_id in (select a.id from public.game_auctions a where a.game_id = v_game.id);
  delete from public.game_auctions a
   where a.game_id = v_game.id;
  delete from public.players p
   where p.game_id = v_game.id;

  for v_table in
    select gt.* from public.game_tables gt
     where gt.game_id = v_game.id
     order by gt.table_number
  loop
    select coalesce(sum(l.delta), 0)::bigint into v_balance
      from public.table_coin_ledger l
     where l.game_id = v_game.id and l.game_table_id = v_table.id;
    if v_balance <> 20 then
      insert into public.table_coin_ledger (
        game_id, game_table_id, delta, reason, correlation_id, created_by_staff_user_id
      ) values (
        v_game.id, v_table.id, (20 - v_balance)::integer,
        'Reset partita test',
        pg_catalog.md5(p_command_id::text || ':' || v_table.table_number::text)::uuid,
        auth.uid()
      );
    end if;
  end loop;

  update public.games g
     set lifecycle = 'checkin_open', narrative_phase = 'lobby', updated_at = now()
   where g.id = v_game.id
   returning g.updated_at into v_reset_at;

  insert into public.game_reset_commands (game_id, command_id, staff_member_id)
  values (v_game.id, p_command_id, v_staff_id)
  returning created_at into v_reset_at;

  return query select v_game.id, v_game.code, 'checkin_open'::text,
    'lobby'::text, p_command_id, v_reset_at;
end;
$$;

drop function public.get_staff_game_overview(text);
drop function private.get_staff_game_overview_impl(text);

create or replace function private.get_staff_game_overview_impl(p_game_code text)
returns table (
  id uuid, code text, lifecycle text, narrative_phase text, created_at timestamptz,
  event_name text, starts_at timestamptz, venue_name text, table_count integer,
  player_count integer, scenario_title text, scenario_version_number integer,
  briefing_title text, briefing_body text, discovery_title text, discovery_body text,
  comparison_title text, comparison_body text, pressure_title text, pressure_body text,
  reset_enabled boolean
)
language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(btrim(coalesce(p_game_code, '')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  return query
  select g.id, g.code, g.lifecycle, g.narrative_phase, g.created_at,
    e.name, e.starts_at, e.venue_name,
    (select count(*)::integer from public.game_tables gt where gt.game_id = g.id),
    (select count(*)::integer from public.players p where p.game_id = g.id),
    s.title, sv.version_number,
    case when g.narrative_phase = 'briefing' then sv.briefing_title else null end,
    case when g.narrative_phase = 'briefing' then sv.briefing_body else null end,
    case when g.narrative_phase = 'discovery' then sv.discovery_title else null end,
    case when g.narrative_phase = 'discovery' then sv.discovery_body else null end,
    case when g.narrative_phase = 'comparison' then sv.comparison_title else null end,
    case when g.narrative_phase = 'comparison' then sv.comparison_body else null end,
    case when g.narrative_phase = 'pressure' then sv.pressure_title else null end,
    case when g.narrative_phase = 'pressure' then sv.pressure_body else null end,
    g.reset_enabled
  from public.games g
  join public.events e on e.id = g.event_id
  left join public.scenario_versions sv on sv.id = g.scenario_version_id
  left join public.scenarios s on s.id = sv.scenario_id
  where upper(btrim(g.code)) = v_code;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
end;
$$;
revoke all on function private.get_staff_game_overview_impl(text) from public, anon, authenticated;
grant execute on function private.get_staff_game_overview_impl(text) to authenticated;

create or replace function public.get_staff_game_overview(p_game_code text)
returns table (
  id uuid, code text, lifecycle text, narrative_phase text, created_at timestamptz,
  event_name text, starts_at timestamptz, venue_name text, table_count integer,
  player_count integer, scenario_title text, scenario_version_number integer,
  briefing_title text, briefing_body text, discovery_title text, discovery_body text,
  comparison_title text, comparison_body text, pressure_title text, pressure_body text,
  reset_enabled boolean
)
language sql security invoker as $$ select * from private.get_staff_game_overview_impl($1); $$;
revoke execute on function public.get_staff_game_overview(text) from public, anon, authenticated;
grant execute on function public.get_staff_game_overview(text) to authenticated;

revoke all on function private.reset_game_for_testing_impl(text, uuid) from public, anon, authenticated;
grant execute on function private.reset_game_for_testing_impl(text, uuid) to authenticated;

create or replace function public.reset_game_for_testing(game_code text, command_id uuid)
returns table (
  game_id uuid,
  game_code text,
  lifecycle text,
  narrative_phase text,
  command_id uuid,
  reset_at timestamptz
)
language sql
security invoker
as $$
  select * from private.reset_game_for_testing_impl($1, $2);
$$;

revoke execute on function public.reset_game_for_testing(text, uuid) from public, anon, authenticated;
grant execute on function public.reset_game_for_testing(text, uuid) to authenticated;
