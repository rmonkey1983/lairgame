create or replace function private.get_my_player_state_impl(p_game_code text)
returns table (
  game_id uuid,
  lifecycle text,
  narrative_phase text,
  nickname text,
  table_number integer,
  seat_number integer,
  role text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'AUTH_ANONYMOUS_REQUIRED' using errcode = 'P0001';
  end if;

  select g.id into v_game_id
    from public.games g
   where upper(btrim(g.code)) = upper(btrim(coalesce(p_game_code, '')));
  if not found then
    raise exception 'GAME_NOT_FOUND' using errcode = 'P0001';
  end if;

  return query
  select g.id,
         g.lifecycle,
         g.narrative_phase,
         p.nickname,
         gt.table_number,
         p.seat_number,
         case when g.narrative_phase = 'lobby' then null
              when r.role in ('liar', 'accomplice', 'investigator') then r.role
              when r.role = 'scapegoat' then 'investigator'
              else null end
    from public.players p
    join public.games g on g.id = p.game_id
    join public.game_tables gt on gt.id = p.table_id and gt.game_id = p.game_id
    left join public.game_role_assignments r on r.player_id = p.id and r.game_id = p.game_id
   where p.auth_user_id = auth.uid()
     and p.game_id = v_game_id;
end;
$$;

revoke all on function private.get_my_player_state_impl(text) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.get_my_player_state_impl(text) to authenticated;

create or replace function public.get_my_player_state(game_code text)
returns table (
  game_id uuid,
  lifecycle text,
  narrative_phase text,
  nickname text,
  table_number integer,
  seat_number integer,
  role text
)
language sql
security invoker
as $$
  select * from private.get_my_player_state_impl($1);
$$;

revoke execute on function public.get_my_player_state(text) from public, anon, authenticated;
grant execute on function public.get_my_player_state(text) to authenticated;
