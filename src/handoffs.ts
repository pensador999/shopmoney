import { z } from 'zod';
import { hash } from './catalog.ts';
import type { AgentRole } from './business-context.ts';
import type { Store } from './store.ts';

const common={orderId:z.uuid(),revision:z.number().int().nonnegative(),service:z.enum(['diagnostic','content','catalog','combined']),evidence:z.array(z.string().min(1)).min(1),pending:z.array(z.string()),};
export const handoffSchemas={
  research:z.object({...common,fit:z.enum(['qualified','unverified','declined']),sources:z.array(z.url()).min(1)}),
  sales:z.object({...common,need:z.string().min(1),buyer:z.string().min(1),scope:z.string().min(1)}),
  support:z.object({...common,materials:z.array(z.string()).min(1),questions:z.array(z.string())}),
  planner:z.object({...common,mappingHash:z.string().min(1),brandVersion:z.string().min(1),operatorApproval:z.literal(true)}),
  production:z.object({...common,artifacts:z.array(z.string()).min(1),manifestHash:z.string().min(1)}),
  quality:z.object({...common,passed:z.literal(true),checks:z.array(z.string()).min(1),executor:z.literal('independent-code')}),
  finance:z.object({...common,confirmation:z.enum(['simulated','processor']),amountCents:z.number().int().nonnegative(),currency:z.string().length(3)}),
  coordinator:z.object({...common,next:z.string().min(1),owner:z.string().min(1)}),
};
export function validateHandoff(role:AgentRole,input:unknown,expected:{orderId:string;revision:number;service:string}) {
  const parsed=handoffSchemas[role].parse(input);
  if(parsed.orderId!==expected.orderId||parsed.revision!==expected.revision||parsed.service!==expected.service||parsed.pending.length) throw Error('Passagem bloqueada: revisão, serviço ou pendências divergentes.');
  return {...parsed,role,hash:hash(JSON.stringify(parsed))};
}
export function recordHandoff(store:Store,role:AgentRole,input:unknown,expected:{orderId:string;revision:number;service:string}) {
  const validated=validateHandoff(role,input,expected);
  store.artifact(expected.orderId,`${role}-${expected.revision}.json`,JSON.stringify(validated));
  return validated;
}
export function recordPreSaleHandoffs(store:Store,orderId:string,input:{fit:'qualified'|'unverified'|'declined';sources:string[];need:string;buyer:string;scope:string;evidence?:string[]}) {
  const o=store.get(orderId);
  if(!o.offer)throw Error('Pedido sem oferta brasileira versionada.');
  const expected={orderId:o.id,revision:o.revision,service:o.offer.kind};
  const evidence=input.evidence?.length?input.evidence:input.sources;
  const work=()=>{
    const research=recordHandoff(store,'research',{...expected,evidence,pending:[],fit:input.fit,sources:input.sources},expected);
    const sales=recordHandoff(store,'sales',{...expected,evidence:[research.hash],pending:[],need:input.need,buyer:input.buyer,scope:input.scope},expected);
    store.audit(o.id,'SALES-01','presale_handoffs_recorded',{revision:o.revision,researchHash:research.hash,salesHash:sales.hash});
    return {research,sales};
  };
  return store.db.isTransaction?work():store.transaction(work);
}
export function autoLinkLeadHandoffs(store:Store,orderId:string,email:string) {
  const row=store.db.prepare('SELECT data FROM leads WHERE email=? ORDER BY rowid DESC LIMIT 1').get(email.trim().toLowerCase()) as any;
  if(!row)return null;
  try{
    const data=JSON.parse(row.data);
    if(!data.qualified)return null;
    const o=store.get(orderId);
    if(!o.offer)return null;
    const sources=[data.website,data.source,data.contactSource].filter((u:unknown)=>typeof u==='string'&&u.startsWith('https://'));
    if(!sources.length)return null;
    return recordPreSaleHandoffs(store,orderId,{
      fit:'qualified',
      sources,
      need:String(data.evidence??'Necessidade observada na qualificação comercial'),
      buyer:String(data.name??email),
      scope:`${o.offer.name} (até ${o.offer.maxProducts} produtos / ${o.offer.maxVariants} variantes)`,
      evidence:[String(data.evidence??sources[0])],
    });
  }catch{return null;}
}
export function orderHandoffLedger(store:Store,orderId:string) {
  const o=store.get(orderId);
  const service=o.offer?.kind??'catalog';
  const expected={orderId:o.id,revision:o.revision,service};
  const roles=Object.keys(handoffSchemas) as AgentRole[];
  const handoffs={} as Record<AgentRole,{recorded:boolean;verified:boolean;hash:string|null}>;
  for(const role of roles){
    const name=`${role}-${o.revision}.json`;
    const fallback=role==='quality'?`handoff-${o.revision}.json`:null;
    const row=(store.db.prepare('SELECT data FROM artifacts WHERE order_id=? AND name=?').get(o.id,name)??(fallback?store.db.prepare('SELECT data FROM artifacts WHERE order_id=? AND name=?').get(o.id,fallback):null)) as any;
    if(!row){handoffs[role]={recorded:false,verified:false,hash:null};continue;}
    try{
      const parsed=JSON.parse(Buffer.from(row.data).toString());
      const checked=validateHandoff(role,parsed,expected);
      handoffs[role]={recorded:true,verified:true,hash:checked.hash};
    }catch{
      handoffs[role]={recorded:true,verified:false,hash:null};
    }
  }
  const verifiedRoles=roles.filter(r=>handoffs[r].verified);
  const missingRoles=roles.filter(r=>!handoffs[r].verified);
  return {orderId:o.id,revision:o.revision,service,verifiedRoles,missingRoles,handoffs};
}
export type LearningProposal={clientId:string;revision:number;problem:string;evidence:string[];proposedRule:string;testEvidence?:string;approvedBy?:string};
export function promoteLearning(p:LearningProposal,operator:string){
  if(!p.evidence.length||!p.testEvidence||p.approvedBy!==operator||!operator)throw Error('Aprendizado exige evidência, teste e aprovação do operador.');
  return {...p,status:'approved',scope:'client-only'};
}
export function replenishmentReadiness(input:{historyDays:number;sales:boolean;availability:boolean;stock:boolean;inTransit:boolean;leadTime:boolean}) {
  return input.historyDays>=90&&input.sales&&input.availability&&input.stock&&input.inTransit&&input.leadTime
    ? {status:'eligible_for_review',automaticPurchase:false}
    : {status:'not_evaluable',reason:'Exige 90 dias, vendas líquidas, disponibilidade, estoque, trânsito e prazo. Esgotado não comprova alta procura.',automaticPurchase:false};
}
