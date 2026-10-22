import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Store, type Order } from './store.ts';
import { Service } from './service.ts';
import { createEditorial, reviseEditorial } from './service-editorial.ts';
import { orderTasks } from './order-workflow.ts';
import { hash, mappingSchema } from './catalog.ts';
import { supplierProfileSchema } from './supplier-adapter.ts';
import { assert } from './policy.ts';
import { proposeLearning, reviewLearning } from './learning.ts';

const fileSchema=z.object({id:z.uuid(),name:z.string().regex(/^[\w.-]{1,120}$/),path:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),size:z.number().int().min(0).max(8_000_000)});
export type RemoteFile=z.infer<typeof fileSchema>;
export type Snapshot={order:Order;client:{id:string;name:string;email:string};files:RemoteFile[];tasks:ReturnType<typeof orderTasks>;requestHash?:string};
type Transport=(path:string,init:RequestInit)=>Promise<Response>;
export class RemoteOperations {
  transport:Transport;
  constructor(config:{url:string;key:string;token:string},transport?:Transport){
    assert(config.url==='https://aqkwbmggkvvfhqaivxlh.supabase.co','Destino Supabase inválido.');
    this.transport=transport??((path,init)=>fetch(config.url+path,{...init,headers:{apikey:config.key,Authorization:`Bearer ${config.token}`,...init.headers},redirect:'error',signal:AbortSignal.timeout(30000)}));
  }
  async rpc(body:unknown){
    const r=await this.transport('/rest/v1/rpc/catanaops_operation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok)throw Error(`Operação remota indisponível (${r.status}); verifique sessão, migração e versão. Nenhuma repetição automática de efeitos incertos.`);
    return r.json() as Promise<{payload:Snapshot;version:number;generation:number;lease_owner:string|null}>;
  }
  async authorize(){
    const r=await this.transport('/rest/v1/rpc/catanaops_dashboard',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if(!r.ok)throw Error('Sessão sem vínculo de operador.');return r.json();
  }
  async upload(file:RemoteFile,data:Buffer){
    assert(hash(data)===file.sha256&&data.length===file.size,'Arquivo divergente.');
    const path='/storage/v1/object/catanaops-private/'+file.path;
    const response=await this.transport(path,{method:'POST',headers:{'Content-Type':'application/octet-stream','x-upsert':'false'},body:new Uint8Array(data)});
    if(response.ok)return;
    // An interrupted immutable upload may already exist. Verify bytes before treating it as a duplicate.
    if([400,409].includes(response.status)){
      const current=await this.transport(path.replace('/object/','/object/authenticated/'),{method:'GET'});
      if(current.ok&&hash(Buffer.from(await current.arrayBuffer()))===file.sha256)return;
    }
    throw Error('Upload não confirmado; repetir a mesma ação com o mesmo pedido após reconciliação.');
  }
  async hydrate(snapshot:Snapshot){
    const s=new Store(':memory:');
    try{
      const c=snapshot.client;s.db.prepare('INSERT INTO clients VALUES(?,?,?)').run(c.id,c.email,c.name);s.save(snapshot.order);
      const brand=snapshot.order.brandProfile as any;if(brand?.version)s.profile(c.id,brand.version,brand);
      for(const proposal of snapshot.order.learningProposals??[]){assert(proposal.clientId===c.id&&proposal.orderId===snapshot.order.id,'Aprendizado fora do cliente/pedido.');s.db.prepare('INSERT INTO learning_proposals VALUES(?,?,?)').run(proposal.id,c.id,JSON.stringify(proposal));}
      for(const raw of snapshot.files){const file=fileSchema.parse(raw);assert(file.path.startsWith(`${snapshot.order.remoteWorkspaceId}/${snapshot.order.id}/`),'Arquivo fora do pedido.');
        const r=await this.transport('/storage/v1/object/authenticated/catanaops-private/'+file.path,{method:'GET'});assert(r.ok,'Arquivo remoto indisponível.');
        const bytes=Buffer.from(await r.arrayBuffer());assert(bytes.length===file.size&&hash(bytes)===file.sha256,'Arquivo remoto adulterado.');s.artifact(snapshot.order.id,file.name,bytes);
      }return s;
    }catch(e){s.close();throw e;}
  }
  snapshot(s:Store,id:string,workspace:string,previous:RemoteFile[]=[]){
    const order=s.get(id);order.remoteWorkspaceId=workspace;
    const client=s.db.prepare('SELECT * FROM clients WHERE id=?').get(order.clientId) as any;
    const files=(s.db.prepare('SELECT name,data FROM artifacts WHERE order_id=?').all(id) as any[]).map(row=>{
      const bytes=Buffer.from(row.data),sha256=hash(bytes),old=previous.find(f=>f.name===row.name&&f.sha256===sha256);
      const file=old??{id:randomUUID(),name:row.name,path:'',sha256,size:bytes.length};
      if(!old)file.path=`${workspace}/${id}/${order.revision}/${file.id}`;return fileSchema.parse(file);
    });return {order,client,files,tasks:orderTasks(order)} satisfies Snapshot;
  }
  async create(workspace:string,input:unknown){
    z.uuid().parse(workspace);await this.authorize();
    const base=z.object({id:z.uuid(),name:z.string().min(1).max(200),email:z.email(),service:z.enum(['diagnostic','content','catalog','combined']),demo:z.literal(true),brief:z.unknown().optional(),content:z.unknown().optional(),filename:z.string().max(200).optional(),data:z.string().max(7_000_000).optional(),mapping:mappingSchema.optional(),profile:supplierProfileSchema.optional()}).strict().parse(input);
    const store=new Store(':memory:');try{
      const order=base.service==='diagnostic'||base.service==='content'?createEditorial(store,{...base,brief:base.brief,service:base.service}):await new Service(store).create({...base,filename:z.string().parse(base.filename),data:Buffer.from(z.string().parse(base.data),'base64'),mapping:mappingSchema.parse(base.mapping),service:base.service});
      const snapshot:Snapshot={...this.snapshot(store,order.id,workspace),requestHash:hash(JSON.stringify(base))};
      const created=await this.rpc({p_workspace:workspace,p_order:order.id,p_action:'create',p_payload:snapshot});
      // Metadata is durable before transfer: an interrupted upload is recoverable by retryUpload.
      for(const initial of snapshot.files){const file=created.payload.files.find(f=>f.name===initial.name&&f.sha256===initial.sha256);assert(file,'Materiais da solicitação divergentes do pedido persistido.');await this.upload(file,store.artifact(order.id,file.name));}return created;
    }finally{store.close();}
  }
  async action(workspace:string,id:string,action:string,extra:unknown={}){
    z.uuid().parse(workspace);z.uuid().parse(id);
    if(action==='inspect')return this.rpc({p_workspace:workspace,p_order:id,p_action:'get'});
    const owner=randomUUID();
    const state=await this.rpc({p_workspace:workspace,p_order:id,p_action:'claim',p_owner:owner});
    const store=await this.hydrate(state.payload).catch(async e=>{await this.rpc({p_workspace:workspace,p_order:id,p_action:'release',p_owner:owner,p_generation:state.generation}).catch(()=>{});throw e;});
    try{
      const svc=new Service(store),o=store.get(id);assert(o.demo,'Somente validação sintética.');
      switch(action){
        case 'approve':svc.approve(id);break;
        case 'demoPayment':svc.simulatePayment(id);break;
        case 'process':if(!['ready','delivered','closed'].includes(o.status))await svc.process(id);break;
        case 'demoDelivery':svc.delivered(id,o.deliveryId!);break;
        case 'cancel':svc.cancel(id);break;
        case 'revise':{
          if(['diagnostic','content'].includes(o.offer?.kind??'')){
            const request=z.object({brief:z.unknown(),reason:z.enum(['scope-adjustment','defect']).default('scope-adjustment')}).strict().parse(extra);
            reviseEditorial(store,id,request.brief,request.reason);
          }else{
            const request=z.object({filename:z.string().max(200),data:z.string().max(7_000_000),mapping:mappingSchema,reason:z.enum(['scope-adjustment','defect']).default('scope-adjustment')}).strict().parse(extra);
            await svc.revise(id,Buffer.from(request.data,'base64'),request.filename,request.mapping,request.reason);
          }break;
        }
        case 'revisionApprove':svc.approveRevision(id);break;
        case 'learningPropose':proposeLearning(store,{...z.object({problem:z.string(),evidence:z.array(z.string()),proposedRule:z.string()}).strict().parse(extra),orderId:id,revision:o.revision});break;
        case 'learningReview':{const values=z.object({id:z.uuid(),approved:z.boolean(),testEvidence:z.string()}).strict().parse(extra);reviewLearning(store,values.id,o.clientId,{approved:values.approved,testEvidence:values.testEvidence});break;}
        case 'economics':{
          const stageHoursSchema=z.partialRecord(z.enum(['intake','plan','production','quality','delivery','adjustments']),z.number().finite().nonnegative()).optional();
          const values=z.object({hours:z.number().finite().nonnegative().optional(),stageHours:stageHoursSchema,fees:z.number().finite().nonnegative(),costs:z.number().finite().nonnegative(),taxes:z.number().finite().nonnegative(),note:z.string().min(10).max(2000)}).strict().refine(v=>v.hours!==undefined||v.stageHours!==undefined,'Informe horas totais ou por etapa.').parse(extra);
          svc.recordEconomics(id,values);break;
        }
        default:throw Error('Ação não permitida.');
      }
      const payload={...this.snapshot(store,id,workspace,state.payload.files),requestHash:state.payload.requestHash};
      for(const file of payload.files)if(!state.payload.files.some(f=>f.id===file.id))await this.upload(file,store.artifact(id,file.name));
      return await this.rpc({p_workspace:workspace,p_order:id,p_action:'save',p_owner:owner,p_generation:state.generation,p_version:state.version,p_payload:payload});
    }finally{store.close();await this.rpc({p_workspace:workspace,p_order:id,p_action:'release',p_owner:owner,p_generation:state.generation}).catch(()=>{});}
  }
  async download(workspace:string,id:string){const state=await this.rpc({p_workspace:workspace,p_order:id,p_action:'get'});assert(['ready','delivered','closed'].includes(state.payload.order.status),'Entrega indisponível.');const s=await this.hydrate(state.payload);try{return s.artifact(id,`delivery-${state.payload.order.revision}.zip`);}finally{s.close();}}
}
