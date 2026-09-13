-- v0.22: Staff-only runtime projection for deterministic Brain metrics.
-- This is read-only measurement data; it does not feed decisions.
create or replace function private.load_brain_mission_outcome_metrics_impl(p_session_id uuid)
returns table(
  mission_id text,
  mission_type text,
  player_id uuid,
  table_id uuid,
  status text,
  acknowledged_at timestamptz,
  activated_at timestamptz,
  outcome_at timestamptz,
  regia_proposal_id text,
  director_proposal_id text
)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true) then
    raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001';
  end if;
  return query
    select m.mission_id, m.mission_type, m.player_id, p.table_id, m.status, m.acknowledged_at, m.activated_at, m.outcome_at, m.source_proposal_id, r.source_proposal_id
    from public.brain_missions m
    join public.players p on p.id = m.player_id
    left join public.brain_regia_proposals r on r.session_id = m.session_id and r.proposal_id = m.source_proposal_id
    where m.session_id = p_session_id
    order by m.activated_at, m.mission_id;
end;
$$;
revoke all on function private.load_brain_mission_outcome_metrics_impl(uuid) from public, anon, authenticated;
grant execute on function private.load_brain_mission_outcome_metrics_impl(uuid) to authenticated;
create or replace function public.load_brain_mission_outcome_metrics(session_id uuid)
returns table(mission_id text, mission_type text, player_id uuid, table_id uuid, status text, acknowledged_at timestamptz, activated_at timestamptz, outcome_at timestamptz, regia_proposal_id text, director_proposal_id text)
language sql security invoker as $$ select * from private.load_brain_mission_outcome_metrics_impl($1); $$;
revoke execute on function public.load_brain_mission_outcome_metrics(uuid) from public, anon, authenticated;
grant execute on function public.load_brain_mission_outcome_metrics(uuid) to authenticated;
