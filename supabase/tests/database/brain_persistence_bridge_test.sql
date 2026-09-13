begin;

select plan(28);

select ok(to_regclass('public.brain_events') is not null, 'Brain events table exists');
select ok(to_regclass('public.brain_trust_state') is not null, 'Brain trust state table exists');
select ok(to_regclass('public.brain_suspicion_state') is not null, 'Brain suspicion state table exists');
select ok(to_regclass('public.brain_regia_proposals') is not null, 'Brain Regia proposals table exists');
select ok((select relrowsecurity from pg_class where oid='public.brain_events'::regclass), 'Brain events RLS enabled');
select ok(not has_table_privilege('authenticated','public.brain_events','SELECT'), 'Brain events have no direct browser read');
select ok(not has_table_privilege('authenticated','public.brain_events','INSERT'), 'Brain events have no direct browser write');
select ok(not has_table_privilege('authenticated','public.brain_regia_proposals','UPDATE'), 'Regia proposals have no direct browser update');
select ok(not has_function_privilege('anon','private.append_brain_event_impl(uuid,text,text,text,uuid,uuid,jsonb)','execute'), 'Anonymous cannot append Brain events');
select ok(has_function_privilege('authenticated','public.append_brain_event(uuid,text,text,text,uuid,uuid,jsonb)','execute'), 'Authenticated can use event wrapper');
select ok((select prosecdef from pg_proc where oid='private.append_brain_event_impl(uuid,text,text,text,uuid,uuid,jsonb)'::regprocedure), 'Event mutation is private definer');
select ok((select prosecdef from pg_proc where oid='private.set_brain_trust_impl(uuid,uuid,uuid,text,text)'::regprocedure), 'Trust mutation is private definer');
select ok((select prosecdef from pg_proc where oid='private.set_brain_suspicion_impl(uuid,uuid,uuid,text,text)'::regprocedure), 'Suspicion mutation is private definer');
select ok((select prosecdef from pg_proc where oid='private.save_brain_regia_proposal_impl(uuid,text,text,text,text,text,jsonb)'::regprocedure), 'Proposal mutation is private definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid='private.append_brain_event_impl(uuid,text,text,text,uuid,uuid,jsonb)'::regprocedure), 'Event mutation has empty search path');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid='private.save_brain_regia_proposal_impl(uuid,text,text,text,text,text,jsonb)'::regprocedure), 'Proposal mutation has empty search path');

insert into auth.users(id,aud,role,email,is_anonymous) values
 ('00000000-0000-0000-0000-000000000901','authenticated','authenticated','brain-player-1@example.test',true),
 ('00000000-0000-0000-0000-000000000902','authenticated','authenticated','brain-player-2@example.test',true),
 ('00000000-0000-0000-0000-000000000903','authenticated','authenticated','brain-player-3@example.test',true),
 ('00000000-0000-0000-0000-000000000904','authenticated','authenticated','brain-staff@example.test',false);
insert into public.staff_members(id,auth_user_id,display_name,active) values ('40000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000904','Brain Staff',true);
insert into public.players(id,game_id,auth_user_id,table_id,seat_number,nickname) values
 ('20000000-0000-0000-0000-000000000901','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000901','b0000000-0000-0000-0000-000000000051',1,'Brain One'),
 ('20000000-0000-0000-0000-000000000902','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000902','b0000000-0000-0000-0000-000000000051',2,'Brain Two'),
 ('20000000-0000-0000-0000-000000000903','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000903','b0000000-0000-0000-0000-000000000052',1,'Brain Three');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000901',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000901","role":"authenticated","is_anonymous":true}',true);
select is((select sequence from public.append_brain_event('a0000000-0000-0000-0000-000000000050','brain-event-1','TRUST_SELECTED','trust','20000000-0000-0000-0000-000000000901','20000000-0000-0000-0000-000000000902','{"level":"HIGH"}'::jsonb)),1,'sequence is assigned server-side');
reset role;
select is((select count(*) from public.brain_events where session_id='a0000000-0000-0000-0000-000000000050'),1::bigint,'one event persisted');
set local role authenticated;
select is((select sequence from public.append_brain_event('a0000000-0000-0000-0000-000000000050','brain-event-1','TRUST_SELECTED','trust','20000000-0000-0000-0000-000000000901','20000000-0000-0000-0000-000000000902','{"level":"HIGH"}'::jsonb)),1,'duplicate event retry returns original');
select throws_ok($$select * from public.append_brain_event('a0000000-0000-0000-0000-000000000050','brain-event-1','TRUST_SELECTED','trust','20000000-0000-0000-0000-000000000901','20000000-0000-0000-0000-000000000902','{"level":"LOW"}'::jsonb)$$,'P0001','EVENT_ID_CONFLICT','duplicate event payload conflicts safely');
select throws_ok($$select * from public.append_brain_event('a0000000-0000-0000-0000-000000000050','brain-event-2','TRUST_SELECTED','trust','20000000-0000-0000-0000-000000000902','20000000-0000-0000-0000-000000000901','{"level":"HIGH"}'::jsonb)$$,'P0001','PLAYER_AUTH_REQUIRED','Player cannot append for another player');
select * from public.set_brain_trust('a0000000-0000-0000-0000-000000000050','20000000-0000-0000-0000-000000000901','20000000-0000-0000-0000-000000000902','HIGH','trust');
reset role;
select is((select count(*) from public.brain_trust_state),1::bigint,'trust state persisted');
set local role authenticated;
select * from public.set_brain_suspicion('a0000000-0000-0000-0000-000000000050','20000000-0000-0000-0000-000000000901','20000000-0000-0000-0000-000000000902','MEDIUM','investigation');
select * from public.set_brain_suspicion('a0000000-0000-0000-0000-000000000050','20000000-0000-0000-0000-000000000901','20000000-0000-0000-0000-000000000903','HIGH','doubt');
reset role;
select is((select count(*) from public.brain_suspicion_state where session_id='a0000000-0000-0000-0000-000000000050' and source_player_id='20000000-0000-0000-0000-000000000901' and active),1::bigint,'one active suspicion per source');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000904',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000904","role":"authenticated","is_anonymous":false}',true);
select is((select sequence from public.append_brain_event('a0000000-0000-0000-0000-000000000050','brain-event-2','PHASE_ENTERED','investigation',null,null,'{"previousPhase":"TRUST","newPhase":"INVESTIGATION"}'::jsonb)),2,'staff event receives next sequence');
select is((select count(*) from public.load_brain_events('a0000000-0000-0000-0000-000000000050')),2::bigint,'staff can hydrate event timeline');
select * from public.save_brain_regia_proposal('a0000000-0000-0000-0000-000000000050','regia-proposal-1','director-1','SUGGEST','PENDING','CHECK_TABLE','{"commandType":"CHECK_TABLE","scope":{"type":"TABLE","tableId":"t1"}}'::jsonb);
select is((select count(*) from public.save_brain_regia_proposal('a0000000-0000-0000-0000-000000000050','regia-proposal-1','director-1','SUGGEST','PENDING','CHECK_TABLE','{"commandType":"CHECK_TABLE","scope":{"type":"TABLE","tableId":"t1"}}'::jsonb)),1::bigint,'proposal retry is idempotent');
select is((select status from public.approve_brain_regia_proposal('a0000000-0000-0000-0000-000000000050','regia-proposal-1')),'APPROVED','staff approval persists');
select throws_ok($$select * from public.save_brain_regia_proposal('a0000000-0000-0000-0000-000000000050','regia-forbidden',null,'MANUAL','PENDING','CHANGE_SCENARIO_TRUTH','{"commandType":"CHANGE_SCENARIO_TRUTH"}'::jsonb)$$,'P0001','FORBIDDEN_COMMAND','forbidden proposal cannot persist');
reset role;

select * from finish();
rollback;
