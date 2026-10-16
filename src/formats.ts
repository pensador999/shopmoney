import { readFileSync } from 'node:fs';
import { HEADERS } from './catalog.ts';

export function supportedFormats() {
  const load = (id: string) => JSON.parse(readFileSync(new URL(`../schemas/${id}.json`, import.meta.url),'utf8'));
  return [load('bling-59'),load('sankhya-45'),{
    id:'shopify-drafts',version:'2026-10-16',destination:'Shopify',headers:HEADERS,
    format:{encoding:'UTF-8',delimiter:',',newline:'CRLF',decimalSeparator:'.'},
    scope:'Novos produtos em rascunho; imagens e configuração fiscal/estoque fora desta saída.',
    documentation:'https://help.shopify.com/en/manual/products/import-export/using-csv',
    requiresTestStoreImport:true,
  }];
}
