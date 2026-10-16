import { Store } from './store.ts';
import { Service } from './service.ts';
import { Payments } from './payments.ts';
import { pollInbox, reconcileSent, sendOutbox, prepareCampaign } from './mail.ts';
import { runAgentQueue } from './agents.ts';

export async function syncPayments(store: Store) {
  const url = process.env.PUBLIC_URL, token = process.env.PAYMENT_SYNC_TOKEN;
  if (!url || !token) return;
  const headers = { authorization: `Bearer ${token}` };
  const response = await fetch(`${url}/events`, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Falha ao sincronizar pagamentos.');
  const events = await response.json() as any[];
  for (const row of events) {
    new Payments(store).apply(JSON.parse(row.payload));
    const ack = await fetch(`${url}/ack`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ id: row.id }), redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!ack.ok) throw new Error('Pagamento registrado; confirmação de sincronização será repetida.');
  }
}
export async function tick(store: Store) {
  const service = new Service(store);
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try { await fn(); store.set(`health-${name}`, { ok: true, at: new Date().toISOString() }); }
    catch { store.set(`health-${name}`, { ok: false, at: new Date().toISOString(), message: 'Conexão ou configuração pendente. Consulte o guia.' }); }
  };
  if (process.env.STRIPE_RESTRICTED_KEY) await step('payments', async () => { await syncPayments(store); await new Payments(store).reconcile(); });
  for (const order of store.orders().filter(o => ['queued','running'].includes(o.status))) await step('production', () => service.process(order.id));
  service.closeExpired();
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) await step('mailbox', async () => { await pollInbox(store); await reconcileSent(store); });
  if (process.env.AI_ENABLED === 'true') await step('agents', () => runAgentQueue(store));
  if (store.setting('campaignAuthorized', false)) await step('campaign', async () => prepareCampaign(store));
  // Approved deterministic templates can run unattended once the owner enabled this policy.
  if (store.setting('routineAuthorized', false)) store.db.prepare("UPDATE outbox SET status='approved' WHERE status='draft' AND kind IN ('proposal','delivery') AND order_id IN (SELECT id FROM orders WHERE json_extract(data,'$.demo')=0 AND json_extract(data,'$.paymentMode')='live')").run();
  if (store.setting('routineAuthorized', false)) store.db.prepare("UPDATE outbox SET status='approved' WHERE status='draft' AND kind='support_template'").run();
  if (store.setting('campaignAuthorized', false)) store.db.prepare("UPDATE outbox SET status='approved' WHERE status='draft' AND kind IN ('outreach','followup')").run();
  if (process.env.MAIL_SEND_ENABLED === 'true') await step('sending', () => sendOutbox(store));
}
