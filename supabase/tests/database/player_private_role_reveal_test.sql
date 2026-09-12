begin;
select plan(13);

select has_function('public', 'get_my_player_state', array['text'], 'Player state RPC exists');
select ok(not (select prosecdef from pg_proc where oid = 'public.get_my_player_state(text)'::regprocedure), 'Player state wrapper is invoker');
select ok((select prosecdef from pg_proc where oid = 'private.get_my_player_state_impl(text)'::regprocedure), 'Player state implementation is definer');
select ok(pg_get_function_result('public.get_my_player_state(text)'::regprocedure) !~* 'auth_user_id', 'Player state omits auth user id');
select ok(not has_table_privilege('authenticated', 'public.game_role_assignments', 'SELECT'), 'Player has no direct role access');

insert into auth.users (id, aud, role, email, is_anonymous) values
 ('00000000-0000-0000-0000-000000000201','authenticated','authenticated','player-liar@example.test',true),
 ('00000000-0000-0000-0000-000000000202','authenticated','authenticated','player-accomplice@example.test',true),
 ('00000000-0000-0000-0000-000000000203','authenticated','authenticated','player-investigator@example.test',true),
 ('00000000-0000-0000-0000-000000000204','authenticated','authenticated','player-scapegoat@example.test',true),
 ('00000000-0000-0000-0000-000000000205','authenticated','authenticated','not-a-player@example.test',false);
insert into public.events (id, name) values ('10000000-0000-0000-0000-000000000201', 'Player role event');
insert into public.games (id, event_id, code, lifecycle, narrative_phase) values
 ('a0000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000201', 'PLAYER-ROLE', 'live', 'lobby');
insert into public.game_tables (id, game_id, table_number) values
 ('b0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000201', 1);
insert into public.players (id, game_id, auth_user_id, table_id, seat_number, nickname) values
 ('20000000-0000-0000-0000-000000000201','a0000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000201','b0000000-0000-0000-0000-000000000201',1,'Liar'),
 ('20000000-0000-0000-0000-000000000202','a0000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000202','b0000000-0000-0000-0000-000000000201',2,'Accomplice'),
 ('20000000-0000-0000-0000-000000000203','a0000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000203','b0000000-0000-0000-0000-000000000201',3,'Investigator'),
 ('20000000-0000-0000-0000-000000000204','a0000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000204','b0000000-0000-0000-0000-000000000201',4,'Scapegoat');
insert into public.game_role_assignments (player_id, game_id, role) values
 ('20000000-0000-0000-0000-000000000201','a0000000-0000-0000-0000-000000000201','liar'),
 ('20000000-0000-0000-0000-000000000202','a0000000-0000-0000-0000-000000000201','accomplice'),
 ('20000000-0000-0000-0000-000000000203','a0000000-0000-0000-0000-000000000201','investigator'),
 ('20000000-0000-0000-0000-000000000204','a0000000-0000-0000-0000-000000000201','scapegoat');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000201',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated","is_anonymous":true}',true);
select is((select role from public.get_my_player_state('PLAYER-ROLE')), null::text, 'lobby hides own role');
reset role;
update public.games set narrative_phase = 'role_reveal' where id = 'a0000000-0000-0000-0000-000000000201';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000201',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000201","role":"authenticated","is_anonymous":true}',true);
select is((select role from public.get_my_player_state('PLAYER-ROLE')), 'liar', 'liar sees liar');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000202',true);
select is((select role from public.get_my_player_state('PLAYER-ROLE')), 'accomplice', 'accomplice sees accomplice');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000203',true);
select is((select role from public.get_my_player_state('PLAYER-ROLE')), 'investigator', 'investigator sees investigator');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000204',true);
select is((select role from public.get_my_player_state('PLAYER-ROLE')), 'investigator', 'scapegoat sees investigator');
select is((select count(*) from public.get_my_player_state('PLAYER-ROLE')), 1::bigint, 'state is limited to caller');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000205',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000205","role":"authenticated","is_anonymous":false}',true);
select throws_ok($$select * from public.get_my_player_state('PLAYER-ROLE')$$,'P0001','AUTH_ANONYMOUS_REQUIRED','non-Player denied');
select is(pg_get_function_result('public.get_my_player_state(text)'::regprocedure) !~* 'scapegoat', true, 'safe RPC contract omits scapegoat');

select * from finish();
rollback;
