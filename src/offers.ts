/** Immutable commercial hypotheses. Existing orders retain their own snapshot. */
export const offerVersion = 'br-2026-10-19.1';
export const offers = {
  diagnostic: { name: 'Diagnóstico de catálogo', cents: 19000, maxProducts: 10, maxVariants: 200, days: 2, enabled: true },
  content: { name: 'Conteúdo de produto', cents: 49000, maxProducts: 10, maxVariants: 200, days: 3, enabled: true },
  catalog: { name: 'Preparação de cadastro', cents: 69000, maxProducts: 20, maxVariants: 200, days: 3, enabled: true },
  combined: { name: 'Lançamento combinado', cents: 99000, maxProducts: 20, maxVariants: 200, days: 3, enabled: true },
  images: { name: 'Padronização de imagens', cents: 29000, maxProducts: 10, maxVariants: 0, days: 3, enabled: false },
} as const;
export type ServiceKind = keyof typeof offers;
export type OfferSnapshot = ReturnType<typeof offerSnapshot>;
export function offerSnapshot(kind: ServiceKind) {
  if (!Object.hasOwn(offers, kind)) throw Error('Serviço desconhecido.');
  const offer = offers[kind];
  if (!offer.enabled) throw Error('Serviço aguardando validação técnica; venda bloqueada.');
  return { ...offer, kind, version: offerVersion, currency: 'brl', locale: 'pt-BR', laborRate: 60, targetContribution: 0.4,
    maxContentProducts: 10, suppliers: 1, adjustmentDays: 7, adjustments: 1, application: 'client', commercialEnabled: false } as const;
}
export const recurringOffer = Object.freeze({ cents: 149000, currency: 'brl', catalogLots: 2, diagnosticProducts: 10, carryover: false, enabled: false,
  requires: 'Dois pilotos pagos independentes, contribuição medida e necessidade repetida confirmada.' });
export function displayMoney(cents: number, currency = 'brl') { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100); }
