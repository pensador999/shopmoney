import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store } from './store.ts';
import { Service } from './service.ts';
import { createEditorial } from './service-editorial.ts';
import { demoCsv, demoMapping } from './demo.ts';
import { enqueueAgent, runAgentQueue } from './agents.ts';
import { agentContracts } from './business-context.ts';
import { economics } from './order-workflow.ts';
import { offerVersion } from './offers.ts';
const dir=resolve('artifacts',`brazil-${Date.now()}`);mkdirSync(dir,{recursive:true});
const path=resolve(dir,'simulation.sqlite');let store=new Store(path);
const brief={brand:{version:'sintetica-1',audience:'Vestuário casual',proposition:'Clareza sobre a peça',tone:'Informativo',materialAuthorization:true},products:[{id:'P001',title:'Camiseta sintética',facts:[{text:'Composição: algodão.',source:'Ficha técnica sintética aprovada',approved:true}]}]};
const outcomes:any[]=[];const roles:any[]=[];
try{
  for(const service of ['diagnostic','content','catalog','combined'] as const){
    const base={name:`Marca sintética ${service}`,email:`${service}@example.com`,demo:true};
    const o=service==='diagnostic'||service==='content'?createEditorial(store,{...base,service,brief:service==='content'?brief:{products:[{id:'P001',title:'Camiseta',description:'',source:'Fixture sintética',missingFields:['Composição']} ]}}):await new Service(store).create({...base,service,filename:'synthetic.csv',data:Buffer.from(demoCsv),mapping:demoMapping,content:service==='combined'?brief:undefined});
    const svc=new Service(store);svc.approve(o.id);svc.simulatePayment(o.id);
    store.close();store=new Store(path); // Durable recovery before execution.
    const ready=await new Service(store).process(o.id);const bytes=store.artifact(o.id,'delivery-0.zip');writeFileSync(resolve(dir,`${service}.zip`),bytes);
    new Service(store).delivered(o.id,ready.deliveryId!);
    outcomes.push({service,id:o.id,status:store.get(o.id).status,amountCents:o.amount,currency:o.currency,zipBytes:bytes.length,economics:economics(store.get(o.id)),reopenedBeforeExecution:true});
  }
  for(const role of Object.keys(agentContracts) as (keyof typeof agentContracts)[]){const id=enqueueAgent(store,role,{service:'content',synthetic:true});await runAgentQueue(store,async()=>({summary_pt:'Resposta controlada para validar fila e idioma; não avalia raciocínio do modelo.',reply_client:'',language:'pt-BR',action:'information',rule:'SCOPE-01'}));roles.push({role,status:store.db.prepare('SELECT status FROM ai_jobs WHERE id=?').get(id)?.status,mode:'controlled-response'});}
  const report={version:offerVersion,at:new Date().toISOString(),outcomes,roles,actualRevenueBRL:0,remoteExecution:'not verified — approval review unavailable',limits:['Dados sintéticos, arquivos gerados por código real.','Oito papéis usam respostas controladas; nenhuma chamada nova ao modelo.','Entrega simulada; sem envio, cobrança ou importação.','Horas totais/custos não medidos; contribuição desconhecida.','Ponte remota validada em fixture; migração e RLS reais pendentes.']};
  writeFileSync(resolve(dir,'report.json'),JSON.stringify(report,null,2));
  writeFileSync(resolve(dir,'RESULTADO.md'),`# Ensaio Brasil — ${offerVersion}\n\nQuatro serviços passaram por escopo, pagamento simulado, reabertura do SQLite, produção, QA e entrega simulada. Oito papéis concluíram a fila com respostas controladas. Receita real: R$0.\n\n${outcomes.map(o=>`- ${o.service}: ${o.status}, ${o.zipBytes} bytes; contribuição ${o.economics.state}.`).join('\n')}\n\n${report.limits.map(l=>'- '+l).join('\n')}\n`);
  console.log(JSON.stringify({directory:dir,services:outcomes.length,roles:roles.length,actualRevenueBRL:0}));
}finally{store.close();}
