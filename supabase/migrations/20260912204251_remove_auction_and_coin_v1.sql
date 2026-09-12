-- M22: remove Auction and BBL Coin from the active V1 surface.
-- Historical migrations remain intact; this migration is the forward cut-over.

-- Existing databases may contain a game paused in the removed phase. Move it
-- before replacing the phase constraints.
update public.games
set narrative_phase = 'deliberation', updated_at = now()
where narrative_phase = 'auction';

alter table public.games drop constraint if exists games_narrative_phase_check;
alter table public.games add constraint games_narrative_phase_check
  check (narrative_phase in ('lobby', 'role_reveal', 'briefing', 'discovery', 'comparison', 'pressure', 'deliberation', 'final_vote', 'reveal'));

alter table public.game_narrative_phase_commands drop constraint if exists game_narrative_phase_commands_from_phase_check;
alter table public.game_narrative_phase_commands drop constraint if exists game_narrative_phase_commands_to_phase_check;
alter table public.game_narrative_phase_commands add constraint game_narrative_phase_commands_from_phase_check
  check (from_phase in ('lobby', 'role_reveal', 'briefing', 'discovery', 'comparison', 'pressure', 'deliberation', 'final_vote', 'reveal'));
alter table public.game_narrative_phase_commands add constraint game_narrative_phase_commands_to_phase_check
  check (to_phase in ('lobby', 'role_reveal', 'briefing', 'discovery', 'comparison', 'pressure', 'deliberation', 'final_vote', 'reveal'));

drop function if exists public.adjust_table_coins(text, integer, integer, text, uuid);
drop function if exists private.adjust_table_coins_impl(text, integer, integer, text, uuid);
drop function if exists public.get_staff_game_coins(text);
drop function if exists private.get_staff_game_coins_impl(text);

drop function if exists public.open_game_auction(text, uuid);
drop function if exists public.record_game_auction_bid(text, integer, integer, uuid);
drop function if exists public.close_game_auction(text, uuid);
drop function if exists public.close_game_auction_no_sale(text, uuid);
drop function if exists public.get_staff_game_auction(text);
drop function if exists private.open_game_auction_impl(text, uuid);
drop function if exists private.record_game_auction_bid_impl(text, integer, integer, uuid);
drop function if exists private.close_game_auction_impl(text, uuid, boolean);
drop function if exists private.get_staff_game_auction_impl(text);

drop table if exists public.game_auction_commands;
drop table if exists public.game_auction_bids;
drop table if exists public.game_auctions;
drop table if exists public.scenario_auction_items;
drop table if exists public.table_coin_ledger;
drop function if exists private.prevent_table_coin_ledger_mutation();
drop function if exists private.prevent_published_scenario_auction_item_mutation();

-- The phase command is recreated without the removed phase or settlement guard.
drop function public.transition_game_narrative_phase(text, text, text, uuid);
drop function private.transition_game_narrative_phase_impl(text, text, text, uuid);

create function private.transition_game_narrative_phase_impl(p_game_code text, p_expected_phase text, p_target_phase text, p_command_id uuid)
returns table(game_id uuid, game_code text, previous_phase text, phase text, command_id uuid, changed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games%rowtype;
  v_staff_id uuid;
  v_audit public.game_narrative_phase_commands%rowtype;
  v_code text := upper(btrim(coalesce(p_game_code, '')));
  v_expected text := lower(btrim(coalesce(p_expected_phase, '')));
  v_target text := lower(btrim(coalesce(p_target_phase, '')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  select s.id into v_staff_id from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true;
  if not found then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  if p_command_id is null or v_code = '' then raise exception 'INVALID_COMMAND' using errcode = 'P0001'; end if;
  if v_expected not in ('lobby','role_reveal','briefing','discovery','comparison','pressure','deliberation','final_vote','reveal')
     or v_target not in ('lobby','role_reveal','briefing','discovery','comparison','pressure','deliberation','final_vote','reveal') then
    raise exception 'INVALID_PHASE' using errcode = 'P0001';
  end if;
  select g.* into v_game from public.games g where upper(btrim(g.code)) = v_code for update;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  select a.* into v_audit from public.game_narrative_phase_commands a where a.game_id = v_game.id and a.command_id = p_command_id;
  if found then
    if v_audit.from_phase <> v_expected or v_audit.to_phase <> v_target then raise exception 'CONFLICT' using errcode = 'P0001'; end if;
    return query select v_audit.game_id, v_game.code, v_audit.from_phase, v_audit.to_phase, v_audit.command_id, v_audit.created_at;
    return;
  end if;
  if v_game.lifecycle <> 'live' then raise exception 'GAME_NOT_LIVE' using errcode = 'P0001'; end if;
  if v_game.narrative_phase <> v_expected then raise exception 'STALE_GAME_STATE' using errcode = 'P0001'; end if;
  if not ((v_expected = 'lobby' and v_target = 'role_reveal') or
          (v_expected = 'role_reveal' and v_target = 'briefing') or
          (v_expected = 'briefing' and v_target = 'discovery') or
          (v_expected = 'discovery' and v_target = 'comparison') or
          (v_expected = 'comparison' and v_target = 'pressure') or
          (v_expected = 'pressure' and v_target = 'deliberation') or
          (v_expected = 'deliberation' and v_target = 'final_vote') or
          (v_expected = 'final_vote' and v_target = 'reveal')) then
    raise exception 'INVALID_PHASE_TRANSITION' using errcode = 'P0001';
  end if;
  update public.games set narrative_phase = v_target, updated_at = now() where id = v_game.id;
  insert into public.game_narrative_phase_commands(command_id, game_id, staff_member_id, from_phase, to_phase)
  values (p_command_id, v_game.id, v_staff_id, v_expected, v_target)
  returning created_at into v_audit.created_at;
  return query select v_game.id, v_game.code, v_expected, v_target, p_command_id, v_audit.created_at;
end;
$$;
revoke all on function private.transition_game_narrative_phase_impl(text, text, text, uuid) from public, anon, authenticated;
grant execute on function private.transition_game_narrative_phase_impl(text, text, text, uuid) to authenticated;

create function public.transition_game_narrative_phase(game_code text, expected_phase text, target_phase text, command_id uuid)
returns table(game_id uuid, game_code text, previous_phase text, phase text, command_id uuid, changed_at timestamptz)
language sql security invoker
as $$ select * from private.transition_game_narrative_phase_impl($1, $2, $3, $4); $$;
revoke execute on function public.transition_game_narrative_phase(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.transition_game_narrative_phase(text, text, text, uuid) to authenticated;

-- Remove the Coin column from the Player authoritative projection.
drop function public.get_my_player_state(text);
drop function private.get_my_player_state_impl(text);

create function private.get_my_player_state_impl(p_game_code text)
returns table (game_id uuid, lifecycle text, narrative_phase text, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean, scenario_title text, briefing_title text, briefing_body text, discovery_title text, discovery_body text, clue_title text, clue_body text, comparison_title text, comparison_body text, comparison_target_table_number integer, comparison_instruction text, pressure_title text, pressure_body text, pressure_target_table_number integer, pressure_route_title text, pressure_instruction text)
language plpgsql security definer set search_path = '' as $$
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
    case when g.narrative_phase in ('briefing','discovery','comparison','pressure','deliberation','final_vote','reveal') then s.title else null end,
    case when g.narrative_phase = 'briefing' then sv.briefing_title else null end,
    case when g.narrative_phase = 'briefing' then sv.briefing_body else null end,
    case when g.narrative_phase = 'discovery' then sv.discovery_title else null end,
    case when g.narrative_phase = 'discovery' then sv.discovery_body else null end,
    case when g.narrative_phase in ('discovery','comparison','pressure','deliberation','final_vote','reveal') then clue.title else null end,
    case when g.narrative_phase in ('discovery','comparison','pressure','deliberation','final_vote','reveal') then clue.body else null end,
    case when g.narrative_phase = 'comparison' then sv.comparison_title else null end,
    case when g.narrative_phase = 'comparison' then sv.comparison_body else null end,
    case when g.narrative_phase = 'comparison' then cmp.target_table_number else null end,
    case when g.narrative_phase = 'comparison' then cmp.instruction else null end,
    case when g.narrative_phase = 'pressure' then sv.pressure_title else null end,
    case when g.narrative_phase = 'pressure' then sv.pressure_body else null end,
    case when g.narrative_phase = 'pressure' then pr.target_table_number else null end,
    case when g.narrative_phase = 'pressure' then pr.title else null end,
    case when g.narrative_phase = 'pressure' then pr.instruction else null end
  from public.players p
  join public.games g on g.id = p.game_id
  join public.game_tables gt on gt.id = p.table_id and gt.game_id = p.game_id
  left join public.game_role_assignments ra on ra.player_id = p.id and ra.game_id = p.game_id
  left join public.game_role_acknowledgements ack on ack.player_id = p.id and ack.game_id = p.game_id
  left join public.scenario_versions sv on sv.id = g.scenario_version_id
  left join public.scenarios s on s.id = sv.scenario_id
  left join public.scenario_table_clues clue on clue.scenario_version_id = g.scenario_version_id and clue.table_number = gt.table_number
  left join public.scenario_table_comparisons cmp on cmp.scenario_version_id = g.scenario_version_id and cmp.source_table_number = gt.table_number
  left join public.scenario_table_pressure_routes pr on pr.scenario_version_id = g.scenario_version_id and pr.source_table_number = gt.table_number
  where p.auth_user_id = auth.uid() and p.game_id = v_game_id;
end;
$$;
revoke all on function private.get_my_player_state_impl(text) from public, anon, authenticated;
grant execute on function private.get_my_player_state_impl(text) to authenticated;

create function public.get_my_player_state(game_code text)
returns table (game_id uuid, lifecycle text, narrative_phase text, nickname text, table_number integer, seat_number integer, role text, role_acknowledged boolean, scenario_title text, briefing_title text, briefing_body text, discovery_title text, discovery_body text, clue_title text, clue_body text, comparison_title text, comparison_body text, comparison_target_table_number integer, comparison_instruction text, pressure_title text, pressure_body text, pressure_target_table_number integer, pressure_route_title text, pressure_instruction text)
language sql security invoker
as $$ select * from private.get_my_player_state_impl($1); $$;
revoke execute on function public.get_my_player_state(text) from public, anon, authenticated;
grant execute on function public.get_my_player_state(text) to authenticated;

-- Reset remains a test-only destructive command, but no longer knows about
-- removed runtime features or the Coin ledger.
create or replace function private.reset_game_for_testing_impl(p_game_code text, p_command_id uuid)
returns table (game_id uuid, game_code text, lifecycle text, narrative_phase text, command_id uuid, reset_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_game public.games%rowtype; v_staff_id uuid; v_audit public.game_reset_commands%rowtype; v_reset_at timestamptz; v_code text := upper(btrim(coalesce(p_game_code, '')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  select s.id into v_staff_id from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true;
  if not found then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  if v_code = '' or p_command_id is null then raise exception 'INVALID_COMMAND' using errcode = 'P0001'; end if;
  select g.* into v_game from public.games g where upper(btrim(g.code)) = v_code for update;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  if not v_game.reset_enabled then raise exception 'GAME_RESET_DISABLED' using errcode = 'P0001'; end if;
  select r.* into v_audit from public.game_reset_commands r where r.game_id = v_game.id and r.command_id = p_command_id;
  if found then return query select v_audit.game_id, v_game.code, 'checkin_open'::text, 'lobby'::text, v_audit.command_id, v_audit.created_at; return; end if;
  delete from public.game_role_acknowledgements a where a.game_id = v_game.id;
  delete from public.game_role_assignments r where r.game_id = v_game.id;
  delete from public.players p where p.game_id = v_game.id;
  update public.games set lifecycle = 'checkin_open', narrative_phase = 'lobby', updated_at = now() where id = v_game.id;
  insert into public.game_reset_commands(game_id, command_id, staff_member_id) values (v_game.id, p_command_id, v_staff_id) returning created_at into v_reset_at;
  return query select v_game.id, v_game.code, 'checkin_open'::text, 'lobby'::text, p_command_id, v_reset_at;
end;
$$;
revoke all on function private.reset_game_for_testing_impl(text, uuid) from public, anon, authenticated;
grant execute on function private.reset_game_for_testing_impl(text, uuid) to authenticated;
