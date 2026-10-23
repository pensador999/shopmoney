/** Immutable commercial hypotheses. Existing orders retain their own snapshot. */
export const offerVersion = 'br-2026-10-19.1';
export type OperationalStage = 'intake' | 'plan' | 'production' | 'quality' | 'delivery' | 'adjustments';
export const offers = {
  diagnostic: { name: 'Diagnóstico de catálogo', shortName: 'Diagnóstico R$ 190', summary: 'Até 10 produtos · 2 dias úteis', cents: 19000, maxProducts: 10, maxVariants: 200, days: 2, maxHours: 1.9, version: offerVersion, enabled: true,
    stageHoursBudget: { intake: 0.25, plan: 0.25, production: 0.5, quality: 0.25, delivery: 0.25, adjustments: 0 } },
  content: { name: 'Conteúdo de produto', shortName: 'Conteúdo R$ 490', summary: 'Até 10 produtos · 3 dias úteis', cents: 49000, maxProducts: 10, maxVariants: 200, days: 3, maxHours: 4.9, version: offerVersion, enabled: true,
    stageHoursBudget: { intake: 0.5, plan: 0.5, production: 1.5, quality: 0.75, delivery: 0.25, adjustments: 0.5 } },
  catalog: { name: 'Preparação de cadastro', shortName: 'Cadastro R$ 690', summary: 'Até 20 produtos / 200 variantes · 3 dias úteis', cents: 69000, maxProducts: 20, maxVariants: 200, days: 3, maxHours: 6.9, version: offerVersion, enabled: true,
    stageHoursBudget: { intake: 0.75, plan: 1.0, production: 1.75, quality: 1.0, delivery: 0.5, adjustments: 0.5 } },
  combined: { name: 'Lançamento combinado', shortName: 'Combinado R$ 990', summary: '20 cadastros + 10 conteúdos · 3 dias úteis', cents: 99000, maxProducts: 20, maxVariants: 200, days: 3, maxHours: 9.9, version: offerVersion, enabled: true,
    stageHoursBudget: { intake: 1.0, plan: 1.25, production: 3.0, quality: 1.5, delivery: 0.5, adjustments: 0.75 } },
  images: { name: 'Padronização de imagens', shortName: 'Imagens R$ 290', summary: 'Até 10 produtos · 3 dias úteis', cents: 29000, maxProducts: 10, maxVariants: 200, days: 3, maxHours: 2.9, version: offerVersion, enabled: true,
    stageHoursBudget: { intake: 0.25, plan: 0.25, production: 1.0, quality: 0.5, delivery: 0.25, adjustments: 0.25 } },
} as const;
export type ServiceKind = keyof typeof offers;
export type OfferSnapshot = ReturnType<typeof offerSnapshot>;
export function offerSnapshot(kind: ServiceKind) {
  if (!Object.hasOwn(offers, kind)) throw Error('Serviço desconhecido.');
  const offer = offers[kind];
  if (!offer.enabled) throw Error('Serviço aguardando validação técnica; venda bloqueada.');
  const maxHoursCeiling = Math.round(((offer.cents / 100) * (1 - 0.4) / 60) * 100) / 100;
  return { ...offer, kind, version: offerVersion, currency: 'brl', locale: 'pt-BR', laborRate: 60, targetContribution: 0.4,
    maxHoursCeiling, maxContentProducts: 10, suppliers: 1, adjustmentDays: 7, adjustments: 1, application: 'client', commercialEnabled: false } as const;
}
export const recurringOffer = Object.freeze({ cents: 149000, currency: 'brl', catalogLots: 2, diagnosticProducts: 10, carryover: false, enabled: false,
  requires: 'Dois pilotos pagos independentes, contribuição medida e necessidade repetida confirmada.' });
export function displayMoney(cents: number, currency = 'brl') { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100); }
