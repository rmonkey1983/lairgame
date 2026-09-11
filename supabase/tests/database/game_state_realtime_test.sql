begin;

select plan(20);

select ok(to_regprocedure('private.broadcast_game_state_changed()') is not null, 'game state trigger function exists');
select ok(to_regprocedure('private.can_receive_game_state_topic()') is not null, 'game topic authorization helper exists');
select ok((select prosecdef from pg_proc where oid = 'private.broadcast_game_state_changed()'::regprocedure), 'broadcast helper is definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.broadcast_game_state_changed()'::regprocedure), 'broadcast helper has empty search path');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.can_receive_game_state_topic()'::regprocedure), 'authorization helper has empty search path');
select ok((select true from pg_trigger where tgrelid = 'public.games'::regclass and not tgisinternal and tgname = 'games_broadcast_state_change'), 'games state trigger exists');
select ok((select polcmd = 'r' from pg_policy where polrelid = 'realtime.messages'::regclass and polname = 'authenticated can receive game state broadcasts'), 'realtime policy is receive-only');
select ok(not exists (select 1 from pg_policy where polrelid = 'realtime.messages'::regclass and polcmd = 'a'), 'no realtime client insert policy exists');
select ok(not has_function_privilege('anon', 'private.can_receive_game_state_topic()', 'execute'), 'anonymous role cannot execute topic helper');
select ok(has_function_privilege('authenticated', 'private.can_receive_game_state_topic()', 'execute'), 'authenticated role can be checked for topic receive');

insert into auth.users (id, aud, role, email, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000071', 'authenticated', 'authenticated', 'realtime-active@example.test', false),
  ('00000000-0000-0000-0000-000000000072', 'authenticated', 'authenticated', 'realtime-inactive@example.test', false),
  ('00000000-0000-0000-0000-000000000073', 'authenticated', 'authenticated', 'realtime-player@example.test', true),
  ('00000000-0000-0000-0000-000000000074', 'authenticated', 'authenticated', 'realtime-none@example.test', false);
insert into public.staff_members (id, auth_user_id, display_name, active)
values
  ('40000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000071', 'Realtime Staff', true),
  ('40000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000072', 'Inactive Realtime Staff', false);
insert into public.players (id, game_id, auth_user_id, nickname)
values ('20000000-0000-0000-0000-000000000071', 'a0000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000073', 'Realtime Player');

select set_config('realtime.topic', 'game:a0000000-0000-0000-0000-000000000050', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000071', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000071","role":"authenticated","is_anonymous":false}', true);
select ok(private.can_receive_game_state_topic(), 'active Staff can receive selected game topic');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000073', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000073","role":"authenticated","is_anonymous":true}', true);
select ok(private.can_receive_game_state_topic(), 'current Player can receive own game topic');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000074', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000074","role":"authenticated","is_anonymous":false}', true);
select ok(not private.can_receive_game_state_topic(), 'non-Staff without Player row is denied');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000072', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000072","role":"authenticated","is_anonymous":false}', true);
select ok(not private.can_receive_game_state_topic(), 'inactive Staff is denied');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000073', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000073","role":"authenticated","is_anonymous":true}', true);
select set_config('realtime.topic', 'game:b0000000-0000-0000-0000-000000000050', true);
select ok(not private.can_receive_game_state_topic(), 'Player is denied from wrong game topic');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000071', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000071","role":"authenticated","is_anonymous":false}', true);
set local role authenticated;
select * from public.transition_game_lifecycle('TEST01', 'checkin_open', 'live', '50000000-0000-0000-0000-000000000071');
select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed'), 2::bigint, 'lifecycle change emits once');
select is((select payload - 'id' from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed' limit 1), '{"kind": "game_state_changed"}'::jsonb, 'broadcast payload contains no state');
select ok(not exists (select 1 from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed' and (payload ?| array['lifecycle', 'narrative_phase'])), 'broadcast payload omits lifecycle and phase');
select * from public.transition_game_narrative_phase('TEST01', 'lobby', 'role_reveal', '50000000-0000-0000-0000-000000000072');
reset role;
select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed'), 3::bigint, 'narrative phase change emits once');
update public.games set updated_at = now() where id = 'a0000000-0000-0000-0000-000000000050';
select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'game_state_changed'), 3::bigint, 'unrelated update emits nothing');

select * from finish();
rollback;
