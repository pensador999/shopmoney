import test from 'node:test';
import assert from 'node:assert/strict';
import {collectProductPages} from '../src/inspection/collector.ts';
import {analyzeSnapshot,checkAudit} from '../src/inspection/catalog-audit.ts';
const args={origin:'https://example.com',approvedOrigin:'https://example.com',scope:{workspaceId:'local',clientId:'test'},handles:['camiseta'],mode:'synthetic' as const};
const product={id:'1',handle:'camiseta',title:'Camiseta sintética',body_html:'<p>Ficha.</p>',options:[{name:'Cor',position:1},{name:'Tamanho',position:2}],
  images:[],variants:[{id:'v1',sku:'0001',barcode:'000123',price:'129.90',option1:'Azul',option2:'M'}]};
const response=(p:any)=>new Response(JSON.stringify({product:p}),{headers:{'content-type':'application/json'}});
test('produto selecionado mantém unidade monetária, JSON pointer e disponibilidade desconhecida',async()=>{
  const snapshot=await collectProductPages(args,{transport:async url=>{assert.equal(url,'https://example.com/products/camiseta.json');return response(product);}});
  const audit=analyzeSnapshot(snapshot);
  assert.equal(snapshot.coverage,'sample');assert.equal(audit.products[0].pointer,'/product');
  assert.equal(audit.products[0].variants[0].price,'129.90');assert.equal(audit.products[0].variants[0].size,'M');
  assert.equal(audit.products[0].variants[0].available,null);assert.deepEqual(checkAudit(snapshot,audit),[]);
  assert(audit.findings.some(f=>f.code==='UNKNOWN_AVAILABILITY'));assert(!audit.findings.some(f=>f.code==='PUBLIC_UNAVAILABLE'));
});
test('seleção rejeita traversal, duplicatas, produto divergente e resposta sem objeto product',async()=>{
  for(const handles of [[],['../admin'],['camiseta','camiseta'],Array.from({length:6},(_,i)=>'p'+i)]){
    await assert.rejects(()=>collectProductPages({...args,handles},{transport:async()=>response(product)}));
  }
  await assert.rejects(()=>collectProductPages(args,{transport:async()=>response({...product,handle:'outro'})}));
  await assert.rejects(()=>collectProductPages(args,{transport:async()=>new Response(JSON.stringify({products:[product]}),{headers:{'content-type':'application/json'}})}));
});
test('indisponibilidade de informação é agrupada por produto, sem inundar o diagnóstico de variantes',async()=>{
  const p={...product,variants:[...product.variants,{...product.variants[0],id:'v2',sku:'0002',option2:'G'}]};
  const snapshot=await collectProductPages(args,{transport:async()=>response(p)});
  const audit=analyzeSnapshot(snapshot),findings=audit.findings.filter(f=>f.code==='UNKNOWN_AVAILABILITY');
  assert.equal(findings.length,1);assert.equal(findings[0].evidence.length,2);
  assert(findings[0].finding.includes('2 variante'));assert.deepEqual(checkAudit(snapshot,audit),[]);
});
test('QA continua verificando relatórios da versão anterior sem convertê-los para a nova regra',async()=>{
  const snapshot=await collectProductPages(args,{transport:async()=>response(product)});
  const historical=analyzeSnapshot(snapshot,{version:'default-1'},'catana-catalog-audit-1');
  assert.equal(historical.version,'catana-catalog-audit-1');assert.deepEqual(checkAudit(snapshot,historical),[]);
  const current=analyzeSnapshot(snapshot);assert.equal(current.version,'catana-catalog-audit-2');
  assert.notEqual(current.findings.find(f=>f.code==='UNKNOWN_AVAILABILITY')?.finding,historical.findings.find(f=>f.code==='UNKNOWN_AVAILABILITY')?.finding);
});
