import { z } from 'zod';
import { mappingSchema, inspect, type Row } from './catalog.ts';
import { assert } from './policy.ts';

// Explicit customer-approved layout. No BRK tax, stock or SKU-generation defaults.
export const supplierProfileSchema = z.object({
  id: z.string().min(1), version: z.string().min(1),
  mapping: mappingSchema,
  rowType: z.string().min(1), parentValue: z.string().min(1), variantValue: z.string().min(1),
  parentId: z.string().min(1), variantParentId: z.string().min(1),
  parentFields: z.array(z.string().min(1)).default([]),
  expectedHeaders: z.array(z.string().min(1)).optional(),
  parentFieldMappings: z.array(z.object({ source: z.string().min(1), target: z.string().min(1) }).strict()).optional(),
}).strict();
export type SupplierProfile = z.infer<typeof supplierProfileSchema>;

export function adaptSupplier(rows: Row[], rawProfile: SupplierProfile) {
  const profile = supplierProfileSchema.parse(rawProfile);
  assert(profile.parentValue !== profile.variantValue, 'Tipos de linha precisam ser distintos.');
  const mapping = profile.mapping;
  if (profile.expectedHeaders) assert(JSON.stringify(Object.keys(rows[0] ?? {})) === JSON.stringify(profile.expectedHeaders), 'Cabeçalhos ou ordem divergem do molde aprovado.');
  const allowed = [mapping.title, mapping.vendor, mapping.description];
  assert(profile.parentFields.every(f => allowed.includes(f)), 'Só título, marca e descrição podem vir do pai.');
  assert((profile.parentFieldMappings ?? []).every(f => allowed.includes(f.target)), 'Herança mapeada limitada a título, marca e descrição.');
  const parents = new Map<string, Row>();
  const children: { row: Row; index: number }[] = [];
  rows.forEach((row, index) => {
    assert(Object.values(row).every(v => typeof v === 'string'), 'Campos devem ser texto.');
    const kind = row[profile.rowType];
    if (kind === profile.parentValue) {
      const id = row[profile.parentId];
      assert(id && id.trim() === id && !parents.has(id), `Pai ausente, ambíguo ou duplicado na linha ${index + 2}.`);
      parents.set(id, row);
    } else {
      assert(kind === profile.variantValue, `Tipo de linha desconhecido na linha ${index + 2}.`);
      children.push({ row, index });
    }
  });
  const used = new Set<string>();
  const lineage: { sourceRow: number; parentId: string; sku: string; inherited: string[] }[] = [];
  const output = children.map(({ row, index }) => {
    const parentId = row[profile.variantParentId], parent = parents.get(parentId);
    assert(parent, `Variante órfã na linha ${index + 2}.`);
    assert(!row[mapping.productId] || row[mapping.productId] === parentId, 'Identidade de produto conflitante.');
    used.add(parentId);
    const result = { ...row, [mapping.productId]: parentId };
    const inherited: string[] = [];
    for (const field of profile.parentFieldMappings ?? []) {
      assert(!result[field.target] || result[field.target] === parent[field.source], 'Herança conflita com valor informado na variante.');
      assert(Object.hasOwn(parent, field.source), 'Coluna de origem da herança ausente.');
      result[field.target] = parent[field.source]; inherited.push(`${field.source} -> ${field.target}`);
    }
    for (const field of profile.parentFields) if (!result[field] && parent[field]) {
      result[field] = parent[field]; inherited.push(field);
    }
    lineage.push({ sourceRow: index + 2, parentId, sku: result[mapping.sku], inherited });
    return result;
  });
  assert(used.size === parents.size, 'Há produto pai sem variante; revise a entrada.');
  const report = inspect(output, mapping);
  assert(report.ok, `Catálogo adaptado inválido: ${JSON.stringify(report.issues)}`);
  return { rows: output, mapping, report, lineage, profile: { id: profile.id, version: profile.version } };
}
