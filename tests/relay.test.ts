import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../worker/index.ts';
import { businessDays, localDay } from '../src/policy.ts';
test('receptor público autentica Stripe e não armazena dados pessoais',async()=>{
  let bindings:any[]=[];
  const env={STRIPE_WEBHOOK_SECRET:'whsec_synthetic',SYNC_TOKEN:'synthetic-token',DB:{prepare:()=>({bind:(...values:any[])=>({run:async()=>{bindings=values;}})})}};
  const payload=JSON.stringify({id:'evt_demo',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_demo',amount_total:14900,currency:'usd',customer_email:'private@example.com',customer_details:{address:'private'}}}});
  const t=Math.floor(Date.now()/1000),sig=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex');
  const fake=await worker.fetch(new Request('https://example.com/webhook',{method:'POST',body:payload,headers:{'stripe-signature':'t=0,v1=bad'}}),env);assert.equal(fake.status,400);assert.equal(bindings.length,0);
  const valid=await worker.fetch(new Request('https://example.com/webhook',{method:'POST',body:payload,headers:{'stripe-signature':`t=${t},v1=${sig}`}}),env);assert.equal(valid.status,200);assert.equal(bindings[0],'evt_demo');assert(!bindings[1].includes('private'));assert.equal((await worker.fetch(new Request('https://example.com/events'),env)).status,401);
});
test('prazo e limite diário seguem São Paulo inclusive próximo da meia-noite UTC',()=>{
  const date=new Date('2026-10-16T01:00:00Z'); // Quinta 22h em São Paulo.
  assert.equal(localDay(date),'2026-10-15');assert.equal(localDay(new Date(businessDays(date,3))),'2026-10-20');
});
