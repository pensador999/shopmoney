begin;
set local role service_role;
do $$
declare w uuid; c uuid; o uuid; advisory uuid; production uuid; a catanaops.tasks; b catanaops.tasks; owner_a uuid:=gen_random_uuid(); owner_b uuid:=gen_random_uuid(); n integer;
begin
 insert into catanaops.workspaces(name) values('synthetic-workflow') returning id into w;
 insert into catanaops.clients(workspace_id,name,email) values(w,'synthetic','synthetic@example.invalid') returning id into c;
 insert into catanaops.orders(workspace_id,client_id,amount_cents,currency,status) values(w,c,14900,'USD','queued') returning id into o;
 insert into catanaops.order_revisions(workspace_id,order_id,revision,profile,source_sha256) values(w,o,0,'{}',repeat('a',64));
 insert into catanaops.tasks(workspace_id,order_id,revision,role,kind,idempotency_key,policy_version,business_version)
 values(w,o,0,'planner','advisory','planning','test','test') returning id into advisory;
 insert into catanaops.tasks(workspace_id,order_id,revision,role,kind,idempotency_key,policy_version,business_version)
 values(w,o,0,'production','production','production','test','test') returning id into production;
 insert into catanaops.task_dependencies values(w,production,advisory);
 select * into a from catanaops.claim_task(w,owner_a,120);
 if a.id is distinct from advisory then raise exception 'Wrong dependency scheduling'; end if;
 insert into catanaops.tasks(workspace_id,order_id,revision,role,kind,idempotency_key,policy_version,business_version)
 values(w,o,0,'coordinator','advisory','independent','test','test');
 select count(*) into n from catanaops.claim_task(w,owner_b,120);
 if n<>0 then raise exception 'Concurrent duplicate claim'; end if;
 update catanaops.tasks set status='cancelled' where workspace_id=w and idempotency_key='independent';
 if catanaops.finish_task(w,a.id,owner_b,a.generation,'{}') then raise exception 'Wrong owner accepted'; end if;
 update catanaops.tasks set lease_until=clock_timestamp()-interval '1 second' where id=a.id;
 select * into b from catanaops.claim_task(w,owner_b,120);
 if b.id is distinct from a.id or b.generation<=a.generation then raise exception 'Recovery failed'; end if;
 if catanaops.finish_task(w,a.id,owner_a,a.generation,'{}') then raise exception 'Stale worker accepted'; end if;
 if not catanaops.finish_task(w,b.id,owner_b,b.generation,'{"synthetic":true}') then raise exception 'Current worker rejected'; end if;
 select count(*) into n from catanaops.claim_task(w,owner_a,120);
 if n<>0 then raise exception 'Unpaid production claimed'; end if;
 update catanaops.orders set scope_approved=true,payment_confirmed=true where id=o;
 select * into a from catanaops.claim_task(w,owner_a,120);
 if a.id is distinct from production then raise exception 'Paid production blocked'; end if;
 update catanaops.orders set status='cancelled' where id=o;
 if catanaops.finish_task(w,a.id,owner_a,a.generation,'{}') then raise exception 'Cancelled result accepted'; end if;
 begin
  insert into catanaops.tasks(workspace_id,order_id,revision,role,kind,idempotency_key,policy_version,business_version)
  values(w,o,0,'production','production','production','test','test');
  raise exception 'Duplicate task accepted';
 exception when unique_violation then null;
 end;
 begin
  execute 'set local role anon';
  perform count(*) from catanaops.orders;
  raise exception 'Anonymous access accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
