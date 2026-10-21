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

test('piloto automático (autopilot) executa os 8 agentes fim a fim com zero preenchimento manual', async () => {
  const store = new Store(':memory:');
  try {
    const res = await runAgentAutopilot(store);
    assert.equal(res.ok, true);
    assert.equal(res.client.name, 'Atelier Linha Clara');
    assert.equal(res.autoDetected.delimiter, ';');
    assert.equal(res.autoDetected.priceDecimalSeparator, ',');
    assert(res.autoDetected.mappingConfidence >= 0.75);
    assert.equal(res.steps.length, 8);
    assert.equal(res.handoffs.verifiedRoles.length, 8);
    assert.equal(res.reconciliation.ok, true);
    assert.equal(res.reconciliation.matchedSkus, 5);
    assert(res.economics.contribution! > 400);
  } finally {
    store.close();
  }
});
