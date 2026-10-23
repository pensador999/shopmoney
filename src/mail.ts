import { outreachCopy } from './commercial-copy.ts';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { randomUUID } from 'node:crypto';
import { Store } from './store.ts';
import { Service } from './service.ts';
import { enqueueAgent } from './agents.ts';
import { assert, businessDays, policy, localDay } from './policy.ts';

export function suppress(store: Store, email: string, reason: string) {
  email = email.trim().toLowerCase();
  store.db.prepare('INSERT OR IGNORE INTO suppression VALUES(?,?,?)').run(email, reason, new Date().toISOString());
  store.db.prepare("UPDATE outbox SET status='cancelled' WHERE recipient=? AND kind IN ('outreach','followup') AND status IN ('draft','approved')").run(email);
  store.audit(null, policy.rules.outreach, 'opt_out', { email });
}
export function addLead(store: Store, input: { name: string; email: string; website: string; source: string; evidence: string; contactSource: string }) {
  assert(input.evidence.length > 20 && input.contactSource.startsWith('https://') && input.source.startsWith('https://'), 'Registre evidências e a página pública do contato.');
  assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email), 'Email inválido.');
  const id = randomUUID(); store.db.prepare('INSERT INTO leads VALUES(?,?,?)').run(id, input.email.toLowerCase(), JSON.stringify({ ...input, qualified: false })); return id;
}
export function prepareCampaign(store: Store) {
  const identity = store.setting<any>('identity', {});
  assert(identity.name && identity.address, 'Configure nome e endereço comercial.');
  for (const lead of store.db.prepare('SELECT * FROM leads').all() as any[]) {
    const data = JSON.parse(lead.data); if (!data.qualified || store.db.prepare('SELECT email FROM suppression WHERE email=?').get(lead.email)) continue;
    const footer = `\n\n${identity.name}\n${identity.address}\nOferta comercial. Responda "não tenho interesse" para não receber novos contatos.`;
    store.enqueue(`lead-${lead.id}`, null, lead.email, 'outreach', 'Catana Ops — catálogo e conteúdo para vestuário', outreachCopy(data.name,data.source,footer));
    const sent = store.db.prepare("SELECT sent_at FROM outbox WHERE id=? AND status='sent'").get(`lead-${lead.id}`) as any;
    const replied = store.db.prepare('SELECT id FROM inbox WHERE sender=?').get(lead.email);
    if (sent && !replied && businessDays(new Date(sent.sent_at), 5) <= new Date().toISOString()) store.enqueue(`followup-${lead.id}`, null, lead.email, 'followup', 'Catana Ops — acompanhamento único', `Olá, ${data.name}.\n\nUm único acompanhamento sobre catálogo e conteúdo. Se for relevante, informe seu próximo lote e a dificuldade concreta. Sem interesse, não faremos novo acompanhamento.${footer}`);
  }
}
export function approveMessage(store: Store, id: string) {
  const message = store.db.prepare('SELECT * FROM outbox WHERE id=?').get(id) as any;
  assert(message?.status === 'draft', 'Mensagem não está em rascunho.');
  store.db.prepare("UPDATE outbox SET status='approved' WHERE id=?").run(id);
  store.audit(message.order_id, policy.rules.outreach, 'message_approved', { id });
}
export function isOptOutText(text: string): boolean {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\b(unsubscribe|remove me|stop contacting|not interested|opt[- ]?out|nao tenho interesse|sem interesse|descadastrar|remover da lista|parar de receber|sair da lista|nao quero receber)\b/i.test(normalized);
}
function imap() { return new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASSWORD! }, logger: false }); }
export async function pollInbox(store: Store, filter?: { subject: string }) {
  assert(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD, 'Configure Gmail com senha de app.');
  const client = imap(); await client.connect(); const lock = await client.getMailboxLock('INBOX');
  try {
    const uids = await client.search({ since: new Date(Date.now() - 30 * 86400000), ...(filter ? { header: { subject: filter.subject } } : {}) }, { uid: true });
    if (!uids || !uids.length) return;
    for await (const msg of client.fetch(uids.slice(-100), { source: true }, { uid: true })) {
      if (!msg.source || msg.source.length > 10_000_000) continue;
      const parsed = await simpleParser(msg.source, { skipHtmlToText: true, skipTextToHtml: true });
      const id = parsed.messageId ?? `${String(client.mailbox && client.mailbox.uidValidity)}-${msg.uid}`;
      if (store.db.prepare('SELECT id FROM inbox WHERE id=?').get(id)) continue;
      const sender = parsed.from?.value[0]?.address?.toLowerCase() ?? '';
      const body = (parsed.text ?? '').slice(0, 12000), subject = (parsed.subject ?? '').slice(0, 300);
      store.db.prepare('INSERT INTO inbox VALUES(?,?,?,?,?,?,?)').run(id, sender, subject, body, '', 'received', new Date().toISOString());
      if (isOptOutText(`${subject}\n${body}`)) { suppress(store, sender, 'Resposta de recusa'); continue; }
      const customer = store.db.prepare('SELECT id FROM clients WHERE email=?').get(sender) as any;
      const lead = store.db.prepare('SELECT id FROM leads WHERE email=?').get(sender);
      if (customer || lead) enqueueAgent(store, customer ? 'support' : 'sales', { inboxId: id, subject, body, attachments: parsed.attachments.map(a => ({ filename: a.filename, size: a.size })), note: 'Cliente conhecido: atendimento primeiro; dúvida comercial exige revisão. Anexos não importados automaticamente; confirmar associação e mapeamento.' }, customer?.id ?? null, `mail-${id}`);
    }
  } finally { lock.release(); await client.logout(); }
}
export async function sendOutbox(store: Store) {
  assert(process.env.MAIL_SEND_ENABLED === 'true', 'Envio externo desativado.');
  const owner = randomUUID(); if (!store.acquire('mail', owner)) return;
  try {
    const identity = store.setting<any>('identity', {}); assert(identity.name && identity.address, 'Identidade incompleta.');
    const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }, connectionTimeout: 15000, socketTimeout: 30000 });
    for (const row of store.db.prepare("SELECT * FROM outbox WHERE status='approved' ORDER BY created_at LIMIT 5").all() as any[]) {
      if (store.db.prepare('SELECT email FROM suppression WHERE email=?').get(row.recipient) && ['outreach','followup'].includes(row.kind)) { store.db.prepare("UPDATE outbox SET status='cancelled' WHERE id=?").run(row.id); continue; }
      if (['outreach','followup'].includes(row.kind)) {
        assert(store.setting('campaignAuthorized', false) && new Service(store).readiness().every(g => g.ready), 'Campanha não liberada.');
        if (store.setting('aiPaused', false)) break;
        const today = localDay();
        const count = (store.db.prepare("SELECT COALESCE(sent_at,created_at) at FROM outbox WHERE kind IN ('outreach','followup') AND status IN ('sending','sent','uncertain')").all() as any[]).filter(r=>localDay(new Date(r.at))===today).length;
        if (count >= policy.maxContactsPerDay) break;
      }
      const attachments = [];
      if (row.order_id) {
        const order = store.get(row.order_id); assert(!order.demo, 'Não enviar pedidos demonstrativos.');
        assert(order.paymentMode === 'live', 'Não enviar pedidos do ambiente de testes.');
        assert(!['cancelled','refund_pending','refunded','needs_attention'].includes(order.status), 'Pedido suspenso.');
        if (row.kind === 'delivery') { assert(order.status === 'ready', 'Pacote ainda não liberado.'); attachments.push({ filename: 'catalog-delivery.zip', content: store.artifact(order.id, `delivery-${order.revision}.zip`) }); }
      }
      store.db.prepare("UPDATE outbox SET status='sending',sent_at=? WHERE id=?").run(new Date().toISOString(), row.id);
      try {
        await transport.sendMail({ from: { name: identity.name, address: process.env.GMAIL_USER! }, to: row.recipient, subject: row.subject, text: row.body, messageId: `<${row.id}@catalog-ops.local>`, attachments });
        store.transaction(() => { store.db.prepare("UPDATE outbox SET status='sent' WHERE id=?").run(row.id); if (row.kind === 'delivery') new Service(store).delivered(row.order_id, row.id); store.audit(row.order_id, policy.rules.delivery, 'email_sent', { id: row.id }); });
      } catch { store.db.prepare("UPDATE outbox SET status='uncertain',error='Conferir Enviados antes de repetir.' WHERE id=?").run(row.id); }
    }
  } finally { store.release('mail', owner); }
}
export async function reconcileSent(store: Store) {
  const client = imap(); await client.connect();
  try {
    const folders = await client.list(), sent = folders.find(f => f.specialUse === '\\Sent'); assert(sent, 'Pasta Enviados não encontrada.');
    const lock = await client.getMailboxLock(sent.path);
    try {
      for (const row of store.db.prepare("SELECT * FROM outbox WHERE status IN ('sending','uncertain')").all() as any[]) {
        const found = await client.search({ header: { 'message-id': `<${row.id}@catalog-ops.local>` } }, { uid: true });
        if (found && found.length) store.transaction(() => { store.db.prepare("UPDATE outbox SET status='sent',error=NULL WHERE id=?").run(row.id); if (row.kind === 'delivery') new Service(store).delivered(row.order_id, row.id); });
      }
    } finally { lock.release(); }
  } finally { await client.logout(); }
}
