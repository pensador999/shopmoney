import { Store } from './store.ts';
import { Service } from './service.ts';
import { runDemo } from './demo.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { backup } from 'node:sqlite';
const store = new Store();
try {
  const command = process.argv[2];
  if (command === 'demo') {
    const order = await runDemo(store); mkdirSync('artifacts', { recursive: true });
    const path = resolve('artifacts', `demo-${order.id}.zip`);
    writeFileSync(path, store.artifact(order.id, 'delivery-0.zip'));
    console.log(JSON.stringify({ orderId: order.id, status: order.status, products: order.report.productCount, variants: order.report.variantCount, package: path, simulated: true }, null, 2));
  } else if (command === 'doctor') {
    console.log(JSON.stringify({ node: process.version, sqlite: 'ok', gates: new Service(store).readiness(), credentials: { stripe: !!process.env.STRIPE_RESTRICTED_KEY, gmail: !!process.env.GMAIL_APP_PASSWORD, webhook: !!process.env.PAYMENT_SYNC_TOKEN }, aiPaused: store.setting('aiPaused', false) }, null, 2));
  } else if (command === 'backup') {
    mkdirSync('backups', { recursive: true }); const target = resolve('backups', `catalog-${Date.now()}.sqlite`); await backup(store.db, target); console.log(target);
  } else throw new Error('Use: demo, doctor ou backup.');
} finally { store.close(); }
