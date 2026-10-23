import {randomUUID} from 'node:crypto';
import AdmZip from 'adm-zip';
import {z} from 'zod';
import {Store} from '../store.ts';
import {agentPlaybook} from '../agent-playbooks.ts';
import {studioRequestSchema,studioScopeSchema,templateSchema,templateVersion,checkRequest,type StudioRequest,type StudioScope} from './contracts.ts';
import {digest,renderDescription,renderPreview,checkRendered,planContent} from './render.ts';
import {fixtureSvg} from './fixtures.ts';
import {pending,validateDeliverable,catalogFiles} from './adaptive.ts';
import {Examples} from './examples.ts';

const selectionSchema=z.object({template:templateSchema,color:z.string().max(100)}).strict();
const approvalSchema=selectionSchema.extend({operator:z.string().min(1).max(100),note:z.string().min(10).max(1000),
  visualChecked:z.literal(true),textChecked:z.literal(true),factsChecked:z.literal(true)}).strict();
export type StudioApproval=z.infer<typeof approvalSchema>&{hash:string;at:string};
export type StudioRecord={id:string;revision:number;status:'draft'|'approved'|'exported'|'cancelled';request:StudioRequest;
  requestHash:string;createdAt:string;updatedAt:string;approval?:StudioApproval;
  aiDraftJob?:string;
  effort?:{hours:number;fees:number|null;costs:number|null;taxes:number|null;note:string;recordedAt:string}};
export class ContentStudio {
  store:Store;
  constructor(store:Store){
    this.store=store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS content_studios(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,client_id TEXT NOT NULL REFERENCES clients(id),store_id TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS content_studio_revisions(id TEXT NOT NULL REFERENCES content_studios(id),revision INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(id,revision));
      CREATE TABLE IF NOT EXISTS content_studio_packages(id TEXT NOT NULL REFERENCES content_studios(id),revision INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(id,revision));
      CREATE TABLE IF NOT EXISTS content_studio_profiles(workspace_id TEXT NOT NULL,client_id TEXT NOT NULL REFERENCES clients(id),store_id TEXT NOT NULL,version TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(workspace_id,client_id,store_id,version));`);
  }
  get(id:string,scope:StudioScope):StudioRecord{
    studioScopeSchema.parse(scope);
    const row=this.store.db.prepare('SELECT data FROM content_studios WHERE id=? AND workspace_id=? AND client_id=? AND store_id=?').get(id,scope.workspaceId,scope.clientId,scope.storeId)as any;
    if(!row)throw Error('Conteúdo não encontrado neste cliente/loja/workspace.');
    const record=JSON.parse(row.data)as StudioRecord;
    const request=studioRequestSchema.parse(record.request);
    if(digest(record.request)!==record.requestHash)throw Error('Conteúdo persistido foi alterado.');
    if(digest(request)!==record.requestHash){
      // Only the known additive legacy media defaults may be migrated.
      const legacy=structuredClone(request) as any;
      for(let i=0;i<legacy.media.length;i++){
        const original=record.request.media[i] as any;
        if(!Object.hasOwn(original,'view'))delete legacy.media[i].view;
        if(!Object.hasOwn(original,'viewConfirmed'))delete legacy.media[i].viewConfirmed;
      }
      if(digest(legacy)!==record.requestHash)throw Error('Formato legado não reconhecido.');
      record.request=request;record.requestHash=digest(request);record.revision++;
      record.status='draft';delete record.approval;
      record.updatedAt=new Date().toISOString();this.write(record);
      this.store.db.prepare('INSERT INTO content_studio_revisions VALUES(?,?,?)').run(id,record.revision,JSON.stringify(request));
      this.invalidateLinked(record);
      this.store.audit(null,'QA-01','legacy_media_migrated',{id,revision:record.revision,approvalInvalidated:true});
    }
    return record;
  }
  list(){
    return (this.store.db.prepare('SELECT data FROM content_studios ORDER BY rowid DESC LIMIT 100').all()as any[]).map(r=>{
      const v=JSON.parse(r.data)as StudioRecord;
      return {id:v.id,scope:v.request.scope,revision:v.revision,status:v.status,product:v.request.product.title,brand:v.request.brand.name,category:v.request.adaptive?.category??'Sem categoria',updatedAt:v.updatedAt};
    });
  }
  private invalidateLinked(record:StudioRecord){
    if(!this.store.db.prepare("SELECT name FROM sqlite_master WHERE name='studio_order_links'").get())return;
    const link=this.store.db.prepare('SELECT order_id FROM studio_order_links WHERE studio_id=?').get(record.id) as any;
    if(!link)return;
    const order=this.store.get(link.order_id,record.request.scope.clientId);
    if(['closed','cancelled','refunded','refund_pending'].includes(order.status))return;
    order.revision++;order.scopeApproved=false;order.status='needs_info';delete order.deliveryId;delete order.qa;
    order.error='Conteúdo alterado: reconfira escopo e qualidade antes de gerar novo pacote.';
    this.store.save(order);
    this.store.db.prepare('UPDATE studio_order_links SET order_revision=? WHERE order_id=?').run(order.revision,order.id);
    this.store.audit(order.id,'QA-01','editorial_dependencies_invalidated',{studioId:record.id,revision:order.revision});
  }
  private profile(request:StudioRequest){
    const s=request.scope,data=JSON.stringify(request.brand);
    const old=this.store.db.prepare('SELECT data FROM content_studio_profiles WHERE workspace_id=? AND client_id=? AND store_id=? AND version=?').get(s.workspaceId,s.clientId,s.storeId,request.brand.version)as any;
    if(old&&old.data!==data)throw Error('Perfil já existe com esta versão; crie nova versão de marca.');
    this.store.db.prepare('INSERT OR IGNORE INTO content_studio_profiles VALUES(?,?,?,?,?)').run(s.workspaceId,s.clientId,s.storeId,request.brand.version,data);
  }
  private write(record:StudioRecord){
    const s=record.request.scope,data=JSON.stringify(record);
    this.store.db.prepare('INSERT INTO content_studios VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(record.id,s.workspaceId,s.clientId,s.storeId,data);
  }
  create(input:unknown,id:string=randomUUID()){
    z.uuid().parse(id);const request=studioRequestSchema.parse(input);
    if(!this.store.db.prepare('SELECT id FROM clients WHERE id=?').get(request.scope.clientId))throw Error('Cliente inexistente.');
    return this.store.transaction(()=>{
      const old=this.store.db.prepare('SELECT data FROM content_studios WHERE id=?').get(id);
      if(old){const record=this.get(id,request.scope);if(record.requestHash!==digest(request))throw Error('Identidade de criação já utilizada com outro conteúdo.');return record;}
      this.profile(request);
      const at=new Date().toISOString(),record:StudioRecord={id,revision:0,status:'draft',request,requestHash:digest(request),createdAt:at,updatedAt:at};
      this.write(record);
      this.store.db.prepare('INSERT INTO content_studio_revisions VALUES(?,?,?)').run(id,0,JSON.stringify(request));
      this.store.audit(null,'DATA-01','content_studio_created',{id,scope:request.scope,revision:0,demo:true});
      return record;
    });
  }
  revise(id:string,scope:StudioScope,expectedRevision:number,input:unknown){
    const request=studioRequestSchema.parse(input);
    if(JSON.stringify(request.scope)!==JSON.stringify(studioScopeSchema.parse(scope)))throw Error('Revisão não pode mudar cliente, loja ou workspace.');
    return this.store.transaction(()=>{
      const record=this.get(id,scope);if(record.status==='cancelled')throw Error('Conteúdo cancelado.');
      if(record.revision!==expectedRevision)throw Error('Revisão desatualizada; recarregue.');
      if(record.requestHash===digest(request))return record;
      this.profile(request);record.revision++;record.request=request;record.requestHash=digest(request);record.status='draft';delete record.approval;
      record.updatedAt=new Date().toISOString();this.write(record);
      this.store.db.prepare('INSERT INTO content_studio_revisions VALUES(?,?,?)').run(id,record.revision,JSON.stringify(request));
      this.invalidateLinked(record);
      this.store.audit(null,'QA-01','content_studio_revised',{id,revision:record.revision,approvalInvalidated:true});
      return record;
    });
  }
  preview(id:string,scope:StudioScope,template:unknown,color?:string,original=false){
    const record=this.get(id,scope);if(record.status==='cancelled')throw Error('Conteúdo cancelado.');
    return {record,html:renderPreview(record.request,template,{selectedColor:color,original,
      approved:!!record.approval&&record.approval.template===template&&record.approval.color===(color??'')&&record.approval.hash===this.approvalHash(record,record.approval)}),
      issues:checkRequest(record.request),plan:planContent(record.request)};
  }
  private assertLinkedOrder(record:StudioRecord){
    if(!this.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='studio_order_links'").get())return;
    const link=this.store.db.prepare('SELECT order_id,order_revision FROM studio_order_links WHERE studio_id=?').get(record.id) as any;
    if(!link)return;const o=this.store.get(link.order_id,record.request.scope.clientId);
    if(o.revision!==link.order_revision||['cancelled','refunded','refund_pending','closed'].includes(o.status))throw Error('Pedido vinculado cancelado/encerrado ou revisado; reconfirme o vínculo antes de executar.');
  }
  private approvalHash(record:StudioRecord,selection:z.infer<typeof selectionSchema>){
    return digest({revision:record.revision,request:record.request,templateVersion,selection:{template:selection.template,color:selection.color},
      html:renderDescription(record.request,selection.template,{selectedColor:selection.color}).html,
      skillVersion:agentPlaybook('quality','content').version});
  }
  approve(id:string,scope:StudioScope,revision:number,input:unknown){
    const selection=approvalSchema.parse(input);
    return this.store.transaction(()=>{
      const record=this.get(id,scope);if(record.status==='cancelled'||record.revision!==revision)throw Error('Revisão indisponível.');
      this.assertLinkedOrder(record);this.requireQuality(record);
      catalogFiles(record.request,selection.template,selection.color);
      const html=renderDescription(record.request,selection.template,{selectedColor:selection.color}).html;
      const issues=checkRendered(record.request,selection.template,html,selection.color);
      if(issues.length)throw Error(issues.map(i=>i.message).join('; '));
      if(record.approval){
        if(record.approval.hash===this.approvalHash(record,selection))return record;
        record.revision++;
        this.store.db.prepare('INSERT INTO content_studio_revisions VALUES(?,?,?)').run(id,record.revision,JSON.stringify(record.request));
      }
      record.approval={...selection,hash:this.approvalHash(record,selection),at:new Date().toISOString()};record.status='approved';record.updatedAt=record.approval.at;this.write(record);
      this.store.audit(null,'QA-01','content_studio_operator_approval',{id,revision:record.revision,template:selection.template,color:selection.color,operator:selection.operator,hash:record.approval.hash});
      return record;
    });
  }
  export(id:string,scope:StudioScope,revision:number){
    return this.store.transaction(()=>{
      const record=this.get(id,scope),approval=record.approval;
      if(!approval||!['approved','exported'].includes(record.status)||record.revision!==revision||
        approval.hash!==this.approvalHash(record,approval)||checkRequest(record.request).length)throw Error('Exportação exige a revisão atual aprovada, sem bloqueios.');
      this.requireQuality(record);
      const old=this.store.db.prepare('SELECT data FROM content_studio_packages WHERE id=? AND revision=?').get(id,revision)as any;
      if(old)return Buffer.from(old.data);
      const zip=new AdmZip(),request=record.request;
      const portable=(html:string)=>html.replaceAll('src="/studio-fixture-sand.svg"','src="midias/studio-fixture-sand.svg"').replaceAll('src="/studio-fixture-blue.svg"','src="midias/studio-fixture-blue.svg"');
      const html=portable(renderDescription(request,approval.template,{selectedColor:approval.color}).html);
      for(const [name,data]of Object.entries(catalogFiles(request,approval.template,approval.color)))zip.addFile(name,Buffer.from(data));
      zip.addFile('descricao.html',Buffer.from(html));
      zip.addFile('previa.html',Buffer.from(portable(renderPreview(request,approval.template,{selectedColor:approval.color,approved:true}))));
      for(const variant of ['sand','blue']as const)if(request.media.some(m=>m.url==='/studio-fixture-'+variant+'.svg'))zip.addFile('midias/studio-fixture-'+variant+'.svg',Buffer.from(fixtureSvg(variant)));
      zip.addFile('original.html.txt',Buffer.from(request.product.original.html));zip.addFile('original-texto.txt',Buffer.from(request.product.original.text));
      zip.addFile('midias.json',Buffer.from(JSON.stringify(request.media,null,2)));
      zip.addFile('fontes.json',Buffer.from(JSON.stringify({productId:request.product.id,source:request.product.source,facts:request.product.facts,blocks:request.blocks},null,2)));
      zip.addFile('manifest.json',Buffer.from(JSON.stringify({id,revision,scope,productId:request.product.id,existing:request.product.existing,
        target:'Revisão de descrição do produto identificado; não criar produto novo.',templateVersion,selection:{template:approval.template,color:approval.color},
        requestHash:record.requestHash,htmlHash:digest(html),approval,demo:true,mode:record.aiDraftJob?'ai-draft-operator-reviewed':'deterministic-approved-blocks',aiDraftJob:record.aiDraftJob??null},null,2)));
      zip.addFile('qualidade.json',Buffer.from(JSON.stringify({issues:[],checks:['Identidade e SKU','Fatos e referências aprovados','Mídia e cor','HTML controlado','Revisão/hash atual','Confirmação visual declarada pelo operador'],
        limits:['Não há verificação semântica automática completa das alegações.','Confirmações humanas são declarações registradas do operador.','Não valida tema, SEO, conversão ou importação.','Fragmento estático representa a cor selecionada; não implementa troca de variantes no tema.']},null,2)));
      zip.addFile('LEIA-ME.txt',Buffer.from('Prévia local supervisionada. Cliente revisa e aplica. Sem publicação, cobrança ou envio. Imagens são referências autorizadas, não foram hospedadas por nós. /studio-fixture-*.svg indica ilustração sintética local; substituir por mídia autorizada antes de uso comercial.'));
      const buffer=zip.toBuffer();this.store.db.prepare('INSERT INTO content_studio_packages VALUES(?,?,?)').run(id,revision,buffer);
      record.status='exported';record.updatedAt=new Date().toISOString();this.write(record);
      this.store.audit(null,'DELIVERY-01','content_studio_exported',{id,revision,demo:true,sent:false});return buffer;
    });
  }
  cancel(id:string,scope:StudioScope,revision:number){
    return this.store.transaction(()=>{const r=this.get(id,scope);if(r.revision!==revision)throw Error('Revisão desatualizada.');r.status='cancelled';delete r.approval;this.write(r);this.store.audit(null,'CANCEL-01','content_studio_cancelled',{id,revision});return r;});
  }
  effort(id:string,scope:StudioScope,input:unknown){
    const value=z.object({hours:z.number().finite().nonnegative(),fees:z.number().finite().nonnegative().nullable(),costs:z.number().finite().nonnegative().nullable(),
      taxes:z.number().finite().nonnegative().nullable(),note:z.string().min(10).max(1000)}).strict().parse(input);
    return this.store.transaction(()=>{const r=this.get(id,scope);r.effort={...value,recordedAt:new Date().toISOString()};this.write(r);this.store.audit(null,'PAY-01','content_studio_effort',{id,scope,...value,currency:'brl',revenue:null,simulated:true});return r;});
  }
  advice(id:string,scope:StudioScope,role:'planner'|'production'|'quality'){
    const r=this.get(id,scope);if(r.status==='cancelled')throw Error('Conteúdo cancelado.');this.assertLinkedOrder(r);
    const playbookVersion=agentPlaybook(role,'content').version;
    return {id:'studio-advice-'+digest({id,revision:r.revision,status:r.status,hash:r.requestHash,role,playbookVersion}).slice(0,32),role,
      clientId:scope.clientId,input:{service:'content',studioId:id,scope,revision:r.revision,status:r.status,requestHash:r.requestHash,playbookVersion,
        brand:{name:r.request.brand.name,tone:r.request.brand.tone,audience:r.request.brand.audience,proposition:r.request.brand.proposition,forbiddenTerms:r.request.brand.forbiddenTerms,approved:r.request.brand.approved},
        product:{id:r.request.product.id,title:r.request.product.title,variants:r.request.product.variants.length,facts:r.request.product.facts.length,
          media:r.request.media.length},approvedFacts:role==='production'?r.request.product.facts.filter(f=>f.approved).slice(0,10).map(f=>({id:f.id,text:f.text.slice(0,600),source:f.source.slice(0,200)})):[],
        factCoverage:'Contexto limitado; não inferir fatos omitidos.',
        pending:checkRequest(r.request).filter(i=>role!=='quality'||i.code!=='COPY_PENDING'),approvedTemplate:r.approval?.template??null,
        limits:'Contexto resumido. Não recebeu imagens nem fichas completas; não declare análise visual, publicação ou aceite do cliente. Resposta é consultiva.'}};
  }
  structuredAdvice(id:string,scope:StudioScope,role:'planner'|'production'|'quality'){
    const task=this.advice(id,scope,role),r=this.get(id,scope);
    if(r.request.product.facts.length>10||r.request.blocks.length>10)throw Error('Divida o pedido: contexto editorial limitado a dez fatos e dez blocos.');
    const input={...task.input,structured:true,approvedFacts:r.request.product.facts.filter(f=>f.approved).map(f=>({id:f.id,text:f.text,source:f.source,section:f.section})),
      blocks:r.request.blocks,category:r.request.adaptive?.category??'não classificada',
      components:r.request.adaptive?.components??[],
      examples:role==='production'?new Examples(this.store).retrieve(scope,r.request.adaptive?.category??'',r.request.product.title,r.request.product.id):[],
      pending:pending(r.request,role)};
    return {...task,id:task.id+'-structured',input};
  }
  applyDraft(id:string,scope:StudioScope,revision:number,jobId:string){
    return this.store.transaction(()=>{
      const r=this.get(id,scope);
      if(r.status==='cancelled')throw Error('Conteúdo cancelado.');this.assertLinkedOrder(r);
      if(r.aiDraftJob===jobId)return r;
      if(r.revision!==revision)throw Error('Revisão indisponível.');
      const job=this.jobs(id,scope).find(j=>j.id===jobId&&j.status==='done'&&j.role==='production');
      if(!job)throw Error('Entrega de produção inexistente nesta revisão.');
      const d=validateDeliverable(r.request,'production',job.result?.deliverable);if(d.kind!=='draft')throw Error('Rascunho esperado.');
      const request=studioRequestSchema.parse({...r.request,mode:'rewrite',blocks:d.blocks.map(b=>({...b,approved:false}))});
      const next:StudioRecord={...r,request,revision:r.revision+1,requestHash:digest(request),status:'draft',updatedAt:new Date().toISOString(),aiDraftJob:jobId};
      delete next.approval;this.write(next);
      this.store.db.prepare('INSERT INTO content_studio_revisions VALUES(?,?,?)').run(id,next.revision,JSON.stringify(request));
      this.store.audit(null,'QA-01','structured_draft_applied',{id,jobId,revision:next.revision,approved:false});return next;
    });
  }
  private requireQuality(record:StudioRecord){
    if(!record.aiDraftJob)return;
    const unapprovedDraftHash=digest({...record.request,blocks:record.request.blocks.map(b=>({...b,approved:false}))});
    const jobs=(this.store.db.prepare("SELECT input,result FROM ai_jobs WHERE client_id=? AND role='quality' AND status='done' ORDER BY rowid DESC").all(record.request.scope.clientId)as any[]).filter(row=>{
      const input=JSON.parse(row.input);
      return input.structured===true&&input.studioId===record.id&&JSON.stringify(input.scope)===JSON.stringify(record.request.scope)&&(input.requestHash===record.requestHash||input.requestHash===unapprovedDraftHash)&&input.playbookVersion===agentPlaybook('quality','content').version;
    }).map(row=>({result:JSON.parse(row.result)}));
    const latest=jobs[0];if(!latest)throw Error('Rascunho IA exige conferência independente desta revisão.');
    const d=validateDeliverable(record.request,'quality',latest.result.deliverable);
    if(d.kind!=='quality'||d.verdict!=='pass')throw Error('Qualidade bloqueou a entrega.');
  }
  handoff(id:string,scope:StudioScope){
    const r=this.get(id,scope),questions=pending(r.request);
    return {revision:r.revision,status:r.status,owner:r.status==='cancelled'?'coordinator':questions.some(q=>q.required)?'support':r.aiDraftJob?'quality':'planner',questions,
      next:r.status==='cancelled'?'Cancelado':questions.some(q=>q.required)?'Resolver pendências essenciais':'Revisar proposta e fontes',
      coverage:r.request.adaptive?.coverage??null,examples:new Examples(this.store).list(scope).map(({blocks,...meta})=>meta)};
  }
  learn(id:string,scope:StudioScope,input:unknown){
    const r=this.get(id,scope);if(!r.approval||!['approved','exported'].includes(r.status)||r.approval.hash!==this.approvalHash(r,r.approval))throw Error('Aprendizado exige revisão aprovada.');
    return new Examples(this.store).save(scope,{id,revision:r.revision,category:r.request.adaptive?.category??'',productId:r.request.product.id,blocks:planContent(r.request).blocks},input);
  }
  jobs(id:string,scope:StudioScope){
    const current=this.get(id,scope);
    const unapprovedDraftHash=current.aiDraftJob?digest({...current.request,blocks:current.request.blocks.map(b=>({...b,approved:false}))}):null;
    return (this.store.db.prepare('SELECT id,role,status,input,result,error FROM ai_jobs WHERE client_id=? ORDER BY rowid DESC LIMIT 100').all(scope.clientId)as any[]).filter(row=>{
      const input=JSON.parse(row.input);return input.studioId===id&&JSON.stringify(input.scope)===JSON.stringify(scope)&&(input.revision===current.revision||(unapprovedDraftHash!==null&&row.role==='quality'&&input.requestHash===unapprovedDraftHash));
    }).map(({input,...row})=>({...row,result:row.result?JSON.parse(row.result):null}));
  }
}
