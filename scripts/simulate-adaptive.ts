import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Store} from '../src/store.ts';
import {ContentStudio} from '../src/content-studio/service.ts';
import {studioFixture} from '../src/content-studio/fixtures.ts';
import {enqueueAgent,runAgentQueue} from '../src/agents.ts';
import {renderPreview} from '../src/content-studio/render.ts';
const directory=resolve('artifacts/adaptive-field-2026-10-20');mkdirSync(directory,{recursive:true});
const store=new Store(resolve(directory,'field.sqlite')),studio=new ContentStudio(store);
try{
  const client=store.client('Ensaio fictício — produção real IA','synthetic@field.example.invalid');
  const existing=studio.list().find(r=>r.scope.clientId===client.id);
  let record=existing?studio.get(existing.id,existing.scope):studio.create(studioFixture({workspaceId:'synthetic-validation',clientId:client.id,storeId:'clara'}));
  for(const role of ['production','quality']as const){
    if(role==='production'&&record.aiDraftJob)continue;
    const task=studio.structuredAdvice(record.id,record.request.scope,role);enqueueAgent(store,role,task.input,task.clientId,task.id);
    if(!studio.jobs(record.id,record.request.scope).some(j=>j.id===task.id&&j.status==='done'))await runAgentQueue(store);
    const job=studio.jobs(record.id,record.request.scope).find(j=>j.id===task.id);
    writeFileSync(resolve(directory,'synthetic-'+role+'.json'),JSON.stringify(job,null,2));console.log(JSON.stringify({role,status:job?.status,error:job?.error}));
    if(job?.status!=='done'||job.result?.deliverable?.kind==='pending')break;
    if(role==='production')record=studio.applyDraft(record.id,record.request.scope,record.revision,task.id);
    if(role==='quality'&&job.result?.deliverable?.verdict==='pass'&&record.request.blocks.some(b=>!b.approved)){
      record.request.blocks=record.request.blocks.map(b=>({...b,approved:true}));
      record=studio.revise(record.id,record.request.scope,record.revision,record.request);
    }
  }
  writeFileSync(resolve(directory,'synthetic-preview.html'),renderPreview(record.request,'editorial'));
  writeFileSync(resolve(directory,'synthetic-result.json'),JSON.stringify({id:record.id,revision:record.revision,status:record.status,approved:false,realModel:true,budget:store.setting('aiDailyBudget',null)},null,2));
}finally{store.close();}
