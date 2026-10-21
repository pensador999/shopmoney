import type { Order } from './store.ts';
import { offers, type OperationalStage } from './offers.ts';

export function orderTasks(o: Order) {
  const stopped = ['cancelled','refunded','refund_pending'].includes(o.status);
  const definitions = [
    ['intake','Atendimento','Arquivo completo e pendências resolvidas', 'SCOPE-01', !!o.report?.ok, !o.report?.ok],
    ['plan','Planejamento','Mapeamento aprovado e rastreável', 'SCOPE-01', o.scopeApproved, o.status === 'scoped' || o.status === 'revision_approval'],
    ['payment','Financeiro','Pagamento confirmado pelo processador ou simulação identificada', 'PAY-01', !!o.receipt, o.status === 'awaiting_payment'],
    ['production','Produção',o.offer?.kind==='diagnostic'?'Diagnóstico com evidências':o.offer?.kind==='content'?'Conteúdo aprovado por identificador':'CSV e pacote gerados', 'DATA-01', ['ready','delivered','closed'].includes(o.status), ['queued','running'].includes(o.status)],
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
  const complete = !!o.economicsRecordedAt && (!o.offer || o.taxes !== undefined);
  const laborRate = o.offer?.laborRate ?? 25;
  const simulated = o.demo || o.paymentMode === 'test';
  const paid = !!o.receipt && (simulated || o.paymentMode === 'live');
  const revenue = o.amount / 100;
  const taxes = o.offer ? (o.taxes ?? 0) : 0;
  const knownVariableCost = Math.round((o.fees + o.costs + taxes + o.hours * laborRate) * 100) / 100;
  const contribution = !excluded && complete && paid ? Math.round((revenue - knownVariableCost) * 100) / 100 : null;
  const target = o.offer?.targetContribution ?? null;
  const maxAllowedCost = target !== null ? Math.round(revenue * (1 - target) * 100) / 100 : null;
  const maxHoursCeiling = maxAllowedCost !== null ? Math.round((maxAllowedCost / laborRate) * 100) / 100 : null;
  const remainingHoursBudget = maxAllowedCost !== null ? Math.max(0, Math.round(((maxAllowedCost - knownVariableCost) / laborRate) * 100) / 100) : null;
  const stageBudget = o.offer ? (o.offer.stageHoursBudget ?? offers[o.offer.kind]?.stageHoursBudget ?? null) : null;
  const stageHours = o.stageHours ?? {};
  const overBudgetStages = stageBudget
    ? (Object.keys(stageBudget) as OperationalStage[]).filter(s => (stageHours[s] ?? 0) > stageBudget[s])
    : [];
  const budgetAlert: 'excluded' | 'unmeasured' | 'ok' | 'warning_80pct' | 'margin_breach' = excluded
    ? 'excluded'
    : maxAllowedCost !== null && knownVariableCost > maxAllowedCost
      ? 'margin_breach'
      : maxAllowedCost !== null && (knownVariableCost >= maxAllowedCost * 0.8 || overBudgetStages.length > 0)
        ? 'warning_80pct'
        : !complete && o.hours === 0 && o.fees === 0 && o.costs === 0 && !o.taxes
          ? 'unmeasured'
          : 'ok';
  return {
    complete, simulated, currency: o.currency,
    state: excluded ? 'excluded' : !complete ? 'costs_missing' : !paid ? 'payment_pending' : simulated ? 'hypothetical' : 'recorded',
    contribution, contributionRate: contribution !== null && o.amount > 0 ? contribution / revenue : null,
    targetMet: contribution !== null && o.offer ? contribution / revenue >= o.offer.targetContribution : null,
    laborRate, target,
    maxAllowedCost, maxHoursCeiling, knownVariableCost, remainingHoursBudget,
    stageHours, stageBudget, overBudgetStages, budgetAlert,
    excludes: o.offer ? 'Custos fixos; repasse bancário não confirmado. Tributos exigem registro explícito.' : 'Impostos e custos fixos; cálculo histórico em USD.',
  };
}

export function applyOrderEconomics(o: Order, input: {
  hours?: number;
  stageHours?: Partial<Record<OperationalStage, number>>;
  fees: number;
  costs: number;
  taxes?: number;
  note: string;
}) {
  if (input.stageHours) {
    o.stageHours = { ...(o.stageHours ?? {}), ...input.stageHours };
  }
  const stageSum = Math.round(Object.values(o.stageHours ?? {}).reduce((sum, v) => sum + (v ?? 0), 0) * 100) / 100;
  o.hours = input.hours !== undefined ? Math.max(input.hours, stageSum) : stageSum;
  o.fees = input.fees;
  o.costs = input.costs;
  if (o.offer && input.taxes !== undefined) o.taxes = input.taxes;
  o.economicsNote = input.note;
  o.economicsRecordedAt = new Date().toISOString();
  return economics(o);
}
