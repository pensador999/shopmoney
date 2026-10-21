import {verifySnapshot,parsePage,isProductPage} from '../inspection/snapshot.ts';
import {studioRequestSchema,suggestMediaView,type StudioRequest,type StudioScope} from './contracts.ts';

// Public observations are candidates. No factual or media approval is inferred.
export function intakeSnapshot(snapshotInput:unknown,scope:StudioScope,brand:StudioRequest['brand']){
  const snapshot=verifySnapshot(snapshotInput,{workspaceId:scope.workspaceId,clientId:scope.clientId});
  const records:StudioRequest[]=[],rejected:{productId:string;reason:string}[]=[];
  for(const page of snapshot.pages){
    for(const p of parsePage(page.body,isProductPage(page.url)).slice(0,Math.max(0,snapshot.maxProducts-records.length-rejected.length))){
      try{
        const id=String(p.id??'');if(!id)throw Error('Produto sem identificador.');
        const variants=Array.isArray(p.variants)?p.variants as Record<string,unknown>[]:[];
        const options=Array.isArray(p.options)?p.options as Record<string,unknown>[]:[];
        const option=(v:Record<string,unknown>,names:string[])=>{const i=options.findIndex(o=>names.includes(String(o.name).toLowerCase()));return i>=0?String(v['option'+(i+1)]??''):'';};
        const raw=String(p.body_html??'');
        const plain=raw.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
        const source=page.url+'#product='+encodeURIComponent(id);
        const request={version:'content-studio-1',scope,brand:{...brand,approved:false,materialAuthorization:false},
          product:{id,title:String(p.title??''),existing:true,source,original:{html:raw,text:plain.slice(0,12000),approved:false},
            variants:variants.map(v=>({id:String(v.id??''),productId:id,sku:String(v.sku??''),color:option(v,['cor','color','colour']),size:option(v,['tamanho','size'])})),
            facts:plain?[{id:'observed-description',text:plain.slice(0,1500),source,approved:false,section:'presentation'}]:[]},
          media:(Array.isArray(p.images)?p.images as Record<string,unknown>[]:[]).slice(0,12).filter(m=>typeof m.src==='string'&&String(m.src).startsWith('https://')).map((m,index)=>{
            const alt=String(m.alt||p.title||'Imagem do produto').slice(0,300),view=suggestMediaView(String(m.src),String(m.alt??''));
            return {id:String(m.id??'image-'+index),productId:id,url:String(m.src),source,authorized:false,approved:false,variantIds:(Array.isArray(m.variant_ids)?m.variant_ids:[]).map(String),color:'',role:index===0?'hero':view==='context'?'context':'detail',view,viewConfirmed:view==='unknown',alt};
          }),mode:'rewrite',blocks:[],adaptive:{category:String(p.product_type??'').slice(0,100),
            coverage:{kind:'public',source,observedAt:page.capturedAt,missing:['Autorização de materiais','Perfil aprovado','Revisão dos fatos observados','Associação visual de imagens']},requirements:[],conflicts:[],components:[]}};
        records.push(studioRequestSchema.parse(request));
      }catch(error){rejected.push({productId:String(p.id??''),reason:String(error).slice(0,500)});}
    }
  }
  return {snapshotId:snapshot.id,records,rejected,coverage:snapshot.coverage,commercialReady:false};
}
