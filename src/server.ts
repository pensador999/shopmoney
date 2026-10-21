import {StudioOperations} from './content-studio/operations.ts';
import {collectProductPages} from './inspection/collector.ts';
import { createServer } from 'node:http';
import { readFileSync,existsSync } from 'node:fs';
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
import { recordHandoff, recordPreSaleHandoffs, orderHandoffLedger } from './handoffs.ts';
import { supportedFormats } from './formats.ts';
import { businessContext, agentContracts } from './business-context.ts';
import { orderAssignment, orderAgentRequest } from './coordination.ts';
import { offers, recurringOffer } from './offers.ts';
import { createEditorial, reviseEditorial } from './service-editorial.ts';
import { proposeLearning, reviewLearning, inferSupplierMapping, predictApparelCategory, evaluateStoreAdaptation } from './learning.ts';
import { ContentStudio } from './content-studio/service.ts';
import { studioScopeSchema,templateSchema,checkRequest } from './content-studio/contracts.ts';
import { studioFixture,fixtureSvg } from './content-studio/fixtures.ts';
import {Examples} from './content-studio/examples.ts';
import {intakeSnapshot} from './content-studio/intake.ts';
import {studioRequestSchema} from './content-studio/contracts.ts';

export function createApp(store: Store, port = 4318) {
  const token = randomBytes(24).toString('hex'), service = new Service(store),studio=new ContentStudio(store);
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = req.headers.host; assert(host === `127.0.0.1:${port}` || host === `localhost:${port}`, 'Host inválido.');
      const path = new URL(req.url!, `http://${host}`).pathname;
      if(req.method==='GET'&&['/studio-fixture-sand.svg','/studio-fixture-blue.svg'].includes(path)){
        res.setHeader('Content-Type','image/svg+xml');res.end(fixtureSvg(path.includes('sand')?'sand':'blue'));return;
      }
      if(req.method==='GET'&&path.startsWith('/content-preview/')){
        assert((req.headers.cookie??'').split(';').some(v=>v.trim()==='catana_preview_'+port+'='+token),'Acesso de prévia negado.');
        const u=new URL(req.url!,`http://${host}`),parts=path.split('/'),id=z.uuid().parse(parts[2]),template=templateSchema.parse(parts[3]);
        const scope=studioScopeSchema.parse({workspaceId:u.searchParams.get('workspace'),clientId:u.searchParams.get('client'),storeId:u.searchParams.get('store')});
        const preview=studio.preview(id,scope,template,u.searchParams.get('color')??undefined,u.searchParams.get('original')==='1');
        assert(preview.record.revision===Number(parts[4]),'Prévia de revisão antiga bloqueada.');
        const hosts=preview.record.request.brand.mediaHosts.filter(h=>/^[a-z0-9.-]+$/i.test(h)).map(h=>'https://'+h).join(' ');
        res.setHeader('Content-Security-Policy',`default-src 'none'; style-src 'unsafe-inline'; img-src 'self' ${hosts}; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; sandbox`);
        res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Type','text/html; charset=utf-8');res.end(preview.html);return;
      }
      if (req.method === 'GET' && ['/', '/app.js', '/style.css','/editorial-local.js','/brazil-ui.js','/content-studio.js','/content-studio.css'].includes(path)) {
        if(path==='/')res.setHeader('Set-Cookie',`catana_preview_${port}=${token}; HttpOnly; SameSite=Strict; Path=/content-preview/`);
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
      if(req.method==='GET'&&path==='/api/studio/list')result=studio.list();
      else if(req.method==='POST'&&path==='/api/studio/intake')result=intakeSnapshot(body.snapshot,studioScopeSchema.parse(body.scope),studioRequestSchema.shape.brand.parse(body.brand));
      else if(req.method==='POST'&&path==='/api/studio/intake-batch')result=new StudioOperations(studio).intakeBatchToOrder(body.snapshot,studioScopeSchema.parse(body.scope),studioRequestSchema.shape.brand.parse(body.brand),body.orderId===undefined?undefined:z.uuid().parse(body.orderId));
      else if(req.method==='POST'&&path==='/api/studio/collect'){
        const scope=studioScopeSchema.parse(body.scope),brand=studioRequestSchema.shape.brand.parse(body.brand),url=new URL(z.string().max(2000).parse(body.url));
        if(url.protocol!=='https:'||url.search||url.hash||url.username||url.password||!/^\/products\/[^/]+\/?$/.test(url.pathname))throw Error('Use URL HTTPS de um produto Shopify sem parâmetros; alternativamente importe a ficha JSON.');
        const snapshot=await collectProductPages({origin:url.origin,approvedOrigin:url.origin,scope:{workspaceId:scope.workspaceId,clientId:scope.clientId},handles:[url.pathname.split('/')[2]],mode:'public-readonly'});
        result=intakeSnapshot(snapshot,scope,brand);
      }
      else if(req.method==='GET'&&path==='/api/studio/fixture'){
        const brand=z.enum(['clara','horizonte']).default('clara').parse(new URL(req.url!,`http://${host}`).searchParams.get('brand')??undefined);
        result=studioFixture({workspaceId:'local',clientId:'fixture',storeId:brand},brand);
      }
      else if(req.method==='POST'&&path==='/api/studio/create'){
        const fields=z.object({id:z.uuid(),name:z.string().min(1),email:z.email(),request:z.unknown()}).parse(body);
        const client=store.client(fields.name,fields.email),request=fields.request as any;
        result=studio.create({...request,scope:{...request?.scope,clientId:client.id}},fields.id);
      }
      else if(req.method==='POST'&&path.startsWith('/api/studio/')){
        const scope=studioScopeSchema.parse(body.scope),id=z.uuid().parse(body.id);
        if(path==='/api/studio/read'){
          const record=studio.get(id,scope),client=store.db.prepare('SELECT name,email FROM clients WHERE id=?').get(record.request.scope.clientId);
          result={...record,client,issues:checkRequest(record.request)};
        }
        else if(path==='/api/studio/operations')result=new StudioOperations(studio).overview(id,scope);
        else if(path==='/api/studio/connect-order')result=new StudioOperations(studio).connect(id,scope,body.orderId===undefined?undefined:z.uuid().parse(body.orderId));
        else if(path==='/api/studio/sync-scope')result=new StudioOperations(studio).synchronizeScope(id,scope);
        else if(path==='/api/studio/sync-effort')result=new StudioOperations(studio).synchronizeEffort(id,scope);
        else if(path==='/api/studio/deliver-order')result=new StudioOperations(studio).deliverOrderPackage(id,scope);
        else if(path==='/api/studio/revise')result=studio.revise(id,scope,z.number().int().nonnegative().parse(body.revision),body.request);
        else if(path==='/api/studio/approve')result=studio.approve(id,scope,z.number().int().nonnegative().parse(body.revision),body.approval);
        else if(path==='/api/studio/cancel')result=studio.cancel(id,scope,z.number().int().nonnegative().parse(body.revision));
        else if(path==='/api/studio/effort')result=studio.effort(id,scope,body.effort);
        else if(path==='/api/studio/jobs')result=studio.jobs(id,scope);
        else if(path==='/api/studio/handoff')result=studio.handoff(id,scope);
        else if(path==='/api/studio/structured'){const task=studio.structuredAdvice(id,scope,z.enum(['planner','production','quality']).parse(body.role));result={id:enqueueAgent(store,task.role,task.input,task.clientId,task.id)};}
        else if(path==='/api/studio/apply-draft')result=studio.applyDraft(id,scope,z.number().int().nonnegative().parse(body.revision),z.string().parse(body.jobId));
        else if(path==='/api/studio/learn')result={id:studio.learn(id,scope,body.correction)};
        else if(path==='/api/studio/revoke-example'){studio.get(id,scope);new Examples(store).revoke(scope,z.string().parse(body.exampleId),z.string().min(1).parse(body.operator));result={revoked:true};}
        else if(path==='/api/studio/advice'){const task=studio.advice(id,scope,z.enum(['planner','production','quality']).parse(body.role));result={id:enqueueAgent(store,task.role,task.input,task.clientId,task.id)};}
        else if(path==='/api/studio/export'){
          const zip=studio.export(id,scope,z.number().int().nonnegative().parse(body.revision));
          res.setHeader('Content-Type','application/zip');res.setHeader('Content-Disposition',`attachment; filename="conteudo-${id}.zip"`);res.end(zip);return;
        }else throw Error('Rota de conteúdo desconhecida.');
      }
      else if (req.method === 'GET' && path === '/api/state') result = {
        fieldCase:existsSync(new URL('../artifacts/field-case-summary.json',import.meta.url))?JSON.parse(readFileSync(new URL('../artifacts/field-case-summary.json',import.meta.url),'utf8')):null,
        orders: store.orders().map(o => {
          const recRow = store.db.prepare('SELECT data FROM artifacts WHERE order_id=? AND name=?').get(o.id, `reconciliation-${o.revision}.json`) as any;
          return { ...o, economics: economics(o), tasks: orderTasks(o), handoffs: orderHandoffLedger(store, o.id), reconciliation: recRow ? JSON.parse(Buffer.from(recRow.data).toString()) : null };
        }), gates: service.readiness(), policy, formats: supportedFormats(), offers, recurringOffer,
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
      else if (req.method === 'POST' && path === '/api/preview') { const rows = await readTable(Buffer.from(z.string().parse(body.data), 'base64'), extname(z.string().parse(body.filename)).toLowerCase(), 550, z.enum([',',';']).default(',').parse(body.delimiter)); const columns = Object.keys(rows[0] ?? {}); result = { columns, rows: rows.length, inferred: inferSupplierMapping(store, String(body.clientId ?? 'local'), columns, String(body.supplierKey ?? 'fornecedor-local')) }; }
      else if (req.method === 'POST' && path === '/api/orders') result = await service.create({ ...z.object({ name: z.string().min(1), email: z.email(), filename: z.string().max(200), data: z.string(), mapping: mappingSchema, profile: supplierProfileSchema.optional(), demo: z.boolean().default(false), service:z.enum(['catalog','combined']).default('catalog'),content:z.unknown().optional() }).parse(body), data: Buffer.from(body.data, 'base64') });
      else if (req.method === 'POST' && path === '/api/editorial') result=createEditorial(store,z.object({name:z.string().min(1),email:z.email(),service:z.enum(['diagnostic','content']),brief:z.unknown(),demo:z.literal(true)}).parse(body));
      else if (req.method === 'POST' && path === '/api/editorial/revise') result=reviseEditorial(store,z.string().parse(body.id),body.brief,z.enum(['scope-adjustment','defect']).parse(body.reason));
      else if (req.method === 'POST' && path === '/api/learning/propose') result=proposeLearning(store,body);
      else if (req.method === 'POST' && path === '/api/learning/review') result=reviewLearning(store,z.string().parse(body.id),z.string().parse(body.clientId),body.review);
      else if (req.method === 'POST' && path === '/api/learning/infer-mapping') result=inferSupplierMapping(store,z.string().parse(body.clientId),z.array(z.string()).parse(body.headers),z.string().default('fornecedor-local').parse(body.supplierKey));
      else if (req.method === 'POST' && path === '/api/learning/predict-category') result=predictApparelCategory(store,studioScopeSchema.parse(body.scope),z.string().parse(body.text));
      else if (req.method === 'POST' && path === '/api/learning/evaluate-adaptation') result=evaluateStoreAdaptation(store,{scope:studioScopeSchema.parse(body.scope),expectedSizes:z.array(z.string()).optional().parse(body.expectedSizes),observedVariants:z.array(z.object({sku:z.string(),size:z.string().optional(),available:z.boolean().nullable().optional()})).parse(body.observedVariants),previousVariants:z.array(z.object({sku:z.string(),available:z.boolean().nullable().optional()})).optional().parse(body.previousVariants)});
      else if (req.method === 'POST' && path === '/api/action') {
        const id = z.string().parse(body.id), o = store.get(id);
        switch (body.action) {
          case 'approve': result = service.approve(id); break;
          case 'demoPayment': result = service.simulatePayment(id); break;
          case 'demoDelivery': assert(o.demo, 'Entrega simulada somente em demonstração.'); result = service.delivered(id, o.deliveryId!); store.audit(id, 'DELIVERY-01', 'simulated_delivery_no_email'); break;
          case 'demoClose': assert(o.demo && o.deliveredAt, 'Encerramento simulado somente após entrega demonstrativa.');
            assert(o.status === 'delivered', 'Pedido não está na janela de ajustes.');
            o.status = 'closed'; o.closedAt = new Date().toISOString(); store.save(o);
            if(o.offer){const expected={orderId:id,revision:o.revision,service:o.offer.kind};recordHandoff(store,'coordinator',{...expected,evidence:[o.closedAt],pending:[],next:'Encerramento simulado sem aceite presumido',owner:'Coordenação'},expected);}
            store.audit(id, 'DELIVERY-01', 'simulated_adjustment_window_elapsed'); result = o; break;
          case 'process': result = await service.process(id); break;
          case 'checkout': assert(!o.offer,'Oferta brasileira em validação: cobrança desativada.'); result = await new Payments(store).checkout(id); break;
          case 'cancel': result = service.cancel(id); break;
          case 'refund': result = await new Payments(store).refund(id); break;
          case 'revisionApprove': result = service.approveRevision(id); break;
          case 'reconcileImport': result = service.reconcileImport(id, z.string().min(1).parse(body.exportedCsv), z.boolean().default(false).parse(body.promoteGate)); break;
          case 'preSaleHandoff': result = recordPreSaleHandoffs(store, id, z.object({ fit: z.enum(['qualified','unverified','declined']), sources: z.array(z.url()).min(1), need: z.string().min(1), buyer: z.string().min(1), scope: z.string().min(1), evidence: z.array(z.string().min(1)).optional() }).parse(body)); break;
          case 'accept': assert(o.status === 'delivered' && body.evidence, 'Registre a evidência do aceite.'); o.acceptedAt = new Date().toISOString(); store.save(o); store.audit(id, 'DELIVERY-01', 'client_acceptance_recorded', { evidence: String(body.evidence).slice(0, 1000) }); result = o; break;
          case 'economics': {
            const stageHoursSchema = z.partialRecord(z.enum(['intake','plan','production','quality','delivery','adjustments']), z.number().finite().nonnegative()).optional();
            result = service.recordEconomics(id, {
              hours: body.hours !== undefined ? z.number().finite().nonnegative().parse(body.hours) : undefined,
              stageHours: stageHoursSchema.parse(body.stageHours),
              fees: z.number().finite().nonnegative().parse(body.fees),
              costs: z.number().finite().nonnegative().parse(body.costs),
              taxes: o.offer ? z.number().finite().nonnegative().parse(body.taxes) : undefined,
              note: z.string().min(10).max(2000).parse(body.note),
            });
            break;
          }
          default: throw new Error('Ação desconhecida.');
        }
      } else if (req.method === 'POST' && path === '/api/revise') result = await service.revise(z.string().parse(body.id), Buffer.from(z.string().parse(body.data), 'base64'), z.string().parse(body.filename), mappingSchema.parse(body.mapping),z.enum(['scope-adjustment','defect']).default('scope-adjustment').parse(body.reason));
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
