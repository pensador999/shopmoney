import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Stripe from 'stripe';
import { Store } from '../src/store.ts';
import { Service } from '../src/service.ts';
import { Payments } from '../src/payments.ts';
import { demoCsv, demoMapping, runDemo } from '../src/demo.ts';
import { enqueueAgent, runAgentQueue } from '../src/agents.ts';
import { suppress, sendOutbox, approveMessage } from '../src/mail.ts';
import { createApp } from '../src/server.ts';
const input={name:'Test',email:'buyer@example.com',filename:'supplier.csv',data:Buffer.from(demoCsv),mapping:demoMapping};
test('pagamento de sandbox nunca autoriza email real',async()=>{
  const s=new Store(':memory:'), previous=process.env.MAIL_SEND_ENABLED;
  try {
    const svc=new Service(s),o=await svc.create(input);svc.approve(o.id);const p=s.get(o.id);p.checkoutId='cs_sandbox';s.save(p);
    new Payments(s,new Stripe('rk_test_fake')).apply({id:'evt_sandbox',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_sandbox',mode:'payment',amount_total:o.amount,currency:o.currency,client_reference_id:o.id,payment_status:'paid'}}} as any);
    const ready=await svc.process(o.id);approveMessage(s,ready.deliveryId!);s.set('identity',{name:'Synthetic',address:'Synthetic'});process.env.MAIL_SEND_ENABLED='true';
    await assert.rejects(()=>sendOutbox(s),/ambiente de testes/);
    assert.equal((s.db.prepare('SELECT status FROM outbox WHERE id=?').get(ready.deliveryId!) as any).status,'approved');
  } finally {if(previous===undefined)delete process.env.MAIL_SEND_ENABLED;else process.env.MAIL_SEND_ENABLED=previous;s.close();}
});
test('demonstração gera pacote, guarda original e não duplica entrega',async()=>{
  const s=new Store(':memory:');try{const o=await runDemo(s);assert.equal(o.status,'ready');assert(s.artifact(o.id,'delivery-0.zip').length>100);assert.equal(s.artifact(o.id,'original').toString(),demoCsv);await assert.rejects(()=>new Service(s).process(o.id));assert.equal((s.db.prepare('SELECT COUNT(*) n FROM outbox').get() as any).n,1);}finally{s.close();}
});
test('produção exige pagamento; simulação não funciona em cliente real',async()=>{
  const s=new Store(':memory:');try{const svc=new Service(s),o=await svc.create(input);await assert.rejects(()=>svc.process(o.id));assert.throws(()=>svc.simulatePayment(o.id));svc.approve(o.id);await assert.rejects(()=>svc.process(o.id));}finally{s.close();}
});
test('webhook falsificado, valor incorreto e evento duplicado',async()=>{
  const s=new Store(':memory:');try{
    const svc=new Service(s),o=await svc.create(input);svc.approve(o.id);const pending=s.get(o.id);pending.checkoutId='cs_test_123';s.save(pending);
    const sdk=new Stripe('rk_test_fake'), payments=new Payments(s,sdk),secret='whsec_test_only';
    const event:any={id:'evt_1',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_test_123',mode:'payment',amount_total:o.amount,currency:o.currency,client_reference_id:o.id,payment_status:'paid',payment_intent:'pi_1'}}};
    assert.throws(()=>payments.verify(Buffer.from(JSON.stringify(event)),'t=0,v1=bad',secret));
    event.data.object.amount_total=1;assert.throws(()=>payments.apply(event));assert.equal(s.get(o.id).status,'awaiting_payment');
    event.data.object.amount_total=o.amount;const payload=JSON.stringify(event),sig=sdk.webhooks.generateTestHeaderString({payload,secret});payments.verify(Buffer.from(payload),sig,secret);
    assert.equal(s.get(o.id).status,'queued');assert.equal(s.get(o.id).paymentMode,'test');assert.deepEqual(payments.apply(event),{duplicate:true});
  }finally{s.close();}
});
test('pagamento assíncrono não liberado fica pendente; pagamento tardio após cancelamento pede reembolso',async()=>{
  const s=new Store(':memory:');try{const svc=new Service(s),o=await svc.create(input);svc.approve(o.id);const p=s.get(o.id);p.checkoutId='cs_x';s.save(p);const pay=new Payments(s,new Stripe('rk_test_fake'));
    const e:any={id:'e1',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_x',mode:'payment',amount_total:o.amount,currency:o.currency,client_reference_id:o.id,payment_status:'unpaid'}}};pay.apply(e);assert.equal(s.get(o.id).status,'awaiting_payment');svc.cancel(o.id);e.id='e2';e.type='checkout.session.async_payment_succeeded';e.data.object.payment_status='paid';e.data.object.payment_intent='pi_x';pay.apply(e);assert.equal(s.get(o.id).status,'refund_pending');
  }finally{s.close();}
});
test('isolamento entre clientes e retomada de pedido após reabrir SQLite',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'catalog-test-'));const path=join(dir,'db.sqlite');let s=new Store(path);
  try{const o=await runDemo(s);assert.throws(()=>s.get(o.id,'other-client'));s.close();s=new Store(path);assert.equal(s.get(o.id).status,'ready');assert(s.artifact(o.id,'delivery-0.zip'));assert.equal((s.db.prepare('SELECT COUNT(*) n FROM outbox').get() as any).n,1);}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('falta de cota mantém tarefa e permite retomada sem serviço pago',async()=>{
  const s=new Store(':memory:');try{const id=enqueueAgent(s,'sales',{text:'test'});await runAgentQueue(s,async()=>{throw Error('429 quota exhausted');});assert.equal(s.setting('aiPaused',false),true);assert.equal((s.db.prepare('SELECT status FROM ai_jobs WHERE id=?').get(id) as any).status,'paused');s.db.prepare('UPDATE ai_jobs SET next_at=NULL').run();await runAgentQueue(s,async()=>({summary_pt:'Teste',reply_en:'',action:'needs_info',rule:'SCOPE-01'}));assert.equal((s.db.prepare('SELECT status FROM ai_jobs WHERE id=?').get(id) as any).status,'done');assert.equal(s.setting('aiPaused',true),false);}finally{s.close();}
});
test('recusa suprime abordagem e acompanhamento; cancelamento bloqueia entrega',async()=>{
  const s=new Store(':memory:');try{s.enqueue('a',null,'buyer@example.com','outreach','Hi','Hi');s.enqueue('b',null,'buyer@example.com','followup','Hi','Hi');suppress(s,'buyer@example.com','no');assert((s.db.prepare('SELECT status FROM outbox').all() as any[]).every(r=>r.status==='cancelled'));const o=await runDemo(s);new Service(s).cancel(o.id);assert.equal(s.get(o.id).status,'cancelled');}finally{s.close();}
});
test('encerramento administrativo não inventa aceite',async()=>{const s=new Store(':memory:');try{const o=await runDemo(s),svc=new Service(s);svc.delivered(o.id,o.deliveryId!);svc.closeExpired(Date.now()+8*86400000);assert.equal(s.get(o.id).status,'closed');assert.equal(s.get(o.id).acceptedAt,undefined);}finally{s.close();}});
test('API exige token e origem local; demonstração funciona pelo HTTP',async()=>{
  const s=new Store(':memory:'),port=14318,server=createApp(s,port);await new Promise<void>(r=>server.listen(port,'127.0.0.1',r));
  try{const base=`http://127.0.0.1:${port}`,page=await(await fetch(base)).text(),token=page.match(/name="catalog-token" content="([^"]+)/)![1];assert.equal((await fetch(base+'/api/state')).status,400);assert.equal((await fetch(base+'/api/state',{headers:{'x-catalog-token':token,origin:'https://evil.example'}})).status,400);const result=await fetch(base+'/api/demo',{method:'POST',headers:{'x-catalog-token':token,'content-type':'application/json'},body:'{}'});assert.equal(result.status,200);assert.equal((await result.json() as any).status,'ready');}finally{await new Promise<void>(r=>server.close(()=>r()));s.close();}
});
