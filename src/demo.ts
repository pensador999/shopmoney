import { Service } from './service.ts';
import { Store } from './store.ts';
export const demoCsv = 'product_id,title,sku,price,barcode,vendor,size,description\r\nP001,Sample cotton tee,000101,19.90,0012345678905,Synthetic Supplier,S,Cotton tee supplied as demo data\r\nP001,Sample cotton tee,000102,19.90,0012345678912,Synthetic Supplier,M,Cotton tee supplied as demo data\r\n';
export const demoMapping = { supplierKey: 'synthetic-supplier', productId: 'product_id', title: 'title', sku: 'sku', price: 'price', barcode: 'barcode', vendor: 'vendor', description: 'description', options: [{ name: 'Size', column: 'size' }] };
export async function runDemo(store: Store) {
  const service = new Service(store);
  const o = await service.create({ name: 'Marca demonstrativa', email: 'demo@example.com', filename: 'synthetic.csv', data: Buffer.from(demoCsv), mapping: demoMapping, demo: true });
  service.approve(o.id); service.simulatePayment(o.id); return service.process(o.id);
}
