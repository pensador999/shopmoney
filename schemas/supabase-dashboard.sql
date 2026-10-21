create function public.catanaops_dashboard()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from catanaops.workspace_members where user_id=auth.uid()) then
  raise exception 'Workspace membership required' using errcode='42501';
 end if;
 return jsonb_build_object(
  'workspaces',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'role',m.role)), '[]'::jsonb) from catanaops.workspaces w join catanaops.workspace_members m on w.id=m.workspace_id where m.user_id=auth.uid()),
  'counts',jsonb_build_object('clients',(select count(*) from catanaops.clients),'orders',(select count(*) from catanaops.orders),'tasks',(select count(*) from catanaops.tasks),'artifacts',(select count(*) from catanaops.artifacts)),
  'orders',(select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from (select id,workspace_id,status,mode,revision,amount_cents,currency,created_at from catanaops.orders order by created_at desc,id limit 20) o),
  'tasks',(select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (select id,order_id,role,status,attempts,created_at from catanaops.tasks order by created_at desc,id limit 30) t),
  'phase','validation','readOnly',true
 );
end $$;
revoke all on function public.catanaops_dashboard() from public,anon;
grant execute on function public.catanaops_dashboard() to authenticated;
notify pgrst,'reload schema';
