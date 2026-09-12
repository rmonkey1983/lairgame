create table public.scenario_auction_items (
  id uuid primary key default gen_random_uuid(), scenario_version_id uuid not null references public.scenario_versions(id) on delete restrict,
  sequence_number integer not null check (sequence_number > 0), title text not null check (btrim(title) <> ''), teaser text not null check (btrim(teaser) <> ''),
  reward_title text not null check (btrim(reward_title) <> ''), reward_body text not null check (btrim(reward_body) <> ''), created_at timestamptz not null default now(),
  unique (scenario_version_id, sequence_number)
);
alter table public.scenario_auction_items enable row level security;
revoke all on table public.scenario_auction_items from public, anon, authenticated;

create or replace function private.prevent_published_scenario_auction_item_mutation() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.scenario_versions sv where sv.id = coalesce(new.scenario_version_id, old.scenario_version_id) and sv.status = 'published') then raise exception 'PUBLISHED_SCENARIO_IMMUTABLE' using errcode = 'P0001'; end if;
  if tg_op = 'DELETE' then return old; end if; return new;
end; $$;
revoke all on function private.prevent_published_scenario_auction_item_mutation() from public, anon, authenticated;
insert into public.scenario_auction_items (id, scenario_version_id, sequence_number, title, teaser, reward_title, reward_body)
values ('f0000000-0000-0000-0000-000000000211','e0000000-0000-0000-0000-000000000015',1,'La chiave del salone','Un oggetto può cambiare il modo in cui guardate la stanza.','La chiave del salone','Un vantaggio per il tavolo che saprà conquistarlo.');
create trigger scenario_auction_items_published_immutable before update or delete on public.scenario_auction_items for each row execute function private.prevent_published_scenario_auction_item_mutation();

create table public.game_auctions (
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id) on delete restrict, scenario_auction_item_id uuid not null references public.scenario_auction_items(id) on delete restrict,
  status text not null check (status in ('open','closed','no_sale')), winning_table_id uuid, winning_bid integer, opened_at timestamptz not null default now(), closed_at timestamptz,
  foreign key (game_id, winning_table_id) references public.game_tables(game_id, id) on delete restrict,
  check ((status = 'open' and winning_table_id is null and winning_bid is null and closed_at is null) or (status = 'no_sale' and winning_table_id is null and winning_bid is null and closed_at is not null) or (status = 'closed' and winning_table_id is not null and winning_bid > 0 and closed_at is not null)),
  unique (game_id, scenario_auction_item_id)
);
alter table public.game_auctions enable row level security;
revoke all on table public.game_auctions from public, anon, authenticated;

create table public.game_auction_bids (
  id uuid primary key default gen_random_uuid(), game_auction_id uuid not null references public.game_auctions(id) on delete restrict, game_table_id uuid not null references public.game_tables(id) on delete restrict,
  amount integer not null check (amount > 0), command_id uuid not null, created_by_staff_user_id uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
  unique (game_auction_id, command_id)
);
alter table public.game_auction_bids enable row level security;
revoke all on table public.game_auction_bids from public, anon, authenticated;

create table public.game_auction_commands (
  game_id uuid not null references public.games(id) on delete restrict, command_id uuid not null, command_kind text not null check (command_kind in ('open','bid','close','no_sale')), game_auction_id uuid not null references public.game_auctions(id) on delete restrict,
  status text not null, winning_table_id uuid, winning_bid integer, created_at timestamptz not null default now(), primary key (game_id, command_id)
);
alter table public.game_auction_commands enable row level security;
revoke all on table public.game_auction_commands from public, anon, authenticated;

create or replace function private.open_game_auction_impl(p_game_code text, p_command_id uuid)
returns table (game_id uuid, auction_id uuid, item_id uuid, status text, opened_at timestamptz) language plpgsql security definer set search_path = '' as $$
declare v_game public.games%rowtype; v_item public.scenario_auction_items%rowtype; v_auction public.game_auctions%rowtype; v_audit public.game_auction_commands%rowtype; v_code text:=upper(btrim(coalesce(p_game_code,'')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if; if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'STAFF_AUTH_REQUIRED' using errcode='P0001'; end if; if not exists(select 1 from public.staff_members s where s.auth_user_id=auth.uid() and s.active) then raise exception 'STAFF_ACCESS_DENIED' using errcode='P0001'; end if; if p_command_id is null or v_code='' then raise exception 'INVALID_COMMAND' using errcode='P0001'; end if;
  select g.* into v_game from public.games g where upper(btrim(g.code))=v_code for update; if not found then raise exception 'GAME_NOT_FOUND' using errcode='P0001'; end if;
  select a.* into v_audit from public.game_auction_commands a where a.game_id=v_game.id and a.command_id=p_command_id; if found then if v_audit.command_kind<>'open' then raise exception 'AUCTION_COMMAND_CONFLICT' using errcode='P0001'; end if; select a.* into v_auction from public.game_auctions a where a.id=v_audit.game_auction_id; return query select v_audit.game_id,v_audit.game_auction_id,v_auction.scenario_auction_item_id,v_auction.status,v_auction.opened_at; return; end if;
  if v_game.lifecycle<>'live' or v_game.narrative_phase<>'auction' then raise exception 'AUCTION_PHASE_REQUIRED' using errcode='P0001'; end if;
  select i.* into v_item from public.scenario_auction_items i where i.scenario_version_id=v_game.scenario_version_id and i.sequence_number=1; if not found then raise exception 'AUCTION_ITEM_NOT_FOUND' using errcode='P0001'; end if;
  select a.* into v_auction from public.game_auctions a where a.game_id=v_game.id and a.scenario_auction_item_id=v_item.id for update;
  if found then raise exception 'AUCTION_ALREADY_EXISTS' using errcode='P0001'; end if;
  insert into public.game_auctions(game_id,scenario_auction_item_id,status) values(v_game.id,v_item.id,'open') returning * into v_auction;
  insert into public.game_auction_commands(game_id,command_id,command_kind,game_auction_id,status) values(v_game.id,p_command_id,'open',v_auction.id,'open');
  perform realtime.send(pg_catalog.jsonb_build_object('kind','auction_changed'),'auction_changed','game:'||v_game.id::text,true);
  return query select v_game.id,v_auction.id,v_item.id,v_auction.status,v_auction.opened_at;
end; $$;
revoke all on function private.open_game_auction_impl(text,uuid) from public,anon,authenticated; grant execute on function private.open_game_auction_impl(text,uuid) to authenticated;
create or replace function public.open_game_auction(game_code text, command_id uuid) returns table(game_id uuid,auction_id uuid,item_id uuid,status text,opened_at timestamptz) language sql security invoker as $$ select * from private.open_game_auction_impl($1,$2); $$;
revoke execute on function public.open_game_auction(text,uuid) from public,anon,authenticated; grant execute on function public.open_game_auction(text,uuid) to authenticated;

create or replace function private.record_game_auction_bid_impl(p_game_code text,p_table_number integer,p_amount integer,p_command_id uuid)
returns table(game_id uuid,auction_id uuid,table_number integer,amount integer,command_id uuid,created_at timestamptz) language plpgsql security definer set search_path = '' as $$
declare v_game public.games%rowtype; v_table public.game_tables%rowtype; v_auction public.game_auctions%rowtype; v_bid public.game_auction_bids%rowtype; v_code text:=upper(btrim(coalesce(p_game_code,'')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if; if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'STAFF_AUTH_REQUIRED' using errcode='P0001'; end if; if not exists(select 1 from public.staff_members s where s.auth_user_id=auth.uid() and s.active) then raise exception 'STAFF_ACCESS_DENIED' using errcode='P0001'; end if; if p_command_id is null or p_table_number is null or p_amount is null or p_amount<=0 or v_code='' then raise exception 'INVALID_BID' using errcode='P0001'; end if;
  select g.* into v_game from public.games g where upper(btrim(g.code))=v_code for update; if not found then raise exception 'GAME_NOT_FOUND' using errcode='P0001'; end if; if v_game.lifecycle<>'live' or v_game.narrative_phase<>'auction' then raise exception 'AUCTION_PHASE_REQUIRED' using errcode='P0001'; end if;
  select a.* into v_auction from public.game_auctions a where a.game_id=v_game.id and a.status='open' for update; if not found then raise exception 'AUCTION_NOT_OPEN' using errcode='P0001'; end if;
  select gt.* into v_table from public.game_tables gt where gt.game_id=v_game.id and gt.table_number=p_table_number; if not found then raise exception 'TABLE_NOT_FOUND' using errcode='P0001'; end if;
  select b.* into v_bid from public.game_auction_bids b where b.game_auction_id=v_auction.id and b.command_id=p_command_id; if found then if v_bid.game_table_id<>v_table.id or v_bid.amount<>p_amount then raise exception 'AUCTION_COMMAND_CONFLICT' using errcode='P0001'; end if; return query select v_game.id,v_auction.id,p_table_number,v_bid.amount,v_bid.command_id,v_bid.created_at; return; end if;
  if p_amount>(select coalesce(sum(l.delta),0) from public.table_coin_ledger l where l.game_id=v_game.id and l.game_table_id=v_table.id) then raise exception 'INSUFFICIENT_TABLE_COINS' using errcode='P0001'; end if;
  if exists(select 1 from public.game_auction_bids b where b.game_auction_id=v_auction.id and (b.amount>p_amount or b.amount=p_amount and b.created_at<=now())) then raise exception 'BID_NOT_HIGH_ENOUGH' using errcode='P0001'; end if;
  insert into public.game_auction_bids(game_auction_id,game_table_id,amount,command_id,created_by_staff_user_id) values(v_auction.id,v_table.id,p_amount,p_command_id,auth.uid()) returning * into v_bid;
  perform realtime.send(pg_catalog.jsonb_build_object('kind','auction_changed'),'auction_changed','game:'||v_game.id::text,true);
  return query select v_game.id,v_auction.id,p_table_number,v_bid.amount,v_bid.command_id,v_bid.created_at;
end; $$;
revoke all on function private.record_game_auction_bid_impl(text,integer,integer,uuid) from public,anon,authenticated; grant execute on function private.record_game_auction_bid_impl(text,integer,integer,uuid) to authenticated;
create or replace function public.record_game_auction_bid(game_code text,table_number integer,amount integer,command_id uuid) returns table(game_id uuid,auction_id uuid,table_number integer,amount integer,command_id uuid,created_at timestamptz) language sql security invoker as $$ select * from private.record_game_auction_bid_impl($1,$2,$3,$4); $$;
revoke execute on function public.record_game_auction_bid(text,integer,integer,uuid) from public,anon,authenticated; grant execute on function public.record_game_auction_bid(text,integer,integer,uuid) to authenticated;

create or replace function private.close_game_auction_impl(p_game_code text,p_command_id uuid,p_no_sale boolean)
returns table(game_id uuid,auction_id uuid,status text,winning_table_number integer,winning_bid integer,closed_at timestamptz) language plpgsql security definer set search_path = '' as $$
declare v_game public.games%rowtype; v_auction public.game_auctions%rowtype; v_audit public.game_auction_commands%rowtype; v_bid public.game_auction_bids%rowtype; v_table_number integer; v_balance bigint; v_code text:=upper(btrim(coalesce(p_game_code,''))); v_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if; if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'STAFF_AUTH_REQUIRED' using errcode='P0001'; end if; if not exists(select 1 from public.staff_members s where s.auth_user_id=auth.uid() and s.active) then raise exception 'STAFF_ACCESS_DENIED' using errcode='P0001'; end if; if p_command_id is null or v_code='' then raise exception 'INVALID_COMMAND' using errcode='P0001'; end if;
  select g.* into v_game from public.games g where upper(btrim(g.code))=v_code for update; if not found then raise exception 'GAME_NOT_FOUND' using errcode='P0001'; end if;
  select a.* into v_audit from public.game_auction_commands a where a.game_id=v_game.id and a.command_id=p_command_id; if found then if (p_no_sale and v_audit.command_kind<>'no_sale') or (not p_no_sale and v_audit.command_kind<>'close') then raise exception 'AUCTION_COMMAND_CONFLICT' using errcode='P0001'; end if; return query select v_audit.game_id,v_audit.game_auction_id,v_audit.status,(select gt.table_number from public.game_tables gt where gt.id=v_audit.winning_table_id),v_audit.winning_bid,v_audit.created_at; return; end if;
  if v_game.lifecycle<>'live' or v_game.narrative_phase<>'auction' then raise exception 'AUCTION_PHASE_REQUIRED' using errcode='P0001'; end if;
  select a.* into v_auction from public.game_auctions a where a.game_id=v_game.id and a.status='open' for update; if not found then raise exception 'AUCTION_NOT_OPEN' using errcode='P0001'; end if;
  if p_no_sale then
    if exists(select 1 from public.game_auction_bids b where b.game_auction_id=v_auction.id) then raise exception 'BIDS_PRESENT' using errcode='P0001'; end if;
    v_status:='no_sale'; update public.game_auctions set status=v_status,closed_at=now() where id=v_auction.id;
    insert into public.game_auction_commands(game_id,command_id,command_kind,game_auction_id,status) values(v_game.id,p_command_id,'no_sale',v_auction.id,v_status);
    perform realtime.send(pg_catalog.jsonb_build_object('kind','auction_changed'),'auction_changed','game:'||v_game.id::text,true);
    return query select v_game.id,v_auction.id,v_status,null::integer,null::integer,now(); return;
  end if;
  select b.* into v_bid from public.game_auction_bids b where b.game_auction_id=v_auction.id order by b.amount desc,b.created_at asc,b.id asc limit 1; if not found then raise exception 'NO_BIDS' using errcode='P0001'; end if;
  select gt.table_number into v_table_number from public.game_tables gt where gt.id=v_bid.game_table_id; select coalesce(sum(l.delta),0)::bigint into v_balance from public.table_coin_ledger l where l.game_id=v_game.id and l.game_table_id=v_bid.game_table_id; if v_balance<v_bid.amount then raise exception 'INSUFFICIENT_TABLE_COINS' using errcode='P0001'; end if;
  update public.game_auctions set status='closed',winning_table_id=v_bid.game_table_id,winning_bid=v_bid.amount,closed_at=now() where id=v_auction.id;
  insert into public.table_coin_ledger(game_id,game_table_id,delta,reason,correlation_id,created_by_staff_user_id) values(v_game.id,v_bid.game_table_id,-v_bid.amount,'Asta: '||(select i.title from public.game_auctions a join public.scenario_auction_items i on i.id=a.scenario_auction_item_id where a.id=v_auction.id),p_command_id,auth.uid());
  insert into public.game_auction_commands(game_id,command_id,command_kind,game_auction_id,status,winning_table_id,winning_bid) values(v_game.id,p_command_id,'close',v_auction.id,'closed',v_bid.game_table_id,v_bid.amount);
  perform realtime.send(pg_catalog.jsonb_build_object('kind','auction_changed'),'auction_changed','game:'||v_game.id::text,true);
  return query select v_game.id,v_auction.id,'closed'::text,v_table_number,v_bid.amount,now();
end; $$;
revoke all on function private.close_game_auction_impl(text,uuid,boolean) from public,anon,authenticated; grant execute on function private.close_game_auction_impl(text,uuid,boolean) to authenticated;
create or replace function public.close_game_auction(game_code text,command_id uuid) returns table(game_id uuid,auction_id uuid,status text,winning_table_number integer,winning_bid integer,closed_at timestamptz) language sql security invoker as $$ select * from private.close_game_auction_impl($1,$2,false); $$;
create or replace function public.close_game_auction_no_sale(game_code text,command_id uuid) returns table(game_id uuid,auction_id uuid,status text,winning_table_number integer,winning_bid integer,closed_at timestamptz) language sql security invoker as $$ select * from private.close_game_auction_impl($1,$2,true); $$;
revoke execute on function public.close_game_auction(text,uuid),public.close_game_auction_no_sale(text,uuid) from public,anon,authenticated; grant execute on function public.close_game_auction(text,uuid),public.close_game_auction_no_sale(text,uuid) to authenticated;

create or replace function private.get_staff_game_auction_impl(p_game_code text)
returns table(auction_id uuid,item_title text,item_teaser text,status text,bids jsonb,current_highest_bid integer,current_highest_table_number integer,winning_table_number integer,winning_bid integer,table_balances jsonb) language plpgsql security definer set search_path = '' as $$
declare v_game_id uuid; v_code text:=upper(btrim(coalesce(p_game_code,''))); begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if; if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'STAFF_AUTH_REQUIRED' using errcode='P0001'; end if; if not exists(select 1 from public.staff_members s where s.auth_user_id=auth.uid() and s.active) then raise exception 'STAFF_ACCESS_DENIED' using errcode='P0001'; end if; select g.id into v_game_id from public.games g where upper(btrim(g.code))=v_code; if not found then raise exception 'GAME_NOT_FOUND' using errcode='P0001'; end if;
  return query select a.id,i.title,i.teaser,coalesce(a.status,'not_open')::text,coalesce((select jsonb_agg(jsonb_build_object('table_number',gt.table_number,'amount',b.amount,'created_at',b.created_at) order by b.amount desc,b.created_at asc,b.id asc) from public.game_auction_bids b join public.game_tables gt on gt.id=b.game_table_id where b.game_auction_id=a.id),'[]'::jsonb), (select b.amount from public.game_auction_bids b where b.game_auction_id=a.id order by b.amount desc,b.created_at asc,b.id asc limit 1),(select gt.table_number from public.game_auction_bids b join public.game_tables gt on gt.id=b.game_table_id where b.game_auction_id=a.id order by b.amount desc,b.created_at asc,b.id asc limit 1),(select gt.table_number from public.game_tables gt where gt.id=a.winning_table_id),a.winning_bid,(select jsonb_agg(jsonb_build_object('table_number',gt.table_number,'balance',coalesce((select sum(l.delta)::bigint from public.table_coin_ledger l where l.game_id=v_game_id and l.game_table_id=gt.id),0)) order by gt.table_number) from public.game_tables gt where gt.game_id=v_game_id) from public.games g join public.scenario_auction_items i on i.scenario_version_id=g.scenario_version_id and i.sequence_number=1 left join public.game_auctions a on a.game_id=g.id and a.scenario_auction_item_id=i.id where g.id=v_game_id;
end; $$;
revoke all on function private.get_staff_game_auction_impl(text) from public,anon,authenticated; grant execute on function private.get_staff_game_auction_impl(text) to authenticated;
create or replace function public.get_staff_game_auction(game_code text) returns table(auction_id uuid,item_title text,item_teaser text,status text,bids jsonb,current_highest_bid integer,current_highest_table_number integer,winning_table_number integer,winning_bid integer,table_balances jsonb) language sql security invoker as $$ select * from private.get_staff_game_auction_impl($1); $$;
revoke execute on function public.get_staff_game_auction(text) from public,anon,authenticated; grant execute on function public.get_staff_game_auction(text) to authenticated;

create or replace function private.transition_game_narrative_phase_impl(p_game_code text,p_expected_phase text,p_target_phase text,p_command_id uuid)
returns table(game_id uuid,game_code text,previous_phase text,phase text,command_id uuid,changed_at timestamptz) language plpgsql security definer set search_path = '' as $$
declare v_game public.games%rowtype; v_staff_id uuid; v_audit public.game_narrative_phase_commands%rowtype; v_code text:=upper(btrim(coalesce(p_game_code,''))); v_expected text:=lower(btrim(coalesce(p_expected_phase,''))); v_target text:=lower(btrim(coalesce(p_target_phase,'')));
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if; if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'STAFF_AUTH_REQUIRED' using errcode='P0001'; end if; select s.id into v_staff_id from public.staff_members s where s.auth_user_id=auth.uid() and s.active; if not found then raise exception 'STAFF_ACCESS_DENIED' using errcode='P0001'; end if; if p_command_id is null or v_code='' then raise exception 'INVALID_COMMAND' using errcode='P0001'; end if;
  if v_expected not in ('lobby','role_reveal','briefing','discovery','comparison','pressure','auction','deliberation','final_vote','reveal') or v_target not in ('lobby','role_reveal','briefing','discovery','comparison','pressure','auction','deliberation','final_vote','reveal') then raise exception 'INVALID_PHASE' using errcode='P0001'; end if;
  select g.* into v_game from public.games g where upper(btrim(g.code))=v_code for update; if not found then raise exception 'GAME_NOT_FOUND' using errcode='P0001'; end if; select a.* into v_audit from public.game_narrative_phase_commands a where a.game_id=v_game.id and a.command_id=p_command_id; if found then if v_audit.from_phase<>v_expected or v_audit.to_phase<>v_target then raise exception 'CONFLICT' using errcode='P0001'; end if; return query select v_audit.game_id,v_game.code,v_audit.from_phase,v_audit.to_phase,v_audit.command_id,v_audit.created_at; return; end if;
  if v_game.lifecycle<>'live' then raise exception 'GAME_NOT_LIVE' using errcode='P0001'; end if; if v_game.narrative_phase<>v_expected then raise exception 'STALE_GAME_STATE' using errcode='P0001'; end if;
  if not ((v_expected='lobby' and v_target='role_reveal') or (v_expected='role_reveal' and v_target='briefing') or (v_expected='briefing' and v_target='discovery') or (v_expected='discovery' and v_target='comparison') or (v_expected='comparison' and v_target='pressure') or (v_expected='pressure' and v_target='auction') or (v_expected='auction' and v_target='deliberation') or (v_expected='deliberation' and v_target='final_vote') or (v_expected='final_vote' and v_target='reveal')) then raise exception 'INVALID_PHASE_TRANSITION' using errcode='P0001'; end if;
  if v_expected='auction' and not exists(select 1 from public.game_auctions a where a.game_id=v_game.id and a.status in ('closed','no_sale')) then raise exception 'AUCTION_NOT_SETTLED' using errcode='P0001'; end if;
  update public.games set narrative_phase=v_target,updated_at=now() where id=v_game.id; insert into public.game_narrative_phase_commands(command_id,game_id,staff_member_id,from_phase,to_phase) values(p_command_id,v_game.id,v_staff_id,v_expected,v_target) returning created_at into v_audit.created_at; return query select v_game.id,v_game.code,v_expected,v_target,p_command_id,v_audit.created_at;
end; $$;
