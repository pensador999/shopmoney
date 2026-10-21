import { createHash } from 'node:crypto';
import { Store, type Order } from './store.ts';
import { orderTasks, economics } from './order-workflow.ts';
import { businessContext, agentContracts, type AgentRole } from './business-context.ts';
import { agentPlaybook } from './agent-playbooks.ts';
import { inspectionReferenceSchema, verifyOrderInspection } from './inspection/evidence.ts';
import { orderHandoffLedger } from './handoffs.ts';

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
  let inspection:Record<string,unknown>|null=null;
  const reference=(o.contentInput as any)?.inspection;
  if(reference){
    try{
      const checked=verifyOrderInspection(store,o.id,o.revision,inspectionReferenceSchema.parse(reference));
      inspection={state:'source-checked',snapshotId:checked.snapshot.id,mode:checked.snapshot.mode,
        coverage:checked.audit.coverage,operatorReviewed:true,
        observedProducts:checked.audit.products.length,observedVariants:checked.audit.products.reduce((n,p)=>n+p.variants.length,0),
        findings:checked.audit.findings.length,categories:checked.audit.findings.reduce((counts,f)=>({...counts,[f.category]:(counts[f.category]??0)+1}),{} as Record<string,number>),
        codes:[...new Set(checked.audit.findings.map(f=>f.code))],sources:checked.snapshot.pages.map(p=>({url:p.url,capturedAt:p.capturedAt})),
        limitation:'Conferência estrutural da captura, sem visita do agente, verificação visual, demanda, receita ou estoque físico.'};
    }catch{inspection={state:'blocked',snapshotId:reference.snapshotId??null,reason:'Evidência não verificada para este pedido/revisão; solicitar revisão ao operador.'};}
  }
  const playbookVersion = agentPlaybook(assignment.role,o.offer?.kind).version;
  const handoffs = orderHandoffLedger(store, o.id);
  const recRow = store.db.prepare('SELECT data FROM artifacts WHERE order_id=? AND name=?').get(o.id, `reconciliation-${o.revision}.json`) as any;
  const reconciliation = recRow ? JSON.parse(Buffer.from(recRow.data).toString()) : null;
  const key = `${businessContext.version}:${playbookVersion}:${o.id}:${o.revision}:${o.status}:${o.economicsRecordedAt ?? ''}:${JSON.stringify(inspection)}`;
  return { id: `order-advice-${createHash('sha256').update(key).digest('hex').slice(0,32)}`,
    role: assignment.role, clientId: o.clientId,
    input: { businessVersion: businessContext.version, playbookVersion, economicsRecordedAt: o.economicsRecordedAt ?? null, orderId: o.id, revision: o.revision, status: o.status, nextAction: assignment.nextAction,
      blockers: assignment.blockers, demo: o.demo, counts: { products: o.report?.productCount, variants: o.report?.variantCount },
      scopeApproved: o.scopeApproved, paymentConfirmed: !!o.receipt, economics: assignment.economics,
      service:o.offer?.kind??'legacy-catalog', contractedOffer:o.offer??null, brandProfile:o.brandProfile??null,
      evidence: {
        sourceReceived: true, structuralValidation: o.report?.ok ?? false,
        structuralIssues: (o.report?.issues ?? []).slice(0,10),
        mapping: o.mapping, supplierProfile: o.supplierProfile ?? null,
        inspection,
        handoffs: { verifiedRoles: handoffs.verifiedRoles, missingRoles: handoffs.missingRoles },
        reconciliation: reconciliation ? { ok: reconciliation.ok, matchedSkus: reconciliation.matchedSkus, issueCount: reconciliation.issues?.length ?? 0, evidenceHash: reconciliation.evidenceHash } : null,
        quality: o.qa ? { executor: 'deterministic-qualityCheck', completed: true, report: o.qa } : { completed: false },
        deliveredAt: o.deliveredAt ?? null, closedAt: o.closedAt ?? null,
        paymentMode: o.demo ? 'simulation' : o.paymentMode ?? 'unconfirmed',
      },
      instruction: 'Explique o próximo passo e dependências. Não execute ações nem declare conclusão.' } };
}
