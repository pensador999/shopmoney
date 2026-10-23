import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.ts';
import {ContentStudio} from '../src/content-studio/service.ts';
import {StudioOperations} from '../src/content-studio/operations.ts';
import {studioFixture} from '../src/content-studio/fixtures.ts';
import {digest} from '../src/content-studio/render.ts';
import {inferSupplierMapping} from '../src/learning.ts';

test('ficha legada migra uma vez, preserva histórico e rejeita adulteração',()=>{
 const store=new Store(':memory:');try{
  const client=store.client('Teste','test@example.invalid');
  const scope={workspaceId:'local',clientId:client.id,storeId:'test'};
  const studio=new ContentStudio(store),record=studio.create(studioFixture(scope));
  for(const media of record.request.media){delete (media as any).view;delete (media as any).viewConfirmed;}
  record.requestHash=digest(record.request);
  store.db.prepare('UPDATE content_studios SET data=? WHERE id=?').run(JSON.stringify(record),record.id);
  const migrated=studio.get(record.id,scope);
  assert.equal(migrated.revision,1);assert.equal(migrated.status,'draft');
  assert.equal(studio.get(record.id,scope).revision,1);
  migrated.request.product.title='Adulterado';
  store.db.prepare('UPDATE content_studios SET data=? WHERE id=?').run(JSON.stringify(migrated),record.id);
  assert.throws(()=>studio.get(record.id,scope),/alterado/);
 }finally{store.close();}
});

test('revisão editorial invalida pedido e preserva pacote anterior imutável',()=>{
 const store=new Store(':memory:');try{
  const client=store.client('Teste','test@example.invalid');
  const scope={workspaceId:'local',clientId:client.id,storeId:'test'};
  const studio=new ContentStudio(store),record=studio.create(studioFixture(scope));
  const ops=new StudioOperations(studio),link=ops.connect(record.id,scope);
  const order=store.get(link.order!.id);order.status='ready';order.scopeApproved=true;order.deliveryId='old';store.save(order);
  store.artifact(order.id,'delivery-0.zip','old package');
  const revised=structuredClone(record.request);revised.product.title='Título revisto';
  studio.revise(record.id,scope,0,revised);
  const current=store.get(order.id);assert.equal(current.revision,1);assert.equal(current.scopeApproved,false);
  assert.equal(current.deliveryId,undefined);assert.equal(current.status,'needs_info');
  assert.equal(store.artifact(order.id,'delivery-0.zip').toString(),'old package');
  assert.throws(()=>ops.deliverOrderPackage(record.id,scope),/escopo/);
 }finally{store.close();}
});

test('cabeçalhos desconhecidos não recebem colunas obrigatórias por posição',()=>{
 const store=new Store(':memory:');try{
  const inferred=inferSupplierMapping(store,'',['zzz','qqq','xxx','www']);
  assert.equal(inferred.mapping.sku,'');assert.equal(inferred.mapping.price,'');
  assert.equal(inferred.requiresHumanReview,true);
 }finally{store.close();}
});

test('orquestração preserva identificadores, restrições e pendências sem inventar aprovação',()=>{
 const store=new Store(':memory:');try{
  const client=store.client('Teste','test@example.invalid');
  const scope={workspaceId:'local',clientId:client.id,storeId:'test'};
  const studio=new ContentStudio(store),ops=new StudioOperations(studio),req=studioFixture(scope);
  req.brand.approved=false;req.brand.materialAuthorization=false;
  req.product.variants[1].sku=req.product.variants[0].sku;
  req.blocks=[{id:'bad',section:'features',text:'Produto milagroso impermeável',factIds:['presentation'],approved:false}];
  req.media.forEach(m=>{m.authorized=false;m.approved=false;});
  const record=studio.create(req),before=record.requestHash;
  const result=ops.orchestrate(record.id,scope);
  assert.equal(result.record.requestHash,before);
  assert.equal(result.record.approval,undefined);
  assert.equal(result.record.request.brand.approved,false);
  assert(result.record.request.brand.forbiddenTerms.includes('milagroso'));
  assert(result.record.request.media.every(m=>!m.authorized&&!m.approved));
  assert.equal(result.overview.order?.scopeApproved,false);
  assert.equal(result.overview.order?.paymentConfirmed,false);
  assert.equal(result.overview.order?.status,'needs_info');
 }finally{store.close();}
});
