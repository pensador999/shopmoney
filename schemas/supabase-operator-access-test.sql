begin;
do $$
declare owner_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid(); workspace uuid;
begin
 select workspace_id into workspace from catanaops.operator_bootstrap where email='catanaops@gmail.com';
 insert into auth.users(id,email,email_confirmed_at,is_anonymous) values(owner_id,'catanaops@gmail.com',null,false);
 if exists(select 1 from catanaops.workspace_members where user_id=owner_id) then raise exception 'unverified owner granted'; end if;
 update auth.users set email_confirmed_at=now() where id=owner_id;
 if not exists(select 1 from catanaops.workspace_members where user_id=owner_id and workspace_id=workspace and role='admin') then raise exception 'verified owner missing'; end if;
 insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values(outsider_id,'outsider@example.invalid',now(),false,'{"role":"admin"}');
 perform set_config('request.jwt.claim.sub',outsider_id::text,true);
 set local role authenticated;
 if exists(select 1 from catanaops.workspaces) then raise exception 'outsider workspace visible'; end if;
 if exists(select 1 from catanaops.workspace_members) then raise exception 'outsider member visible'; end if;
 reset role;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 set local role authenticated;
 if (select count(*) from catanaops.workspaces)<>1 then raise exception 'owner workspace invisible'; end if;
 if (select count(*) from catanaops.workspace_members)<>1 then raise exception 'owner membership invisible'; end if;
 begin
  insert into catanaops.workspace_members(workspace_id,user_id,role) values(workspace,outsider_id,'admin');
  raise exception 'membership mutation allowed';
 exception when insufficient_privilege then null;
 end;
 reset role;
end $$;
rollback;
