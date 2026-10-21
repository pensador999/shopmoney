import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import AdmZip from 'adm-zip';
import { Store, type Order } from './store.ts';
import { mappingSchema, readTable, inspect, transform, qualityCheck, csv, HEADERS, hash, productHandle, type Mapping } from './catalog.ts';
import { policy, assert, businessDays } from './policy.ts';
import { adaptSupplier, supplierProfileSchema, type SupplierProfile } from './supplier-adapter.ts';
import { offerSnapshot, type ServiceKind } from './offers.ts';
import { contentRequestSchema, prepareContent, checkContent } from './brand-content.ts';
import { processEditorial } from './service-editorial.ts';
import { validateHandoff } from './handoffs.ts';

export const gateNames = ['identity', 'mailbox', 'stripeAccount', 'usdPayment', 'bankPayout', 'shopifyImport', 'terms'] as const;
export class Service {
  store: Store;
  constructor(store: Store) { this.store = store; }
  readiness() { const gates = this.store.setting<Record<string, string>>('gates', {}); return gateNames.map(name => ({ name, evidence: gates[name] ?? '', ready: Boolean(gates[name]) })); }
  async create(input: { name: string; email: string; filename: string; data: Buffer; mapping: Mapping; demo?: boolean; profile?: SupplierProfile; service?: ServiceKind; content?: unknown; id?:string }) {
    const offer=offerSnapshot(input.service ?? 'catalog');
    assert(['catalog','combined'].includes(offer.kind), 'Use a entrada específica de diagnóstico/conteúdo.');
    const content=offer.kind==='combined'?contentRequestSchema.parse(input.content):undefined;
    assert(/\.(csv|xlsx)$/i.test(input.filename), 'Formato não aceito.');
    const profile = input.profile ? supplierProfileSchema.parse(input.profile) : undefined;
    const mapping = mappingSchema.parse(profile?.mapping ?? input.mapping);
    const rawRows = await readTable(input.data, extname(input.filename).toLowerCase(), profile ? 550 : 500, mapping.csvDelimiter);
    const adapted = profile ? adaptSupplier(rawRows, profile) : undefined;
    const rows = adapted?.rows ?? rawRows;
    const report = inspect(rows, mapping);
    assert(report.productCount<=offer.maxProducts&&report.variantCount<=offer.maxVariants,'Lote excede os limites da oferta contratada.');
    if(content) {
      const ids=new Set(rows.map((r:any)=>String(r[mapping.productId])));
      assert(content.products.every(p=>ids.has(p.id)),'Conteúdo combinado deve referenciar produtos do lote.');
    }
    return this.store.transaction(() => {
      const client = this.store.client(input.name, input.email);
      if(content)this.store.profile(client.id,content.brand.version,content.brand);
      mapping.namespace = `${client.id}:${mapping.supplierKey}`;
      const order: Order = { id: input.id??randomUUID(), clientId: client.id, filename: input.filename.replace(/[^\w. -]/g, '_'), demo: !!input.demo, mapping,
        status: report.ok ? 'scoped' : 'needs_info', scopeApproved: false, amount: offer.cents, currency: offer.currency, offer,
        contentInput:content, brandProfile:content?.brand,
        createdAt: new Date().toISOString(), report, revision: 0, corrections: 0, hours: 0, fees: 0, costs: 0,
        supplierProfile: adapted?.profile };
      this.store.save(order); this.store.artifact(order.id, 'original', input.data);
      this.store.artifact(order.id, 'source-0.json', JSON.stringify(rows));
      if (profile && adapted) {
        this.store.artifact(order.id, 'profile-0.json', JSON.stringify(profile));
        this.store.artifact(order.id, 'lineage-0.json', JSON.stringify(adapted.lineage));
      }
      this.store.audit(order.id, policy.rules.scope, order.status, { originalSha256: hash(input.data), report });
      return order;
    });
  }
  approve(id: string) {
    const o = this.store.get(id); assert(o.status === 'scoped', 'Resolva as pendências antes de aprovar o escopo.');
    if(o.offer){const contract=validateHandoff('planner',{orderId:id,revision:o.revision,service:o.offer.kind,evidence:[hash(this.store.artifact(id,'original'))],pending:[],mappingHash:hash(JSON.stringify(o.mapping)),brandVersion:(o.brandProfile as any)?.version??'not-applicable',operatorApproval:true},{orderId:id,revision:o.revision,service:o.offer.kind});this.store.artifact(id,`planner-${o.revision}.json`,JSON.stringify(contract));}
    o.scopeApproved = true; o.status = 'awaiting_payment'; this.store.save(o); this.store.audit(id, policy.rules.scope, 'scope_approved', { mapping: o.mapping, profile: o.supplierProfile, actor: 'local_operator' }); return o;
  }
  simulatePayment(id: string) {
    const o = this.store.get(id); assert(o.demo, 'Simulação somente para pedidos demonstrativos.');
    assert(o.status === 'awaiting_payment', 'Pedido não está aguardando pagamento.');
    o.status = 'queued'; o.dueAt = businessDays(new Date(), o.offer?.days ?? 3); o.receipt = 'DEMO-NO-MONEY'; this.store.save(o);
    if(o.offer)this.store.artifact(id,`finance-${o.revision}.json`,JSON.stringify(validateHandoff('finance',{orderId:id,revision:o.revision,service:o.offer.kind,evidence:['DEMO-NO-MONEY'],pending:[],confirmation:'simulated',amountCents:o.amount,currency:o.currency},{orderId:id,revision:o.revision,service:o.offer.kind})));
    this.store.audit(id, policy.rules.payment, 'demo_payment'); return o;
  }
  async process(id: string) {
    const owner = randomUUID(); assert(this.store.acquire('production', owner), 'Outro pedido está em produção.');
    try {
      const o = this.store.get(id); assert(['queued', 'running'].includes(o.status), 'Pagamento e escopo são necessários.');
      assert(o.scopeApproved && o.receipt, 'Pedido sem aprovação ou confirmação de pagamento.');
      assert((o.productionAttempts ?? 0) < 3, 'Limite de execução atingido; revisão humana necessária.');
      o.productionAttempts = (o.productionAttempts ?? 0) + 1;
      o.status = 'running'; this.store.save(o);
      if(o.offer&&['content','diagnostic'].includes(o.offer.kind)) return processEditorial(this.store,o);
      const rows = JSON.parse(this.store.artifact(id, `source-${o.revision}.json`).toString());
      const output = transform(rows, o.mapping), qa = qualityCheck(rows, output, o.mapping);
      assert(!qa.length, `Falha de qualidade: ${JSON.stringify(qa)}`);
      const content = csv(output, HEADERS);
      const manifest = { policy: policy.version, orderId: id, revision: o.revision, originalSha256: hash(this.store.artifact(id, 'original')), sourceSha256: hash(this.store.artifact(id, o.revision ? `input-${o.revision}` : 'original')), mappingSha256: hash(JSON.stringify(o.mapping)), outputSha256: hash(content), products: o.report.productCount, variants: output.length, checks: 'Passed deterministic checks; Shopify test-store import is a separate gate.', demo: o.demo };
      const instructions = `CATANA OPS — ${o.demo ? "DEMONSTRAÇÃO SINTÉTICA" : id}\n\nNovos produtos em rascunho. Cliente importa e publica. Faça backup e teste uma amostra; não habilite sobrescrita. Confira variantes, SKU/EAN, preços e frete/tributos. Imagens são referências não verificadas. Preserve UTF-8 e zeros à esquerda. Uma rodada de ajustes em sete dias; defeitos não consomem a rodada. Sem promessa de SEO ou conversão.\n`;
      const zip = new AdmZip();
      if(o.offer?.kind==='combined') {
        const brief=contentRequestSchema.parse(o.contentInput), editorial=prepareContent(brief);
        assert(brief.products.every(p=>rows.some((r:any)=>String(r[o.mapping.productId])===p.id)),'Conteúdo fora do lote revisado.');
        assert(checkContent(brief,editorial).length===0,'Conteúdo combinado reprovado.');
        zip.addFile('conteudo-por-identificador.csv',Buffer.from(csv(editorial.map(p=>({ID:p.id,Title:p.title,'Body (HTML)':p.html,'SEO Title':p.seoTitle,'SEO Description':p.metaDescription})),['ID','Title','Body (HTML)','SEO Title','SEO Description'])));
        zip.addFile('conteudo-evidencias.json',Buffer.from(JSON.stringify(editorial,null,2)));
      }
      zip.addFile('shopify.csv', Buffer.from(content));
      zip.addFile('qa-report.json', Buffer.from(JSON.stringify({ ...manifest, issues: qa, sourceReport: o.report }, null, 2)));
      zip.addFile('source-to-output.json', Buffer.from(JSON.stringify(rows.map((r: any) => ({ sourceProduct: r[o.mapping.productId], sourceSku: r[o.mapping.sku], outputHandle: productHandle(r[o.mapping.productId], o.mapping), transformations: ['column mapping', 'draft/unpublished', 'plain description HTML escaping'] })), null, 2)));
      if (o.supplierProfile) {
        zip.addFile('supplier-profile.json', this.store.artifact(id, `profile-${o.revision}.json`));
        zip.addFile('supplier-lineage.json', this.store.artifact(id, `lineage-${o.revision}.json`));
      }
      if (o.mapping.imageUrl) zip.addFile('media-review.json', Buffer.from(JSON.stringify(rows.map((r: any) => ({ sku: r[o.mapping.sku], productId: r[o.mapping.productId], suppliedReference: r[o.mapping.imageUrl] ?? '', status: 'Referência não baixada ou importada. Cliente confirma autorização, disponibilidade e associação.' })), null, 2)));
      zip.addFile('IMPORT-INSTRUCTIONS.txt', Buffer.from(instructions));
      if(o.offer){
        const base={orderId:id,revision:o.revision,service:o.offer.kind,evidence:[manifest.outputSha256],pending:[]};
        this.store.artifact(id,`production-${o.revision}.json`,JSON.stringify(validateHandoff('production',{...base,artifacts:[`shopify-${o.revision}.csv`],manifestHash:hash(JSON.stringify(manifest))},base)));
        this.store.artifact(id,`quality-${o.revision}.json`,JSON.stringify(validateHandoff('quality',{...base,passed:true,checks:['Fonte versus saída','Identificadores','Variantes','Preços'],executor:'independent-code'},base)));
      }
      this.store.transaction(() => {
        this.store.artifact(id, `shopify-${o.revision}.csv`, content);
        this.store.artifact(id, `delivery-${o.revision}.zip`, zip.toBuffer());
        o.status = 'ready'; o.qa = manifest; delete o.error; this.store.save(o);
        this.store.audit(id, policy.rules.quality, 'qa_passed', manifest);
        const client = this.store.db.prepare('SELECT email FROM clients WHERE id=?').get(o.clientId) as any;
        o.deliveryId = `delivery-${id}-${o.revision}`; this.store.save(o);
        this.store.enqueue(o.deliveryId, id, client.email, 'delivery', `Catana Ops — arquivos do catálogo ${id}`, `Pacote preparado para revisão. Produtos em rascunho; cliente importa e publica. Leia IMPORT-INSTRUCTIONS.txt e teste uma amostra. Ajustes em sete dias. Referência: ${id}`);
      });
      return o;
    } catch (e) {
      const o = this.store.get(id);
      if (o.status === 'running') { o.status = 'needs_attention'; o.error = 'Falha de conferência; consultar registro local.'; this.store.save(o); this.store.audit(id, policy.rules.quality, 'processing_failed', { message: String(e).slice(0, 1000) }); }
      throw e;
    } finally { this.store.release('production', owner); }
  }
  delivered(id: string, messageId: string) {
    const o = this.store.get(id); if (o.status === 'delivered') return o;
    assert(o.status === 'ready' && o.deliveryId === messageId, 'Entrega inválida.');
    o.status = 'delivered'; o.deliveredAt = new Date().toISOString(); this.store.save(o); this.store.audit(id, policy.rules.delivery, 'delivered', { messageId }); return o;
  }
  async revise(id: string, data: Buffer, filename: string, mapping: Mapping, reason:'scope-adjustment'|'defect'='scope-adjustment') {
    const o = this.store.get(id);
    assert(['needs_info', 'delivered', 'needs_attention'].includes(o.status), 'Pedido não permite revisão.');
    if (o.deliveredAt && reason==='scope-adjustment') {
      assert(Date.now() <= Date.parse(o.deliveredAt) + 7 * 86400000 && o.corrections < 1, 'Rodada de ajustes encerrada.');
      o.corrections++;
    }
    assert(o.revision < policy.maxCorrections, 'Limite de tentativas alcançado; resolver manualmente.');
    const profile = o.supplierProfile ? supplierProfileSchema.parse(JSON.parse(this.store.artifact(id, `profile-${o.revision}.json`).toString())) : undefined;
    const rawRows = await readTable(data, extname(filename).toLowerCase(), profile ? 550 : 500, (profile?.mapping ?? mapping).csvDelimiter);
    const adapted = profile ? adaptSupplier(rawRows, profile) : undefined;
    const parsed = mappingSchema.parse(profile?.mapping ?? mapping), rows = adapted?.rows ?? rawRows, report = inspect(rows, parsed);
    if(o.offer)assert(report.productCount<=o.offer.maxProducts&&report.variantCount<=o.offer.maxVariants,'Revisão excede o escopo contratado.');
    if(o.offer&&o.deliveredAt){const previous=JSON.parse(this.store.artifact(id,`source-${o.revision}.json`).toString());const ids=(list:any[],key:string)=>[...new Set(list.map(r=>String(r[key])))].sort();assert(JSON.stringify(ids(previous,o.mapping.productId))===JSON.stringify(ids(rows,parsed.productId)),'Novos produtos exigem nova proposta.');}
    assert(parsed.supplierKey === o.mapping.supplierKey, 'A revisão deve manter o fornecedor original.');
    parsed.namespace = o.mapping.namespace;
    o.revision++; o.mapping = parsed; o.report = report;
    // New work makes the previous cost total incomplete until reviewed again.
    delete o.economicsRecordedAt;
    delete o.qa; delete o.deliveryId;
    o.status = report.ok ? (o.receipt ? 'queued' : 'scoped') : 'needs_info';
    // Revised rules must be approved again before execution.
    o.scopeApproved = false;
    if (o.receipt && report.ok) o.status = 'revision_approval';
    this.store.transaction(() => {
      this.store.artifact(id, `input-${o.revision}`, data); this.store.artifact(id, `source-${o.revision}.json`, JSON.stringify(rows));
      if (profile && adapted) {
        this.store.artifact(id, `profile-${o.revision}.json`, JSON.stringify(profile));
        this.store.artifact(id, `lineage-${o.revision}.json`, JSON.stringify(adapted.lineage));
      }
      this.store.save(o); this.store.audit(id, policy.rules.scope, 'revision_received', report);
    });
    return o;
  }
  cancel(id: string) {
    const o = this.store.get(id); assert(!['cancelled', 'refunded', 'refund_pending'].includes(o.status), 'Pedido já cancelado.');
    if (o.status === 'running') throw new Error('Aguarde o término da execução para cancelar com segurança.');
    o.status = o.receipt && !o.demo ? 'refund_pending' : 'cancelled'; this.store.save(o);
    this.store.db.prepare("UPDATE outbox SET status='cancelled' WHERE order_id=? AND status IN ('draft','approved')").run(id);
    this.store.audit(id, policy.rules.cancellation, o.status); return o;
  }
  closeExpired(now = Date.now()) {
    for (const o of this.store.orders()) if (o.status === 'delivered' && o.deliveredAt && now >= Date.parse(o.deliveredAt) + 7 * 86400000) {
      o.status = 'closed'; o.closedAt = new Date(now).toISOString(); this.store.save(o); this.store.audit(o.id, policy.rules.delivery, 'administratively_closed_without_implied_acceptance');
    }
  }
}
