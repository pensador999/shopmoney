import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.ts';
import { Service } from '../src/service.ts';
import { orderAssignment, orderAgentRequest } from '../src/coordination.ts';
import { enqueueAgent, runAgentQueue } from '../src/agents.ts';

test('pedido define responsável, evita jobs duplicados e descarta contexto antigo sem consumir IA', async () => {
  const store = new Store(':memory:');
  try {
    const service = new Service(store);
    const mapping={supplierKey:'fixture',productId:'product',title:'title',sku:'sku',price:'price',options:[{name:'Size',column:'size'}]};
    const order=await service.create({name:'Synthetic',email:'fixture@example.invalid',filename:'valid.csv',demo:true,mapping,data:Buffer.from('product,title,sku,price,size\np1,Synthetic,00001,19.90,S\n')});
    assert.equal(order.status,'scoped');
    assert.equal(orderAssignment(order).role,'planner');
    const task=orderAgentRequest(store,order.id);
    for(let i=0;i<2;i++) enqueueAgent(store,task.role,task.input,task.clientId,task.id);
    assert.equal(store.db.prepare('select count(*) n from ai_jobs').get()?.n,1);
    assert(!JSON.stringify(task.input).includes('00001'));
    service.approve(order.id);
    let calls=0;
    await runAgentQueue(store,async()=>{calls++;throw Error('Should not execute stale context');});
    assert.equal(calls,0);
    assert.equal(store.db.prepare('select status from ai_jobs where id=?').get(task.id)?.status,'cancelled');
    assert.equal(orderAssignment(store.get(order.id)).role,'finance');
    service.simulatePayment(order.id);
    assert.equal(orderAssignment(store.get(order.id)).role,'production');
    await service.process(order.id);
    const ready=orderAssignment(store.get(order.id));
    assert.equal(ready.role,'support');
    assert.equal(ready.blockers.length,0);
    assert(ready.tasks.some(t=>t.step==='quality'&&t.state==='done'));
    const current=orderAgentRequest(store,order.id);
    enqueueAgent(store,current.role,current.input,current.clientId,current.id);
    await runAgentQueue(store,async()=>({summary_pt:'Aguardando entrega simulada',reply_en:'',action:'information',rule:'SCOPE-01'}));
    assert.equal(store.get(order.id).status,'ready'); // Advice never approves or delivers.
    assert.equal(store.db.prepare('select status from outbox').get()?.status,'draft');
  } finally {store.close();}
});
