begin;

select plan(20);

select ok(to_regclass('public.brain_missions') is not null, 'Mission runtime table exists');
select ok(to_regclass('public.brain_proposal_executions') is not null, 'Execution audit table exists');
select ok(not has_table_privilege('authenticated','public.brain_missions','SELECT'), 'Players cannot directly read missions');
select ok(not has_table_privilege('authenticated','public.brain_missions','INSERT'), 'Clients cannot insert missions');
select ok((select prosecdef from pg_proc where oid='private.execute_approved_regia_proposal_impl(uuid,text)'::regprocedure), 'Execution is private definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid='private.execute_approved_regia_proposal_impl(uuid,text)'::regprocedure), 'Execution has empty search path');
select ok(has_function_privilege('authenticated','public.execute_approved_regia_proposal(uuid,text)','execute'), 'Authenticated wrapper exists');

insert into auth.users(id,aud,role,email,is_anonymous) values
 ('00000000-0000-0000-0000-000000000991','authenticated','authenticated','execution-staff@example.test',false),
 ('00000000-0000-0000-0000-000000000992','authenticated','authenticated','execution-player@example.test',true);
insert into public.staff_members(id,auth_user_id,display_name,active) values
 ('40000000-0000-0000-0000-000000000991','00000000-0000-0000-0000-000000000991','Execution Staff',true);
insert into public.players(id,game_id,auth_user_id,table_id,seat_number,nickname) values
 ('20000000-0000-0000-0000-000000000991','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000992','b0000000-0000-0000-0000-000000000051',1,'Execution Player');
update public.games set lifecycle='live', narrative_phase='pressure' where code='TEST01';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000991',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000991","role":"authenticated","is_anonymous":false}',true);
select * from public.save_brain_regia_proposal(
  'a0000000-0000-0000-0000-000000000050','execution-proposal-1','director-execution-1','SUGGEST','APPROVED','CHECK_PLAYER',
  '{"commandType":"CHECK_PLAYER","scope":{"type":"PLAYER","playerId":"20000000-0000-0000-0000-000000000991"},"missionProposal":{"missionId":"mission-execution-1","type":"OBSERVE_PLAYER","playerId":"20000000-0000-0000-0000-000000000991","phase":"DOUBT","status":"PROPOSED","exposureLevel":"low"}}'::jsonb);
select is((select reason from public.execute_approved_regia_proposal('a0000000-0000-0000-0000-000000000050','missing-proposal')),'PROPOSAL_NOT_FOUND','missing proposal fails safely');
select is((select action from public.execute_approved_regia_proposal('a0000000-0000-0000-0000-000000000050','execution-proposal-1')),'ACTIVATE_MISSION','approved mission executes');
reset role;
select is((select count(*) from public.brain_missions where mission_id='mission-execution-1'),1::bigint,'one mission is persisted');
select is((select status from public.brain_regia_proposals where proposal_id='execution-proposal-1'),'EXECUTED','proposal becomes executed');
select is((select status from public.brain_proposal_executions where proposal_id='execution-proposal-1'),'EXECUTED','execution audit is terminal');
set local role authenticated;
select is((select execution_id from public.execute_approved_regia_proposal('a0000000-0000-0000-0000-000000000050','execution-proposal-1')),'execution:a0000000-0000-0000-0000-000000000050:execution-proposal-1','retry returns same execution');
reset role;
select is((select count(*) from public.brain_missions where mission_id='mission-execution-1'),1::bigint,'retry does not duplicate mission');
select is((select count(*) from public.brain_proposal_executions where proposal_id='execution-proposal-1'),1::bigint,'retry does not duplicate audit');
set local role authenticated;
select is((select reason from public.execute_approved_regia_proposal('a0000000-0000-0000-0000-000000000050','execution-proposal-1'))::text,null::text,'executed retry is successful');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000992',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000992","role":"authenticated","is_anonymous":true}',true);
select is((select count(*) from public.load_my_active_missions('a0000000-0000-0000-0000-000000000050')),1::bigint,'Player reads own active mission');
select throws_ok($$select * from public.load_brain_missions('a0000000-0000-0000-0000-000000000050')$$,'P0001','STAFF_ACCESS_DENIED','Player cannot read Staff mission model');

reset role;
select is((select count(*) from public.brain_missions),1::bigint,'Mission remains append-only after execution');
select is((select count(*) from public.brain_proposal_executions),1::bigint,'Execution audit remains singular');
select * from finish();
rollback;
