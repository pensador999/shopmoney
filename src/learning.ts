import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Store } from './store.ts';
import { assert } from './policy.ts';
export const proposalSchema=z.object({orderId:z.uuid(),revision:z.number().int().nonnegative(),problem:z.string().min(1).max(2000),evidence:z.array(z.string().min(1).max(1000)).min(1).max(10),proposedRule:z.string().min(1).max(3000)}).strict();
export function proposeLearning(store:Store,input:unknown){
  const p=proposalSchema.parse(input),order=store.get(p.orderId);assert(order.revision===p.revision,'Aprendizado de revisão antiga.');
  const id=randomUUID(),data={...p,clientId:order.clientId,status:'proposed',scope:'client-only',createdAt:new Date().toISOString()};
  store.db.prepare('INSERT INTO learning_proposals VALUES(?,?,?)').run(id,order.clientId,JSON.stringify(data));
  order.learningProposals=[...(order.learningProposals??[]),{id,...data}];store.save(order);return {id,...data};
}
export function reviewLearning(store:Store,id:string,clientId:string,input:unknown){
  const review=z.object({approved:z.boolean(),testEvidence:z.string().min(1).max(2000)}).strict().parse(input);
  const row=store.db.prepare('SELECT data FROM learning_proposals WHERE id=? AND client_id=?').get(id,clientId) as any;assert(row,'Proposta não encontrada para este cliente.');
  const p=JSON.parse(row.data);assert(p.status==='proposed','Proposta já revisada.');
  const order=store.get(p.orderId);assert(order.revision===p.revision,'Teste e aprovação devem se referir à revisão atual.');
  const next={...p,...review,status:review.approved?'approved':'rejected',approvedBy:'local_operator',reviewedAt:new Date().toISOString()};
  store.db.prepare('UPDATE learning_proposals SET data=? WHERE id=? AND client_id=?').run(JSON.stringify(next),id,clientId);
  order.learningProposals=(order.learningProposals??[]).map(v=>v.id===id?{id,...next}:v);store.save(order);
  store.audit(p.orderId,'SCOPE-01','learning_reviewed',{id,status:next.status,scope:'client-only'});return next;
}
