import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import AdmZip from 'adm-zip';
import { Store } from '../src/store.ts';
import { Service } from '../src/service.ts';
import { selectHardCaseSample, buildBlingValidationCsv, BLING_HEADERS, readTable } from '../src/catalog.ts';
import { mediaBatchSchema, inspectMediaBatch, standardizeMediaBatch, checkMediaBatch } from '../src/media-standardization.ts';
import { createEditorial, reviseEditorial } from '../src/service-editorial.ts';
import { ContentStudio } from '../src/content-studio/service.ts';
import { StudioOperations } from '../src/content-studio/operations.ts';
import { collectCatalog } from '../src/inspection/collector.ts';
import { createInspectionDiagnostic, toDiagnosticBrief } from '../src/inspection/bridge.ts';
import { analyzeSnapshot } from '../src/inspection/catalog-audit.ts';
import { saveInspection } from '../src/inspection/evidence.ts';
import { RemoteOperations, type Snapshot } from '../src/remote-operations.ts';
import { createApp } from '../src/server.ts';
import { runAgentAutopilot } from '../src/autopilot.ts';

test('Frente 1: selectHardCaseSample seleciona 3 a 5 produtos-pai de maior risco deterministicamente e buildBlingValidationCsv gera 59 colunas Bling', async () => {
  const rows = [
    // P1: maior grade de variantes (4 variantes)
    { product_id: 'P1', title: 'Vestido Linho', sku: '101-P', price: '199,90', ean: '7891000100101', color: 'Areia', size: 'P', description: 'Vestido curto' },
    { product_id: 'P1', title: 'Vestido Linho', sku: '101-M', price: '199,90', ean: '7891000100102', color: 'Areia', size: 'M', description: 'Vestido curto' },
    { product_id: 'P1', title: 'Vestido Linho', sku: '101-G', price: '199,90', ean: '7891000100103', color: 'Preto', size: 'G', description: 'Vestido curto' },
    { product_id: 'P1', title: 'Vestido Linho', sku: '101-GG', price: '199,90', ean: '7891000100104', color: 'Preto', size: 'GG', description: 'Vestido curto' },
    // P2: SKU e GTIN com zero à esquerda
    { product_id: 'P2', title: 'Camisa Algodão', sku: '000202-U', price: '149,00', ean: '0789100020020', color: 'Branco', size: 'U', description: 'Camisa leve' },
    // P3: texto longo e acentuado
    { product_id: 'P3', title: 'Calça Alfaiataria Edição Especial — Coleção Verão São Paulo', sku: '303-38', price: '289,00', ean: '7891000300301', color: 'Marinho', size: '38', description: 'Calça com pregas frontais, cós estruturado, tecido respirável de viscose certificada e acabamento pespontado artesanal para uso prolongado.' },
    // P4: preço decimal com centavos quebrados e spread
    { product_id: 'P4', title: 'Blusa Tricot', sku: '404-P', price: '159,95', ean: '7891000400401', color: 'Verde', size: 'P', description: 'Blusa macia' },
    { product_id: 'P4', title: 'Blusa Tricot', sku: '404-G', price: '179,95', ean: '7891000400402', color: 'Verde', size: 'G', description: 'Blusa macia' },
    // P5: produto simples de variante única
    { product_id: 'P5', title: 'Lenço Seda', sku: '505-U', price: '89,00', ean: '7891000500501', color: 'Única', size: 'U', description: 'Lenço clássico' },
    // P6: produto extra para testar corte em 5 pais
    { product_id: 'P6', title: 'Saia Midi', sku: '606-P', price: '210,00', ean: '7891000600601', color: 'Bege', size: 'P', description: 'Saia midi' },
    { product_id: 'P6', title: 'Saia Midi', sku: '606-M', price: '210,00', ean: '7891000600602', color: 'Bege', size: 'M', description: 'Saia midi' },
  ];
  const mapping = {
    supplierKey: 'atelier-teste',
    productId: 'product_id',
    title: 'title',
    sku: 'sku',
    price: 'price',
    barcode: 'ean',
    description: 'description',
    csvDelimiter: ',' as const,
    priceDecimalSeparator: ',' as const,
    options: [
      { name: 'Cor', column: 'color' },
      { name: 'Tamanho', column: 'size' },
    ],
  };

  const sample1 = selectHardCaseSample(rows, mapping);
  const sample2 = selectHardCaseSample(rows, mapping);
  assert.deepEqual(sample1, sample2, 'Amostra deve ser 100% determinística');
  assert.equal(sample1.sampleReport.selectedParentCount, 5);
  assert.equal(sample1.sampleReport.totalParents, 6);
  const allReasons = new Set(sample1.sampleReport.selectedParents.flatMap(p => p.reasons));
  assert(allReasons.has('largest_variant_grid'));
  assert(allReasons.has('leading_zero_identifiers'));
  assert(allReasons.has('long_or_special_text'));
  assert(allReasons.has('decimal_or_formatted_price'));
  assert(allReasons.has('simple_or_edge_product'));
  assert(sample1.sampleCsv.startsWith('Title,URL handle,Description'));
  assert(sample1.sampleCsv.includes('000202-U'));

  // Valida Bling 59 colunas
  const schemaBling = JSON.parse(readFileSync(new URL('../schemas/bling-59.json', import.meta.url), 'utf8'));
  assert.deepEqual(BLING_HEADERS, schemaBling.headers);
  const editorialByProductId = new Map([
    ['P1', { html: '<p>HTML aprovado P1</p>', title: 'Vestido Linho SEO', shortDescription: 'Resumo P1', category: 'Vestidos', brand: 'Atelier Teste' }],
  ]);
  const blingCsv = buildBlingValidationCsv(rows, mapping, { editorialByProductId });
  assert(blingCsv.startsWith('\uFEFF'));
  const parsedBling = await readTable(Buffer.from(blingCsv), '.csv', 550, ';');
  assert.deepEqual(Object.keys(parsedBling[0]!), schemaBling.headers);
  // P1 tem 4 variantes -> 1 linha pai + 4 linhas filhas
  const p1Rows = parsedBling.filter(r => r['Código'] === 'P1' || r['Código Pai'] === 'P1');
  assert.equal(p1Rows.length, 5);
  const p1Parent = p1Rows.find(r => r['Código'] === 'P1')!;
  assert.equal(p1Parent['Código Pai'], '');
  assert.equal(p1Parent['Descrição Complementar'], '<p>HTML aprovado P1</p>');
  assert.equal(p1Parent['Descrição Curta'], 'Resumo P1');
  const p1Child = p1Rows.find(r => r['Código'] === '101-P')!;
  assert.equal(p1Child['Código Pai'], 'P1');
  assert.equal(p1Child['Produto Variação'], 'Variação');
  assert(p1Child['Descrição']!.includes('Cor: Areia'));
  assert(p1Child['Descrição']!.includes('Tamanho: P'));
  // Zero à esquerda preservado no Bling
  const p2Row = parsedBling.find(r => r['Código'] === '000202-U')!;
  assert.equal(p2Row['GTIN/EAN'], '0789100020020');

  // Anti-fórmula no Bling (tanto nas linhas de entrada quanto no enriquecimento editorial)
  assert.throws(
    () => buildBlingValidationCsv([{ ...rows[0]!, title: '=CMD()' }], mapping),
    /UNSAFE|fórmula/i
  );
  assert.throws(
    () => buildBlingValidationCsv(rows, mapping, { editorialByProductId: new Map([['P1', { brand: '=HYPERLINK("evil")' }]]) }),
    /fórmula/i
  );
  assert.throws(
    () => buildBlingValidationCsv(rows, mapping, { editorialByProductId: new Map([['P1', { shortDescription: '=CMD()' }]]) }),
    /fórmula/i
  );
});

test('Frente 2: Padronização de imagens (R$ 290) valida escopo, ordena vistas/cores, gera CSV Shopify + manifesto e bloqueia adulteração no QA', async () => {
  const rawBatch = {
    brand: {
      name: 'Atelier Linha Clara',
      version: 'media-1',
      materialAuthorization: true,
      mediaHosts: ['cdn.shopify.com'],
    },
    products: [
      {
        id: 'PROD-01',
        handle: 'camisa-linho-areia',
        title: 'Camisa Linho Areia',
        source: 'Ficha de mídia aprovada pelo operador',
        variants: [
          { sku: '000101-P', color: 'Areia', size: 'P' },
          { sku: '000102-P', color: 'Azul', size: 'P' },
        ],
        media: [
          // Fora de ordem propositalmente: detalhe antes de costas e frente
          {
            id: 'IMG-3',
            url: 'https://cdn.shopify.com/s/files/1/0001/products/camisa-detalhe-botao.webp',
            source: 'Foto oficial autorizada',
            authorized: true,
            view: 'detail' as const,
            viewConfirmed: true,
            alt: '',
            color: 'Areia',
            variantSkus: ['000101-P'],
          },
          {
            id: 'IMG-2',
            url: 'https://cdn.shopify.com/s/files/1/0001/products/camisa-costas.jpg',
            source: 'Foto oficial autorizada',
            authorized: true,
            view: 'back' as const,
            viewConfirmed: true,
            alt: '',
            color: 'Areia',
            variantSkus: ['000101-P'],
          },
          {
            id: 'IMG-1',
            url: 'https://cdn.shopify.com/s/files/1/0001/products/camisa-frente.jpg',
            source: 'Foto oficial autorizada',
            authorized: true,
            view: 'front' as const,
            viewConfirmed: true,
            alt: 'Camisa Linho Areia — Vista Frontal Oficial',
            color: 'Areia',
            variantSkus: ['000101-P'],
          },
          {
            id: 'IMG-4',
            url: 'https://cdn.shopify.com/s/files/1/0001/products/camisa-azul-frente.png',
            source: 'Foto oficial autorizada',
            authorized: true,
            view: 'front' as const,
            viewConfirmed: true,
            alt: '',
            color: 'Azul',
            variantSkus: ['000102-P'],
          },
        ],
      },
    ],
  };

  const parsed = mediaBatchSchema.parse(rawBatch);
  const issues = inspectMediaBatch(parsed);
  assert.equal(issues.length, 0);

  // Lote com mais de 200 variantes somadas entre produtos deve emitir VARIANT_LIMIT
  const overVariantsBatch = {
    brand: rawBatch.brand,
    products: [0, 1].map(pIdx => ({
      ...rawBatch.products[0]!,
      id: `PROD-OV-${pIdx}`,
      handle: `camisa-ov-${pIdx}`,
      variants: Array.from({ length: 105 }, (_, vIdx) => ({
        sku: `SKU-${pIdx}-${vIdx}`,
        color: 'Areia',
        size: `T${vIdx}`,
      })),
    })),
  };
  const overVarIssues = inspectMediaBatch(overVariantsBatch);
  assert(overVarIssues.some(i => i.code === 'VARIANT_LIMIT'));

  const std = standardizeMediaBatch(parsed);
  assert.equal(std.manifest.productCount, 1);
  assert.equal(std.manifest.imageCount, 4);
  // Areia deve vir primeiro na sequência front -> back -> detail, depois Azul front
  assert.deepEqual(
    std.manifest.items.map(i => `${i.color}:${i.view}:${i.position}`),
    ['Areia:front:1', 'Areia:back:2', 'Areia:detail:3', 'Azul:front:4']
  );
  assert.equal(std.manifest.items[0]!.canonicalFilename, 'camisa-linho-areia-areia-front-01.jpg');
  assert.equal(std.manifest.items[1]!.altText, 'Camisa Linho Areia — Areia — Costas');
  assert.equal(checkMediaBatch(parsed, std).length, 0);

  // Adulteração de URL ou linha CSV deve reprovar no checkMediaBatch
  const tampered = structuredClone(std);
  tampered.manifest.items[0]!.originalUrl = 'https://evil.example.org/hack.jpg';
  const failedQa = checkMediaBatch(parsed, tampered);
  assert(failedQa.length > 0);
  assert(failedQa.some(i => i.code === 'QA_FIELD_MISMATCH'));

  // Ciclo completo no Store + Service + revisão
  const store = new Store(':memory:');
  try {
    const svc = new Service(store);
    const order = createEditorial(store, {
      name: 'Atelier Linha Clara',
      email: 'midia@linha-clara.com.br',
      service: 'images',
      brief: rawBatch,
      demo: true,
    });
    assert.equal(order.status, 'scoped');
    assert.equal(order.amount, 29000);
    assert.equal(order.offer?.kind, 'images');

    svc.approve(order.id);
    svc.simulatePayment(order.id);
    const ready = await svc.process(order.id);
    assert.equal(ready.status, 'ready');

    const zip = new AdmZip(store.artifact(order.id, 'delivery-0.zip'));
    const entryNames = zip.getEntries().map(e => e.entryName);
    assert(entryNames.includes('imagens-shopify.csv'));
    assert(entryNames.includes('media-manifest.json'));
    assert(entryNames.includes('qa-media.json'));
    assert(entryNames.includes('manifest.json'));
    assert(entryNames.includes('LEIA-ME.txt'));

    // Entrega simulada e revisão do pedido de imagens
    svc.delivered(order.id, ready.deliveryId!);
    const revisedBatch = structuredClone(rawBatch);
    revisedBatch.products[0]!.media[0]!.alt = 'Camisa Linho Areia — Detalhe Botão Madre-Pérola';
    const revised = reviseEditorial(store, order.id, revisedBatch, 'scope-adjustment');
    assert.equal(revised.status, 'revision_approval');
    assert.equal(revised.revision, 1);
    svc.approveRevision(order.id);
    const readyRev1 = await svc.process(order.id);
    assert.equal(readyRev1.status, 'ready');
    const zipRev1 = new AdmZip(store.artifact(order.id, 'delivery-1.zip'));
    assert(zipRev1.readAsText('imagens-shopify.csv').includes('Madre-Pérola'));
  } finally {
    store.close();
  }
});

test('Frente 3: Promoção 1-clique LeakFinder (R$ 190) -> Content Studio (R$ 490) + revisão de diagnóstico com propagação de inspection-{rev}.json', async () => {
  const store = new Store(':memory:');
  try {
    const svc = new Service(store);
    const client = store.client('Atelier Brisa', 'contato@atelierbrisa.com.br');
    const scope = { workspaceId: 'local', clientId: client.id };
    const origin = 'https://atelier-brisa.myshopify.com';
    const snapshot = await collectCatalog(
      { origin, approvedOrigin: origin, scope, maxProducts: 10, mode: 'synthetic' },
      {
        transport: async () =>
          new Response(
            JSON.stringify({
              products: [
                {
                  id: 'P-10',
                  handle: 'vestido-brisa',
                  title: 'Vestido Brisa Sol',
                  body_html: '<p>Vestido leve de viscose.</p>',
                  options: [{ name: 'Cor', position: 1 }, { name: 'Tamanho', position: 2 }],
                  images: [{ src: `${origin}/cdn/vestido-frente.jpg`, alt: 'Frente' }],
                  variants: [
                    { id: 'V-10-P', sku: '0010-P', barcode: '7890000010011', price: '319.90', available: true, option1: 'Areia', option2: 'P' },
                  ],
                },
              ],
            }),
            { headers: { 'content-type': 'application/json' } }
          ),
      }
    );

    const diagOrder = createInspectionDiagnostic(store, {
      scope,
      snapshot,
      profile: { version: 'diag-1', expectedSizes: ['P', 'M'] },
      review: { approved: true, operator: 'Operador Teste', note: 'Diagnóstico supervisionado.' },
    });

    // 1) Promove diagnóstico (R$ 190) para Content Studio (R$ 490) em 1 clique
    const studio = new ContentStudio(store);
    const ops = new StudioOperations(studio);
    const promoted = ops.promoteDiagnosticToStudio(diagOrder.id);
    assert.equal(promoted.diagnosticOrderId, diagOrder.id);
    assert.equal(promoted.contentOrder.offer?.kind, 'content');
    assert.equal(promoted.contentOrder.amount, 49000);
    assert.equal(promoted.studios.length, 1);
    assert.equal(promoted.studios[0]!.request.product.title, 'Vestido Brisa Sol');

    // Orquestra a ficha promovida em modo supervisionado e aprova/entrega após revisão do operador
    const studioScope = promoted.scope;
    const orchestrated = ops.orchestrate(promoted.studios[0]!.id, studioScope, {
      template: 'editorial',
      operator: 'Operador Teste',
      note: 'Ficha promovida em revisão supervisionada.',
    });
    assert.equal(orchestrated.mode, 'supervised');
    assert.equal(orchestrated.requiresOperatorApproval, true);
    assert.equal(orchestrated.overview.order?.status, 'needs_info');

    const revReq = structuredClone(promoted.studios[0]!.request);
    revReq.brand.version = `${revReq.brand.version}-aprovada`;
    revReq.brand.approved = true;
    revReq.brand.materialAuthorization = true;
    revReq.brand.mediaHosts = ['atelier-brisa.myshopify.com', 'cdn.shopify.com'];
    revReq.product.facts = [
      { id: 'fact-1', section: 'presentation', text: 'Vestido leve de viscose.', source: 'Snapshot validado', approved: true },
    ];
    revReq.blocks = [
      { id: 'block-1', section: 'presentation', text: 'Vestido leve de viscose.', factIds: ['fact-1'], approved: true },
    ];
    revReq.media = revReq.media.map(m => ({ ...m, color: 'Areia', authorized: true, approved: true, view: 'front' as const, viewConfirmed: true }));
    const revRec = studio.revise(promoted.studios[0]!.id, studioScope, promoted.studios[0]!.revision, revReq);
    // Revalida que a revisão invalidou pedido vinculado e re-sincroniza escopo supervisionado
    ops.connect(revRec.id, studioScope, promoted.contentOrder.id);
    const synced = ops.synchronizeScope(revRec.id, studioScope);
    assert.equal(synced.order?.status, 'scoped');
    studio.approve(revRec.id, studioScope, revRec.revision, {
      template: 'editorial',
      color: 'Areia',
      operator: 'Operador Teste',
      note: 'Ficha promovida do diagnóstico aprovada após conferência humana.',
      visualChecked: true,
      textChecked: true,
      factsChecked: true,
    });
    svc.approve(promoted.contentOrder.id);
    svc.simulatePayment(promoted.contentOrder.id);
    const deliveredPkg = ops.deliverOrderPackage(revRec.id, studioScope);
    assert.equal(deliveredPkg.order?.status, 'ready');
    const currentContentOrder = store.get(promoted.contentOrder.id);
    const studioDeliveryZip = new AdmZip(store.artifact(promoted.contentOrder.id, `delivery-${currentContentOrder.revision}.zip`));
    assert(studioDeliveryZip.getEntry('bling-validacao.csv'));
    assert(store.artifact(promoted.contentOrder.id, `bling-${currentContentOrder.revision}.csv`).toString().startsWith('\uFEFFID;Código;'));

    // Repetir chamada mesmo após revisão da ficha é idempotente (reaproveita ficha revisada sem erro de hash)
    const promotedAgain = ops.promoteDiagnosticToStudio(diagOrder.id);
    assert.equal(promotedAgain.studios[0]!.id, promoted.studios[0]!.id);
    assert(promotedAgain.studios[0]!.revision >= 1);

    // 2) Revisão de pedido diagnostic com brief.inspection propaga inspection-1.json e processa após approveRevision
    svc.approve(diagOrder.id);
    svc.simulatePayment(diagOrder.id);
    const readyDiag0 = await svc.process(diagOrder.id);
    svc.delivered(diagOrder.id, readyDiag0.deliveryId!);

    const currentBrief = store.get(diagOrder.id).contentInput as any;
    const revisedDiag = reviseEditorial(store, diagOrder.id, currentBrief, 'defect');
    assert.equal(revisedDiag.revision, 1);
    assert.equal(revisedDiag.status, 'revision_approval');
    assert(store.artifact(diagOrder.id, 'inspection-1.json').length > 0);

    // Após aprovação formal da revisão pelo operador, processa a revisão 1 com sucesso
    svc.approveRevision(diagOrder.id);
    const processedRev1 = await svc.process(diagOrder.id);
    assert.equal(processedRev1.status, 'ready');
    const rev1Zip = new AdmZip(store.artifact(diagOrder.id, 'delivery-1.zip'));
    assert(rev1Zip.getEntry('inspecao-tecnica.json'));
  } finally {
    store.close();
  }
});

test('Frente 1 + 3 + 4: Autopilot supervisionado sugere mapeamento, Service.process inclui sample.csv, sample-report.json e bling-validacao.csv enriquecido, e SQLite cria todos os índices secundários', async () => {
  const store = new Store(':memory:');
  try {
    const auto = await runAgentAutopilot(store, {});
    assert.equal(auto.ok, true);
    assert.equal(auto.mode, 'supervised-intake');
    assert.equal(auto.status, 'needs_review');
    assert.equal(auto.orderId, null);

    const svc = new Service(store);
    const csvData = [
      'Ref_Peca;Nome_Produto;Cod_Item;Vlr_Venda;Cod_Barras_EAN13;Grade_Cor;Grade_Tam;Saldo_Est;Categoria_Item;Marca_Fabricante;Descricao_Tecnica',
      'ALC-101;Camisa Linho Puro Respiravel;ALC-101-AR-P;249,90;7891234560011;Areia;P;12;Camisa;Atelier Linha Clara;100% linho puro certificada.',
      'ALC-101;Camisa Linho Puro Respiravel;ALC-101-AR-M;249,90;7891234560012;Areia;M;18;Camisa;Atelier Linha Clara;100% linho puro certificada.',
      'ALC-205;Calca Alfaiataria Sarja Premium;ALC-205-PR-M;289,90;7891234560021;Preto;M;14;Calca;Atelier Linha Clara;Sarja 98% algodao 2% elastano.',
    ].join('\n');
    const order = await svc.create({
      name: 'Atelier Linha Clara',
      email: 'operacao@linha-clara.com.br',
      filename: 'catalogo.csv',
      data: Buffer.from(csvData, 'utf8'),
      mapping: {
        ...auto.autoDetected.mapping,
        csvDelimiter: auto.autoDetected.delimiter,
        priceDecimalSeparator: auto.autoDetected.priceDecimalSeparator,
      },
      demo: true,
      service: 'catalog',
    });
    svc.approve(order.id);
    svc.simulatePayment(order.id);
    const processed = await svc.process(order.id);
    const zip = new AdmZip(store.artifact(processed.id, 'delivery-0.zip'));
    const entries = zip.getEntries().map(e => e.entryName);
    assert(entries.includes('shopify.csv'));
    assert(entries.includes('sample.csv'));
    assert(entries.includes('sample-report.json'));
    assert(entries.includes('bling-validacao.csv'));

    const sampleReport = JSON.parse(zip.readAsText('sample-report.json'));
    assert(sampleReport.selectedParentCount >= 1);
    const blingText = zip.readAsText('bling-validacao.csv');
    assert(blingText.startsWith('\uFEFFID;Código;Descrição;'));
    assert(store.artifact(processed.id, 'sample-0.csv').toString().startsWith('Title,URL handle'));
    assert(store.artifact(processed.id, 'bling-0.csv').toString().startsWith('\uFEFFID;Código;'));

    // Verifica todos os índices secundários exigidos no SQLite
    new ContentStudio(store);
    const idxRows = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'")
      .all() as { name: string }[];
    const idxNames = new Set(idxRows.map(r => r.name));
    for (const expectedIdx of [
      'idx_orders_client_id',
      'idx_audit_order_id',
      'idx_outbox_order_status',
      'idx_outbox_status_created',
      'idx_ai_jobs_client_role_status',
      'idx_ai_jobs_status_next',
      'idx_order_tasks_order_id',
      'idx_learning_proposals_client_id',
      'idx_content_studios_scope',
      'idx_studio_order_links_order_id',
    ]) {
      assert(idxNames.has(expectedIdx), `Índice ausente: ${expectedIdx}`);
    }
  } finally {
    store.close();
  }
});

test('Frente 5: RemoteOperations suporta images (R$ 290), hidrata catalog_inspections em pedidos diagnostic e executa preSaleHandoff, reconcileImport, accept e demoClose', async () => {
  const workspace = '11111111-1111-4111-8111-111111111111';
  const snapshots = new Map<string, { payload: Snapshot; version: number; generation: number; lease_owner: string | null }>();
  const storage = new Map<string, Buffer>();

  const transport = async (path: string, init: RequestInit): Promise<Response> => {
    if (path === '/rest/v1/rpc/catanaops_dashboard') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (path === '/rest/v1/rpc/catanaops_operation') {
      const body = JSON.parse(String(init.body));
      const key = `${body.p_workspace}:${body.p_order}`;
      if (body.p_action === 'create') {
        const entry = { payload: body.p_payload as Snapshot, version: 0, generation: 0, lease_owner: null };
        snapshots.set(key, entry);
        return new Response(JSON.stringify(entry), { status: 200 });
      }
      const current = snapshots.get(key);
      if (!current) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      if (body.p_action === 'get') return new Response(JSON.stringify(current), { status: 200 });
      if (body.p_action === 'claim') {
        current.lease_owner = body.p_owner;
        current.generation += 1;
        return new Response(JSON.stringify(current), { status: 200 });
      }
      if (body.p_action === 'save') {
        current.payload = body.p_payload;
        current.version += 1;
        return new Response(JSON.stringify(current), { status: 200 });
      }
      if (body.p_action === 'release') {
        current.lease_owner = null;
        return new Response(JSON.stringify(current), { status: 200 });
      }
    }
    if (path.startsWith('/storage/v1/object/catanaops-private/')) {
      const objPath = path.replace('/storage/v1/object/catanaops-private/', '');
      storage.set(objPath, Buffer.from(init.body as Uint8Array));
      return new Response(JSON.stringify({ Key: objPath }), { status: 200 });
    }
    if (path.startsWith('/storage/v1/object/authenticated/catanaops-private/')) {
      const objPath = path.replace('/storage/v1/object/authenticated/catanaops-private/', '');
      const bytes = storage.get(objPath);
      if (!bytes) return new Response('Not found', { status: 404 });
      return new Response(new Uint8Array(bytes), { status: 200 });
    }
    return new Response('Unknown route', { status: 404 });
  };

  const remote = new RemoteOperations(
    { url: 'https://aqkwbmggkvvfhqaivxlh.supabase.co', key: 'anon-key', token: 'operator-jwt' },
    transport
  );

  // 1) Cria e processa oferta 'images' (R$ 290) remotamente até accept e demoClose
  const imgOrderId = '22222222-2222-4222-8222-222222222222';
  await remote.create(workspace, {
    id: imgOrderId,
    name: 'Marca Remota Imagens',
    email: 'remoto@imagens.com.br',
    service: 'images',
    demo: true,
    brief: {
      brand: {
        name: 'Marca Remota Imagens',
        version: 'remota-1',
        materialAuthorization: true,
        mediaHosts: ['cdn.shopify.com'],
      },
      products: [
        {
          id: 'P1',
          handle: 'blusa-remota',
          title: 'Blusa Remota',
          source: 'Ficha remota autorizada',
          variants: [{ sku: 'BLU-P', color: 'Preto', size: 'P' }],
          media: [
            {
              id: 'IMG-1',
              url: 'https://cdn.shopify.com/s/files/1/0001/products/blusa-frente.jpg',
              source: 'Foto oficial',
              authorized: true,
              view: 'front',
              viewConfirmed: true,
              alt: 'Blusa Remota Frente',
              color: 'Preto',
              variantSkus: ['BLU-P'],
            },
          ],
        },
      ],
    },
  });
  await remote.action(workspace, imgOrderId, 'preSaleHandoff', {
    fit: 'qualified',
    sources: ['https://marca-remota.com.br'],
    need: 'Padronização de mídia para coleção',
    buyer: 'Operador Marca Remota',
    scope: 'Padronização de imagens',
  });
  await remote.action(workspace, imgOrderId, 'approve');
  await remote.action(workspace, imgOrderId, 'demoPayment');
  await remote.action(workspace, imgOrderId, 'process');
  const zipBuf = await remote.download(workspace, imgOrderId);
  const zip = new AdmZip(zipBuf);
  assert(zip.getEntry('imagens-shopify.csv'));
  await remote.action(workspace, imgOrderId, 'demoDelivery');
  const accepted = await remote.action(workspace, imgOrderId, 'accept', { evidence: 'Aceite registrado em validação sintética' });
  assert(accepted.payload.order.acceptedAt);
  const closed = await remote.action(workspace, imgOrderId, 'demoClose');
  assert.equal(closed.payload.order.status, 'closed');

  // 2) Pedido diagnostic com LeakFinder snapshot hidrata catalog_inspections entre chamadas stateless (incluindo revise + process na r1)
  const diagOrderId = '33333333-3333-4333-8333-333333333333';
  const clientId = '44444444-4444-4444-8444-444444444444';
  const origin = 'https://remota-diag.myshopify.com';
  const snapshot = await collectCatalog(
    { origin, approvedOrigin: origin, scope: { workspaceId: workspace, clientId }, maxProducts: 10, mode: 'synthetic' },
    {
      transport: async () =>
        new Response(
          JSON.stringify({
            products: [
              {
                id: 'D1',
                handle: 'casaco-la',
                title: 'Casaco Lã',
                body_html: '<p>Casaco</p>',
                options: [{ name: 'Tamanho', position: 1 }],
                images: [{ src: `${origin}/cdn/casaco.jpg`, alt: 'Casaco' }],
                variants: [{ id: 'V1', sku: 'CAS-P', barcode: '7890000099012', price: '490.00', available: true, option1: 'P' }],
              },
            ],
          }),
          { headers: { 'content-type': 'application/json' } }
        ),
    }
  );
  const audit = analyzeSnapshot(snapshot, { version: 'diag-remote-1', expectedSizes: ['P', 'M'] });
  const diagBrief = toDiagnosticBrief(snapshot, audit);

  await remote.create(workspace, {
    id: diagOrderId,
    name: 'Loja Diag Remota',
    email: 'diag@remota.com.br',
    service: 'diagnostic',
    demo: true,
    brief: diagBrief,
    inspection: {
      snapshot,
      audit,
      review: { approved: true, operator: 'Operador Remoto', note: 'Evidência remota aprovada.' },
    },
  });
  await remote.action(workspace, diagOrderId, 'approve');
  await remote.action(workspace, diagOrderId, 'demoPayment');
  const processedDiag = await remote.action(workspace, diagOrderId, 'process');
  assert.equal(processedDiag.payload.order.status, 'ready');
  await remote.action(workspace, diagOrderId, 'demoDelivery');
  await remote.action(workspace, diagOrderId, 'revise', {
    brief: diagBrief,
    reason: 'defect',
  });
  await remote.action(workspace, diagOrderId, 'revisionApprove');
  const processedDiagRev1 = await remote.action(workspace, diagOrderId, 'process');
  assert.equal(processedDiagRev1.payload.order.status, 'ready');
  assert.equal(processedDiagRev1.payload.order.revision, 1);

  // Verifica que o SQL do Supabase e o Guia de Execução existem e incluem 'images' e o executor seguro
  const sqlText = readFileSync(new URL('../schemas/supabase-brazil-operations.sql', import.meta.url), 'utf8');
  assert(sqlText.includes("'diagnostic','images','content','catalog','combined'"));
  assert(sqlText.includes('catanaops.operation_execute'));
  const guideText = readFileSync(new URL('../docs/SUPABASE_GUIA_EXECUCAO.md', import.meta.url), 'utf8');
  assert(guideText.includes("'diagnostic','images','content','catalog','combined'"));
  assert(guideText.includes('catanaops.operation_execute'));
});

test('Rotas HTTP /api/editorial (images) e /api/studio/promote-diagnostic funcionam pelo servidor local', async () => {
  const store = new Store(':memory:');
  const port = 14328;
  const server = createApp(store, port);
  await new Promise<void>(r => server.listen(port, '127.0.0.1', r));
  const base = `http://127.0.0.1:${port}`;
  try {
    const home = await fetch(base);
    const html = await home.text();
    const token = html.match(/name="catalog-token" content="([^"]+)/)![1]!;
    const req = async (path: string, body?: unknown) => {
      const r = await fetch(`${base}/api/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          host: `127.0.0.1:${port}`,
          origin: base,
          'x-catalog-token': token,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    };

    // Cria pedido de imagens via HTTP
    const imgCreated = await req('editorial', {
      name: 'Atelier Mídia HTTP',
      email: 'midia-http@example.com',
      service: 'images',
      demo: true,
      brief: {
        brand: {
          name: 'Atelier Mídia HTTP',
          version: 'http-1',
          materialAuthorization: true,
          mediaHosts: ['cdn.shopify.com'],
        },
        products: [
          {
            id: 'P1',
            handle: 'saia-linho',
            title: 'Saia Linho',
            source: 'Ficha aprovada',
            variants: [{ sku: 'SAI-P', color: 'Areia', size: 'P' }],
            media: [
              {
                id: 'IMG-1',
                url: 'https://cdn.shopify.com/s/files/1/0001/products/saia-frente.jpg',
                source: 'Catálogo oficial',
                authorized: true,
                view: 'front',
                viewConfirmed: true,
                alt: 'Saia Linho Frente',
                color: 'Areia',
                variantSkus: ['SAI-P'],
              },
            ],
          },
        ],
      },
    });
    assert.equal(imgCreated.status, 200, JSON.stringify(imgCreated.body));
    assert.equal(imgCreated.body.amount, 29000);

    // Cria diagnóstico LeakFinder e promove via HTTP /api/studio/promote-diagnostic
    const diagRes = await req('inspection/diagnostic', {
      name: 'Atelier Funil HTTP',
      email: 'funil-http@example.com',
      origin: 'https://atelier-funil.example.com',
      mode: 'synthetic',
      autoProcess: true,
    });
    assert.equal(diagRes.status, 200);
    const promoteRes = await req('studio/promote-diagnostic', { orderId: diagRes.body.order.id });
    assert.equal(promoteRes.status, 200, JSON.stringify(promoteRes.body));
    assert.equal(promoteRes.body.contentOrder.offer.kind, 'content');
    assert.equal(promoteRes.body.contentOrder.amount, 49000);
    assert.equal(promoteRes.body.studios.length, 2);
  } finally {
    await new Promise<void>(r => server.close(() => r()));
    store.close();
  }
});
