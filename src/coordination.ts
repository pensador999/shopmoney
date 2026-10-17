import { createHash } from 'node:crypto';
import { Store, type Order } from './store.ts';
import { orderTasks, economics } from './order-workflow.ts';
import { businessContext, agentContracts, type AgentRole } from './business-context.ts';

export function orderAssignment(o: Order) {
  const assignments: Record<string, [AgentRole, string]> = {
    needs_info: ['support', 'Resolver pendências do arquivo'], scoped: ['planner', 'Revisar e aprovar o escopo'],
    revision_approval: ['planner', 'Revisar e aprovar a revisão'],
    awaiting_payment: ['finance', o.demo ? 'Simular pagamento' : 'Aguardar pagamento confirmado'],
    queued: ['production', 'Executar produção e conferência'], running: ['production', 'Acompanhar execução persistida'],
    needs_attention: ['quality', 'Investigar bloqueio antes de entregar'],
    ready: ['support', o.demo ? 'Simular entrega sem email' : 'Revisar entrega autorizada'],
    delivered: ['support', 'Acompanhar ajustes e prazo de encerramento'],
    checkout_expired: ['finance', 'Revisar checkout expirado'], refund_pending: ['finance', 'Resolver reembolso com o operador'],
    cancelled: ['coordinator', 'Pedido cancelado'], refunded: ['coordinator', 'Pedido reembolsado'],
    closed: ['coordinator', 'Revisar esforço e oportunidade de novo lote'],
  };
  const [role, nextAction] = assignments[o.status] ?? ['coordinator', 'Revisar estado desconhecido'];
  return { orderId: o.id, clientId: o.clientId, revision: o.revision, status: o.status, demo: o.demo,
    role, owner: agentContracts[role].owner, nextAction, dueAt: o.dueAt ?? null, tasks: orderTasks(o), economics: economics(o),
    blockers: [!o.scopeApproved ? 'Escopo ainda não aprovado' : '', !o.receipt ? 'Pagamento não confirmado' : '',
      o.status === 'needs_attention' ? 'Conferência bloqueada' : ''].filter(Boolean) };
}
// Advisory job: no source rows, no other customers, one job per state/version.
export function orderAgentRequest(store: Store, id: string) {
  const o = store.get(id), assignment = orderAssignment(o);
  const key = `${businessContext.version}:${o.id}:${o.revision}:${o.status}:${o.economicsRecordedAt ?? ''}`;
  return { id: `order-advice-${createHash('sha256').update(key).digest('hex').slice(0,32)}`,
    role: assignment.role, clientId: o.clientId,
    input: { businessVersion: businessContext.version, orderId: o.id, revision: o.revision, status: o.status, nextAction: assignment.nextAction,
      blockers: assignment.blockers, demo: o.demo, counts: { products: o.report?.productCount, variants: o.report?.variantCount },
      scopeApproved: o.scopeApproved, paymentConfirmed: !!o.receipt, economics: assignment.economics,
      instruction: 'Explique o próximo passo e dependências. Não execute ações nem declare conclusão.' } };
}
