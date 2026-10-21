import {randomUUID} from 'node:crypto';
import {ContentStudio} from './service.ts';
import {type StudioScope} from './contracts.ts';
import {offerSnapshot} from '../offers.ts';
import {orderTasks} from '../order-workflow.ts';
export class StudioOperations {
 private studio:ContentStudio;
 constructor(studio:ContentStudio){this.studio=studio;studio.store.db.exec('CREATE TABLE IF NOT EXISTS studio_order_links(studio_id TEXT PRIMARY KEY REFERENCES content_studios(id),order_id TEXT NOT NULL REFERENCES orders(id),order_revision INTEGER NOT NULL);');}
 connect(id:string,scope:StudioScope,orderId?:string){
  const store=this.studio.store;
  return store.transaction(()=>{
   const r=this.studio.get(id,scope);if(r.status==='cancelled')throw Error('Conteúdo cancelado.');
   const old=store.db.prepare('SELECT * FROM studio_order_links WHERE studio_id=?').get(id) as any;
   if(old){if(orderId&&old.order_id!==orderId)throw Error('Ficha já vinculada a outro pedido.');if(!orderId)return this.overview(id,scope);}
   if(!orderId){const offer=offerSnapshot('content');orderId=randomUUID();store.save({id:orderId,clientId:scope.clientId,status:'needs_info',demo:true,filename:'editorial-supervisionado',mapping:{},scopeApproved:false,amount:offer.cents,currency:offer.currency,offer,createdAt:new Date().toISOString(),revision:0,corrections:0,hours:0,fees:0,costs:0,error:'Pedido editorial local: aprovação e execução comerciais permanecem separadas.'});}
   const o=store.get(orderId,scope.clientId);
   if(o.remoteWorkspaceId&&o.remoteWorkspaceId!==scope.workspaceId)throw Error('Workspace incompatível.');
   if(!o.demo||!['content','combined'].includes(o.offer?.kind??'')||['cancelled','closed','refunded','refund_pending'].includes(o.status))throw Error('Vínculo exige pedido local de validação editorial ativo.');
   const peers=store.db.prepare('SELECT s.workspace_id,s.store_id FROM studio_order_links l JOIN content_studios s ON s.id=l.studio_id WHERE l.order_id=?').all(orderId) as any[];
   if(peers.some(p=>p.workspace_id!==scope.workspaceId||p.store_id!==scope.storeId))throw Error('Pedido pertence a outro workspace/loja.');
   store.db.prepare('INSERT INTO studio_order_links VALUES(?,?,?) ON CONFLICT(studio_id) DO UPDATE SET order_revision=excluded.order_revision').run(id,orderId,o.revision);
   store.audit(orderId,'SCOPE-01','studio_order_connected',{studioId:id,scope,orderRevision:o.revision});return this.overview(id,scope);
  });
 }
 overview(id:string,scope:StudioScope){
  const r=this.studio.get(id,scope),store=this.studio.store;
  const link=store.db.prepare('SELECT * FROM studio_order_links WHERE studio_id=?').get(id) as any;
  const order=link?store.get(link.order_id,scope.clientId):null;
  const stale=!!order&&order.revision!==link.order_revision;
  const blocked=stale||r.status==='cancelled'||!!order&&['cancelled','refunded','refund_pending'].includes(order.status);
  return {studioId:id,scope,revision:r.revision,order:order?{id:order.id,status:order.status,revision:order.revision,demo:order.demo}:null,blocked,stale,
   operatorNext:blocked?'Revisar vínculo/cancelamento antes de continuar':this.studio.handoff(id,scope).next,
   operationalTasks:order?orderTasks(order):[],editorialTasks:this.studio.jobs(id,scope).map(j=>({id:j.id,role:j.role,state:j.status==='done'?(j.result?.deliverable?.kind==='pending'?'needs_info':'response_available'):j.status,revision:r.revision,approved:false})),
   package:{state:r.status,approved:!!r.approval,appliedToStore:false},source:'SQLite local; tarefas operacionais e respostas editoriais identificadas separadamente'};
 }
}
