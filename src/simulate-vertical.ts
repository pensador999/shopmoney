import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AdmZip from 'adm-zip';
import { Store } from './store.ts';
import { Service } from './service.ts';
import { adaptSupplier, type SupplierProfile } from './supplier-adapter.ts';
import { csv, readTable, qualityCheck, type Row } from './catalog.ts';

// Isolated rehearsal: no runtime tick, network, LLM, SMTP or payment SDK.
const directory = resolve('artifacts', `vertical-${Date.now()}`);
mkdirSync(directory, { recursive: true });
let store = new Store(resolve(directory, 'simulation.sqlite'));
const checks: string[] = [];
const stages: { role: string; result: string; mode: string }[] = [];
const check = (name: string, fn: () => void) => { fn(); checks.push(name); };
const stage = (role: string, result: string, mode = 'código executado') => stages.push({ role, result, mode });
const profile: SupplierProfile = {
  id: 'synthetic-apparel', version: '1', rowType: 'kind', parentValue: 'parent', variantValue: 'variant',
  parentId: 'id', variantParentId: 'parent', parentFields: ['title', 'vendor', 'description'],
  mapping: { supplierKey: 'synthetic-maker-reseller', productId: 'product', title: 'title', sku: 'sku', price: 'price', barcode: 'ean', vendor: 'vendor', description: 'description', imageUrl: 'image', options: [{ name: 'Size', column: 'size' }] },
};
const source: Row[] = [];
const products = [
  { id: '001', title: 'Synthetic long sleeve shirt', kind: 'manufactured', sizes: ['S','M','L'], price: '29.90' },
  { id: '002', title: 'Synthetic sleeve pair', kind: 'manufactured', sizes: ['S','M'], price: '12.90' },
  { id: '003', title: 'Synthetic bandana', kind: 'resale', sizes: ['One size'], price: '9.90' },
];
for (const p of products) {
  source.push({ kind: 'parent', id: p.id, parent: '', product: '', title: p.title, vendor: 'Synthetic supplier', description: 'Synthetic demonstration item', sku: '', ean: '', price: '', size: '', image: '', businessKind: p.kind });
  p.sizes.forEach((size, i) => source.push({ kind: 'variant', id: '', parent: p.id, product: '', title: '', vendor: '', description: '', sku: `${p.id}0${i}`, ean: '', price: p.price, size, image: `https://example.com/synthetic/${p.id}-${i}.jpg`, businessKind: p.kind }));
}
// Known synthetic identifier: optional EAN is left blank for other variants, never invented.
source[1].ean = '0012345678905';
try {
  stage('Pesquisa', 'Agência e fornecedor fictícios; nenhuma necessidade comercial verificada.', 'cenário simulado');
  stage('Comercial', 'Oferta hipotética de US$149; um fornecedor, novos rascunhos e nenhuma aplicação na loja.', 'cenário simulado');
  const incomplete = structuredClone(source); incomplete[1].price = '';
  check('Preço ausente bloqueia adaptação', () => assert.throws(() => adaptSupplier(incomplete, profile), /inválido/));
  stage('Atendimento', 'Preço faltante detectado; fixture corrigida explicitamente, sem estimativa automática.', 'falha e correção simuladas');
  const adapted = adaptSupplier(source, profile);
  check('Três pais e seis variantes, sem multiplicar por loja ou origem', () => {
    assert.equal(adapted.report.productCount, 3); assert.equal(adapted.report.variantCount, 6);
    assert.deepEqual(adapted.rows.map(r => r.businessKind), ['manufactured','manufactured','manufactured','manufactured','manufactured','resale']);
  });
  stage('Planejamento', 'Perfil v1 explícito; fabricação/revenda preservada na fonte, sem regras fiscais ou de estoque.');
  let service = new Service(store);
  const order = await service.create({ name: 'Synthetic agency', email: 'simulation@example.com', filename: 'normalized.csv', data: Buffer.from(csv(adapted.rows)), mapping: adapted.mapping, demo: true });
  // Keep raw supplier evidence separate from normalized service input in this rehearsal.
  store.artifact(order.id, 'supplier-original.csv', csv(source));
  store.artifact(order.id, 'supplier-profile.json', JSON.stringify(profile, null, 2));
  store.artifact(order.id, 'supplier-lineage.json', JSON.stringify(adapted.lineage, null, 2));
  await assert.rejects(() => service.process(order.id)); checks.push('Produção bloqueada antes de escopo e pagamento');
  service.approve(order.id);
  await assert.rejects(() => service.process(order.id)); checks.push('Escopo sozinho não libera produção');
  service.simulatePayment(order.id);
  store.close(); store = new Store(resolve(directory, 'simulation.sqlite')); service = new Service(store);
  check('Fila persiste ao reabrir banco', () => assert.equal(store.get(order.id).status, 'queued'));
  stage('Coordenador', 'Pedido elegível após aprovação simulada e pagamento fictício; retomado ao reabrir SQLite.');
  const ready = await service.process(order.id);
  const output = await readTable(store.artifact(order.id, 'shopify-0.csv'), '.csv');
  const qa = qualityCheck(adapted.rows, output, ready.mapping);
  check('Qualidade independente aprova saída', () => assert.deepEqual(qa, []));
  const tampered = structuredClone(output); tampered[0].Price = '0.01';
  check('Qualidade identifica adulteração de preço', () => assert(qualityCheck(adapted.rows, tampered, ready.mapping).length > 0));
  check('SKU/EAN preservam zeros e produtos ficam rascunho', () => {
    assert.equal(output[0].SKU, '00100'); assert.equal(output[0].Barcodes, '0012345678905');
    assert.equal(output.filter(r => r.Status === 'draft').length, 3);
  });
  const zip = new AdmZip(store.artifact(order.id, 'delivery-0.zip'));
  check('Seis referências de mídia por SKU sem download', () => {
    const media = JSON.parse(zip.readAsText('media-review.json'));
    assert.equal(media.length, 6); assert.equal(media[0].sku, '00100');
  });
  stage('Produção', 'CSV e ZIP reais produzidos a partir de dados sintéticos.');
  stage('Qualidade', 'Comparação fonte/saída aprovada; alteração artificial de preço detectada.');
  await assert.rejects(() => service.process(order.id));
  check('Repetição não duplica entrega', () => assert.equal(store.db.prepare('SELECT COUNT(*) n FROM outbox').get()?.n, 1));
  const packagePath = resolve(directory, 'delivery-synthetic.zip');
  writeFileSync(packagePath, store.artifact(order.id, 'delivery-0.zip'));
  service.delivered(order.id, ready.deliveryId!); // Simulated transport acknowledgment, no SMTP.
  service.closeExpired(Date.parse(store.get(order.id).deliveredAt!) + 8 * 86400000);
  check('Encerramento após janela não inventa aceite', () => {
    assert.equal(store.get(order.id).status, 'closed'); assert.equal(store.get(order.id).acceptedAt, undefined);
    assert.equal(store.db.prepare('SELECT status FROM outbox').get()?.status, 'draft');
  });
  const minutes = { research: 20, sales: 15, support: 15, planning: 15, production: 5, quality: 15, finance: 5, corrections: 10 };
  const hours = Object.values(minutes).reduce((a,b) => a+b, 0) / 60;
  const economics = { hypothetical: true, priceUsd: 149, assumedFeesUsd: 7, assumedVariableCostsUsd: 2, minutes, hours, laborRateUsd: 25,
    contributionUsd: Number((149 - 7 - 2 - hours * 25).toFixed(2)), breakEvenHours: (149-7-2)/25, actualRevenueUsd: 0 };
  stage('Financeiro e encerramento', `Pagamento e entrega simulados; contribuição hipotética US$${economics.contributionUsd}; receita real US$0.`, 'hipótese calculada; estados executados');
  const report = { synthetic: true, generatedAt: new Date().toISOString(), orderId: order.id, products: 3, variants: 6, checks, stages, economics,
    limits: ['Sem agentes LLM nesta simulação; etapas comerciais e humanas representadas pelo roteiro.', 'Sem Stripe/Gmail/Shopify reais; transporte de entrega simulado.', 'Imagens não baixadas nem verificadas. Fabricação/revenda não configura ERP ou estoque.', 'Persistência de perfil e linhagem feita pelo roteiro; intake do painel ainda não integrado.', 'Horas e taxas são hipóteses; não medem margem comercial real.'] };
  writeFileSync(resolve(directory, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(resolve(directory, 'supplier-original.csv'), csv(source));
  writeFileSync(resolve(directory, 'profile.json'), JSON.stringify(profile, null, 2));
  writeFileSync(resolve(directory, 'lineage.json'), JSON.stringify(adapted.lineage, null, 2));
  writeFileSync(resolve(directory, 'RESULTADO.md'), `# Simulação vertical — vestuário\n\nDados exclusivamente sintéticos. Receita real: US$0.\n\n3 produtos, 6 variantes, ${checks.length} verificações aprovadas.\n\n## Etapas\n\n${stages.map(s => `- **${s.role}** (${s.mode}): ${s.result}`).join('\n')}\n\n## Economia hipotética\n\nUS$149 − US$7 de taxas assumidas − US$2 de custos variáveis − ${hours.toFixed(2)} horas × US$25 = **US$${economics.contributionUsd}**. Tempo total inclui prospecção e correções. Limite de equilíbrio: ${economics.breakEvenHours.toFixed(2)} horas; impostos e custos fixos não incluídos. Não é lucro comprovado.\n\n## Verificações\n\n${checks.map(c => `- ${c}`).join('\n')}\n\n## Limites\n\n${report.limits.map(l => `- ${l}`).join('\n')}\n`);
  console.log(JSON.stringify({ directory, packagePath, checks: checks.length, contributionHypotheticalUsd: economics.contributionUsd, actualRevenueUsd: 0 }, null, 2));
} finally { store.close(); }
