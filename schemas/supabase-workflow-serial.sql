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
