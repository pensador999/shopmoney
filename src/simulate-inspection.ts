import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import AdmZip from 'adm-zip';
import {Store} from './store.ts';
import {Service} from './service.ts';
import {collectCatalog} from './inspection/collector.ts';
import {analyzeSnapshot,checkAudit,compareSnapshots} from './inspection/catalog-audit.ts';
import {createInspectionDiagnostic} from './inspection/bridge.ts';
import {readInspection} from './inspection/evidence.ts';
import {makeSnapshot,verifySnapshot} from './inspection/snapshot.ts';

const directory=resolve('artifacts','leakfinder-fit-'+Date.now());mkdirSync(directory,{recursive:true});
const db=resolve(directory,'simulation.sqlite');let store=new Store(db);
const checks:string[]=[];let completed=false;
try{
  const client=store.client('Marca fictícia — integração LeakFinder','inspection-fixture@example.com');
  const scope={workspaceId:'local-validation',clientId:client.id},profile={version:'infantil-sintetico-1',expectedSizes:['RN','P']};
  const products=Array.from({length:6},(_,i)=>({
    id:'P'+i,handle:'produto-sintetico-'+i,title:'Produto sintético '+i,
    ...(i===0?{}:{body_html:i===1?'':'<p>Informações sintéticas aprováveis; não é texto de cliente.</p>'}),
    options:[{name:'Cor',position:1},{name:'Tamanho',position:2}],images:[],
    variants:[{id:'V'+i+'A',sku:i===2?'000000':'000'+i+'A',barcode:'0012345678905',price:i===0?'0':'49.90',available:false,option1:'Azul',option2:'RN'},
      {id:'V'+i+'B',sku:i===2?'000000':'000'+i+'B',price:'59.90',option1:'Azul',option2:'P'}],
  }));
  let failed=false;const calls:string[]=[];
  const args={origin:'https://example.com',approvedOrigin:'https://example.com',scope,mode:'synthetic' as const};
  const checkpoint=await collectCatalog(args,{transport:async url=>{
    calls.push(url);if(url.endsWith('page=2')&&!failed){failed=true;throw Error('Interrupção sintética de internet.');}
    return new Response(JSON.stringify({products:products.slice(0,5)}),{headers:{'content-type':'application/json'}});
  }});
  assert.equal(checkpoint.coverage,'interrupted');writeFileSync(resolve(directory,'checkpoint.json'),JSON.stringify(checkpoint,null,2));
  checks.push('Coleta interrompida preservou primeira página em arquivo.');
  assert.throws(()=>createInspectionDiagnostic(store,{scope,snapshot:checkpoint,profile,review:{approved:true,operator:'roteiro-sintetico',note:'Fixture'}}));
  checks.push('Coleta interrompida não virou pedido conclusivo.');
  const resumed=await collectCatalog({...args,resume:JSON.parse(readFileSync(resolve(directory,'checkpoint.json'),'utf8'))},{transport:async url=>{
    calls.push(url);assert(url.endsWith('page=2'));
    return new Response(JSON.stringify({products:products.slice(5)}),{headers:{'content-type':'application/json'}});
  }});
  assert.equal(resumed.coverage,'endpoint-complete');assert.equal(calls.length,3);
  const audit=analyzeSnapshot(resumed,profile);assert.equal(audit.products.length,6);assert.equal(audit.products.flatMap(p=>p.variants).length,12);
  assert.equal(audit.products[0].variants[0].price,'0');assert(audit.findings.some(f=>f.code==='DUPLICATE_SKU'));
  assert.deepEqual(checkAudit(resumed,audit),[]);checks.push('Seis pais/doze variantes preservados; preço zero e colisão rastreados.');
  const tampered=structuredClone(audit);tampered.products[0].variants[0].price='169.90';
  assert(checkAudit(resumed,tampered).length);checks.push('QA bloqueou adulteração de preço sem fonte.');
  const review={approved:true as const,operator:'roteiro-sintetico',note:'Revisão controlada para verificar o encaixe; não é aprovação comercial.'};
  const order=createInspectionDiagnostic(store,{scope,snapshot:resumed,profile,review}),svc=new Service(store);
  await assert.rejects(()=>svc.process(order.id));checks.push('Sem aprovação de escopo/simulação, produção bloqueada.');
  svc.approve(order.id);svc.simulatePayment(order.id);
  store.close();store=new Store(db);
  const same=createInspectionDiagnostic(store,{scope,snapshot:resumed,profile,review});assert.equal(same.id,order.id);assert.equal(same.status,'queued');
  checks.push('Reabertura do SQLite conservou pedido, evidências e fila sem duplicar.');
  const ready=await new Service(store).process(order.id);assert.equal(ready.status,'ready');
  const zip=store.artifact(order.id,'delivery-0.zip');writeFileSync(resolve(directory,'diagnostico-sintetico.zip'),zip);
  const entries=new AdmZip(zip).getEntries().map(e=>e.entryName);
  assert(entries.includes('inspecao-tecnica.json')&&entries.includes('fontes-inspecao.json'));checks.push('Entrega inclui diagnóstico, análise técnica, fontes, revisão e manifesto.');
  await assert.rejects(()=>new Service(store).process(order.id));
  assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get()?.n,1);
  assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE status<>'draft'").get()?.n,0);checks.push('Reexecução bloqueada; um único rascunho e nenhum envio.');
  assert.throws(()=>readInspection(store,{...scope,workspaceId:'outro'},resumed.id));assert.throws(()=>readInspection(store,{...scope,clientId:'outro'},resumed.id));
  checks.push('Consulta por outro cliente/workspace negada.');
  const updated=structuredClone(products);updated[0].variants[0].available=true;
  const after=makeSnapshot({origin:args.origin,mode:args.mode,scope,maxProducts:10,coverage:'sample',stopReason:'Segunda captura sintética.',
    capturedAt:new Date(Date.parse(resumed.capturedAt)+60_000).toISOString(),
    pages:[{url:'https://example.com/products.json?limit=10&page=1',body:JSON.stringify({products:updated})}]});
  const comparison=compareSnapshots(verifySnapshot(resumed),after,profile);assert.equal(comparison.changes.length,1);
  checks.push('Comparação registra mudança pública de disponibilidade sem afirmar demanda/reposição física.');
  for(const [name,data]of Object.entries({snapshot:resumed,audit,comparison}))writeFileSync(resolve(directory,name+'.json'),JSON.stringify(data,null,2));
  completed=true;
  const summary={completed,mode:'Dados sintéticos; coleta fixture e código real; sem chamadas de IA',directory,orderId:order.id,products:6,variants:12,
    findings:audit.findings.length,coverage:audit.coverage,checks,delivery:entries,networkCalls:0,actualRevenueBRL:0,commercialActivation:false};
  writeFileSync(resolve(directory,'report.json'),JSON.stringify(summary,null,2));
  writeFileSync(resolve(directory,'RELATORIO.md'),['# Encaixe LeakFinder → Catana Ops','',summary.mode,'',
    'Pedido: '+order.id,'Status: '+ready.status,'Produtos: 6; variantes: 12; receita real: R$0.','',
    ...checks.map(c=>'- '+c),'','Não houve auditoria de loja real, teste semântico dos oito agentes, importação, envio, cobrança ou publicação.'].join('\n'));
  console.log(JSON.stringify(summary,null,2));
}finally{
  store.close();if(!completed)writeFileSync(resolve(directory,'PENDENTE.txt'),'Ensaio interrompido. Preservar SQLite/checkpoint e consultar saída; não considerar concluído.');
}
