import { extname } from 'node:path';
import { Store } from './store.ts';
import { readTable } from './catalog.ts';
import { inferSupplierMapping } from './learning.ts';

export interface AutopilotInput {
  filename?: string;
  dataBase64?: string;
  storeName?: string;
  email?: string;
  storeUrl?: string;
}

const defaultAutonomousCsv = [
  'Ref_Peca;Nome_Produto;Cod_Item;Vlr_Venda;Cod_Barras_EAN13;Grade_Cor;Grade_Tam;Saldo_Est;Categoria_Item;Marca_Fabricante;Descricao_Tecnica',
  'ALC-101;Camisa Linho Puro Respiravel;ALC-101-AR-P;249,90;7891234560011;Areia;P;12;Camisa;Atelier Linha Clara;100% linho puro certificada com corte reto e botoes de madreperola.',
  'ALC-101;Camisa Linho Puro Respiravel;ALC-101-AR-M;249,90;7891234560012;Areia;M;18;Camisa;Atelier Linha Clara;100% linho puro certificada com corte reto e botoes de madreperola.',
  'ALC-101;Camisa Linho Puro Respiravel;ALC-101-AZ-G;249,90;7891234560013;Azul Marinho;G;9;Camisa;Atelier Linha Clara;100% linho puro certificada com corte reto e botoes de madreperola.',
  'ALC-205;Calca Alfaiataria Sarja Premium;ALC-205-PR-M;289,90;7891234560021;Preto;M;14;Calca;Atelier Linha Clara;Sarja 98% algodao 2% elastano com bolso faca e cintura media.',
  'ALC-205;Calca Alfaiataria Sarja Premium;ALC-205-PR-G;289,90;7891234560022;Preto;G;0;Calca;Atelier Linha Clara;Sarja 98% algodao 2% elastano com bolso faca e cintura media.',
].join('\n');

export function detectCsvFormat(rawBuffer: Buffer | string, filename = 'catalogo.csv'): {
  delimiter: ',' | ';';
  priceDecimalSeparator: '.' | ',';
} {
  if (extname(filename).toLowerCase() === '.xlsx') {
    return { delimiter: ',', priceDecimalSeparator: '.' };
  }
  const sample = typeof rawBuffer === 'string' ? rawBuffer.slice(0, 4096) : rawBuffer.subarray(0, 4096).toString('utf8');
  const firstLine = sample.split(/\r?\n/)[0] ?? '';
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const delimiter: ',' | ';' = semicolons > commas ? ';' : ',';
  const hasCommaDecimal = delimiter === ';'
    ? /(?:^|;|\s)\d+,\d{1,2}(?:;|\r|\n|$)/.test(sample)
    : /"\s*\d+,\d{1,2}\s*"/.test(sample);
  const priceDecimalSeparator: '.' | ',' = hasCommaDecimal ? ',' : '.';
  return { delimiter, priceDecimalSeparator };
}

export async function runAgentAutopilot(store: Store, input: AutopilotInput = {}) {
  const filename = input.filename?.trim() || 'demonstracao.csv';
  const rawBuffer = input.dataBase64 ? Buffer.from(input.dataBase64, 'base64') : Buffer.from(defaultAutonomousCsv);
  const format = detectCsvFormat(rawBuffer, filename);
  const rows = await readTable(rawBuffer, extname(filename) === '.xlsx' ? '.xlsx' : '.csv', 550, format.delimiter);
  const headers = Object.keys(rows[0] ?? {});
  const inferred = inferSupplierMapping(store, '', headers);
  const name = input.storeName?.trim() || 'Catálogo em revisão';
  // Unknown contact remains unknown. No clients, approvals or money are invented.
  return {
    ok: true,
    mode: 'supervised-intake',
    status: 'needs_review',
    orderId: null,
    client: { name, email: input.email || null, storeUrl: input.storeUrl || null },
    autoDetected: { filename, ...format, mapping: inferred.mapping, mappingConfidence: inferred.confidence },
    rowCount: rows.length,
    requiresHumanReview: true,
    pending: ['Confirmar cliente e contato', 'Conferir mapeamento e escopo antes de criar o pedido'],
    economics: { contribution: null },
    steps: [
      {
        role: 'planner',
        agentLabel: 'Planejamento',
        status: 'needs_review',
        action: 'Colunas sugeridas. Confirme os vínculos no formulário; nenhuma produção ou aprovação foi executada.',
        autoFilledFields: inferred.mapping,
      },
    ],
  };
}
