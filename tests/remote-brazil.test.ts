import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RemoteOperations } from '../src/remote-operations.ts';

// Contract fixture, not evidence that the migration/RLS ran in Supabase.
const workspace='00000000-0000-4000-8000-000000000001';
function fixture(){
  let state:any;const objects=new Map<string,Buffer>();let failUpload=false;let stealLease=false;
  const transport=async(path:string,init:RequestInit)=>{
    if(path.endsWith('catanaops_dashboard'))return Response.json({workspaces:[{id:workspace}]});
    if(path.endsWith('catanaops_operation')){
      const b=JSON.parse(init.body as string);if(b.p_workspace!==workspace)return new Response('',{status:403});
      if(b.p_action==='create'){
        if(state){if(state.payload.requestHash!==b.p_payload.requestHash)return new Response('',{status:409});}
        else state={payload:b.p_payload,version:0,generation:0,lease_owner:null};
      }else if(!state||b.p_order!==state.payload.order.id)return new Response('',{status:403});
      else if(b.p_action==='claim'){if(state.lease_owner)return new Response('',{status:409});state.lease_owner=b.p_owner;state.generation++;}
      else if(b.p_action==='save'){if(stealLease){state.generation++;state.lease_owner='replacement';}if(b.p_generation!==state.generation||b.p_owner!==state.lease_owner||b.p_version!==state.version)return new Response('',{status:409});state.payload=b.p_payload;state.version++;}
      else if(b.p_action==='release'){if(state.generation===b.p_generation&&state.lease_owner===b.p_owner)state.lease_owner=null;}
      return Response.json(state);
    }
    const key=path.replace('/authenticated/','/');
    if(init.method==='POST'){
      if(failUpload)return new Response('',{status:503});if(objects.has(key))return new Response('',{status:409});objects.set(key,Buffer.from(init.body as Uint8Array));return new Response('{}');
    }
    const bytes=objects.get(key);return bytes?new Response(new Uint8Array(bytes)):new Response('',{status:404});
  };
  const remote=new RemoteOperations({url:'https://aqkwbmggkvvfhqaivxlh.supabase.co',key:'synthetic-public',token:'synthetic-user'},transport);
  return {remote,objects,get state(){return state;},set failUpload(v:boolean){failUpload=v;},set stealLease(v:boolean){stealLease=v;}};
}
const input=()=>({id:randomUUID(),name:'Marca sintética',email:'synthetic@example.com',service:'diagnostic' as const,demo:true as const,brief:{products:[{id:'P001',title:'Camiseta',description:'',source:'Fixture'}]}});
test('ponte remota simulada: cria, retoma, processa, baixa e não duplica produção',async()=>{
  const f=fixture(),i=input();let s=await f.remote.create(workspace,i);assert.equal(s.payload.order.status,'scoped');
  const duplicate=await f.remote.create(workspace,i);assert.equal(duplicate.payload.order.id,i.id);assert.equal(f.objects.size,2);
  await f.remote.action(workspace,i.id,'approve');await f.remote.action(workspace,i.id,'demoPayment');
  s=await f.remote.action(workspace,i.id,'process');assert.equal(s.payload.order.status,'ready');
  const count=f.objects.size;await f.remote.action(workspace,i.id,'process');assert.equal(f.objects.size,count);
  assert((await f.remote.download(workspace,i.id)).length>100);await f.remote.action(workspace,i.id,'demoDelivery');
  assert.equal(f.objects.size,count+1);
  assert.equal((await f.remote.create(workspace,i)).payload.order.id,i.id);assert.equal(f.objects.size,count+1);
  s=await f.remote.action(workspace,i.id,'economics',{hours:1,stageHours:{intake:0.25,production:0.75},fees:0,costs:0,taxes:0,note:'Custos sintéticos declarados'});assert.equal(s.payload.order.taxes,0);
  assert(s.payload.files.some(file=>file.name==='coordinator-0.json'));
  assert.equal(s.payload.order.stageHours?.production,0.75);
  await f.remote.action(workspace,i.id,'revise',{brief:{products:[{id:'P001',title:'Camiseta Revisada',description:'Algodão',source:'Fixture'}]},reason:'scope-adjustment'});
  s=await f.remote.action(workspace,i.id,'revisionApprove');
  assert.equal(s.payload.order.status,'queued');
  assert(s.payload.files.some(file=>file.name==='support-1.json'));
  assert(s.payload.files.some(file=>file.name==='planner-1.json'));
  assert.equal(f.state.lease_owner,null);
});
test('upload interrompido persiste identidade; repetir mesma solicitação recupera originais',async()=>{
  const f=fixture(),i=input();f.failUpload=true;await assert.rejects(()=>f.remote.create(workspace,i),/Upload/);assert.equal(f.state.payload.order.id,i.id);f.failUpload=false;
  assert.equal((await f.remote.create(workspace,i)).payload.order.id,i.id);assert.equal(f.objects.size,2);
  await assert.rejects(()=>f.remote.create(workspace,{...i,name:'Outro escopo'}),/indisponível/);
});
test('arquivo adulterado e workspace divergente não entram no executor',async()=>{
  const f=fixture(),i=input();await f.remote.create(workspace,i);const key=[...f.objects.keys()][0];f.objects.set(key,Buffer.from('adulterado'));
  await assert.rejects(()=>f.remote.action(workspace,i.id,'approve'),/adulterado/);assert.equal(f.state.lease_owner,null);
  await assert.rejects(()=>f.remote.action(randomUUID(),i.id,'inspect'),/indisponível/);
});
test('executor substituído não confirma resultado no armazenamento remoto',async()=>{
  const f=fixture(),i=input();await f.remote.create(workspace,i);f.stealLease=true;
  await assert.rejects(()=>f.remote.action(workspace,i.id,'approve'),/indisponível/);assert.equal(f.state.payload.order.status,'scoped');
});
test('aprendizado sobrevive à retomada remota e fica vinculado ao pedido',async()=>{
  const f=fixture(),i=input();await f.remote.create(workspace,i);
  let state=await f.remote.action(workspace,i.id,'learningPropose',{problem:'Título ausente',evidence:['Teste sintético'],proposedRule:'Conferir título no intake'});
  const proposal=state.payload.order.learningProposals![0];assert.equal(proposal.status,'proposed');
  state=await f.remote.action(workspace,i.id,'learningReview',{id:proposal.id,approved:true,testEvidence:'Teste aprovado pelo operador'});
  assert.equal(state.payload.order.learningProposals![0].status,'approved');
  assert.equal(state.payload.order.learningProposals![0].scope,'client-only');
});

test('artefatos remotos preservam histórico e retomada carrega a versão atual',async()=>{
 const f=fixture(),i=input();let state=await f.remote.create(workspace,i);
 const oldFiles=structuredClone(state.payload.files);
 await f.remote.action(workspace,i.id,'approve');
 state=await f.remote.action(workspace,i.id,'economics',{hours:1,fees:0,costs:0,taxes:0,note:'Primeira medição sintética'});
 const previousCoordinator=state.payload.files.find(file=>file.name==='coordinator-0.json')!;
 state=await f.remote.action(workspace,i.id,'economics',{hours:2,fees:0,costs:0,taxes:0,note:'Segunda medição sintética'});
 for(const original of [...oldFiles,previousCoordinator])assert(state.payload.files.some(file=>file.id===original.id&&file.sha256===original.sha256));
 const hydrated=await f.remote.hydrate(state.payload);
 try{assert.equal(hydrated.get(i.id).hours,2);
  const current=state.payload.files.filter(file=>file.name==='coordinator-0.json').at(-1)!;
  assert.equal(hydrated.artifact(i.id,'coordinator-0.json').toString(),f.objects.get('/storage/v1/object/catanaops-private/'+current.path)!.toString());
 }finally{hydrated.close();}
});
