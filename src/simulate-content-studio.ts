import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import AdmZip from 'adm-zip';
import {Store} from './store.ts';
import {ContentStudio} from './content-studio/service.ts';
import {studioFixture} from './content-studio/fixtures.ts';
import {renderDescription,checkRendered} from './content-studio/render.ts';
import {agentPlaybook} from './agent-playbooks.ts';
const dir=resolve('artifacts','content-studio-'+Date.now());mkdirSync(dir,{recursive:true});
let store=new Store(resolve(dir,'simulation.sqlite'));
const results:any[]=[];
try{
  const client=store.client('Cliente sintético — dois perfis','studio-synthetic@example.invalid');
  for(const brand of ['clara','horizonte']as const)for(const template of ['essential','editorial']as const){
    const request=studioFixture({workspaceId:'synthetic-validation',clientId:client.id,storeId:brand},brand);
    const service=new ContentStudio(store),record=service.create(request);
    const rendered=renderDescription(request,template,{selectedColor:'Areia'});assert.deepEqual(checkRendered(request,template,rendered.html,'Areia'),[]);
    assert.throws(()=>service.export(record.id,request.scope,0));
    service.approve(record.id,request.scope,0,{template,color:'Areia',operator:'Roteiro sintético controlado',
      note:'Aprovação de fixture pelo roteiro; não é aceite humano de um produto real.',visualChecked:true,textChecked:true,factsChecked:true});
    const buffer=service.export(record.id,request.scope,0),path=resolve(dir,brand+'-'+template);mkdirSync(path);
    const zip=new AdmZip(buffer);zip.extractAllTo(path,true);writeFileSync(resolve(dir,brand+'-'+template+'.zip'),buffer);
    const media=JSON.parse(zip.readAsText('midias.json'));assert.equal(media[0].variantIds.length,2);
    assert.equal(request.product.variants[0].sku,'000120-AREIA-P');
    results.push({id:record.id,scope:request.scope,brand:request.brand.name,template,revision:0,status:'exported',path,facts:request.product.facts,preview:brand+'-'+template+'/previa.html'});
  }
  store.close();store=new Store(resolve(dir,'simulation.sqlite'));
  for(const result of results){const service=new ContentStudio(store);assert.equal(service.get(result.id,result.scope).status,'exported');assert.deepEqual(service.export(result.id,result.scope,0),Buffer.from(store.db.prepare('SELECT data FROM content_studio_packages WHERE id=? AND revision=0').get(result.id)?.data as Uint8Array));}
  assert.equal(store.db.prepare('SELECT count(*) n FROM content_studio_packages').get()?.n,4);
  assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get()?.n,0);
  for(const result of results)assert.deepEqual(result.facts,results[0].facts);
  const report={completed:true,directory:dir,previews:results.map(({facts,...r})=>r),factsIdentical:true,
    skillVersion:agentPlaybook('planner','content').version,actualRevenueBRL:0,modelCalls:0,externalRequests:0,
    limits:['Ilustrações SVG sintéticas; nenhuma foto de cliente/BRK.','Texto composto de fatos e introduções aprovados na fixture, sem geração nova de IA.',
      'Aprovações controladas do roteiro; não representam aceite humano de cliente.','Arquivos para demonstração local, sem teste de importação Shopify.']};
  writeFileSync(resolve(dir,'report.json'),JSON.stringify(report,null,2));
  writeFileSync(resolve(dir,'index.html'),'<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quatro prévias Catana Ops</title><body><h1>Uma peça, duas marcas, dois templates</h1><p>Dados e ilustrações sintéticos. Aprovações controladas pelo roteiro. Sem publicação.</p><ul>'+results.map(r=>'<li><a href="'+r.preview+'">'+r.brand+' · '+r.template+'</a></li>').join('')+'</ul></body></html>');
  console.log(JSON.stringify(report,null,2));
}finally{store.close();}
