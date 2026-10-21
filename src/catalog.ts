import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { policy, assert } from './policy.ts';

export const mappingSchema = z.object({
  supplierKey: z.string().min(1).max(100).default('supplier-1'),
  namespace: z.string().optional(),
  csvDelimiter: z.enum([',',';']).optional(),
  priceDecimalSeparator: z.enum(['.',',']).optional(),
  productId: z.string().min(1), title: z.string().min(1), sku: z.string().min(1), price: z.string().min(1),
  barcode: z.string().optional(), vendor: z.string().optional(), description: z.string().optional(),
  options: z.array(z.object({ name: z.string().min(1), column: z.string().min(1) })).max(3).default([]),
  imageUrl: z.string().optional(),
}).strict();
export type Mapping = z.infer<typeof mappingSchema>;
export type Row = Record<string, string>;
export type Issue = { row: number; code: string; message: string };
export const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const productHandle = (id: string, mapping: Mapping) => `supplier-${hash(JSON.stringify([mapping.namespace ?? mapping.supplierKey ?? 'supplier-1', id])).slice(0, 24)}`;
export const csv = (rows: Row[], columns?: string[]) => stringify(rows, { header: true, columns, record_delimiter: '\r\n' });
export function normalizedPrice(value: string, mapping: Mapping) {
  const raw = value.replace(/^\u0000NUMBER:/, '');
  return mapping.priceDecimalSeparator === ',' ? raw.replace(',', '.') : raw;
}
const html = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const HEADERS = ['Title', 'URL handle', 'Description', 'Vendor', 'Published on online store', 'Status', 'SKU', 'Barcodes', 'Option1 name', 'Option1 value', 'Option2 name', 'Option2 value', 'Option3 name', 'Option3 value', 'Price'];

export async function readTable(buffer: Buffer, extension: string, maxRows = 500, delimiter: ',' | ';' = ','): Promise<Row[]> {
  assert(buffer.length <= policy.maxBytes, 'Arquivo excede 5 MB.');
  if (extension === '.csv') {
    assert(!buffer.includes(0), 'CSV contém bytes nulos; use UTF-8.');
    const matrix = parse(buffer.toString('utf8'), { bom: true, delimiter, skip_empty_lines: true, max_record_size: 100_000 }) as string[][];
    assert(matrix.length > 1, 'CSV vazio.');
    const headers = matrix.shift()!;
    assert(headers.length <= 100 && headers.every(Boolean) && new Set(headers).size === headers.length, 'Cabeçalhos vazios, duplicados ou mais de 100 colunas.');
    assert(matrix.length <= maxRows, `Mais de ${maxRows} linhas de entrada.`);
    return matrix.map(values => Object.fromEntries(headers.map((header, i) => [header, values[i]])));
  }
  assert(extension === '.xlsx', 'Use CSV UTF-8 ou XLSX.');
  // Check decompressed size before handing a workbook to the XML parser.
  const { default: AdmZip } = await import('adm-zip');
  const entries = new AdmZip(buffer).getEntries();
  assert(entries.reduce((n, e) => n + e.header.size, 0) < 25_000_000, 'XLSX descompactado excede o limite.');
  assert(!entries.some(e => /vbaProject|externalLinks/i.test(e.entryName)), 'Macros ou referências externas não são aceitas.');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  assert(workbook.worksheets.length === 1, 'Envie uma única planilha.');
  const sheet = workbook.worksheets[0];
  assert(sheet.rowCount > 1 && sheet.rowCount <= maxRows + 1 && sheet.columnCount <= 100, 'Planilha vazia ou fora do limite.');
  const values: string[][] = [];
  sheet.eachRow(row => {
    const cells: string[] = [];
    for (let i = 1; i <= sheet.columnCount; i++) {
      const cell = row.getCell(i);
      assert(!cell.formula && !(typeof cell.value === 'object' && cell.value !== null), `Célula ${cell.address}: use texto ou número literal, sem fórmulas/links.`);
      assert(typeof cell.value !== 'string' || !cell.value.includes('\u0000'), 'Texto com byte nulo não aceito.');
      // Numeric identifiers can already have lost their leading zeros; require text.
      cells.push(cell.value === null ? '' : typeof cell.value === 'number' ? `\u0000NUMBER:${cell.value}` : String(cell.value));
    }
    values.push(cells);
  });
  const headers = values.shift()!;
  assert(headers.every(Boolean) && new Set(headers).size === headers.length, 'Cabeçalhos inválidos.');
  return values.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])));
}

export function inspect(rows: Row[], input: Mapping) {
  const mapping = mappingSchema.parse(input);
  const issues: Issue[] = [];
  const issue = (row: number, code: string, message: string) => issues.push({ row: row + 2, code, message });
  const required = [mapping.productId, mapping.title, mapping.sku, mapping.price, ...mapping.options.map(o => o.column), mapping.barcode, mapping.vendor, mapping.description, mapping.imageUrl].filter(Boolean) as string[];
  if (!rows.length || rows.length > 500) issue(0, 'SCOPE', 'Envie entre 1 e 500 variantes.');
  for (const col of required) if (!rows[0] || !Object.hasOwn(rows[0], col)) issue(0, 'COLUMN', `Coluna ausente: ${col}`);
  const skus = new Set<string>(), products = new Map<string, Row[]>(), options = new Set<string>();
  rows.forEach((r, i) => {
    for (const col of [mapping.productId, mapping.title, mapping.sku, mapping.price, ...mapping.options.map(o => o.column)]) {
      if (!r[col]?.trim()) issue(i, 'REQUIRED', `Valor obrigatório: ${col}`);
    }
    for (const [col, value] of Object.entries(r)) {
      if (value.length > 20_000) issue(i, 'LENGTH', `Texto excessivo em ${col}`);
      if (/^[\s]*[=+@-]/.test(value) || /[\u0001-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) issue(i, 'UNSAFE', `Conteúdo inseguro para planilha em ${col}`);
    }
    for (const col of [mapping.productId, mapping.sku, mapping.barcode].filter(Boolean) as string[]) {
      if (r[col]?.startsWith('\u0000NUMBER:')) issue(i, 'IDENTIFIER_AS_NUMBER', `${col}: envie identificador como texto para preservar zeros.`);
      if (r[col] && r[col] !== r[col].trim()) issue(i, 'IDENTIFIER_WHITESPACE', `${col}: confirme os espaços do identificador.`);
    }
    const price = normalizedPrice(r[mapping.price] ?? '', mapping);
    if (mapping.priceDecimalSeparator === ',' && !r[mapping.price]?.startsWith('\u0000NUMBER:') && r[mapping.price]?.includes('.')) issue(i, 'PRICE', 'Perfil exige vírgula decimal, sem separador de milhar.');
    if (!/^\d+(\.\d{1,2})?$/.test(price)) issue(i, 'PRICE', `Preço deve usar ${mapping.priceDecimalSeparator === ',' ? 'vírgula' : 'ponto'} decimal, sem símbolo ou separador de milhar.`);
    if (mapping.barcode && r[mapping.barcode] && !/^\d+$/.test(r[mapping.barcode])) issue(i, 'BARCODE', 'Este piloto aceita um código de barras numérico por variante.');
    const sku = r[mapping.sku];
    if (skus.has(sku)) issue(i, 'DUPLICATE_SKU', `SKU repetido: ${sku}`);
    skus.add(sku);
    const id = r[mapping.productId];
    const siblings = products.get(id) ?? [];
    if (siblings.length && [mapping.title, mapping.vendor, mapping.description].filter(Boolean).some(col => siblings[0][col!] !== r[col!])) issue(i, 'PRODUCT_CONFLICT', 'Título, fornecedor ou descrição divergem dentro do mesmo produto.');
    siblings.push(r); products.set(id, siblings);
    const key = JSON.stringify([id, ...mapping.options.map(o => r[o.column])]);
    if (options.has(key)) issue(i, 'DUPLICATE_VARIANT', 'Combinação de opções repetida ou produto sem opções definidas.');
    options.add(key);
  });
  if (products.size > 50) issue(0, 'SCOPE', 'Mais de 50 produtos.');
  if (new Set(mapping.options.map(o => o.name)).size !== mapping.options.length) issue(0, 'OPTIONS', 'Nomes das opções duplicados.');
  return { ok: !issues.length, issues, productCount: products.size, variantCount: rows.length };
}

export function transform(rows: Row[], mapping: Mapping): Row[] {
  const result = inspect(rows, mapping);
  assert(result.ok, JSON.stringify(result.issues));
  const seen = new Set<string>();
  // Group variants, including non-contiguous supplier rows. Handles derive from exact IDs.
  const grouped = [...new Set(rows.map(r => r[mapping.productId]))].flatMap(id => rows.filter(r => r[mapping.productId] === id));
  return grouped.map(r => {
    const id = r[mapping.productId], first = !seen.has(id); seen.add(id);
    const out: Row = Object.fromEntries(HEADERS.map(h => [h, '']));
    out['URL handle'] = productHandle(id, mapping);
    out.Title = first ? r[mapping.title] : '';
    out.Description = first && mapping.description ? html(r[mapping.description]) : '';
    out.Vendor = first && mapping.vendor ? r[mapping.vendor] : '';
    out['Published on online store'] = first ? 'false' : '';
    out.Status = first ? 'draft' : '';
    out.SKU = r[mapping.sku]; out.Barcodes = mapping.barcode ? r[mapping.barcode] : '';
    out.Price = normalizedPrice(r[mapping.price], mapping);
    if (!mapping.options.length) { out['Option1 name'] = 'Title'; out['Option1 value'] = 'Default Title'; }
    mapping.options.forEach((o, i) => { out[`Option${i + 1} name`] = o.name; out[`Option${i + 1} value`] = r[o.column]; });
    return out;
  });
}

// Independent evidence comparison: never trust the producer's success flag.
export function qualityCheck(source: Row[], output: Row[], m: Mapping): Issue[] {
  const issues: Issue[] = [];
  const add = (row: number, message: string) => issues.push({ row: row + 2, code: 'QA', message });
  if (source.length !== output.length) add(0, 'Contagem de variantes alterada.');
  const lookup = new Map(source.map(r => [r[m.sku], r]));
  const seen = new Set<string>(), groups = new Map<string, string>();
  output.forEach((r, i) => {
    const original = lookup.get(r.SKU);
    if (!original || seen.has(r.SKU)) { add(i, 'SKU desconhecido ou repetido.'); return; }
    seen.add(r.SKU);
    if (r.Price !== normalizedPrice(original[m.price], m) || r.Barcodes !== (m.barcode ? original[m.barcode] : '')) add(i, 'Preço ou código de barras alterado.');
    const id = original[m.productId];
    if (r['URL handle'] !== productHandle(id, m)) add(i, 'Associação ao produto alterada.');
    if (!groups.has(id)) {
      if (r.Status !== 'draft' || r['Published on online store'] !== 'false' || r.Title !== original[m.title]) add(i, 'Produto não está em rascunho ou título diverge.');
      if (r.Description !== (m.description ? html(original[m.description]) : '') || r.Vendor !== (m.vendor ? original[m.vendor] : '')) add(i, 'Descrição ou fornecedor divergem.');
      groups.set(id, r['URL handle']);
    } else if (r.Status || r['Published on online store'] || r.Title || r.Description || r.Vendor) add(i, 'Metadados inesperados na variante.');
    for (let j = 0; j < 3; j++) {
      const o = m.options[j];
      const name = o?.name ?? (!m.options.length && j === 0 ? 'Title' : '');
      const value = o ? original[o.column] : (!m.options.length && j === 0 ? 'Default Title' : '');
      if (r[`Option${j + 1} name`] !== name || r[`Option${j + 1} value`] !== value) add(i, 'Opções alteradas.');
    }
    if (Object.keys(r).some(k => !HEADERS.includes(k))) add(i, 'Coluna não autorizada.');
  });
  if (seen.size !== source.length) add(0, 'Variantes ausentes.');
  return issues;
}
