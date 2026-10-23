import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { z } from 'zod';
import { Store, type Order } from './store.ts';
import { offerSnapshot } from './offers.ts';
import { contentRequestSchema, prepareContent, checkContent, validateBrief } from './brand-content.ts';
import { hash, csv } from './catalog.ts';
import { assert } from './policy.ts';
import { validateHandoff, recordHandoff, autoLinkLeadHandoffs } from './handoffs.ts';
import { inspectionBrief, inspectionReferenceSchema, readInspection, verifyOrderInspection } from './inspection/evidence.ts';
import { sha } from './inspection/snapshot.ts';
import { mediaBatchSchema, inspectMediaBatch, standardizeMediaBatch, checkMediaBatch } from './media-standardization.ts';

export const diagnosticObservationSchema=z.object({subject:z.string().min(1).max(200),category:z.enum(['observed','hypothesis','needs_internal_evidence']),finding:z.string().min(1).max(2000),evidence:z.array(z.object({source:z.string().min(1).max(1000),note:z.string().min(1).max(1000)}).strict()).min(1).max(5),nextAction:z.string().min(1).max(1000)}).strict();
export const diagnosticSchema=z.object({products:z.array(z.object({id:z.string().min(1),title:z.string().default(''),description:z.string().default(''),source:z.string().min(1),missingFields:z.array(z.string()).default([])}).strict()).min(1).max(10),observations:z.array(diagnosticObservationSchema).max(20).default([]),inspection:inspectionReferenceSchema.optional()}).strict();
export function createEditorial(store:Store,input:{name:string;email:string;service:'diagnostic'|'content'|'images';brief:unknown;demo:boolean;id?:string}) {
  const offer=offerSnapshot(input.service);
  const brief=input.service==='content'?contentRequestSchema.parse(input.brief):input.service==='images'?mediaBatchSchema.parse(input.brief):diagnosticSchema.parse(input.brief);
  const issues=input.service==='content'?validateBrief(brief as z.infer<typeof contentRequestSchema>):input.service==='images'?inspectMediaBatch(brief):[];
  const variantCount=input.service==='images'?(brief as z.infer<typeof mediaBatchSchema>).products.reduce((n,p)=>n+p.variants.length,0):0;
  const create=()=>{
    const client=store.client(input.name,input.email);
    const o:Order={id:input.id??randomUUID(),clientId:client.id,status:issues.length?'needs_info':'scoped',demo:input.demo,filename:'brief.json',mapping:{},scopeApproved:false,amount:offer.cents,currency:offer.currency,offer,
      createdAt:new Date().toISOString(),report:{ok:issues.length===0,issues,productCount:brief.products.length,variantCount},revision:0,corrections:0,hours:0,fees:0,costs:0,contentInput:brief,brandProfile:'brand' in brief?brief.brand:undefined};
    if('brand' in brief)store.profile(client.id,brief.brand.version,brief.brand);
    const raw=JSON.stringify(brief);
    store.save(o);store.artifact(o.id,'original',raw);store.artifact(o.id,'brief-0.json',raw);
    autoLinkLeadHandoffs(store,o.id,input.email);
    store.audit(o.id,'SCOPE-01','editorial_received',{service:input.service,offerVersion:offer.version});return o;
  };
  return store.db.isTransaction?create():store.transaction(create);
}
export function processEditorial(store:Store,o:Order){
  assert(o.status==='running'&&o.scopeApproved&&!!o.receipt,'Produção exige execução, escopo e pagamento/simulação.');
  const expected={orderId:o.id,revision:o.revision,service:o.offer!.kind};
  const input=JSON.parse(store.artifact(o.id,`brief-${o.revision}.json`).toString());
  const zip=new AdmZip();let checks:string[]=[];let prodArtifacts:string[]=[];
  if(o.offer!.kind==='content'){
    const brief=contentRequestSchema.parse(input),output=prepareContent(brief);
    const errors=checkContent(brief,output);assert(!errors.length,errors.join('; '));
    zip.addFile('conteudo.csv',Buffer.from(csv(output.map(p=>({ID:p.id,Title:p.title,'Body (HTML)':p.html,'SEO Title':p.seoTitle,'SEO Description':p.metaDescription})),['ID','Title','Body (HTML)','SEO Title','SEO Description'])));
    zip.addFile('evidencias.json',Buffer.from(JSON.stringify(output,null,2)));checks=['Identificadores','Fatos aprovados','Fontes','Texto aprovado','Termos proibidos','HTML escapado'];
    prodArtifacts=['conteudo.csv','evidencias.json'];
  }else if(o.offer!.kind==='images'){
    const brief=mediaBatchSchema.parse(input),standardized=standardizeMediaBatch(brief);
    const qaIssues=checkMediaBatch(brief,standardized);assert(!qaIssues.length,JSON.stringify(qaIssues));
    checks=['Até 10 produtos','Autorização explícita de mídia','Hosts HTTPS públicos verificados','Classificação de vistas e ausência de colisão de cor','Nomenclatura canônica determinística','Proibição de edição generativa'];
    const qaMedia={ok:true,orderId:o.id,revision:o.revision,productCount:standardized.manifest.productCount,imageCount:standardized.manifest.imageCount,hosts:standardized.manifest.brand.hosts,checks,issues:qaIssues,inputHash:standardized.manifest.inputHash,outputHash:standardized.manifest.outputHash};
    zip.addFile('imagens-shopify.csv',Buffer.from(standardized.shopifyCsv));
    zip.addFile('media-manifest.json',Buffer.from(JSON.stringify(standardized.manifest,null,2)));
    zip.addFile('qa-media.json',Buffer.from(JSON.stringify(qaMedia,null,2)));
    prodArtifacts=['imagens-shopify.csv','media-manifest.json','qa-media.json'];
  }else{
    const brief=diagnosticSchema.parse(input);
    if(o.revision>0&&brief.inspection){
      assert(store.db.prepare('SELECT 1 FROM artifacts WHERE order_id=? AND name=?').get(o.id,`planner-${o.revision}.json`),'Revisão de diagnóstico com inspeção exige reaprovação formal do operador.');
    }
    const inspection=brief.inspection?verifyOrderInspection(store,o.id,o.revision,brief.inspection):undefined;
    if(inspection){
      assert(JSON.stringify(brief)===JSON.stringify(diagnosticSchema.parse(inspectionBrief(inspection.snapshot,inspection.audit))),'Briefing diverge da inspeção revisada.');
      zip.addFile('inspecao-tecnica.json',Buffer.from(JSON.stringify(inspection.audit,null,2)));
      zip.addFile('fontes-inspecao.json',Buffer.from(JSON.stringify(inspection.snapshot,null,2)));
      zip.addFile('revisao-operador.json',Buffer.from(JSON.stringify(inspection.review,null,2)));
    }
    const findings=inspection?[]:brief.products.flatMap(p=>[
      ...(!p.title.trim()?[{id:p.id,type:'observed',field:'title',evidence:p.source,message:'Título ausente.'}]:[]),
      ...(!p.description.trim()?[{id:p.id,type:'observed',field:'description',evidence:p.source,message:'Descrição ausente.'}]:[]),
      ...p.missingFields.map(f=>({id:p.id,type:'needs_internal_evidence',field:f,evidence:p.source,message:'Informação não fornecida; confirmar com responsável.'})),
    ]);
    zip.addFile('diagnostico.json',Buffer.from(JSON.stringify({findings,observations:brief.observations,limits:['Não atribui autoria de texto a IA.','Esgotado não demonstra alta procura.','Não é auditoria de conversão ou de todo o catálogo.',inspection?'Inspeção estruturada conferida contra o JSON capturado; revisão humana registrada. Não confirma o estado atual da página.':'Observações públicas são fornecidas pelo pesquisador, não verificadas automaticamente pelo executor.'],recommendation:findings.length||brief.observations.length?'Revisar evidências e confirmar com o responsável antes de ampliar o escopo.':'Nenhuma inconsistência nos critérios limitados desta análise.'},null,2)));
    checks=['Até 10 produtos','Fontes por produto','Separação entre observado e informação interna',...(inspection?['Hash dos snapshots','Campos protegidos versus JSON original','Evidências por JSON pointer','Revisão do operador','Cliente/workspace e revisão do pedido']:[])];
    prodArtifacts=['diagnostico.json'];
  }
  const manifest={orderId:o.id,revision:o.revision,service:o.offer!.kind,inputHash:hash(JSON.stringify(input)),offerVersion:o.offer!.version,demo:o.demo,checks,executor:'independent-code'};
  const handoff=validateHandoff('quality',{...expected,evidence:[manifest.inputHash],pending:[],passed:true,checks,executor:'independent-code'},expected);
  zip.addFile('manifest.json',Buffer.from(JSON.stringify(manifest,null,2)));
  zip.addFile('LEIA-ME.txt',Buffer.from('Entrega para revisão e aplicação pelo cliente. Não importamos nem publicamos na loja. Conteúdo usa fatos e textos aprovados; não é promessa de SEO/conversão. Uma rodada de ajustes de escopo em sete dias. Defeitos da entrega não consomem a rodada.'));
  store.transaction(()=>{
    recordHandoff(store,'production',{...expected,evidence:[manifest.inputHash],pending:[],artifacts:prodArtifacts,manifestHash:hash(JSON.stringify(manifest))},expected);
    recordHandoff(store,'quality',{...expected,evidence:[manifest.inputHash],pending:[],passed:true,checks,executor:'independent-code'},expected);
    store.artifact(o.id,`delivery-${o.revision}.zip`,zip.toBuffer());store.artifact(o.id,`handoff-${o.revision}.json`,JSON.stringify(handoff));
    o.status='ready';o.qa=manifest;o.deliveryId=`delivery-${o.id}-${o.revision}`;delete o.error;store.save(o);store.audit(o.id,'QA-01','editorial_qa_passed',manifest);
    const client=store.db.prepare('SELECT email FROM clients WHERE id=?').get(o.clientId) as any;
    store.enqueue(o.deliveryId,o.id,client.email,'delivery',`Catana Ops — entrega ${o.id}`,'Pacote preparado para sua revisão. Aplicação pelo cliente; nenhuma alteração foi publicada.');
  });return o;
}
export function reviseEditorial(store:Store,id:string,input:unknown,reason:'scope-adjustment'|'defect'){
  const o=store.get(id);assert(['needs_info','needs_attention','delivered'].includes(o.status),'Revisão indisponível.');
  assert(o.revision<2,'Duas tentativas de correção; suspender para revisão do operador.');
  if(o.deliveredAt&&reason==='scope-adjustment'){
    assert(Date.now()<=Date.parse(o.deliveredAt)+7*86400000&&o.corrections<1,'Rodada de ajustes encerrada.');o.corrections++;
  }
  const kind=o.offer?.kind;
  const brief=kind==='content'?contentRequestSchema.parse(input):kind==='images'?mediaBatchSchema.parse(input):diagnosticSchema.parse(input);
  assert(brief.products.length<=o.offer!.maxProducts,'Novo escopo exige nova proposta.');
  const previous=JSON.parse(store.artifact(id,`brief-${o.revision}.json`).toString());
  if(o.deliveredAt)assert(JSON.stringify(previous.products.map((p:any)=>p.id).sort())===JSON.stringify(brief.products.map(p=>p.id).sort()),'Novos produtos exigem nova proposta.');
  let persistedInspection:string|null=null;
  if(kind==='diagnostic'&&(brief as z.infer<typeof diagnosticSchema>).inspection){
    const inspRef=(brief as z.infer<typeof diagnosticSchema>).inspection!;
    if(o.remoteWorkspaceId&&o.remoteWorkspaceId!==inspRef.workspaceId)throw Error('Workspace do pedido divergente.');
    const checked=readInspection(store,{workspaceId:inspRef.workspaceId,clientId:o.clientId},inspRef.snapshotId);
    assert(sha(JSON.stringify(checked.audit))===inspRef.auditHash,'Evidência de inspeção diverge do hash informado.');
    persistedInspection=JSON.stringify(checked);
  }
  const issues=kind==='content'?validateBrief(brief as any):kind==='images'?inspectMediaBatch(brief):[];
  const variantCount=kind==='images'?(brief as z.infer<typeof mediaBatchSchema>).products.reduce((n,p)=>n+p.variants.length,0):0;
  o.revision++;o.scopeApproved=false;delete o.qa;delete o.deliveryId;delete o.economicsRecordedAt;delete o.error;
  o.report={ok:issues.length===0,issues,productCount:brief.products.length,variantCount};
  o.contentInput=brief;o.brandProfile='brand' in brief?brief.brand:undefined;
  o.status=issues.length?'needs_info':o.receipt?'revision_approval':'scoped';
  const raw=JSON.stringify(brief);
  store.transaction(()=>{
    if('brand' in brief)store.profile(o.clientId,brief.brand.version,brief.brand);
    store.artifact(id,`brief-${o.revision}.json`,raw);
    if(persistedInspection)store.artifact(id,`inspection-${o.revision}.json`,persistedInspection);
    store.save(o);store.audit(id,'SCOPE-01','editorial_revision',{reason,revision:o.revision});
  });return o;
}
