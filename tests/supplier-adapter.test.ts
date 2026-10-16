import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptSupplier, type SupplierProfile } from '../src/supplier-adapter.ts';
import { csv } from '../src/catalog.ts';
import { Service } from '../src/service.ts';
import { Store } from '../src/store.ts';

const profile: SupplierProfile = {
  id: 'synthetic-apparel', version: '1', rowType: 'kind', parentValue: 'parent', variantValue: 'variant',
  parentId: 'id', variantParentId: 'parent', parentFields: ['title'],
  mapping: { supplierKey: 'synthetic', productId: 'product', title: 'title', sku: 'sku', barcode: 'ean', price: 'price', options: [{ name: 'Size', column: 'size' }] },
};
const rows = [
  { kind: 'parent', id: '001', parent: '', product: '', title: 'Synthetic shirt', sku: '', ean: '', price: '', size: '' },
  { kind: 'variant', id: '', parent: '001', product: '', title: '', sku: '0001S', ean: '0012345678905', price: '15.00', size: 'S' },
  { kind: 'variant', id: '', parent: '001', product: '', title: '', sku: '0001M', ean: '0012345678912', price: '15.00', size: 'M' },
];
test('perfil explícito liga pai/variantes ao ciclo simulado sem alterar identificadores', async () => {
  const adapted = adaptSupplier(rows, profile), store = new Store(':memory:');
  try {
    assert.equal(adapted.report.productCount, 1); assert.equal(adapted.report.variantCount, 2);
    assert.equal(adapted.rows[0].ean, '0012345678905'); assert.equal(rows[1].title, '');
    const service = new Service(store);
    const order = await service.create({ name: 'Synthetic', email: 'synthetic@example.com', filename: 'variants.csv', data: Buffer.from(csv(adapted.rows)), mapping: adapted.mapping, demo: true });
    service.approve(order.id); service.simulatePayment(order.id);
    const ready = await service.process(order.id);
    assert.equal(ready.status, 'ready'); assert(store.artifact(order.id, 'delivery-0.zip').length > 0);
    assert.equal(store.db.prepare('SELECT status FROM outbox').get()?.status, 'draft');
  } finally { store.close(); }
});
test('perfil bloqueia pais duplicados, órfãos, preço ausente e herança de identificador', () => {
  assert.throws(() => adaptSupplier([...rows, rows[0]], profile), /duplicado/);
  assert.throws(() => adaptSupplier(rows.slice(1), profile), /órfã/);
  assert.throws(() => adaptSupplier(rows.map((r,i) => i === 1 ? { ...r, price: '' } : r), profile), /inválido/);
  assert.throws(() => adaptSupplier(rows, { ...profile, parentFields: ['ean'] }), /Só título/);
  assert.throws(() => adaptSupplier([{ ...rows[0], kind: 'unknown' }, ...rows.slice(1)], profile), /desconhecido/);
});
