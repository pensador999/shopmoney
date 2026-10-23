import { z } from 'zod';
import { csv, hash, type Issue, type Row } from './catalog.ts';
import { suggestMediaView } from './content-studio/contracts.ts';
import { publicOrigin } from './inspection/snapshot.ts';
import { assert } from './policy.ts';

export const MEDIA_VIEW_ORDER: Record<'front' | 'back' | 'detail' | 'context', number> = {
  front: 0,
  back: 1,
  detail: 2,
  context: 3,
};

export const MEDIA_SHOPIFY_HEADERS = [
  'URL handle',
  'Title',
  'Image Src',
  'Image Position',
  'Image Alt Text',
  'Variant SKU',
  'Canonical Filename',
];

export const mediaItemSchema = z.object({
  id: z.string().trim().min(1).max(100),
  url: z.string().trim().min(1).max(2000),
  source: z.string().trim().min(1).max(1000),
  authorized: z.boolean(),
  view: z.enum(['front', 'back', 'detail', 'context']).optional(),
  viewConfirmed: z.boolean().default(true),
  color: z.string().trim().max(100).default(''),
  variantSkus: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  alt: z.string().trim().max(300).default(''),
  generativeEdit: z.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
}).strict();

export const mediaVariantSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  sku: z.string().trim().min(1).max(100),
  color: z.string().trim().max(100).default(''),
  size: z.string().trim().max(100).default(''),
}).strict();

export const mediaProductSchema = z.object({
  id: z.string().trim().min(1).max(100),
  handle: z.string().trim().max(120).optional(),
  title: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(1000).default('Ficha de mídia aprovada'),
  variants: z.array(mediaVariantSchema).max(200).default([]),
  media: z.array(mediaItemSchema).min(1).max(20),
}).strict();

export const mediaBatchSchema = z.object({
  brand: z.object({
    name: z.string().trim().min(1).max(120).default('Marca Shopify'),
    version: z.string().trim().min(1).max(64).default('media-1'),
    materialAuthorization: z.boolean(),
    mediaHosts: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  }).strict(),
  products: z.array(mediaProductSchema).min(1).max(10),
}).strict();

export type MediaBatchInput = z.infer<typeof mediaBatchSchema>;

function slugSegment(value: string, fallback = 'item'): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 48) || fallback;
}

function inferExtension(url: string): string {
  try {
    const pathname = url.startsWith('/') ? url : new URL(url).pathname;
    const match = pathname.toLowerCase().match(/\.(jpg|jpeg|png|webp|svg|avif)$/);
    return match ? match[1]! : 'jpg';
  } catch {
    return 'jpg';
  }
}

function isUnsafeFormulaOrHtml(value: string): boolean {
  return /^[\s\u0000-\u001f]*[=+@-]/u.test(value) || /[<>]/.test(value);
}

const GENERATIVE_FORBIDDEN_RE = /\b(ia generativa|generative edit|alterar caimento|alterar tecido|trocar modelo por ia|inpainting de peca|mudar cor real)\b/i;

export function inspectMediaBatch(rawInput: unknown): Issue[] {
  const input = mediaBatchSchema.parse(rawInput);
  const issues: Issue[] = [];
  const add = (row: number, code: string, message: string) => issues.push({ row, code, message });

  if (!input.brand.materialAuthorization) {
    add(1, 'MATERIAL_AUTH_REQUIRED', 'Autorização explícita de uso de materiais da marca é obrigatória.');
  }
  if (input.products.length < 1 || input.products.length > 10) {
    add(1, 'PRODUCT_LIMIT', 'A oferta de padronização de imagens aceita entre 1 e 10 produtos por lote.');
  }
  const totalVariants = input.products.reduce((acc, p) => acc + p.variants.length, 0);
  if (totalVariants > 200) {
    add(1, 'VARIANT_LIMIT', `Lote excede o limite de 200 variantes da oferta (${totalVariants} variantes).`);
  }

  const allowedHosts = new Set<string>();
  for (const h of input.brand.mediaHosts) {
    try {
      const origin = publicOrigin(`https://${h}`);
      if (new URL(origin).hostname === h.toLowerCase()) allowedHosts.add(h.toLowerCase());
      else add(1, 'INVALID_MEDIA_HOST', `Host de mídia inválido na marca: ${h}`);
    } catch {
      add(1, 'INVALID_MEDIA_HOST', `Host de mídia não público ou inválido: ${h}`);
    }
  }

  const observedHosts = new Set<string>(allowedHosts);
  const seenProductIds = new Set<string>();
  const seenHandles = new Set<string>();

  input.products.forEach((product, pIdx) => {
    const rowNum = pIdx + 2;
    if (seenProductIds.has(product.id)) {
      add(rowNum, 'DUPLICATE_PRODUCT_ID', `ID de produto repetido no lote: ${product.id}`);
    }
    seenProductIds.add(product.id);

    const handle = slugSegment(product.handle || product.title || product.id, `produto-${pIdx + 1}`);
    if (seenHandles.has(handle)) {
      add(rowNum, 'DUPLICATE_HANDLE', `Handle canônico colide entre produtos: ${handle}`);
    }
    seenHandles.add(handle);

    if (isUnsafeFormulaOrHtml(product.title) || isUnsafeFormulaOrHtml(product.id)) {
      add(rowNum, 'UNSAFE_TEXT', `Título ou ID do produto ${product.id} contém HTML ou início de fórmula.`);
    }

    const variantBySku = new Map<string, z.infer<typeof mediaVariantSchema>>();
    const distinctColors = new Set<string>();
    for (const v of product.variants) {
      if (variantBySku.has(v.sku)) {
        add(rowNum, 'DUPLICATE_VARIANT_SKU', `SKU de variante repetido no produto ${product.id}: ${v.sku}`);
      }
      variantBySku.set(v.sku, v);
      if (v.color.trim()) distinctColors.add(v.color.trim());
    }

    const seenMediaIds = new Set<string>();
    const seenUrls = new Set<string>();

    product.media.forEach((m) => {
      if (seenMediaIds.has(m.id)) {
        add(rowNum, 'DUPLICATE_MEDIA_ID', `ID de mídia repetido (${m.id}) no produto ${product.id}.`);
      }
      seenMediaIds.add(m.id);

      if (seenUrls.has(m.url)) {
        add(rowNum, 'DUPLICATE_MEDIA_URL', `URL de imagem duplicada (${m.url}) no produto ${product.id}.`);
      }
      seenUrls.add(m.url);

      if (!m.authorized) {
        add(rowNum, 'MEDIA_UNAUTHORIZED', `Imagem ${m.id} (${product.id}) sem autorização explícita.`);
      }
      if (!m.viewConfirmed) {
        add(rowNum, 'MEDIA_VIEW_UNCONFIRMED', `Vista da imagem ${m.id} (${product.id}) aguarda confirmação.`);
      }
      if (m.generativeEdit || GENERATIVE_FORBIDDEN_RE.test(`${m.alt} ${m.notes ?? ''}`)) {
        add(rowNum, 'GENERATIVE_EDIT_FORBIDDEN', `Edição generativa de peça/caimento é proibida na imagem ${m.id} (${product.id}).`);
      }
      if (isUnsafeFormulaOrHtml(m.alt) || isUnsafeFormulaOrHtml(m.color) || isUnsafeFormulaOrHtml(m.id)) {
        add(rowNum, 'UNSAFE_TEXT', `Metadados da imagem ${m.id} (${product.id}) contêm HTML ou fórmula.`);
      }

      if (!/^\/studio-fixture-(sand|blue)\.svg$/.test(m.url)) {
        try {
          const parsedUrl = new URL(m.url);
          publicOrigin(parsedUrl.origin);
          if (parsedUrl.username || parsedUrl.password) {
            add(rowNum, 'INVALID_MEDIA_URL', `URL da imagem ${m.id} contém credenciais embutidas.`);
          }
          const host = parsedUrl.hostname.toLowerCase();
          if (allowedHosts.size > 0 && !allowedHosts.has(host)) {
            add(rowNum, 'UNAPPROVED_MEDIA_HOST', `Host ${host} da imagem ${m.id} não consta em brand.mediaHosts.`);
          }
          observedHosts.add(host);
          if (observedHosts.size > 10) {
            add(rowNum, 'MEDIA_HOST_LIMIT', 'Lote excede o limite de 10 domínios de mídia distintos.');
          }
        } catch {
          add(rowNum, 'INVALID_MEDIA_URL', `URL da imagem ${m.id} deve ser HTTPS pública verificada.`);
        }
      }

      const color = m.color.trim();
      if (color && distinctColors.size > 0 && !distinctColors.has(color)) {
        add(rowNum, 'UNKNOWN_VARIANT_COLOR', `Cor "${color}" da imagem ${m.id} não existe nas variantes de ${product.id}.`);
      }

      if (m.variantSkus.length > 0) {
        const skuColors = new Set<string>();
        for (const sku of m.variantSkus) {
          const found = variantBySku.get(sku);
          if (!found) {
            add(rowNum, 'UNKNOWN_VARIANT_SKU', `SKU "${sku}" vinculado à imagem ${m.id} não pertence ao produto ${product.id}.`);
          } else if (found.color.trim()) {
            skuColors.add(found.color.trim());
          }
        }
        if (skuColors.size > 1) {
          add(rowNum, 'VARIANT_COLOR_COLLISION', `Imagem ${m.id} (${product.id}) mistura variantes de cores distintas: ${[...skuColors].join(', ')}.`);
        }
        if (color && skuColors.size === 1 && !skuColors.has(color)) {
          add(rowNum, 'VARIANT_COLOR_COLLISION', `Cor "${color}" da imagem ${m.id} diverge da cor das variantes (${[...skuColors][0]}).`);
        }
      } else if (distinctColors.size > 1 && !color && (m.view ?? suggestMediaView(m.url)) !== 'context') {
        add(rowNum, 'AMBIGUOUS_COLOR_ASSIGNMENT', `Imagem ${m.id} de produto multicor (${product.id}) exige cor ou SKU de variante explícito.`);
      }
    });
  });

  return issues;
}

export interface StandardizedMediaItem {
  productId: string;
  handle: string;
  productTitle: string;
  mediaId: string;
  originalUrl: string;
  host: string;
  view: 'front' | 'back' | 'detail' | 'context';
  color: string;
  position: number;
  canonicalFilename: string;
  altText: string;
  variantSku: string;
  variantSkus: string[];
  source: string;
  authorized: true;
  generativeEdit: false;
  referenceSha256: string;
}

export function standardizeMediaBatch(rawInput: unknown) {
  const input = mediaBatchSchema.parse(rawInput);
  const issues = inspectMediaBatch(input);
  assert(issues.length === 0, `Falha na validação de mídia: ${JSON.stringify(issues)}`);

  const items: StandardizedMediaItem[] = [];
  const shopifyRows: Row[] = [];
  const hosts = new Set<string>();

  for (let pIdx = 0; pIdx < input.products.length; pIdx++) {
    const product = input.products[pIdx]!;
    const handle = slugSegment(product.handle || product.title || product.id, `produto-${pIdx + 1}`);
    const variantBySku = new Map(product.variants.map(v => [v.sku, v]));

    const colorOrder = new Map<string, number>();
    for (const v of product.variants) {
      const c = v.color.trim();
      if (c && !colorOrder.has(c)) colorOrder.set(c, colorOrder.size);
    }
    for (const m of product.media) {
      const c = m.color.trim();
      if (c && !colorOrder.has(c)) colorOrder.set(c, colorOrder.size);
    }

    const enriched = product.media.map((m, idx) => {
      const suggested = suggestMediaView(m.url);
      const resolvedView: 'front' | 'back' | 'detail' | 'context' =
        m.view ?? (suggested !== 'unknown' ? suggested : 'front');
      const inferredColor =
        m.color.trim() ||
        (m.variantSkus.length ? variantBySku.get(m.variantSkus[0]!)?.color.trim() ?? '' : '');
      return {
        m,
        idx,
        view: resolvedView,
        color: inferredColor,
        colorRank: inferredColor ? (colorOrder.get(inferredColor) ?? 999) : 998,
        viewRank: MEDIA_VIEW_ORDER[resolvedView],
      };
    });

    enriched.sort((a, b) => a.colorRank - b.colorRank || a.viewRank - b.viewRank || a.idx - b.idx);

    enriched.forEach((entry, posIdx) => {
      const position = posIdx + 1;
      const posPadded = String(position).padStart(2, '0');
      const ext = inferExtension(entry.m.url);
      const colorSlug = entry.color ? slugSegment(entry.color, 'cor') : '';
      const canonicalFilename = colorSlug
        ? `${handle}-${colorSlug}-${entry.view}-${posPadded}.${ext}`
        : `${handle}-${entry.view}-${posPadded}.${ext}`;
      const viewLabel: Record<'front' | 'back' | 'detail' | 'context', string> = {
        front: 'Frente',
        back: 'Costas',
        detail: 'Detalhe',
        context: 'Contexto',
      };
      const defaultAlt = [product.title, entry.color, viewLabel[entry.view]].filter(Boolean).join(' — ');
      const altText = (entry.m.alt.trim() || defaultAlt).slice(0, 300);
      const primarySku = entry.m.variantSkus[0] ?? (entry.color ? product.variants.find(v => v.color.trim() === entry.color)?.sku ?? '' : '');
      const host = entry.m.url.startsWith('/') ? 'local-fixture' : new URL(entry.m.url).hostname.toLowerCase();
      hosts.add(host);

      const stdItem: StandardizedMediaItem = {
        productId: product.id,
        handle,
        productTitle: product.title,
        mediaId: entry.m.id,
        originalUrl: entry.m.url,
        host,
        view: entry.view,
        color: entry.color,
        position,
        canonicalFilename,
        altText,
        variantSku: primarySku,
        variantSkus: entry.m.variantSkus,
        source: entry.m.source,
        authorized: true,
        generativeEdit: false,
        referenceSha256: hash(JSON.stringify([product.id, entry.m.id, entry.m.url, entry.view, entry.color, position])),
      };
      items.push(stdItem);

      shopifyRows.push({
        'URL handle': handle,
        Title: posIdx === 0 ? product.title : '',
        'Image Src': entry.m.url,
        'Image Position': String(position),
        'Image Alt Text': altText,
        'Variant SKU': primarySku,
        'Canonical Filename': canonicalFilename,
      });
    });
  }

  const shopifyCsv = csv(shopifyRows, MEDIA_SHOPIFY_HEADERS);
  const inputHash = hash(JSON.stringify(input));
  const outputHash = hash(shopifyCsv);

  const manifest = {
    version: 'media-standardization-1',
    brand: {
      name: input.brand.name,
      version: input.brand.version,
      materialAuthorization: input.brand.materialAuthorization,
      hosts: [...hosts],
    },
    productCount: input.products.length,
    imageCount: items.length,
    inputHash,
    outputHash,
    items,
    limits: [
      'Referências de mídia validadas e padronizadas; arquivos de imagem não são hospedados nem editados generativamente pela Catana Ops.',
      'Cliente realiza a importação na Shopify e detém a titularidade/autorização de uso das fotos.',
    ],
  };

  return {
    shopifyCsv,
    shopifyRows,
    manifest,
  };
}

export function checkMediaBatch(rawInput: unknown, standardized: ReturnType<typeof standardizeMediaBatch>): Issue[] {
  const issues = inspectMediaBatch(rawInput);
  const input = mediaBatchSchema.parse(rawInput);
  const add = (row: number, code: string, message: string) => issues.push({ row, code, message });

  const expectedCount = input.products.reduce((acc, p) => acc + p.media.length, 0);
  if (standardized.manifest.imageCount !== expectedCount || standardized.shopifyRows.length !== expectedCount) {
    add(1, 'QA_COUNT_MISMATCH', 'Contagem de imagens padronizadas diverge da entrada.');
  }

  const seenCanonical = new Set<string>();
  standardized.manifest.items.forEach((item, idx) => {
    const row = standardized.shopifyRows[idx];
    if (!row) {
      add(idx + 2, 'QA_ROW_MISSING', `Linha CSV ausente para a imagem ${item.mediaId}.`);
      return;
    }
    if (seenCanonical.has(item.canonicalFilename)) {
      add(idx + 2, 'QA_DUPLICATE_FILENAME', `Nome canônico duplicado: ${item.canonicalFilename}`);
    }
    seenCanonical.add(item.canonicalFilename);

    if (row['Image Src'] !== item.originalUrl || row['URL handle'] !== item.handle || row['Canonical Filename'] !== item.canonicalFilename) {
      add(idx + 2, 'QA_FIELD_MISMATCH', `Divergência entre manifesto e linha CSV na imagem ${item.mediaId}.`);
    }
    if (!item.authorized || item.generativeEdit) {
      add(idx + 2, 'QA_POLICY_BREACH', `Violação de política de autorização ou edição generativa na imagem ${item.mediaId}.`);
    }
    for (const val of Object.values(row)) {
      if (isUnsafeFormulaOrHtml(val)) {
        add(idx + 2, 'QA_UNSAFE_CELL', `Célula insegura detectada no CSV de imagens (${item.mediaId}).`);
      }
    }
  });

  return issues;
}
