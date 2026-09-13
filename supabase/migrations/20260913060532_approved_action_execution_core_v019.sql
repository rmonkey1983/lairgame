-- v0.19: approved Regia proposals cross the execution boundary only through
-- this server-authoritative, mission-only command. No client table access.

alter table public.brain_regia_proposals
  drop constraint brain_regia_proposals_status_check;
alter table public.brain_regia_proposals
  add constraint brain_regia_proposals_status_check
  check (status in ('PENDING','APPROVED','REJECTED','EXECUTING','EXECUTED','EXECUTION_FAILED'));

create table public.brain_missions (
  mission_id text not null,
  session_id uuid not null,
  source_proposal_id text not null,
  player_id uuid not null references public.players(id) on delete restrict,
  target_player_id uuid references public.players(id) on delete restrict,
  mission_type text not null,
  phase text not null,
  status text not null check (status = 'ACTIVE'),
  activated_at timestamptz not null default now(),
  primary key (session_id, mission_id),
  foreign key (session_id, source_proposal_id) references public.brain_regia_proposals(session_id, proposal_id) on delete restrict,
  check (btrim(mission_id) <> ''),
  check (btrim(source_proposal_id) <> ''),
  check (mission_type in ('OBSERVE_PLAYER','VERIFY_STATEMENT','GAIN_TRUST','SHARE_INFORMATION','WITHHOLD_INFORMATION','QUESTION_PLAYER','PROTECT_PLAYER','INFLUENCE_PLAYER','FORM_ALLIANCE','CHANGE_THEORY')),
  check (phase in ('SOCIAL_WARMUP','TRUST','INVESTIGATION','DOUBT','FINAL_THEORY')),
  check (player_id <> target_player_id)
);

create table public.brain_proposal_executions (
  execution_id text not null,
  session_id uuid not null,
  proposal_id text not null,
  action text not null check (action = 'ACTIVATE_MISSION'),
  status text not null check (status in ('EXECUTING','EXECUTED','EXECUTION_FAILED')),
  failure_reason text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (session_id, execution_id),
  unique (session_id, proposal_id),
  foreign key (session_id, proposal_id) references public.brain_regia_proposals(session_id, proposal_id) on delete restrict
);

alter table public.brain_missions enable row level security;
alter table public.brain_proposal_executions enable row level security;
revoke all on table public.brain_missions, public.brain_proposal_executions from public, anon, authenticated;

create or replace function private.broadcast_brain_mission_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('kind','brain_state_changed'), 'brain_state_changed', 'brain:' || new.session_id::text, true);
  return new;
end;
$$;
revoke all on function private.broadcast_brain_mission_changed() from public, anon, authenticated;
create trigger brain_missions_broadcast_state_change after insert on public.brain_missions
for each row execute function private.broadcast_brain_mission_changed();

create or replace function private.execute_approved_regia_proposal_impl(p_session_id uuid, p_proposal_id text)
returns table(ok boolean, proposal_id text, execution_id text, action text, reason text)
language plpgsql security definer set search_path = '' as $$
declare
  v_proposal public.brain_regia_proposals%rowtype;
  v_execution public.brain_proposal_executions%rowtype;
  v_mission jsonb;
  v_mission_id text;
  v_player_id uuid;
  v_target_id uuid;
  v_type text;
  v_phase text;
  v_db_phase text;
begin
  if auth.uid() is null or not exists (select 1 from public.staff_members s where s.auth_user_id=auth.uid() and s.active=true) then
    return query select false, p_proposal_id, null::text, null::text, 'UNAUTHORIZED'; return;
  end if;
  select r.* into v_proposal from public.brain_regia_proposals r where r.session_id=p_session_id and r.proposal_id=p_proposal_id for update;
  if not found then return query select false,p_proposal_id,null::text,null::text,'PROPOSAL_NOT_FOUND'; return; end if;
  select e.* into v_execution from public.brain_proposal_executions e where e.session_id=p_session_id and e.proposal_id=p_proposal_id;
  if found then
    if v_execution.status = 'EXECUTED' then return query select true,p_proposal_id,v_execution.execution_id,v_execution.action,null::text;
    else return query select false,p_proposal_id,v_execution.execution_id,v_execution.action,coalesce(v_execution.failure_reason,'PERSISTENCE_FAILURE'); return;
    end if;
    return;
  end if;
  if v_proposal.status <> 'APPROVED' then return query select false,p_proposal_id,null::text,null::text,case when v_proposal.status='EXECUTED' then 'ALREADY_EXECUTED' else 'PROPOSAL_NOT_APPROVED' end; return; end if;
  if v_proposal.control_mode <> 'SUGGEST' or v_proposal.command_type not in ('OBSERVE','CHECK_PLAYER','CHECK_TABLE','INCREASE_PARTICIPATION','DIVERSIFY_THEORIES','CREATE_TRUST_OPPORTUNITY','REDUCE_DIRECT_PRESSURE') then
    return query select false,p_proposal_id,null::text,null::text,'UNSUPPORTED_ACTION'; return;
  end if;
  v_mission := v_proposal.payload->'missionProposal';
  if v_mission is null or jsonb_typeof(v_mission) <> 'object' then return query select false,p_proposal_id,null::text,null::text,'MISSION_MISSING'; return; end if;
  v_mission_id := v_mission->>'missionId'; v_player_id := nullif(v_mission->>'playerId','')::uuid; v_target_id := nullif(v_mission->>'targetPlayerId','')::uuid; v_type := v_mission->>'type'; v_phase := v_mission->>'phase';
  if v_mission_id is null or v_type is null or v_phase is null or v_player_id is null then return query select false,p_proposal_id,null::text,null::text,'MISSION_INVALID'; return; end if;
  select g.narrative_phase into v_db_phase from public.games g where g.id=p_session_id;
  if not found then return query select false,p_proposal_id,null::text,null::text,'SESSION_MISMATCH'; return; end if;
  v_db_phase := case upper(v_db_phase)
    when 'BRIEFING' then 'SOCIAL_WARMUP'
    when 'DISCOVERY' then 'INVESTIGATION'
    when 'COMPARISON' then 'INVESTIGATION'
    when 'PRESSURE' then 'DOUBT'
    when 'DELIBERATION' then 'FINAL_THEORY'
    when 'FINAL_VOTE' then 'VOTING'
    else upper(v_db_phase)
  end;
  if v_db_phase <> v_phase or not (
    (v_type='OBSERVE_PLAYER' and v_phase in ('SOCIAL_WARMUP','TRUST','INVESTIGATION','DOUBT')) or
    (v_type='VERIFY_STATEMENT' and v_phase in ('INVESTIGATION','DOUBT')) or
    (v_type='GAIN_TRUST' and v_phase in ('TRUST','INVESTIGATION')) or
    (v_type='SHARE_INFORMATION' and v_phase in ('TRUST','INVESTIGATION','DOUBT','FINAL_THEORY')) or
    (v_type='WITHHOLD_INFORMATION' and v_phase in ('INVESTIGATION','DOUBT')) or
    (v_type='QUESTION_PLAYER' and v_phase in ('TRUST','INVESTIGATION','DOUBT')) or
    (v_type='PROTECT_PLAYER' and v_phase in ('TRUST','DOUBT')) or
    (v_type='INFLUENCE_PLAYER' and v_phase in ('DOUBT','FINAL_THEORY')) or
    (v_type='FORM_ALLIANCE' and v_phase in ('TRUST','DOUBT')) or
    (v_type='CHANGE_THEORY' and v_phase in ('DOUBT','FINAL_THEORY'))
  ) then return query select false,p_proposal_id,null::text,null::text,'PHASE_CHANGED'; return; end if;
  if not exists (select 1 from public.players p where p.id=v_player_id and p.game_id=p_session_id) then return query select false,p_proposal_id,null::text,null::text,'PLAYER_NOT_FOUND'; return; end if;
  if v_target_id is not null and not exists (select 1 from public.players p where p.id=v_target_id and p.game_id=p_session_id) then return query select false,p_proposal_id,null::text,null::text,'TARGET_NOT_FOUND'; return; end if;
  insert into public.brain_proposal_executions(execution_id,session_id,proposal_id,action,status) values ('execution:'||p_session_id::text||':'||p_proposal_id,p_session_id,p_proposal_id,'ACTIVATE_MISSION','EXECUTING') returning * into v_execution;
  insert into public.brain_missions(mission_id,session_id,source_proposal_id,player_id,target_player_id,mission_type,phase,status) values (v_mission_id,p_session_id,p_proposal_id,v_player_id,v_target_id,v_type,v_phase,'ACTIVE');
  update public.brain_regia_proposals as r set status='EXECUTED',updated_at=now() where r.session_id=p_session_id and r.proposal_id=p_proposal_id;
  update public.brain_proposal_executions as e set status='EXECUTED',finished_at=now() where e.session_id=p_session_id and e.execution_id=v_execution.execution_id;
  return query select true,p_proposal_id,v_execution.execution_id,'ACTIVATE_MISSION',null::text;
exception when others then
  if v_execution.execution_id is not null then
    update public.brain_proposal_executions as e set status='EXECUTION_FAILED',failure_reason='PERSISTENCE_FAILURE',finished_at=now() where e.session_id=p_session_id and e.execution_id=v_execution.execution_id;
    update public.brain_regia_proposals as r set status='EXECUTION_FAILED',updated_at=now() where r.session_id=p_session_id and r.proposal_id=p_proposal_id;
  end if;
  return query select false,p_proposal_id,coalesce(v_execution.execution_id,'execution:'||p_session_id::text||':'||p_proposal_id),'ACTIVATE_MISSION','PERSISTENCE_FAILURE';
end;
$$;
revoke all on function private.execute_approved_regia_proposal_impl(uuid,text) from public, anon, authenticated;
grant execute on function private.execute_approved_regia_proposal_impl(uuid,text) to authenticated;

create or replace function public.execute_approved_regia_proposal(session_id uuid, proposal_id text)
returns table(ok boolean, proposal_id text, execution_id text, action text, reason text)
language sql security invoker as $$ select * from private.execute_approved_regia_proposal_impl($1,$2); $$;
revoke execute on function public.execute_approved_regia_proposal(uuid,text) from public, anon, authenticated;
grant execute on function public.execute_approved_regia_proposal(uuid,text) to authenticated;

create or replace function private.load_my_active_missions_impl(p_session_id uuid)
returns table(mission_id text, session_id uuid, player_id uuid, target_player_id uuid, mission_type text, phase text, status text, activated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    select m.mission_id,m.session_id,m.player_id,m.target_player_id,m.mission_type,m.phase,m.status,m.activated_at
    from public.brain_missions m
    join public.players p on p.id=m.player_id
    where m.session_id=p_session_id and p.auth_user_id=auth.uid()
    order by m.activated_at,m.mission_id;
end;
$$;
revoke all on function private.load_my_active_missions_impl(uuid) from public, anon, authenticated;
grant execute on function private.load_my_active_missions_impl(uuid) to authenticated;
create or replace function public.load_my_active_missions(session_id uuid)
returns table(mission_id text, session_id uuid, player_id uuid, target_player_id uuid, mission_type text, phase text, status text, activated_at timestamptz)
language sql security invoker as $$ select * from private.load_my_active_missions_impl($1); $$;
revoke execute on function public.load_my_active_missions(uuid) from public, anon, authenticated;
grant execute on function public.load_my_active_missions(uuid) to authenticated;

create or replace function private.load_brain_missions_impl(p_session_id uuid)
returns table(mission_id text, session_id uuid, source_proposal_id text, player_id uuid, target_player_id uuid, mission_type text, phase text, status text, activated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_brain_staff(p_session_id);
  return query select m.mission_id,m.session_id,m.source_proposal_id,m.player_id,m.target_player_id,m.mission_type,m.phase,m.status,m.activated_at from public.brain_missions m where m.session_id=p_session_id order by m.activated_at,m.mission_id;
end;
$$;
revoke all on function private.load_brain_missions_impl(uuid) from public, anon, authenticated;
grant execute on function private.load_brain_missions_impl(uuid) to authenticated;
create or replace function public.load_brain_missions(session_id uuid)
returns table(mission_id text, session_id uuid, source_proposal_id text, player_id uuid, target_player_id uuid, mission_type text, phase text, status text, activated_at timestamptz)
language sql security invoker as $$ select * from private.load_brain_missions_impl($1); $$;
revoke execute on function public.load_brain_missions(uuid) from public, anon, authenticated;
grant execute on function public.load_brain_missions(uuid) to authenticated;
