import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import {parse} from 'csv-parse/sync';
import {Store} from '../src/store.ts';
import {Service} from '../src/service.ts';
import {ContentStudio} from '../src/content-studio/service.ts';
import {StudioOperations} from '../src/content-studio/operations.ts';
import {studioFixture} from '../src/content-studio/fixtures.ts';
import {checkRequest,suggestMediaView} from '../src/content-studio/contracts.ts';
import {catalogFiles,pending} from '../src/content-studio/adaptive.ts';
import {renderDescription} from '../src/content-studio/render.ts';
import {intakeSnapshot} from '../src/content-studio/intake.ts';
import {collectProductPages} from '../src/inspection/collector.ts';
import {recordPreSaleHandoffs,orderHandoffLedger} from '../src/handoffs.ts';
import {economics} from '../src/order-workflow.ts';
import {addLead,isOptOutText} from '../src/mail.ts';
import {orderAgentRequest} from '../src/coordination.ts';
import {Payments} from '../src/payments.ts';
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
  const snapshot=await collectProductPages({origin:'https://example.com',approvedOrigin:'https://example.com',scope:{workspaceId:request.scope.workspaceId,clientId:request.scope.clientId},handles:['peca'],mode:'synthetic'},{transport:async()=>new Response(JSON.stringify({product:{id:'1',handle:'peca',title:'Peça',body_html:'<p>Descrição observada</p>',options:[],variants:[{id:'v',sku:''}],images:[{id:1,src:'https://example.com/camisa_frente.jpg',variant_ids:['v']}]}}),{headers:{'content-type':'application/json'}})});
  const result=intakeSnapshot(snapshot,request.scope,request.brand);assert.equal(result.records.length,1);assert.equal(result.records[0].product.variants[0].sku,'');assert.equal(result.records[0].media[0].authorized,false);assert.equal(result.records[0].media[0].approved,false);assert.equal(result.records[0].media[0].view,'front');assert.equal(result.records[0].media[0].viewConfirmed,false);assert.equal(result.records[0].brand.approved,false);
  assert(checkRequest(result.records[0]).some(i=>i.code==='MEDIA_VIEW_PENDING'));
  assert.throws(()=>intakeSnapshot(snapshot,{...request.scope,clientId:'other'},request.brand));
 }finally{store.close();}
});
test('unificação ficha editorial e pedido comercial sincroniza escopo e gera pacote ZIP auditado após aprovação e pagamento simulado',async()=>{
 const {store,studio,request}=setup();try{
  const service=new Service(store),ops=new StudioOperations(studio);
  let r=studio.create(request);
  const linked=ops.connect(r.id,request.scope);
  assert.equal(linked.order?.status,'needs_info');
  const synced=ops.synchronizeScope(r.id,request.scope);
  assert.equal(synced.order?.status,'scoped');
  assert.equal(synced.order?.scopeApproved,false);
  service.approve(synced.order!.id);
  service.simulatePayment(synced.order!.id);
  assert.throws(()=>ops.deliverOrderPackage(r.id,request.scope),/ainda não aprovada/);
  r=studio.approve(r.id,request.scope,0,approval);
  const processed=await service.process(synced.order!.id);
  assert.equal(processed.status,'ready');
  const zip=new AdmZip(store.artifact(processed.id,'delivery-0.zip'));
  const names=zip.getEntries().map(e=>e.entryName);
  assert(names.includes('conteudo.csv'));
  assert(names.includes('evidencias.json'));
  assert(names.includes('manifest.json'));
  assert(names.includes('descricao.html'));
  assert(names.includes('previa.html'));
  const rows=parse(zip.readAsText('conteudo.csv'),{columns:true}) as Record<string,string>[];
  assert.equal(rows.length,1);
  assert.equal(rows[0].ID,request.product.id);
  assert(rows[0]['SEO Title'].length>0);
  assert(rows[0]['SEO Description'].length>0);
 }finally{store.close();}
});
test('verticalização de vestuário: vistas frente/costas, matriz de incompatibilidade semântica e sincronização SEO/Bling',()=>{
 const {store,request}=setup();try{
  assert.equal(suggestMediaView('https://cdn.example.com/C02895_COSTAS.jpg'),'back');
  assert.equal(suggestMediaView('https://cdn.example.com/C02895_FRENTE.jpg'),'front');
  assert.equal(suggestMediaView('https://cdn.example.com/18_ZOOM_PUNHO.jpg'),'detail');
  assert.equal(suggestMediaView('https://cdn.example.com/capa_modelo_lifestyle.jpg'),'context');
  request.media=[
   {id:'m-back',productId:request.product.id,url:'/studio-fixture-sand.svg',source:'Estúdio sintético',authorized:true,approved:true,variantIds:['V-AREIA-P'],color:'Areia',role:'hero',view:'back',viewConfirmed:true,alt:'Vista costas'},
   {id:'m-front',productId:request.product.id,url:'/studio-fixture-blue.svg',source:'Estúdio sintético',authorized:true,approved:true,variantIds:['V-AREIA-P'],color:'Areia',role:'hero',view:'front',viewConfirmed:true,alt:'Vista frente'},
  ];
  const rendered=renderDescription(request,'essential',{selectedColor:'Areia'});
  assert(rendered.html.includes('Vista frente'));
  assert(!rendered.html.includes('Vista costas'));
  const botina=structuredClone(request);
  botina.adaptive={category:'botina',coverage:{kind:'manual',source:'Fixture',observedAt:new Date().toISOString(),missing:[]},requirements:[],conflicts:[],components:[]};
  botina.blocks=[{id:'b1',section:'presentation',text:'Peça com manga longa e gola padre.',factIds:['presentation'],approved:true}];
  assert(checkRequest(botina).some(i=>i.code==='SEMANTIC_CATEGORY_CONFLICT'));
  const incompleteKit=structuredClone(request);
  incompleteKit.adaptive={category:'kit',coverage:{kind:'manual',source:'Fixture',observedAt:new Date().toISOString(),missing:[]},requirements:[],conflicts:[],components:[{id:'only-one',title:'Apenas um item',factIds:['presentation'],mediaIds:[]}]};
  assert(checkRequest(incompleteKit).some(i=>i.code==='KIT_COMPONENTS_MISSING'));
  const kids=structuredClone(request);
  kids.adaptive={category:'camisa infantil',coverage:{kind:'manual',source:'Fixture',observedAt:new Date().toISOString(),missing:[]},requirements:[],conflicts:[],components:[]};
  assert(pending(kids).some(q=>q.id==='kids-size-guide'&&!q.required));
  request.product.existing=false;
  request.adaptive={category:'camiseta',coverage:{kind:'manual',source:'Fixture',observedAt:new Date().toISOString(),missing:[]},requirements:[],conflicts:[],components:[],catalog:{currency:'BRL',source:'Ficha sintética',approved:true,variants:request.product.variants.map((v,i)=>({variantId:v.id,price:'89.90',barcode:'789000'+i,stock:null}))}};
  const files=catalogFiles(request,'essential','Areia');
  const shop=parse(files['shopify-rascunhos.csv']!,{columns:true}) as Record<string,string>[];
  assert.equal(shop[0].Type,'camiseta');
  assert.equal(shop[0]['SEO Title'],request.product.title);
  assert(shop[0]['SEO Description'].length>0);
  const bling=parse(files['bling-validacao.csv']!,{columns:true,bom:true,delimiter:';'}) as Record<string,string>[];
  assert.equal(bling[0]['Unidade'],'UN');
  assert.equal(bling[0]['Categoria do produto'],'camiseta');
  assert(bling[0]['Descrição Complementar']!.includes(request.product.facts[0]!.text));
  assert(bling[0]['Descrição Curta']!.length>10);
  assert(bling[0]['Descrição Curta']!.length<=250);
  assert.equal(bling[1]['Descrição Complementar'],bling[0]['Descrição Complementar']);
  assert.equal(bling[1]['Descrição Curta'],bling[0]['Descrição Curta']);
 }finally{store.close();}
});
test('guardião de unit economics por etapa e fechamento dos oito contratos de handoff operacionais',async()=>{
 const {store,studio,request}=setup();try{
  const service=new Service(store),ops=new StudioOperations(studio);
  let r=studio.create(request);
  const linked=ops.connect(r.id,request.scope);
  const orderId=linked.order!.id;
  recordPreSaleHandoffs(store,orderId,{fit:'qualified',sources:['https://example.com/loja'],need:'Padronizar descrições do lançamento',buyer:'Diretora de marca',scope:'Até 10 produtos de conteúdo'});
  ops.synchronizeScope(r.id,request.scope);
  service.approve(orderId);
  service.simulatePayment(orderId);
  r=studio.approve(r.id,request.scope,0,approval);
  const ready=await service.process(orderId);
  service.delivered(orderId,ready.deliveryId!);
  studio.effort(r.id,request.scope,{hours:1.25,fees:null,costs:null,taxes:null,note:'Horas parciais sem taxas apuradas.'});
  const partial=ops.synchronizeEffort(r.id,request.scope);
  assert.equal(partial.order?.economics.state,'costs_missing');
  assert.equal(partial.order?.economics.stageHours.production,1.25);
  assert.equal(partial.order?.economics.maxAllowedCost,294);
  assert.equal(partial.order?.economics.maxHoursCeiling,4.9);
  studio.effort(r.id,request.scope,{hours:1.5,fees:15,costs:10,taxes:29.4,note:'Custos e tributos sintéticos apurados.'});
  const complete=ops.synchronizeEffort(r.id,request.scope);
  assert.equal(complete.order?.economics.state,'hypothetical');
  assert.equal(complete.order?.economics.targetMet,true);
  assert.equal(complete.order?.economics.budgetAlert,'ok');
  const ledger=orderHandoffLedger(store,orderId);
  assert.equal(ledger.verifiedRoles.length,8);
  assert.deepEqual(ledger.missingRoles,[]);
  service.recordEconomics(orderId,{stageHours:{intake:0.5,plan:0.5,production:3.5,quality:0.5},fees:20,costs:15,taxes:30,note:'Estouro de horas na produção.'});
  const breached=economics(store.get(orderId));
  assert.equal(breached.budgetAlert,'margin_breach');
  assert.equal(breached.targetMet,false);
  assert(breached.overBudgetStages.includes('production'));
 }finally{store.close();}
});
test('ponte de lote LeakFinder e conciliador pós-importação Shopify validam multi-produto e gate determinístico',async()=>{
 const {store,studio,request}=setup();try{
  const service=new Service(store),ops=new StudioOperations(studio);
  const snapshot=await collectProductPages({origin:'https://example.com',approvedOrigin:'https://example.com',scope:{workspaceId:request.scope.workspaceId,clientId:request.scope.clientId},handles:['peca-1','peca-2'],mode:'synthetic'},{transport:async input=>{
   const url=String(input);const idx=url.includes('peca-2')?'2':'1';
   return new Response(JSON.stringify({product:{id:idx,handle:`peca-${idx}`,title:`Camisa ${idx}`,body_html:`<p>Composição confirmada ${idx}</p>`,options:[{name:'Cor'},{name:'Tamanho'}],variants:[{id:`v-${idx}`,sku:`SKU-${idx}`,option1:'Areia',option2:'M'}],images:[]}}),{headers:{'content-type':'application/json'}});
  }});
  const batch1=ops.intakeBatchToOrder(snapshot,request.scope,request.brand);
  const batch2=ops.intakeBatchToOrder(snapshot,request.scope,request.brand,batch1.orderId);
  assert.equal(batch1.records.length,2);
  assert.equal(batch2.orderId,batch1.orderId);
  assert.deepEqual(batch2.records.map(r=>r.id),batch1.records.map(r=>r.id));
  for(const rec of batch1.records){
   const next=structuredClone(rec.request);
   next.brand.materialAuthorization=true;
   next.brand.approved=true;
   next.brand.version='fixture-2';
   next.product.facts=next.product.facts.map(f=>({...f,approved:true}));
   next.blocks=[{id:`b-${rec.id}`,section:'presentation',text:next.product.facts[0]!.text,factIds:[next.product.facts[0]!.id],approved:true}];
   const rev=studio.revise(rec.id,request.scope,rec.revision,next);
   studio.approve(rec.id,request.scope,rev.revision,approval);
  }
  ops.synchronizeScope(batch1.records[0]!.id,request.scope);
  service.approve(batch1.orderId);
  service.simulatePayment(batch1.orderId);
  const processed=await service.process(batch1.orderId);
  assert.equal(processed.status,'ready');
  const zip=new AdmZip(store.artifact(processed.id,'delivery-0.zip'));
  const rows=parse(zip.readAsText('conteudo.csv'),{columns:true}) as Record<string,string>[];
  assert.equal(rows.length,2);
  const catOrder=await service.create({name:'Marca Cat',email:'cat@test.invalid',service:'catalog',demo:true,filename:'cat.csv',data:Buffer.from('SKU,Produto,Cor,Tamanho,Preco,Estoque,GTIN,Descricao\nSKU-A,Camiseta Linho,Areia,M,199.90,5,7891234567895,Linho puro\n'),mapping:{supplierKey:'forn',productId:'Produto',title:'Produto',sku:'SKU',options:[{name:'Cor',column:'Cor'},{name:'Tamanho',column:'Tamanho'}],price:'Preco',barcode:'GTIN',description:'Descricao'}});
  service.approve(catOrder.id);
  service.simulatePayment(catOrder.id);
  const catReady=await service.process(catOrder.id);
  const catZip=new AdmZip(store.artifact(catReady.id,'delivery-0.zip'));
  const generatedShopifyCsv=catZip.readAsText('shopify.csv');
  const badExport=generatedShopifyCsv.replace('199.90','149.90');
  const failedRec=service.reconcileImport(catReady.id,badExport,false);
  assert.equal(failedRec.ok,false);
  assert(failedRec.issues.some(i=>i.code==='PRICE_MISMATCH'));
  assert.throws(()=>service.reconcileImport(catReady.id,badExport,true),/Gate shopifyImport bloqueado/);
  assert.equal(store.setting<Record<string,string>>('gates',{}).shopifyImport,undefined);
  assert.throws(()=>service.reconcileImport(catReady.id,generatedShopifyCsv,true),/Pedidos demonstrativos não promovem o gate comercial shopifyImport/);
  assert.equal(store.setting<Record<string,string>>('gates',{}).shopifyImport,undefined);
  const liveOrder=store.get(catReady.id);
  liveOrder.demo=false;
  store.save(liveOrder);
  const okRec=service.reconcileImport(catReady.id,generatedShopifyCsv,true);
  assert.equal(okRec.ok,true);
  assert(store.setting<Record<string,string>>('gates',{}).shopifyImport?.includes(okRec.evidenceHash));
  const agentReq=orderAgentRequest(store,catReady.id);
  assert.equal((agentReq.input.evidence as any).reconciliation?.ok,true);
  assert((agentReq.input.evidence as any).handoffs?.verifiedRoles.includes('quality'));
  const leadId=addLead(store,{name:'Atelier Harmonia',email:'harmonia@loja.com.br',website:'https://harmonia.example.com',source:'https://harmonia.example.com/products',contactSource:'https://harmonia.example.com/contato',evidence:'Loja Shopify de vestuário com 18 peças sem tabela de medidas padronizada.'});
  const leadRow=store.db.prepare('SELECT data FROM leads WHERE id=?').get(leadId) as any;
  store.db.prepare('UPDATE leads SET data=? WHERE id=?').run(JSON.stringify({...JSON.parse(leadRow.data),qualified:true}),leadId);
  const harmonizedOrder=await service.create({name:'Atelier Harmonia',email:'harmonia@loja.com.br',service:'catalog',demo:true,filename:'harmonia.csv',data:Buffer.from('SKU,Produto,Cor,Tamanho,Preco,GTIN,Descricao\nSKU-H1,Vestido Linho,Areia,P,289.90,7891234567895,Linho puro\n'),mapping:{supplierKey:'harmonia',productId:'Produto',title:'Produto',sku:'SKU',options:[{name:'Cor',column:'Cor'},{name:'Tamanho',column:'Tamanho'}],price:'Preco',barcode:'GTIN',description:'Descricao'}});
  const harmLedger=orderHandoffLedger(store,harmonizedOrder.id);
  assert(harmLedger.verifiedRoles.includes('research'));
  assert(harmLedger.verifiedRoles.includes('sales'));
 }finally{store.close();}
});
test('desbloqueio de structuredAdvice(quality) após applyDraft, opt-out PT-BR e preparação BRL (checkout + finance handoff + dueAt)',async()=>{
 const {store,studio,request}=setup();try{
  assert.equal(isOptOutText('Olá, não tenho interesse no momento.'),true);
  assert.equal(isOptOutText('Por favor, me descadastrar e parar de receber emails.'),true);
  assert.equal(isOptOutText('Quero sair da lista / remover da lista.'),true);
  assert.equal(isOptOutText('Sem interesse, obrigado.'),true);
  assert.equal(isOptOutText('Nao quero receber novas mensagens.'),true);
  assert.equal(isOptOutText('Tenho interesse em conhecer o diagnóstico R$ 190.'),false);

  request.adaptive={category:'apparel',coverage:{kind:'manual',source:'Ficha técnica',observedAt:new Date().toISOString(),missing:[]},requirements:[],conflicts:[],components:[],guides:[{id:'g-1',title:'Tabela de medidas',componentId:'',source:'Modelagem',unit:'cm',approved:true,columns:['Busto'],rows:[{size:'P',values:[88]}]}]};
  let rec=studio.create(request);
  const prodTask=studio.structuredAdvice(rec.id,request.scope,'production');
  store.db.prepare('INSERT INTO ai_jobs(id,client_id,role,input,status,result,attempts) VALUES(?,?,?,?,?,?,1)').run(
   prodTask.id,
   prodTask.clientId,
   'production',
   JSON.stringify(prodTask.input),
   'done',
   JSON.stringify({deliverable:{kind:'draft',blocks:[{id:'b-draft',section:'presentation',text:rec.request.product.facts[0]!.text,factIds:[rec.request.product.facts[0]!.id]}]}})
  );
  rec=studio.applyDraft(rec.id,request.scope,rec.revision,prodTask.id);
  assert.equal(rec.request.blocks[0]!.approved,false);
  assert(pending(rec.request,'production').some(i=>i.id.startsWith('COPY_PENDING:')));
  assert(!pending(rec.request,'quality').some(i=>i.id.startsWith('COPY_PENDING:')));
  const qualityTask=studio.structuredAdvice(rec.id,request.scope,'quality');
  assert.equal((qualityTask.input.pending as any[]).some(i=>String(i.id).startsWith('COPY_PENDING:')),false);
  store.db.prepare('INSERT INTO ai_jobs(id,client_id,role,input,status,result,attempts) VALUES(?,?,?,?,?,?,1)').run(
   qualityTask.id,
   qualityTask.clientId,
   'quality',
   JSON.stringify(qualityTask.input),
   'done',
   JSON.stringify({deliverable:{kind:'quality',verdict:'pass',findings:[],limits:['Conferência textual com fatos aprovados.']}})
  );
  const approvedBlocksReq=structuredClone(rec.request);
  approvedBlocksReq.blocks=approvedBlocksReq.blocks.map(b=>({...b,approved:true}));
  rec=studio.revise(rec.id,request.scope,rec.revision,approvedBlocksReq);
  assert(studio.jobs(rec.id,request.scope).some(j=>j.id===qualityTask.id&&j.role==='quality'));

  const mutatedTextReq=structuredClone(rec.request);
  mutatedTextReq.blocks=mutatedTextReq.blocks.map(b=>({...b,text:b.text+' Texto alterado após QA.'}));
  const mutatedRec=studio.revise(rec.id,request.scope,rec.revision,mutatedTextReq);
  assert.equal(studio.jobs(mutatedRec.id,request.scope).some(j=>j.id===qualityTask.id),false);
  assert.throws(()=>studio.approve(mutatedRec.id,request.scope,mutatedRec.revision,approval),/Rascunho IA exige conferência independente desta revisão/);

  rec=studio.revise(mutatedRec.id,request.scope,mutatedRec.revision,approvedBlocksReq);
  const approvedRec=studio.approve(rec.id,request.scope,rec.revision,approval);
  assert.equal(approvedRec.status,'approved');

  const service=new Service(store),payments=new Payments(store);
  const brlClient=store.client('Loja BRL','brl@test.invalid');
  const diagSnapshot=await collectProductPages({origin:'https://brl.example.com',approvedOrigin:'https://brl.example.com',scope:{workspaceId:'local',clientId:brlClient.id},handles:['blusa-1'],mode:'synthetic'},{transport:async()=>new Response(JSON.stringify({product:{id:'10',handle:'blusa-1',title:'Blusa BRL',body_html:'<p>Blusa 100% algodão</p>',options:[{name:'Cor',position:1},{name:'Tamanho',position:2}],variants:[{id:'v-10',sku:'SKU-10',price:'159.90',available:true,option1:'Preto',option2:'M'}],images:[]}}),{headers:{'content-type':'application/json'}})});
  const {createInspectionDiagnostic}=await import('../src/inspection/bridge.ts');
  const diagOrder=createInspectionDiagnostic(store,{scope:{workspaceId:'local',clientId:brlClient.id},snapshot:diagSnapshot,profile:{version:'diag-br-1',expectedSizes:['P','M','G']},review:{approved:true,operator:'Op BRL',note:'Revisão diagnóstica'}});
  assert.equal(diagOrder.offer?.kind,'diagnostic');
  assert.equal(diagOrder.amount,19000);
  diagOrder.demo=false;
  diagOrder.checkoutId='cs_brl_1';
  store.save(diagOrder);
  service.approve(diagOrder.id);
  await assert.rejects(()=>payments.checkout(diagOrder.id),/Oferta brasileira em validação: cobrança bloqueada/);
  store.set('brlCommercialEnabled',true);
  await assert.rejects(()=>payments.checkout(diagOrder.id),/Configure PUBLIC_URL/);
  payments.apply({id:'evt_brl_1',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_brl_1',mode:'payment',payment_status:'paid',payment_intent:'pi_brl_1',amount_total:19000,currency:'brl',client_reference_id:diagOrder.id,metadata:{orderId:diagOrder.id,revision:'0'}}}} as any);
  const paidDiag=store.get(diagOrder.id);
  assert.equal(paidDiag.status,'queued');
  assert(paidDiag.dueAt);
  const {businessDays}=await import('../src/policy.ts');
  assert.equal(paidDiag.dueAt.slice(0,10),businessDays(new Date(),2).slice(0,10));
  const diagLedger=orderHandoffLedger(store,diagOrder.id);
  assert(diagLedger.verifiedRoles.includes('finance'));
 }finally{store.close();}
});

