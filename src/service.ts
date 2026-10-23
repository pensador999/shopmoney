import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import AdmZip from 'adm-zip';
import { Store, type Order } from './store.ts';
import { mappingSchema, readTable, inspect, transform, qualityCheck, reconcileShopifyExport, selectHardCaseSample, buildBlingValidationCsv, csv, HEADERS, hash, productHandle, type Mapping, type BlingEditorialEnrichment } from './catalog.ts';
import { policy, assert, businessDays } from './policy.ts';
import { adaptSupplier, supplierProfileSchema, type SupplierProfile } from './supplier-adapter.ts';
import { offerSnapshot, type ServiceKind, type OperationalStage } from './offers.ts';
import { contentRequestSchema, prepareContent, checkContent } from './brand-content.ts';
import { processEditorial } from './service-editorial.ts';
import { recordHandoff, autoLinkLeadHandoffs } from './handoffs.ts';
import { applyOrderEconomics } from './order-workflow.ts';
import { ContentStudio } from './content-studio/service.ts';
import { StudioOperations } from './content-studio/operations.ts';

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
      autoLinkLeadHandoffs(this.store, order.id, input.email);
      this.store.audit(order.id, policy.rules.scope, order.status, { originalSha256: hash(input.data), report });
      return order;
    });
  }
  approve(id: string) {
    const o = this.store.get(id); assert(o.status === 'scoped', 'Resolva as pendências antes de aprovar o escopo.');
    if(o.offer){
      const expected={orderId:id,revision:o.revision,service:o.offer.kind};
      const origHash=hash(this.store.artifact(id,'original'));
      recordHandoff(this.store,'support',{...expected,evidence:[origHash],pending:[],materials:[o.filename],questions:[]},expected);
      recordHandoff(this.store,'planner',{...expected,evidence:[origHash],pending:[],mappingHash:hash(JSON.stringify(o.mapping)),brandVersion:(o.brandProfile as any)?.version??'not-applicable',operatorApproval:true},expected);
    }
    o.scopeApproved = true; o.status = 'awaiting_payment'; this.store.save(o); this.store.audit(id, policy.rules.scope, 'scope_approved', { mapping: o.mapping, profile: o.supplierProfile, actor: 'local_operator' }); return o;
  }
  approveRevision(id: string) {
    const o = this.store.get(id); assert(o.status === 'revision_approval', 'Revisão indisponível.');
    if(o.offer){
      const expected={orderId:id,revision:o.revision,service:o.offer.kind};
      const origHash=hash(this.store.artifact(id,'original'));
      recordHandoff(this.store,'support',{...expected,evidence:[origHash],pending:[],materials:[o.filename],questions:[]},expected);
      recordHandoff(this.store,'planner',{...expected,evidence:[origHash],pending:[],mappingHash:hash(JSON.stringify(o.mapping)),brandVersion:(o.brandProfile as any)?.version??'not-applicable',operatorApproval:true},expected);
    }
    o.scopeApproved = true; o.status = 'queued'; this.store.save(o); this.store.audit(id, policy.rules.scope, 'revision_approved'); return o;
  }
  simulatePayment(id: string) {
    const o = this.store.get(id); assert(o.demo, 'Simulação somente para pedidos demonstrativos.');
    assert(o.status === 'awaiting_payment', 'Pedido não está aguardando pagamento.');
    o.status = 'queued'; o.dueAt = businessDays(new Date(), o.offer?.days ?? 3); o.receipt = 'DEMO-NO-MONEY'; this.store.save(o);
    if(o.offer){
      const expected={orderId:id,revision:o.revision,service:o.offer.kind};
      recordHandoff(this.store,'finance',{...expected,evidence:['DEMO-NO-MONEY'],pending:[],confirmation:'simulated',amountCents:o.amount,currency:o.currency},expected);
    }
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
      if(o.offer&&['content','diagnostic','images'].includes(o.offer.kind)){
        if(o.offer.kind==='content'&&!this.store.db.prepare('SELECT 1 FROM artifacts WHERE order_id=? AND name=?').get(id,`brief-${o.revision}.json`)&&this.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='studio_order_links'").get()){
          const linked=this.store.db.prepare('SELECT s.id,s.workspace_id,s.client_id,s.store_id FROM studio_order_links l JOIN content_studios s ON s.id=l.studio_id WHERE l.order_id=? LIMIT 1').get(id) as any;
          if(linked){new StudioOperations(new ContentStudio(this.store)).deliverOrderPackage(linked.id,{workspaceId:linked.workspace_id,clientId:linked.client_id,storeId:linked.store_id});return this.store.get(id);}
        }
        return processEditorial(this.store,o);
      }
      const rows = JSON.parse(this.store.artifact(id, `source-${o.revision}.json`).toString());
      const output = transform(rows, o.mapping), qa = qualityCheck(rows, output, o.mapping);
      assert(!qa.length, `Falha de qualidade: ${JSON.stringify(qa)}`);
      const content = csv(output, HEADERS);
      const { sampleCsv, sampleReport } = selectHardCaseSample(rows, o.mapping, o.supplierProfile, 5);
      const manifest = { policy: policy.version, orderId: id, revision: o.revision, originalSha256: hash(this.store.artifact(id, 'original')), sourceSha256: hash(this.store.artifact(id, o.revision ? `input-${o.revision}` : 'original')), mappingSha256: hash(JSON.stringify(o.mapping)), outputSha256: hash(content), sampleSha256: sampleReport.sampleSha256, products: o.report.productCount, variants: output.length, sampleParents: sampleReport.selectedParentCount, sampleVariants: sampleReport.selectedVariantCount, checks: 'Passed deterministic checks; Shopify test-store import is a separate gate.', demo: o.demo };
      const instructions = `CATANA OPS — ${o.demo ? "DEMONSTRAÇÃO SINTÉTICA" : id}\n\nNovos produtos em rascunho. Cliente importa e publica. Faça backup e teste antes a amostra preliminar (sample.csv com ${sampleReport.selectedParentCount} produto(s)-pai de maior risco; detalhes em sample-report.json); não habilite sobrescrita. Confira variantes, SKU/EAN, preços e frete/tributos. Imagens são referências não verificadas. Preserve UTF-8 e zeros à esquerda. Uma rodada de ajustes em sete dias; defeitos não consomem a rodada. Sem promessa de SEO ou conversão.\n`;
      const zip = new AdmZip();
      const editorialMap = new Map<string, BlingEditorialEnrichment>();
      if(o.offer?.kind==='combined') {
        const brief=contentRequestSchema.parse(o.contentInput), editorial=prepareContent(brief);
        assert(brief.products.every(p=>rows.some((r:any)=>String(r[o.mapping.productId])===p.id)),'Conteúdo fora do lote revisado.');
        assert(checkContent(brief,editorial).length===0,'Conteúdo combinado reprovado.');
        for (const p of editorial) {
          editorialMap.set(p.id, { title: p.title, html: p.html, shortDescription: p.metaDescription });
        }
        zip.addFile('conteudo-por-identificador.csv',Buffer.from(csv(editorial.map(p=>({ID:p.id,Title:p.title,'Body (HTML)':p.html,'SEO Title':p.seoTitle,'SEO Description':p.metaDescription})),['ID','Title','Body (HTML)','SEO Title','SEO Description'])));
        zip.addFile('conteudo-evidencias.json',Buffer.from(JSON.stringify(editorial,null,2)));
      }
      const blingCsv = buildBlingValidationCsv(rows, o.mapping, { editorialByProductId: editorialMap.size ? editorialMap : undefined });
      zip.addFile('shopify.csv', Buffer.from(content));
      zip.addFile('sample.csv', Buffer.from(sampleCsv));
      zip.addFile('sample-report.json', Buffer.from(JSON.stringify(sampleReport, null, 2)));
      zip.addFile('bling-validacao.csv', Buffer.from(blingCsv));
      zip.addFile('qa-report.json', Buffer.from(JSON.stringify({ ...manifest, issues: qa, sourceReport: o.report, sampleReport }, null, 2)));
      zip.addFile('source-to-output.json', Buffer.from(JSON.stringify(rows.map((r: any) => ({ sourceProduct: r[o.mapping.productId], sourceSku: r[o.mapping.sku], outputHandle: productHandle(r[o.mapping.productId], o.mapping), transformations: ['column mapping', 'draft/unpublished', 'plain description HTML escaping'] })), null, 2)));
      if (o.supplierProfile) {
        zip.addFile('supplier-profile.json', this.store.artifact(id, `profile-${o.revision}.json`));
        zip.addFile('supplier-lineage.json', this.store.artifact(id, `lineage-${o.revision}.json`));
      }
      if (o.mapping.imageUrl) zip.addFile('media-review.json', Buffer.from(JSON.stringify(rows.map((r: any) => ({ sku: r[o.mapping.sku], productId: r[o.mapping.productId], suppliedReference: r[o.mapping.imageUrl] ?? '', status: 'Referência não baixada ou importada. Cliente confirma autorização, disponibilidade e associação.' })), null, 2)));
      zip.addFile('IMPORT-INSTRUCTIONS.txt', Buffer.from(instructions));
      if(o.offer){
        const base={orderId:id,revision:o.revision,service:o.offer.kind,evidence:[manifest.outputSha256],pending:[]};
        recordHandoff(this.store,'production',{...base,artifacts:[`shopify-${o.revision}.csv`,`sample-${o.revision}.csv`,`bling-${o.revision}.csv`],manifestHash:hash(JSON.stringify(manifest))},base);
        recordHandoff(this.store,'quality',{...base,passed:true,checks:['Fonte versus saída','Identificadores','Variantes','Preços','Amostra preliminar 3–5 pais','Bling 59 colunas'],executor:'independent-code'},base);
      }
      this.store.transaction(() => {
        this.store.artifact(id, `shopify-${o.revision}.csv`, content);
        this.store.artifact(id, `sample-${o.revision}.csv`, sampleCsv);
        this.store.artifact(id, `bling-${o.revision}.csv`, blingCsv);
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
    o.status = 'delivered'; o.deliveredAt = new Date().toISOString(); this.store.save(o);
    if(o.offer){
      const expected={orderId:id,revision:o.revision,service:o.offer.kind};
      recordHandoff(this.store,'support',{...expected,evidence:[messageId],pending:[],materials:[o.filename,`delivery-${o.revision}.zip`],questions:[]},expected);
    }
    this.store.audit(id, policy.rules.delivery, 'delivered', { messageId }); return o;
  }
  reconcileImport(id: string, exportedCsv: Buffer | string, promoteGate = false) {
    return this.store.transaction(() => {
      const o = this.store.get(id);
      assert(['ready', 'delivered', 'closed'].includes(o.status), 'Conciliação pós-importação exige pacote pronto.');
      const generatedCsv = this.store.artifact(id, `shopify-${o.revision}.csv`);
      const reconciliation = reconcileShopifyExport(generatedCsv, exportedCsv);
      this.store.db.prepare('INSERT INTO artifacts VALUES(?,?,?) ON CONFLICT(order_id,name) DO UPDATE SET data=excluded.data').run(id, `reconciliation-${o.revision}.json`, Buffer.from(JSON.stringify(reconciliation, null, 2)));
      this.store.audit(id, policy.rules.quality, reconciliation.ok ? 'shopify_import_reconciled' : 'shopify_import_diverged', { revision: o.revision, ...reconciliation });
      if (promoteGate) {
        assert(reconciliation.ok, 'Gate shopifyImport bloqueado: exportação da loja apresenta divergências.');
        assert(!o.demo, 'Pedidos demonstrativos não promovem o gate comercial shopifyImport.');
        const gates = this.store.setting<Record<string, string>>('gates', {});
        gates.shopifyImport = `Conciliação determinística aprovada no pedido ${id} r${o.revision} (${reconciliation.matchedSkus} variantes; hash ${reconciliation.evidenceHash})`;
        this.store.set('gates', gates);
        this.store.audit(id, policy.rules.scope, 'gate_evidence', { name: 'shopifyImport', evidence: gates.shopifyImport });
      }
      return reconciliation;
    });
  }
  recordEconomics(id: string, input: { hours?: number; stageHours?: Partial<Record<OperationalStage, number>>; fees: number; costs: number; taxes?: number; note: string }) {
    return this.store.transaction(() => {
      const o = this.store.get(id);
      const summary = applyOrderEconomics(o, input);
      this.store.save(o);
      if (o.offer) {
        const expected = { orderId: id, revision: o.revision, service: o.offer.kind };
        recordHandoff(this.store, 'coordinator', {
          ...expected,
          evidence: [o.economicsRecordedAt!],
          pending: [],
          next: o.status === 'closed' ? 'Pedido encerrado com custos e contribuição apurados' : 'Acompanhar janela de ajustes e margem do lote',
          owner: 'Coordenação',
        }, expected);
      }
      this.store.audit(id, policy.rules.payment, 'economics_recorded', { hours: o.hours, stageHours: o.stageHours ?? {}, fees: o.fees, costs: o.costs, taxes: o.taxes ?? null, budgetAlert: summary.budgetAlert, note: o.economicsNote, simulated: o.demo || o.paymentMode === 'test' });
      return o;
    });
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
      o.status = 'closed'; o.closedAt = new Date(now).toISOString(); this.store.save(o);
      if (o.offer) {
        const expected = { orderId: o.id, revision: o.revision, service: o.offer.kind };
        recordHandoff(this.store, 'coordinator', { ...expected, evidence: [o.closedAt], pending: [], next: 'Janela de ajustes encerrada sem aceite presumido', owner: 'Coordenação' }, expected);
      }
      this.store.audit(o.id, policy.rules.delivery, 'administratively_closed_without_implied_acceptance');
    }
  }
}
