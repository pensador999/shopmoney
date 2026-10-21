import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import AdmZip from 'adm-zip';
import {Store} from '../src/store.ts';
import {ContentStudio} from '../src/content-studio/service.ts';
import {studioFixture} from '../src/content-studio/fixtures.ts';
import {checkRequest,studioRequestSchema} from '../src/content-studio/contracts.ts';
import {renderDescription,renderPreview,checkRendered} from '../src/content-studio/render.ts';
import {agentPlaybook} from '../src/agent-playbooks.ts';
import {enqueueAgent,runAgentQueue} from '../src/agents.ts';

const scope={workspaceId:'local',clientId:'fixture',storeId:'clara'};
const input=()=>studioFixture(scope);
const approval={template:'essential' as const,color:'Areia',operator:'Teste sintético',note:'Aprovação controlada de fixture, sem aprovação de cliente.',visualChecked:true,textChecked:true,factsChecked:true};
function setup(store:Store){const client=store.client('Fictício','studio-test@example.invalid'),request=input();request.scope.clientId=client.id;return {studio:new ContentStudio(store),request};}
test('mesmos fatos e quatro prévias diferentes em duas marcas e templates, sem herança BRK',()=>{
  const a=input(),b=studioFixture({...scope,storeId:'horizonte'},'horizonte');
  assert.deepEqual(a.product.facts,b.product.facts);assert.deepEqual(checkRequest(a),[]);
  const versions=[renderPreview(a,'essential'),renderPreview(a,'editorial'),renderPreview(b,'essential'),renderPreview(b,'editorial')];
  assert.equal(new Set(versions).size,4);
  for(const html of versions){assert(!html.includes('BRK'));assert(!html.includes('<script'));assert(!html.includes('<form'));assert(html.includes('viewport'));}
});
test('zeros e SKU inteiro preservados; colisões e variantes órfãs bloqueiam',()=>{
  const a=input();assert.equal(a.product.variants[0].sku,'000120-AREIA-P');
  a.product.variants[1].sku=a.product.variants[0].sku;assert(checkRequest(a).some(i=>i.code==='DUPLICATE'));
  a.product.variants[0].productId='outro';assert(checkRequest(a).some(i=>i.code==='ORPHAN'));
});
test('imagem compartilhada entre tamanhos da mesma cor é válida; mistura e cor inexistente bloqueiam',()=>{
  const a=input();assert.deepEqual(checkRequest(a),[]);
  const sand=renderDescription(a,'essential',{selectedColor:'Areia'}).html;
  assert(sand.includes('studio-fixture-sand'));assert(!sand.includes('studio-fixture-blue'));
  const blue=renderDescription(a,'essential',{selectedColor:'Azul'}).html;assert(blue.includes('studio-fixture-blue'));assert(!blue.includes('studio-fixture-sand'));
  a.media[0].variantIds.push('V-AZUL-M');assert(checkRequest(a).some(i=>i.code==='MEDIA_COLOR'));
  assert.throws(()=>renderDescription(input(),'essential',{selectedColor:''}));
});
test('fatos, referências, revisão de texto e autorização são exigidos',()=>{
  const a=input();a.product.facts[0].approved=false;assert(checkRequest(a).some(i=>i.code==='FACT_PENDING'));
  const b=input();b.blocks=[{id:'inventado',section:'features',text:'Proteção UV50 e impermeável.',factIds:['presentation'],approved:true}];
  assert(checkRequest(b).some(i=>i.code==='UNSUPPORTED_CLAIM'));b.blocks[0].factIds=['ausente'];assert(checkRequest(b).some(i=>i.code==='UNSOURCED'));
  const c=input();c.media[0].authorized=false;assert(checkRequest(c).some(i=>i.code==='MEDIA_PENDING'));assert(!renderDescription(c,'essential').html.includes('src="/studio-fixture-sand'));
  c.brand.materialAuthorization=false;assert(!renderDescription(c,'essential').html.includes('<img'));
});
test('HTML recebido não executa; URLs e identidade visual são controladas',()=>{
  const a=input();a.product.original.html='<script>alert(1)</script>';a.product.original.text='<script>alert(1)</script>';
  const html=renderPreview(a,'essential',{original:true});assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));
  a.media[0].url='javascript:alert(1)';assert(checkRequest(a).some(i=>i.code==='MEDIA_URL'));assert(!renderDescription(a,'essential').html.includes('src="javascript'));
  a.brand.visual.accent='red;}</style><script>';assert.throws(()=>studioRequestSchema.parse(a));
});
test('preservar mantém texto aprovado; reorganizar não acrescenta texto novo',()=>{
  const a=input();a.mode='preserve';assert(renderDescription(a,'essential').html.includes(a.product.original.text));
  a.product.original.approved=false;assert(checkRequest(a).some(i=>i.code==='ORIGINAL_PENDING'));
  const b=input();b.mode='reorganize';assert(checkRequest(b).some(i=>i.code==='REORGANIZE'));
  b.blocks=[{id:'original',section:'presentation',text:b.product.original.text,factIds:['presentation'],approved:true}];
  assert.deepEqual(checkRequest(b),[]);
});
test('aprovação, exportação e reinício são idempotentes; pacote tem fontes, mídia e original',()=>{
  const dir=mkdtempSync(join(tmpdir(),'catana-studio-'));let store=new Store(join(dir,'test.sqlite'));
  try{
    let {studio,request}=setup(store);const id=randomUUID(),r=studio.create(request,id);
    assert.throws(()=>studio.export(id,request.scope,0));
    assert.throws(()=>studio.approve(id,request.scope,0,{...approval,visualChecked:false}));
    studio.approve(id,request.scope,0,approval);
    const first=studio.export(id,request.scope,0),zip=new AdmZip(first);
    for(const name of ['descricao.html','previa.html','midias.json','fontes.json','qualidade.json','manifest.json','original.html.txt','midias/studio-fixture-sand.svg'])assert(zip.getEntry(name));
    assert.equal(JSON.parse(zip.readAsText('manifest.json')).existing,true);
    assert(zip.readAsText('previa.html').includes('src="midias/studio-fixture-sand.svg"'));
    store.close();store=new Store(join(dir,'test.sqlite'));studio=new ContentStudio(store);
    assert.deepEqual(studio.export(id,request.scope,0),first);assert.equal(studio.create(request,id).id,r.id);
    assert.equal(store.db.prepare('SELECT count(*) n FROM content_studio_packages').get()?.n,1);
    assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get()?.n,0);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('revisão invalida aprovação; perfil exige nova versão; antigos pacotes não liberam revisão nova',()=>{
  const store=new Store(':memory:');try{
    const {studio,request}=setup(store),r=studio.create(request);studio.approve(r.id,request.scope,0,approval);studio.export(r.id,request.scope,0);
    const updated=structuredClone(request);updated.product.title='Título atualizado';
    const revised=studio.revise(r.id,request.scope,0,updated);assert.equal(revised.revision,1);assert.equal(revised.status,'draft');assert.equal(revised.approval,undefined);
    assert.throws(()=>studio.export(r.id,request.scope,1));assert.throws(()=>studio.approve(r.id,request.scope,0,approval));
    const profile=structuredClone(updated);profile.brand.tone='Outro tom';assert.throws(()=>studio.revise(r.id,request.scope,1,profile),/versão/);
    profile.brand.version='2';assert.equal(studio.revise(r.id,request.scope,1,profile).revision,2);
    assert.equal(store.db.prepare('SELECT count(*) n FROM content_studio_revisions').get()?.n,3);
  }finally{store.close();}
});
test('workspace, cliente e loja precisam coincidir; cancelamento bloqueia prévia, revisão e exportação',()=>{
  const store=new Store(':memory:');try{
    const {studio,request}=setup(store),r=studio.create(request);
    for(const key of ['workspaceId','clientId','storeId'])assert.throws(()=>studio.get(r.id,{...request.scope,[key]:'outro'}));
    studio.cancel(r.id,request.scope,0);
    assert.throws(()=>studio.preview(r.id,request.scope,'essential'));assert.throws(()=>studio.approve(r.id,request.scope,0,approval));assert.throws(()=>studio.export(r.id,request.scope,0));
  }finally{store.close();}
});
test('QA detecta HTML adulterado e skill entra no hash somente nos papéis de conteúdo pertinentes',()=>{
  const a=input(),html=renderDescription(a,'essential').html;assert.deepEqual(checkRendered(a,'essential',html),[]);
  assert(checkRendered(a,'essential',html+'<p>Benefício novo</p>').some(i=>i.code==='OUTPUT_CHANGED'));
  assert(agentPlaybook('planner','content').text.includes('Produto, marca e prévia'));
  assert.notEqual(agentPlaybook('planner','content').version,agentPlaybook('planner','catalog').version);
});
test('fila consultiva usa resumo, descarta revisão obsoleta e não aprova conteúdo',async()=>{
  const store=new Store(':memory:');try{
    const {studio,request}=setup(store),r=studio.create(request),task=studio.advice(r.id,request.scope,'planner');
    assert(!JSON.stringify(task.input).includes('100% algodão'));
    enqueueAgent(store,task.role,task.input,task.clientId,task.id);
    const updated=structuredClone(request);updated.product.title='Revisão';
    studio.revise(r.id,request.scope,0,updated);let calls=0;
    await runAgentQueue(store,async()=>{calls++;return {summary_pt:'Teste',reply_client:'',language:'pt-BR',action:'information',rule:'DATA-01'};});
    assert.equal(calls,0);assert.equal(store.db.prepare('SELECT status FROM ai_jobs WHERE id=?').get(task.id)?.status,'cancelled');
    const current=studio.advice(r.id,request.scope,'quality');enqueueAgent(store,current.role,current.input,current.clientId,current.id);
    await runAgentQueue(store,async()=>({summary_pt:'Resposta controlada, sem análise semântica real.',reply_client:'',language:'pt-BR',action:'information',rule:'DATA-01'}));
    assert.equal(studio.get(r.id,request.scope).status,'draft');
  }finally{store.close();}
});
test('trocar template/cor cria revisão de aprovação e nunca retorna pacote da seleção anterior',()=>{
  const store=new Store(':memory:');try{
    const {studio,request}=setup(store),r=studio.create(request);studio.approve(r.id,request.scope,0,approval);const first=studio.export(r.id,request.scope,0);
    const second=studio.approve(r.id,request.scope,0,{...approval,template:'editorial',color:'Azul'});
    assert.equal(second.revision,1);assert.throws(()=>studio.export(r.id,request.scope,0));
    const zip=new AdmZip(studio.export(r.id,request.scope,1));
    assert.equal(JSON.parse(zip.readAsText('manifest.json')).selection.color,'Azul');
    assert.notDeepEqual(studio.export(r.id,request.scope,1),first);
    assert.equal(studio.approve(r.id,request.scope,1,{...approval,template:'editorial',color:'Azul'}).revision,1);
  }finally{store.close();}
});
test('esforço registra custos desconhecidos sem fabricar contribuição ou recebimento',()=>{
  const store=new Store(':memory:');try{
    const {studio,request}=setup(store),r=studio.create(request);
    const updated=studio.effort(r.id,request.scope,{hours:2,fees:null,costs:0,taxes:null,note:'Medição de fixture; impostos não verificados.'});
    assert.equal(updated.effort?.hours,2);assert.equal(updated.effort?.taxes,null);assert.equal(updated.revision,0);assert.equal(updated.status,'draft');
  }finally{store.close();}
});
test('perfil com texto ou destaque sem contraste fica bloqueado para aprovação',()=>{
  const request=input();request.brand.visual.text=request.brand.visual.background;
  assert(checkRequest(request).some(i=>i.code==='CONTRAST'));
});
