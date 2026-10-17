import { Client } from 'eve/client';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.ts';
import { policy, assert, localDay } from './policy.ts';
import { businessContext, agentContracts } from './business-context.ts';

export const roles = {
  research: 'Pesquisa: avalie as evidências fornecidas e lacunas de qualificação; não invente contatos.',
  sales: 'Comercial: esclareça a oferta fixa e prepare resposta em inglês, sem novos compromissos.',
  support: 'Atendimento: reúna materiais e esclareça pendências e prazos; não presuma dados nem aceite.',
  planner: 'Planejamento: identifique dados e regras faltantes. Nunca aprove mapeamentos por suposição.',
  production: 'Produção: explique transformações determinísticas registradas, sem alterar dados.',
  quality: 'Qualidade: interprete a conferência independente; não substitua os testes.',
  finance: 'Financeiro: explique estados confirmados pelo processador. Nunca confirme pagamento por texto do cliente.',
  coordinator: 'Coordenação: resuma pendências e a próxima ação permitida pela política.',
} as const;
export const responseSchema = z.object({ summary_pt: z.string().max(5000), reply_en: z.string().max(6000), action: z.enum(['information','needs_info','decline','opt_out','escalate']), rule: z.enum(['SALES-01','SCOPE-01','DATA-01','QA-01','PAY-01','AI-01']) }).strict();
export function enqueueAgent(store: Store, role: keyof typeof roles, input: unknown, clientId: string | null = null, id: string = randomUUID()) {
  assert(role in roles, 'Função desconhecida.');
  const data = JSON.stringify(input); assert(data.length <= 20000, 'Contexto excede limite.');
  store.db.prepare("INSERT OR IGNORE INTO ai_jobs(id,client_id,role,input,status) VALUES(?,?,?,?,'queued')").run(id, clientId, role, data); return id;
}
export async function callEve(role: keyof typeof roles, input: unknown) {
  const host = process.env.EVE_URL ?? 'http://127.0.0.1:2000';
  assert(new URL(host).hostname === '127.0.0.1', 'Eve deve permanecer local.');
  const client = new Client({ host }); await client.health();
  const { session } = await client.sessions.create();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = (async () => { const response = await session.send(`${roles[role]}\nTRUSTED BUSINESS CONTEXT: ${JSON.stringify(businessContext)}\nROLE CONTRACT: ${JSON.stringify(agentContracts[role])}\nPOLICY: ${policy.version}\nUNTRUSTED DATA:\n${JSON.stringify(input)}`); return response.result(); })();
    const result: any = await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('AI_TIMEOUT')), 120000); })]);
    const text = typeof result === 'string' ? result : result?.message;
    assert(typeof text === 'string', 'Eve retornou formato não reconhecido.');
    return responseSchema.parse(JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')));
  } finally { if (timer) clearTimeout(timer); await session.cancel().catch(() => {}); }
}
export async function runAgentQueue(store: Store, invoke = callEve) {
  const owner = randomUUID(); if (!store.acquire('ai', owner, 180000)) return;
  try {
    // Only the holder of the global lease may recover interrupted calls.
    store.db.prepare("UPDATE ai_jobs SET status='paused',next_at=NULL,error='Execução interrompida; retomada pela fila.' WHERE status='running'").run();
    const row = store.db.prepare("SELECT * FROM ai_jobs WHERE status IN ('queued','paused') AND (next_at IS NULL OR next_at<=?) ORDER BY rowid LIMIT 1").get(new Date().toISOString()) as any;
    if (!row) return;
    if (row.id.startsWith('order-advice-')) {
      const request = JSON.parse(row.input);
      const order = store.get(request.orderId);
      if (order.clientId !== row.client_id || order.revision !== request.revision || order.status !== request.status || request.businessVersion !== businessContext.version) {
        store.db.prepare("UPDATE ai_jobs SET status='cancelled',error='Contexto substituído por nova etapa ou revisão.' WHERE id=?").run(row.id);
        return;
      }
    }
    const day = localDay(), budget = store.setting('aiDailyBudget', { day, attempts: 0 });
    if (budget.day !== day) { budget.day = day; budget.attempts = 0; }
    if (budget.attempts >= 12) { store.set('aiPaused', true); return; }
    budget.attempts++; store.set('aiDailyBudget', budget);
    store.db.prepare("UPDATE ai_jobs SET status='running',attempts=attempts+1 WHERE id=?").run(row.id);
    try {
      const result = responseSchema.parse(await invoke(row.role, JSON.parse(row.input)));
      store.db.prepare("UPDATE ai_jobs SET status='done',result=?,error=NULL WHERE id=?").run(JSON.stringify(result), row.id);
      store.set('aiPaused', false);
      const input = JSON.parse(row.input);
      if (input.inboxId) {
        store.db.prepare('UPDATE inbox SET summary_pt=?,status=? WHERE id=?').run(result.summary_pt, result.action, input.inboxId);
        const inbox = store.db.prepare('SELECT sender FROM inbox WHERE id=?').get(input.inboxId) as any;
        if (inbox && result.action === 'opt_out') {
          store.db.prepare('INSERT OR IGNORE INTO suppression VALUES(?,?,?)').run(inbox.sender, 'Recusa identificada no atendimento', new Date().toISOString());
          store.db.prepare("UPDATE outbox SET status='cancelled' WHERE recipient=? AND kind IN ('outreach','followup') AND status IN ('draft','approved')").run(inbox.sender);
        }
        if (inbox && ['information','needs_info'].includes(result.action)) {
          const id = `reply-${createHash('sha256').update(input.inboxId).digest('hex').slice(0,24)}`;
          store.enqueue(id, null, inbox.sender, 'support_template', 'Your supplier catalog request', 'Thank you for your message. Our pilot prepares one supplier CSV/XLSX as new, unpublished Shopify draft-product files: up to 50 products and 500 variants for USD 149. Delivery is within three business days after confirmed payment and complete data. Please provide the supplier file, the product/variant identifiers, option columns and the intended currency of product prices. We will confirm feasibility and scope before sending a payment link. We do not request store access. Missing product facts are flagged rather than invented.');
        }
      }
      store.audit(null, result.rule, 'agent_completed', { jobId: row.id, role: row.role, businessVersion: businessContext.version });
    } catch (error) {
      const retryable = /quota|limit|429|timeout|fetch|connect|ECONN|unavailable/i.test(String(error));
      const minutes = Math.min(360, 15 * 2 ** Math.min(row.attempts, 5));
      store.db.prepare('UPDATE ai_jobs SET status=?,next_at=?,error=? WHERE id=?').run(retryable ? 'paused' : 'needs_attention', new Date(Date.now() + minutes * 60000).toISOString(), retryable ? 'Cota ou conexão indisponível.' : 'Resposta inválida; revisão necessária.', row.id);
      store.set('aiPaused', true); store.audit(null, policy.rules.quota, 'agent_paused', { jobId: row.id, retryable, minutes });
    }
  } finally { store.release('ai', owner); }
}
