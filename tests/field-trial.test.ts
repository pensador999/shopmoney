import test from 'node:test';
import assert from 'node:assert/strict';
import { runFieldTrials } from '../src/field-trial.ts';
import { Store } from '../src/store.ts';
import { runAgentAutopilot } from '../src/autopilot.ts';

test('ensaio de campo multi-lojas valida adaptação, fronteira de demanda, ML local supervisionado e 8 handoffs', async () => {
  const summary = await runFieldTrials(false);
  assert.equal(summary.metrics.storesTested, 3);
  assert.equal(summary.metrics.verifiedHandoffsCount, 8);
  assert(summary.metrics.learnedAdaptationScore > summary.metrics.initialAdaptationScore);
  assert(summary.metrics.mappingConfidenceFirstRun >= 0.65);
  assert(summary.metrics.mappingConfidenceAfterLearning >= summary.metrics.mappingConfidenceFirstRun);
  assert(summary.metrics.categoryPredictionConfidence >= 0.7);
  assert(summary.metrics.contributionBRL! > 0);
  assert.equal(summary.actualRevenueBRL, 0);
  assert(summary.checks.length >= 5);
  assert.equal(summary.observations.length, 3);
});

test('entrada assistida não inventa aprovação, custo, contato ou pedido; repetição não duplica efeitos', async () => {
 const store=new Store(':memory:');try{
  const res=await runAgentAutopilot(store);await runAgentAutopilot(store);
  assert.equal(res.status,'needs_review');assert.equal(res.client.email,null);
  assert.equal(res.economics.contribution,null);assert.equal(store.orders().length,0);
  assert.deepEqual(store.setting('gates',{}),{});
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM ai_jobs').get()!.n,0);
 }finally{store.close();}
});
