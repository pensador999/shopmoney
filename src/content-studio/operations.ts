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
  const isAllowedEditorial=(ord:any)=>Boolean(ord.demo);
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
 // Preparation preserves facts, identifiers, permissions and unresolved questions.
 orchestrate(id:string,scope:StudioScope,options:{template?:'essential'|'editorial';color?:string;operator?:string;note?:string;orderId?:string}={}){
  const record=this.studio.get(id,scope);
  if(record.status==='cancelled')throw Error('Conteúdo cancelado.');
  this.connect(id,scope,options.orderId);
  const overview=this.synchronizeScope(id,scope);
  return {record:this.studio.get(id,scope),overview,pending:this.studio.handoff(id,scope).questions,
    requiresOperatorApproval:true,mode:'supervised'};
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
