begin;

select plan(25);

select has_function('public', 'join_game', array['text', 'text', 'integer', 'integer'], 'join_game exists');
select has_function('public', 'get_my_join_state', array['text'], 'get_my_join_state exists');
select ok(not has_function_privilege('anon', 'public.join_game(text,text,integer,integer)', 'execute'), 'Postgres anon cannot execute join_game');
select ok(not has_function_privilege('anon', 'public.get_my_join_state(text)', 'execute'), 'Postgres anon cannot execute get_my_join_state');
select ok(has_function_privilege('authenticated', 'public.join_game(text,text,integer,integer)', 'execute'), 'authenticated can execute join_game');
select ok(has_function_privilege('authenticated', 'public.get_my_join_state(text)', 'execute'), 'authenticated can execute get_my_join_state');

insert into auth.users (id, aud, role, email, is_anonymous)
values
  ('00000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'anonymous-one@example.test', true),
  ('00000000-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'anonymous-two@example.test', true),
  ('00000000-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'staff-like@example.test', false);
insert into public.events (id, name) values ('10000000-0000-0000-0000-000000000011', 'Join test event');
insert into public.games (id, event_id, code, lifecycle) values
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011', '  Join-One  ', 'checkin_open'),
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000011', 'JOIN-DRAFT', 'draft'),
  ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000011', 'JOIN-READY', 'ready');
insert into public.game_tables (id, game_id, table_number) values
  ('30000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011', 3);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000013', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000013","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$select * from public.join_game('JOIN-ONE', 'Staff', 3, 1)$$, 'P0001', 'AUTH_ANONYMOUS_REQUIRED', 'non-anonymous user rejected');
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.join_game('JOIN-ONE', 'No user', 3, 1)$$, 'P0001', 'AUTH_REQUIRED', 'missing auth uid rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.join_game('MISSING', 'Player', 3, 1)$$, 'P0001', 'GAME_NOT_FOUND', 'missing game rejected');
select throws_ok($$select * from public.join_game('JOIN-DRAFT', 'Player', 3, 1)$$, 'P0001', 'GAME_NOT_OPEN', 'draft game rejected');
select throws_ok($$select * from public.join_game('JOIN-READY', 'Player', 3, 1)$$, 'P0001', 'GAME_NOT_OPEN', 'ready game rejected');
select throws_ok($$select * from public.join_game('JOIN-ONE', 'Player', 4, 1)$$, 'P0001', 'TABLE_NOT_FOUND', 'invalid table rejected');
select throws_ok($$select * from public.join_game('JOIN-ONE', 'Player', 3, 0)$$, 'P0001', 'SEAT_INVALID', 'invalid seat rejected');
select throws_ok($$select * from public.join_game('JOIN-ONE', '   ', 3, 1)$$, 'P0001', 'NICKNAME_INVALID', 'empty nickname rejected');
select is((select count(*) from public.join_game(' join-one ', 'Player', 3, 1)), 1::bigint, 'valid join succeeds');
reset role;
select is((select count(*) from public.players where game_id = '20000000-0000-0000-0000-000000000011'), 1::bigint, 'valid join creates one player');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated","is_anonymous":true}', true);
select is((select count(*) from public.join_game('JOIN-ONE', 'Player', 3, 1)), 1::bigint, 'same join is idempotent');
reset role;
select is((select count(*) from public.players where game_id = '20000000-0000-0000-0000-000000000011'), 1::bigint, 'retry does not duplicate player');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.join_game('JOIN-ONE', 'Changed', 3, 1)$$, 'P0001', 'CONFLICT', 'incompatible retry rejected');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000012","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select * from public.join_game('JOIN-ONE', 'Second', 3, 1)$$, 'P0001', 'SEAT_TAKEN', 'occupied seat rejected');
select is((select count(*) from public.get_my_join_state('JOIN-ONE')), 0::bigint, 'other identity cannot read player state');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000011","role":"authenticated","is_anonymous":true}', true);
select is((select count(*) from public.get_my_join_state('join-one')), 1::bigint, 'current identity reads own join state');
select ok(not has_table_privilege('authenticated', 'public.players', 'INSERT'), 'authenticated has no direct player insert');
select ok(not has_table_privilege('authenticated', 'public.players', 'UPDATE'), 'authenticated has no direct player update');
select ok(not has_table_privilege('authenticated', 'public.players', 'DELETE'), 'authenticated has no direct player delete');

select * from finish();
rollback;
