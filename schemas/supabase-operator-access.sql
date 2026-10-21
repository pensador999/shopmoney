create table catanaops.operator_bootstrap (
 email text primary key check(email=lower(trim(email))),
 workspace_id uuid not null references catanaops.workspaces(id),
 claimed_user_id uuid unique references auth.users(id),
 created_at timestamptz not null default now()
);
alter table catanaops.operator_bootstrap enable row level security;
revoke all on catanaops.operator_bootstrap from public,anon,authenticated;
grant select,insert,update on catanaops.operator_bootstrap to service_role;

with workspace as (
 insert into catanaops.workspaces(name) values ('Catana Ops') returning id
)
insert into catanaops.operator_bootstrap(email,workspace_id)
select 'catanaops@gmail.com',id from workspace;

create function catanaops.bind_confirmed_operator()
returns trigger language plpgsql security definer set search_path='' as $$
declare target catanaops.operator_bootstrap%rowtype;
begin
 if new.email_confirmed_at is null or new.is_anonymous is true then return new; end if;
 select * into target from catanaops.operator_bootstrap where email=lower(new.email) for update;
 if not found or (target.claimed_user_id is not null and target.claimed_user_id<>new.id) then return new; end if;
 if target.claimed_user_id is null then
  insert into catanaops.workspace_members(workspace_id,user_id,role)
  values(target.workspace_id,new.id,'admin');
  update catanaops.operator_bootstrap set claimed_user_id=new.id where email=target.email;
 end if;
 return new;
end;
$$;
revoke all on function catanaops.bind_confirmed_operator() from public,anon,authenticated;
create trigger catanaops_confirm_operator after insert or update of email,email_confirmed_at on auth.users
for each row execute function catanaops.bind_confirmed_operator();

grant usage on schema catanaops to authenticated;
grant select on catanaops.workspaces,catanaops.workspace_members,catanaops.clients,catanaops.orders,
 catanaops.order_revisions,catanaops.tasks,catanaops.task_dependencies,catanaops.artifacts,
 catanaops.audit_events,catanaops.payment_events,catanaops.outbox,catanaops.economics_entries to authenticated;

create policy members_self_read on catanaops.workspace_members for select to authenticated using(user_id=(select auth.uid()));
create policy workspace_member_read on catanaops.workspaces for select to authenticated
using(exists(select 1 from catanaops.workspace_members m where m.workspace_id=id and m.user_id=(select auth.uid())));
do $$
declare t text;
begin
 foreach t in array array['clients','orders','order_revisions','tasks','task_dependencies','artifacts','audit_events','payment_events','outbox','economics_entries'] loop
 execute format('create policy member_read on catanaops.%I for select to authenticated using (exists(select 1 from catanaops.workspace_members m where m.workspace_id=%I.workspace_id and m.user_id=(select auth.uid())))',t,t);
 end loop;
end $$;
create policy catanaops_private_member_read on storage.objects for select to authenticated
using(bucket_id='catanaops-private' and exists(
 select 1 from catanaops.workspace_members m
 where m.workspace_id::text=(storage.foldername(name))[1] and m.user_id=(select auth.uid())
));
comment on table catanaops.operator_bootstrap is 'One-time owner binding after Auth confirms the allowlisted email. No public writes or metadata-based authorization.';
