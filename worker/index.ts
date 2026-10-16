// Isolated public webhook inbox. No bank or Stripe API credentials here.
interface Env { DB: any; STRIPE_WEBHOOK_SECRET: string; SYNC_TOKEN: string }
const encoder = new TextEncoder();
async function digest(value: string) { return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
async function equal(a: string, b: string) { const aa = await digest(a), bb = await digest(b); return aa.reduce((n, v, i) => n | (v ^ bb[i]), 0) === 0; }
async function validSignature(raw: string, header: string, secret: string) {
  const parts = header.split(',').map(p => p.split('='));
  const t = parts.find(p => p[0] === 't')?.[1];
  if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${t}.${raw}`)));
  const expected = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
  for (const p of parts.filter(p => p[0] === 'v1')) if (await equal(expected, p[1])) return true;
  return false;
}
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/payment-return') return new Response('Thank you. Payment is confirmed separately by our payment processor. Contact the sender of your proposal for assistance.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    if (url.pathname === '/webhook' && request.method === 'POST') {
      if (Number(request.headers.get('content-length') ?? 0) > 1_000_000) return new Response('Too large', { status: 413 });
      const raw = await request.text();
      if (raw.length > 1_000_000) return new Response('Too large', { status: 413 });
      if (!env.STRIPE_WEBHOOK_SECRET || !await validSignature(raw, request.headers.get('stripe-signature') ?? '', env.STRIPE_WEBHOOK_SECRET)) return new Response('Invalid signature', { status: 400 });
      const event = JSON.parse(raw);
      // Store only the payment fields needed locally; no card/address/email data.
      const obj = event.data.object;
      const fields = ['id','object','mode','amount_total','currency','client_reference_id','payment_status','payment_intent','status','amount','refunded'];
      const compact = { id: event.id, type: event.type, livemode: event.livemode, data: { object: Object.fromEntries(fields.filter(f => obj[f] !== undefined).map(f => [f, obj[f]])) } };
      await env.DB.prepare('INSERT OR IGNORE INTO events(id,payload,created_at) VALUES(?,?,?)').bind(event.id, JSON.stringify(compact), new Date().toISOString()).run();
      return Response.json({ received: true });
    }
    if (!env.SYNC_TOKEN || !await equal(request.headers.get('authorization') ?? '', `Bearer ${env.SYNC_TOKEN}`)) return new Response('Unauthorized', { status: 401 });
    if (url.pathname === '/events' && request.method === 'GET') {
      const result = await env.DB.prepare('SELECT id,payload FROM events ORDER BY created_at LIMIT 100').all();
      return Response.json(result.results, { headers: { 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/ack' && request.method === 'POST') {
      const body = await request.json() as { id: string };
      if (typeof body.id !== 'string') return new Response('Bad request', { status: 400 });
      await env.DB.prepare('DELETE FROM events WHERE id=?').bind(body.id).run();
      return Response.json({ ok: true });
    }
    return new Response('Not found', { status: 404 });
  },
};
