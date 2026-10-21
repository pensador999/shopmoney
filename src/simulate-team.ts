import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Store } from './store.ts';
import { Service } from './service.ts';
import { demoCsv, demoMapping } from './demo.ts';
import { agentContracts, type AgentRole } from './business-context.ts';
import { agentPlaybook } from './agent-playbooks.ts';
import { enqueueAgent, runAgentQueue, callEve } from './agents.ts';

const live = process.argv.includes('--live');
const directory = resolve('artifacts', `team-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const path = resolve(directory, 'simulation.sqlite');
let store = new Store(path);
let service = new Service(store);
const results: unknown[] = [];
try {
  const order = await service.create({ name: 'Synthetic agency', email: 'team@example.invalid', filename: 'synthetic.csv', data: Buffer.from(demoCsv), mapping: demoMapping, demo: true });
  for (const role of ['research','sales','support','planner','finance','production','quality','coordinator'] as AgentRole[]) {
    if (role === 'finance') service.approve(order.id);
    if (role === 'production') {
      service.simulatePayment(order.id);
      store.close(); store = new Store(path); service = new Service(store);
      assert.equal(store.get(order.id).status, 'queued');
      await service.process(order.id);
    }
    if (role === 'quality') assert.equal(store.get(order.id).status, 'ready');
    if (role === 'coordinator') {
      service.delivered(order.id, store.get(order.id).deliveryId!);
      service.closeExpired(Date.parse(store.get(order.id).deliveredAt!) + 8 * 86400000);
    }
    const state = store.get(order.id);
    const id = enqueueAgent(store, role, {
      synthetic: true, orderId: order.id, status: state.status,
      evidence: { sourceReceived: true, structuralValidation: state.report.ok, mapping: state.mapping, products: state.report.productCount, variants: state.report.variantCount, scopeApproved: state.scopeApproved, simulatedPayment: !!state.receipt, quality: state.qa ? { completed: true, executor: 'deterministic-qualityCheck', report: state.qa } : { completed: false } },
      commercialEvidence: 'Agência fictícia; nenhuma fonte comercial verificada. Não afirmar que candidato está qualificado.',
      instruction: 'Analise somente estas evidências. Não declare receita, envio ou importação real. Identifique pendências no seu papel.',
    }, order.clientId);
    await runAgentQueue(store, live ? callEve : async () => ({ summary_pt: `${agentContracts[role].owner}: resposta controlada para testar fila; não valida raciocínio do modelo.`, reply_en: '', action: 'needs_info', rule: 'AI-01' }));
    const job = store.db.prepare('SELECT role,status,result,error,attempts FROM ai_jobs WHERE id=?').get(id);
    results.push({ ...job, procedure: agentPlaybook(role).version });
    if (job?.status !== 'done') throw Error(`Etapa ${role} pausada: ${job?.error}`);
  }
  assert.equal(store.get(order.id).status, 'closed');
  assert.equal(store.get(order.id).acceptedAt, undefined);
  assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE status != 'draft'").get()?.n, 0);
  writeFileSync(resolve(directory, 'delivery.zip'), store.artifact(order.id, 'delivery-0.zip'));
} finally {
  writeFileSync(resolve(directory, 'report.json'), JSON.stringify({ mode: live ? 'live-local-eve' : 'controlled-responses', results, externalActions: false, revenue: 0, limits: 'Aprovação, pagamento e entrega simulados; não comprova Shopify, Gmail, Stripe ou qualidade semântica das respostas.' }, null, 2));
  store.close();
  console.log(JSON.stringify({ directory, live, attemptedRoles: results.length, completedRoles: results.filter((r: any) => r.status === 'done').length }));
}
