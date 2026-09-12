create or replace function private.transition_game_lifecycle_impl(
  p_game_code text, p_expected_lifecycle text, p_target_lifecycle text, p_command_id uuid
)
returns table (game_id uuid, game_code text, previous_lifecycle text, lifecycle text, command_id uuid, changed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_game public.games%rowtype;
  v_staff_id uuid;
  v_audit public.game_lifecycle_commands%rowtype;
  v_code text := upper(btrim(coalesce(p_game_code, '')));
  v_expected text := lower(btrim(coalesce(p_expected_lifecycle, '')));
  v_target text := lower(btrim(coalesce(p_target_lifecycle, '')));
  v_changed_at timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then raise exception 'STAFF_AUTH_REQUIRED' using errcode = 'P0001'; end if;
  select s.id into v_staff_id from public.staff_members s where s.auth_user_id = auth.uid() and s.active = true;
  if not found then raise exception 'STAFF_ACCESS_DENIED' using errcode = 'P0001'; end if;
  if p_command_id is null or v_code = '' then raise exception 'INVALID_COMMAND' using errcode = 'P0001'; end if;
  if v_expected not in ('draft','ready','checkin_open','live','paused','completed','aborted') or v_target not in ('draft','ready','checkin_open','live','paused','completed','aborted') then raise exception 'INVALID_LIFECYCLE' using errcode = 'P0001'; end if;
  select g.* into v_game from public.games g where upper(btrim(g.code)) = v_code for update;
  if not found then raise exception 'GAME_NOT_FOUND' using errcode = 'P0001'; end if;
  select a.* into v_audit from public.game_lifecycle_commands a where a.game_id = v_game.id and a.command_id = p_command_id;
  if found then
    if v_audit.from_lifecycle <> v_expected or v_audit.to_lifecycle <> v_target then raise exception 'CONFLICT' using errcode = 'P0001'; end if;
    return query select v_audit.game_id, v_game.code, v_audit.from_lifecycle, v_audit.to_lifecycle, v_audit.command_id, v_audit.created_at;
    return;
  end if;
  if v_game.lifecycle <> v_expected then raise exception 'STALE_GAME_STATE' using errcode = 'P0001'; end if;
  if v_expected = 'live' and v_target = 'completed' and v_game.narrative_phase <> 'reveal' then raise exception 'GAME_NOT_READY_TO_COMPLETE' using errcode = 'P0001'; end if;
  if not ((v_expected = 'draft' and v_target in ('ready','aborted')) or (v_expected = 'ready' and v_target in ('checkin_open','aborted')) or (v_expected = 'checkin_open' and v_target in ('live','aborted')) or (v_expected = 'live' and v_target in ('paused','completed','aborted')) or (v_expected = 'paused' and v_target in ('live','aborted'))) then raise exception 'INVALID_TRANSITION' using errcode = 'P0001'; end if;
  update public.games set lifecycle = v_target, updated_at = now() where id = v_game.id returning updated_at into v_changed_at;
  insert into public.game_lifecycle_commands(command_id, game_id, staff_member_id, from_lifecycle, to_lifecycle) values(p_command_id, v_game.id, v_staff_id, v_expected, v_target) returning created_at into v_changed_at;
  return query select v_game.id, v_game.code, v_expected, v_target, p_command_id, v_changed_at;
end;
$$;
revoke all on function private.transition_game_lifecycle_impl(text,text,text,uuid) from public,anon,authenticated;
grant execute on function private.transition_game_lifecycle_impl(text,text,text,uuid) to authenticated;
