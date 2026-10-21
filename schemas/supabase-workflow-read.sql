create function public.catanaops_workflow(p_order uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare selected jsonb; allowed uuid[];
begin
 if auth.uid() is null or not exists(select 1 from catanaops.workspace_members where user_id=auth.uid()) then
  raise exception 'Workspace membership required' using errcode='42501';
 end if;
 select array_agg(workspace_id) into allowed from catanaops.workspace_members where user_id=auth.uid();
 if allowed is null then raise exception 'Workspace membership required' using errcode='42501'; end if;
 if p_order is not null then
  select jsonb_build_object('id',id,'workspace_id',workspace_id,'status',status,'revision',revision,'mode',mode,'scope_approved',scope_approved,'payment_confirmed',payment_confirmed,'created_at',created_at)
  into selected from catanaops.orders where id=p_order and workspace_id=any(allowed);
  if selected is null then raise exception 'Order not available' using errcode='42501'; end if;
 end if;
 return jsonb_build_object(
  'source','Supabase','queriedAt',statement_timestamp(),'order',selected,
  'summary',(select coalesce(jsonb_agg(to_jsonb(g)),'[]'::jsonb) from
    (select role,status,count(*) as total from catanaops.tasks
     where workspace_id=any(allowed) and (p_order is null or order_id=p_order) group by role,status) g),
  'taskCount',(select count(*) from catanaops.tasks where workspace_id=any(allowed) and (p_order is null or order_id=p_order)),
  'tasks',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from
    (select id,order_id,revision,role,kind,status,attempts,max_attempts,created_at,completed_at,next_at,lease_until
     from catanaops.tasks where workspace_id=any(allowed) and (p_order is null or order_id=p_order) order by created_at desc,id limit 100) t),
  'events',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from
    (select id,order_id,rule,event,created_at from catanaops.audit_events where workspace_id=any(allowed) and p_order is not null and order_id=p_order order by created_at desc,id limit 20) e),
  'scope','Tarefas registradas, incluindo revisões anteriores. Não inclui a fila Eve local.'
 );
end $$;
revoke all on function public.catanaops_workflow(uuid) from public,anon;
grant execute on function public.catanaops_workflow(uuid) to authenticated;
notify pgrst,'reload schema';
