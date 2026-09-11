begin;

select plan(22);

select has_function('public', 'get_staff_game_roster', array['text'], 'staff roster RPC exists');
select has_function('private', 'get_staff_game_roster_impl', array['text'], 'private roster implementation exists');
select ok(not (select prosecdef from pg_proc where oid = 'public.get_staff_game_roster(text)'::regprocedure), 'public roster wrapper is invoker');
select ok((select prosecdef from pg_proc where oid = 'private.get_staff_game_roster_impl(text)'::regprocedure), 'private roster implementation is definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.get_staff_game_roster_impl(text)'::regprocedure), 'private roster implementation has empty search path');
select ok(pg_get_function_result('public.get_staff_game_roster(text)'::regprocedure) !~* 'auth_user_id', 'roster result does not expose auth user id');
select ok(not has_function_privilege('public', 'public.get_staff_game_roster(text)', 'execute'), 'PUBLIC cannot execute roster RPC');
select ok(not has_function_privilege('anon', 'public.get_staff_game_roster(text)', 'execute'), 'anon cannot execute roster RPC');
select ok(has_function_privilege('authenticated', 'public.get_staff_game_roster(text)', 'execute'), 'authenticated can execute roster RPC');
select ok(not has_table_privilege('authenticated', 'public.players', 'SELECT'), 'players remain closed to direct reads');
select ok((select tgname = 'players_broadcast_game_state_change' from pg_trigger where tgrelid = 'public.players'::regclass and not tgisinternal and tgname = 'players_broadcast_game_state_change'), 'player join trigger exists');

insert into auth.users (id, aud, role, email, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000091', 'authenticated', 'authenticated', 'roster-staff@example.test', false),
  ('00000000-0000-0000-0000-000000000092', 'authenticated', 'authenticated', 'roster-inactive@example.test', false),
  ('00000000-0000-0000-0000-000000000093', 'authenticated', 'authenticated', 'roster-nonstaff@example.test', false),
  ('00000000-0000-0000-0000-000000000094', 'authenticated', 'authenticated', 'roster-anonymous@example.test', true),
  ('00000000-0000-0000-0000-000000000095', 'authenticated', 'authenticated', 'roster-join@example.test', true);
insert into public.staff_members (id, auth_user_id, display_name, active)
values
  ('40000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000091', 'Roster Staff', true),
  ('40000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000092', 'Inactive Roster Staff', false);
insert into public.players (id, game_id, auth_user_id, table_id, seat_number, nickname)
values
  ('20000000-0000-0000-0000-000000000091', 'a0000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000094', 'b0000000-0000-0000-0000-000000000051', 1, 'Alice'),
  ('20000000-0000-0000-0000-000000000092', 'a0000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000093', 'b0000000-0000-0000-0000-000000000051', 2, 'Bob');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000091', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000091","role":"authenticated","is_anonymous":false}', true);
select is((select count(*) from public.get_staff_game_roster(' test01 ')), 2::bigint, 'active Staff reads current roster');
select is((select string_agg(nickname || '@' || table_number || '/' || seat_number, ',' order by table_number, seat_number) from public.get_staff_game_roster('TEST01')), 'Alice@1/1,Bob@1/2', 'roster maps table and seat order');
select ok((select joined_at is not null from public.get_staff_game_roster('TEST01') limit 1), 'roster includes joined timestamp');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000093', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000093","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.get_staff_game_roster('TEST01')$$, 'P0001', 'STAFF_ACCESS_DENIED', 'non-Staff is denied roster');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000092', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000092","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.get_staff_game_roster('TEST01')$$, 'P0001', 'STAFF_ACCESS_DENIED', 'inactive Staff is denied roster');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000094', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000094","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.get_staff_game_roster('TEST01')$$, 'P0001', 'STAFF_AUTH_REQUIRED', 'anonymous user is denied roster');

select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed'), 2::bigint, 'fixture inserts emitted two wake-ups');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000095', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000095","role":"authenticated","is_anonymous":true}', true);
select is((select count(*) from public.join_game('TEST01', 'Cara', 2, 3)), 1::bigint, 'new Player join succeeds');
select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed'), 3::bigint, 'new Player join emits one wake-up');
select is((select count(*) from public.join_game(' test01 ', 'Cara', 2, 3)), 1::bigint, 'identical join remains idempotent');
select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed'), 3::bigint, 'idempotent join emits no extra wake-up');

reset role;
select * from finish();
rollback;
