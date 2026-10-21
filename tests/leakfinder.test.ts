import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { Store } from '../src/store.ts';
import { Service } from '../src/service.ts';
import { createEditorial,reviseEditorial } from '../src/service-editorial.ts';
import { makeSnapshot,verifySnapshot,sha,type InspectionScope } from '../src/inspection/snapshot.ts';
import { analyzeSnapshot,checkAudit,compareSnapshots } from '../src/inspection/catalog-audit.ts';
import { collectCatalog,isPublicAddress,InspectionUnavailable } from '../src/inspection/collector.ts';
import { createInspectionDiagnostic } from '../src/inspection/bridge.ts';
import { readInspection } from '../src/inspection/evidence.ts';
import { orderAgentRequest } from '../src/coordination.ts';

const scope={workspaceId:'local',clientId:'synthetic-client'};
const source=(products:any[],s:InspectionScope=scope,at='2026-10-19T12:00:00.000Z')=>makeSnapshot({
  scope:s,origin:'https://example.com',mode:'synthetic',capturedAt:at,maxProducts:10,coverage:'sample',stopReason:'Fixture, não é loja real.',
  pages:[{url:'https://example.com/products.json?limit=5&page=1',body:JSON.stringify({products})}],
});
const product=(overrides:any={})=>({id:'001',handle:'camiseta',title:'Camiseta Linha Básica',body_html:'<p>Dados sintéticos.</p>',
  options:[{name:'Cor',position:1},{name:'Tamanho',position:2}],images:[],
  variants:[{id:'v1',sku:'000123',barcode:'0012345678905',price:'0',available:false,option1:'Azul',option2:'M'}],...overrides});
const json=(products:any[],status=200,headers:any={})=>new Response(JSON.stringify({products}),{status,headers:{'content-type':'application/json',...headers}});

test('adaptador preserva zeros, preço zero e tamanho na segunda opção sem isenção por LINHA',()=>{
  const snap=source([product()]),audit=analyzeSnapshot(snap,{version:'approved',expectedSizes:['M']});
  assert.equal(audit.products[0].variants[0].sku,'000123');assert.equal(audit.products[0].variants[0].barcode,'0012345678905');
  assert.equal(audit.products[0].variants[0].price,'0');assert.equal(audit.products[0].variants[0].size,'M');
  assert(audit.findings.some(f=>f.code==='PUBLIC_UNAVAILABLE'));assert(!audit.findings.some(f=>f.code==='EXPECTED_SIZE_NOT_OBSERVED'));
  assert.deepEqual(checkAudit(snap,audit),[]);
});
test('dados ausentes permanecem desconhecidos; não cria SKU/preço/estoque/fabricação',()=>{
  const snap=source([product({variants:[{id:'v1',option2:'M'}]})]),a=analyzeSnapshot(snap);
  const v=a.products[0].variants[0];assert.equal(v.price,null);assert.equal(v.sku,null);assert.equal(v.available,null);
  assert(a.findings.some(f=>f.code==='UNKNOWN_AVAILABILITY'));assert(!a.findings.some(f=>f.code==='PUBLIC_UNAVAILABLE'));
  assert(!JSON.stringify(a).includes('169.9'));assert(!JSON.stringify(a).includes('FABRICACAO_PROPRIA'));assert(!JSON.stringify(a).includes('estimatedMonthlyLoss'));
});
test('FULL não isenta outras variantes e colisão de SKU não elimina registros',()=>{
  const a=analyzeSnapshot(source([product({variants:[
    {id:'v1',sku:'0001_FULL',price:'10',available:true},{id:'v2',sku:'0002',price:'10',available:false},
    {id:'v3',sku:'0002',price:'10',available:false},
  ]})]));
  assert.equal(a.products[0].variants.length,3);assert.equal(a.findings.filter(f=>f.code==='PUBLIC_UNAVAILABLE').length,2);
  assert(a.findings.some(f=>f.code==='DUPLICATE_SKU'));
});
test('grade infantil não exige M/G; posição explícita da opção é respeitada',()=>{
  const p=product({options:[{name:'Tamanho',position:2},{name:'Cor',position:1}],variants:[{id:'v1',sku:'01',price:'12',available:true,option1:'Azul',option2:'RN'}]});
  const a=analyzeSnapshot(source([p]),{version:'infantil-1',expectedSizes:['RN','P']});
  assert.equal(a.products[0].variants[0].size,'RN');
  assert.equal(a.findings.filter(f=>f.code==='EXPECTED_SIZE_NOT_OBSERVED').length,1);
  assert(a.findings.find(f=>f.code==='EXPECTED_SIZE_NOT_OBSERVED')?.category==='needs_internal_evidence');
});
test('campo omitido não equivale a vazio observado; variantes vazias não recebem confiança fictícia',()=>{
  const p=product({variants:[]});delete p.body_html;
  const a=analyzeSnapshot(source([p]));assert(a.findings.some(f=>f.code==='UNKNOWN_body_html'));
  assert(!a.findings.some(f=>f.code==='EMPTY_body_html'));assert(a.findings.some(f=>f.code==='NO_VARIANTS'));
  assert(!JSON.stringify(a).includes('confidence'));
});
test('QA bloqueia adulteração de preço, evidência, imagem, omissão e dados de outro cliente',()=>{
  const s=source([product()]),base=analyzeSnapshot(s);
  for(const mutate of [
    (a:any)=>a.products[0].variants[0].price='169.90',
    (a:any)=>a.products[0].variants=[],
    (a:any)=>a.findings[0].evidence[0].value='forjado',
    (a:any)=>a.products[0].images=[{src:'https://evil.example/a.jpg',alt:'forjado'}],
    (a:any)=>a.scope.clientId='outro',
  ]){const a=structuredClone(base);mutate(a);assert(checkAudit(s,a).length);}
  const changed=structuredClone(s);changed.pages[0].body='{}';assert.throws(()=>verifySnapshot(changed));
});
test('coleta amostral e serial respeita limite de produtos e declara cobertura',async()=>{
  const calls:string[]=[];
  const s=await collectCatalog({origin:'https://example.com',approvedOrigin:'https://example.com',scope,maxProducts:6,maxPages:3,mode:'synthetic'},{
    transport:async url=>{calls.push(url);return json(Array.from({length:5},(_,i)=>product({id:String(calls.length*10+i)})));},
  });
  assert.equal(calls.length,2);assert.equal(s.coverage,'sample');assert.equal(analyzeSnapshot(s).products.length,6);
});
test('fim vazio/curto é endpoint completo, não declaração de toda a loja saudável',async()=>{
  const s=await collectCatalog({origin:'https://example.com',approvedOrigin:'https://example.com',scope,mode:'synthetic'},{transport:async()=>json([product()])});
  assert.equal(s.coverage,'endpoint-complete');assert(analyzeSnapshot(s).limits.some(s=>s.includes('não comprova toda a loja')));
});
test('interrupção salva páginas e retoma sem coletar primeira página outra vez',async()=>{
  let calls=0;
  const args={origin:'https://example.com',approvedOrigin:'https://example.com',scope,mode:'synthetic' as const};
  const first=await collectCatalog(args,{transport:async()=>{if(++calls===2)throw Error('offline');return json(Array.from({length:5},(_,i)=>product({id:String(i)})));}});
  assert.equal(first.coverage,'interrupted');assert.equal(first.pages.length,1);
  const urls:string[]=[];const resumed=await collectCatalog({...args,resume:first},{transport:async url=>{urls.push(url);return json([product({id:'new'})]);}});
  assert.equal(resumed.pages.length,2);assert.equal(resumed.coverage,'endpoint-complete');assert(urls[0].includes('page=2'));
});
test('429 tem retry limitado; espera longa e indisponibilidade não viram sucesso',async()=>{
  const args={origin:'https://example.com',approvedOrigin:'https://example.com',scope,mode:'synthetic' as const};
  let calls=0;const waits:number[]=[];
  await collectCatalog(args,{transport:async()=>++calls===1?json([],429,{'retry-after':'1'}):json([product()]),wait:async ms=>{waits.push(ms);}});
  assert.equal(calls,2);assert.deepEqual(waits,[1000]);
  calls=0;await assert.rejects(()=>collectCatalog(args,{transport:async()=>{calls++;return json([],429,{'retry-after':'120'});}}),InspectionUnavailable);assert.equal(calls,1);
});
test('HTML, redirecionamento, origem não aprovada, modo sintético sem fixture e corpo excessivo bloqueiam coleta',async()=>{
  const args={origin:'https://example.com',approvedOrigin:'https://example.com',scope,mode:'synthetic' as const};
  await assert.rejects(()=>collectCatalog(args));
  await assert.rejects(()=>collectCatalog({...args,approvedOrigin:'https://other.example.com'},{transport:async()=>json([])}));
  await assert.rejects(()=>collectCatalog(args,{transport:async()=>new Response('<html/>',{headers:{'content-type':'text/html'}})}));
  await assert.rejects(()=>collectCatalog(args,{transport:async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1'}})}));
  await assert.rejects(()=>collectCatalog(args,{transport:async()=>new Response('x'.repeat(2_000_001),{headers:{'content-type':'application/json'}})}));
});
test('endereços locais, metadados e credenciais não são destinos de coleta',async()=>{
  for(const address of ['127.0.0.1','10.0.0.1','172.16.1.1','192.168.0.1','169.254.169.254','100.64.0.1','192.0.2.1','198.51.100.1','203.0.113.1','::1','::ffff:127.0.0.1','fe80::1','2001:db8::1','2002:7f00:1::'])assert.equal(isPublicAddress(address),false);
  assert(isPublicAddress('93.184.216.34'));
  for(const origin of ['http://example.com','https://localhost','https://127.0.0.1','https://user:pass@example.com','https://example.com:444','https://example.com/secret'])
    await assert.rejects(()=>collectCatalog({origin,approvedOrigin:origin,scope,mode:'synthetic'},{transport:async()=>json([])}));
});
test('cancelamento impede primeira chamada e coleta interrompida não abre diagnóstico',async()=>{
  const c=new AbortController();c.abort();let calls=0;
  await assert.rejects(()=>collectCatalog({origin:'https://example.com',approvedOrigin:'https://example.com',scope,mode:'synthetic',signal:c.signal},{transport:async()=>{calls++;return json([]);}}));
  assert.equal(calls,0);
});
test('comparação exige mesmo cliente/origem e dois instantes reais; desconhecido não é reposição',()=>{
  const before=source([product()]),after=source([product({variants:[{id:'v1',sku:'000123',price:'0'}]})],scope,'2026-10-19T13:00:00.000Z');
  const comparison=compareSnapshots(before,after);assert.equal(comparison.changes[0].to,null);
  assert(comparison.changes[0].meaning.includes('não comprova'));
  assert.throws(()=>compareSnapshots(before,before));assert.throws(()=>compareSnapshots(before,source([product()],{...scope,clientId:'other'},'2026-10-19T13:00:00.000Z')));
});
test('ciclo encaixa no serviço existente: revisão, escopo, simulação, ZIP e idempotência após reinício',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'catana-inspection-'));let store=new Store(join(dir,'test.sqlite'));
  try{
    const client=store.client('Marca fictícia','fixture@example.com'),sc={workspaceId:'local',clientId:client.id},snapshot=source([product()],sc);
    const input={scope:sc,snapshot,review:{approved:true,operator:'teste',note:'Revisão sintética dos dados.'}};
    const order=createInspectionDiagnostic(store,input);assert.equal(order.status,'scoped');assert(order.demo);
    const svc=new Service(store);await assert.rejects(()=>svc.process(order.id));
    svc.approve(order.id);svc.simulatePayment(order.id);
    store.close();store=new Store(join(dir,'test.sqlite'));
    const repeat=createInspectionDiagnostic(store,input);assert.equal(repeat.id,order.id);assert.equal(repeat.status,'queued');
    const ready=await new Service(store).process(order.id);assert.equal(ready.status,'ready');
    const zip=new AdmZip(store.artifact(order.id,'delivery-0.zip'));
    for(const file of ['diagnostico.json','inspecao-tecnica.json','fontes-inspecao.json','revisao-operador.json','manifest.json'])assert(zip.getEntry(file));
    const report=JSON.parse(zip.readAsText('diagnostico.json'));assert.equal(report.findings.length,0);assert(report.observations.length);
    assert.equal(store.orders().length,1);assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get()?.n,1);
    assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE status<>'draft'").get()?.n,0);
    await assert.rejects(()=>new Service(store).process(order.id));
    assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get()?.n,1);
    assert.throws(()=>readInspection(store,{...sc,workspaceId:'other'},snapshot.id));
    assert.throws(()=>readInspection(store,{...sc,clientId:'other'},snapshot.id));
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('aprovação ausente, evidência de outro cliente e referência sem anexo não liberam produção',async()=>{
  const s=new Store(':memory:');try{
    const a=s.client('A','a@example.com'),b=s.client('B','b@example.com'),sc={workspaceId:'local',clientId:a.id},snapshot=source([product()],sc);
    assert.throws(()=>createInspectionDiagnostic(s,{scope:sc,snapshot,review:{approved:false}}));
    assert.throws(()=>createInspectionDiagnostic(s,{scope:{...sc,clientId:b.id},snapshot,review:{approved:true,operator:'t',note:'t'}}));
    const order=createInspectionDiagnostic(s,{scope:sc,snapshot,review:{approved:true,operator:'t',note:'t'}}),svc=new Service(s);
    const input=JSON.parse(s.artifact(order.id,'brief-0.json').toString());
    const forged=createEditorial(s,{name:'B',email:'b@example.com',service:'diagnostic',brief:input,demo:true});
    svc.approve(forged.id);svc.simulatePayment(forged.id);await assert.rejects(()=>svc.process(forged.id));assert.equal(s.get(forged.id).status,'needs_attention');
    assert.equal(s.db.prepare('SELECT count(*) n FROM outbox').get()?.n,0);
  }finally{s.close();}
});
test('revisão de briefing com inspeção antiga invalida aprovação e não reutiliza anexo anterior',async()=>{
  const s=new Store(':memory:');try{
    const c=s.client('A','a@example.com'),sc={workspaceId:'local',clientId:c.id},snapshot=source([product()],sc);
    const o=createInspectionDiagnostic(s,{scope:sc,snapshot,review:{approved:true,operator:'t',note:'t'}}),svc=new Service(s);
    svc.approve(o.id);svc.simulatePayment(o.id);await svc.process(o.id);svc.delivered(o.id,s.get(o.id).deliveryId!);
    const input=JSON.parse(s.artifact(o.id,'brief-0.json').toString());const revised=reviseEditorial(s,o.id,input,'defect');
    assert.equal(revised.scopeApproved,false);assert.equal(revised.qa,undefined);
    // Reaprovação é necessária; anexar evidência da nova revisão continua sendo exigência própria.
    const current=s.get(o.id);current.status='queued';current.scopeApproved=true;s.save(current);
    await assert.rejects(()=>svc.process(o.id));assert.equal(s.get(o.id).status,'needs_attention');
  }finally{s.close();}
});
test('falha ao anexar evidência desfaz pedido e snapshot na mesma transação',()=>{
  const s=new Store(':memory:');try{
    const c=s.client('A','a@example.com'),sc={workspaceId:'local',clientId:c.id},snapshot=source([product()],sc);
    const artifact=s.artifact.bind(s);
    s.artifact=(id,name,data)=>{if(name==='inspection-0.json')throw Error('Falha sintética de persistência.');return artifact(id,name,data);};
    assert.throws(()=>createInspectionDiagnostic(s,{scope:sc,snapshot,review:{approved:true,operator:'t',note:'t'}}));
    assert.equal(s.orders().length,0);
    const exists=s.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='catalog_inspections'").get();
    if(exists)assert.equal(s.db.prepare('SELECT count(*) n FROM catalog_inspections').get()?.n,0);
  }finally{s.close();}
});
test('agentes recebem resumo verificado e limitado, sem corpos de páginas ou transferência de contexto',()=>{
  const s=new Store(':memory:');try{
    const c=s.client('A','a@example.com'),sc={workspaceId:'local',clientId:c.id};
    const snapshot=source([product({body_html:'SEGREDO-SINTETICO-NAO-ENVIAR'})],sc);
    const order=createInspectionDiagnostic(s,{scope:sc,snapshot,review:{approved:true,operator:'t',note:'t'}});
    const request=orderAgentRequest(s,order.id);
    assert.equal(request.input.evidence.inspection?.state,'source-checked');
    assert.equal(request.input.evidence.inspection?.observedVariants,1);
    assert(!JSON.stringify(request).includes('SEGREDO-SINTETICO-NAO-ENVIAR'));
    const bad=s.get(order.id);bad.revision=1;s.save(bad);
    const blocked=orderAgentRequest(s,order.id);
    assert.equal(blocked.input.evidence.inspection?.state,'blocked');
    assert.notEqual(blocked.id,request.id);
  }finally{s.close();}
});
