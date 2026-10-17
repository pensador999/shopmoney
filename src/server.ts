import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Store } from './store.ts';
import { Service, gateNames } from './service.ts';
import { Payments } from './payments.ts';
import { runDemo, demoMapping } from './demo.ts';
import { enqueueAgent, roles } from './agents.ts';
import { addLead, approveMessage, suppress, prepareCampaign } from './mail.ts';
import { tick } from './runtime.ts';
import { policy, assert } from './policy.ts';
import { readTable, mappingSchema } from './catalog.ts';
import { extname } from 'node:path';
import { supplierProfileSchema } from './supplier-adapter.ts';
import { economics, orderTasks } from './order-workflow.ts';
import { supportedFormats } from './formats.ts';
import { businessContext, agentContracts } from './business-context.ts';
import { orderAssignment, orderAgentRequest } from './coordination.ts';

export function createApp(store: Store, port = 4318) {
  const token = randomBytes(24).toString('hex'), service = new Service(store);
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = req.headers.host; assert(host === `127.0.0.1:${port}` || host === `localhost:${port}`, 'Host inválido.');
      const path = new URL(req.url!, `http://${host}`).pathname;
      if (req.method === 'GET' && ['/', '/app.js', '/style.css'].includes(path)) {
        res.setHeader('Content-Type', path === '/' ? 'text/html; charset=utf-8' : path.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8');
        res.end(readFileSync(new URL(`../public/${path === '/' ? 'index.html' : path.slice(1)}`, import.meta.url), 'utf8').replace('__TOKEN__', token)); return;
      }
      assert(req.headers['x-catalog-token'] === token, 'Acesso negado. Reabra o painel local.');
      if (req.headers.origin) assert(req.headers.origin === `http://${host}`, 'Origem inválida.');
      let body: any = {};
      if (req.method === 'POST') {
        assert(req.headers['content-type'] === 'application/json', 'Use JSON.');
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; assert(size < 8_000_000, 'Requisição muito grande.'); chunks.push(chunk); }
        body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      }
      let result: unknown;
      if (req.method === 'GET' && path === '/api/state') result = {
        orders: store.orders().map(o => ({ ...o, economics: economics(o), tasks: orderTasks(o) })), gates: service.readiness(), policy, formats: supportedFormats(),
        coordination: store.orders().map(orderAssignment), team: agentContracts, business: businessContext,
        messages: store.db.prepare('SELECT * FROM outbox ORDER BY created_at DESC LIMIT 100').all(),
        inbox: store.db.prepare('SELECT * FROM inbox ORDER BY received_at DESC LIMIT 100').all(),
        jobs: store.db.prepare('SELECT id,role,status,result,error,next_at FROM ai_jobs ORDER BY rowid DESC LIMIT 100').all(),
        leads: store.db.prepare('SELECT * FROM leads').all(),
        audit: store.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 50').all(),
        identity: store.setting('identity', {}), aiPaused: store.setting('aiPaused', false),
        campaignAuthorized: store.setting('campaignAuthorized', false), routineAuthorized: store.setting('routineAuthorized', false),
        integrations: { ai: process.env.AI_ENABLED === 'true', email: !!process.env.GMAIL_USER, send: process.env.MAIL_SEND_ENABLED === 'true', stripe: !!process.env.STRIPE_RESTRICTED_KEY, relay: !!process.env.PUBLIC_URL }, mapping: demoMapping,
      };
      else if (req.method === 'POST' && path === '/api/demo') result = await runDemo(store);
      else if (req.method === 'POST' && path === '/api/preview') { const rows = await readTable(Buffer.from(z.string().parse(body.data), 'base64'), extname(z.string().parse(body.filename)).toLowerCase(), 550, z.enum([',',';']).default(',').parse(body.delimiter)); result = { columns: Object.keys(rows[0] ?? {}), rows: rows.length }; }
      else if (req.method === 'POST' && path === '/api/orders') result = await service.create({ ...z.object({ name: z.string().min(1), email: z.email(), filename: z.string().max(200), data: z.string(), mapping: mappingSchema, profile: supplierProfileSchema.optional(), demo: z.boolean().default(false) }).parse(body), data: Buffer.from(body.data, 'base64') });
      else if (req.method === 'POST' && path === '/api/action') {
        const id = z.string().parse(body.id), o = store.get(id);
        switch (body.action) {
          case 'approve': result = service.approve(id); break;
          case 'demoPayment': result = service.simulatePayment(id); break;
          case 'demoDelivery': assert(o.demo, 'Entrega simulada somente em demonstração.'); result = service.delivered(id, o.deliveryId!); store.audit(id, 'DELIVERY-01', 'simulated_delivery_no_email'); break;
          case 'demoClose': assert(o.demo && o.deliveredAt, 'Encerramento simulado somente após entrega demonstrativa.');
            assert(o.status === 'delivered', 'Pedido não está na janela de ajustes.');
            o.status = 'closed'; o.closedAt = new Date().toISOString(); store.save(o); store.audit(id, 'DELIVERY-01', 'simulated_adjustment_window_elapsed'); result = o; break;
          case 'process': result = await service.process(id); break;
          case 'checkout': result = await new Payments(store).checkout(id); break;
          case 'cancel': result = service.cancel(id); break;
          case 'refund': result = await new Payments(store).refund(id); break;
          case 'revisionApprove': assert(o.status === 'revision_approval', 'Revisão indisponível.'); o.scopeApproved = true; o.status = 'queued'; store.save(o); store.audit(id, 'SCOPE-01', 'revision_approved'); result = o; break;
          case 'accept': assert(o.status === 'delivered' && body.evidence, 'Registre a evidência do aceite.'); o.acceptedAt = new Date().toISOString(); store.save(o); store.audit(id, 'DELIVERY-01', 'client_acceptance_recorded', { evidence: String(body.evidence).slice(0, 1000) }); result = o; break;
          case 'economics': o.hours = z.number().finite().nonnegative().parse(body.hours); o.fees = z.number().finite().nonnegative().parse(body.fees); o.costs = z.number().finite().nonnegative().parse(body.costs);
            o.economicsNote = z.string().min(10).max(2000).parse(body.note); o.economicsRecordedAt = new Date().toISOString();
            store.save(o); store.audit(id, 'PAY-01', 'economics_recorded', { hours: o.hours, fees: o.fees, costs: o.costs, note: o.economicsNote, simulated: o.demo || o.paymentMode === 'test' }); result = o; break;
          default: throw new Error('Ação desconhecida.');
        }
      } else if (req.method === 'POST' && path === '/api/revise') result = await service.revise(z.string().parse(body.id), Buffer.from(z.string().parse(body.data), 'base64'), z.string().parse(body.filename), mappingSchema.parse(body.mapping));
      else if (req.method === 'POST' && path === '/api/download') {
        const o = store.get(z.string().parse(body.id), z.string().parse(body.clientId)); assert(['ready','delivered','closed'].includes(o.status), 'Entrega indisponível.');
        res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', `attachment; filename="catalog-${o.id}.zip"`); res.end(store.artifact(o.id, `delivery-${o.revision}.zip`)); return;
      } else if (req.method === 'POST' && path === '/api/gate') {
        assert(gateNames.includes(body.name), 'Verificação desconhecida.'); const gates = store.setting<any>('gates', {});
        gates[body.name] = z.string().max(2000).parse(body.evidence); store.set('gates', gates); store.audit(null, 'SCOPE-01', 'gate_evidence', { name: body.name, evidence: body.evidence }); result = service.readiness();
      } else if (req.method === 'POST' && path === '/api/settings') {
        const settings = z.object({ identity: z.object({ name: z.string().max(100), address: z.string().max(300) }), campaignAuthorized: z.boolean(), routineAuthorized: z.boolean() }).parse(body);
        if (settings.campaignAuthorized || settings.routineAuthorized) assert(service.readiness().every(g => g.ready), 'Conclua a liberação comercial primeiro.');
        for (const [key, value] of Object.entries(settings)) store.set(key, value); store.audit(null, 'SALES-01', 'operating_policy_updated', settings); result = { ok: true };
      } else if (req.method === 'POST' && path === '/api/first-pilot') {
        assert(service.readiness().filter(g=>g.name!=='bankPayout').every(g=>g.ready), 'Complete todas as verificações, exceto o primeiro repasse.');
        const evidence = z.string().min(20).max(2000).parse(body.evidence);
        store.set('firstPilotAuthorized', true); store.audit(null, 'PAY-01', 'first_supervised_pilot_authorized', { evidence }); result={ok:true};
      } else if (req.method === 'POST' && path === '/api/order-advice') {
        const task = orderAgentRequest(store, z.string().parse(body.id));
        result = { id: enqueueAgent(store, task.role, task.input, task.clientId, task.id) };
      }
      else if (req.method === 'POST' && path === '/api/agent') result = { id: enqueueAgent(store, z.enum(Object.keys(roles) as [keyof typeof roles]).parse(body.role), body.input) };
      else if (req.method === 'POST' && path === '/api/lead') result = { id: addLead(store, z.object({ name: z.string().min(1), email: z.email(), website: z.url(), source: z.url(), contactSource: z.url(), evidence: z.string() }).parse(body)) };
      else if (req.method === 'POST' && path === '/api/qualify') { const lead = store.db.prepare('SELECT * FROM leads WHERE id=?').get(body.id) as any; assert(lead, 'Lead não encontrado.'); const data = JSON.parse(lead.data); data.qualified = z.boolean().parse(body.qualified); store.db.prepare('UPDATE leads SET data=? WHERE id=?').run(JSON.stringify(data), body.id); result = { ok: true }; }
      else if (req.method === 'POST' && path === '/api/campaign') { prepareCampaign(store); result = { ok: true }; }
      else if (req.method === 'POST' && path === '/api/approve-message') { approveMessage(store, z.string().parse(body.id)); result = { ok: true }; }
      else if (req.method === 'POST' && path === '/api/suppress') { suppress(store, z.email().parse(body.email), 'Solicitado no painel'); result = { ok: true }; }
      else { res.statusCode = 404; result = { error: 'Rota não encontrada.' }; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(result ?? { ok: true }));
    } catch (error) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: error instanceof Error ? error.message.replace(/[rs]k_(test|live)_\S+/g, '[redacted]').slice(0, 2000) : 'Erro de operação.' })); }
  });
  return server;
}
if (process.argv[1]?.endsWith('server.ts')) {
  const store = new Store(), port = Number(process.env.PORT ?? 4318), server = createApp(store, port);
  // Retained leases expire after a crash. Do not replay uncertain SMTP sends.
  server.listen(port, '127.0.0.1', () => console.log(`Catalog Ops: http://127.0.0.1:${port}`));
  let busy = false;
  const interval = setInterval(async () => { if (busy) return; busy = true; try { await tick(store); } finally { busy = false; } }, 60000);
  const stop = () => { clearInterval(interval); server.close(() => process.exit(0)); }; process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
