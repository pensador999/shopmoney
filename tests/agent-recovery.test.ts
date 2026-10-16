import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.ts';
import { enqueueAgent, runAgentQueue } from '../src/agents.ts';

test('retomada respeita worker ativo e recupera tarefa quando lease expira', async () => {
  const store = new Store(':memory:');
  try {
    const id = enqueueAgent(store, 'support', { text: 'synthetic' });
    store.db.prepare("UPDATE ai_jobs SET status='running' WHERE id=?").run(id);
    store.acquire('ai', 'previous-worker', 180000);
    let calls = 0;
    const invoke = async () => { calls++; return { summary_pt: 'Dados pendentes', reply_en: '', action: 'needs_info' as const, rule: 'SCOPE-01' as const }; };
    await runAgentQueue(store, invoke); assert.equal(calls, 0);
    store.db.prepare("UPDATE leases SET expires=0 WHERE name='ai'").run();
    await runAgentQueue(store, invoke); assert.equal(calls, 1);
    assert.equal(store.db.prepare('SELECT status FROM ai_jobs WHERE id=?').get(id)?.status, 'done');
    await runAgentQueue(store, invoke); assert.equal(calls, 1);
  } finally { store.close(); }
});
