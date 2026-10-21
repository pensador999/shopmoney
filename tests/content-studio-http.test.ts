import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import AdmZip from 'adm-zip';
import {Store} from '../src/store.ts';
import {createApp} from '../src/server.ts';

test('painel, prévia isolada e exportação exigem autenticação, escopo e revisão atual aprovada',async()=>{
  const store=new Store(':memory:'),port=14321,server=createApp(store,port);
  await new Promise<void>(r=>server.listen(port,'127.0.0.1',r));
  try{
    const base='http://127.0.0.1:'+port,page=await fetch(base),html=await page.text(),token=html.match(/name="catalog-token" content="([^"]+)/)![1];
    const cookie=page.headers.get('set-cookie')!.split(';')[0];
    const post=async(path:string,body:any)=>fetch(base+'/api/studio/'+path,{method:'POST',headers:{'x-catalog-token':token,'content-type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await fetch(base+'/api/studio/list')).status,400);
    const request=await (await fetch(base+'/api/studio/fixture',{headers:{'x-catalog-token':token}})).json()as any;
    const create=await post('create',{id:randomUUID(),name:'Fixture',email:'studio-http@example.invalid',request});assert.equal(create.status,200);
    const record=await create.json()as any,payload={id:record.id,scope:record.request.scope,revision:0};
    const loaded=await (await post('read',payload)).json()as any;
    assert.equal(loaded.client.email,'studio-http@example.invalid');assert.equal(loaded.client.name,'Fixture');
    const params=new URLSearchParams({workspace:payload.scope.workspaceId,client:payload.scope.clientId,store:payload.scope.storeId,color:'Areia'});
    const url=base+'/content-preview/'+record.id+'/essential/0?'+params;
    assert.equal((await fetch(url)).status,400);
    const preview=await fetch(url,{headers:{cookie}});assert.equal(preview.status,200);
    assert(preview.headers.get('content-security-policy')?.includes('sandbox'));
    assert(!(await preview.text()).includes('<script'));
    assert.equal((await post('export',payload)).status,400);
    const accepted=await post('approve',{...payload,approval:{template:'essential',color:'Areia',operator:'Teste HTTP sintético',note:'Fixture controlada sem aprovação real de cliente.',visualChecked:true,textChecked:true,factsChecked:true}});assert.equal(accepted.status,200);
    const exported=await post('export',payload);assert.equal(exported.status,200);assert(new AdmZip(Buffer.from(await exported.arrayBuffer())).getEntry('previa.html'));
    assert.equal((await post('read',{...payload,scope:{...payload.scope,storeId:'outra'}})).status,400);
    const updated=structuredClone(record.request);updated.product.title='Alteração';
    assert.equal((await post('revise',{...payload,request:updated})).status,200);
    assert.equal((await fetch(url,{headers:{cookie}})).status,400);
    assert.equal((await post('export',{...payload,revision:1})).status,400);
    assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get()?.n,0);
  }finally{await new Promise<void>(r=>server.close(()=>r()));store.close();}
});
