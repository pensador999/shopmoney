import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { Store } from '../src/store.ts';
import { Service } from '../src/service.ts';
import { demoCsv, demoMapping } from '../src/demo.ts';
import { productHandle } from '../src/catalog.ts';
test('mesmo identificador de dois fornecedores não produz o mesmo handle',()=>{
  assert.notEqual(productHandle('001',{...demoMapping,supplierKey:'one'}),productHandle('001',{...demoMapping,supplierKey:'two'}));
});
test('namespace do cliente não pode ser injetado pelo arquivo ou mapeamento',async()=>{
  const s=new Store(':memory:');try{const svc=new Service(s);const o=await svc.create({name:'A',email:'a@example.com',filename:'a.csv',data:Buffer.from(demoCsv),mapping:{...demoMapping,namespace:'someone-else'},demo:true});assert.equal(o.mapping.namespace,`${o.clientId}:${demoMapping.supplierKey}`);}finally{s.close();}
});
test('referências de mídia acompanham SKU sem baixar nem publicar imagens',async()=>{
  const s=new Store(':memory:');try{const svc=new Service(s);const input='product_id,title,sku,price,image\n1,Demo,001,9.90,https://example.com/image.jpg\n';
    const o=await svc.create({name:'A',email:'a@example.com',filename:'media.csv',data:Buffer.from(input),mapping:{supplierKey:'one',productId:'product_id',title:'title',sku:'sku',price:'price',options:[],imageUrl:'image'},demo:true});svc.approve(o.id);svc.simulatePayment(o.id);await svc.process(o.id);
    const zip=new AdmZip(s.artifact(o.id,'delivery-0.zip')), media=JSON.parse(zip.readAsText('media-review.json'));assert.equal(media[0].sku,'001');assert.match(media[0].status,/não baixada/);assert(!zip.readAsText('shopify.csv').includes('https://example.com'));
  }finally{s.close();}
});
