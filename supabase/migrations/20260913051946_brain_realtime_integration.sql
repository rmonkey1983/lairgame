-- Brain persistence wake-ups are private, server-originated Broadcasts.
-- The payload intentionally contains no state; the bridge always reloads RPC snapshots.

create or replace function private.broadcast_brain_state_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('kind', 'brain_state_changed'),
    'brain_state_changed',
    'brain:' || coalesce(new.session_id, old.session_id)::text,
    true
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.broadcast_brain_state_changed() from public, anon, authenticated;

create trigger brain_events_broadcast_state_change
after insert on public.brain_events
for each row execute function private.broadcast_brain_state_changed();

create trigger brain_trust_broadcast_state_change
after insert or update on public.brain_trust_state
for each row execute function private.broadcast_brain_state_changed();

create trigger brain_suspicion_broadcast_state_change
after insert or update on public.brain_suspicion_state
for each row execute function private.broadcast_brain_state_changed();

create trigger brain_regia_broadcast_state_change
after insert or update of status on public.brain_regia_proposals
for each row execute function private.broadcast_brain_state_changed();

create or replace function private.can_receive_brain_topic()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic text := realtime.topic();
  v_session_id uuid;
begin
  if v_topic !~ '^brain:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;

  v_session_id := substring(v_topic from 7)::uuid;
  return coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false
    and exists (
      select 1
      from public.staff_members s
      where s.auth_user_id = auth.uid()
        and s.active = true
    )
    and exists (select 1 from public.games g where g.id = v_session_id);
end;
$$;

revoke all on function private.can_receive_brain_topic() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_receive_brain_topic() to authenticated;

create policy "active staff can receive brain broadcasts"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and private.can_receive_brain_topic()
);
