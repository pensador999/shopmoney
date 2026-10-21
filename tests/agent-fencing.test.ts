import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.ts';
import { enqueueAgent, runAgentQueue } from '../src/agents.ts';

test('executor antigo não grava resultado ou erro após perder lease', async () => {
  for (const fail of [false, true]) {
    const store = new Store(':memory:');
    try {
      const id = enqueueAgent(store, 'support', { synthetic: true });
      await runAgentQueue(store, async () => {
        store.db.prepare("UPDATE leases SET owner='replacement' WHERE name='ai'").run();
        store.db.prepare("UPDATE ai_jobs SET status='done',result='replacement-result' WHERE id=?").run(id);
        if (fail) throw Error('429 late failure');
        return {summary_pt:'Old result',reply_en:'',action:'information',rule:'AI-01'};
      });
      const row = store.db.prepare('SELECT status,result FROM ai_jobs WHERE id=?').get(id);
      assert.equal(row?.status, 'done');
      assert.equal(row?.result, 'replacement-result');
      assert.equal(store.db.prepare("SELECT owner FROM leases WHERE name='ai'").get()?.owner, 'replacement');
      assert.throws(() => enqueueAgent(store, 'constructor' as any, {}));
    } finally { store.close(); }
  }
});
