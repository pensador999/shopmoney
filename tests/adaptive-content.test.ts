import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'csv-parse/sync';
import {Store} from '../src/store.ts';
import {ContentStudio} from '../src/content-studio/service.ts';
import {studioFixture} from '../src/content-studio/fixtures.ts';
import {pending,catalogFiles,validateDeliverable} from '../src/content-studio/adaptive.ts';
import {Examples} from '../src/content-studio/examples.ts';
import {checkRequest} from '../src/content-studio/contracts.ts';
import {enqueueAgent,runAgentQueue} from '../src/agents.ts';

function setup(){const store=new Store(':memory:'),client=store.client('Fictícia','test@example.invalid');const studio=new ContentStudio(store),request=studioFixture({workspaceId:'local',clientId:client.id,storeId:'test'});request.adaptive={category:'camiseta',coverage:{kind:'manual',source:'Fixture',observedAt:new Date().toISOString(),missing:[]},requirements:[],conflicts:[],components:[]};return {store,studio,request};}
const approval={template:'essential',color:'Areia',operator:'Teste sintético',note:'Conferência de fixture sintética.',visualChecked:true,textChecked:true,factsChecked:true};
const reply=(deliverable:unknown)=>({summary_pt:'Teste controlado, sem IA real',reply_client:'',language:'pt-BR',action:'information',rule:'QA-01',deliverable});
test('lacunas opcionais não bloqueiam; conflito e requisito essencial bloqueiam somente a ficha afetada',()=>{
  const {store,studio,request}=setup();try{
    request.product.facts=[];const incomplete=studio.create(request);assert(pending(incomplete.request).some(q=>q.id.startsWith('FACTS_MISSING')));
    const valid=studioFixture(request.scope);valid.adaptive=request.adaptive;
    valid.adaptive!.requirements=[{id:'care',question:'Cuidados disponíveis?',required:false,factIds:[]}];assert.equal(checkRequest(valid).length,0);
    valid.adaptive!.requirements[0].required=true;assert(checkRequest(valid).some(i=>i.code==='REQUIRED_PENDING'));
    assert.equal(checkRequest(studioFixture(request.scope)).length,0);
  }finally{store.close();}
});
test('cadastro preserva grade não cartesiana, zeros, preço e CSV com caracteres especiais',()=>{
  const {store,request}=setup();try{
    request.product.existing=false;request.product.title='Camiseta; "Especial"\nNova';
    request.adaptive!.catalog={currency:'BRL',source:'Ficha sintética',approved:true,variants:request.product.variants.map((v,i)=>({variantId:v.id,price:'49.90',barcode:'00000'+i,stock:null}))};
    const files=catalogFiles(request,'essential','Areia');
    const rows=parse(files['bling-validacao.csv']!,{columns:true,bom:true,delimiter:';'}) as Record<string,string>[];assert.equal(rows.length,4);assert.equal(rows[0]['Descrição'],request.product.title);assert.equal(rows[1]['GTIN/EAN'],'000000');assert.equal(rows[1]['Estoque'],'');
    const shop=parse(files['shopify-rascunhos.csv']!,{columns:true}) as Record<string,string>[];assert.equal(shop.length,3);assert.equal(shop[0].SKU,'000120-AREIA-P');assert.equal(shop[0].Price,'49.90');assert(shop.every((r:any)=>r.Status==='draft'));
    request.adaptive!.catalog.variants.pop();assert.throws(()=>catalogFiles(request,'essential','Areia'));
  }finally{store.close();}
});
test('alegações de couro, composição e costura sem fonte são recusadas no contrato',()=>{
  const {store,request}=setup();try{for(const text of ['Couro legítimo','100% poliéster','Costuras planas anti-atrito','Solado antiderrapante'])assert.throws(()=>validateDeliverable(request,'production',{kind:'draft',blocks:[{id:'b',section:'features',text,factIds:['fit']}]}));}finally{store.close();}
});
test('produção estruturada, aplicação idempotente, revisão e QA independente controlam aprovação',async()=>{
  const {store,studio,request}=setup();try{
    let r=studio.create(request),task=studio.structuredAdvice(r.id,request.scope,'production');enqueueAgent(store,task.role,task.input,task.clientId,task.id);
    await runAgentQueue(store,async()=>reply({kind:'draft',blocks:[{id:'b',section:'presentation',text:'A gola redonda acompanha a camiseta de manga curta.',factIds:['presentation']}]}));
    r=studio.applyDraft(r.id,request.scope,0,task.id);assert.equal(r.revision,1);assert(!r.request.blocks[0].approved);assert.equal(studio.applyDraft(r.id,request.scope,0,task.id).revision,1);
    assert.throws(()=>studio.approve(r.id,request.scope,1,approval));
    r.request.blocks[0].approved=true;r=studio.revise(r.id,request.scope,1,r.request);
    task=studio.structuredAdvice(r.id,request.scope,'quality');enqueueAgent(store,task.role,task.input,task.clientId,task.id);
    await runAgentQueue(store,async()=>reply({kind:'quality',verdict:'pass',findings:[],limits:['Fixture; imagem não analisada.']}));
    r=studio.approve(r.id,request.scope,r.revision,approval);assert.equal(r.status,'approved');assert(studio.export(r.id,request.scope,r.revision).length>0);
    r=studio.approve(r.id,request.scope,r.revision,{...approval,template:'editorial'});assert(studio.export(r.id,request.scope,r.revision).length>0);
    const examples=new Examples(store);studio.learn(r.id,request.scope,{problem:'Texto genérico anterior',reason:'Revisão destaca manga curta e gola sem inventar fatos.',operator:'Teste'});
    assert.equal(examples.retrieve(request.scope,'camiseta','manga curta gola','outra-peça').length,1);
    assert.equal(examples.retrieve({...request.scope,storeId:'outra'},'camiseta','manga curta gola','outra-peça').length,0);
    assert.equal(examples.retrieve(request.scope,'camiseta','manga curta gola',request.product.id).length,0);
    examples.revoke(request.scope,examples.list(request.scope)[0].id,'Teste');assert.equal(examples.retrieve(request.scope,'camiseta','manga curta gola','outra-peça').length,0);
    r.request.product.facts[0].text='Fato alterado';r=studio.revise(r.id,request.scope,r.revision,r.request);assert.throws(()=>studio.approve(r.id,request.scope,r.revision,approval));
    studio.cancel(r.id,request.scope,r.revision);assert.throws(()=>studio.applyDraft(r.id,request.scope,r.revision,r.aiDraftJob!));
  }finally{store.close();}
});

test('QA não aprova ausência de texto e CSV bloqueia fórmulas sem corromper SKU',()=>{
 const {store,request}=setup();try{
  assert.throws(()=>validateDeliverable(request,'quality',{kind:'quality',verdict:'pass',findings:[],limits:['Teste']}));
  request.product.existing=false;
  request.adaptive!.catalog={currency:'BRL',source:'Teste',approved:true,variants:request.product.variants.map(v=>({variantId:v.id,price:'10.00',barcode:'00123',stock:null}))};
  request.product.variants[0].sku='=1+1';assert.throws(()=>catalogFiles(request,'essential','Areia'),/fórmula/);
  request.product.variants[0].sku='000120-AREIA-P';
  const first=(parse(catalogFiles(request,'essential','Areia')['shopify-rascunhos.csv']!,{columns:true}) as Record<string,string>[])[0]['URL handle'];
  request.scope.storeId='outra-loja';
  assert.notEqual((parse(catalogFiles(request,'essential','Areia')['shopify-rascunhos.csv']!,{columns:true}) as Record<string,string>[])[0]['URL handle'],first);
 }finally{store.close();}
});
test('produto simples admite seu próprio código e SKU ausente só bloqueia cadastro',()=>{
 const {store,request}=setup();try{
  request.product.existing=false;request.media=[];
  request.product.variants=[{...request.product.variants[0],sku:request.product.id,color:'',size:''}];
  request.adaptive!.catalog={currency:'BRL',source:'Teste',approved:true,variants:[{variantId:request.product.variants[0].id,price:'10.00',barcode:'00123',stock:null}]};
  const rows=parse(catalogFiles(request,'essential','')['bling-validacao.csv']!,{columns:true,bom:true,delimiter:';'}) as Record<string,string>[];
  assert.equal(rows.length,1);assert.equal(rows[0]['Código'],request.product.id);assert.equal(rows[0]['Código Pai'],'');
  request.product.variants[0].sku='';assert.throws(()=>catalogFiles(request,'essential',''),/SKU/);
  delete request.adaptive!.catalog;assert.equal(checkRequest(request).length,0);assert(pending(request).some(q=>q.id==='missing-sku'&&!q.required));
 }finally{store.close();}
});
