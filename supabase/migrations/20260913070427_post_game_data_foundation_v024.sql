-- v0.24: the smallest server-owned history needed to hydrate post-game
-- analysis. It stores derived metrics only; Brain graphs, truth and prompts
-- remain in their existing sources (or are deliberately unavailable).

create table public.brain_snapshots (
  session_id uuid not null references public.games(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  phase text not null check (phase in ('lobby','role_reveal','briefing','discovery','comparison','pressure','deliberation','final_vote','reveal','social_warmup','trust','investigation','doubt','final_theory','voting','locked','results')),
  reason text not null check (reason in ('PHASE_ENTERED','DECISION_CHANGED','INTERVENTION_APPROVED','MISSION_ACTIVATED','MISSION_OUTCOME','FINAL_VOTE_LOCKED')),
  related_entity_id text,
  fingerprint text not null check (btrim(fingerprint) <> ''),
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  created_at timestamptz not null default now(),
  primary key (session_id, sequence),
  unique (session_id, fingerprint)
);

create index brain_snapshots_session_order_idx on public.brain_snapshots (session_id, sequence);
alter table public.brain_snapshots enable row level security;
revoke all on table public.brain_snapshots from public, anon, authenticated;

create or replace function private.validate_brain_snapshot_metrics(p_metrics jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  if p_metrics is null or jsonb_typeof(p_metrics) <> 'object' then raise exception 'SNAPSHOT_METRICS_INVALID' using errcode = 'P0001'; end if;
  for v_key in select jsonb_object_keys(p_metrics) loop
    if v_key not in ('liarExposure','roleExposure','suspicionCoverage','theoryDiversity','theoryShiftRate','trustCoverage','trustConcentration','participationBalance','tableMetrics') then
      raise exception 'SNAPSHOT_METRICS_INVALID' using errcode = 'P0001';
    end if;
  end loop;
end;
$$;
revoke all on function private.validate_brain_snapshot_metrics(jsonb) from public, anon, authenticated;

create or replace function private.append_brain_snapshot_impl(
  p_session_id uuid,
  p_reason text,
  p_phase text,
  p_related_entity_id text,
  p_fingerprint text,
  p_metrics jsonb
)
returns table(session_id uuid, sequence integer, phase text, reason text, related_entity_id text, fingerprint text, metrics jsonb, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.brain_snapshots%rowtype;
  v_sequence integer;
begin
  if auth.uid() is null or not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  if p_session_id is null or p_reason not in ('PHASE_ENTERED','DECISION_CHANGED','INTERVENTION_APPROVED','MISSION_ACTIVATED','MISSION_OUTCOME','FINAL_VOTE_LOCKED') or p_phase not in ('lobby','role_reveal','briefing','discovery','comparison','pressure','deliberation','final_vote','reveal','social_warmup','trust','investigation','doubt','final_theory','voting','locked','results') or btrim(coalesce(p_fingerprint,'')) = '' then raise exception 'SNAPSHOT_INVALID' using errcode = 'P0001'; end if;
  perform private.validate_brain_snapshot_metrics(p_metrics);
  perform 1 from public.games g where g.id = p_session_id for update;
  if not found then raise exception 'SESSION_NOT_FOUND' using errcode = 'P0001'; end if;
  select s.* into v_existing from public.brain_snapshots s where s.session_id = p_session_id and s.fingerprint = btrim(p_fingerprint);
  if found then
    if v_existing.phase <> p_phase or v_existing.reason <> p_reason or v_existing.related_entity_id is distinct from p_related_entity_id or v_existing.metrics is distinct from p_metrics then raise exception 'SNAPSHOT_ID_CONFLICT' using errcode = 'P0001'; end if;
    return query select v_existing.session_id,v_existing.sequence,v_existing.phase,v_existing.reason,v_existing.related_entity_id,v_existing.fingerprint,v_existing.metrics,v_existing.created_at;
    return;
  end if;
  v_sequence := coalesce((select max(s.sequence) from public.brain_snapshots s where s.session_id = p_session_id), 0) + 1;
  insert into public.brain_snapshots(session_id, sequence, phase, reason, related_entity_id, fingerprint, metrics)
  values (p_session_id, v_sequence, p_phase, p_reason, nullif(btrim(p_related_entity_id),''), btrim(p_fingerprint), p_metrics)
  returning brain_snapshots.session_id, brain_snapshots.sequence, brain_snapshots.phase, brain_snapshots.reason, brain_snapshots.related_entity_id, brain_snapshots.fingerprint, brain_snapshots.metrics, brain_snapshots.created_at
  into session_id, sequence, phase, reason, related_entity_id, fingerprint, metrics, created_at;
  return next;
end;
$$;
revoke all on function private.append_brain_snapshot_impl(uuid,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function private.append_brain_snapshot_impl(uuid,text,text,text,text,jsonb) to authenticated;

create or replace function public.append_brain_snapshot(session_id uuid, reason text, phase text, related_entity_id text, fingerprint text, metrics jsonb)
returns table(session_id uuid, sequence integer, phase text, reason text, related_entity_id text, fingerprint text, metrics jsonb, created_at timestamptz)
language sql security invoker as $$ select * from private.append_brain_snapshot_impl($1,$2,$3,$4,$5,$6); $$;
revoke execute on function public.append_brain_snapshot(uuid,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.append_brain_snapshot(uuid,text,text,text,text,jsonb) to authenticated;

create or replace function private.load_brain_snapshots_impl(p_session_id uuid)
returns table(session_id uuid, sequence integer, phase text, reason text, related_entity_id text, fingerprint text, metrics jsonb, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true) then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  return query select s.session_id,s.sequence,s.phase,s.reason,s.related_entity_id,s.fingerprint,s.metrics,s.created_at from public.brain_snapshots s where s.session_id = p_session_id order by s.sequence;
end;
$$;
revoke all on function private.load_brain_snapshots_impl(uuid) from public, anon, authenticated;
grant execute on function private.load_brain_snapshots_impl(uuid) to authenticated;

create or replace function public.load_brain_snapshots(session_id uuid)
returns table(session_id uuid, sequence integer, phase text, reason text, related_entity_id text, fingerprint text, metrics jsonb, created_at timestamptz)
language sql security invoker as $$ select * from private.load_brain_snapshots_impl($1); $$;
revoke execute on function public.load_brain_snapshots(uuid) from public, anon, authenticated;
grant execute on function public.load_brain_snapshots(uuid) to authenticated;

-- A phase command is a server-owned meaningful trigger. The empty metric
-- object is intentional when no Brain evaluation has yet supplied a snapshot.
create or replace function private.capture_brain_phase_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.brain_snapshots(session_id, sequence, phase, reason, related_entity_id, fingerprint, metrics)
  values (new.game_id, coalesce((select max(s.sequence) from public.brain_snapshots s where s.session_id = new.game_id), 0) + 1, new.to_phase, 'PHASE_ENTERED', new.command_id::text, 'phase:' || new.command_id::text, '{}'::jsonb)
  on conflict (session_id, fingerprint) do nothing;
  return new;
end;
$$;
revoke all on function private.capture_brain_phase_snapshot() from public, anon, authenticated;
create trigger game_phase_commands_brain_snapshot after insert on public.game_narrative_phase_commands
for each row execute function private.capture_brain_phase_snapshot();
