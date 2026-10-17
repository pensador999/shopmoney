-- Server-only workflow foundation; application adapter is a separate increment.
alter table catanaops.orders add column scope_approved boolean not null default false;
alter table catanaops.orders add column payment_confirmed boolean not null default false;
alter table catanaops.orders add column lock_version bigint not null default 0;
-- Local revisions start at zero; align remote contract before any data migration.
alter table catanaops.orders drop constraint orders_revision_check;
alter table catanaops.orders alter column revision set default 0;
alter table catanaops.orders add constraint orders_revision_check check(revision>=0);

create table catanaops.order_revisions (
 workspace_id uuid not null, order_id uuid not null, revision integer not null check(revision>=0),
 profile jsonb not null, source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 primary key(workspace_id,order_id,revision),
 foreign key(workspace_id,order_id) references catanaops.orders(workspace_id,id)
);
create table catanaops.tasks (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
 order_id uuid not null, revision integer not null,
 role text not null check(role in ('research','sales','support','planner','production','quality','finance','coordinator')),
 kind text not null check(kind in ('advisory','production','quality','delivery','payment','close')),
 status text not null default 'queued' check(status in ('queued','running','done','needs_attention','cancelled')),
 idempotency_key text not null, policy_version text not null, business_version text not null,
 input jsonb not null default '{}', result jsonb,
 attempts integer not null default 0 check(attempts>=0), max_attempts integer not null default 3 check(max_attempts between 1 and 3),
 next_at timestamptz not null default now(), lease_owner uuid, lease_until timestamptz,
 generation bigint not null default 0, created_at timestamptz not null default now(), completed_at timestamptz,
 unique(workspace_id,id), unique(workspace_id,idempotency_key),
 foreign key(workspace_id,order_id,revision) references catanaops.order_revisions(workspace_id,order_id,revision)
);
create index tasks_order_idx on catanaops.tasks(workspace_id,order_id,revision);
create index tasks_claim_idx on catanaops.tasks(workspace_id,status,next_at);
create table catanaops.task_dependencies (
 workspace_id uuid not null, task_id uuid not null, dependency_id uuid not null,
 primary key(workspace_id,task_id,dependency_id), check(task_id<>dependency_id),
 foreign key(workspace_id,task_id) references catanaops.tasks(workspace_id,id),
 foreign key(workspace_id,dependency_id) references catanaops.tasks(workspace_id,id)
);
create index task_dependencies_reverse_idx on catanaops.task_dependencies(workspace_id,dependency_id);
create table catanaops.artifacts (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
 order_id uuid not null, revision integer not null, name text not null,
 bucket text not null default 'catanaops-private' check(bucket='catanaops-private'),
 object_path text not null unique,
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), size_bytes bigint not null check(size_bytes>=0),
 created_at timestamptz not null default now(),
 unique(workspace_id,order_id,revision,name),
 check(object_path=workspace_id::text||'/'||order_id::text||'/'||revision::text||'/'||id::text),
 foreign key(workspace_id,order_id,revision) references catanaops.order_revisions(workspace_id,order_id,revision)
);
create table catanaops.audit_events (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references catanaops.workspaces(id),
 order_id uuid, rule text not null, policy_version text not null, actor text not null,
 event text not null, data jsonb not null default '{}', created_at timestamptz not null default now(),
 foreign key(workspace_id,order_id) references catanaops.orders(workspace_id,id)
);
create index audit_events_order_idx on catanaops.audit_events(workspace_id,order_id,created_at);
create table catanaops.payment_events (
 workspace_id uuid not null references catanaops.workspaces(id), provider text not null,
 mode text not null check(mode in ('test','live')), event_id text not null,
 order_id uuid, verified_at timestamptz not null, processed_at timestamptz,
 payload_sha256 text not null check(payload_sha256 ~ '^[a-f0-9]{64}$'),
 primary key(workspace_id,provider,mode,event_id),
 foreign key(workspace_id,order_id) references catanaops.orders(workspace_id,id)
);
create index payment_events_order_idx on catanaops.payment_events(workspace_id,order_id);
create table catanaops.outbox (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
 order_id uuid not null, revision integer not null, idempotency_key text not null,
 recipient text not null, kind text not null, subject text not null, body text not null,
 mode text not null default 'test' check(mode in ('test','live')),
 status text not null default 'draft' check(status in ('draft','approved','sending','sent','uncertain','cancelled')),
 provider_message_id text, created_at timestamptz not null default now(),
 unique(workspace_id,idempotency_key),
 foreign key(workspace_id,order_id,revision) references catanaops.order_revisions(workspace_id,order_id,revision)
);
create table catanaops.economics_entries (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, order_id uuid not null,
 hours numeric(10,2) not null check(hours>=0), fees_cents integer not null check(fees_cents>=0),
 costs_cents integer not null check(costs_cents>=0), note text not null check(length(note)>=10),
 created_at timestamptz not null default now(),
 foreign key(workspace_id,order_id) references catanaops.orders(workspace_id,id)
);
create index outbox_order_idx on catanaops.outbox(workspace_id,order_id,revision);
create index economics_entries_order_idx on catanaops.economics_entries(workspace_id,order_id);
do $$
declare t text;
begin
 foreach t in array array['order_revisions','tasks','task_dependencies','artifacts','audit_events','payment_events','outbox','economics_entries'] loop
  execute format('alter table catanaops.%I enable row level security',t);
  execute format('revoke all on catanaops.%I from public,anon,authenticated',t);
  execute format('grant select,insert on catanaops.%I to service_role',t);
 end loop;
end $$;
grant update on catanaops.tasks,catanaops.payment_events,catanaops.outbox to service_role;
-- Originals, revisions, financial entries and audit are append-only for backend.
create function catanaops.claim_task(p_workspace uuid,p_owner uuid,p_seconds integer default 120)
returns setof catanaops.tasks language plpgsql security invoker set search_path='' as $$
begin
 if p_workspace is null or p_owner is null or p_seconds not between 10 and 180 then raise exception 'Invalid lease'; end if;
 update catanaops.tasks set status='needs_attention',lease_owner=null,lease_until=null
 where workspace_id=p_workspace and status='running' and lease_until<clock_timestamp() and attempts>=max_attempts;
 return query
 with candidate as (
  select t.id from catanaops.tasks t
  join catanaops.orders o on o.workspace_id=t.workspace_id and o.id=t.order_id
  where t.workspace_id=p_workspace and t.attempts<t.max_attempts and t.next_at<=clock_timestamp()
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
create function catanaops.finish_task(p_workspace uuid,p_id uuid,p_owner uuid,p_generation bigint,p_result jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare affected integer;
begin
 if p_result is null then raise exception 'Missing result'; end if;
 update catanaops.tasks t set status='done',result=p_result,completed_at=clock_timestamp(),lease_owner=null,lease_until=null
 from catanaops.orders o
 where t.workspace_id=p_workspace and t.id=p_id and t.lease_owner=p_owner and t.generation=p_generation
 and t.status='running' and t.lease_until>clock_timestamp()
 and o.id=t.order_id and o.workspace_id=t.workspace_id and o.revision=t.revision
 and o.status not in ('cancelled','refund_pending','refunded','closed');
 get diagnostics affected=row_count;
 return affected=1;
end $$;
revoke all on function catanaops.claim_task(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function catanaops.finish_task(uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function catanaops.claim_task(uuid,uuid,integer) to service_role;
grant execute on function catanaops.finish_task(uuid,uuid,uuid,bigint,jsonb) to service_role;
insert into storage.buckets(id,name,public,file_size_limit)
values('catanaops-private','catanaops-private',false,8000000);
