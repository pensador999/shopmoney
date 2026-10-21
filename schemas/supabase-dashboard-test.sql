begin;
do $$
declare member uuid; data jsonb;
begin
 select user_id into member from catanaops.workspace_members where role='admin' limit 1;
 perform set_config('request.jwt.claim.sub',member::text,true);
 set local role authenticated;
 data:=public.catanaops_dashboard();
 if jsonb_array_length(data->'workspaces')<>1 or data->'readOnly'<>'true'::jsonb then raise exception 'wrong dashboard'; end if;
 reset role;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 set local role authenticated;
 begin
  perform public.catanaops_dashboard();
  raise exception 'outsider allowed';
 exception when insufficient_privilege then null;
 end;
 reset role;
 set local role anon;
 begin
  perform public.catanaops_dashboard();
  raise exception 'anon allowed';
 exception when insufficient_privilege then null;
 end;
 reset role;
end $$;
rollback;
