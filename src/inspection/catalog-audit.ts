// Adaptado dos conceitos de deepSkuAuditEngine e swarmAgentContract (LeakFinder).
// Não importa suposições de estoque físico, receita, preços, fabricação ou ERP.
import { z } from 'zod';
import { atPointer, isProductPage, productPointer, parsePage, profileSchema, sha, verifySnapshot, type AuditProfile, type CatalogSnapshot } from './snapshot.ts';

const text=(v:unknown):string|null=>typeof v==='string'?v:null;
const identifier=(v:unknown):string|null=>typeof v==='string'&&v.length>0?v:typeof v==='number'&&Number.isSafeInteger(v)?String(v):null;
const price=(v:unknown):string|null=>typeof v==='string'?v:typeof v==='number'&&Number.isFinite(v)?String(v):null;
const norm=(v:string)=>v.trim().toLocaleUpperCase('pt-BR');
export const evidenceSchema=z.object({page:z.number().int().nonnegative(),pointer:z.string().max(500),value:z.unknown(),missing:z.boolean()}).strict();
export const findingSchema=z.object({
  code:z.string(),subject:z.string().max(200),category:z.enum(['observed','hypothesis','needs_internal_evidence']),
  finding:z.string().max(2000),nextAction:z.string().max(1000),evidence:z.array(evidenceSchema).min(1).max(5),
}).strict();
export type AuditFinding=z.infer<typeof findingSchema>;
export type ProductObservation={
  key:string;id:string|null;handle:string|null;title:string|null;description:string|null;source:string;
  page:number;pointer:string;images:{src:string|null;alt:string|null}[]|null;
  variants:{key:string;id:string|null;sku:string|null;barcode:string|null;price:string|null;available:boolean|null;
    size:string|null;page:number;pointer:string}[];
};
export type AuditRulesVersion='catana-catalog-audit-1'|'catana-catalog-audit-2';
export type CatalogAudit={
  version:AuditRulesVersion;snapshotId:string;profile:AuditProfile;scope:CatalogSnapshot['scope'];
  mode:CatalogSnapshot['mode'];coverage:CatalogSnapshot['coverage'];products:ProductObservation[];
  findings:AuditFinding[];limits:string[];
};
export function analyzeSnapshot(value:unknown,profileInput:unknown={version:'default-1'},rules:AuditRulesVersion='catana-catalog-audit-2'):CatalogAudit {
  if(!['catana-catalog-audit-1','catana-catalog-audit-2'].includes(rules))throw Error('Versão de diagnóstico desconhecida.');
  const snapshot=verifySnapshot(value),profile=profileSchema.parse(profileInput);
  const products:ProductObservation[]=[],findings:AuditFinding[]=[];
  const evidence=(page:number,pointer:string)=>{
    const v=atPointer(JSON.parse(snapshot.pages[page].body),pointer);
    return {page,pointer,value:v===undefined?null:v,missing:v===undefined};
  };
  const add=(code:string,subject:string,category:AuditFinding['category'],finding:string,nextAction:string,refs:{page:number;pointer:string}[])=>{
    if(findings.length>=200) return;
    findings.push(findingSchema.parse({code,subject:subject.slice(0,200),category,finding,nextAction,evidence:refs.slice(0,5).map(r=>evidence(r.page,r.pointer))}));
  };
  const seenProducts=new Set<string>(),skuMap=new Map<string,{page:number;pointer:string}[]>();
  for(let page=0;page<snapshot.pages.length;page++){
    const rawProducts=parsePage(snapshot.pages[page].body,isProductPage(snapshot.pages[page].url));
    for(let index=0;index<rawProducts.length&&products.length<snapshot.maxProducts;index++){
      const raw=rawProducts[index],pointer=productPointer(snapshot.pages[page].url,index),id=identifier(raw.id),key=page+':'+pointer;
      const subject=text(raw.title)||id||key;
      const product:ProductObservation={key,id,handle:text(raw.handle),title:text(raw.title),description:text(raw.body_html),
        source:snapshot.pages[page].url,page,pointer,images:null,variants:[]};
      if(id&&seenProducts.has(id))add('REPEATED_PRODUCT',subject,'observed','Produto repetido entre páginas; cobertura precisa de revisão.','Confirmar paginação; não somar como produtos distintos.',[{page,pointer:pointer+'/id'}]);
      if(id)seenProducts.add(id);
      for(const [field,label] of [['title','Título'],['body_html','Descrição']] as const){
        const v=text(raw[field]);
        if(v===null)add('UNKNOWN_'+field,subject,'needs_internal_evidence',label+' não disponível no retorno público.','Solicitar informação oficial; não interpretar ausência de campo como ausência na loja.',[{page,pointer:pointer+'/'+field}]);
        else if(!v.replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim())add('EMPTY_'+field,subject,'observed',label+' vazio no catálogo capturado.','Conferir a página e preparar conteúdo com fatos aprovados.',[{page,pointer:pointer+'/'+field}]);
      }
      if(Array.isArray(raw.images)){
        product.images=raw.images.map((im:any)=>({src:text(im?.src),alt:text(im?.alt)}));
        if(!raw.images.length)add('NO_IMAGES',subject,'observed','Lista pública de imagens vazia.','Confirmar materiais autorizados antes de propor tratamento.',[{page,pointer:pointer+'/images'}]);
        for(let ii=0;ii<raw.images.length;ii++){
          const im:any=raw.images[ii];
          if(typeof im?.alt==='string'&&!im.alt.trim())add('EMPTY_IMAGE_ALT',subject,'observed','Texto alternativo vazio no metadado capturado.','Descrever a imagem somente após conferência e aprovação; não afirmar defeito visual.',[{page,pointer:pointer+'/images/'+ii+'/alt'}]);
        }
      }
      if(!Array.isArray(raw.variants))add('UNKNOWN_VARIANTS',subject,'needs_internal_evidence','Variantes não disponíveis no retorno público.','Solicitar exportação oficial.',[{page,pointer:pointer+'/variants'}]);
      else{
        if(raw.variants.length>2000)throw Error('Quantidade de variantes excede limite técnico.');
        if(!raw.variants.length)add('NO_VARIANTS',subject,'observed','Lista de variantes vazia.','Conferir a fonte; não declarar grade saudável.',[{page,pointer:pointer+'/variants'}]);
        const options=Array.isArray(raw.options)?raw.options:[];
        const sizeIndex=options.findIndex((op:any)=>profile.sizeOptionNames.some(n=>norm(n)===norm(typeof op==='string'?op:typeof op?.name==='string'?op.name:'')));
        const selected:any=sizeIndex>=0?options[sizeIndex]:null;
        const sizePosition=selected&&typeof selected==='object'&&Number.isInteger(selected.position)?selected.position:sizeIndex+1;
        const unknownAvailability:{page:number;pointer:string}[]=[];
        for(let vi=0;vi<raw.variants.length;vi++){
          const v=raw.variants[vi];
          if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Variante inválida.');
          const vp=pointer+'/variants/'+vi;
          const variant={key:page+':'+vp,id:identifier(v.id),sku:text(v.sku),barcode:text(v.barcode),price:price(v.price),
            available:typeof v.available==='boolean'?v.available:null,size:sizeIndex>=0&&sizePosition>=1&&sizePosition<=3?text(v['option'+sizePosition]):null,page,pointer:vp};
          product.variants.push(variant);
          if(variant.sku?.trim()){const k=norm(variant.sku);skuMap.set(k,[...(skuMap.get(k)??[]),{page,pointer:vp+'/sku'}]);}
          else add('UNKNOWN_SKU',subject,'needs_internal_evidence','SKU não fornecido como texto válido.','Solicitar identificador original; não fabricar SKU.',[{page,pointer:vp+'/sku'}]);
          if(variant.price===null||!/^\d+(\.\d+)?$/.test(variant.price))
            add('UNKNOWN_PRICE',subject,'needs_internal_evidence','Preço ausente ou formato não validado.','Confirmar preço e moeda dos produtos; não substituir ou converter.',[{page,pointer:vp+'/price'}]);
          if(variant.available===false)add('PUBLIC_UNAVAILABLE',subject,'observed','Variante indisponível no catálogo público capturado.','Confirmar estoque e regras internas. Indisponibilidade não comprova alta procura.',[{page,pointer:vp+'/available'}]);
          if(variant.available===null){
            if(rules==='catana-catalog-audit-1')add('UNKNOWN_AVAILABILITY',subject,'needs_internal_evidence','Disponibilidade não informada como booleano.','Confirmar com exportação oficial; não declarar ruptura.',[{page,pointer:vp+'/available'}]);
            else unknownAvailability.push({page,pointer:vp+'/available'});
          }
        }
        if(unknownAvailability.length)add('UNKNOWN_AVAILABILITY',subject,'needs_internal_evidence',
          'Disponibilidade não informada como booleano em '+unknownAvailability.length+' variante(s).',
          'Confirmar com fonte oficial de disponibilidade; não declarar ruptura.',unknownAvailability);
        for(const size of profile.expectedSizes)if(!product.variants.some(v=>v.size!==null&&norm(v.size)===norm(size)))
          add('EXPECTED_SIZE_NOT_OBSERVED',subject,'needs_internal_evidence','Tamanho do perfil aprovado não observado nesta fonte: '+size+'.','Confirmar grade e integração; não inferir estoque ou demanda.',[{page,pointer:pointer+'/variants'},{page,pointer:pointer+'/options'}]);
      }
      products.push(product);
    }
  }
  for(const [sku,refs]of skuMap)if(refs.length>1)add('DUPLICATE_SKU',sku,'observed','Mesmo SKU observado em '+refs.length+' variantes; todas foram preservadas.','Confirmar colisão ou regra legítima antes de preparar cadastro.',refs);
  const coverage=snapshot.coverage==='endpoint-complete'&&
    (snapshot.pages.reduce((n,p)=>n+parsePage(p.body,isProductPage(p.url)).length,0)>snapshot.maxProducts||findings.some(f=>f.code==='REPEATED_PRODUCT'))?'sample':snapshot.coverage;
  return {version:rules,snapshotId:snapshot.id,profile,scope:snapshot.scope,mode:snapshot.mode,coverage,products,findings,
    limits:['Observa somente os dados capturados do endpoint público; não comprova toda a loja.',
      'Disponibilidade não representa estoque físico, vendas, procura ou desperdício de anúncios.',
      'Sem inferência de ERP, fabricação, lucro, conversão, autoria de texto ou preços.',
      'Imagens são referências; não foram baixadas, editadas ou visualmente conferidas.',
      'Tamanho segue nome de opção e perfil; não exige M/G ou grade universal.',
      'Até 200 observações; análise amostral e revisão humana obrigatória.']};
}

// QA estrutural separado da transformação: confere cada campo protegido contra o JSON original.
// Não substitui revisão humana, conferência visual ou validação de importação.
export function checkAudit(snapshotInput:unknown,audit:CatalogAudit){
  const errors:string[]=[];
  let snapshot:CatalogSnapshot;
  try{snapshot=verifySnapshot(snapshotInput,audit.scope);}catch(e){return [String(e)];}
  if(audit.snapshotId!==snapshot.id)errors.push('Snapshot divergente.');
  const expected=analyzeSnapshot(snapshot,audit.profile,audit.version);
  if(audit.products.length!==expected.products.length)errors.push('Quantidade de produtos divergente.');
  const roots=snapshot.pages.map(p=>JSON.parse(p.body));
  for(let i=0;i<audit.products.length;i++){
    const p=audit.products[i],source:any=atPointer(roots[p.page],p.pointer);
    if(!source){errors.push('Produto sem fonte.');continue;}
    for(const [name,field]of [['id','id'],['handle','handle'],['title','title'],['description','body_html']]as const){
      const val=name==='id'?identifier(source[field]):text(source[field]);
      if(p[name]!==val)errors.push('Campo de produto alterado: '+name);
    }
    if(p.variants.length!==(Array.isArray(source.variants)?source.variants.length:0))errors.push('Variante omitida.');
    for(let vi=0;vi<p.variants.length;vi++){
      const v=p.variants[vi],raw:any=atPointer(roots[v.page],v.pointer);
      if(!raw){errors.push('Variante sem fonte.');continue;}
      if(v.id!==identifier(raw.id)||v.sku!==text(raw.sku)||v.barcode!==text(raw.barcode)||v.price!==price(raw.price)||
        v.available!==(typeof raw.available==='boolean'?raw.available:null))errors.push('Dados protegidos alterados.');
    }
  }
  for(const finding of audit.findings){
    if(!findingSchema.safeParse(finding).success){errors.push('Contrato de evidência inválido.');continue;}
    for(const e of finding.evidence){
      if(!roots[e.page]){errors.push('Página de evidência ausente.');continue;}
      const raw=atPointer(roots[e.page],e.pointer);
      if(e.missing!==(raw===undefined)||JSON.stringify(e.value)!==JSON.stringify(raw===undefined?null:raw))errors.push('Evidência adulterada.');
    }
  }
  if(sha(JSON.stringify(audit))!==sha(JSON.stringify(expected)))errors.push('Diagnóstico diverge das regras/fontes versionadas.');
  return errors;
}

export function compareSnapshots(before:CatalogSnapshot,after:CatalogSnapshot,profile:unknown={version:'default-1'}){
  verifySnapshot(before,after.scope);verifySnapshot(after,before.scope);
  if(before.origin!==after.origin)throw Error('Comparação exige mesma origem.');
  if(Date.parse(after.capturedAt)<=Date.parse(before.capturedAt))throw Error('Comparação exige duas capturas em ordem cronológica.');
  const a=analyzeSnapshot(before,profile),b=analyzeSnapshot(after,profile);
  const index=(audit:CatalogAudit)=>{
    const entries=audit.products.flatMap(p=>p.id?p.variants.filter(v=>v.id).map(v=>[p.id+':'+v.id,v]as const):[]);
    if(new Set(entries.map(([id])=>id)).size!==entries.length)throw Error('Identificadores repetidos impedem comparação segura.');
    return new Map(entries);
  };
  const previous=index(a),current=index(b),changes:{id:string;from:boolean|null;to:boolean|null;meaning:string}[]=[];
  for(const [id,v]of current){const old=previous.get(id);if(old&&old.available!==v.available)changes.push({id,from:old.available,to:v.available,meaning:'Mudança de disponibilidade pública; não comprova reposição física ou demanda.'});}
  return {before:before.id,after:after.id,scope:before.scope,coverage:[a.coverage,b.coverage],changes,
    unmatched:{beforeOnly:[...previous.keys()].filter(k=>!current.has(k)),afterOnly:[...current.keys()].filter(k=>!previous.has(k))},
    limits:'Comparação apenas da interseção de variantes com IDs presentes; ausências podem decorrer da amostra. Não estima receita.'};
}
