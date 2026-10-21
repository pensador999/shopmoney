import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Store} from '../src/store.ts';
import {collectCatalog,collectProductPages} from '../src/inspection/collector.ts';
import {intakeSnapshot} from '../src/content-studio/intake.ts';
import {studioFixture} from '../src/content-studio/fixtures.ts';
import {ContentStudio} from '../src/content-studio/service.ts';
import {enqueueAgent,runAgentQueue} from '../src/agents.ts';
import {renderPreview} from '../src/content-studio/render.ts';

const mode=process.argv[2],directory=resolve(process.argv[3]??'artifacts/adaptive-field-2026-10-20');
if(!['collect','agents'].includes(mode))throw Error('Use collect ou agents e diretório.');
mkdirSync(directory,{recursive:true});const store=new Store(resolve(directory,'field.sqlite')),studio=new ContentStudio(store);
const stores=[{key:'duas',name:'DUAS — estudo público',origin:'https://duasdesign.com',handles:['vestido-eva-3','short-marina-slim-linho-preto']},
  {key:'insider',name:'Insider — estudo público',origin:'https://www.insiderstore.com.br',handles:['tech-t-shirt']},
  {key:'minimal',name:'Minimal Club — estudo público',origin:'https://minimalclub.com.br',handles:[]}];
const save=(name:string,value:unknown)=>writeFileSync(resolve(directory,name),JSON.stringify(value,null,2));
try{
  if(mode==='collect')for(const source of stores){
    if(existsSync(resolve(directory,source.key+'-intake.json'))&&JSON.parse(readFileSync(resolve(directory,source.key+'-intake.json'),'utf8')).ids.length)continue;
    const client=store.client(source.name,source.key+'@field.example.invalid'),scope={workspaceId:'field-adaptive',clientId:client.id,storeId:source.key};
    try{
      const savedSnapshot=resolve(directory,source.key+'-snapshot.json');
      const snapshot=existsSync(savedSnapshot)?JSON.parse(readFileSync(savedSnapshot,'utf8')):source.handles.length?await collectProductPages({origin:source.origin,approvedOrigin:source.origin,scope:{workspaceId:scope.workspaceId,clientId:scope.clientId},handles:source.handles,mode:'public-readonly'}):
        await collectCatalog({origin:source.origin,approvedOrigin:source.origin,scope:{workspaceId:scope.workspaceId,clientId:scope.clientId},maxProducts:2,maxPages:1,mode:'public-readonly'});
      save(source.key+'-snapshot.json',snapshot);
      const brand={...studioFixture(scope).brand,name:source.name,version:'public-study-1',introduction:'',approved:false,materialAuthorization:false,
        audience:'Não confirmado pela loja',proposition:'Hipótese pendente de briefing',tone:'Claro e factual; identidade ainda não aprovada',variantRules:'Somente vínculos presentes na fonte'};
      const intake=intakeSnapshot(snapshot,scope,brand);
      const ids=[];
      for(const request of intake.records){
        // Approves transcription only for this internal experiment, not the underlying commercial claims.
        request.product.facts=request.product.facts.map(f=>({...f,approved:true,source:f.source+' — transcrição para estudo interno, sem validação técnica do fabricante'}));
        const record=studio.create(request);ids.push(record.id);
      }
      save(source.key+'-intake.json',{ids,rejected:intake.rejected,coverage:intake.coverage,brandApproved:false,commercialReady:false});
      console.log(JSON.stringify({store:source.key,products:ids.length,rejected:intake.rejected.length,coverage:intake.coverage}));
    }catch(error){save(source.key+'-failure.json',{error:String(error),resume:'Corrigir fonte; sem fallback fictício.'});console.log(JSON.stringify({store:source.key,error:String(error)}));}
  }
  else {
    for(const source of stores){
      const p=resolve(directory,source.key+'-intake.json');if(!existsSync(p))continue;
      const {ids}=JSON.parse(readFileSync(p,'utf8'));if(!ids.length)continue;
      // Three real calls per shop on the first usable piece; remaining pieces test intake without extra token use.
      const meta=studio.list().find(r=>r.id===ids[0])!;let record=studio.get(meta.id,meta.scope);
      for(const role of ['planner','production','quality']as const){
        const checkpoint=source.key+'-'+role+'.json';
        if(existsSync(resolve(directory,checkpoint))){
          const previous=JSON.parse(readFileSync(resolve(directory,checkpoint),'utf8')).job;
          if(previous?.status!=='done'||previous.result?.deliverable?.kind==='pending')break;
          if(role==='production')record=studio.applyDraft(record.id,record.request.scope,record.revision,previous.id);
          continue;
        }
        const task=studio.structuredAdvice(record.id,record.request.scope,role);enqueueAgent(store,role,task.input,task.clientId,task.id);
        await runAgentQueue(store);
        const job=studio.jobs(record.id,record.request.scope).find(j=>j.id===task.id);
        save(checkpoint,{job,realModelAttempt:true,commercialReady:false});
        console.log(JSON.stringify({store:source.key,role,status:job?.status,error:job?.error}));
        if(job?.status!=='done')break;
        if(job.result?.deliverable?.kind==='pending')break;
        if(role==='production')record=studio.applyDraft(record.id,record.request.scope,record.revision,task.id);
      }
      writeFileSync(resolve(directory,source.key+'-preview.html'),renderPreview(record.request,'editorial'));
      save(source.key+'-handoff.json',studio.handoff(record.id,record.request.scope));
    }
  }
  save('summary.json',{at:new Date().toISOString(),records:studio.list(),jobs:store.db.prepare('SELECT id,role,status,error FROM ai_jobs').all(),budget:store.setting('aiDailyBudget',null),commercialActivation:false});
}finally{store.close();}
