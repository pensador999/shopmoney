export const policy = Object.freeze({
  version: 'br-2026-10-19.1', currency: 'brl', pilotCents: 69000,
  monthlyCents: 149000, maxProducts: 20, maxVariants: 200,
  maxBytes: 5_000_000, maxCorrections: 2, maxContactsPerDay: 5,
  laborRate: 60,
  rules: {
    scope: 'SCOPE-01', preserve: 'DATA-01', quality: 'QA-01',
    payment: 'PAY-01', isolation: 'TENANT-01', quota: 'AI-01',
    outreach: 'SALES-01', cancellation: 'CANCEL-01', delivery: 'DELIVERY-01',
  },
});
export function businessDays(from: Date, count: number) {
  const result = new Date(from);
  while (count > 0) { result.setUTCDate(result.getUTCDate() + 1); const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(result); if (!['Sat', 'Sun'].includes(day)) count--; }
  return result.toISOString();
}
export const localDay = (date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
