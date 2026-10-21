import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect} from '../src/catalog.ts';
test('orientação de erro respeita o decimal aprovado no perfil brasileiro',()=>{
  const mapping={supplierKey:'fixture',productId:'p',title:'title',sku:'sku',price:'price',priceDecimalSeparator:',' as const,options:[]};
  const rows=[{p:'p1',title:'Synthetic',sku:'0001',price:''}];
  assert(inspect(rows,mapping).issues.some(i=>i.code==='PRICE'&&i.message.includes('vírgula')));
  assert(!inspect(rows,mapping).issues.some(i=>i.message.includes('ponto decimal')));
  rows[0].price='19,90';assert.equal(inspect(rows,mapping).ok,true);
});
