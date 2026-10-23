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
    assert.equal(resKit.status,'needs_review');assert.equal(store.orders().length,0);
  } finally {
    store.close();
  }
});
