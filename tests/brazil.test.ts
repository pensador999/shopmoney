import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.ts';
import { Service } from '../src/service.ts';
import { createEditorial, reviseEditorial } from '../src/service-editorial.ts';
import { contentRequestSchema, prepareContent, checkContent } from '../src/brand-content.ts';
import { offers, offerSnapshot } from '../src/offers.ts';
import { economics } from '../src/order-workflow.ts';
import { validateHandoff, replenishmentReadiness } from '../src/handoffs.ts';
import { proposeLearning, reviewLearning } from '../src/learning.ts';
import { responseSchema, enqueueAgent, runAgentQueue } from '../src/agents.ts';
import { demoCsv, demoMapping } from '../src/demo.ts';
import AdmZip from 'adm-zip';
import { Payments } from '../src/payments.ts';
export const brief={brand:{version:'1',audience:'Público de teste',proposition:'Clareza',tone:'Direto',forbiddenTerms:['milagroso'],materialAuthorization:true},products:[{id:'P001',title:'Camiseta sintética',facts:[{text:'Composição: 100% algodão.',source:'Ficha técnica sintética',approved:true}],copy:[],copyApproved:false}]};
test('ofertas BRL versionadas, 5 ofertas avulsas habilitadas em simulação e sem conversão de produto',async()=>{
  assert.equal(offers.content.cents,49000);assert.equal(offerSnapshot('images').cents,29000);assert.equal(offerSnapshot('images').commercialEnabled,false);
  const s=new Store(':memory:');try{const o=await new Service(s).create({name:'Marca',email:'m@example.com',filename:'t.csv',data:Buffer.from(demoCsv),mapping:demoMapping,demo:true});assert.equal(o.currency,'brl');assert.equal(o.amount,69000);assert.equal(o.offer?.maxProducts,20);assert.equal(s.artifact(o.id,'source-0.json').toString().includes('19.90'),true);}finally{s.close();}
});
test('conteúdo independente passa por escopo, produção, conferência e ZIP sem exigir SKU/preço',async()=>{
  const s=new Store(':memory:');try{const o=createEditorial(s,{name:'Marca',email:'m@example.com',service:'content',brief,demo:true}),svc=new Service(s);assert.equal(o.status,'scoped');await assert.rejects(()=>svc.process(o.id),/Pagamento/);svc.approve(o.id);svc.simulatePayment(o.id);const ready=await svc.process(o.id);assert.equal(ready.status,'ready');assert.equal(ready.amount,49000);const zip=new AdmZip(s.artifact(o.id,'delivery-0.zip'));assert(zip.readAsText('conteudo.csv').includes('100% algodão'));assert(!zip.getEntry('shopify.csv'));assert.equal(s.db.prepare('SELECT count(*) n FROM outbox').get()?.n,1);await assert.rejects(()=>svc.process(o.id));assert.equal(s.db.prepare('SELECT count(*) n FROM outbox').get()?.n,1);}finally{s.close();}
});
test('conteúdo bloqueia alegações não aprovadas, referências inválidas e adulteração',()=>{
  const unapproved=structuredClone(brief);unapproved.products[0].facts[0].approved=false;
  assert.throws(()=>prepareContent(contentRequestSchema.parse(unapproved)),/aprovação/);
  const input=contentRequestSchema.parse(brief),output=prepareContent(input);output[0].html+='<p>Cura doenças</p>';assert(checkContent(input,output).length);
  const forged=contentRequestSchema.parse(brief);forged.products[0].copy=[{text:'Impermeável',factIndexes:[99]}];forged.products[0].copyApproved=true;assert.throws(()=>prepareContent(forged),/referências/);
  const formula=contentRequestSchema.parse(brief);formula.products[0].title='=HYPERLINK("example.com")';assert.throws(()=>prepareContent(formula),/fórmula/);
});
test('diagnóstico não exige cadastro completo nem presume alta demanda',async()=>{
  const s=new Store(':memory:');try{const o=createEditorial(s,{name:'Marca',email:'m@example.com',service:'diagnostic',brief:{products:[{id:'P1',title:'',description:'',source:'Fixture'}]},demo:true}),svc=new Service(s);svc.approve(o.id);svc.simulatePayment(o.id);assert.equal(Math.round((Date.parse(s.get(o.id).dueAt!)-Date.now())/86400000)>=2,true);await svc.process(o.id);const result=JSON.parse(new AdmZip(s.artifact(o.id,'delivery-0.zip')).readAsText('diagnostico.json'));assert.equal(result.findings.length,2);assert(result.limits.some((s:string)=>s.includes('alta procura')));}finally{s.close();}
});
test('revisão invalida QA/custos, exige reaprovação e defeito não consome ajuste',async()=>{
  const s=new Store(':memory:');try{const o=createEditorial(s,{name:'Marca',email:'m@example.com',service:'content',brief,demo:true}),svc=new Service(s);svc.approve(o.id);svc.simulatePayment(o.id);const ready=await svc.process(o.id);svc.delivered(o.id,ready.deliveryId!);const revised=reviseEditorial(s,o.id,brief,'defect');assert.equal(revised.status,'revision_approval');assert.equal(revised.qa,undefined);assert.equal(revised.deliveryId,undefined);assert.equal(revised.corrections,0);assert.equal(revised.scopeApproved,false);await assert.rejects(()=>svc.process(o.id));}finally{s.close();}
});
test('perfil não pode ser alterado mantendo versão; isolamento entre clientes',()=>{
  const s=new Store(':memory:');try{const a=s.client('A','a@example.com'),b=s.client('B','b@example.com');s.profile(a.id,'1',{tone:'A'});assert.throws(()=>s.profile(a.id,'1',{tone:'B'}),/nova versão/);s.profile(b.id,'1',{tone:'B'});assert.equal(s.db.prepare('SELECT count(*) n FROM client_profiles').get()?.n,2);}finally{s.close();}
});
test('custos brasileiros exigem tributos; legado USD permanece com referência histórica',()=>{
  const s=new Store(':memory:');try{const o=createEditorial(s,{name:'Marca',email:'m@example.com',service:'content',brief,demo:true});Object.assign(o,{receipt:'DEMO-NO-MONEY',hours:2,fees:5,costs:5,economicsRecordedAt:new Date().toISOString()});assert.equal(economics(o).contribution,null);o.taxes=20;assert.equal(economics(o).contribution,340);const legacy={...o,offer:undefined,currency:'usd',amount:14900};assert.equal(economics(legacy).laborRate,25);assert.equal(economics(legacy).contribution,89);}finally{s.close();}
});
test('contratos rejeitam revisão errada, pendências e QA consultivo',()=>{
  const expected={orderId:'00000000-0000-4000-8000-000000000001',revision:0,service:'content'};
  const data={...expected,evidence:['hash'],pending:[],passed:true,checks:['Fonte'],executor:'independent-code'};
  assert.equal(validateHandoff('quality',data,expected).role,'quality');assert.throws(()=>validateHandoff('quality',{...data,revision:1},expected));assert.throws(()=>validateHandoff('quality',{...data,pending:['Fato ausente']},expected));assert.throws(()=>validateHandoff('quality',{...data,executor:'LLM'},expected));
});
test('aprendizado fica por cliente e exige revisão humana com teste',()=>{
  const s=new Store(':memory:');try{const o=createEditorial(s,{name:'Marca',email:'m@example.com',service:'content',brief,demo:true});const p=proposeLearning(s,{orderId:o.id,revision:0,problem:'Tom',evidence:['Correção aprovada'],proposedRule:'Texto mais direto'});assert.throws(()=>reviewLearning(s,p.id,'outro-cliente',{approved:true,testEvidence:'Teste'}));assert.throws(()=>reviewLearning(s,p.id,o.clientId,{approved:true,testEvidence:''}));assert.equal(reviewLearning(s,p.id,o.clientId,{approved:true,testEvidence:'Avaliação do operador'}).scope,'client-only');assert.equal(s.setting('globalRule',null),null);}finally{s.close();}
});
test('respostas históricas continuam legíveis e nova resposta exige idioma',()=>{
  const old=responseSchema.parse({summary_pt:'Teste',reply_en:'Hello',action:'information',rule:'SCOPE-01'});assert.equal(old.language,'en');
  assert.equal(responseSchema.parse({summary_pt:'Teste',reply_client:'Olá',language:'pt-BR',action:'information',rule:'SCOPE-01'}).language,'pt-BR');
  assert.throws(()=>responseSchema.parse({summary_pt:'Teste',reply_client:'Olá',action:'information',rule:'SCOPE-01'}));
});
test('reposição sem disponibilidade ou histórico suficiente não é avaliável',()=>{
  assert.equal(replenishmentReadiness({historyDays:90,sales:true,availability:false,stock:true,inTransit:true,leadTime:true}).status,'not_evaluable');
});
test('fila dos oito papéis aceita resposta brasileira e continua consultiva',async()=>{
  const s=new Store(':memory:');try{for(const role of ['research','sales','support','planner','production','quality','finance','coordinator'] as const){const id=enqueueAgent(s,role,{service:'content',synthetic:true});await runAgentQueue(s,async()=>({summary_pt:'Ensaio controlado; não valida qualidade do modelo.',reply_client:'',language:'pt-BR',action:'information',rule:'SCOPE-01'}));assert.equal(s.db.prepare('SELECT status FROM ai_jobs WHERE id=?').get(id)?.status,'done');}assert.equal(s.orders().length,0);}finally{s.close();}
});
test('combinado entrega cadastro e conteúdo e rejeita conteúdo de outro lote',async()=>{
  const s=new Store(':memory:');try{const svc=new Service(s),input={name:'Marca',email:'m@example.com',filename:'t.csv',data:Buffer.from(demoCsv),mapping:demoMapping,demo:true,service:'combined' as const,content:brief};
    const o=await svc.create(input);svc.approve(o.id);svc.simulatePayment(o.id);await svc.process(o.id);const zip=new AdmZip(s.artifact(o.id,'delivery-0.zip'));assert(zip.getEntry('shopify.csv'));assert(zip.getEntry('conteudo-por-identificador.csv'));assert.equal(s.get(o.id).amount,99000);
    const other=structuredClone(brief);other.products[0].id='P999';await assert.rejects(()=>svc.create({...input,content:other}),/referenciar/);
  }finally{s.close();}
});
test('catálogo novo rejeita mais de 20 pais; cobrança brasileira bloqueada antes de rede',async()=>{
  const s=new Store(':memory:');try{const svc=new Service(s),data='product_id,title,sku,price,size\n'+Array.from({length:21},(_,i)=>`P${i},Camiseta,${String(i).padStart(5,'0')},49.90,P`).join('\n');await assert.rejects(()=>svc.create({name:'M',email:'m@example.com',filename:'t.csv',data:Buffer.from(data),mapping:{supplierKey:'s',productId:'product_id',title:'title',sku:'sku',price:'price',options:[{name:'Tamanho',column:'size'}]},demo:true}),/limites/);
    const o=createEditorial(s,{name:'Marca',email:'m@example.com',service:'content',brief,demo:true});svc.approve(o.id);await assert.rejects(()=>new Payments(s).checkout(o.id),/cobrança bloqueada/);
  }finally{s.close();}
});
