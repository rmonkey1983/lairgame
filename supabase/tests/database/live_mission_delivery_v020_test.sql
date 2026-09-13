begin;

select plan(13);

select has_function('public', 'load_my_player_missions', array['text'], 'Player mission RPC exists');
select ok(not (select prosecdef from pg_proc where oid = 'public.load_my_player_missions(text)'::regprocedure), 'Player wrapper is invoker');
select ok((select prosecdef from pg_proc where oid = 'private.load_my_player_missions_impl(text)'::regprocedure), 'Player implementation is definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.load_my_player_missions_impl(text)'::regprocedure), 'Player implementation has empty search path');
select ok(not has_table_privilege('authenticated', 'public.brain_missions', 'SELECT'), 'Players cannot read mission table directly');
select ok(not exists (select 1 from pg_policy where polrelid = 'realtime.messages'::regclass and polname = 'clients can send mission state broadcasts'), 'Clients cannot send mission broadcasts');

insert into auth.users(id,aud,role,email,is_anonymous) values
  ('00000000-0000-0000-0000-000000000981','authenticated','authenticated','mission-staff@example.test',false),
  ('00000000-0000-0000-0000-000000000982','authenticated','authenticated','mission-player@example.test',true),
  ('00000000-0000-0000-0000-000000000983','authenticated','authenticated','mission-other@example.test',true);
insert into public.staff_members(id,auth_user_id,display_name,active) values
  ('40000000-0000-0000-0000-000000000981','00000000-0000-0000-0000-000000000981','Mission Staff',true);
insert into public.players(id,game_id,auth_user_id,table_id,seat_number,nickname) values
  ('20000000-0000-0000-0000-000000000981','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000982','b0000000-0000-0000-0000-000000000051',1,'Mission Player'),
  ('20000000-0000-0000-0000-000000000982','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000983','b0000000-0000-0000-0000-000000000052',1,'Other Player');

reset role;
insert into public.brain_regia_proposals(session_id,proposal_id,source_proposal_id,control_mode,status,command_type,payload)
values ('a0000000-0000-0000-0000-000000000050','execution-proposal-1','director-1','SUGGEST','EXECUTED','CHECK_PLAYER','{"commandType":"CHECK_PLAYER","scope":{"type":"PLAYER","playerId":"20000000-0000-0000-0000-000000000981"},"missionProposal":{"missionId":"mission-delivery-1","type":"QUESTION_PLAYER","playerId":"20000000-0000-0000-0000-000000000981","targetPlayerId":"20000000-0000-0000-0000-000000000982","phase":"DOUBT","status":"PROPOSED","exposureLevel":"medium"}}');
insert into public.brain_missions(mission_id,session_id,source_proposal_id,player_id,target_player_id,mission_type,phase,status)
values ('mission-delivery-1','a0000000-0000-0000-0000-000000000050','execution-proposal-1','20000000-0000-0000-0000-000000000981','20000000-0000-0000-0000-000000000982','QUESTION_PLAYER','DOUBT','ACTIVE');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000982',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000982","role":"authenticated","is_anonymous":true}',true);
select is((select count(*) from public.load_my_player_missions('TEST01')),1::bigint,'Player loads own active mission');
select is((select mission_type from public.load_my_player_missions('TEST01')),'QUESTION_PLAYER','Mission type is delivered');
select is((select target_player_id from public.load_my_player_missions('TEST01')),'20000000-0000-0000-0000-000000000982'::uuid,'Only safe gameplay target is delivered');
select is((select count(*) from public.load_my_player_missions('TEST01') where mission_id = 'mission-delivery-1'),1::bigint,'Player cannot obtain another player mission');
select ok(pg_get_function_result('public.load_my_player_missions(text)'::regprocedure) !~* 'source_proposal|brain|ai|evidence|scenario_truth','Player projection omits internal metadata');

reset role;
select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'mission_state_changed'),1::bigint,'Mission activation emits one Player wake-up');
select is((select payload - 'id' from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'mission_state_changed' limit 1),'{"kind":"mission_state_changed"}'::jsonb,'Mission wake-up has minimal payload');

select * from finish();
rollback;
