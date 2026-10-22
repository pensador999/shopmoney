import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { runFieldTrials } from '../src/field-trial.ts';
import { Store } from '../src/store.ts';
import { runAgentAutopilot, detectCsvFormat } from '../src/autopilot.ts';
import { ContentStudio } from '../src/content-studio/service.ts';
import { StudioOperations } from '../src/content-studio/operations.ts';
import { studioFixture } from '../src/content-studio/fixtures.ts';
import { inferSupplierMapping } from '../src/learning.ts';
import { offerSnapshot } from '../src/offers.ts';

test('ensaio de campo multi-lojas valida adaptação, fronteira de demanda, ML local supervisionado e 8 handoffs', async () => {
  const summary = await runFieldTrials(false);
  assert.equal(summary.metrics.storesTested, 3);
  assert.equal(summary.metrics.verifiedHandoffsCount, 8);
  assert(summary.metrics.learnedAdaptationScore > summary.metrics.initialAdaptationScore);
  assert(summary.metrics.mappingConfidenceFirstRun >= 0.65);
  assert(summary.metrics.mappingConfidenceAfterLearning >= summary.metrics.mappingConfidenceFirstRun);
  assert(summary.metrics.categoryPredictionConfidence >= 0.7);
  assert(summary.metrics.contributionBRL! > 0);
  assert.equal(summary.actualRevenueBRL, 0);
  assert(summary.checks.length >= 5);
  assert.equal(summary.observations.length, 3);
});

test('piloto automático (autopilot) executa os 8 agentes fim a fim com zero preenchimento manual e fichas reais por produto', async () => {
  const store = new Store(':memory:');
  try {
    const res = await runAgentAutopilot(store);
    assert.equal(res.ok, true);
    assert.equal(res.client.name, 'Atelier Linha Clara');
    assert.equal(res.autoDetected.delimiter, ';');
    assert.equal(res.autoDetected.priceDecimalSeparator, ',');
    assert(res.autoDetected.mappingConfidence >= 0.75);
    assert.equal(res.steps.length, 8);
    assert.equal(res.handoffs.verifiedRoles.length, 8);
    assert.equal(res.reconciliation.ok, true);
    assert.equal(res.reconciliation.matchedSkus, 5);
    assert(res.economics.contribution! > 400);

    // Verifica que todas as fichas de produto do catálogo foram criadas, exportadas e anexadas ao pedido
    assert.equal(res.studioRecordIds.length, 2);
    const studio = new ContentStudio(store);
    const ops = new StudioOperations(studio);
    const studioRecords = studio.list().filter((r) => r.scope.clientId === res.client.id);
    assert.equal(studioRecords.length, 2);
    assert(studioRecords.every((r) => r.status === 'exported'));
    const studioCsv = store.artifact(res.orderId, 'conteudo-studio-0.csv');
    assert(studioCsv.includes('Camisa Linho Puro Respiravel'));
    assert(studioCsv.includes('Calca Alfaiataria Sarja Premium'));

    // Verifica que delivery-0.zip inclui conteudo-studio-0.csv e que handoffs support/coordinator foram atualizados via upsert
    const zipEntries = new AdmZip(store.artifact(res.orderId, 'delivery-0.zip')).getEntries().map((e) => e.entryName);
    assert(zipEntries.includes('conteudo-studio-0.csv'));
    assert(zipEntries.includes('shopify.csv'));
    const supportHandoff = JSON.parse(store.artifact(res.orderId, 'support-0.json').toString('utf8'));
    assert(supportHandoff.materials.includes('delivery-0.zip'));
    const coordHandoff = JSON.parse(store.artifact(res.orderId, 'coordinator-0.json').toString('utf8'));
    assert.equal(coordHandoff.next, 'Ciclo autônomo concluído e conciliado pelos 8 agentes');
    assert(coordHandoff.evidence.includes(res.reconciliation.evidenceHash));

    // Verifica que as fichas geradas pelo autopilot não ficam bloqueadas por vínculo a pedido encerrado
    const firstRec = studio.get(res.studioRecordId, studioRecords[0]!.scope);
    const reOrch = ops.orchestrate(firstRec.id, firstRec.request.scope);
    assert.equal(reOrch.record.status, 'exported');
    assert.equal(reOrch.overview.order?.handoffs.verifiedRoles.length, 8);

    // Verifica limite expandido de até 20 produtos no Autopilot (acima de 10 produtos)
    const rows12 = [
      'Ref_Peca;Nome_Produto;Cod_Item;Vlr_Venda;Grade_Cor;Grade_Tam;Categoria_Item',
      ...Array.from({ length: 12 }, (_, idx) => `P-${idx + 1};Camisa Linho ${idx + 1};SKU-${idx + 1};199,90;Areia;M;Camisa`)
    ].join('\n');
    const res12 = await runAgentAutopilot(store, {
      filename: 'lote-12-produtos.csv',
      dataBase64: Buffer.from(rows12, 'utf8').toString('base64'),
      storeName: 'Atelier Doze Pecas'
    });
    assert.equal(res12.studioRecordIds.length, 12);
  } finally {
    store.close();
  }
});

test('orquestração de ficha candidata não aprovada prepara aprovação, avança versão de perfil, suporta re-orquestração, kit, >10 hosts e fecha 8 handoffs com ZIP', () => {
  const store = new Store(':memory:');
  try {
    const studio = new ContentStudio(store);
    const ops = new StudioOperations(studio);
    const client = store.client('Atelier Teste Orquestração', 'operacao@atelier-teste-orch.com.br');
    const scope = {
      workspaceId: 'ws-orch-test',
      clientId: client.id,
      storeId: 'atelier-teste-orch'
    };

    // Pré-registra versão colidente em client_profiles para testar avanço de versão em ambas as tabelas
    store.profile(client.id, 'synthetic-clara-1', { colisao: true });

    // Cria rascunho candidato com flags pendentes, categoria kit sem componentes, variante multimídia ambígua, colisões em cadeia de ID/SKU e >10 domínios
    const candidate = studioFixture(scope, 'clara');
    candidate.brand.approved = false;
    candidate.brand.materialAuthorization = false;
    candidate.brand.visual = { accent: '#ffffff', background: '#fefefe', text: '#f9f9f9', font: 'system', radius: 8 };
    candidate.product.original.approved = false;
    candidate.product.facts = candidate.product.facts.map((f) => ({ ...f, approved: false }));
    candidate.product.variants = [
      { id: 'V-AREIA-P', productId: candidate.product.id, sku: 'SKU-DUP', color: 'Areia', size: 'P' },
      { id: 'V-AREIA-P-3', productId: candidate.product.id, sku: 'SKU-DUP-3', color: 'Azul', size: 'M' },
      { id: 'V-AREIA-P', productId: candidate.product.id, sku: 'SKU-DUP', color: 'Areia', size: 'G' }
    ];
    candidate.adaptive = {
      category: 'kit conjunto',
      coverage: { kind: 'unsupported', source: 'Coleta pública', observedAt: new Date().toISOString(), missing: ['Fatos'] },
      requirements: [{ id: 'req-1', question: 'Confirmar composição?', required: true, factIds: [] }],
      conflicts: [{ id: 'conf-1', question: 'Divergência de cor', sources: ['A', 'B'], resolved: false, decision: '' }],
      components: []
    };
    candidate.media = Array.from({ length: 12 }, (_, idx) => ({
      id: `IMG-HOST-${idx + 1}`,
      productId: candidate.product.id,
      url: idx < 11 ? `https://cdn${idx + 1}.example.com/peca-${idx + 1}.jpg` : 'https://cdn1.example.com/peca-extra-host1.jpg',
      source: 'Coleta pública',
      authorized: false,
      approved: false,
      variantIds: ['V-AREIA-P', 'V-AREIA-P-3', 'VAR-INEXISTENTE'],
      color: '',
      role: idx === 0 ? 'hero' : 'detail',
      view: 'front',
      viewConfirmed: false,
      alt: `Imagem ${idx + 1}`
    }));

    const created = studio.create(candidate, randomUUID());
    assert.equal(created.status, 'draft');

    // 1ª orquestração autônoma
    const result = ops.orchestrate(created.id, scope, { operator: 'op-test' });
    assert.equal(result.record.status, 'exported');
    assert.equal(new Set(result.record.request.product.variants.map((v) => v.id)).size, 3);
    assert.equal(new Set(result.record.request.product.variants.map((v) => v.sku)).size, 3);
    assert.equal(result.record.request.brand.mediaHosts.length, 10);
    // 10 primeiros hosts únicos + 12ª imagem que reutiliza cdn1.example.com (já aprovado entre os 10) = 11 mídias mantidas
    assert.equal(result.record.request.media.length, 11);
    assert.equal(result.record.request.adaptive?.components.length, 2);
    assert(result.overview.order, 'Pedido comercial deve estar vinculado');
    assert.equal(result.overview.order.status, 'delivered');
    assert.equal(result.overview.order.handoffs.verifiedRoles.length, 8);
    assert.equal(result.overview.order.handoffs.missingRoles.length, 0);
    assert(result.overview.order.deliveryId, 'deliveryId deve estar preenchido após entrega');
    const prodHandoffBefore = JSON.parse(store.artifact(result.overview.order.id, 'production-0.json').toString('utf8'));

    // Revisão posterior + 2ª re-orquestração deve atualizar artefatos e handoff de produção do pedido já entregue
    const revisedReq = structuredClone(result.record.request);
    revisedReq.product.title = 'Conjunto Horizonte Atualizado Pós-Revisão';
    const revised = studio.revise(result.record.id, scope, result.record.revision, revisedReq);
    const result2 = ops.orchestrate(revised.id, scope, { operator: 'op-test-2' });
    assert.equal(result2.record.status, 'exported');
    assert.equal(result2.overview.order?.status, 'delivered');
    const briefAfter = JSON.parse(store.artifact(result2.overview.order!.id, 'studio-brief-0.json').toString('utf8'));
    assert.equal(briefAfter.studios[0].revision, result2.record.revision);
    const prodHandoffAfter = JSON.parse(store.artifact(result2.overview.order!.id, 'production-0.json').toString('utf8'));
    assert.notEqual(prodHandoffAfter.manifestHash, prodHandoffBefore.manifestHash);

    // Se o pedido antigo for encerrado e um novo orderId explícito for informado em orchestrate/connect, substitui o vínculo antigo
    const oldOrder = store.get(result2.overview.order!.id);
    oldOrder.status = 'closed';
    store.save(oldOrder);
    const newEditorialOrderId = randomUUID();
    const offer = offerSnapshot('content');
    store.save({
      id: newEditorialOrderId,
      clientId: client.id,
      status: 'needs_info',
      demo: true,
      filename: 'editorial-novo',
      mapping: {},
      scopeApproved: false,
      amount: offer.cents,
      currency: offer.currency,
      offer,
      createdAt: new Date().toISOString(),
      revision: 0,
      corrections: 0,
      hours: 0,
      fees: 0,
      costs: 0
    });
    const result3 = ops.orchestrate(result2.record.id, scope, { orderId: newEditorialOrderId });
    assert.equal(result3.overview.order?.id, newEditorialOrderId);
    assert.equal(result3.overview.order?.handoffs.verifiedRoles.length, 8);
    // Colisões em cadeia de IDs de fatos também são desambiguadas por loop while
    const revFacts = structuredClone(result3.record.request);
    revFacts.product.facts = [
      { id: 'fato-dup', section: 'presentation', text: 'Fato A válido.', source: 'Fonte A', approved: false },
      { id: 'fato-dup-3', section: 'fit', text: 'Fato B válido.', source: 'Fonte B', approved: false },
      { id: 'fato-dup', section: 'care', text: 'Fato C válido.', source: 'Fonte C', approved: false }
    ];
    const rFacts = studio.revise(result3.record.id, scope, result3.record.revision, revFacts);
    const result4 = ops.orchestrate(rFacts.id, scope, { orderId: newEditorialOrderId });
    assert.equal(new Set(result4.record.request.product.facts.map((f) => f.id)).size, 3);
  } finally {
    store.close();
  }
});

test('UI Content Studio (public/content-studio.js) atualiza lista ao abrir aba e isola clientId/email ao editar marca, loja ou cliente', async () => {
  const store = new Store(':memory:');
  const prevDoc = (globalThis as any).document;
  try {
    const studio = new ContentStudio(store);
    const ops = new StudioOperations(studio);
    const makeNode = (tag: string): any => {
      const node: any = {
        tagName: tag.toUpperCase(),
        textContent: '',
        value: '',
        checked: false,
        disabled: false,
        hidden: false,
        dataset: {} as Record<string, string>,
        attrs: {} as Record<string, string>,
        children: [] as any[],
        parent: null as any,
        classList: {
          set: new Set<string>(),
          add(...cls: string[]) { cls.forEach((c) => this.set.add(c)); },
          toggle(cls: string, force?: boolean) {
            if (force === undefined ? !this.set.has(cls) : force) this.set.add(cls);
            else this.set.delete(cls);
          }
        },
        setAttribute(k: string, v: string) { this.attrs[k] = String(v); },
        removeAttribute(k: string) { delete this.attrs[k]; },
        append(...items: any[]) {
          for (const item of items) {
            if (item && typeof item === 'object') { item.parent = this; this.children.push(item); }
          }
        },
        replaceChildren(...items: any[]) {
          this.children = [];
          this.append(...items);
        },
        remove() {
          if (this.parent) this.parent.children = this.parent.children.filter((c: any) => c !== this);
        },
        addEventListener() {},
        querySelectorAll(selector: string): any[] {
          const out: any[] = [];
          const visit = (n: any) => {
            for (const c of n.children ?? []) {
              if (
                (selector === '.tab' && c.attrs?.class === 'tab') ||
                (selector === '[data-tab]' && c.attrs?.['data-tab'] !== undefined) ||
                selector === c.tagName?.toLowerCase()
              ) out.push(c);
              visit(c);
            }
          };
          visit(this);
          return out;
        }
      };
      return node;
    };
    const rootDoc = makeNode('document');
    const main = makeNode('main');
    const navBar = makeNode('nav');
    const head = makeNode('head');
    rootDoc.append(head, navBar, main);
    (globalThis as any).document = {
      createElement: (tag: string) => makeNode(tag),
      head,
      querySelector: (sel: string) => (sel === 'main' ? main : sel === 'nav' ? navBar : null),
      querySelectorAll: (sel: string) => rootDoc.querySelectorAll(sel)
    };

    let listCalls = 0;
    const createdPayloads: { name: string; email: string; storeId: string }[] = [];
    const api = async (path: string, body?: any): Promise<any> => {
      if (path === 'studio/list') { listCalls++; return studio.list(); }
      if (path.startsWith('studio/fixture')) {
        const brand = (new URL(path, 'http://localhost').searchParams.get('brand') as 'clara' | 'horizonte') || 'clara';
        return studioFixture({ workspaceId: 'local', clientId: 'fixture', storeId: brand }, brand);
      }
      if (path === 'studio/create') {
        const client = store.client(body.name, body.email);
        createdPayloads.push({ name: body.name, email: body.email, storeId: body.request.scope.storeId });
        return studio.create({ ...body.request, scope: { ...body.request.scope, clientId: client.id } }, body.id);
      }
      if (path === 'studio/revise') return studio.revise(body.id, body.scope, body.revision, body.request);
      if (path === 'studio/read') {
        const record = studio.get(body.id, body.scope);
        const client = store.db.prepare('SELECT name,email FROM clients WHERE id=?').get(record.request.scope.clientId);
        return { ...record, client, issues: [] };
      }
      if (path === 'studio/operations') return ops.overview(body.id, body.scope);
      if (path === 'studio/handoff') return studio.handoff(body.id, body.scope);
      throw new Error(`Unexpected api path: ${path}`);
    };

    const { mountStudio } = await import('../public/content-studio.js');
    await mountStudio({ api, notice: () => {} });
    const studioNavBtn = navBar.children.find((c: any) => c.attrs['data-tab'] === 'studio');
    assert(studioNavBtn, 'Botão da aba do Studio deve existir');
    const callsBeforeClick = listCalls;
    studioNavBtn.onclick();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(listCalls, callsBeforeClick + 1);

    // Localiza os botões de exemplo e formulário para testar isolamento de clientId/email
    const allButtons = rootDoc.querySelectorAll('button');
    const btnHorizonte = allButtons.find((b: any) => b.textContent.includes('Ateliê Horizonte'));
    const form = rootDoc.querySelectorAll('form')[0];
    const findLabelInput = (labelPrefix: string) => {
      const labels = rootDoc.querySelectorAll('label');
      const lbl = labels.find((l: any) => l.textContent.startsWith(labelPrefix));
      return lbl?.children[0];
    };

    // 1) Salvar fixture inicial (Linha Clara), editando apenas bf.name ("Nome da marca") sem editar "Cliente / marca"
    const brandNameInput = findLabelInput('Nome da marca');
    brandNameInput.value = 'Atelier Aurora Boreal';
    form.onsubmit({ preventDefault() {} });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(createdPayloads.length, 1);
    assert.equal(createdPayloads[0]!.name, 'Atelier Aurora Boreal');
    assert.equal(createdPayloads[0]!.email, 'operacao@atelier-aurora-boreal.com.br');

    // 2) Carregar fixture Ateliê Horizonte e salvar: gera cliente/email distintos
    await btnHorizonte.onclick();
    await new Promise((r) => setTimeout(r, 20));
    form.onsubmit({ preventDefault() {} });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(createdPayloads.length, 2);
    assert.equal(createdPayloads[1]!.name, 'Ateliê Horizonte');
    assert.equal(createdPayloads[1]!.email, 'operacao@atelie-horizonte.com.br');

    const allClients = store.db.prepare('SELECT id, name, email FROM clients').all() as any[];
    assert.equal(allClients.length, 2);
    assert.notEqual(allClients[0].id, allClients[1].id);
  } finally {
    (globalThis as any).document = prevDoc;
    store.close();
  }
});

test('detectCsvFormat distingue decimais com vírgula entre aspas e inferSupplierMapping suporta produtos com e sem opções', async () => {
  const commaCsvWithCommaDecimal = [
    'Ref_Pai,SKU_Var,Descricao_Peca,Cor,Tamanho,Preco_BRL',
    'REF-01,REF-01-P,Blusa Tricot,Off White,P,"199,90"',
    'REF-01,REF-01-M,Blusa Tricot,Off White,M,"199,90"'
  ].join('\n');
  const detectedComma = detectCsvFormat(commaCsvWithCommaDecimal, 'catalogo.csv');
  assert.equal(detectedComma.delimiter, ',');
  assert.equal(detectedComma.priceDecimalSeparator, ',');

  const commaCsvWithDotDecimal = [
    'Handle,Variant SKU,Title,Option1 Value,Option2 Value,Variant Price',
    'blusa-tricot,REF-01-P,Blusa Tricot,Off White,P,199.90',
    'blusa-tricot,REF-01-M,Blusa Tricot,Off White,M,199.90'
  ].join('\n');
  const detectedDot = detectCsvFormat(commaCsvWithDotDecimal, 'catalogo.csv');
  assert.equal(detectedDot.delimiter, ',');
  assert.equal(detectedDot.priceDecimalSeparator, '.');

  const store = new Store(':memory:');
  try {
    const client = store.client('Atelier Sul', 'contato@ateliersul.com.br');
    const inferred = inferSupplierMapping(
      store,
      client.id,
      ['Código', 'Descrição', 'Marca', 'Cor', 'Tamanho', 'Preço Venda', 'GTIN/EAN', 'URL Imagem'],
      'fornecedor-atelier-sul'
    );

    // Quando há apenas 1 coluna de código e opções de variante, productId usa o título do produto para agrupar variantes sem colidir com SKU
    assert.equal(inferred.mapping.sku, 'Código');
    assert.equal(inferred.mapping.productId, 'Descrição');
    assert.equal(inferred.mapping.vendor, 'Marca');
    assert.equal(inferred.mapping.imageUrl, 'URL Imagem');
    assert.equal(inferred.mapping.barcode, 'GTIN/EAN');
    assert.notEqual(inferred.mapping.sku, inferred.mapping.barcode);

    // Quando NÃO há colunas de opção (produtos simples), productId usa o SKU sem colidir com 'Nome Produto'
    const simpleInferred = inferSupplierMapping(
      store,
      client.id,
      ['SKU', 'Nome Produto', 'Preço Venda'],
      'fornecedor-simples'
    );
    assert.equal(simpleInferred.mapping.options.length, 0);
    assert.equal(simpleInferred.mapping.sku, 'SKU');
    assert.equal(simpleInferred.mapping.title, 'Nome Produto');
    assert.equal(simpleInferred.mapping.productId, 'SKU');

    // Autopilot funciona mesmo quando SKU coincide com Ref_Peca em item com cor/tamanho e categoria Kit
    const kitCsv = [
      'Ref_Peca;Nome_Produto;Cod_Item;Vlr_Venda;Grade_Cor;Grade_Tam;Categoria_Item',
      'KIT-100;Kit 2 Camisetas Algodao;KIT-100;199,90;Branco;M;Kit'
    ].join('\n');
    const resKit = await runAgentAutopilot(store, {
      filename: 'kit-colisao.csv',
      dataBase64: Buffer.from(kitCsv, 'utf8').toString('base64'),
      storeName: 'Loja Kit Teste'
    });
    assert.equal(resKit.ok, true);
    assert.equal(resKit.studioRecordIds.length, 1);
  } finally {
    store.close();
  }
});



