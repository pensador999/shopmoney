begin;
do $$
declare owner_id uuid; own_workspace uuid; foreign_workspace uuid:=gen_random_uuid();
 client_a uuid:=gen_random_uuid();client_b uuid:=gen_random_uuid();
 order_a uuid:=gen_random_uuid();order_b uuid:=gen_random_uuid(); payload jsonb; total bigint;
begin
 select user_id,workspace_id into owner_id,own_workspace from catanaops.workspace_members where role='admin' limit 1;
 if owner_id is null then raise exception 'admin fixture missing'; end if;
 insert into catanaops.workspaces(id,name) values(foreign_workspace,'Synthetic other workspace');
 insert into catanaops.clients(id,workspace_id,name,email) values(client_a,own_workspace,'Synthetic A','a@example.invalid'),(client_b,foreign_workspace,'Synthetic B','b@example.invalid');
 insert into catanaops.orders(id,workspace_id,client_id,amount_cents,currency) values(order_a,own_workspace,client_a,14900,'USD'),(order_b,foreign_workspace,client_b,14900,'USD');
 insert into catanaops.order_revisions(workspace_id,order_id,revision,profile,source_sha256) values(own_workspace,order_a,0,'{}',repeat('a',64)),(foreign_workspace,order_b,0,'{}',repeat('b',64));
 insert into catanaops.tasks(workspace_id,order_id,revision,role,kind,status,idempotency_key,policy_version,business_version)
 select own_workspace,order_a,0,'production','advisory',case when n<=120 then 'queued' else 'done' end,'fixture-'||n,'test','test' from generate_series(1,125)n;
 insert into catanaops.tasks(workspace_id,order_id,revision,role,kind,idempotency_key,policy_version,business_version)
 values(foreign_workspace,order_b,0,'quality','advisory','foreign','test','test');
 insert into catanaops.audit_events(workspace_id,order_id,rule,policy_version,actor,event)
 values(foreign_workspace,order_b,'TEST','test','fixture','foreign-secret-event');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 set local role authenticated;
 payload:=public.catanaops_workflow(order_a);
 if (payload->>'taskCount')::int<>125 or jsonb_array_length(payload->'tasks')<>100 then raise exception 'truncated aggregate'; end if;
 select sum((v->>'total')::int) into total from jsonb_array_elements(payload->'summary') v;
 if total<>125 then raise exception 'summary missing rows'; end if;
 if payload::text like '%foreign-secret-event%' or payload::text like '%'||order_b::text||'%' then raise exception 'tenant leak'; end if;
 begin
  perform public.catanaops_workflow(order_b);raise exception 'foreign order allowed';
 exception when insufficient_privilege then null;
 end;
 payload:=public.catanaops_workflow(null);
 if payload::text like '%'||order_b::text||'%' then raise exception 'general tenant leak'; end if;
 reset role;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 set local role authenticated;
 begin
  perform public.catanaops_workflow(null);raise exception 'outsider allowed';
 exception when insufficient_privilege then null;
 end;
 reset role;
 set local role anon;
 begin
  perform public.catanaops_workflow(null);raise exception 'anon allowed';
 exception when insufficient_privilege then null;
 end;
 reset role;
end $$;
rollback;
