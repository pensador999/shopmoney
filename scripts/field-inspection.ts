// Ensaio de campo somente leitura. Nunca inicia runtime, envia email ou carrega .env.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import AdmZip from 'adm-zip';
import {Store} from '../src/store.ts';
import {Service} from '../src/service.ts';
import {collectCatalog,collectProductPages} from '../src/inspection/collector.ts';
import {analyzeSnapshot,checkAudit} from '../src/inspection/catalog-audit.ts';
import {createInspectionDiagnostic} from '../src/inspection/bridge.ts';
import {verifySnapshot} from '../src/inspection/snapshot.ts';
import {orderAgentRequest} from '../src/coordination.ts';

const command=process.argv[2];
if(command==='collect'){
  const origin=process.argv[3];
  if(!origin)throw Error('Uso: collect https://origem-aprovada');
  const directory=resolve('artifacts','field-inspection-'+Date.now());mkdirSync(directory,{recursive:true});
  const store=new Store(resolve(directory,'field.sqlite'));
  try{
    const client=store.client('Referência pública — não é cliente contratado','field-reference@example.invalid');
    const scope={workspaceId:'local-field-validation',clientId:client.id};
    writeFileSync(resolve(directory,'context.json'),JSON.stringify({origin,scope,collectedBy:'Catana Ops HTTPS collector',commercialActivation:false},null,2));
    const handles=process.argv.slice(4);
    const snapshot=handles.length?
      await collectProductPages({origin,approvedOrigin:origin,scope,handles,mode:'public-readonly'}):
      await collectCatalog({origin,approvedOrigin:origin,scope,maxProducts:10,maxPages:3,mode:'public-readonly'});
    writeFileSync(resolve(directory,'snapshot.json'),JSON.stringify(snapshot,null,2));
    const audit=analyzeSnapshot(snapshot,{version:'field-observed-options-1',expectedSizes:[]});
    assert.deepEqual(checkAudit(snapshot,audit),[]);
    writeFileSync(resolve(directory,'audit.json'),JSON.stringify(audit,null,2));
    const summary={directory,origin,snapshotId:snapshot.id,coverage:audit.coverage,pages:snapshot.pages.length,
      products:audit.products.length,variants:audit.products.reduce((n,p)=>n+p.variants.length,0),
      codes:audit.findings.reduce((counts,f)=>({...counts,[f.code]:(counts[f.code]??0)+1}),{} as Record<string,number>),
      sample:audit.products.map(p=>({title:p.title,url:p.handle?origin+'/products/'+p.handle:p.source,options:[...new Set(p.variants.map(v=>v.size))],
        variants:p.variants.length,available:p.variants.filter(v=>v.available===true).length,unavailable:p.variants.filter(v=>v.available===false).length,
        unknown:p.variants.filter(v=>v.available===null).length,skuMissing:p.variants.filter(v=>!v.sku).length,
        priceExample:p.variants[0]?.price,descriptionReturned:p.description!==null,images:p.images?.length??null})),
      reviewed:false};
    writeFileSync(resolve(directory,'summary.json'),JSON.stringify(summary,null,2));
    console.log(JSON.stringify(summary,null,2));
  }catch(error){
    writeFileSync(resolve(directory,'failure.json'),JSON.stringify({error:String(error),at:new Date().toISOString(),completed:false},null,2));
    console.error(JSON.stringify({directory,error:String(error),completed:false}));process.exitCode=1;
  }finally{store.close();}
}else if(command==='rehearse'){
  const directory=resolve(process.argv[3]??'');
  const snapshot=verifySnapshot(JSON.parse(readFileSync(resolve(directory,'snapshot.json'),'utf8')));
  const profile={version:'field-observed-options-1',expectedSizes:[]};
  const audit=analyzeSnapshot(snapshot,profile);
  const store=new Store(resolve(directory,'field.sqlite'));
  try{
    assert.deepEqual(checkAudit(snapshot,audit),[]);
    writeFileSync(resolve(directory,'audit.json'),JSON.stringify(audit,null,2));
    const review={approved:true,operator:'codex-field-test',
      note:'Revisão técnica do assistente para ensaio demonstrativo. Não representa aprovação humana, autorização do lojista, contratação ou aceite comercial.'};
    const order=createInspectionDiagnostic(store,{scope:snapshot.scope,snapshot,profile,review}),svc=new Service(store);
    const request=orderAgentRequest(store,order.id);
    writeFileSync(resolve(directory,'agent-context.json'),JSON.stringify(request,null,2));
    assert.equal(request.input.evidence.inspection?.state,'source-checked');
    assert.equal(order.demo,true);
    if(order.status==='scoped')svc.approve(order.id);
    if(store.get(order.id).status==='awaiting_payment')svc.simulatePayment(order.id);
    if(store.get(order.id).status==='queued')await svc.process(order.id);
    assert.equal(store.get(order.id).status,'ready');
    const zip=store.artifact(order.id,'delivery-0.zip');writeFileSync(resolve(directory,'diagnostico-campo.zip'),zip);
    const files=new AdmZip(zip).getEntries().map(e=>e.entryName);
    await assert.rejects(()=>svc.process(order.id));
    assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get()?.n,1);
    assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE status<>'draft'").get()?.n,0);
    const report={directory,origin:snapshot.origin,snapshotId:snapshot.id,orderId:order.id,completed:true,
      collection:'real-public-readonly',execution:'diagnóstico demonstrativo com aprovação de teste e confirmação financeira simuladas',
      products:audit.products.length,variants:audit.products.reduce((n,p)=>n+p.variants.length,0),findings:audit.findings.length,
      coverage:audit.coverage,delivery:files,agentContextChecked:true,modelCalls:0,actualRevenueBRL:0,sentMessages:0,storeWrites:0};
    writeFileSync(resolve(directory,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{store.close();}
}else throw Error('Use collect <origem> ou rehearse <diretório-coletado>.');
