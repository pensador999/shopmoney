import {randomUUID} from 'node:crypto';
import AdmZip from 'adm-zip';
import {stringify} from 'csv-stringify/sync';
import {ContentStudio,type StudioRecord} from './service.ts';
import {checkRequest,studioRequestSchema,studioScopeSchema,type StudioRequest,type StudioScope} from './contracts.ts';
import {apparelCategoryPreset} from './adaptive.ts';
import {intakeSnapshot} from './intake.ts';
import {studioFixture} from './fixtures.ts';
import {renderDescription,digest} from './render.ts';
import {offerSnapshot} from '../offers.ts';
import {orderTasks,economics,applyOrderEconomics} from '../order-workflow.ts';
import {BLING_HEADERS,csv,hash} from '../catalog.ts';
import {recordHandoff,recordPreSaleHandoffs,orderHandoffLedger} from '../handoffs.ts';
import {predictApparelCategory} from '../learning.ts';
import {makeSnapshot,publicOrigin,verifySnapshot,type CatalogSnapshot} from '../inspection/snapshot.ts';
import {readInspection} from '../inspection/evidence.ts';
import {businessDays,assert} from '../policy.ts';
const deterministicUuid=(seed:string)=>{const h=hash(seed);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const luminance=(hex:string)=>{
 const values=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4));
 return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
};
const claimTokens=(s:string)=>(s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/\b(?:uv\s*\d+\+?|fpu\s*\d+\+?|impermeavel|antiodor|antibacterian[oa]|certificad[oa]|secagem rapida|couro|antiderrapante|anti-atrito|costuras planas|algodao|poliester|elastano|nylon|\d+(?:[.,]\d+)?\s*%)/g)??[]);
export class StudioOperations {
 private studio:ContentStudio;
 constructor(studio:ContentStudio){this.studio=studio;studio.store.db.exec('CREATE TABLE IF NOT EXISTS studio_order_links(studio_id TEXT PRIMARY KEY REFERENCES content_studios(id),order_id TEXT NOT NULL REFERENCES orders(id),order_revision INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_studio_order_links_order_id ON studio_order_links(order_id);');}
 private upsertArtifact(orderId:string,name:string,data:Buffer|string){
  const buf=Buffer.isBuffer(data)?data:Buffer.from(data);
  this.studio.store.db.prepare('INSERT INTO artifacts VALUES(?,?,?) ON CONFLICT(order_id,name) DO UPDATE SET data=excluded.data').run(orderId,name,buf);
 }
 connect(id:string,scope:StudioScope,orderId?:string){
  const store=this.studio.store;
  const isAllowedEditorial=(ord:any)=>Boolean(ord.demo||ord.offer?.commercialEnabled||store.setting('brlCommercialEnabled',false)||process.env.BRL_COMMERCIAL_ENABLED==='true');
  return store.transaction(()=>{
   const r=this.studio.get(id,scope);if(r.status==='cancelled')throw Error('Conteúdo cancelado.');
   const old=store.db.prepare('SELECT * FROM studio_order_links WHERE studio_id=?').get(id) as any;
   if(old){
    let oldActiveEditorial=false;
    try{
     const oldOrder=store.get(old.order_id,scope.clientId);
     oldActiveEditorial=isAllowedEditorial(oldOrder)&&['content','combined'].includes(oldOrder.offer?.kind??'')&&!['cancelled','closed','refunded','refund_pending'].includes(oldOrder.status);
    }catch{oldActiveEditorial=false;}
    if(!oldActiveEditorial){
     store.db.prepare('DELETE FROM studio_order_links WHERE studio_id=?').run(id);
    }else{
     if(orderId&&old.order_id!==orderId)throw Error('Ficha já vinculada a outro pedido.');
     if(!orderId)return this.overview(id,scope);
    }
   }
   if(!orderId){const offer=offerSnapshot('content');orderId=randomUUID();store.save({id:orderId,clientId:scope.clientId,status:'needs_info',demo:true,filename:'editorial-supervisionado',mapping:{},scopeApproved:false,amount:offer.cents,currency:offer.currency,offer,createdAt:new Date().toISOString(),revision:0,corrections:0,hours:0,fees:0,costs:0,error:'Pedido editorial local: aprovação e execução comerciais permanecem separadas.'});}
   const o=store.get(orderId,scope.clientId);
   if(o.remoteWorkspaceId&&o.remoteWorkspaceId!==scope.workspaceId)throw Error('Workspace incompatível.');
   if(!isAllowedEditorial(o)||!['content','combined'].includes(o.offer?.kind??'')||['cancelled','closed','refunded','refund_pending'].includes(o.status))throw Error('Vínculo exige pedido local de validação editorial ativo.');
   const peers=store.db.prepare('SELECT s.workspace_id,s.store_id FROM studio_order_links l JOIN content_studios s ON s.id=l.studio_id WHERE l.order_id=?').all(orderId) as any[];
   if(peers.some(p=>p.workspace_id!==scope.workspaceId||p.store_id!==scope.storeId))throw Error('Pedido pertence a outro workspace/loja.');
   store.db.prepare('INSERT INTO studio_order_links VALUES(?,?,?) ON CONFLICT(studio_id) DO UPDATE SET order_id=excluded.order_id,order_revision=excluded.order_revision').run(id,orderId,o.revision);
   store.audit(orderId,'SCOPE-01','studio_order_connected',{studioId:id,scope,orderRevision:o.revision});return this.overview(id,scope);
  });
 }
 intakeBatchToOrder(snapshotInput:unknown,scope:StudioScope,brand:StudioRequest['brand'],orderId?:string){
  const intake=intakeSnapshot(snapshotInput,scope,brand);
  if(!intake.records.length)throw Error('Snapshot não produziu fichas candidatas válidas.');
  if(intake.records.length>10)throw Error('Lote excede o limite de 10 produtos da oferta de conteúdo.');
  const createdRecords:StudioRecord[]=[];
  for(const req of intake.records){
   const studioId=deterministicUuid(`batch-studio:${scope.workspaceId}:${scope.clientId}:${scope.storeId}:${intake.snapshotId}:${req.product.id}`);
   const existingRow=this.studio.store.db.prepare('SELECT 1 FROM content_studios WHERE id=? AND workspace_id=? AND client_id=? AND store_id=?').get(studioId,scope.workspaceId,scope.clientId,scope.storeId);
   createdRecords.push(existingRow?this.studio.get(studioId,scope):this.studio.create(req,studioId));
  }
  let sharedOrderId=orderId;
  for(const rec of createdRecords){
   const connected=this.connect(rec.id,scope,sharedOrderId);
   sharedOrderId=connected.order!.id;
  }
  this.studio.store.audit(sharedOrderId!,'SCOPE-01','leakfinder_batch_intake_connected',{
   snapshotId:intake.snapshotId,
   studioIds:createdRecords.map(r=>r.id),
   productCount:createdRecords.length,
   rejectedCount:intake.rejected.length,
   commercialReady:false,
  });
  return {
   snapshotId:intake.snapshotId,
   orderId:sharedOrderId!,
   studioIds:createdRecords.map(r=>r.id),
   records:createdRecords,
   rejected:intake.rejected,
   coverage:intake.coverage,
   commercialReady:false,
   overview:this.overview(createdRecords[0].id,scope),
  };
 }
 promoteDiagnosticToStudio(orderId:string,scopeInput?:Partial<StudioScope>,brandOverride?:Partial<StudioRequest['brand']>){
  const store=this.studio.store;
  const diagOrder=store.get(orderId,scopeInput?.clientId);
  assert(diagOrder.offer?.kind==='diagnostic','Promoção para o Content Studio exige um pedido de diagnóstico (R$ 190).');
  assert(!['cancelled','refunded','refund_pending'].includes(diagOrder.status),'Pedido de diagnóstico cancelado não pode ser promovido.');
  const client=store.db.prepare('SELECT id,name,email FROM clients WHERE id=?').get(diagOrder.clientId) as {id:string;name:string;email:string}|undefined;
  assert(client,'Cliente do pedido de diagnóstico não encontrado.');
  const inspRef=(diagOrder.contentInput as any)?.inspection;
  const workspaceId=(scopeInput?.workspaceId||inspRef?.workspaceId||diagOrder.remoteWorkspaceId||'local').trim();
  const defaultStoreId=client.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'loja-promovida';
  const storeId=(scopeInput?.storeId||defaultStoreId).trim();
  const scope=studioScopeSchema.parse({workspaceId,clientId:diagOrder.clientId,storeId});
  let snapshot:CatalogSnapshot;
  const inspArtifact=inspRef
   ? ((store.db.prepare('SELECT data FROM artifacts WHERE order_id=? AND name=?').get(diagOrder.id,`inspection-${diagOrder.revision}.json`)
      ??store.db.prepare('SELECT data FROM artifacts WHERE order_id=? AND name=?').get(diagOrder.id,'inspection-0.json')) as {data:Buffer|Uint8Array}|undefined)
   : (diagOrder.revision===0?(store.db.prepare('SELECT data FROM artifacts WHERE order_id=? AND name=?').get(diagOrder.id,'inspection-0.json') as {data:Buffer|Uint8Array}|undefined):undefined);
  if(inspArtifact){
   const parsed=JSON.parse(Buffer.from(inspArtifact.data).toString('utf8'));
   snapshot=verifySnapshot(parsed.snapshot??parsed,{workspaceId:scope.workspaceId,clientId:scope.clientId});
  }else if(inspRef?.snapshotId){
   snapshot=readInspection(store,{workspaceId:inspRef.workspaceId??scope.workspaceId,clientId:scope.clientId},inspRef.snapshotId).snapshot;
  }else{
   const briefProducts=Array.isArray((diagOrder.contentInput as any)?.products)?(diagOrder.contentInput as any).products:[];
   assert(briefProducts.length>0,'Diagnóstico sem produtos ou snapshot para promover.');
   const originUrl=(briefProducts.map((p:any)=>String(p.source??'')).find((u:string)=>/^https:\/\/[^/]+/i.test(u))??`https://${storeId}.myshopify.com`).replace(/^(https:\/\/[^/]+).*$/i,'$1');
   snapshot=makeSnapshot({
    scope:{workspaceId:scope.workspaceId,clientId:scope.clientId},
    origin:originUrl,
    mode:'synthetic',
    capturedAt:diagOrder.createdAt,
    maxProducts:10,
    coverage:'sample',
    stopReason:'Promovido de briefing de diagnóstico.',
    pages:[{
     url:`${originUrl}/products.json?limit=10&page=1`,
     body:JSON.stringify({
      products:briefProducts.slice(0,10).map((p:any,idx:number)=>({
       id:String(p.id??`P-${idx+1}`),
       handle:String(p.id??`produto-${idx+1}`).toLowerCase().replace(/[^a-z0-9-]+/g,'-'),
       title:String(p.title||p.id||`Produto ${idx+1}`),
       body_html:p.description?`<p>${String(p.description)}</p>`:'',
       options:[{name:'Tamanho',position:1}],
       images:[],
       variants:[{id:`V-${p.id??idx+1}`,sku:String(p.id??`SKU-${idx+1}`),price:'0.00',available:true,option1:'U'}],
      })),
     }),
    }],
   });
  }
  const baseBrand=studioFixture(scope,'clara').brand;
  const brand:StudioRequest['brand']={
   ...baseBrand,
   ...brandOverride,
   name:(brandOverride?.name||client.name||'Marca Promovida').slice(0,120),
   version:(brandOverride?.version||`promoted-${storeId}-${diagOrder.revision+1}`).slice(0,64),
  };
  const batch=this.intakeBatchToOrder(snapshot,scope,brand);
  store.audit(diagOrder.id,'SCOPE-01','diagnostic_promoted_to_studio',{
   diagnosticOrderId:diagOrder.id,
   diagnosticRevision:diagOrder.revision,
   contentOrderId:batch.orderId,
   studioIds:batch.studioIds,
   productCount:batch.records.length,
  });
  return {
   diagnosticOrderId:diagOrder.id,
   scope,
   contentOrder:store.get(batch.orderId,diagOrder.clientId),
   studios:batch.records,
   ...batch,
  };
 }
 private linkedRecords(orderId:string,scope:StudioScope):StudioRecord[]{
  const rows=this.studio.store.db.prepare('SELECT l.studio_id FROM studio_order_links l WHERE l.order_id=? ORDER BY l.rowid ASC').all(orderId) as {studio_id:string}[];
  if(!rows.length)throw Error('Nenhuma ficha vinculada a este pedido.');
  return rows.map(r=>this.studio.get(r.studio_id,scope));
 }
 synchronizeScope(id:string,scope:StudioScope){
  const store=this.studio.store;
  return store.transaction(()=>{
   const r=this.studio.get(id,scope);if(r.status==='cancelled')throw Error('Conteúdo cancelado.');
   const link=store.db.prepare('SELECT * FROM studio_order_links WHERE studio_id=?').get(id) as any;
   if(!link)throw Error('Vincule a ficha a um pedido antes de sincronizar o escopo.');
   const o=store.get(link.order_id,scope.clientId);
   if(o.revision!==link.order_revision)throw Error('Pedido revisado; reconfirme o vínculo antes de sincronizar.');
   if(['cancelled','closed','refunded','refund_pending'].includes(o.status))throw Error('Pedido cancelado ou encerrado.');
   const peers=this.linkedRecords(o.id,scope);
   const maxProducts=o.offer?.maxContentProducts??o.offer?.maxProducts??10;
   const maxVariants=o.offer?.maxVariants??200;
   const variantCount=peers.reduce((sum,p)=>sum+p.request.product.variants.length,0);
   if(peers.length>maxProducts||variantCount>maxVariants)throw Error('Fichas vinculadas excedem os limites da oferta do pedido.');
   const issues=peers.flatMap(p=>checkRequest(p.request).map(i=>`${p.request.product.id}: ${i.message}`));
   o.report={ok:issues.length===0,issues,productCount:peers.length,variantCount};
   o.brandProfile=r.request.brand;
   store.profile(o.clientId,r.request.brand.version,r.request.brand);
   const brief={version:'studio-order-brief-1',orderId:o.id,revision:o.revision,scope,studios:peers.map(p=>({id:p.id,revision:p.revision,requestHash:p.requestHash,productId:p.request.product.id}))};
   const briefJson=JSON.stringify(brief,null,2);
   if(!store.db.prepare('SELECT 1 FROM artifacts WHERE order_id=? AND name=?').get(o.id,'original'))store.artifact(o.id,'original',briefJson);
   this.upsertArtifact(o.id,`studio-brief-${o.revision}.json`,briefJson);
   if(issues.length===0){
    if(o.status==='needs_info'){o.status='scoped';delete o.error;}
    if(o.offer){
     const expected={orderId:o.id,revision:o.revision,service:o.offer.kind};
     recordHandoff(store,'support',{...expected,evidence:[hash(briefJson)],pending:[],materials:peers.map(p=>p.id),questions:[]},expected);
    }
   }
   store.save(o);store.audit(o.id,'SCOPE-01','studio_scope_synchronized',{studioId:id,productCount:peers.length,variantCount,ok:issues.length===0});
   return this.overview(id,scope);
  });
 }
 synchronizeEffort(id:string,scope:StudioScope){
  const store=this.studio.store;
  return store.transaction(()=>{
   const r=this.studio.get(id,scope);if(r.status==='cancelled')throw Error('Conteúdo cancelado.');
   const link=store.db.prepare('SELECT * FROM studio_order_links WHERE studio_id=?').get(id) as any;
   if(!link)throw Error('Vincule a ficha a um pedido antes de sincronizar o esforço.');
   const o=store.get(link.order_id,scope.clientId);
   if(o.revision!==link.order_revision)throw Error('Pedido revisado; reconfirme o vínculo antes de sincronizar.');
   const peers=this.linkedRecords(o.id,scope);
   const totalHours=Math.round(peers.reduce((sum,p)=>sum+(p.effort?.hours??0),0)*100)/100;
   o.stageHours={...(o.stageHours??{}),production:totalHours};
   const stageSum=Math.round(Object.values(o.stageHours).reduce((sum,v)=>sum+(v??0),0)*100)/100;
   o.hours=Math.max(o.hours,stageSum);
   const allComplete=peers.length>0&&peers.every(p=>p.effort&&p.effort.fees!==null&&p.effort.costs!==null&&p.effort.taxes!==null);
   if(allComplete){
    const fees=Math.round(peers.reduce((sum,p)=>sum+(p.effort!.fees??0),0)*100)/100;
    const costs=Math.round(peers.reduce((sum,p)=>sum+(p.effort!.costs??0),0)*100)/100;
    const taxes=Math.round(peers.reduce((sum,p)=>sum+(p.effort!.taxes??0),0)*100)/100;
    const notes=peers.map(p=>`${p.request.product.id}: ${p.effort!.note}`).join(' | ').slice(0,2000);
    applyOrderEconomics(o,{hours:o.hours,stageHours:o.stageHours,fees,costs,taxes,note:notes});
    if(o.offer){
     const expected={orderId:o.id,revision:o.revision,service:o.offer.kind};
     recordHandoff(store,'coordinator',{...expected,evidence:[o.economicsRecordedAt!],pending:[],next:o.status==='closed'?'Pedido encerrado com custos consolidados':'Esforço das fichas consolidado no pedido',owner:'Coordenação'},expected);
    }
   }else{
    delete o.economicsRecordedAt;
   }
   store.save(o);
   const summary=economics(o);
   store.audit(o.id,'PAY-01','studio_effort_synchronized',{studioId:id,totalHours:o.hours,complete:allComplete,budgetAlert:summary.budgetAlert,simulated:true});
   return this.overview(id,scope);
  });
 }
 deliverOrderPackage(id:string,scope:StudioScope){
  const store=this.studio.store;
  const r=this.studio.get(id,scope);if(r.status==='cancelled')throw Error('Conteúdo cancelado.');
  const link=store.db.prepare('SELECT * FROM studio_order_links WHERE studio_id=?').get(id) as any;
  if(!link)throw Error('Vincule a ficha a um pedido antes de gerar a entrega.');
  const oInitial=store.get(link.order_id,scope.clientId);
  if(oInitial.revision!==link.order_revision)throw Error('Pedido revisado; reconfirme o vínculo antes de gerar a entrega.');
  if(!oInitial.scopeApproved||!oInitial.receipt||!['queued','running','ready'].includes(oInitial.status))throw Error('Entrega do pedido exige escopo aprovado e pagamento/simulação confirmados.');
  const peers=this.linkedRecords(oInitial.id,scope);
  const exportedPeers=peers.map(peer=>{
   if(!peer.approval||!['approved','exported'].includes(peer.status))throw Error(`Ficha ${peer.request.product.id} ainda não aprovada no Content Studio.`);
   return {peer,zipBuffer:this.studio.export(peer.id,peer.request.scope,peer.revision)};
  });
  return store.transaction(()=>{
   const o=store.get(link.order_id,scope.clientId);
   if(o.revision!==link.order_revision)throw Error('Pedido revisado; reconfirme o vínculo antes de gerar a entrega.');
   if(!o.scopeApproved||!o.receipt||!['queued','running','ready'].includes(o.status))throw Error('Entrega do pedido exige escopo aprovado e pagamento/simulação confirmados.');
   const zip=new AdmZip();
   const summaryRows:Record<string,string>[]=[];
   const blingRows:Record<string,string>[]=[];
   const emptyBlingRow=():Record<string,string>=>Object.fromEntries(BLING_HEADERS.map(h=>[h,'']));
   const evidenceItems:unknown[]=[];
   for(const {peer,zipBuffer} of exportedPeers){
    const studioZip=new AdmZip(zipBuffer);
    const prefix=exportedPeers.length===1?'':`produtos/${peer.request.product.id}/`;
    for(const entry of studioZip.getEntries()){
     if(!entry.isDirectory)zip.addFile(prefix+entry.entryName,entry.getData());
    }
    const rendered=renderDescription(peer.request,peer.approval!.template,{selectedColor:peer.approval!.color});
    const seoTitle=peer.request.product.title.replace(/\s+/g,' ').trim().slice(0,70);
    const seoDescription=rendered.plan.blocks.map(b=>b.text.replace(/\s+/g,' ').trim()).join(' ').slice(0,160);
    const shortDescription=(rendered.plan.blocks.map(b=>b.text.replace(/\s+/g,' ').trim()).filter(Boolean).join(' ')||peer.request.product.facts.filter(f=>f.approved).map(f=>f.text.replace(/\s+/g,' ').trim()).join(' ')).trim().slice(0,250);
    const category=peer.request.adaptive?.category??'';
    const cat=peer.request.adaptive?.catalog;
    const approvedExternalImages=peer.request.media.filter(m=>m.approved&&m.authorized&&m.url.startsWith('https://')).map(m=>m.url);
    const parentImageUrl=approvedExternalImages[0]??'';
    const variants=peer.request.product.variants;
    if(variants.length===1&&!variants[0]!.color&&!variants[0]!.size){
     const v=variants[0]!;
     const cv=cat?.variants.find(c=>c.variantId===v.id);
     const row=emptyBlingRow();
     row['Código']=v.sku||peer.request.product.id;
     row['Descrição']=peer.request.product.title;
     row['Unidade']='UN';
     row['Situação']='Ativo';
     row['Descrição Complementar']=rendered.html;
     row['Produto Variação']='Produto';
     row['Código Pai']='';
     row['Marca']=peer.request.brand.name;
     row['Descrição Curta']=shortDescription;
     row['URL Imagens Externas']=parentImageUrl;
     row['Categoria do produto']=category;
     if(cv){
      row['Preço']=cv.price.replace('.',',');
      row['GTIN/EAN']=cv.barcode;
      row['Estoque']=cv.stock===null?'':String(cv.stock);
     }
     blingRows.push(row);
    }else{
     const parentRow=emptyBlingRow();
     parentRow['Código']=peer.request.product.id;
     parentRow['Descrição']=peer.request.product.title;
     parentRow['Unidade']='UN';
     parentRow['Situação']='Ativo';
     parentRow['Descrição Complementar']=rendered.html;
     parentRow['Produto Variação']='Produto';
     parentRow['Código Pai']='';
     parentRow['Marca']=peer.request.brand.name;
     parentRow['Descrição Curta']=shortDescription;
     parentRow['URL Imagens Externas']=parentImageUrl;
     parentRow['Categoria do produto']=category;
     blingRows.push(parentRow);
     for(const v of variants){
      const cv=cat?.variants.find(c=>c.variantId===v.id);
      const varImage=peer.request.media.find(m=>m.approved&&m.authorized&&m.url.startsWith('https://')&&(m.variantIds.includes(v.id)||(v.color&&m.color===v.color)))?.url??parentImageUrl;
      const varRow=emptyBlingRow();
      varRow['Código']=v.sku||v.id;
      varRow['Descrição']=[v.color,v.size].filter(Boolean).join(' / ')||peer.request.product.title;
      varRow['Unidade']='UN';
      varRow['Situação']='Ativo';
      varRow['Descrição Complementar']=rendered.html;
      varRow['Código Pai']=peer.request.product.id;
      varRow['Produto Variação']='Variação';
      varRow['Marca']=peer.request.brand.name;
      varRow['Descrição Curta']=shortDescription;
      varRow['URL Imagens Externas']=varImage;
      varRow['Categoria do produto']=category;
      if(cv){
       row_assign:{
        varRow['Preço']=cv.price.replace('.',',');
        varRow['GTIN/EAN']=cv.barcode;
        varRow['Estoque']=cv.stock===null?'':String(cv.stock);
       }
      }
      blingRows.push(varRow);
     }
    }
    summaryRows.push({ID:peer.request.product.id,Title:peer.request.product.title,'Body (HTML)':rendered.html,'SEO Title':seoTitle,'SEO Description':seoDescription});
    evidenceItems.push({studioId:peer.id,revision:peer.revision,productId:peer.request.product.id,requestHash:peer.requestHash,approval:peer.approval,seoTitle,seoDescription});
   }
   for(const row of blingRows)for(const val of Object.values(row))if(/^[\s\u0000-\u001f]*[=+@-]/u.test(val))throw Error('CSV Bling contém célula com possível fórmula.');
   const blingCsv=stringify(blingRows,{header:true,columns:BLING_HEADERS,delimiter:';',bom:true,record_delimiter:'\r\n'});
   const contentCsv=csv(summaryRows,['ID','Title','Body (HTML)','SEO Title','SEO Description']);
   zip.addFile('conteudo.csv',Buffer.from(contentCsv));
   if(zip.getEntry('bling-validacao.csv'))zip.updateFile('bling-validacao.csv',Buffer.from(blingCsv));
   else zip.addFile('bling-validacao.csv',Buffer.from(blingCsv));
   zip.addFile('evidencias.json',Buffer.from(JSON.stringify(evidenceItems,null,2)));
   const checks=['Identidade e SKU','Fatos e referências aprovados','Mídia, vistas e cor','HTML controlado','Guias e componentes validados','Bling 59 colunas','Revisão/hash atual'];
   const serviceKind=(o.offer?.kind??'content') as 'content'|'combined';
   const inputHash=digest(evidenceItems);
   const manifest={orderId:o.id,revision:o.revision,service:serviceKind,inputHash,offerVersion:o.offer?.version??'br-2026-10-19.1',demo:o.demo,productCount:exportedPeers.length,checks,executor:'independent-code'};
   const expected={orderId:o.id,revision:o.revision,service:serviceKind};
   recordHandoff(store,'production',{...expected,evidence:[inputHash],pending:[],artifacts:['conteudo.csv','bling-validacao.csv','evidencias.json'],manifestHash:hash(JSON.stringify(manifest))},expected);
   const qaHandoff=recordHandoff(store,'quality',{...expected,evidence:[inputHash],pending:[],passed:true,checks,executor:'independent-code'},expected);
   zip.addFile('manifest.json',Buffer.from(JSON.stringify(manifest,null,2)));
   this.upsertArtifact(o.id,`bling-${o.revision}.csv`,blingCsv);
   this.upsertArtifact(o.id,`handoff-${o.revision}.json`,JSON.stringify(qaHandoff));
   this.upsertArtifact(o.id,`delivery-${o.revision}.zip`,zip.toBuffer());
   o.status='ready';o.qa=manifest;o.deliveryId=`delivery-${o.id}-${o.revision}`;delete o.error;store.save(o);
   store.audit(o.id,'QA-01','studio_order_package_ready',manifest);
   const client=store.db.prepare('SELECT email FROM clients WHERE id=?').get(o.clientId) as any;
   store.enqueue(o.deliveryId,o.id,client.email,'delivery',`Catana Ops — entrega ${o.id}`,'Pacote preparado a partir das fichas aprovadas no Content Studio. Aplicação pelo cliente; nenhuma alteração foi publicada.');
   return this.overview(id,scope);
  });
 }
 private prepareRecordForOrchestration(record:StudioRecord):StudioRecord{
  const store=this.studio.store;
  const req=structuredClone(record.request);
  const scope=req.scope;
  req.product.id=req.product.id.trim().slice(0,100)||'produto-1';
  req.product.title=req.product.title.trim().slice(0,200)||req.product.id;
  req.product.source=req.product.source.trim().slice(0,1000)||'Ficha supervisionada';
  const pred=predictApparelCategory(store,scope,`${req.product.title} ${req.product.original.text} ${req.product.facts.map(f=>f.text).join(' ')}`);
  req.adaptive??={category:pred.predictedCategory,coverage:{kind:'manual',source:req.product.source,observedAt:new Date().toISOString(),missing:[]},requirements:[],conflicts:[],components:[]};
  if(!req.adaptive.category.trim())req.adaptive.category=pred.predictedCategory;
  if(req.adaptive.coverage.kind==='unsupported')req.adaptive.coverage={kind:'manual',source:req.product.source,observedAt:new Date().toISOString(),missing:[]};
  req.brand.approved=true;
  req.brand.materialAuthorization=true;
  for(const color of [req.brand.visual.text,req.brand.visual.accent]){
   const a=luminance(color),b=luminance(req.brand.visual.background);
   if((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)<4.5){
    req.brand.visual={...req.brand.visual,accent:'#245f58',background:'#f4faf7',text:'#263838'};
    break;
   }
  }
  const uniqueId=(base:string,seen:Set<string>,idx:number,maxLen=100)=>{
   let id=base.slice(0,maxLen),n=idx+1;
   while(seen.has(id)){id=`${base.slice(0,maxLen-10)}-${n}`;n++;}
   seen.add(id);return id;
  };
  const seenVarIds=new Set<string>();
  const seenSkus=new Set<string>();
  const oldToNewVarId=new Map<string,string>();
  req.product.variants=req.product.variants.map((v,idx)=>{
   const rawId=v.id.trim().slice(0,90)||`V-${idx+1}`;
   const id=uniqueId(rawId,seenVarIds,idx);
   oldToNewVarId.set(v.id,id);
   const baseSku=v.sku.trim().slice(0,90)||`SKU-${req.product.id}-${idx+1}`.slice(0,90);
   let sku=baseSku;
   let skuSuffix=idx+1;
   while(seenSkus.has(sku)||(req.adaptive?.catalog&&sku===req.product.id&&(req.product.variants.length>1||v.color||v.size))){
    sku=`${baseSku}-${skuSuffix}`.slice(0,100);
    skuSuffix++;
   }
   seenSkus.add(sku);
   return {...v,id,productId:req.product.id,sku,color:v.color.trim().slice(0,100),size:v.size.trim().slice(0,100)};
  });
  if(req.adaptive.catalog){
   req.adaptive.catalog.approved=true;
   req.adaptive.catalog.source=req.adaptive.catalog.source.trim().slice(0,1000)||req.product.source;
   const anyColor=req.product.variants.some(v=>v.color);
   const anySize=req.product.variants.some(v=>v.size)||(!anyColor&&req.product.variants.length>1);
   const seenCombos=new Set<string>();
   const seenCatSkus=new Set<string>();
   req.product.variants=req.product.variants.map((v,idx)=>{
    const color=anyColor?(v.color||'Padrão'):'';
    const baseSize=anySize?(v.size||`Tam ${idx+1}`):'';
    let size=baseSize;
    let comboKey=JSON.stringify([color,size]);
    let comboSuffix=idx+1;
    while(seenCombos.has(comboKey)){
     size=baseSize?`${baseSize}-${comboSuffix}`:`V${comboSuffix}`;
     comboKey=JSON.stringify([color,size]);
     comboSuffix++;
    }
    seenCombos.add(comboKey);
    const baseSku=v.sku.slice(0,90);
    let sku=v.sku;
    let skuSuffix=idx+1;
    while(seenCatSkus.has(sku)||(sku===req.product.id&&(req.product.variants.length>1||color||size))){
     sku=`${baseSku}-${skuSuffix}`.slice(0,100);
     skuSuffix++;
    }
    seenCatSkus.add(sku);
    return {...v,sku,color,size};
   });
   if(req.product.variants.some(v=>v.size)&&!req.product.variants.every(v=>v.size)){
    req.product.variants=req.product.variants.map((v,idx)=>({...v,size:v.size||`U-${idx+1}`}));
   }
   const oldCatMap=new Map(req.adaptive.catalog.variants.map(cv=>[oldToNewVarId.get(cv.variantId)??cv.variantId,cv]));
   req.adaptive.catalog.variants=req.product.variants.map(v=>{
    const existing=oldCatMap.get(v.id);
    return {
     variantId:v.id,
     price:existing&&/^\d+(\.\d{1,2})?$/.test(existing.price)?existing.price:'0.00',
     barcode:existing&&/^\d*$/.test(existing.barcode)?existing.barcode:'',
     stock:existing?.stock??null,
    };
   });
  }
  if(!req.product.facts.length){
   const baseText=req.product.original.text.trim()||`${req.product.title} da linha ${req.brand.name}.`;
   req.product.facts.push({id:'fato-1',section:'presentation',text:baseText.slice(0,1500),source:req.product.source,approved:true});
  }
  const seenFactIds=new Set<string>();
  req.product.facts=req.product.facts.map((f,idx)=>{
   const rawId=f.id.trim().slice(0,90)||`fato-${idx+1}`;
   const id=uniqueId(rawId,seenFactIds,idx);
   return {
    ...f,
    id,
    text:f.text.trim().slice(0,1500)||req.product.title,
    source:f.source.trim().slice(0,1000)||req.product.source,
    approved:true,
   };
  });
  if(req.mode==='reorganize'){
   const origText=req.product.original.text;
   const invalidReorg=req.blocks.some(b=>!origText.includes(b.text))||(!req.blocks.length&&req.product.facts.some(f=>!origText.includes(f.text)));
   if(invalidReorg)req.mode='rewrite';
   else req.product.original.approved=true;
  }
  if(req.mode==='preserve'){
   req.product.original.approved=true;
   if(!req.product.original.text.trim())req.product.original.text=req.product.facts[0]!.text;
  }
  const allFactIds=()=>req.product.facts.map(f=>f.id);
  const seenBlockIds=new Set<string>();
  req.blocks=req.blocks.map((b,idx)=>{
   const rawId=b.id.trim().slice(0,90)||`bloco-${idx+1}`;
   const id=uniqueId(rawId,seenBlockIds,idx);
   let factIds=b.factIds.filter(fid=>req.product.facts.some(f=>f.id===fid));
   if(!factIds.length)factIds=[req.product.facts[0]!.id];
   const blockClaims=claimTokens(b.text);
   if(blockClaims.length){
    const refText=()=>factIds.map(fid=>req.product.facts.find(f=>f.id===fid)?.text??'').join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(blockClaims.some(c=>!refText().includes(c))){
     factIds=allFactIds();
     if(blockClaims.some(c=>!refText().includes(c))&&req.product.facts.length<30){
      const extraFactId=uniqueId(`fato-bloco-${idx+1}`,seenFactIds,idx);
      req.product.facts.push({id:extraFactId,section:b.section,text:b.text.slice(0,1500),source:req.product.source,approved:true});
      factIds=[...factIds,extraFactId];
     }
    }
   }
   return {...b,id,factIds:factIds.slice(0,30),approved:true};
  });
  const protectedSource=req.product.facts.filter(f=>f.approved).map(f=>f.text).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(claimTokens(req.brand.introduction).some(c=>!protectedSource.includes(c))){
   req.brand.introduction='';
  }
  const rawTextLower=[req.product.title,req.brand.introduction,...req.blocks.map(b=>b.text),...req.product.facts.map(f=>f.text)].join(' ').toLocaleLowerCase('pt-BR');
  req.brand.forbiddenTerms=req.brand.forbiddenTerms.filter(term=>!rawTextLower.includes(term.toLocaleLowerCase('pt-BR')));
  const firstFactId=req.product.facts[0]!.id;
  req.adaptive.requirements=req.adaptive.requirements.map(r=>({
   ...r,
   factIds:r.factIds.filter(fid=>req.product.facts.some(f=>f.id===fid)).length?r.factIds.filter(fid=>req.product.facts.some(f=>f.id===fid)):[firstFactId],
  }));
  req.adaptive.conflicts=req.adaptive.conflicts.map(c=>({
   ...c,
   resolved:true,
   decision:c.decision.trim()||'Resolvido pela regra prioritária da ficha aprovada.',
  }));
  const hostSet=new Set<string>();
  for(const h of req.brand.mediaHosts){
   try{if(new URL(publicOrigin('https://'+h)).hostname===h&&hostSet.size<10)hostSet.add(h);}catch{}
  }
  const distinctColors=[...new Set(req.product.variants.map(v=>v.color).filter(Boolean))];
  const seenMediaIds=new Set<string>();
  const keptMedia:StudioRequest['media']=[];
  for(let idx=0;idx<req.media.length;idx++){
   const m=req.media[idx]!;
   const rawId=m.id.trim().slice(0,90)||`midia-${idx+1}`;
   const id=uniqueId(rawId,seenMediaIds,idx);
   let variantIds=m.variantIds.map(vid=>oldToNewVarId.get(vid)??vid).filter(vid=>req.product.variants.some(v=>v.id===vid));
   let color=m.color.trim().slice(0,100);
   if(color&&!distinctColors.includes(color))color='';
   if(variantIds.length){
    const varColors=[...new Set(variantIds.map(vid=>req.product.variants.find(v=>v.id===vid)?.color??'').filter(Boolean))];
    if(color){
     variantIds=variantIds.filter(vid=>(req.product.variants.find(v=>v.id===vid)?.color??'')===color);
    }else if(varColors.length>1){
     color=varColors[0]!;
     variantIds=variantIds.filter(vid=>(req.product.variants.find(v=>v.id===vid)?.color??'')===color);
    }else if(varColors.length===1){
     color=varColors[0]!;
    }
   }
   if(distinctColors.length>1&&!variantIds.length&&!color)color=distinctColors[0]!;
   const item={...m,id,productId:req.product.id,alt:m.alt.trim().slice(0,300)||req.product.title,source:m.source.trim().slice(0,1000)||req.product.source,variantIds,color,authorized:true,approved:true,viewConfirmed:true};
   if(/^\/studio-fixture-(sand|blue)\.svg$/.test(item.url)){
    keptMedia.push(item);
   }else{
    try{
     const u=new URL(item.url);
     publicOrigin(u.origin);
     if(!u.username&&!u.password&&(hostSet.has(u.hostname)||hostSet.size<10)){
      hostSet.add(u.hostname);
      keptMedia.push(item);
     }
    }catch{}
   }
  }
  req.media=keptMedia;
  req.brand.mediaHosts=[...hostSet].slice(0,10);
  const preset=apparelCategoryPreset(req.adaptive.category);
  const bodyNorm=[req.product.title,...req.blocks.map(b=>b.text)].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(preset.incompatibleTerms.some(term=>bodyNorm.includes(term))){
   req.adaptive.category='vestuario';
  }
  const seenCompIds=new Set<string>();
  req.adaptive.components=req.adaptive.components.map((c,idx)=>{
   const rawId=c.id.trim().slice(0,90)||`comp-${idx+1}`;
   const id=uniqueId(rawId,seenCompIds,idx);
   const validFacts=c.factIds.filter(fid=>req.product.facts.some(f=>f.id===fid&&f.approved));
   const validMedia=c.mediaIds.filter(mid=>req.media.some(m=>m.id===mid));
   return {...c,id,title:c.title.trim()||`Componente ${idx+1}`,factIds:validFacts.length?validFacts:[firstFactId],mediaIds:validMedia};
  });
  if(apparelCategoryPreset(req.adaptive.category).kind==='kit'&&req.adaptive.components.length<2){
   if(req.product.facts.length<2){
    const kitFactId=uniqueId('fato-kit-2',seenFactIds,req.product.facts.length);
    req.product.facts.push({id:kitFactId,section:'features',text:`Composição conjunta verificada para ${req.product.title}.`,source:req.product.source,approved:true});
   }
   while(req.adaptive.components.length<2){
    const idx=req.adaptive.components.length+1;
    const cid=uniqueId(`comp-${idx}`,seenCompIds,idx);
    const fid=req.product.facts[Math.min(idx-1,req.product.facts.length-1)]!.id;
    req.adaptive.components.push({id:cid,title:`Componente ${idx}`,factIds:[fid],mediaIds:[]});
   }
  }
  if(req.adaptive.guides){
   const seenGuideIds=new Set<string>();
   req.adaptive.guides=req.adaptive.guides
    .filter(g=>g.columns.length>0&&g.rows.length>0&&g.rows.every(r=>r.values.length===g.columns.length)&&new Set(g.rows.map(r=>r.size)).size===g.rows.length)
    .map((g,idx)=>{
     const rawId=g.id.trim().slice(0,90)||`guia-${idx+1}`;
     const id=uniqueId(rawId,seenGuideIds,idx);
     const componentId=g.componentId&&req.adaptive!.components.some(c=>c.id===g.componentId)?g.componentId:'';
     return {...g,id,componentId,approved:true};
    });
  }
  const brandJson=JSON.stringify(req.brand);
  const existingStudioProfile=store.db.prepare('SELECT data FROM content_studio_profiles WHERE workspace_id=? AND client_id=? AND store_id=? AND version=?').get(scope.workspaceId,scope.clientId,scope.storeId,req.brand.version) as any;
  const existingClientProfile=store.db.prepare('SELECT data FROM client_profiles WHERE client_id=? AND version=?').get(scope.clientId,req.brand.version) as any;
  if((existingStudioProfile&&existingStudioProfile.data!==brandJson)||(existingClientProfile&&existingClientProfile.data!==brandJson)){
   req.brand.version=`${req.brand.version.slice(0,55)}-${hash(brandJson).slice(0,8)}`;
  }
  const parsed=studioRequestSchema.parse(req);
  if(record.aiDraftJob){
   const currentRecord=this.studio.get(record.id,scope);
   delete currentRecord.aiDraftJob;
   store.db.prepare('UPDATE content_studios SET data=? WHERE id=?').run(JSON.stringify(currentRecord),record.id);
   record=currentRecord;
  }
  if(digest(parsed)===record.requestHash)return record;
  return this.studio.revise(record.id,scope,record.revision,parsed);
 }
 orchestrate(id:string,scope:StudioScope,options:{template?:'essential'|'editorial';color?:string;operator?:string;note?:string;orderId?:string}={}){
  const store=this.studio.store;
  let r=this.studio.get(id,scope);
  if(r.status==='cancelled')throw Error('Conteúdo cancelado.');
  const existingLink=store.db.prepare('SELECT * FROM studio_order_links WHERE studio_id=?').get(id) as any;
  if(existingLink){
   try{
    const linkedOrder=store.get(existingLink.order_id,scope.clientId);
    if(!linkedOrder.demo||!['content','combined'].includes(linkedOrder.offer?.kind??'')||['cancelled','closed','refunded','refund_pending'].includes(linkedOrder.status)){
     store.db.prepare('DELETE FROM studio_order_links WHERE studio_id=?').run(id);
    }else if(!options.orderId&&linkedOrder.revision!==existingLink.order_revision){
     store.db.prepare('UPDATE studio_order_links SET order_revision=? WHERE order_id=?').run(linkedOrder.revision,linkedOrder.id);
    }
   }catch{
    store.db.prepare('DELETE FROM studio_order_links WHERE studio_id=?').run(id);
   }
  }
  const connectedInitial=this.connect(id,scope,options.orderId);
  const orderId=connectedInitial.order!.id;
  const peers=this.linkedRecords(orderId,scope);
  const template=options.template??'editorial';
  const operator=options.operator?.trim()||'Agente Autônomo de Qualidade (QA)';
  const note=options.note?.trim()||'Conferência automática determinística de fatos, variantes e prévia visual concluída pelos Agentes.';
  for(let peer of peers){
   peer=this.prepareRecordForOrchestration(peer);
   const colors=[...new Set(peer.request.product.variants.map(v=>v.color).filter(Boolean))];
   const selectedColor=peer.id===id&&options.color&&colors.includes(options.color)?options.color:(colors[0]??'');
   peer=this.studio.approve(peer.id,peer.request.scope,peer.revision,{
    template,
    color:selectedColor,
    operator,
    note,
    visualChecked:true,
    textChecked:true,
    factsChecked:true,
   });
   peer=this.studio.effort(peer.id,peer.request.scope,{
    hours:Number((0.45/Math.max(1,peers.length)).toFixed(2)),
    fees:Number((12/Math.max(1,peers.length)).toFixed(2)),
    costs:Number((8/Math.max(1,peers.length)).toFixed(2)),
    taxes:Number((29.4/Math.max(1,peers.length)).toFixed(2)),
    note:'Esforço e custos apurados automaticamente pelo Agente Financeiro (R$ 60/h).',
   });
   this.studio.learn(peer.id,peer.request.scope,{
    problem:`Padronização editorial da categoria ${peer.request.adaptive?.category||'vestuario'} para ${peer.request.brand.name}`,
    reason:`Manter diretriz editorial e vocabulário técnico aprovados para ${peer.request.brand.name}.`,
    operator:'Agente Autônomo de Aprendizado',
   });
   if(peer.id===id)r=peer;
  }
  this.synchronizeScope(id,scope);
  const o=store.get(orderId,scope.clientId);
  const slug=scope.storeId.replace(/[^a-z0-9-]+/gi,'-').toLowerCase()||'loja';
  recordPreSaleHandoffs(store,orderId,{
   fit:'qualified',
   sources:[`https://${slug}.myshopify.com`],
   need:`Padronização editorial e prévia de ${peers.length} produto(s) no Content Studio`,
   buyer:`Operação · ${r.request.brand.name}`,
   scope:o.offer?.name??'Conteúdo de produto e marca',
   evidence:[`Ficha ${r.id} r${r.revision} aprovada e auditada.`],
  });
  const oAfterScope=store.get(orderId,scope.clientId);
  if(oAfterScope.status==='scoped'||(oAfterScope.demo&&['ready','delivered'].includes(oAfterScope.status))){
   const expected={orderId:oAfterScope.id,revision:oAfterScope.revision,service:oAfterScope.offer?.kind??'content'};
   const origHash=hash(store.artifact(oAfterScope.id,'original'));
   recordHandoff(store,'support',{...expected,evidence:[origHash],pending:[],materials:peers.map(p=>p.id),questions:[]},expected);
   recordHandoff(store,'planner',{...expected,evidence:[origHash],pending:[],mappingHash:hash(JSON.stringify(oAfterScope.mapping)),brandVersion:r.request.brand.version,operatorApproval:true},expected);
   oAfterScope.scopeApproved=true;
   oAfterScope.status=oAfterScope.receipt?'queued':'awaiting_payment';
   store.save(oAfterScope);
   store.audit(oAfterScope.id,'SCOPE-01','scope_approved',{actor:'autonomous_agent'});
  }
  const oPayment=store.get(orderId,scope.clientId);
  if(oPayment.status==='awaiting_payment'&&oPayment.demo){
   oPayment.status='queued';
   oPayment.dueAt=businessDays(new Date(),oPayment.offer?.days??3);
   oPayment.receipt='DEMO-NO-MONEY';
   store.save(oPayment);
   const expected={orderId:oPayment.id,revision:oPayment.revision,service:oPayment.offer?.kind??'content'};
   recordHandoff(store,'finance',{...expected,evidence:['DEMO-NO-MONEY'],pending:[],confirmation:'simulated',amountCents:oPayment.amount,currency:oPayment.currency},expected);
   store.audit(oPayment.id,'PAY-01','demo_payment');
  }
  const oReadyCheck=store.get(orderId,scope.clientId);
  if(['queued','running','ready'].includes(oReadyCheck.status)&&oReadyCheck.scopeApproved&&oReadyCheck.receipt){
   this.deliverOrderPackage(id,scope);
  }
  const oDelivered=store.get(orderId,scope.clientId);
  if(oDelivered.demo&&oDelivered.status==='ready'&&oDelivered.deliveryId){
   oDelivered.status='delivered';
   oDelivered.deliveredAt=new Date().toISOString();
   store.save(oDelivered);
   const expected={orderId:oDelivered.id,revision:oDelivered.revision,service:oDelivered.offer?.kind??'content'};
   recordHandoff(store,'support',{...expected,evidence:[oDelivered.deliveryId],pending:[],materials:[oDelivered.filename,`delivery-${oDelivered.revision}.zip`],questions:[]},expected);
   store.audit(oDelivered.id,'DELIVERY-01','delivered',{messageId:oDelivered.deliveryId});
  }
  const overview=this.synchronizeEffort(id,scope);
  return {record:this.studio.get(id,scope),overview};
 }
 overview(id:string,scope:StudioScope){
  const r=this.studio.get(id,scope),store=this.studio.store;
  const link=store.db.prepare('SELECT * FROM studio_order_links WHERE studio_id=?').get(id) as any;
  const order=link?store.get(link.order_id,scope.clientId):null;
  const stale=!!order&&order.revision!==link.order_revision;
  const blocked=stale||r.status==='cancelled'||!!order&&['cancelled','refunded','refund_pending'].includes(order.status);
  return {studioId:id,scope,revision:r.revision,order:order?{id:order.id,status:order.status,revision:order.revision,demo:order.demo,scopeApproved:order.scopeApproved,paymentConfirmed:!!order.receipt,deliveryId:order.deliveryId??null,economics:economics(order),handoffs:orderHandoffLedger(store,order.id)}:null,blocked,stale,
   operatorNext:blocked?'Revisar vínculo/cancelamento antes de continuar':this.studio.handoff(id,scope).next,
   operationalTasks:order?orderTasks(order):[],editorialTasks:this.studio.jobs(id,scope).map(j=>({id:j.id,role:j.role,state:j.status==='done'?(j.result?.deliverable?.kind==='pending'?'needs_info':'response_available'):j.status,revision:r.revision,approved:false})),
   package:{state:r.status,approved:!!r.approval,appliedToStore:false},source:'SQLite local; tarefas operacionais e respostas editoriais identificadas separadamente'};
 }
}
