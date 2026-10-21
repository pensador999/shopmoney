import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.ts';
import {ContentStudio} from '../src/content-studio/service.ts';
import {StudioOperations} from '../src/content-studio/operations.ts';
import {studioFixture} from '../src/content-studio/fixtures.ts';
import {checkRequest} from '../src/content-studio/contracts.ts';
import {renderDescription} from '../src/content-studio/render.ts';
import {intakeSnapshot} from '../src/content-studio/intake.ts';
import {collectProductPages} from '../src/inspection/collector.ts';
const approval={template:'essential',color:'Areia',operator:'Teste sintético',note:'Revisão sintética sem aceite de cliente.',visualChecked:true,textChecked:true,factsChecked:true};
function setup(){const store=new Store(':memory:'),client=store.client('Fixture','fixture@test.invalid'),studio=new ContentStudio(store),request=studioFixture({workspaceId:'local',clientId:client.id,storeId:'loja'});return{store,studio,request};}
test('pedido vinculado é idempotente, isolado e cancelamento impede aprovação editorial',()=>{
 const {store,studio,request}=setup();try{
  const r=studio.create(request),ops=new StudioOperations(studio),linked=ops.connect(r.id,request.scope);assert(linked.order?.demo);assert.equal(ops.connect(r.id,request.scope).order?.id,linked.order?.id);
  assert.equal(store.orders().length,1);assert.equal(linked.operationalTasks.length,8);assert.equal(linked.editorialTasks.length,0);
  const other=structuredClone(request);other.scope.storeId='outra';const r2=studio.create(other);assert.throws(()=>ops.connect(r2.id,other.scope,linked.order!.id));
  const o=store.get(linked.order!.id);o.revision++;store.save(o);assert(ops.overview(r.id,request.scope).stale);assert.throws(()=>studio.approve(r.id,request.scope,0,approval));assert.equal(ops.connect(r.id,request.scope,o.id).stale,false);o.status='cancelled';store.save(o);assert(ops.overview(r.id,request.scope).blocked);assert.throws(()=>studio.approve(r.id,request.scope,0,approval));assert.throws(()=>studio.structuredAdvice(r.id,request.scope,'production'));
 }finally{store.close();}
});
test('kit mantém dois guias, fontes/unidades e bloqueia guia incompleto ou não aprovado',()=>{
 const {store,studio,request}=setup();try{
  request.adaptive={category:'kit',coverage:{kind:'manual',source:'Fixture',observedAt:new Date().toISOString(),missing:[]},requirements:[],conflicts:[],components:[{id:'top',title:'Parte superior',factIds:['presentation'],mediaIds:[]},{id:'bottom',title:'Parte inferior',factIds:['fit'],mediaIds:[]}],guides:[{id:'a',title:'Guia superior',componentId:'top',source:'Ficha A sintética',unit:'cm',approved:true,columns:['Comprimento'],rows:[{size:'P',values:[62]}]},{id:'b',title:'Guia inferior',componentId:'bottom',source:'Ficha B sintética',unit:'mm',approved:true,columns:['Largura'],rows:[{size:'P',values:[420]}]}]};
  assert.deepEqual(checkRequest(request),[]);const html=renderDescription(request,'essential',{selectedColor:'Areia'}).html;assert(html.includes('Ficha A sintética'));assert(html.includes('Ficha B sintética'));assert.equal((html.match(/<table>/g)??[]).length,2);
  let r=studio.create(request);r=studio.approve(r.id,request.scope,0,approval);r.request.adaptive!.guides![0].rows[0].values=[1,2];r=studio.revise(r.id,request.scope,0,r.request);assert.throws(()=>studio.export(r.id,request.scope,r.revision));assert(checkRequest(r.request).some(i=>i.code==='GUIDE_SHAPE'));
  request.adaptive.guides![0].approved=false;assert(checkRequest(request).some(i=>i.code==='GUIDE_PENDING'));
 }finally{store.close();}
});
test('coleta importa imagens somente como candidatas e mantém SKU ausente sem aprovação presumida',async()=>{
 const {store,request}=setup();try{
  const snapshot=await collectProductPages({origin:'https://example.com',approvedOrigin:'https://example.com',scope:{workspaceId:request.scope.workspaceId,clientId:request.scope.clientId},handles:['peca'],mode:'synthetic'},{transport:async()=>new Response(JSON.stringify({product:{id:'1',handle:'peca',title:'Peça',body_html:'<p>Descrição observada</p>',options:[],variants:[{id:'v',sku:''}],images:[{id:1,src:'https://example.com/a.jpg',variant_ids:['v']}]}}),{headers:{'content-type':'application/json'}})});
  const result=intakeSnapshot(snapshot,request.scope,request.brand);assert.equal(result.records.length,1);assert.equal(result.records[0].product.variants[0].sku,'');assert.equal(result.records[0].media[0].authorized,false);assert.equal(result.records[0].media[0].approved,false);assert.equal(result.records[0].brand.approved,false);
  assert.throws(()=>intakeSnapshot(snapshot,{...request.scope,clientId:'other'},request.brand));
 }finally{store.close();}
});
