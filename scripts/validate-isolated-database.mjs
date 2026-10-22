// Local PostgreSQL WASM only. No connection string or production credentials.
// Install: npm install --prefix artifacts/isolated-postgres --ignore-scripts --save-exact @electric-sql/pglite@0.5.11
import {PGlite} from '../artifacts/isolated-postgres/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();const checks=[];
const uid='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const ws='20000000-0000-4000-8000-000000000001',ws2='20000000-0000-4000-8000-000000000002';
const order='30000000-0000-4000-8000-000000000001',owner='40000000-0000-4000-8000-000000000001';
async function deny(label,fn,pattern){await assert.rejects(fn,pattern);checks.push(label);}
async function identity(role,id=''){await db.exec(`reset role;set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
async function rpc(action,payload=null,generation=null,version=null,workspace=ws){return (await db.query('select public.catanaops_operation($1,$2,$3,$4::jsonb,$5,$6,$7) as result',[workspace,order,action,payload===null?null:JSON.stringify(payload),owner,generation,version])).rows[0].result;}
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated;
 grant select,insert,update on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;`);
 for(const file of ['foundation','workflow','workflow-serial','operator-access','dashboard','workflow-read','brazil-operations']){
  await db.exec(readFileSync(`schemas/supabase-${file}.sql`,'utf8'));checks.push(`SQL aplicado: ${file}`);
 }
 await db.exec(`insert into auth.users(id,email) values('${uid}','one@example.invalid'),('${other}','two@example.invalid');
 insert into catanaops.workspaces(id,name) values('${ws}','Synthetic A'),('${ws2}','Synthetic B');
 insert into catanaops.workspace_members values('${ws}','${uid}','admin'),('${ws2}','${other}','admin');`);
 const payload={requestHash:'a'.repeat(64),client:{id:uid,name:'Synthetic',email:'client@example.invalid'},order:{id:order,remoteWorkspaceId:ws,clientId:uid,demo:true,currency:'brl',amount:69000,status:'scoped',scopeApproved:false,revision:0,offer:{kind:'catalog',commercialEnabled:false,version:'test'}},tasks:[],files:[{id:"50000000-0000-4000-8000-000000000001",name:"original",path:`${ws}/${order}/0/50000000-0000-4000-8000-000000000001`,sha256:"a".repeat(64),size:10}]};
 await identity('anon');await deny('anon bloqueado',()=>rpc('create',payload),/permission denied/);
 await identity('authenticated','10000000-0000-4000-8000-000000000099');await deny('sem vínculo bloqueado',()=>rpc('create',payload),/membership/);
 await identity('authenticated',uid);const created=await rpc('create',payload);checks.push('criação autenticada');
 assert.deepEqual((await rpc('create',payload)).payload,created.payload);checks.push('repetição idempotente');
 await deny('hash diferente bloqueado',()=>rpc('create',{...payload,requestHash:'b'.repeat(64)}),/Idempotency/);
 await identity('authenticated',other);await deny('outro workspace bloqueado',()=>rpc('get'),/membership/);
 assert.equal((await db.query('select * from catanaops.operation_snapshots')).rows.length,0);checks.push('RLS oculta outro workspace');
 await identity('authenticated',uid);const lease=await rpc('claim');
 await deny('segundo executor bloqueado',()=>rpc('claim'),/busy/);
 await deny('geração antiga bloqueada',()=>rpc('save',created.payload,lease.generation-1,0),/Stale executor/);
 const altered=structuredClone(created.payload);altered.order.amount=1;
 await deny('valor contratado imutável',()=>rpc('save',altered,lease.generation,0),/Immutable contract/);
 await deny('remoção de original bloqueada',()=>rpc('save',{...created.payload,files:[]},lease.generation,0),/Original artifacts/);
 const saved=await rpc('save',created.payload,lease.generation,0);assert.equal(saved.version,1);checks.push('salvamento sob lease');
 await deny('versão antiga bloqueada',()=>rpc('save',created.payload,lease.generation,0),/Stale executor/);
 await identity('postgres');await db.exec(`update catanaops.operation_snapshots set lease_until=now()-interval '1 second'`);
 await identity('authenticated',uid);await deny('lease expirado bloqueado',()=>rpc('save',saved.payload,lease.generation,1),/Stale executor/);
 const next=await rpc('claim');assert.equal(next.generation,lease.generation+1);checks.push('recuperação após expiração');
 await deny('executor substituído não libera lease',()=>rpc('release',null,lease.generation),/Lease replaced/);
 await rpc('release',null,next.generation);checks.push('liberação pelo executor atual');
 await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['catanaops-private',`${ws}/${order}/0/50000000-0000-4000-8000-000000000001`]);checks.push('arquivo privado no pedido de teste');
 await deny('arquivo em outro workspace bloqueado',()=>db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['catanaops-private',`${ws2}/${order}/0/file`]),/row-level security/);
 console.log(JSON.stringify({ok:true,checks},null,2));
}catch(error){console.error(JSON.stringify({ok:false,checks,error:error.message},null,2));process.exitCode=1;}
finally{mkdirSync('artifacts/isolated-postgres',{recursive:true});writeFileSync('artifacts/isolated-postgres/result.json',JSON.stringify({ok:!process.exitCode,checks},null,2));await db.close();}

