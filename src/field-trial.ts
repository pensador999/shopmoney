import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AdmZip from 'adm-zip';
import { Store } from './store.ts';
import { Service } from './service.ts';
import { ContentStudio } from './content-studio/service.ts';
import { StudioOperations } from './content-studio/operations.ts';
import { studioFixture } from './content-studio/fixtures.ts';
import { Examples } from './content-studio/examples.ts';
import { collectProductPages } from './inspection/collector.ts';
import { makeSnapshot, verifySnapshot } from './inspection/snapshot.ts';
import { analyzeSnapshot, compareSnapshots } from './inspection/catalog-audit.ts';
import { addLead } from './mail.ts';
import { orderHandoffLedger } from './handoffs.ts';
import { economics } from './order-workflow.ts';
import { proposeLearning, reviewLearning, inferSupplierMapping, predictApparelCategory, evaluateStoreAdaptation } from './learning.ts';

export async function runFieldTrials(persistArtifacts = true) {
  const dir = resolve('artifacts', `field-trial-${Date.now()}`);
  if (persistArtifacts) mkdirSync(dir, { recursive: true });
  const store = new Store(persistArtifacts ? resolve(dir, 'field-trial.sqlite') : ':memory:');
  const checks: string[] = [];
  const observations: { subject: string; category: string; finding: string; nextAction: string }[] = [];

  try {
    const service = new Service(store);
    const studio = new ContentStudio(store);
    const ops = new StudioOperations(studio);
    const examples = new Examples(store);

    // =========================================================================
    // CAMPO 1: Atelier Linha Clara — Lead Qualificado -> Lote -> Conciliação -> 8/8 Handoffs
    // =========================================================================
    const leadId = addLead(store, {
      name: 'Atelier Linha Clara',
      email: 'contato@linhaclara.com.br',
      website: 'https://linhaclara.example.com',
      source: 'https://linhaclara.example.com/products',
      contactSource: 'https://linhaclara.example.com/pages/contato',
      evidence: 'Loja Shopify com 14 peças de linho sem padronização de medidas e sem distinção frente/costas.',
    });
    const leadRow = store.db.prepare('SELECT data FROM leads WHERE id=?').get(leadId) as any;
    store.db.prepare('UPDATE leads SET data=? WHERE id=?').run(JSON.stringify({ ...JSON.parse(leadRow.data), qualified: true }), leadId);

    const claraCsv = 'Ref_Peca,Nome_Produto,Cod_Item,Grade_Cor,Grade_Tam,Vlr_Venda,Cod_Barras_EAN13,Descricao_Curta\n' +
      'CL-01,Camisa Linho Brisa,000101-AREIA-P,Areia,P,249.90,7890000101015,Camisa 100% linho com gola padre\n' +
      'CL-01,Camisa Linho Brisa,000101-AREIA-M,Areia,M,249.90,7890000101022,Camisa 100% linho com gola padre\n';

    const claraHeaders = claraCsv.split('\n')[0]!.split(',');
    const claraClient = store.client('Atelier Linha Clara', 'contato@linhaclara.com.br');
    const inferredClara = inferSupplierMapping(store, claraClient.id, claraHeaders, 'clara-erp');
    assert.equal(inferredClara.mapping.productId, 'Ref_Peca');
    assert.equal(inferredClara.mapping.title, 'Nome_Produto');
    assert.equal(inferredClara.mapping.sku, 'Cod_Item');
    assert.equal(inferredClara.mapping.price, 'Vlr_Venda');
    assert.equal(inferredClara.mapping.barcode, 'Cod_Barras_EAN13');
    assert(inferredClara.confidence >= 0.65);
    checks.push(`Inferência local de mapeamento adaptou cabeçalhos não padronizados (${(inferredClara.confidence * 100).toFixed(0)}% confiança).`);

    const claraOrder = await service.create({
      name: 'Atelier Linha Clara',
      email: 'contato@linhaclara.com.br',
      service: 'catalog',
      demo: true,
      filename: 'clara-erp.csv',
      data: Buffer.from(claraCsv),
      mapping: inferredClara.mapping,
    });
    const preSaleLedger = orderHandoffLedger(store, claraOrder.id);
    assert(preSaleLedger.verifiedRoles.includes('research') && preSaleLedger.verifiedRoles.includes('sales'));
    checks.push('Lead qualificado propagou automaticamente os contratos de handoff de Pesquisa e Comercial.');

    service.approve(claraOrder.id);
    service.simulatePayment(claraOrder.id);
    const claraReady = await service.process(claraOrder.id);
    const claraZip = new AdmZip(store.artifact(claraReady.id, 'delivery-0.zip'));
    const generatedShopifyCsv = claraZip.readAsText('shopify.csv');
    const reconciled = service.reconcileImport(claraReady.id, generatedShopifyCsv, true);
    assert.equal(reconciled.ok, true);
    assert.equal(reconciled.matchedSkus, 2);
    service.delivered(claraReady.id, claraReady.deliveryId!);
    service.recordEconomics(claraReady.id, {
      stageHours: { intake: 0.3, plan: 0.4, production: 0.8, quality: 0.3, delivery: 0.2 },
      fees: 18,
      costs: 12,
      taxes: 41.4,
      note: 'Ensaio de campo Linha Clara: 2,0h totais a R$60/h com conciliação pós-importação.',
    });
    const claraEcon = economics(store.get(claraReady.id));
    const claraFullLedger = orderHandoffLedger(store, claraReady.id);
    assert.equal(claraFullLedger.verifiedRoles.length, 8);
    assert.equal(claraEcon.targetMet, true);
    assert.equal(claraEcon.budgetAlert, 'ok');
    checks.push(`Ciclo completo 8/8 handoffs e conciliação Shopify validados (contribuição R$${claraEcon.contribution}, alerta ${claraEcon.budgetAlert}).`);
    observations.push({
      subject: 'Atelier Linha Clara (Moda Casual)',
      category: 'observed',
      finding: `Cabeçalhos não-padrão inferidos localmente (${(inferredClara.confidence * 100).toFixed(0)}%), 8/8 handoffs verificados, conciliação pós-importação aprovada e margem saudável (R$${claraEcon.contribution} / 2,0h).`,
      nextAction: 'Reutilizar perfil inferido para os próximos lotes da marca.',
    });

    // =========================================================================
    // CAMPO 2: Ciclo de Auto-Aprendizado Local Supervisionado (Local ML sem Nuvem)
    // =========================================================================
    const scopeClara = { workspaceId: 'field-trial', clientId: claraClient.id, storeId: 'linhaclara' };
    const beforeAdapt = evaluateStoreAdaptation(store, {
      scope: scopeClara,
      expectedSizes: ['P', 'M', 'G'],
      observedVariants: [
        { sku: '000101-AREIA-P', size: 'P', available: true },
        { sku: '000101-AREIA-M', size: 'M', available: true },
      ],
    });

    // Registrar proposta de aprendizado supervisionado + exemplo aprovado no Estúdio
    const prop = proposeLearning(store, {
      orderId: claraReady.id,
      revision: 0,
      problem: 'Fornecedor exporta medidas em centímetros na descrição livre sem separar frente/costas.',
      evidence: ['clara-erp.csv', 'reconciliation-0.json'],
      proposedRule: 'Extrair gola padre e 100% linho para seção de características e priorizar vista frontal.',
    });
    reviewLearning(store, prop.id, claraClient.id, {
      approved: true,
      testEvidence: 'Validado no lote CL-01 com 2 SKUs conciliados sem divergência.',
    });

    const fixtureReq = studioFixture(scopeClara, 'clara');
    fixtureReq.adaptive = {
      category: 'camisa',
      coverage: { kind: 'manual', source: 'Ensaio de campo', observedAt: new Date().toISOString(), missing: [] },
      requirements: [],
      conflicts: [],
      components: [],
    };
    let studioRec = studio.create(fixtureReq);
    studioRec = studio.approve(studioRec.id, scopeClara, 0, {
      template: 'editorial',
      color: 'Areia',
      operator: 'Operador de Campo',
      note: 'Aprovação supervisionada no ensaio de campo.',
      visualChecked: true,
      textChecked: true,
      factsChecked: true,
    });
    studio.learn(studioRec.id, scopeClara, {
      problem: 'Descrição anterior omitia gola padre e respirabilidade natural do linho.',
      reason: 'Destacar camisa de manga longa, gola padre e tecido 100% linho certificado.',
      operator: 'Operador de Campo',
    });

    // Verificar ganho de confiança no segundo lote + predição local de categoria + isolamento TENANT-01
    const secondInference = inferSupplierMapping(store, claraClient.id, claraHeaders, 'clara-erp');
    assert(secondInference.confidence > inferredClara.confidence || secondInference.confidence === 1);
    assert.equal(secondInference.learnedOrdersCount, 1);

    const catPred = predictApparelCategory(store, scopeClara, 'Peça de linho com gola padre e manga longa para verão');
    assert.equal(catPred.predictedCategory, 'camisa');
    assert.equal(catPred.learnedFromStoreExamples, true);
    assert(catPred.confidence >= 0.7);

    const bm25Hits = examples.retrieve(scopeClara, 'camisa', 'gola padre linho manga', 'OUTRO-PRODUTO');
    assert.equal(bm25Hits.length, 1);
    assert(bm25Hits[0]!.score > 0);

    // Outra loja nunca herda o aprendizado (TENANT-01)
    const otherClient = store.client('Outra Marca Isolada', 'outra@marca.com.br');
    const otherScope = { workspaceId: 'field-trial', clientId: otherClient.id, storeId: 'outra' };
    assert.equal(examples.retrieve(otherScope, 'camisa', 'gola padre linho manga', 'OUTRO-PRODUTO').length, 0);

    const afterAdapt = evaluateStoreAdaptation(store, {
      scope: scopeClara,
      expectedSizes: ['P', 'M'],
      observedVariants: [
        { sku: '000101-AREIA-P', size: 'P', available: true },
        { sku: '000101-AREIA-M', size: 'M', available: true },
      ],
    });
    assert(afterAdapt.storeFit.adaptationScore > beforeAdapt.storeFit.adaptationScore);
    checks.push(`Motor ML local elevou o índice de adaptação da loja de ${beforeAdapt.storeFit.adaptationScore}% para ${afterAdapt.storeFit.adaptationScore}% com isolamento TENANT-01.`);
    observations.push({
      subject: 'Auto-Aprendizado Local (SQLite ML)',
      category: 'observed',
      finding: `Índice de adaptação subiu de ${beforeAdapt.storeFit.adaptationScore}% para ${afterAdapt.storeFit.adaptationScore}% após 1 ciclo supervisionado (BM25 score ${bm25Hits[0]!.score}, predição de categoria '${catPred.predictedCategory}' com ${(catPred.confidence * 100).toFixed(0)}% de confiança).`,
      nextAction: 'Manter revisão humana obrigatória antes de promover regras por cliente.',
    });

    // =========================================================================
    // CAMPO 3: Bambino Kids — Oscilação de Grade, Ruptura e Fronteira de Demanda
    // =========================================================================
    const kidsClient = store.client('Bambino Kids', 'catalogo@bambinokids.com.br');
    const kidsScope = { workspaceId: 'field-trial', clientId: kidsClient.id, storeId: 'bambino' };
    const kidsProfile = { version: 'infantil-campo-1', expectedSizes: ['RN', 'P', 'M', 'G'] };
    const kidsProductsT0 = [{
      id: 'K-01',
      handle: 'conjunto-algodao-bebe',
      title: 'Conjunto Algodão Bebê RN ao G',
      body_html: '<p>Conjunto infantil 100% algodão macio.</p>',
      options: [{ name: 'Cor', position: 1 }, { name: 'Tamanho', position: 2 }],
      images: [],
      variants: [
        { id: 'VK-RN', sku: '000901-RN', barcode: '7890000901011', price: '89.90', available: false, option1: 'Verde', option2: 'RN' },
        { id: 'VK-P', sku: '000901-P', barcode: '7890000901028', price: '89.90', available: true, option1: 'Verde', option2: 'P' },
        { id: 'VK-M', sku: '000901-M', barcode: '7890000901035', price: '89.90', available: true, option1: 'Verde', option2: 'M' },
      ],
    }];
    const snapT0 = await collectProductPages({
      origin: 'https://bambino.example.com',
      approvedOrigin: 'https://bambino.example.com',
      scope: { workspaceId: kidsScope.workspaceId, clientId: kidsScope.clientId },
      handles: ['conjunto-algodao-bebe'],
      mode: 'synthetic',
    }, {
      transport: async () => new Response(JSON.stringify({ product: kidsProductsT0[0] }), { headers: { 'content-type': 'application/json' } }),
    });
    const kidsProductsT1 = structuredClone(kidsProductsT0);
    kidsProductsT1[0]!.variants[0]!.available = true; // RN voltou ao estoque público
    kidsProductsT1[0]!.variants[1]!.available = false; // P entrou em ruptura pública
    const snapT1 = makeSnapshot({
      origin: 'https://bambino.example.com',
      mode: 'synthetic',
      scope: { workspaceId: kidsScope.workspaceId, clientId: kidsScope.clientId },
      maxProducts: 10,
      coverage: 'sample',
      stopReason: 'Segunda captura temporal de campo.',
      capturedAt: new Date(Date.parse(snapT0.capturedAt) + 3600_000).toISOString(),
      pages: [{ url: 'https://bambino.example.com/products/conjunto-algodao-bebe.json', body: JSON.stringify({ product: kidsProductsT1[0] }) }],
    });

    const auditT0 = analyzeSnapshot(snapT0, kidsProfile);
    const delta = compareSnapshots(verifySnapshot(snapT0), snapT1, kidsProfile);
    assert.equal(delta.changes.length, 2);

    const kidsEvalUnverified = evaluateStoreAdaptation(store, {
      scope: kidsScope,
      expectedSizes: kidsProfile.expectedSizes,
      observedVariants: kidsProductsT1[0]!.variants.map(v => ({ sku: v.sku, size: v.option2, available: v.available })),
      previousVariants: kidsProductsT0[0]!.variants.map(v => ({ sku: v.sku, available: v.available })),
    });
    assert.deepEqual(kidsEvalUnverified.demandDiagnostics.missingExpectedSizes, ['G']);
    assert.deepEqual(kidsEvalUnverified.demandDiagnostics.restockedSkus, ['000901-RN']);
    assert.deepEqual(kidsEvalUnverified.demandDiagnostics.newlyOutOfStockSkus, ['000901-P']);
    assert.equal(kidsEvalUnverified.demandDiagnostics.replenishmentGate.status, 'not_evaluable');

    const kidsEvalVerified90d = evaluateStoreAdaptation(store, {
      scope: kidsScope,
      expectedSizes: kidsProfile.expectedSizes,
      observedVariants: kidsProductsT1[0]!.variants.map(v => ({ sku: v.sku, size: v.option2, available: v.available })),
      replenishmentInput: { historyDays: 95, sales: true, availability: true, stock: true, inTransit: true, leadTime: true },
    });
    assert.equal(kidsEvalVerified90d.demandDiagnostics.replenishmentGate.status, 'eligible_for_review');
    assert.equal(kidsEvalVerified90d.demandDiagnostics.replenishmentGate.automaticPurchase, false);
    checks.push('Diagnóstico de demanda detectou ruptura pública (33%), lacuna de tamanho (G) e transição temporal sem fabricar compra automática.');
    observations.push({
      subject: 'Bambino Kids (Demanda, Grade e Reposição)',
      category: 'needs_internal_evidence',
      finding: `Oscilação detectada entre capturas (SKU 000901-RN reabastecido, SKU 000901-P indisponível, tamanho G ausente na grade). Gate de reposição exige 90 dias de vendas líquidas e estoque físico antes de recomendar reposição.`,
      nextAction: 'Solicitar relatório interno de vendas de 90 dias e trânsito antes de abrir avaliação de reposição.',
    });

    // =========================================================================
    // CAMPO 4: Ponte Lote LeakFinder -> Pedido Comercial Multi-Produto
    // =========================================================================
    const batchResult = ops.intakeBatchToOrder(snapT0, kidsScope, fixtureReq.brand);
    assert.equal(batchResult.records.length, 1);
    assert(batchResult.orderId);
    checks.push(`Ponte LeakFinder converteu captura pública em ficha editorial vinculada ao pedido ${batchResult.orderId.slice(0, 8)} com SKU preservado (${auditT0.products[0]!.variants[0]!.sku}).`);

    const fieldSummary = {
      reference: 'Ensaio de Campo Multi-Lojas (Linha Clara · Bambino Kids · Aprendizado Local)',
      mode: 'Validação de campo local com motor heurístico/estatístico SQLite (sem nuvem paga)',
      at: new Date().toISOString(),
      checks,
      observations,
      agents: ['research', 'sales', 'support', 'planner', 'finance', 'production', 'quality', 'coordinator'].map(role => ({ role, status: 'done' })),
      metrics: {
        storesTested: 3,
        initialAdaptationScore: beforeAdapt.storeFit.adaptationScore,
        learnedAdaptationScore: afterAdapt.storeFit.adaptationScore,
        mappingConfidenceFirstRun: inferredClara.confidence,
        mappingConfidenceAfterLearning: secondInference.confidence,
        categoryPredictionConfidence: catPred.confidence,
        verifiedHandoffsCount: claraFullLedger.verifiedRoles.length,
        contributionBRL: claraEcon.contribution,
      },
      actualRevenueBRL: 0,
    };

    if (persistArtifacts) {
      mkdirSync(resolve('artifacts'), { recursive: true });
      writeFileSync(resolve('artifacts', 'field-case-summary.json'), JSON.stringify(fieldSummary, null, 2));
      writeFileSync(resolve(dir, 'field-trial-report.json'), JSON.stringify(fieldSummary, null, 2));
    }
    return fieldSummary;
  } finally {
    store.close();
  }
}

if (process.argv[1]?.endsWith('field-trial.ts')) {
  runFieldTrials(true).then(summary => console.log(JSON.stringify(summary.metrics, null, 2)));
}
