import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readTable, inspect, transform, qualityCheck, csv, HEADERS } from '../src/catalog.ts';
import { demoCsv, demoMapping } from '../src/demo.ts';
const source = () => readTable(Buffer.from(demoCsv), '.csv');
test('preserva zeros, preço e agrupamento pai/variantes no roundtrip CSV', async () => {
  const rows = await source(), out = transform(rows, demoMapping);
  assert.equal(out[0].SKU, '000101'); assert.equal(out[0].Barcodes, '0012345678905'); assert.equal(out[0].Price, '19.90');
  assert.equal(out[0]['URL handle'], out[1]['URL handle']); assert.equal(out[0].Status, 'draft'); assert.equal(out[0]['Published on online store'], 'false'); assert.equal(out[1].Title, '');
  assert.deepEqual(qualityCheck(rows, out, demoMapping), []);
  assert.deepEqual(await readTable(Buffer.from(csv(out, HEADERS)), '.csv'), out);
});
test('rejeita duplicidades, campos ausentes e combinações de opções repetidas', async () => {
  const rows = await source(); rows[1].sku = rows[0].sku; rows[1].size = rows[0].size; rows[0].title = '';
  const result = inspect(rows, demoMapping);
  assert.equal(result.ok, false); for (const code of ['REQUIRED','DUPLICATE_SKU','DUPLICATE_VARIANT']) assert(result.issues.some(i => i.code === code));
});
test('conta 20 pais e 140 variantes sem multiplicar por públicos ou lojas', async () => {
  const [r] = await source(); const rows = Array.from({ length: 20 }, (_, p) => Array.from({ length: 7 }, (_, s) => ({ ...r, product_id: `p${p}`, sku: `p${p}s${s}`, size: String(s) }))).flat();
  assert.deepEqual([inspect(rows, demoMapping).productCount, inspect(rows, demoMapping).variantCount], [20,140]);
  const out = transform(rows, demoMapping); assert.equal(out.filter(r=>r.Title).length,20);
});
test('limites independentes de produtos e variantes', async () => {
  const [r] = await source(); const products = Array.from({ length:51 }, (_,i)=>({...r,product_id:String(i),sku:String(i)}));
  assert.equal(inspect(products,demoMapping).ok,false);
  const variants=Array.from({length:501},(_,i)=>({...r,sku:String(i),size:String(i)})); assert.equal(inspect(variants,demoMapping).ok,false);
});
test('qualidade detecta alteração indevida de preço, GTIN, opção e associação',async()=>{
  const rows=await source(), out=transform(rows,demoMapping);out[0].Price='1.00';out[1].Barcodes='999';out[1]['Option1 value']='XL';out[1]['URL handle']='wrong';
  assert(qualityCheck(rows,out,demoMapping).length>=4);
});
test('células perigosas e CSV malformado não passam',async()=>{
  const rows=await source();rows[0].sku='=HYPERLINK("x")';assert.equal(inspect(rows,demoMapping).ok,false);
  await assert.rejects(()=>readTable(Buffer.from('a,b\n1,2,3'),'.csv'));
  await assert.rejects(()=>readTable(Buffer.from('a,a\n1,2'),'.csv'));
});
test('XLSX mantém identificadores textuais e bloqueia numéricos e fórmulas',async()=>{
  const wb=new ExcelJS.Workbook(), sheet=wb.addWorksheet('Supplier');
  sheet.addRow(['product_id','title','sku','price','barcode','vendor','size','description']);
  sheet.addRow(['P001','Sample','000101',19.9,'0012345678905','Demo','S','Plain']);
  let rows=await readTable(Buffer.from(await wb.xlsx.writeBuffer()),'.xlsx');assert.equal(inspect(rows,demoMapping).ok,true);assert.equal(transform(rows,demoMapping)[0].SKU,'000101');
  sheet.getCell('C2').value=101;rows=await readTable(Buffer.from(await wb.xlsx.writeBuffer()),'.xlsx');assert(inspect(rows,demoMapping).issues.some(i=>i.code==='IDENTIFIER_AS_NUMBER'));
  sheet.getCell('C2').value={formula:'1+1',result:2};
  await assert.rejects(async()=>readTable(Buffer.from(await wb.xlsx.writeBuffer()),'.xlsx'),/fórmulas/);
});
