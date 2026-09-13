-- v0.20: deliver already-active Brain missions through the existing Player
-- runtime. The database remains authoritative; Broadcast only wakes clients.

create or replace function private.broadcast_player_mission_state_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('kind', 'mission_state_changed'),
    'mission_state_changed',
    'game:' || new.session_id::text,
    true
  );
  return new;
end;
$$;

revoke all on function private.broadcast_player_mission_state_changed() from public, anon, authenticated;

create trigger brain_missions_player_state_change
after insert on public.brain_missions
for each row execute function private.broadcast_player_mission_state_changed();

create or replace function private.load_my_player_missions_impl(p_game_code text)
returns table(
  mission_id text,
  mission_type text,
  target_player_id uuid,
  phase text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'AUTH_ANONYMOUS_REQUIRED';
  end if;

  select g.id into v_game_id
  from public.games g
  where upper(g.code) = upper(btrim(p_game_code));

  if v_game_id is null then
    raise exception 'GAME_NOT_FOUND';
  end if;

  return query
    select m.mission_id, m.mission_type, m.target_player_id, m.phase, m.status
    from public.brain_missions m
    join public.players p on p.id = m.player_id
    where m.session_id = v_game_id
      and p.game_id = v_game_id
      and p.auth_user_id = auth.uid()
      and m.status = 'ACTIVE'
    order by m.activated_at asc, m.mission_id asc;
end;
$$;

revoke all on function private.load_my_player_missions_impl(text) from public, anon, authenticated;
grant execute on function private.load_my_player_missions_impl(text) to authenticated;

create or replace function public.load_my_player_missions(game_code text)
returns table(
  mission_id text,
  mission_type text,
  target_player_id uuid,
  phase text,
  status text
)
language sql
security invoker
as $$ select * from private.load_my_player_missions_impl($1); $$;

revoke execute on function public.load_my_player_missions(text) from public, anon, authenticated;
grant execute on function public.load_my_player_missions(text) to authenticated;
