import { Store } from '../store.ts';
import { createEditorial, diagnosticSchema } from '../service-editorial.ts';
import { analyzeSnapshot, type CatalogAudit } from './catalog-audit.ts';
import { inspectionBrief, readInspection, reviewSchema, saveInspection, type InspectionEvidence } from './evidence.ts';
import { sha, verifySnapshot, type CatalogSnapshot, type InspectionScope } from './snapshot.ts';

export function toDiagnosticBrief(snapshot:CatalogSnapshot,audit:CatalogAudit){
  return diagnosticSchema.parse(inspectionBrief(snapshot,audit));
}
export function createInspectionDiagnostic(store:Store,input:{
  scope:InspectionScope;snapshot:CatalogSnapshot;profile?:unknown;review:unknown;
}){
  verifySnapshot(input.snapshot,input.scope);const review=reviewSchema.parse(input.review);
  const client=store.db.prepare('SELECT id,name,email FROM clients WHERE id=?').get(input.scope.clientId)as any;
  if(!client)throw Error('Cliente inexistente.');
  const audit=analyzeSnapshot(input.snapshot,input.profile),brief=toDiagnosticBrief(input.snapshot,audit);
  // Mesmo snapshot/perfil tem a mesma identidade: reiniciar não cria outro pedido.
  const digest=sha(JSON.stringify({scope:input.scope,snapshot:input.snapshot.id,profile:audit.profile}));
  const id=digest.slice(0,8)+'-'+digest.slice(8,12)+'-4'+digest.slice(13,16)+'-8'+digest.slice(17,20)+'-'+digest.slice(20,32);
  return store.transaction(()=>{
  const old=store.db.prepare('SELECT id FROM orders WHERE id=?').get(id);
  if(old){
    const saved=readInspection(store,input.scope,input.snapshot.id);
    if(JSON.stringify(saved.review)!==JSON.stringify(review)||JSON.stringify(saved.audit)!==JSON.stringify(audit))throw Error('Pedido existente usa outra revisão de evidência.');
    return store.get(id,input.scope.clientId);
  }
  const payload:InspectionEvidence={snapshot:input.snapshot,audit,review};
  saveInspection(store,input.scope,payload);
  // Entrada supervisionada de validação. Não aprova escopo, cobra nem inicia produção.
  const order=createEditorial(store,{id,name:client.name,email:client.email,service:'diagnostic',brief,demo:true});
    store.artifact(order.id,'inspection-0.json',JSON.stringify(payload));
    store.audit(order.id,'DATA-01','inspection_attached',{snapshotId:input.snapshot.id,auditHash:brief.inspection!.auditHash,
      workspaceId:input.scope.workspaceId,operator:review.operator,mode:input.snapshot.mode,coverage:audit.coverage});
  return order;
  });
}
