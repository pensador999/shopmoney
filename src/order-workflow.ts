import type { Order } from './store.ts';

export function orderTasks(o: Order) {
  const stopped = ['cancelled','refunded','refund_pending'].includes(o.status);
  const definitions = [
    ['intake','Atendimento','Arquivo completo e pendências resolvidas', 'SCOPE-01', !!o.report?.ok, !o.report?.ok],
    ['plan','Planejamento','Mapeamento aprovado e rastreável', 'SCOPE-01', o.scopeApproved, o.status === 'scoped' || o.status === 'revision_approval'],
    ['payment','Financeiro','Pagamento confirmado pelo processador ou simulação identificada', 'PAY-01', !!o.receipt, o.status === 'awaiting_payment'],
    ['production','Produção','CSV e pacote gerados', 'DATA-01', ['ready','delivered','closed'].includes(o.status), ['queued','running'].includes(o.status)],
    ['quality','Qualidade','Conferência independente sem divergências', 'QA-01', !!o.qa && ['ready','delivered','closed'].includes(o.status), o.status === 'needs_attention'],
    ['delivery','Atendimento','Entrega registrada, sem aceite presumido', 'DELIVERY-01', ['delivered','closed'].includes(o.status), o.status === 'ready'],
    ['economics','Financeiro','Horas, taxas e custos registrados', 'PAY-01', !!o.economicsRecordedAt, !!o.deliveredAt],
    ['close','Coordenação','Janela de ajustes encerrada', 'DELIVERY-01', o.status === 'closed', o.status === 'delivered'],
  ] as const;
  return definitions.map(([step, owner, expected, rule, done, active], i) => ({
    id: `${o.id}:${o.revision}:${step}`, orderId: o.id, clientId: o.clientId, revision: o.revision,
    step, owner, expected, rule,
    state: done ? 'done' : stopped ? 'cancelled' : active ? 'action_required' : 'blocked',
    dependencies: i ? [`${o.id}:${o.revision}:${step === 'close' ? 'delivery' : definitions[i-1][0]}`] : [],
    dueAt: step === 'close' && o.deliveredAt ? new Date(Date.parse(o.deliveredAt) + 7 * 86400000).toISOString() : o.dueAt ?? null,
    deadlinePending: !o.dueAt,
    evidence: done ? { orderState: o.status, revision: o.revision, demo: o.demo } : null,
    attempts: step === 'production' ? (o.productionAttempts ?? 0) : 0,
    maxAttempts: step === 'production' ? 3 : null,
  }));
}

export function economics(o: Order) {
  const excluded = ['cancelled','refund_pending','refunded'].includes(o.status);
  const complete = !!o.economicsRecordedAt;
  const simulated = o.demo || o.paymentMode === 'test';
  const paid = !!o.receipt && (simulated || o.paymentMode === 'live');
  return {
    complete, simulated, currency: o.currency,
    state: excluded ? 'excluded' : !complete ? 'costs_missing' : !paid ? 'payment_pending' : simulated ? 'hypothetical' : 'recorded',
    contribution: !excluded && complete && paid ? Math.round((o.amount / 100 - o.fees - o.costs - o.hours * 25) * 100) / 100 : null,
    laborRate: 25, excludes: 'Impostos e custos fixos; repasse bancário não confirmado por este cálculo.',
  };
}
