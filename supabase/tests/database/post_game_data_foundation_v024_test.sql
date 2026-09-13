begin;

select plan(20);

select has_table('public', 'brain_snapshots', 'snapshot table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.brain_snapshots'::regclass), 'snapshot RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.brain_snapshots', 'SELECT'), 'browser cannot read snapshots directly');
select ok(not has_table_privilege('authenticated', 'public.brain_snapshots', 'INSERT'), 'browser cannot write snapshots directly');
select ok((select prosecdef from pg_proc where oid = 'private.append_brain_snapshot_impl(uuid,text,text,text,text,jsonb)'::regprocedure), 'snapshot writer is private definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.append_brain_snapshot_impl(uuid,text,text,text,text,jsonb)'::regprocedure), 'snapshot writer pins empty search path');
select ok((select prosecdef from pg_proc where oid = 'private.load_brain_snapshots_impl(uuid)'::regprocedure), 'snapshot reader is private definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.load_brain_snapshots_impl(uuid)'::regprocedure), 'snapshot reader pins empty search path');
select ok(has_function_privilege('authenticated', 'public.append_brain_snapshot(uuid,text,text,text,text,jsonb)', 'execute'), 'authenticated uses snapshot wrapper');
select ok(not has_function_privilege('anon', 'private.append_brain_snapshot_impl(uuid,text,text,text,text,jsonb)', 'execute'), 'anonymous cannot use private snapshot writer');

insert into auth.users(id, aud, role, email, is_anonymous)
values ('70000000-0000-0000-0000-000000000024','authenticated','authenticated','postgame-staff@example.test',false);
insert into public.staff_members(id, auth_user_id, display_name, active)
values ('71000000-0000-0000-0000-000000000024','70000000-0000-0000-0000-000000000024','Postgame Staff',true);
insert into auth.users(id, aud, role, email, is_anonymous)
values ('70000000-0000-0000-0000-000000000025','authenticated','authenticated','postgame-player@example.test',true);

update public.games set lifecycle = 'live' where code = 'TEST01';
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000024',true);
select set_config('request.jwt.claims','{"sub":"70000000-0000-0000-0000-000000000024","role":"authenticated","is_anonymous":false}',true);

select is((select sequence from public.append_brain_snapshot('a0000000-0000-0000-0000-000000000050','PHASE_ENTERED','lobby','phase-1','fingerprint-1','{"liarExposure":null,"theoryDiversity":0.5}'::jsonb)),1,'snapshot sequence is server assigned');
select is((select sequence from public.append_brain_snapshot('a0000000-0000-0000-0000-000000000050','PHASE_ENTERED','lobby','phase-1','fingerprint-1','{"liarExposure":null,"theoryDiversity":0.5}'::jsonb)),1,'same trigger retry is idempotent');
reset role;
select is((select count(*) from public.brain_snapshots where session_id = 'a0000000-0000-0000-0000-000000000050'),1::bigint,'idempotent retry creates one row');
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000024',true);
select set_config('request.jwt.claims','{"sub":"70000000-0000-0000-0000-000000000024","role":"authenticated","is_anonymous":false}',true);
select throws_ok($$select * from public.append_brain_snapshot('a0000000-0000-0000-0000-000000000050','PHASE_ENTERED','lobby','phase-1','fingerprint-1','{"theoryDiversity":0.1}'::jsonb)$$,'P0001','SNAPSHOT_ID_CONFLICT','conflicting fingerprint is rejected');
select throws_ok($$select * from public.append_brain_snapshot('a0000000-0000-0000-0000-000000000050','PHASE_ENTERED','lobby','phase-2','fingerprint-2','{"ScenarioTruth":"secret"}'::jsonb)$$,'P0001','SNAPSHOT_METRICS_INVALID','sensitive metrics are rejected');
select * from public.transition_game_narrative_phase('TEST01','lobby','role_reveal','72000000-0000-0000-0000-000000000024');
reset role;
select is((select count(*) from public.brain_snapshots where session_id = 'a0000000-0000-0000-0000-000000000050'),2::bigint,'phase entry creates one snapshot');
set local role authenticated;
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000024',true);
select set_config('request.jwt.claims','{"sub":"70000000-0000-0000-0000-000000000024","role":"authenticated","is_anonymous":false}',true);
select is((select sequence from public.load_brain_snapshots('a0000000-0000-0000-0000-000000000050') order by sequence desc limit 1),2,'snapshots are ordered');
select is((select phase from public.load_brain_snapshots('a0000000-0000-0000-0000-000000000050') order by sequence desc limit 1),'role_reveal','phase is persisted');

select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000025',true);
select set_config('request.jwt.claims','{"sub":"70000000-0000-0000-0000-000000000025","role":"authenticated","is_anonymous":true}',true);
select throws_ok($$select * from public.load_brain_snapshots('a0000000-0000-0000-0000-000000000050')$$,'P0001','STAFF_ACCESS_DENIED','Player cannot load internal snapshots');

reset role;
select is((select count(*) from public.brain_snapshots where session_id = 'a0000000-0000-0000-0000-000000000050'),2::bigint,'snapshot session is isolated');

select * from finish();
rollback;
