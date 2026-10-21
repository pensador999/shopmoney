import test from 'node:test';
import assert from 'node:assert/strict';
import { agentContracts } from '../src/business-context.ts';
import { agentPlaybook } from '../src/agent-playbooks.ts';
import { Store } from '../src/store.ts';
import { Service } from '../src/service.ts';
import { enqueueAgent, runAgentQueue } from '../src/agents.ts';
import { orderAgentRequest } from '../src/coordination.ts';

test('todos os papéis carregam procedimentos próprios e rejeitam caminho externo', () => {
  const hashes = Object.keys(agentContracts).map(role => agentPlaybook(role as keyof typeof agentContracts).version);
  assert.equal(new Set(hashes).size, 8);
  assert.throws(() => agentPlaybook('../POLITICAS' as any));
});

test('mudança durante chamada descarta resposta e terceira falha suspende tarefa', async () => {
  const store = new Store(':memory:');
  try {
    const service = new Service(store);
    const o = await service.create({name:'Synthetic',email:'fixture@example.invalid',filename:'test.csv',demo:true,
      mapping:{supplierKey:'fixture',productId:'product',title:'title',sku:'sku',price:'price',options:[{name:'Size',column:'size'}]},
      data:Buffer.from('product,title,sku,price,size\np1,Synthetic,00001,19.90,S\n')});
    const request = orderAgentRequest(store, o.id);
    enqueueAgent(store, request.role, request.input, request.clientId, request.id);
    await runAgentQueue(store, async () => {
      service.approve(o.id);
      return {summary_pt:'Escopo pendente',reply_en:'',action:'information',rule:'SCOPE-01'};
    });
    const stale = store.db.prepare('SELECT status,result FROM ai_jobs WHERE id=?').get(request.id);
    assert.equal(stale?.status, 'cancelled');
    assert.equal(stale?.result, null);
    const id = enqueueAgent(store, 'support', {text:'synthetic'});
    let calls = 0;
    for (let n=0;n<4;n++) {
      store.db.prepare('UPDATE ai_jobs SET next_at=NULL WHERE id=?').run(id);
      await runAgentQueue(store, async () => {calls++; throw Error('429 quota');});
    }
    assert.equal(calls, 3);
    assert.equal(store.db.prepare('SELECT status FROM ai_jobs WHERE id=?').get(id)?.status, 'needs_attention');
  } finally {store.close();}
});
