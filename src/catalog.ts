import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { policy, assert } from './policy.ts';

export const BLING_HEADERS = JSON.parse(readFileSync(new URL('../schemas/bling-59.json', import.meta.url), 'utf8')).headers as string[];

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

export function reconcileShopifyExport(generatedCsv: string | Buffer, exportedCsv: string | Buffer) {
  const genText = Buffer.isBuffer(generatedCsv) ? generatedCsv.toString('utf8') : generatedCsv;
  const expText = Buffer.isBuffer(exportedCsv) ? exportedCsv.toString('utf8') : exportedCsv;
  const genRows = parse(genText, { columns: true, bom: true, skip_empty_lines: true }) as Row[];
  const expRows = parse(expText, { columns: true, bom: true, skip_empty_lines: true }) as Row[];
  const issues: Issue[] = [];
  const add = (row: number, code: string, message: string) => issues.push({ row: row + 2, code, message });
  const getSku = (r: Row) => (r.SKU ?? r['Variant SKU'] ?? '').trim();
  const getHandle = (r: Row) => (r['URL handle'] ?? r.Handle ?? '').trim();
  const getPrice = (r: Row) => (r.Price ?? r['Variant Price'] ?? '').trim();
  const getBarcode = (r: Row) => (r.Barcodes ?? r['Variant Barcode'] ?? '').trim().replace(/^'/, '');
  const getStatus = (r: Row) => (r.Status ?? '').trim().toLowerCase();
  const expBySku = new Map<string, { row: Row; index: number }>();
  for (let i = 0; i < expRows.length; i++) {
    const sku = getSku(expRows[i]);
    if (!sku) continue;
    if (expBySku.has(sku)) add(i, 'DUPLICATE_EXPORT_SKU', `SKU duplicado na exportação da loja: ${sku}`);
    else expBySku.set(sku, { row: expRows[i], index: i });
  }
  const handles = new Set<string>();
  let matchedSkus = 0;
  genRows.forEach((gen, i) => {
    const sku = getSku(gen);
    const handle = getHandle(gen);
    if (handle) handles.add(handle);
    const found = expBySku.get(sku);
    if (!found) {
      add(i, 'MISSING_SKU', `SKU gerado não encontrado na exportação pós-importação: ${sku}`);
      return;
    }
    matchedSkus++;
    const exp = found.row;
    if (getHandle(exp) !== handle) add(i, 'HANDLE_MISMATCH', `Handle divergente para o SKU ${sku}: esperado ${handle}, exportado ${getHandle(exp)}`);
    const pGen = Number(getPrice(gen)), pExp = Number(getPrice(exp));
    if (!Number.isFinite(pGen) || !Number.isFinite(pExp) || Math.round(pGen * 100) !== Math.round(pExp * 100)) {
      add(i, 'PRICE_MISMATCH', `Preço divergente para o SKU ${sku}: esperado ${getPrice(gen)}, exportado ${getPrice(exp)}`);
    }
    if (getBarcode(gen) !== getBarcode(exp)) {
      add(i, 'BARCODE_MISMATCH', `Código de barras/zeros à esquerda divergentes para o SKU ${sku}: esperado ${getBarcode(gen)}, exportado ${getBarcode(exp)}`);
    }
    if (gen.Status && getStatus(exp) && getStatus(exp) !== gen.Status.toLowerCase()) {
      add(i, 'UNEXPECTED_STATUS', `Status divergente para o SKU ${sku}: esperado ${gen.Status}, exportado ${getStatus(exp)}`);
    }
    for (let opt = 1; opt <= 3; opt++) {
      const expectedVal = (gen[`Option${opt} value`] ?? '').trim();
      const exportedVal = (exp[`Option${opt} value`] ?? exp[`Option${opt} Value`] ?? '').trim();
      if (expectedVal !== exportedVal) {
        add(i, 'OPTION_MISMATCH', `Opção ${opt} divergente para o SKU ${sku}: esperado "${expectedVal}", exportado "${exportedVal}"`);
      }
    }
  });
  const evidenceHash = hash(JSON.stringify({
    generatedSha256: hash(genText),
    exportedSha256: hash(expText),
    productCount: handles.size,
    variantCount: genRows.length,
    matchedSkus,
    issueCount: issues.length,
  }));
  return {
    ok: issues.length === 0 && genRows.length > 0 && matchedSkus === genRows.length,
    productCount: handles.size,
    variantCount: genRows.length,
    matchedSkus,
    issues,
    evidenceHash,
  };
}

export type SampleReason =
  | 'largest_variant_grid'
  | 'leading_zero_identifiers'
  | 'long_or_special_text'
  | 'decimal_or_formatted_price'
  | 'simple_or_edge_product'
  | 'supplier_profile_inheritance'
  | 'batch_coverage';

export function selectHardCaseSample(
  rows: Row[],
  inputMapping: Mapping,
  profile?: { id: string; version: string },
  maxParents = 5
) {
  const mapping = mappingSchema.parse(inputMapping);
  assert(rows.length > 0, 'Lote vazio para seleção de amostra.');
  const parentOrder = [...new Set(rows.map(r => r[mapping.productId]))];
  const clampedMax = Math.max(1, Math.min(maxParents, 10));
  const targetCount = Math.min(clampedMax, parentOrder.length);

  const groups = parentOrder.map((productId, index) => {
    const groupRows = rows.filter(r => r[mapping.productId] === productId);
    const idFields = [mapping.productId, mapping.sku, mapping.barcode].filter(Boolean) as string[];
    let leadingZeroHits = 0;
    for (const r of groupRows) {
      for (const col of idFields) {
        const val = (r[col] ?? '').trim();
        if (/^0\d+/.test(val)) leadingZeroHits++;
      }
    }
    const first = groupRows[0]!;
    const titleText = first[mapping.title] ?? '';
    const descText = mapping.description ? first[mapping.description] ?? '' : '';
    const combinedText = `${titleText} ${descText}`;
    const hasSpecialChars = /[&<>"']/.test(combinedText) || /[^\x20-\x7E]/.test(combinedText);
    const textScore = combinedText.length + (hasSpecialChars ? 50 : 0);

    const prices = groupRows.map(r => Number(normalizedPrice(r[mapping.price] ?? '0', mapping))).filter(Number.isFinite);
    const priceSpread = prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : 0;
    const hasDecimalCents = groupRows.some(r => {
      const p = normalizedPrice(r[mapping.price] ?? '', mapping);
      return /\.\d*[1-9]/.test(p) || (r[mapping.price] ?? '').includes(',');
    });
    const isSimple = groupRows.length === 1 && (!mapping.options.length || mapping.options.every(o => !(first[o.column] ?? '').trim()));
    const distinctOptions = new Set(groupRows.map(r => JSON.stringify(mapping.options.map(o => r[o.column] ?? '')))).size;

    return {
      productId,
      index,
      rows: groupRows,
      variantCount: groupRows.length,
      distinctOptions,
      leadingZeroHits,
      textScore,
      hasSpecialChars,
      priceSpread,
      hasDecimalCents,
      isSimple,
    };
  });

  const selectedMap = new Map<string, Set<SampleReason>>();
  const addSelection = (productId: string, reason: SampleReason) => {
    const set = selectedMap.get(productId) ?? new Set<SampleReason>();
    set.add(reason);
    if (profile) set.add('supplier_profile_inheritance');
    selectedMap.set(productId, set);
  };

  // 1. Maior grade de variantes
  const byGrid = [...groups].sort((a, b) => b.variantCount - a.variantCount || b.distinctOptions - a.distinctOptions || a.index - b.index);
  if (byGrid[0] && selectedMap.size < targetCount) {
    addSelection(byGrid[0].productId, 'largest_variant_grid');
  }

  // 2. Identificadores com zeros à esquerda
  const byLeadingZero = [...groups]
    .filter(g => g.leadingZeroHits > 0)
    .sort((a, b) => b.leadingZeroHits - a.leadingZeroHits || b.variantCount - a.variantCount || a.index - b.index);
  if (byLeadingZero.length) {
    const pick = byLeadingZero.find(g => !selectedMap.has(g.productId)) ?? byLeadingZero[0]!;
    if (selectedMap.has(pick.productId) || selectedMap.size < targetCount) {
      addSelection(pick.productId, 'leading_zero_identifiers');
    }
  }

  // 3. Títulos/descrições longos ou com caracteres especiais
  const byText = [...groups]
    .filter(g => g.textScore > 0)
    .sort((a, b) => b.textScore - a.textScore || a.index - b.index);
  if (byText.length) {
    const pick = byText.find(g => !selectedMap.has(g.productId)) ?? byText[0]!;
    if (selectedMap.has(pick.productId) || selectedMap.size < targetCount) {
      addSelection(pick.productId, 'long_or_special_text');
    }
  }

  // 4. Preços decimais / variação de preço entre variantes
  const byPrice = [...groups]
    .filter(g => g.hasDecimalCents || g.priceSpread > 0)
    .sort((a, b) => b.priceSpread - a.priceSpread || Number(b.hasDecimalCents) - Number(a.hasDecimalCents) || a.index - b.index);
  if (byPrice.length) {
    const pick = byPrice.find(g => !selectedMap.has(g.productId)) ?? byPrice[0]!;
    if (selectedMap.has(pick.productId) || selectedMap.size < targetCount) {
      addSelection(pick.productId, 'decimal_or_formatted_price');
    }
  }

  // 5. Produto simples sem opções ou menor grade
  const bySimple = [...groups].sort((a, b) => Number(b.isSimple) - Number(a.isSimple) || a.variantCount - b.variantCount || a.index - b.index);
  if (bySimple.length) {
    const pick = bySimple.find(g => !selectedMap.has(g.productId)) ?? bySimple[0]!;
    if (selectedMap.has(pick.productId) || selectedMap.size < targetCount) {
      addSelection(pick.productId, 'simple_or_edge_product');
    }
  }

  // Garante preenchimento até targetCount (ex.: mínimo de 3 pais quando o lote possui >= 3 pais)
  for (const g of byGrid) {
    if (selectedMap.size >= targetCount) break;
    if (!selectedMap.has(g.productId)) {
      addSelection(g.productId, 'batch_coverage');
    }
  }

  // Anota também critérios adicionais cumpridos pelos pais selecionados
  for (const g of groups) {
    const reasons = selectedMap.get(g.productId);
    if (!reasons) continue;
    if (g.leadingZeroHits > 0) reasons.add('leading_zero_identifiers');
    if (g.hasDecimalCents || g.priceSpread > 0) reasons.add('decimal_or_formatted_price');
    if (g.isSimple || g.variantCount === 1) reasons.add('simple_or_edge_product');
    if (g.hasSpecialChars || g.textScore >= 60) reasons.add('long_or_special_text');
  }

  const selectedGroups = groups.filter(g => selectedMap.has(g.productId));
  const sampleRows = selectedGroups.flatMap(g => g.rows);
  const sampleOutput = transform(sampleRows, mapping);
  const sampleCsv = csv(sampleOutput, HEADERS);

  return {
    sampleCsv,
    sampleRows,
    sampleOutput,
    sampleReport: {
      targetMinParents: Math.min(3, parentOrder.length),
      maxParents: clampedMax,
      totalParents: parentOrder.length,
      selectedParentCount: selectedGroups.length,
      selectedVariantCount: sampleOutput.length,
      selectedParents: selectedGroups.map(g => ({
        productId: g.productId,
        handle: productHandle(g.productId, mapping),
        variantCount: g.variantCount,
        reasons: [...(selectedMap.get(g.productId) ?? [])],
      })),
      profileUsed: profile ? { id: profile.id, version: profile.version } : null,
      sampleSha256: hash(sampleCsv),
    },
  };
}

export interface BlingEditorialEnrichment {
  title?: string;
  html?: string;
  shortDescription?: string;
  category?: string;
  brand?: string;
}

export function buildBlingValidationCsv(
  rows: Row[],
  inputMapping: Mapping,
  options: {
    editorialByProductId?: Map<string, BlingEditorialEnrichment>;
    stockColumn?: string;
    categoryColumn?: string;
  } = {}
): string {
  const mapping = mappingSchema.parse(inputMapping);
  const result = inspect(rows, mapping);
  assert(result.ok, JSON.stringify(result.issues));

  const parentIds = [...new Set(rows.map(r => r[mapping.productId]))];
  const blingRows: Row[] = [];
  const emptyBlingRow = (): Row => Object.fromEntries(BLING_HEADERS.map(h => [h, '']));

  for (const productId of parentIds) {
    const groupRows = rows.filter(r => r[mapping.productId] === productId);
    const first = groupRows[0]!;
    const ed = options.editorialByProductId?.get(productId);
    const title = (ed?.title ?? first[mapping.title] ?? productId).trim();
    const rawDesc = mapping.description ? (first[mapping.description] ?? '').trim() : '';
    const htmlDesc = ed?.html ?? (rawDesc ? html(rawDesc) : '');
    const shortDesc = (ed?.shortDescription ?? rawDesc.replace(/\s+/g, ' ').trim() ?? title)
      .trim()
      .slice(0, 250);
    const brand = ed?.brand ?? (mapping.vendor ? (first[mapping.vendor] ?? '').trim() : '');
    const category = ed?.category ?? (options.categoryColumn ? (first[options.categoryColumn] ?? '').trim() : '');
    const imageUrl = mapping.imageUrl ? (first[mapping.imageUrl] ?? '').trim() : '';

    const isSimple =
      groupRows.length === 1 &&
      (!mapping.options.length || mapping.options.every(o => !(first[o.column] ?? '').trim()));

    if (isSimple) {
      const row = emptyBlingRow();
      row['Código'] = first[mapping.sku];
      row['Descrição'] = title;
      row['Unidade'] = 'UN';
      row['Preço'] = normalizedPrice(first[mapping.price], mapping).replace('.', ',');
      row['Situação'] = 'Ativo';
      row['Estoque'] = options.stockColumn ? (first[options.stockColumn] ?? '').trim() : '';
      row['GTIN/EAN'] = mapping.barcode ? (first[mapping.barcode] ?? '').trim() : '';
      row['Descrição Complementar'] = htmlDesc;
      row['Produto Variação'] = 'Produto';
      row['Código Pai'] = '';
      row['Marca'] = brand;
      row['Descrição Curta'] = shortDesc;
      row['URL Imagens Externas'] = imageUrl;
      row['Categoria do produto'] = category;
      blingRows.push(row);
    } else {
      const parentRow = emptyBlingRow();
      parentRow['Código'] = productId;
      parentRow['Descrição'] = title;
      parentRow['Unidade'] = 'UN';
      parentRow['Situação'] = 'Ativo';
      parentRow['Descrição Complementar'] = htmlDesc;
      parentRow['Produto Variação'] = 'Produto';
      parentRow['Código Pai'] = '';
      parentRow['Marca'] = brand;
      parentRow['Descrição Curta'] = shortDesc;
      parentRow['URL Imagens Externas'] = imageUrl;
      parentRow['Categoria do produto'] = category;
      blingRows.push(parentRow);

      for (const r of groupRows) {
        const optParts = mapping.options.map(o => `${o.name}: ${(r[o.column] ?? '').trim()}`).filter(s => !s.endsWith(': '));
        const varRow = emptyBlingRow();
        varRow['Código'] = r[mapping.sku];
        varRow['Descrição'] = optParts.length ? optParts.join('; ') : title;
        varRow['Unidade'] = 'UN';
        varRow['Preço'] = normalizedPrice(r[mapping.price], mapping).replace('.', ',');
        varRow['Situação'] = 'Ativo';
        varRow['Estoque'] = options.stockColumn ? (r[options.stockColumn] ?? '').trim() : '';
        varRow['GTIN/EAN'] = mapping.barcode ? (r[mapping.barcode] ?? '').trim() : '';
        varRow['Descrição Complementar'] = htmlDesc;
        varRow['Produto Variação'] = 'Variação';
        varRow['Código Pai'] = productId;
        varRow['Marca'] = brand;
        varRow['Descrição Curta'] = shortDesc;
        varRow['URL Imagens Externas'] = mapping.imageUrl ? (r[mapping.imageUrl] ?? imageUrl).trim() : '';
        varRow['Categoria do produto'] = category;
        blingRows.push(varRow);
      }
    }
  }

  for (const row of blingRows) {
    for (const value of Object.values(row)) {
      assert(!/^[\s\u0000-\u001f]*[=+@-]/u.test(value), 'CSV Bling contém célula com possível fórmula.');
    }
  }

  return stringify(blingRows, { header: true, columns: BLING_HEADERS, delimiter: ';', bom: true, record_delimiter: '\r\n' });
}

