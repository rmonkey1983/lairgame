begin;
select plan(7);

select has_function('public', 'load_brain_mission_outcome_metrics', array['uuid'], 'Outcome metrics RPC exists');
select ok((select prosecdef from pg_proc where oid = 'private.load_brain_mission_outcome_metrics_impl(uuid)'::regprocedure), 'Outcome metrics implementation is definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'private.load_brain_mission_outcome_metrics_impl(uuid)'::regprocedure), 'Outcome metrics implementation has empty search path');
select ok(not has_table_privilege('authenticated','public.brain_missions','SELECT'), 'Clients cannot directly read mission outcomes');
select ok(pg_get_function_result('public.load_brain_mission_outcome_metrics(uuid)'::regprocedure) !~* 'scenario_truth|ai|evidence','Metrics projection omits sensitive Brain data');
select ok(pg_get_function_result('public.load_brain_mission_outcome_metrics(uuid)'::regprocedure) ~* 'regia_proposal_id|director_proposal_id','Metrics projection preserves intervention links');
select ok(pg_get_function_result('public.load_brain_mission_outcome_metrics(uuid)'::regprocedure) ~* 'activated_at|outcome_at','Metrics projection preserves before/after timestamps');

select * from finish();
rollback;
