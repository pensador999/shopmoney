import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { Store } from './store.ts';
import { Service } from './service.ts';
import { assert, policy, businessDays } from './policy.ts';
import { proposalCopy } from './commercial-copy.ts';

export class Payments {
  store: Store; stripe: Stripe; live: boolean;
  constructor(store: Store, stripe?: Stripe) {
    this.store = store;
    const key = process.env.STRIPE_RESTRICTED_KEY ?? '';
    this.live = /^(rk|sk)_live_/.test(key);
    this.stripe = stripe ?? new Stripe(key || 'rk_test_not_configured', { maxNetworkRetries: 2 });
  }
  async checkout(id: string) {
    const owner = randomUUID(); assert(this.store.acquire('checkout', owner), 'Cobrança em preparação.');
    try {
      const o = this.store.get(id);
      assert(!o.offer||o.offer.commercialEnabled,'Oferta brasileira em validação: cobrança bloqueada.');
      assert(!o.demo && o.scopeApproved && o.status === 'awaiting_payment', 'Pedido não pode ser cobrado.');
      assert(!this.store.setting('aiPaused', false), 'Capacidade de IA indisponível; novas cobranças suspensas.');
      if (this.live) {
        const gates = new Service(this.store).readiness();
        const firstPilot = this.store.setting('firstPilotAuthorized', false) && !this.store.orders().some(p => p.receipt && p.paymentMode === 'live');
        assert(gates.every(g => g.ready || (g.name === 'bankPayout' && firstPilot)), 'Complete as evidências; o primeiro piloto supervisionado admite somente o repasse ainda pendente.');
      }
      assert(!this.store.orders().some(p => p.id !== id && !p.demo && ['queued', 'running', 'ready', 'needs_attention', 'revision_approval'].includes(p.status)), 'Capacidade ocupada por outro pedido.');
      assert(!this.store.orders().some(p => p.id !== id && p.checkoutId && p.status === 'awaiting_payment'), 'Existe outra proposta com checkout ativo.');
      if (o.checkoutUrl) return { url: o.checkoutUrl };
      const stampKey = `checkout-at-${id}`, stamp = this.store.setting(stampKey, '');
      assert(!stamp || Date.now() - Date.parse(stamp) < 23 * 3600000, 'Checkout incerto há mais de 23h; reconciliar antes de repetir.');
      if (!stamp) this.store.set(stampKey, new Date().toISOString());
      const client = this.store.db.prepare('SELECT email FROM clients WHERE id=?').get(o.clientId) as any;
      const publicUrl = process.env.PUBLIC_URL;
      assert(publicUrl && publicUrl.startsWith('https://'), 'Configure PUBLIC_URL do receptor de pagamentos.');
      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment', customer_email: client.email,
        line_items: [{ price_data: { currency: o.currency, unit_amount: o.amount, product_data: { name: o.offer?.name??'Historical Shopify catalog pilot', description: 'Escopo e versão registrados no pedido; cliente realiza a aplicação.' } }, quantity: 1 }],
        success_url: `${publicUrl}/payment-return`, cancel_url: `${publicUrl}/payment-return`,
        client_reference_id: o.id, metadata: { order_id: o.id },
        integration_identifier: 'catalog_ops_pilot_qkzmxnva',
      } as any, { idempotencyKey: `pilot-${id}` });
      o.checkoutId = session.id; o.checkoutUrl = session.url ?? undefined; this.store.save(o);
      o.paymentMode = this.live ? 'live' : 'test'; this.store.save(o);
      this.store.audit(id, policy.rules.payment, 'checkout_created', { checkoutId: session.id, live: this.live });
      this.store.enqueue(`proposal-${id}`, id, client.email, 'proposal', `Catana Ops — proposta ${id}`, proposalCopy(o,session.url??''));
      return { url: session.url };
    } finally { this.store.release('checkout', owner); }
  }
  apply(event: Stripe.Event) {
    return this.store.transaction(() => {
      if (this.store.db.prepare('SELECT id FROM events WHERE id=?').get(event.id)) return { duplicate: true };
      assert(event.livemode === this.live, 'Evento de ambiente diferente.');
      const object = event.data.object as any;
      if (['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'].includes(event.type)) {
        const o = this.store.orders().find(o => o.checkoutId === object.id);
        // Event can arrive before checkout response is persisted; do not acknowledge yet.
        assert(o, 'Checkout ainda não associado; tentar novamente.');
        assert(object.mode === 'payment' && object.amount_total === o.amount && object.currency === o.currency && object.client_reference_id === o.id, 'Valor, moeda ou pedido não confere.');
        if (object.payment_status === 'paid') {
          o.paymentIntent = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
          o.receipt = object.id;
          o.paymentMode = this.live ? 'live' : 'test';
          if (o.status === 'awaiting_payment') { o.status = 'queued'; o.dueAt = businessDays(new Date(), 3); }
          else if (o.status === 'cancelled') o.status = 'refund_pending';
          this.store.save(o);
          this.store.audit(o.id, policy.rules.payment, 'payment_confirmed', { session: object.id });
        } else if (event.type === 'checkout.session.expired' && o.status === 'awaiting_payment') {
          o.status = 'checkout_expired'; this.store.save(o);
        } else this.store.audit(o.id, policy.rules.payment, 'payment_not_cleared', { status: object.payment_status });
      } else if (event.type.startsWith('payout.')) {
        this.store.audit(null, policy.rules.payment, event.type, { id: object.id, status: object.status, amount: object.amount, currency: object.currency });
      } else if (event.type.startsWith('charge.dispute.') || event.type === 'charge.refunded') {
        const o = this.store.orders().find(o => o.paymentIntent === object.payment_intent);
        if (o) { o.status = event.type === 'charge.refunded' && object.refunded ? 'refunded' : 'needs_attention'; this.store.save(o); this.store.db.prepare("UPDATE outbox SET status='cancelled' WHERE order_id=? AND status IN ('draft','approved')").run(o.id); this.store.audit(o.id, policy.rules.payment, event.type); }
      }
      this.store.db.prepare('INSERT INTO events VALUES(?,?,?)').run(event.id, new Date().toISOString(), event.type);
      return { duplicate: false };
    });
  }
  verify(raw: Buffer, signature: string, secret = process.env.STRIPE_WEBHOOK_SECRET ?? '') {
    assert(secret, 'Webhook não configurado.');
    return this.apply(this.stripe.webhooks.constructEvent(raw, signature, secret));
  }
  async reconcile() {
    for (const o of this.store.orders().filter(o => !o.demo && o.checkoutId && ['awaiting_payment', 'cancelled'].includes(o.status))) {
      const session = await this.stripe.checkout.sessions.retrieve(o.checkoutId!);
      if (session.payment_status === 'paid') this.apply({ id: `reconcile-${session.id}-paid`, type: 'checkout.session.completed', livemode: session.livemode, data: { object: session } } as unknown as Stripe.Event);
    }
  }
  async refund(id: string) {
    const o = this.store.get(id); assert(o.status === 'refund_pending' && o.paymentIntent, 'Reembolso não disponível.');
    const refund = await this.stripe.refunds.create({ payment_intent: o.paymentIntent }, { idempotencyKey: `refund-${id}` });
    if (refund.status === 'succeeded') o.status = 'refunded';
    this.store.save(o); this.store.audit(id, policy.rules.cancellation, 'refund_requested', { id: refund.id, status: refund.status });
  }
}
