-- v0.21: explicit mission outcomes and Player acknowledgement. Outcome state
-- is terminal and is never inferred from a client interaction.
alter table public.brain_missions
  add column acknowledged_at timestamptz,
  add column outcome_at timestamptz,
  add column outcome_reason text;

alter table public.brain_missions drop constraint brain_missions_status_check;
alter table public.brain_missions add constraint brain_missions_status_check
  check (status in ('ACTIVE', 'COMPLETED', 'FAILED', 'EXPIRED'));
alter table public.brain_missions add constraint brain_missions_outcome_reason_check
  check (outcome_reason is null or outcome_reason in ('MC_CONFIRMED','PLAYER_UNABLE','PHASE_ENDED','MISSION_NO_LONGER_RELEVANT'));
alter table public.brain_missions add constraint brain_missions_outcome_fields_check
  check ((status = 'ACTIVE' and outcome_at is null) or (status in ('COMPLETED','FAILED','EXPIRED') and outcome_at is not null));

create or replace function private.set_brain_mission_outcome_impl(
  p_game_code text, p_mission_id text, p_outcome text,
  p_reason_code text default null, p_command_id text default null
)
returns table(mission_id text, mission_type text, target_player_id uuid, phase text, status text, acknowledged_at timestamptz, outcome_at timestamptz, outcome_reason text)
language plpgsql security definer set search_path = '' as $$
declare v_game_id uuid; v_mission public.brain_missions%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  if p_outcome not in ('COMPLETED','FAILED','EXPIRED') then raise exception 'INVALID_MISSION_OUTCOME' using errcode = 'P0001'; end if;
  if p_reason_code is not null and p_reason_code not in ('MC_CONFIRMED','PLAYER_UNABLE','PHASE_ENDED','MISSION_NO_LONGER_RELEVANT') then raise exception 'INVALID_OUTCOME_REASON' using errcode = 'P0001'; end if;
  if btrim(coalesce(p_mission_id,'')) = '' or btrim(coalesce(p_command_id,'')) = '' then raise exception 'INVALID_COMMAND' using errcode = 'P0001'; end if;
  select g.id into v_game_id from public.games g where upper(g.code) = upper(btrim(p_game_code)) for update;
  if v_game_id is null then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  select m.* into v_mission from public.brain_missions m where m.session_id = v_game_id and m.mission_id = p_mission_id for update;
  if not found then raise exception 'MISSION_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_mission.status <> 'ACTIVE' then
    if v_mission.status = p_outcome then
      return query select v_mission.mission_id,v_mission.mission_type,v_mission.target_player_id,v_mission.phase,v_mission.status,v_mission.acknowledged_at,v_mission.outcome_at,v_mission.outcome_reason;
      return;
    end if;
    raise exception 'MISSION_OUTCOME_TERMINAL' using errcode = 'P0001';
  end if;
  update public.brain_missions as m set status = p_outcome, outcome_at = now(), outcome_reason = p_reason_code where m.session_id = v_game_id and m.mission_id = p_mission_id;
  select m.* into v_mission from public.brain_missions m where m.session_id = v_game_id and m.mission_id = p_mission_id;
  return query select v_mission.mission_id,v_mission.mission_type,v_mission.target_player_id,v_mission.phase,v_mission.status,v_mission.acknowledged_at,v_mission.outcome_at,v_mission.outcome_reason;
end;
$$;
revoke all on function private.set_brain_mission_outcome_impl(text,text,text,text,text) from public, anon, authenticated;
grant execute on function private.set_brain_mission_outcome_impl(text,text,text,text,text) to authenticated;

create or replace function public.set_brain_mission_outcome(game_code text, mission_id text, outcome text, reason_code text default null, command_id text default null)
returns table(mission_id text, mission_type text, target_player_id uuid, phase text, status text, acknowledged_at timestamptz, outcome_at timestamptz, outcome_reason text)
language sql security invoker as $$ select * from private.set_brain_mission_outcome_impl($1,$2,$3,$4,$5); $$;
revoke execute on function public.set_brain_mission_outcome(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.set_brain_mission_outcome(text,text,text,text,text) to authenticated;

create or replace function private.acknowledge_my_mission_impl(p_game_code text, p_mission_id text)
returns table(mission_id text, acknowledged_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_game_id uuid; v_player_id uuid; v_ack timestamptz;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then raise exception 'AUTH_ANONYMOUS_REQUIRED' using errcode = 'P0001'; end if;
  select g.id into v_game_id from public.games g where upper(g.code) = upper(btrim(p_game_code));
  if v_game_id is null then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  select p.id into v_player_id from public.players p where p.game_id = v_game_id and p.auth_user_id = auth.uid();
  if v_player_id is null then raise exception 'PLAYER_NOT_JOINED' using errcode = 'P0001'; end if;
  select m.acknowledged_at into v_ack from public.brain_missions m where m.session_id = v_game_id and m.mission_id = p_mission_id and m.player_id = v_player_id and m.status = 'ACTIVE' for update;
  if not found then raise exception 'MISSION_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_ack is null then
    update public.brain_missions as m set acknowledged_at = now() where m.session_id = v_game_id and m.mission_id = p_mission_id;
    select m.acknowledged_at into v_ack from public.brain_missions as m where m.session_id = v_game_id and m.mission_id = p_mission_id;
  end if;
  return query select p_mission_id, v_ack;
end;
$$;
revoke all on function private.acknowledge_my_mission_impl(text,text) from public, anon, authenticated;
grant execute on function private.acknowledge_my_mission_impl(text,text) to authenticated;
create or replace function public.acknowledge_my_mission(game_code text, mission_id text)
returns table(mission_id text, acknowledged_at timestamptz)
language sql security invoker as $$ select * from private.acknowledge_my_mission_impl($1,$2); $$;
revoke execute on function public.acknowledge_my_mission(text,text) from public, anon, authenticated;
grant execute on function public.acknowledge_my_mission(text,text) to authenticated;

create or replace function private.load_incompatible_brain_missions_impl(p_game_code text)
returns table(mission_id text, phase text, current_phase text)
language plpgsql security definer set search_path = '' as $$
declare v_game_id uuid; v_phase text;
begin
  if auth.uid() is null or not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  select g.id, upper(g.narrative_phase) into v_game_id, v_phase from public.games g where upper(g.code) = upper(btrim(p_game_code));
  if v_game_id is null then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  v_phase := case v_phase when 'BRIEFING' then 'SOCIAL_WARMUP' when 'DISCOVERY' then 'INVESTIGATION' when 'COMPARISON' then 'INVESTIGATION' when 'PRESSURE' then 'DOUBT' when 'DELIBERATION' then 'FINAL_THEORY' when 'FINAL_VOTE' then 'VOTING' else v_phase end;
  return query select m.mission_id,m.phase,v_phase from public.brain_missions m where m.session_id = v_game_id and m.status = 'ACTIVE' and m.phase <> v_phase order by m.mission_id;
end;
$$;
revoke all on function private.load_incompatible_brain_missions_impl(text) from public, anon, authenticated;
grant execute on function private.load_incompatible_brain_missions_impl(text) to authenticated;
create or replace function public.load_incompatible_brain_missions(game_code text)
returns table(mission_id text, phase text, current_phase text)
language sql security invoker as $$ select * from private.load_incompatible_brain_missions_impl($1); $$;
revoke execute on function public.load_incompatible_brain_missions(text) from public, anon, authenticated;
grant execute on function public.load_incompatible_brain_missions(text) to authenticated;

drop trigger if exists brain_missions_player_state_change on public.brain_missions;
create trigger brain_missions_player_state_change after insert or update of status, acknowledged_at on public.brain_missions
for each row execute function private.broadcast_player_mission_state_changed();

create or replace function private.load_staff_mission_outcomes_impl(p_game_code text)
returns table(mission_id text, mission_type text, player_id uuid, target_player_id uuid, phase text, status text, acknowledged_at timestamptz, outcome_at timestamptz, outcome_reason text)
language plpgsql security definer set search_path = '' as $$
declare v_game_id uuid;
begin
  if auth.uid() is null or not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  select g.id into v_game_id from public.games g where upper(g.code) = upper(btrim(p_game_code));
  if v_game_id is null then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  return query select m.mission_id,m.mission_type,m.player_id,m.target_player_id,m.phase,m.status,m.acknowledged_at,m.outcome_at,m.outcome_reason from public.brain_missions m where m.session_id = v_game_id order by m.activated_at,m.mission_id;
end;
$$;
revoke all on function private.load_staff_mission_outcomes_impl(text) from public, anon, authenticated;
grant execute on function private.load_staff_mission_outcomes_impl(text) to authenticated;
create or replace function public.load_staff_mission_outcomes(game_code text)
returns table(mission_id text, mission_type text, player_id uuid, target_player_id uuid, phase text, status text, acknowledged_at timestamptz, outcome_at timestamptz, outcome_reason text)
language sql security invoker as $$ select * from private.load_staff_mission_outcomes_impl($1); $$;
revoke execute on function public.load_staff_mission_outcomes(text) from public, anon, authenticated;
grant execute on function public.load_staff_mission_outcomes(text) to authenticated;

drop function private.load_my_player_missions_impl(text);
create or replace function private.load_my_player_missions_impl(p_game_code text)
returns table(mission_id text, mission_type text, target_player_id uuid, phase text, status text, acknowledged_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_game_id uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then raise exception 'AUTH_ANONYMOUS_REQUIRED'; end if;
  select g.id into v_game_id from public.games g where upper(g.code) = upper(btrim(p_game_code));
  if v_game_id is null then raise exception 'GAME_NOT_FOUND'; end if;
  return query select m.mission_id, m.mission_type, m.target_player_id, m.phase, m.status, m.acknowledged_at
    from public.brain_missions m join public.players p on p.id = m.player_id
    where m.session_id = v_game_id and p.game_id = v_game_id and p.auth_user_id = auth.uid() and m.status = 'ACTIVE'
    order by m.activated_at asc, m.mission_id asc;
end;
$$;
revoke all on function private.load_my_player_missions_impl(text) from public, anon, authenticated;
grant execute on function private.load_my_player_missions_impl(text) to authenticated;
drop function public.load_my_player_missions(text);
create or replace function public.load_my_player_missions(game_code text)
returns table(mission_id text, mission_type text, target_player_id uuid, phase text, status text, acknowledged_at timestamptz)
language sql security invoker as $$ select * from private.load_my_player_missions_impl($1); $$;
revoke execute on function public.load_my_player_missions(text) from public, anon, authenticated;
grant execute on function public.load_my_player_missions(text) to authenticated;
