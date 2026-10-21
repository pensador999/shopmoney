import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { policy, assert } from './policy.ts';
import { orderTasks } from './order-workflow.ts';
import type { OfferSnapshot } from './offers.ts';

export type Order = {
  id: string; clientId: string; status: string; demo: boolean; filename: string;
  mapping: any; scopeApproved: boolean; amount: number; currency: string;
  createdAt: string; dueAt?: string; deliveredAt?: string; acceptedAt?: string;
  closedAt?: string; checkoutId?: string; checkoutUrl?: string; paymentIntent?: string;
  report?: any; qa?: any; revision: number; corrections: number; deliveryId?: string;
  hours: number; fees: number; costs: number; receipt?: string; error?: string;
  paymentMode?: 'test' | 'live';
  supplierProfile?: { id: string; version: string };
  economicsRecordedAt?: string; economicsNote?: string; productionAttempts?: number;
  offer?: OfferSnapshot; taxes?: number; brandProfile?: unknown; contentInput?: unknown;
  remoteWorkspaceId?: string;
  learningProposals?: any[];
};
export class Store {
  db: DatabaseSync;
  constructor(path = process.env.DB_PATH ?? './data/catalog.sqlite') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES clients(id),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS artifacts(order_id TEXT NOT NULL REFERENCES orders(id),name TEXT NOT NULL,data BLOB NOT NULL,PRIMARY KEY(order_id,name));
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at TEXT NOT NULL,order_id TEXT,rule TEXT NOT NULL,policy TEXT NOT NULL,event TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,at TEXT NOT NULL,type TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,order_id TEXT,recipient TEXT NOT NULL,kind TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,sent_at TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS inbox(id TEXT PRIMARY KEY,sender TEXT,subject TEXT,body TEXT,summary_pt TEXT,status TEXT,received_at TEXT);
      CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS suppression(email TEXT PRIMARY KEY,reason TEXT NOT NULL,at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ai_jobs(id TEXT PRIMARY KEY,client_id TEXT,role TEXT NOT NULL,input TEXT NOT NULL,status TEXT NOT NULL,result TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_at TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS leases(name TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY,client_id TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS order_tasks(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS client_profiles(client_id TEXT NOT NULL REFERENCES clients(id),version TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(client_id,version));
      CREATE TABLE IF NOT EXISTS learning_proposals(id TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES clients(id),data TEXT NOT NULL);
    `);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  setting<T>(key: string, fallback: T): T { const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as any; return row ? JSON.parse(row.value) : fallback; }
  set(key: string, value: unknown) { this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  client(name: string, email: string) {
    email = email.trim().toLowerCase();
    assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Email inválido.');
    const found = this.db.prepare('SELECT * FROM clients WHERE email=?').get(email) as any;
    if (found) return found;
    const id = randomUUID(); this.db.prepare('INSERT INTO clients VALUES(?,?,?)').run(id, email, name); return { id, email, name };
  }
  get(id: string, clientId?: string): Order {
    const r = this.db.prepare('SELECT * FROM orders WHERE id=?').get(id) as any;
    assert(r && (!clientId || r.client_id === clientId), 'Pedido não encontrado.'); return JSON.parse(r.data);
  }
  save(order: Order) {
    const persist = () => {
      this.db.prepare('INSERT INTO orders VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(order.id, order.clientId, JSON.stringify(order));
      for (const task of orderTasks(order)) this.db.prepare('INSERT INTO order_tasks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(task.id, order.id, JSON.stringify(task));
    };
    if (this.db.isTransaction) persist(); else this.transaction(persist);
  }
  orders(): Order[] { return (this.db.prepare('SELECT data FROM orders ORDER BY rowid DESC').all() as any[]).map(r => JSON.parse(r.data)); }
  profile(clientId:string,version:string,data:unknown){
    const text=JSON.stringify(data),old=this.db.prepare('SELECT data FROM client_profiles WHERE client_id=? AND version=?').get(clientId,version) as any;
    assert(!old||old.data===text,'Versão de perfil já existe com outro conteúdo; crie nova versão.');
    this.db.prepare('INSERT OR IGNORE INTO client_profiles VALUES(?,?,?)').run(clientId,version,text);
  }
  artifact(id: string, name: string, data?: Buffer | string) {
    if (data !== undefined) this.db.prepare('INSERT OR IGNORE INTO artifacts VALUES(?,?,?)').run(id, name, Buffer.isBuffer(data) ? data : Buffer.from(data));
    const row = this.db.prepare('SELECT data FROM artifacts WHERE order_id=? AND name=?').get(id, name) as any;
    assert(row, 'Arquivo não encontrado.'); return Buffer.from(row.data);
  }
  audit(orderId: string | null, rule: string, event: string, data: unknown = {}) {
    this.db.prepare('INSERT INTO audit(at,order_id,rule,policy,event,data) VALUES(?,?,?,?,?,?)').run(new Date().toISOString(), orderId, rule, policy.version, event, JSON.stringify(data));
  }
  enqueue(id: string, orderId: string | null, recipient: string, kind: string, subject: string, body: string) {
    this.db.prepare('INSERT OR IGNORE INTO outbox(id,order_id,recipient,kind,subject,body,status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id, orderId, recipient, kind, subject, body, 'draft', new Date().toISOString());
  }
  acquire(name: string, owner: string, ttl = 300_000) {
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM leases WHERE name=?').get(name) as any;
      if (row && row.expires > Date.now() && row.owner !== owner) return false;
      this.db.prepare('INSERT INTO leases VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires=excluded.expires').run(name, owner, Date.now() + ttl); return true;
    });
  }
  release(name: string, owner: string) { this.db.prepare('DELETE FROM leases WHERE name=? AND owner=?').run(name, owner); }
  close() { this.db.close(); }
}
