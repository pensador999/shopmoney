import test from 'node:test';
import assert from 'node:assert/strict';
import { supportedFormats } from '../src/formats.ts';
import { readTable, transform, qualityCheck, inspect } from '../src/catalog.ts';
import { adaptSupplier, type SupplierProfile } from '../src/supplier-adapter.ts';
import { stringify } from 'csv-stringify/sync';
import { Store } from '../src/store.ts';
import { Service } from '../src/service.ts';

test('molde de 59 colunas usa apenas cabeçalhos; dados sintéticos chegam ao pacote Shopify', async()=>{
  const [bling,sankhya,shopify]=supportedFormats();
  assert.equal(bling.headers.length,59); assert.equal(sankhya.headers.length,45);
  assert.equal(shopify.format.delimiter,','); assert.equal(bling.directShopifyImport,false);
  const blank=()=>Object.fromEntries(bling.headers.map((h:string)=>[h,'']));
  const rows=[Object.assign(blank(),{'Código':'0001','Descrição':'Synthetic shirt','Produto Variação':'parent'}),
    Object.assign(blank(),{'Código':'000100','Código Pai':'0001','Descrição':'S','Produto Variação':'variant','Preço':'19,90','GTIN/EAN':'0012345678905'}),
    Object.assign(blank(),{'Código':'000101','Código Pai':'0001','Descrição':'M','Produto Variação':'variant','Preço':'19,90','GTIN/EAN':'0012345678912'})];
  const profile:SupplierProfile={id:'synthetic-bling-layout',version:'1',expectedHeaders:bling.headers,rowType:'Produto Variação',parentValue:'parent',variantValue:'variant',parentId:'Código',variantParentId:'Código Pai',parentFields:[],parentFieldMappings:[{source:'Descrição',target:'parentTitle'}],mapping:{supplierKey:'synthetic',productId:'parentIdentity',title:'parentTitle',sku:'Código',price:'Preço',barcode:'GTIN/EAN',options:[{name:'Size',column:'Descrição'}],csvDelimiter:';',priceDecimalSeparator:','}};
  const raw=Buffer.from(stringify(rows,{header:true,columns:bling.headers,delimiter:';',bom:true}));
  const parsed=await readTable(raw,'.csv',550,';');
  const adapted=adaptSupplier(parsed,profile),output=transform(adapted.rows,adapted.mapping);
  assert.equal(output[0].Price,'19.90'); assert.equal(output[0].SKU,'000100');
  assert.equal(output[0].Title,'Synthetic shirt'); assert.equal(output[0]['Option1 value'],'S');
  assert.deepEqual(qualityCheck(adapted.rows,output,adapted.mapping),[]);
  assert.throws(()=>adaptSupplier(parsed.map(r=>({...r,extra:''})),profile),/Cabeçalhos/);
  assert.equal(inspect(adapted.rows.map(r=>({...r,'Preço':'1.999,90'})),adapted.mapping).ok,false);
  const s=new Store(':memory:');try{
    const svc=new Service(s),o=await svc.create({name:'Synthetic agency',email:'test@example.com',filename:'synthetic.csv',data:raw,mapping:profile.mapping,profile,demo:true});
    svc.approve(o.id);svc.simulatePayment(o.id);const ready=await svc.process(o.id);
    assert.equal(ready.status,'ready');assert.deepEqual(s.artifact(o.id,'original'),raw);
    assert(s.artifact(o.id,'shopify-0.csv').toString().startsWith('Title,URL handle'));
  }finally{s.close();}
});
