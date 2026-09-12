begin;
select plan(22);
select has_table('public', 'table_coin_ledger', 'table Coin ledger exists');
select has_function('public', 'adjust_table_coins', array['text','integer','integer','text','uuid'], 'coin adjustment RPC exists');
select has_function('public', 'get_staff_game_coins', array['text'], 'Staff coin read RPC exists');
select ok((select prosecdef from pg_proc where oid = 'private.adjust_table_coins_impl(text,integer,integer,text,uuid)'::regprocedure), 'coin command implementation is definer');
select ok(not (select prosecdef from pg_proc where oid = 'public.adjust_table_coins(text,integer,integer,text,uuid)'::regprocedure), 'coin command wrapper is invoker');
select ok(not has_table_privilege('authenticated', 'public.table_coin_ledger', 'SELECT'), 'ledger is not directly readable');
select is((select count(*) from public.table_coin_ledger where game_id = 'a0000000-0000-0000-0000-000000000050'), 5::bigint, 'TEST01 has five initial ledger rows');
select is((select min(total) from (select sum(delta) as total from public.table_coin_ledger where game_id='a0000000-0000-0000-0000-000000000050' group by game_table_id) balances), 20::bigint, 'TEST01 initial balances are twenty');

insert into auth.users (id, aud, role, email, is_anonymous) values
 ('00000000-0000-0000-0000-000000000601','authenticated','authenticated','coin-staff@example.test',false),
 ('00000000-0000-0000-0000-000000000602','authenticated','authenticated','coin-other@example.test',false),
 ('00000000-0000-0000-0000-000000000603','authenticated','authenticated','coin-player@example.test',true);
insert into public.staff_members (id, auth_user_id, display_name, active) values
 ('40000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000601','Coin Staff',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated","is_anonymous":false}',true);
select is((select count(*) from public.get_staff_game_coins('TEST01')),5::bigint,'active Staff reads all table balances');
select is((select balance from public.adjust_table_coins('TEST01', 1, 5, 'Premio test', '60000000-0000-0000-0000-000000000601')), 25::bigint, 'active Staff can grant coins');
select is((select balance from public.adjust_table_coins('TEST01', 1, -10, 'Spesa test', '60000000-0000-0000-0000-000000000602')), 15::bigint, 'active Staff can debit available coins');
select throws_ok($$select * from public.adjust_table_coins('TEST01',1,0,'zero','60000000-0000-0000-0000-000000000603')$$,'P0001','INVALID_COIN_ADJUSTMENT','zero delta rejected');
select throws_ok($$select * from public.adjust_table_coins('TEST01',1,1,'','60000000-0000-0000-0000-000000000604')$$,'P0001','INVALID_COIN_ADJUSTMENT','empty reason rejected');
select throws_ok($$select * from public.adjust_table_coins('TEST01',1,-100,'Too much','60000000-0000-0000-0000-000000000605')$$,'P0001','INSUFFICIENT_TABLE_COINS','negative balance rejected');
select is((select count(*) from public.adjust_table_coins('TEST01',1,5,'Premio test','60000000-0000-0000-0000-000000000601')),1::bigint,'same command is idempotent');
select throws_ok($$select * from public.adjust_table_coins('TEST01',1,6,'Different','60000000-0000-0000-0000-000000000601')$$,'P0001','COIN_COMMAND_CONFLICT','different payload conflicts');
select is((select count(*) from public.adjust_table_coins('TEST01',1,5,'Premio test','60000000-0000-0000-0000-000000000601')),1::bigint,'retry returns one completed result');
select is((select count(*) from realtime.messages where topic='game:a0000000-0000-0000-0000-000000000050' and event='table_coin_changed'),2::bigint,'each real mutation emits one wake-up');
reset role;
select throws_ok($$update public.table_coin_ledger set reason='changed' where correlation_id='d0000000-0000-0000-0000-000000000201'$$,'P0001','TABLE_COIN_LEDGER_IMMUTABLE','ledger rows are immutable');
reset role;
insert into public.players (id, game_id, auth_user_id, table_id, seat_number, nickname) values
 ('20000000-0000-0000-0000-000000000601','a0000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000603','b0000000-0000-0000-0000-000000000051',1,'Coin Player');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000603',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000603","role":"authenticated","is_anonymous":true}',true);
select is((select table_coin_balance from public.get_my_player_state('TEST01')),15::bigint,'Player sees own table balance');
select is((select count(*) from public.get_my_player_state('TEST01')),1::bigint,'Player state remains one caller row');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000602',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000602","role":"authenticated","is_anonymous":false}',true);
select throws_ok($$select * from public.get_staff_game_coins('TEST01')$$,'P0001','STAFF_ACCESS_DENIED','non Staff denied coin read');
reset role;
select * from finish();
rollback;
