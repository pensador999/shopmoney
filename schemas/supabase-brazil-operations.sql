-- Additive validation-only bridge. SECURITY INVOKER, membership and explicit workspace predicates.
-- Snapshot of an MCP migration to apply after approval review becomes available.
create table catanaops.operation_snapshots (
 workspace_id uuid not null,order_id uuid not null,payload jsonb not null,
 version bigint not null default 0,generation bigint not null default 0,
 lease_owner uuid,lease_until timestamptz,updated_at timestamptz not null default now(),
 primary key(workspace_id,order_id),
 foreign key(workspace_id,order_id) references catanaops.orders(workspace_id,id),
 check(coalesce(payload->'order'->>'demo'='true',false)),
 check(coalesce(payload->'order'->>'currency'='brl',false))
);
alter table catanaops.operation_snapshots enable row level security;
revoke all on catanaops.operation_snapshots from public,anon,authenticated;
grant select,insert,update on catanaops.operation_snapshots to authenticated;
create policy operation_member_read on catanaops.operation_snapshots for select to authenticated
using(exists(select 1 from catanaops.workspace_members m where m.workspace_id=operation_snapshots.workspace_id and m.user_id=(select auth.uid())));
create policy operation_member_insert on catanaops.operation_snapshots for insert to authenticated
with check(exists(select 1 from catanaops.workspace_members m where m.workspace_id=operation_snapshots.workspace_id and m.user_id=(select auth.uid())));
create policy operation_member_update on catanaops.operation_snapshots for update to authenticated
using(exists(select 1 from catanaops.workspace_members m where m.workspace_id=operation_snapshots.workspace_id and m.user_id=(select auth.uid())))
with check(exists(select 1 from catanaops.workspace_members m where m.workspace_id=operation_snapshots.workspace_id and m.user_id=(select auth.uid())));

-- Operators can write only test-mode rows in their own workspace. No new access to live payments/outbox.
grant insert,update on catanaops.clients,catanaops.orders,catanaops.tasks to authenticated;
grant insert on catanaops.order_revisions,catanaops.artifacts,catanaops.audit_events to authenticated;
create policy brazil_client_insert on catanaops.clients for insert to authenticated with check(exists(select 1 from catanaops.workspace_members m where m.workspace_id=clients.workspace_id and m.user_id=(select auth.uid())));
create policy brazil_client_update on catanaops.clients for update to authenticated
using(exists(select 1 from catanaops.workspace_members m where m.workspace_id=clients.workspace_id and m.user_id=(select auth.uid())))
with check(exists(select 1 from catanaops.workspace_members m where m.workspace_id=clients.workspace_id and m.user_id=(select auth.uid())));
create policy brazil_order_insert on catanaops.orders for insert to authenticated with check(mode='test' and exists(select 1 from catanaops.workspace_members m where m.workspace_id=orders.workspace_id and m.user_id=(select auth.uid())));
create policy brazil_order_update on catanaops.orders for update to authenticated
using(mode='test' and exists(select 1 from catanaops.workspace_members m where m.workspace_id=orders.workspace_id and m.user_id=(select auth.uid())))
with check(mode='test' and exists(select 1 from catanaops.workspace_members m where m.workspace_id=orders.workspace_id and m.user_id=(select auth.uid())));
do $$ declare t text; begin
 foreach t in array array['order_revisions','artifacts','audit_events','tasks'] loop
 execute format('create policy brazil_test_insert on catanaops.%I for insert to authenticated with check(exists(select 1 from catanaops.orders o join catanaops.workspace_members m on m.workspace_id=o.workspace_id where o.workspace_id=%I.workspace_id and o.id=%I.order_id and o.mode=''test'' and m.user_id=(select auth.uid())))',t,t,t);
 end loop;
end $$;
create policy brazil_task_update on catanaops.tasks for update to authenticated
using(exists(select 1 from catanaops.orders o join catanaops.workspace_members m on m.workspace_id=o.workspace_id where o.workspace_id=tasks.workspace_id and o.id=tasks.order_id and o.mode='test' and m.user_id=(select auth.uid())))
with check(exists(select 1 from catanaops.orders o join catanaops.workspace_members m on m.workspace_id=o.workspace_id where o.workspace_id=tasks.workspace_id and o.id=tasks.order_id and o.mode='test' and m.user_id=(select auth.uid())));

create function public.catanaops_operation(p_workspace uuid,p_order uuid,p_action text,p_payload jsonb default null,p_owner uuid default null,p_generation bigint default null,p_version bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r catanaops.operation_snapshots%rowtype; c uuid; o jsonb; t jsonb; f jsonb; role_name text; kind_name text; state_name text; rev integer;
begin
 if auth.uid() is null or not exists(select 1 from catanaops.workspace_members where workspace_id=p_workspace and user_id=auth.uid()) then raise exception 'Workspace membership required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,0));
 select * into r from catanaops.operation_snapshots where workspace_id=p_workspace and order_id=p_order for update;
 if p_action='create' and r.order_id is not null then
   if r.payload->>'requestHash' is distinct from p_payload->>'requestHash' then raise exception 'Idempotency conflict';end if;
 elsif p_action='create' then
   o:=p_payload->'order';
   if (o->>'id')::uuid is distinct from p_order or (o->>'remoteWorkspaceId')::uuid is distinct from p_workspace or o->>'demo' is distinct from 'true' or o->>'currency' is distinct from 'brl' or o->'offer'->>'commercialEnabled' is distinct from 'false' or coalesce(o->>'status','') not in ('scoped','needs_info') or coalesce(o->'offer'->>'kind','') not in ('diagnostic','images','content','catalog','combined') or coalesce(p_payload->>'requestHash','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid validation snapshot';end if;
   insert into catanaops.clients(id,workspace_id,name,email) values(coalesce((p_payload->'client'->>'id')::uuid,gen_random_uuid()),p_workspace,p_payload->'client'->>'name',lower(p_payload->'client'->>'email'))
   on conflict(workspace_id,email) do update set name=excluded.name returning id into c;
   p_payload:=jsonb_set(jsonb_set(p_payload,'{order,clientId}',to_jsonb(c::text)),'{client,id}',to_jsonb(c::text));
   p_payload:=jsonb_set(p_payload,'{tasks}',coalesce((select jsonb_agg(jsonb_set(item,'{clientId}',to_jsonb(c::text))) from jsonb_array_elements(p_payload->'tasks') item),'[]'::jsonb));
   if o->'brandProfile' is not null and exists(select 1 from catanaops.operation_snapshots s where s.workspace_id=p_workspace and s.payload->'order'->>'clientId'=c::text and s.payload->'order'->'brandProfile'->>'version'=o->'brandProfile'->>'version' and s.payload->'order'->'brandProfile' is distinct from o->'brandProfile') then raise exception 'Brand profile version conflict';end if;
   insert into catanaops.orders(id,workspace_id,client_id,status,mode,revision,amount_cents,currency)
   values(p_order,p_workspace,c,o->>'status','test',0,(o->>'amount')::integer,'BRL');
   insert into catanaops.operation_snapshots(workspace_id,order_id,payload) values(p_workspace,p_order,p_payload) returning * into r;
 elsif r.order_id is null then raise exception 'Order not available' using errcode='42501';
 elsif p_action='get' then null;
 elsif p_action='claim' then
   if p_owner is null or exists(select 1 from catanaops.operation_snapshots where workspace_id=p_workspace and lease_until>clock_timestamp()) then raise exception 'Executor busy';end if;
   update catanaops.operation_snapshots set lease_owner=p_owner,lease_until=clock_timestamp()+interval '180 seconds',generation=generation+1 where workspace_id=p_workspace and order_id=p_order returning * into r;
 elsif p_action='release' then
   update catanaops.operation_snapshots set lease_owner=null,lease_until=null where workspace_id=p_workspace and order_id=p_order and lease_owner=p_owner and generation=p_generation returning * into r;
   if not found then raise exception 'Lease replaced';end if;
 elsif p_action='save' then
   if p_owner is null or r.lease_until is null or r.lease_owner is distinct from p_owner or r.generation is distinct from p_generation or r.version is distinct from p_version or r.lease_until<=clock_timestamp() then raise exception 'Stale executor';end if;
   o:=p_payload->'order';
   if o->>'id' is distinct from r.payload->'order'->>'id' or o->>'clientId' is distinct from r.payload->'order'->>'clientId' or o->'offer' is distinct from r.payload->'order'->'offer' or o->>'amount' is distinct from r.payload->'order'->>'amount' or o->>'currency' is distinct from 'brl' or o->>'demo' is distinct from 'true' or (o->>'remoteWorkspaceId')::uuid is distinct from p_workspace or p_payload->>'requestHash' is distinct from r.payload->>'requestHash' or p_payload->'client' is distinct from r.payload->'client' then raise exception 'Immutable contract changed';end if;
   if (o->>'revision')::integer not between (r.payload->'order'->>'revision')::integer and (r.payload->'order'->>'revision')::integer+1 then raise exception 'Invalid revision';end if;
   if exists(select 1 from jsonb_array_elements(r.payload->'files') old_file where not exists(select 1 from jsonb_array_elements(p_payload->'files') new_file where old_file=new_file)) then raise exception 'Original artifacts cannot change';end if;
   update catanaops.operation_snapshots set payload=p_payload,version=version+1,updated_at=clock_timestamp() where workspace_id=p_workspace and order_id=p_order returning * into r;
   update catanaops.orders set status=o->>'status',revision=(o->>'revision')::integer,scope_approved=(o->>'scopeApproved')::boolean,payment_confirmed=coalesce(o->>'receipt','')='DEMO-NO-MONEY',lock_version=r.version where workspace_id=p_workspace and id=p_order and mode='test';
 else raise exception 'Unknown action';end if;

 if p_action in ('create','save') then
   o:=r.payload->'order';rev:=(o->>'revision')::integer;
   insert into catanaops.order_revisions(workspace_id,order_id,revision,profile,source_sha256)
   values(p_workspace,p_order,rev,jsonb_build_object('offer',o->'offer','mapping',o->'mapping'),(select x->>'sha256' from jsonb_array_elements(r.payload->'files') x where x->>'name'='original')) on conflict do nothing;
   for t in select * from jsonb_array_elements(r.payload->'tasks') loop
     role_name:=case t->>'owner' when 'Atendimento' then 'support' when 'Planejamento' then 'planner' when 'Financeiro' then 'finance' when 'Produção' then 'production' when 'Qualidade' then 'quality' else 'coordinator' end;
     kind_name:=case t->>'step' when 'production' then 'production' when 'quality' then 'quality' when 'delivery' then 'delivery' when 'payment' then 'payment' when 'close' then 'close' else 'advisory' end;
     state_name:=case t->>'state' when 'done' then 'done' when 'cancelled' then 'cancelled' when 'action_required' then 'queued' else 'needs_attention' end;
     insert into catanaops.tasks(workspace_id,order_id,revision,role,kind,status,idempotency_key,policy_version,business_version,input,result,attempts)
     values(p_workspace,p_order,rev,role_name,kind_name,state_name,t->>'id',o->'offer'->>'version',o->'offer'->>'version',jsonb_build_object('validationProjection',true,'doNotDispatch',true),t,coalesce((t->>'attempts')::integer,0))
     on conflict(workspace_id,idempotency_key) do update set status=excluded.status,result=excluded.result,attempts=excluded.attempts;
   end loop;
   for f in select * from jsonb_array_elements(r.payload->'files') loop
     if f->>'path'<>p_workspace::text||'/'||p_order::text||'/'||split_part(f->>'path','/',3)||'/'||(f->>'id') then raise exception 'Invalid artifact path';end if;
     insert into catanaops.artifacts(id,workspace_id,order_id,revision,name,object_path,sha256,size_bytes)
     values((f->>'id')::uuid,p_workspace,p_order,split_part(f->>'path','/',3)::integer,f->>'name',f->>'path',f->>'sha256',(f->>'size')::bigint) on conflict do nothing;
   end loop;
   insert into catanaops.audit_events(workspace_id,order_id,rule,policy_version,actor,event,data)
   values(p_workspace,p_order,'SCOPE-01',o->'offer'->>'version',auth.uid()::text,'validation_snapshot_'||p_action,jsonb_build_object('version',r.version,'generation',r.generation));
 end if;
 return jsonb_build_object('payload',r.payload,'version',r.version,'generation',r.generation,'lease_owner',r.lease_owner);
end $$;
revoke all on function public.catanaops_operation(uuid,uuid,text,jsonb,uuid,bigint,bigint) from public,anon;
grant execute on function public.catanaops_operation(uuid,uuid,text,jsonb,uuid,bigint,bigint) to authenticated;
create policy catanaops_validation_upload on storage.objects for insert to authenticated
with check(bucket_id='catanaops-private' and array_length(storage.foldername(name),1)=3 and exists(select 1 from catanaops.orders o join catanaops.workspace_members m on m.workspace_id=o.workspace_id where o.workspace_id::text=(storage.foldername(name))[1] and o.id::text=(storage.foldername(name))[2] and o.mode='test' and m.user_id=(select auth.uid())));

-- Legacy dispatcher must not claim read-model projections from this bridge.
create or replace function catanaops.claim_task(p_workspace uuid,p_owner uuid,p_seconds integer default 120)
returns setof catanaops.tasks language plpgsql security invoker set search_path='' as $$
begin
 if p_workspace is null or p_owner is null or p_seconds not between 10 and 180 then raise exception 'Invalid lease'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text,0));
 update catanaops.tasks set status='needs_attention',lease_owner=null,lease_until=null
 where workspace_id=p_workspace and status='running' and lease_until<clock_timestamp() and attempts>=max_attempts;
 if exists(select 1 from catanaops.tasks where workspace_id=p_workspace and status='running' and lease_until>clock_timestamp()) then return; end if;
 return query
 with candidate as (
  select t.id from catanaops.tasks t
  join catanaops.orders o on o.workspace_id=t.workspace_id and o.id=t.order_id
  where t.workspace_id=p_workspace and coalesce(t.input->>'doNotDispatch','false')<>'true' and t.attempts<t.max_attempts and t.next_at<=clock_timestamp()
   and (t.status='queued' or (t.status='running' and t.lease_until<clock_timestamp()))
   and t.revision=o.revision
   and o.status not in ('cancelled','refund_pending','refunded','closed')
   and (t.kind<>'production' or (o.scope_approved and o.payment_confirmed and o.status in ('queued','running')))
   and not exists (
    select 1 from catanaops.task_dependencies d join catanaops.tasks dep on dep.workspace_id=d.workspace_id and dep.id=d.dependency_id
    where d.workspace_id=t.workspace_id and d.task_id=t.id and dep.status<>'done'
   )
  order by t.created_at,t.id for update of t skip locked limit 1
 )
 update catanaops.tasks t set status='running',attempts=t.attempts+1,generation=t.generation+1,
 lease_owner=p_owner,lease_until=clock_timestamp()+make_interval(secs=>p_seconds)
 from candidate c where t.id=c.id returning t.*;
end $$;
