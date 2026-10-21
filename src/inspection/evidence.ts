import { z } from 'zod';
import { Store } from '../store.ts';
import { checkAudit, type CatalogAudit } from './catalog-audit.ts';
import { sha, verifySnapshot, scopeSchema, type CatalogSnapshot, type InspectionScope } from './snapshot.ts';

export const inspectionReferenceSchema=z.object({
  snapshotId:z.string().regex(/^[a-f0-9]{64}$/),auditHash:z.string().regex(/^[a-f0-9]{64}$/),
  workspaceId:z.string().min(1).max(100),
}).strict();
export const reviewSchema=z.object({approved:z.literal(true),operator:z.string().min(1).max(100),note:z.string().min(1).max(1000)}).strict();
export type InspectionEvidence={snapshot:CatalogSnapshot;audit:CatalogAudit;review:z.infer<typeof reviewSchema>};
export function inspectionBrief(snapshot:CatalogSnapshot,audit:CatalogAudit){
  const errors=checkAudit(snapshot,audit);if(errors.length)throw Error(errors.join('; '));
  if(!audit.products.length)throw Error('Nenhum produto na amostra; não abrir pedido vazio.');
  if(audit.coverage==='interrupted')throw Error('Coleta interrompida; retome antes de abrir diagnóstico.');
  const products=audit.products.map(p=>({id:p.key,title:p.title??'',description:p.description??'',source:p.source,missingFields:[] as string[]}));
  const observations=audit.findings.slice(0,19).map(f=>({
    subject:f.subject,category:f.category,finding:f.finding,nextAction:f.nextAction,
    evidence:f.evidence.map(e=>({source:snapshot.pages[e.page].url,
      note:((e.missing?'Campo não retornado. ':'Valor capturado: '+JSON.stringify(e.value)+'. ')+
        'JSON pointer: '+e.pointer+'; snapshot '+snapshot.id).slice(0,1000)})),
  }));
  observations.push({subject:'Cobertura da coleta',category:'observed',
    finding:'Origem '+snapshot.mode+'; cobertura '+audit.coverage+'; '+audit.products.length+' produtos observados. '+snapshot.stopReason,
    nextAction:'Revisar o relatório técnico completo anexo; não extrapolar esta amostra para a loja inteira.',
    evidence:[{source:snapshot.pages[0].url,note:'Snapshot '+snapshot.id+'; '+snapshot.capturedAt+'. Observações resumidas no briefing: '+Math.min(audit.findings.length,19)+' de '+audit.findings.length+'.'}]});
  return {products,observations,inspection:{snapshotId:snapshot.id,auditHash:sha(JSON.stringify(audit)),workspaceId:snapshot.scope.workspaceId}};
}
function tables(store:Store){
  store.db.exec('CREATE TABLE IF NOT EXISTS catalog_inspections(workspace_id TEXT NOT NULL,client_id TEXT NOT NULL REFERENCES clients(id),snapshot_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(workspace_id,client_id,snapshot_id))');
}
export function saveInspection(store:Store,scope:InspectionScope,value:InspectionEvidence){
  scopeSchema.parse(scope);verifySnapshot(value.snapshot,scope);reviewSchema.parse(value.review);
  const errors=checkAudit(value.snapshot,value.audit);if(errors.length)throw Error(errors.join('; '));
  if(!store.db.prepare('SELECT id FROM clients WHERE id=?').get(scope.clientId))throw Error('Cliente inexistente.');
  tables(store);const payload=JSON.stringify(value);
  const old=store.db.prepare('SELECT payload FROM catalog_inspections WHERE workspace_id=? AND client_id=? AND snapshot_id=?').get(scope.workspaceId,scope.clientId,value.snapshot.id) as any;
  if(old&&old.payload!==payload)throw Error('Inspeção imutável; registrar nova revisão/captura.');
  store.db.prepare('INSERT OR IGNORE INTO catalog_inspections VALUES(?,?,?,?)').run(scope.workspaceId,scope.clientId,value.snapshot.id,payload);
  return value.snapshot.id;
}
export function readInspection(store:Store,scope:InspectionScope,snapshotId:string):InspectionEvidence{
  scopeSchema.parse(scope);tables(store);
  const row=store.db.prepare('SELECT payload FROM catalog_inspections WHERE workspace_id=? AND client_id=? AND snapshot_id=?').get(scope.workspaceId,scope.clientId,snapshotId)as any;
  if(!row)throw Error('Inspeção não encontrada neste cliente/workspace.');
  const value=JSON.parse(row.payload)as InspectionEvidence;
  verifySnapshot(value.snapshot,scope);reviewSchema.parse(value.review);
  if(checkAudit(value.snapshot,value.audit).length)throw Error('Inspeção persistida falhou na conferência.');
  return value;
}
export function verifyOrderInspection(store:Store,orderId:string,revision:number,reference:z.infer<typeof inspectionReferenceSchema>){
  inspectionReferenceSchema.parse(reference);
  const order=store.get(orderId);
  if(order.remoteWorkspaceId&&order.remoteWorkspaceId!==reference.workspaceId)throw Error('Workspace do pedido divergente.');
  const persisted=readInspection(store,{workspaceId:reference.workspaceId,clientId:order.clientId},reference.snapshotId);
  const artifact=store.artifact(orderId,'inspection-'+revision+'.json').toString();
  if(artifact!==JSON.stringify(persisted)||sha(JSON.stringify(persisted.audit))!==reference.auditHash)throw Error('Evidência anexada diverge do pedido.');
  return persisted;
}
