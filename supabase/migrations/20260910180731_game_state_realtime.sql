-- Private, server-originated wake-up for authoritative game state changes.

create or replace function private.broadcast_game_state_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('kind', 'game_state_changed'),
    'game_state_changed',
    'game:' || new.id::text,
    true
  );
  return new;
end;
$$;

revoke all on function private.broadcast_game_state_changed() from public, anon, authenticated;

create trigger games_broadcast_state_change
after update of lifecycle, narrative_phase on public.games
for each row
when (
  old.lifecycle is distinct from new.lifecycle
  or old.narrative_phase is distinct from new.narrative_phase
)
execute function private.broadcast_game_state_changed();

create or replace function private.can_receive_game_state_topic()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_topic text := realtime.topic();
  v_game_id uuid;
begin
  if v_topic !~ '^game:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;

  v_game_id := substring(v_topic from 6)::uuid;

  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false
     and exists (
       select 1
       from public.staff_members s
       where s.auth_user_id = auth.uid()
         and s.active = true
     ) then
    return true;
  end if;

  return exists (
    select 1
    from public.players p
    where p.auth_user_id = auth.uid()
      and p.game_id = v_game_id
  );
end;
$$;

revoke all on function private.can_receive_game_state_topic() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_receive_game_state_topic() to authenticated;

create policy "authenticated can receive game state broadcasts"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and private.can_receive_game_state_topic()
);
