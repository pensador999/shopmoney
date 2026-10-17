create schema catanaops;
revoke all on schema catanaops from public, anon, authenticated;
grant usage on schema catanaops to service_role;
create table catanaops.workspaces (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name))>0),
 created_at timestamptz not null default now()
);
create table catanaops.workspace_members (
 workspace_id uuid not null references catanaops.workspaces(id),
 user_id uuid not null references auth.users(id),
 role text not null check(role in ('operator','admin')),
 primary key(workspace_id,user_id)
);
create index workspace_members_user_idx on catanaops.workspace_members(user_id);
create table catanaops.clients (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references catanaops.workspaces(id),
 name text not null check(length(trim(name))>0),
 email text not null check(email=lower(trim(email))),
 created_at timestamptz not null default now(),
 unique(workspace_id,id), unique(workspace_id,email)
);
create table catanaops.orders (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 client_id uuid not null,
 status text not null default 'needs_info' check(status in ('needs_info','scoped','awaiting_payment','queued','running','ready','delivered','closed','cancelled','refund_pending','refunded','needs_attention','revision_approval','checkout_expired')),
 mode text not null default 'test' check(mode in ('test','live')),
 revision integer not null default 1 check(revision>0),
 amount_cents integer not null check(amount_cents>=0),
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 created_at timestamptz not null default now(),
 unique(workspace_id,id),
 foreign key(workspace_id,client_id) references catanaops.clients(workspace_id,id)
);
create index orders_client_idx on catanaops.orders(workspace_id,client_id);
alter table catanaops.workspaces enable row level security;
alter table catanaops.workspace_members enable row level security;
alter table catanaops.clients enable row level security;
alter table catanaops.orders enable row level security;
revoke all on all tables in schema catanaops from public,anon,authenticated;
grant select,insert,update,delete on all tables in schema catanaops to service_role;
comment on schema catanaops is 'Catana Ops foundation. Private server-only access; application migration not yet connected.';
