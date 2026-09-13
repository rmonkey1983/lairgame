begin;
select plan(19);

select ok(to_regclass('public.brain_missions') is not null, 'Mission runtime table exists');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.brain_missions'::regclass and conname = 'brain_missions_status_check' and pg_get_constraintdef(oid) like '%COMPLETED%' and pg_get_constraintdef(oid) like '%FAILED%' and pg_get_constraintdef(oid) like '%EXPIRED%'), 'Mission outcomes are terminal statuses');
select has_function('public', 'set_brain_mission_outcome', array['text','text','text','text','text'], 'Outcome command exists');
select ok((select prosecdef from pg_proc where oid = 'private.set_brain_mission_outcome_impl(text,text,text,text,text)'::regprocedure), 'Outcome implementation is definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.set_brain_mission_outcome_impl(text,text,text,text,text)'::regprocedure), 'Outcome implementation has empty search path');
select has_function('public', 'acknowledge_my_mission', array['text','text'], 'Mission acknowledgement command exists');
select has_function('public', 'load_incompatible_brain_missions', array['text'], 'Incompatible mission helper exists');

insert into auth.users(id,aud,role,email,is_anonymous) values
 ('00000000-0000-0000-0000-000000000971','authenticated','authenticated','outcome-staff@example.test',false),
 ('00000000-0000-0000-0000-000000000972','authenticated','authenticated','outcome-player@example.test',true),
 ('00000000-0000-0000-0000-000000000973','authenticated','authenticated','outcome-other@example.test',true);
insert into public.staff_members(id,auth_user_id,display_name,active) values
 ('40000000-0000-0000-0000-000000000971','00000000-0000-0000-0000-000000000971','Outcome Staff',true);
insert into public.players(id,game_id,auth_user_id,table_id,seat_number,nickname) values
 ('20000000-0000-0000-0000-000000000971','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000972','b0000000-0000-0000-0000-000000000051',1,'Outcome Player'),
 ('20000000-0000-0000-0000-000000000972','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000973','b0000000-0000-0000-0000-000000000052',1,'Outcome Other');
update public.games set lifecycle = 'live', narrative_phase = 'pressure' where code = 'TEST01';
reset role;
insert into public.brain_regia_proposals(session_id,proposal_id,source_proposal_id,control_mode,status,command_type,payload)
values ('a0000000-0000-0000-0000-000000000050','outcome-proposal-1','outcome-director-1','SUGGEST','EXECUTED','CHECK_PLAYER','{"commandType":"CHECK_PLAYER","scope":{"type":"PLAYER","playerId":"20000000-0000-0000-0000-000000000971"}}');
insert into public.brain_missions(mission_id,session_id,source_proposal_id,player_id,target_player_id,mission_type,phase,status)
values ('outcome-mission-1','a0000000-0000-0000-0000-000000000050','outcome-proposal-1','20000000-0000-0000-0000-000000000971','20000000-0000-0000-0000-000000000972','QUESTION_PLAYER','DOUBT','ACTIVE');
insert into public.brain_missions(mission_id,session_id,source_proposal_id,player_id,target_player_id,mission_type,phase,status)
values ('outcome-mission-ack','a0000000-0000-0000-0000-000000000050','outcome-proposal-1','20000000-0000-0000-0000-000000000971','20000000-0000-0000-0000-000000000972','OBSERVE_PLAYER','DOUBT','ACTIVE');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000972',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000972","role":"authenticated","is_anonymous":true}',true);
select is((select mission_id from public.acknowledge_my_mission('TEST01','outcome-mission-ack')),'outcome-mission-ack','Player acknowledges own mission');
select ok((select acknowledged_at is not null from public.acknowledge_my_mission('TEST01','outcome-mission-ack')),'Repeated acknowledgement returns the existing timestamp');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000971',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000971","role":"authenticated","is_anonymous":false}',true);
select is((select status from public.set_brain_mission_outcome('TEST01','outcome-mission-1','COMPLETED','MC_CONFIRMED','outcome-command-1')),'COMPLETED','Staff can complete an active mission');
select ok((select outcome_at is not null from public.set_brain_mission_outcome('TEST01','outcome-mission-1','COMPLETED',null,'outcome-command-retry')),'Completion stores outcome timestamp');
select is((select status from public.set_brain_mission_outcome('TEST01','outcome-mission-1','COMPLETED',null,'outcome-command-retry')),'COMPLETED','Same terminal outcome is idempotent');
select throws_ok($$select * from public.set_brain_mission_outcome('TEST01','outcome-mission-1','FAILED',null,'outcome-command-2')$$,'P0001','MISSION_OUTCOME_TERMINAL','Different terminal outcome is rejected');
select is((select count(*) from public.load_staff_mission_outcomes('TEST01') where mission_id = 'outcome-mission-1'),1::bigint,'Outcome does not duplicate mission rows');
select is((select count(*) from realtime.messages where topic = 'game:a0000000-0000-0000-0000-000000000050' and event = 'mission_state_changed'),4::bigint,'Each real mission mutation emits one wake-up');
select is((select count(*) from public.load_incompatible_brain_missions('TEST01')),0::bigint,'Completed missions are excluded from incompatibility helper');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000972',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000972","role":"authenticated","is_anonymous":true}',true);
select throws_ok($$select * from public.acknowledge_my_mission('TEST01','outcome-mission-1')$$,'P0001','MISSION_NOT_FOUND','Player cannot acknowledge a terminal mission');

reset role;
select is((select outcome_reason from public.brain_missions where mission_id = 'outcome-mission-1'),'MC_CONFIRMED','Structured reason is persisted');
select ok(not has_table_privilege('authenticated','public.brain_missions','UPDATE'),'Clients cannot update mission outcomes directly');

select * from finish();
rollback;
