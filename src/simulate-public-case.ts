import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { stringify } from 'csv-stringify/sync';
import { Store } from './store.ts';
import { Service } from './service.ts';
import { readTable, qualityCheck } from './catalog.ts';
import { enqueueAgent, runAgentQueue, callEve } from './agents.ts';
import { agentContracts, type AgentRole } from './business-context.ts';

const live=process.argv.includes('--live');
const directory=resolve('artifacts',`public-case-${Date.now()}`);mkdirSync(directory,{recursive:true});
const dbPath=resolve(directory,'simulation.sqlite');let store=new Store(dbPath),service=new Service(store);
const checks:string[]=[],results:any[]=[];
const evidence={
  reference:'DUAS Design',url:'https://duasdesign.com/',
  sources:[{url:'https://www.shopify.com/br/blog/lojas-virtuais-shopify',fact:'Shopify inclui DUAS entre lojas brasileiras de moda e vestuário.'},
    {url:'https://duasdesign.com/',fact:'Vitrine apresenta roupas por modelo/material/estampa e identifica Recife e Shopify.'},
    {url:'https://duasdesign.com/products/bolsa-isa',fact:'Página consultada apresenta uma opção de cor; descrição/material dependem de confirmação, não foram copiados.'}],
  qualification:'Referência técnica de lojista brasileiro; não é agência nem cliente ou lead qualificado. Não há demanda, dor, frequência, orçamento ou intenção de compra confirmados.',
  unavailable:['arquivo de fornecedor autorizado','regras internas de agrupamento','SKU/GTIN oficiais autorizados','moeda da loja de destino confirmada pelo cliente','contato comercial autorizado'],
};
const mapping={supplierKey:'synthetic-public-reference',productId:'parent',title:'title',sku:'sku',price:'price',barcode:'ean',description:'description',imageUrl:'image',
  csvDelimiter:';' as const,priceDecimalSeparator:',' as const,options:[{name:'Size',column:'size'},{name:'Color',column:'color'}]};
// Fully authored fixtures: no brand product names, descriptions, prices, IDs or images.
const rows=[
 {parent:'P01',title:'Synthetic garment A',sku:'000201',price:'19,90',ean:'0012345678905',size:'P',color:'Synthetic blue',description:'Synthetic data only',image:'https://example.invalid/fixture-a.jpg'},
 {parent:'P01',title:'Synthetic garment A',sku:'000202',price:'19,90',ean:'',size:'M',color:'Synthetic blue',description:'Synthetic data only',image:'https://example.invalid/fixture-a.jpg'},
 {parent:'P02',title:'Synthetic accessory B',sku:'000301',price:'29,90',ean:'',size:'One size',color:'Synthetic red',description:'Synthetic data only',image:'https://example.invalid/fixture-b.jpg'},
 {parent:'P02',title:'Synthetic accessory B',sku:'000302',price:'29,90',ean:'',size:'One size',color:'Synthetic green',description:'Synthetic data only',image:'https://example.invalid/fixture-b.jpg'},
 {parent:'P02',title:'Synthetic accessory B',sku:'000303',price:'29,90',ean:'',size:'One size',color:'Synthetic black',description:'Synthetic data only',image:'https://example.invalid/fixture-b.jpg'},
];
const encode=(r:typeof rows)=>Buffer.from('\uFEFF'+stringify(r,{header:true,delimiter:';'}));
const started=Date.now();let orderId='';let completed=false;
function save(){writeFileSync(resolve(directory,'report.json'),JSON.stringify({generatedAt:new Date().toISOString(),live,completed,evidence,orderId,checks,agents:results,
  technicalTimeMs:Date.now()-started,actualRevenue:0,actualMargin:null,
  limits:['Pesquisa de referência real; cliente, arquivo e transições comerciais fictícios.','Dados da marca não copiados para o catálogo. Sem login, contato, compra ou importação na loja.','O roteiro conduz as etapas; não comprova handoffs autônomos.','Tempo técnico medido não inclui prospecção humana, negociação ou suporte.','Moeda do serviço USD é distinta da moeda dos produtos; BRL neste teste é premissa sintética, sem conversão.']},null,2));}
try{
  writeFileSync(resolve(directory,'public-evidence.json'),JSON.stringify(evidence,null,2));
  const incomplete=structuredClone(rows);incomplete[0].price='';
  const o=await service.create({name:'Synthetic operator rehearsal — not DUAS',email:'fixture@example.invalid',filename:'synthetic-supplier.csv',data:encode(incomplete),mapping,demo:true});orderId=o.id;
  assert.equal(o.status,'needs_info');checks.push('Preço ausente bloqueia planejamento/produção');
  for(const role of ['research','sales','support','planner','finance','production','quality','coordinator'] as AgentRole[]){
    if(role==='planner'){
      await service.revise(orderId,encode(rows),'corrected.csv',mapping);
      assert.equal(store.get(orderId).status,'scoped');checks.push('Correção explícita preserva original e cria revisão');
    }
    if(role==='finance'){service.approve(orderId);await assert.rejects(()=>service.process(orderId));checks.push('Aprovação sem pagamento não libera produção');}
    if(role==='production'){
      service.simulatePayment(orderId);store.close();store=new Store(dbPath);service=new Service(store);
      assert.equal(store.get(orderId).status,'queued');checks.push('Retomada preserva fila após reabrir banco');
      await service.process(orderId);
    }
    if(role==='quality'){
      const current=store.get(orderId);const output=await readTable(store.artifact(orderId,`shopify-${current.revision}.csv`),'.csv');
      assert.equal(current.report.productCount,2);assert.equal(current.report.variantCount,5);
      assert.equal(output[0].SKU,'000201');assert.equal(output[0].Barcodes,'0012345678905');
      assert.equal(output[0].Price,'19.90');checks.push('Dois pais/cinco variantes, zeros e decimal preservados');
      const source=JSON.parse(store.artifact(orderId,`source-${current.revision}.json`).toString());
      assert.deepEqual(qualityCheck(source,output,current.mapping),[]);output[0].Price='0.01';assert(qualityCheck(source,output,current.mapping).length>0);
      checks.push('QA independente aprova original e detecta adulteração');
      await assert.rejects(()=>service.process(orderId));assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get()?.n,1);checks.push('Reexecução não duplica pacote de entrega');
      writeFileSync(resolve(directory,'delivery.zip'),store.artifact(orderId,`delivery-${current.revision}.zip`));
    }
    if(role==='coordinator'){
      service.delivered(orderId,store.get(orderId).deliveryId!);service.closeExpired(Date.parse(store.get(orderId).deliveredAt!)+8*86400000);
      assert.equal(store.get(orderId).acceptedAt,undefined);checks.push('Encerramento simulado sem aceite presumido');
    }
    const state=store.get(orderId);
    const jobId=enqueueAgent(store,role,{caseEvidence:evidence,mode:'public-reference-plus-synthetic-rehearsal',
      instruction:'Separe os fatos da loja pública das premissas fictícias. Não qualifique como agência nem declare problema comprovado. Não peça dados já recebidos na fixture. Analise sua etapa; declare limites e próximo responsável. Sem envio, cobrança ou loja real.',
      status:state.status,synthetic:true,evidence:{sourceReceived:true,structuralValidation:state.report.ok,structuralIssues:state.report.issues.slice(0,10),mapping:state.mapping,products:state.report.productCount,variants:state.report.variantCount,revision:state.revision,
        scopeApproved:state.scopeApproved,simulatedPayment:!!state.receipt,productCurrency:'BRL (somente premissa da fixture)',serviceCurrency:'USD',
        quality:state.qa?{completed:true,executor:'deterministic-qualityCheck',report:state.qa}:{completed:false},
        artifacts:store.db.prepare('SELECT name FROM artifacts WHERE order_id=?').all(orderId),costsMeasured:false}},state.clientId);
    await runAgentQueue(store,live?callEve:async()=>({summary_pt:`${agentContracts[role].owner}: resposta controlada, sem avaliar o modelo.`,reply_en:'',action:'needs_info',rule:'AI-01'}));
    const result=store.db.prepare('SELECT role,status,result,error FROM ai_jobs WHERE id=?').get(jobId);
    results.push(result);save();if(result?.status!=='done')throw Error(`Agente ${role} não concluiu: ${result?.error}`);
  }
  assert.equal(store.get(orderId).status,'closed');
  assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE status<>'draft'").get()?.n,0);checks.push('Nenhum envio, contato, cobrança ou efeito em loja');
  completed=true;
}finally{
  save();store.close();
  const report=JSON.parse((await import('node:fs')).readFileSync(resolve(directory,'report.json'),'utf8'));
  const md=['# Caso real de referência — DUAS Design','',`Modo IA: ${live?'Eve real local':'respostas controladas'}. Ciclo técnico completo: ${completed}.`,'',
  'A loja é real; não é cliente, agência ou piloto comercial validado. Arquivo, aprovação, pagamento e entrega são sintéticos. Receita real: zero. Margem: desconhecida.','',
  '## Fontes e observações',...evidence.sources.map(s=>`- ${s.fact} [Fonte](${s.url})`),'','## Verificações',...checks.map(c=>`- ${c}`),'',
  '## Respostas dos oito papéis',...results.flatMap(r=>{const a=r.result?JSON.parse(r.result):null;return [`### ${agentContracts[r.role as AgentRole].owner}`,`Estado: ${r.status}`,a?.summary_pt??r.error,''];}),
  '## Limites',...report.limits.map((s:string)=>`- ${s}`),'','O roteiro conduz as transições e não qualifica o funcionamento autônomo das passagens. As respostas exigem revisão humana. O pacote é somente de teste; não importar na loja de referência.'];
  writeFileSync(resolve(directory,'RESULTADO.md'),md.join('\n'));
  if(live&&completed)writeFileSync(resolve('artifacts','public-case-summary.json'),JSON.stringify({title:'DUAS Design — referência pública',url:evidence.url,generatedAt:report.generatedAt,mode:'Eve local real + catálogo sintético',completed,checks,
    agents:results.map(r=>({role:r.role,...JSON.parse(r.result)})),
    boundaries:'Roteiro supervisionado, cliente e arquivo fictícios. Sem contato, cobrança ou importação. Não representa a fila remota nem comprova handoffs autônomos.'},null,2));
  console.log(JSON.stringify({directory,completed,roles:results.filter(r=>r?.status==='done').length,checks:checks.length}));
}
