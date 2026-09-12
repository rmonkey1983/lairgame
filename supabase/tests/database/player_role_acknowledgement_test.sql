begin;
select plan(21);

select has_function('public', 'acknowledge_my_role', array['text'], 'acknowledgement RPC exists');
select ok((select prosecdef from pg_proc where oid = 'private.acknowledge_my_role_impl(text)'::regprocedure), 'acknowledgement implementation is definer');
select ok(not (select prosecdef from pg_proc where oid = 'public.acknowledge_my_role(text)'::regprocedure), 'acknowledgement wrapper is invoker');
select ok(not has_table_privilege('authenticated', 'public.game_role_acknowledgements', 'SELECT'), 'acknowledgements are not directly readable');
select ok(not has_table_privilege('authenticated', 'public.game_role_acknowledgements', 'INSERT'), 'acknowledgements are not directly writable');
select ok(pg_get_function_result('public.get_my_player_state(text)'::regprocedure) ~* 'role_acknowledged', 'Player state includes acknowledgement status');
select ok(pg_get_function_result('public.get_staff_game_roles(text)'::regprocedure) ~* 'role_acknowledged', 'Staff roles includes acknowledgement status');

insert into auth.users (id, aud, role, email, is_anonymous) values
 ('00000000-0000-0000-0000-000000000301','authenticated','authenticated','ack-one@example.test',true),
 ('00000000-0000-0000-0000-000000000302','authenticated','authenticated','ack-two@example.test',true),
 ('00000000-0000-0000-0000-000000000303','authenticated','authenticated','ack-three@example.test',true),
 ('00000000-0000-0000-0000-000000000304','authenticated','authenticated','ack-none@example.test',false),
 ('00000000-0000-0000-0000-000000000305','authenticated','authenticated','ack-staff@example.test',false);
insert into public.staff_members (id, auth_user_id, display_name, active) values
 ('40000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000305','Ack Staff',true);
insert into public.events (id, name) values ('10000000-0000-0000-0000-000000000301', 'Ack event');
insert into public.games (id, event_id, code, lifecycle, narrative_phase) values ('a0000000-0000-0000-0000-000000000301','10000000-0000-0000-0000-000000000301','ACK-TEST','live','lobby');
insert into public.game_tables (id, game_id, table_number) values ('b0000000-0000-0000-0000-000000000301','a0000000-0000-0000-0000-000000000301',1);
insert into public.players (id, game_id, auth_user_id, table_id, seat_number, nickname) values
 ('20000000-0000-0000-0000-000000000301','a0000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000301','b0000000-0000-0000-0000-000000000301',1,'One'),
 ('20000000-0000-0000-0000-000000000302','a0000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000302','b0000000-0000-0000-0000-000000000301',2,'Two'),
 ('20000000-0000-0000-0000-000000000303','a0000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000303','b0000000-0000-0000-0000-000000000301',3,'Three');
insert into public.game_role_assignments (player_id, game_id, role) values
 ('20000000-0000-0000-0000-000000000301','a0000000-0000-0000-0000-000000000301','liar'),
 ('20000000-0000-0000-0000-000000000302','a0000000-0000-0000-0000-000000000301','accomplice'),
 ('20000000-0000-0000-0000-000000000303','a0000000-0000-0000-0000-000000000301','investigator');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated","is_anonymous":true}',true);
select is((select role_acknowledged from public.get_my_player_state('ACK-TEST')), false, 'lobby state is unacknowledged');
select throws_ok($$select * from public.acknowledge_my_role('ACK-TEST')$$,'P0001','GAME_NOT_IN_ROLE_REVEAL','acknowledgement is phase guarded');
reset role;
update public.games set narrative_phase = 'role_reveal' where id = 'a0000000-0000-0000-0000-000000000301';
set local role authenticated;
select is((select role_acknowledged from public.get_my_player_state('ACK-TEST')), false, 'role reveal initially pending');
select is((select count(*) from public.acknowledge_my_role('ACK-TEST')), 1::bigint, 'Player acknowledges own role');
reset role;
select is((select count(*) from public.game_role_acknowledgements), 1::bigint, 'one acknowledgement row exists');
set local role authenticated;
select is((select role_acknowledged from public.get_my_player_state('ACK-TEST')), true, 'Player state reports acknowledgement');
select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000301' and event = 'role_acknowledgement_changed'), 1::bigint, 'first acknowledgement emits one wake-up');
select is((select count(*) from public.acknowledge_my_role('ACK-TEST')), 1::bigint, 'repeat acknowledgement succeeds');
reset role;
select is((select count(*) from public.game_role_acknowledgements), 1::bigint, 'repeat creates no duplicate row');
set local role authenticated;
select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000301' and event = 'role_acknowledgement_changed'), 1::bigint, 'repeat emits no wake-up');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000305',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000305","role":"authenticated","is_anonymous":false}',true);
select throws_ok($$select * from public.transition_game_narrative_phase('ACK-TEST','role_reveal','briefing','70000000-0000-0000-0000-000000000301')$$,'P0001','ROLE_ACKNOWLEDGEMENT_REQUIRED','briefing waits for every acknowledgement');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000302',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000302","role":"authenticated","is_anonymous":true}',true);
select * from public.acknowledge_my_role('ACK-TEST');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000303',true);
select * from public.acknowledge_my_role('ACK-TEST');
reset role;
select is((select count(*) from public.game_role_acknowledgements), 3::bigint, 'all Players have one timestamped acknowledgement');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000305',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000305","role":"authenticated","is_anonymous":false}',true);
select is((select phase from public.transition_game_narrative_phase('ACK-TEST','role_reveal','briefing','70000000-0000-0000-0000-000000000302')), 'briefing', 'briefing allowed after all acknowledgement');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000304',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000304","role":"authenticated","is_anonymous":false}',true);
select throws_ok($$select * from public.acknowledge_my_role('ACK-TEST')$$,'P0001','PLAYER_AUTH_REQUIRED','non-Player denied');
select * from finish();
rollback;
