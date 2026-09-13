-- M23: persist the current Brain context without making the domain depend on Supabase.
-- In this schema a Game is the durable session boundary, so session_id maps to games.id.

create table public.brain_events (
  event_id text not null,
  session_id uuid not null references public.games(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  event_type text not null check (event_type in ('TRUST_SELECTED','TRUST_CHANGED','SUSPICION_SELECTED','SUSPICION_TARGET_CHANGED','SUSPICION_CONFIDENCE_CHANGED','PHASE_ENTERED')),
  phase text not null check (phase in ('lobby','social_warmup','role_reveal','trust','investigation','doubt','final_theory','voting','locked','reveal','results')),
  actor_player_id uuid,
  target_player_id uuid,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  primary key (session_id, event_id),
  unique (session_id, sequence),
  check (btrim(event_id) <> ''),
  check (actor_player_id is null or actor_player_id <> target_player_id)
);

create index brain_events_session_sequence_idx on public.brain_events (session_id, sequence);

create table public.brain_trust_state (
  session_id uuid not null references public.games(id) on delete restrict,
  source_player_id uuid not null,
  target_player_id uuid not null,
  level text not null check (level in ('LOW','MEDIUM','HIGH')),
  phase text not null check (phase in ('lobby','social_warmup','role_reveal','trust','investigation','doubt','final_theory','voting','locked','reveal','results')),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (session_id, source_player_id, target_player_id),
  check (source_player_id <> target_player_id)
);

create table public.brain_suspicion_state (
  session_id uuid not null references public.games(id) on delete restrict,
  source_player_id uuid not null,
  target_player_id uuid not null,
  confidence text not null check (confidence in ('LOW','MEDIUM','HIGH')),
  phase text not null check (phase in ('lobby','social_warmup','role_reveal','trust','investigation','doubt','final_theory','voting','locked','reveal','results')),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (session_id, source_player_id)
);

create table public.brain_regia_proposals (
  proposal_id text not null,
  session_id uuid not null references public.games(id) on delete restrict,
  source_proposal_id text,
  control_mode text not null check (control_mode in ('AUTO','SUGGEST','MANUAL')),
  status text not null check (status in ('PENDING','APPROVED','REJECTED')),
  command_type text not null check (command_type in (
    'OBSERVE','CHECK_PLAYER','CHECK_TABLE','INCREASE_PARTICIPATION','DIVERSIFY_THEORIES','CREATE_TRUST_OPPORTUNITY','REDUCE_DIRECT_PRESSURE',
    'START_PHASE','ADVANCE_PHASE','OPEN_VOTING','CLOSE_VOTING','LOCK_GAME','START_REVEAL','PAUSE_GAME','STOP_GAME',
    'CHANGE_SCENARIO_TRUTH','REASSIGN_LIAR_AFTER_START','REASSIGN_ACCOMPLICE_AFTER_START','REASSIGN_SCAPEGOAT_AFTER_START','BYPASS_MISSION_VALIDATOR'
  )),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, proposal_id),
  check (btrim(proposal_id) <> ''),
  check (command_type not in ('CHANGE_SCENARIO_TRUTH','REASSIGN_LIAR_AFTER_START','REASSIGN_ACCOMPLICE_AFTER_START','REASSIGN_SCAPEGOAT_AFTER_START','BYPASS_MISSION_VALIDATOR')),
  check ((command_type in ('OBSERVE','CHECK_PLAYER','CHECK_TABLE','INCREASE_PARTICIPATION','DIVERSIFY_THEORIES','CREATE_TRUST_OPPORTUNITY','REDUCE_DIRECT_PRESSURE') and control_mode in ('AUTO','SUGGEST')) or (command_type in ('START_PHASE','ADVANCE_PHASE','OPEN_VOTING','CLOSE_VOTING','LOCK_GAME','START_REVEAL','PAUSE_GAME','STOP_GAME') and control_mode = 'MANUAL'))
);

alter table public.brain_events enable row level security;
alter table public.brain_trust_state enable row level security;
alter table public.brain_suspicion_state enable row level security;
alter table public.brain_regia_proposals enable row level security;
revoke all on table public.brain_events, public.brain_trust_state, public.brain_suspicion_state, public.brain_regia_proposals from public, anon, authenticated;

create or replace function private.brain_require_actor(p_session_id uuid, p_player_id uuid, p_allow_staff boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_allow_staff and exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true) then return; end if;
  if p_player_id is null or not exists (select 1 from public.players p where p.id = p_player_id and p.game_id = p_session_id and p.auth_user_id = auth.uid()) then
    raise exception 'PLAYER_AUTH_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.brain_require_actor(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function private.append_brain_event_impl(
  p_session_id uuid, p_event_id text, p_event_type text, p_phase text,
  p_actor_player_id uuid, p_target_player_id uuid, p_payload jsonb
)
returns table(event_id text, session_id uuid, sequence integer, event_type text, phase text, actor_player_id uuid, target_player_id uuid, payload jsonb, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.brain_events%rowtype;
  v_sequence integer;
  v_staff boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_session_id is null or btrim(coalesce(p_event_id, '')) = '' then raise exception 'INVALID_EVENT' using errcode = 'P0001'; end if;
  if p_event_type not in ('TRUST_SELECTED','TRUST_CHANGED','SUSPICION_SELECTED','SUSPICION_TARGET_CHANGED','SUSPICION_CONFIDENCE_CHANGED','PHASE_ENTERED') then raise exception 'EVENT_TYPE_INVALID' using errcode = 'P0001'; end if;
  if p_phase not in ('lobby','social_warmup','role_reveal','trust','investigation','doubt','final_theory','voting','locked','reveal','results') then raise exception 'PHASE_INVALID' using errcode = 'P0001'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'PAYLOAD_INVALID' using errcode = 'P0001'; end if;
  perform 1 from public.games g where g.id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode = 'P0001'; end if;
  v_staff := exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true);
  if p_event_type = 'PHASE_ENTERED' and not v_staff then raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if p_event_type <> 'PHASE_ENTERED' then perform private.brain_require_actor(p_session_id, p_actor_player_id, true); end if;
  if p_actor_player_id is not null and not exists (select 1 from public.players p where p.id = p_actor_player_id and p.game_id = p_session_id) then raise exception 'ACTOR_PLAYER_INVALID' using errcode = 'P0001'; end if;
  if p_target_player_id is not null and not exists (select 1 from public.players p where p.id = p_target_player_id and p.game_id = p_session_id) then raise exception 'TARGET_PLAYER_INVALID' using errcode = 'P0001'; end if;
  if p_actor_player_id is not null and p_actor_player_id = p_target_player_id then raise exception 'ACTOR_TARGET_INVALID' using errcode = 'P0001'; end if;
  select e.* into v_existing from public.brain_events e where e.session_id = p_session_id and e.event_id = btrim(p_event_id);
  if found then
    if v_existing.event_type <> p_event_type or v_existing.phase <> p_phase or v_existing.actor_player_id is distinct from p_actor_player_id or v_existing.target_player_id is distinct from p_target_player_id or v_existing.payload is distinct from p_payload then raise exception 'EVENT_ID_CONFLICT' using errcode = 'P0001'; end if;
    return query select v_existing.event_id,v_existing.session_id,v_existing.sequence,v_existing.event_type,v_existing.phase,v_existing.actor_player_id,v_existing.target_player_id,v_existing.payload,v_existing.created_at;
    return;
  end if;
  v_sequence := coalesce((select max(e.sequence) from public.brain_events e where e.session_id = p_session_id), 0) + 1;
  insert into public.brain_events(event_id,session_id,sequence,event_type,phase,actor_player_id,target_player_id,payload)
  values (btrim(p_event_id),p_session_id,v_sequence,p_event_type,p_phase,p_actor_player_id,p_target_player_id,p_payload)
  returning brain_events.event_id,brain_events.session_id,brain_events.sequence,brain_events.event_type,brain_events.phase,brain_events.actor_player_id,brain_events.target_player_id,brain_events.payload,brain_events.created_at
  into event_id,session_id,sequence,event_type,phase,actor_player_id,target_player_id,payload,created_at;
  return next;
end;
$$;
revoke all on function private.append_brain_event_impl(uuid,text,text,text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function private.append_brain_event_impl(uuid,text,text,text,uuid,uuid,jsonb) to authenticated;

create or replace function public.append_brain_event(session_id uuid, event_id text, event_type text, phase text, actor_player_id uuid, target_player_id uuid, payload jsonb)
returns table(event_id text, session_id uuid, sequence integer, event_type text, phase text, actor_player_id uuid, target_player_id uuid, payload jsonb, created_at timestamptz)
language sql security invoker as $$ select * from private.append_brain_event_impl($1,$2,$3,$4,$5,$6,$7); $$;
revoke execute on function public.append_brain_event(uuid,text,text,text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.append_brain_event(uuid,text,text,text,uuid,uuid,jsonb) to authenticated;

create or replace function private.set_brain_trust_impl(p_session_id uuid, p_source_player_id uuid, p_target_player_id uuid, p_level text, p_phase text)
returns table(session_id uuid, source_player_id uuid, target_player_id uuid, level text, phase text, active boolean)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.brain_require_actor(p_session_id, p_source_player_id, true);
  if p_target_player_id is null or p_source_player_id = p_target_player_id then raise exception 'TARGET_PLAYER_INVALID' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.players p where p.id = p_target_player_id and p.game_id = p_session_id) then raise exception 'TARGET_PLAYER_INVALID' using errcode = 'P0001'; end if;
  if p_level not in ('LOW','MEDIUM','HIGH') then raise exception 'TRUST_LEVEL_INVALID' using errcode = 'P0001'; end if;
  if p_phase not in ('lobby','social_warmup','role_reveal','trust','investigation','doubt','final_theory','voting','locked','reveal','results') then raise exception 'PHASE_INVALID' using errcode = 'P0001'; end if;
  insert into public.brain_trust_state(session_id,source_player_id,target_player_id,level,phase,active)
  values (p_session_id,p_source_player_id,p_target_player_id,p_level,p_phase,true)
  on conflict on constraint brain_trust_state_pkey do update set level=excluded.level,phase=excluded.phase,active=true,updated_at=now();
  return query select t.session_id,t.source_player_id,t.target_player_id,t.level,t.phase,t.active from public.brain_trust_state t where t.session_id=p_session_id and t.source_player_id=p_source_player_id and t.target_player_id=p_target_player_id;
end;
$$;
revoke all on function private.set_brain_trust_impl(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function private.set_brain_trust_impl(uuid,uuid,uuid,text,text) to authenticated;
create or replace function public.set_brain_trust(session_id uuid, source_player_id uuid, target_player_id uuid, level text, phase text)
returns table(session_id uuid, source_player_id uuid, target_player_id uuid, level text, phase text, active boolean)
language sql security invoker as $$ select * from private.set_brain_trust_impl($1,$2,$3,$4,$5); $$;
revoke execute on function public.set_brain_trust(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.set_brain_trust(uuid,uuid,uuid,text,text) to authenticated;

create or replace function private.set_brain_suspicion_impl(p_session_id uuid, p_source_player_id uuid, p_target_player_id uuid, p_confidence text, p_phase text)
returns table(session_id uuid, source_player_id uuid, target_player_id uuid, confidence text, phase text, active boolean)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.brain_require_actor(p_session_id, p_source_player_id, true);
  if p_target_player_id is null or p_source_player_id = p_target_player_id then raise exception 'TARGET_PLAYER_INVALID' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.players p where p.id = p_target_player_id and p.game_id = p_session_id) then raise exception 'TARGET_PLAYER_INVALID' using errcode = 'P0001'; end if;
  if p_confidence not in ('LOW','MEDIUM','HIGH') then raise exception 'SUSPICION_CONFIDENCE_INVALID' using errcode = 'P0001'; end if;
  if p_phase not in ('lobby','social_warmup','role_reveal','trust','investigation','doubt','final_theory','voting','locked','reveal','results') then raise exception 'PHASE_INVALID' using errcode = 'P0001'; end if;
  insert into public.brain_suspicion_state(session_id,source_player_id,target_player_id,confidence,phase,active)
  values (p_session_id,p_source_player_id,p_target_player_id,p_confidence,p_phase,true)
  on conflict on constraint brain_suspicion_state_pkey do update set target_player_id=excluded.target_player_id,confidence=excluded.confidence,phase=excluded.phase,active=true,updated_at=now();
  return query select s.session_id,s.source_player_id,s.target_player_id,s.confidence,s.phase,s.active from public.brain_suspicion_state s where s.session_id=p_session_id and s.source_player_id=p_source_player_id;
end;
$$;
revoke all on function private.set_brain_suspicion_impl(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function private.set_brain_suspicion_impl(uuid,uuid,uuid,text,text) to authenticated;
create or replace function public.set_brain_suspicion(session_id uuid, source_player_id uuid, target_player_id uuid, confidence text, phase text)
returns table(session_id uuid, source_player_id uuid, target_player_id uuid, confidence text, phase text, active boolean)
language sql security invoker as $$ select * from private.set_brain_suspicion_impl($1,$2,$3,$4,$5); $$;
revoke execute on function public.set_brain_suspicion(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.set_brain_suspicion(uuid,uuid,uuid,text,text) to authenticated;

create or replace function private.save_brain_regia_proposal_impl(p_session_id uuid, p_proposal_id text, p_source_proposal_id text, p_control_mode text, p_status text, p_command_type text, p_payload jsonb)
returns table(proposal_id text, session_id uuid, source_proposal_id text, control_mode text, status text, command_type text, payload jsonb, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_existing public.brain_regia_proposals%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from public.staff_members s where s.auth_user_id=auth.uid() and s.active=true) then raise exception 'STAFF_ACCESS_DENIED' using errcode='P0001'; end if;
  if p_session_id is null or btrim(coalesce(p_proposal_id,''))='' or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'PROPOSAL_INVALID' using errcode='P0001'; end if;
  select r.* into v_existing from public.brain_regia_proposals r where r.session_id=p_session_id and r.proposal_id=btrim(p_proposal_id);
  if found then
    if v_existing.source_proposal_id is distinct from p_source_proposal_id or v_existing.control_mode<>p_control_mode or v_existing.status<>p_status or v_existing.command_type<>p_command_type or v_existing.payload is distinct from p_payload then raise exception 'PROPOSAL_ID_CONFLICT' using errcode='P0001'; end if;
    return query select v_existing.proposal_id,v_existing.session_id,v_existing.source_proposal_id,v_existing.control_mode,v_existing.status,v_existing.command_type,v_existing.payload,v_existing.created_at,v_existing.updated_at; return;
  end if;
  if p_command_type in ('CHANGE_SCENARIO_TRUTH','REASSIGN_LIAR_AFTER_START','REASSIGN_ACCOMPLICE_AFTER_START','REASSIGN_SCAPEGOAT_AFTER_START','BYPASS_MISSION_VALIDATOR') then raise exception 'FORBIDDEN_COMMAND' using errcode='P0001'; end if;
  insert into public.brain_regia_proposals(proposal_id,session_id,source_proposal_id,control_mode,status,command_type,payload)
  values (btrim(p_proposal_id),p_session_id,p_source_proposal_id,p_control_mode,p_status,p_command_type,p_payload)
  returning brain_regia_proposals.proposal_id,brain_regia_proposals.session_id,brain_regia_proposals.source_proposal_id,brain_regia_proposals.control_mode,brain_regia_proposals.status,brain_regia_proposals.command_type,brain_regia_proposals.payload,brain_regia_proposals.created_at,brain_regia_proposals.updated_at into proposal_id,session_id,source_proposal_id,control_mode,status,command_type,payload,created_at,updated_at;
  return next;
end;
$$;
revoke all on function private.save_brain_regia_proposal_impl(uuid,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function private.save_brain_regia_proposal_impl(uuid,text,text,text,text,text,jsonb) to authenticated;
create or replace function public.save_brain_regia_proposal(session_id uuid, proposal_id text, source_proposal_id text, control_mode text, status text, command_type text, payload jsonb)
returns table(proposal_id text, session_id uuid, source_proposal_id text, control_mode text, status text, command_type text, payload jsonb, created_at timestamptz, updated_at timestamptz)
language sql security invoker as $$ select * from private.save_brain_regia_proposal_impl($1,$2,$3,$4,$5,$6,$7); $$;
revoke execute on function public.save_brain_regia_proposal(uuid,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_brain_regia_proposal(uuid,text,text,text,text,text,jsonb) to authenticated;

create or replace function private.change_brain_regia_proposal_status_impl(p_session_id uuid, p_proposal_id text, p_status text)
returns table(proposal_id text, session_id uuid, source_proposal_id text, control_mode text, status text, command_type text, payload jsonb, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_row public.brain_regia_proposals%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from public.staff_members s where s.auth_user_id=auth.uid() and s.active=true) then raise exception 'STAFF_ACCESS_DENIED' using errcode='P0001'; end if;
  select r.* into v_row from public.brain_regia_proposals r where r.session_id=p_session_id and r.proposal_id=p_proposal_id for update;
  if not found then raise exception 'PROPOSAL_NOT_FOUND' using errcode='P0001'; end if;
  if v_row.status <> 'PENDING' then raise exception 'PROPOSAL_NOT_PENDING' using errcode='P0001'; end if;
  if p_status not in ('APPROVED','REJECTED') then raise exception 'PROPOSAL_STATUS_INVALID' using errcode='P0001'; end if;
  update public.brain_regia_proposals as r set status=p_status,updated_at=now() where r.session_id=p_session_id and r.proposal_id=p_proposal_id returning r.proposal_id,r.session_id,r.source_proposal_id,r.control_mode,r.status,r.command_type,r.payload,r.created_at,r.updated_at into proposal_id,session_id,source_proposal_id,control_mode,status,command_type,payload,created_at,updated_at;
  return next;
end;
$$;
revoke all on function private.change_brain_regia_proposal_status_impl(uuid,text,text) from public, anon, authenticated;
grant execute on function private.change_brain_regia_proposal_status_impl(uuid,text,text) to authenticated;
create or replace function public.approve_brain_regia_proposal(session_id uuid, proposal_id text)
returns table(proposal_id text, session_id uuid, source_proposal_id text, control_mode text, status text, command_type text, payload jsonb, created_at timestamptz, updated_at timestamptz)
language sql security invoker as $$ select * from private.change_brain_regia_proposal_status_impl($1,$2,'APPROVED'); $$;
create or replace function public.reject_brain_regia_proposal(session_id uuid, proposal_id text)
returns table(proposal_id text, session_id uuid, source_proposal_id text, control_mode text, status text, command_type text, payload jsonb, created_at timestamptz, updated_at timestamptz)
language sql security invoker as $$ select * from private.change_brain_regia_proposal_status_impl($1,$2,'REJECTED'); $$;
revoke execute on function public.approve_brain_regia_proposal(uuid,text), public.reject_brain_regia_proposal(uuid,text) from public, anon, authenticated;
grant execute on function public.approve_brain_regia_proposal(uuid,text), public.reject_brain_regia_proposal(uuid,text) to authenticated;

-- Reads stay behind the same staff gate; persistence tables are never exposed
-- through direct SELECT privileges.
create or replace function private.require_brain_staff(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.staff_members s where s.auth_user_id=auth.uid() and s.active=true) then raise exception 'STAFF_ACCESS_DENIED' using errcode='P0001'; end if;
  if not exists (select 1 from public.games g where g.id=p_session_id) then raise exception 'SESSION_NOT_FOUND' using errcode='P0001'; end if;
end;
$$;
revoke all on function private.require_brain_staff(uuid) from public, anon, authenticated;

create or replace function private.load_brain_events_impl(p_session_id uuid)
returns table(event_id text, session_id uuid, sequence integer, event_type text, phase text, actor_player_id uuid, target_player_id uuid, payload jsonb, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_brain_staff(p_session_id);
  return query select e.event_id,e.session_id,e.sequence,e.event_type,e.phase,e.actor_player_id,e.target_player_id,e.payload,e.created_at from public.brain_events e where e.session_id=p_session_id order by e.sequence;
end;
$$;
revoke all on function private.load_brain_events_impl(uuid) from public, anon, authenticated;
grant execute on function private.load_brain_events_impl(uuid) to authenticated;
create or replace function public.load_brain_events(session_id uuid)
returns table(event_id text, session_id uuid, sequence integer, event_type text, phase text, actor_player_id uuid, target_player_id uuid, payload jsonb, created_at timestamptz)
language sql security invoker as $$ select * from private.load_brain_events_impl($1); $$;
revoke execute on function public.load_brain_events(uuid) from public, anon, authenticated;
grant execute on function public.load_brain_events(uuid) to authenticated;

create or replace function private.load_brain_trust_state_impl(p_session_id uuid)
returns table(session_id uuid, source_player_id uuid, target_player_id uuid, level text, phase text, active boolean)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_brain_staff(p_session_id);
  return query select t.session_id,t.source_player_id,t.target_player_id,t.level,t.phase,t.active from public.brain_trust_state t where t.session_id=p_session_id order by t.source_player_id,t.target_player_id;
end;
$$;
revoke all on function private.load_brain_trust_state_impl(uuid) from public, anon, authenticated;
grant execute on function private.load_brain_trust_state_impl(uuid) to authenticated;
create or replace function public.load_brain_trust_state(session_id uuid)
returns table(session_id uuid, source_player_id uuid, target_player_id uuid, level text, phase text, active boolean)
language sql security invoker as $$ select * from private.load_brain_trust_state_impl($1); $$;
revoke execute on function public.load_brain_trust_state(uuid) from public, anon, authenticated;
grant execute on function public.load_brain_trust_state(uuid) to authenticated;

create or replace function private.load_brain_suspicion_state_impl(p_session_id uuid)
returns table(session_id uuid, source_player_id uuid, target_player_id uuid, confidence text, phase text, active boolean)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_brain_staff(p_session_id);
  return query select s.session_id,s.source_player_id,s.target_player_id,s.confidence,s.phase,s.active from public.brain_suspicion_state s where s.session_id=p_session_id order by s.source_player_id;
end;
$$;
revoke all on function private.load_brain_suspicion_state_impl(uuid) from public, anon, authenticated;
grant execute on function private.load_brain_suspicion_state_impl(uuid) to authenticated;
create or replace function public.load_brain_suspicion_state(session_id uuid)
returns table(session_id uuid, source_player_id uuid, target_player_id uuid, confidence text, phase text, active boolean)
language sql security invoker as $$ select * from private.load_brain_suspicion_state_impl($1); $$;
revoke execute on function public.load_brain_suspicion_state(uuid) from public, anon, authenticated;
grant execute on function public.load_brain_suspicion_state(uuid) to authenticated;

create or replace function private.load_brain_regia_proposals_impl(p_session_id uuid)
returns table(proposal_id text, session_id uuid, source_proposal_id text, control_mode text, status text, command_type text, payload jsonb, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_brain_staff(p_session_id);
  return query select r.proposal_id,r.session_id,r.source_proposal_id,r.control_mode,r.status,r.command_type,r.payload,r.created_at,r.updated_at from public.brain_regia_proposals r where r.session_id=p_session_id order by r.created_at,r.proposal_id;
end;
$$;
revoke all on function private.load_brain_regia_proposals_impl(uuid) from public, anon, authenticated;
grant execute on function private.load_brain_regia_proposals_impl(uuid) to authenticated;
create or replace function public.load_brain_regia_proposals(session_id uuid)
returns table(proposal_id text, session_id uuid, source_proposal_id text, control_mode text, status text, command_type text, payload jsonb, created_at timestamptz, updated_at timestamptz)
language sql security invoker as $$ select * from private.load_brain_regia_proposals_impl($1); $$;
revoke execute on function public.load_brain_regia_proposals(uuid) from public, anon, authenticated;
grant execute on function public.load_brain_regia_proposals(uuid) to authenticated;
