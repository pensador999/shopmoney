import {z} from 'zod';
import {createHash} from 'node:crypto';
import {stringify} from 'csv-stringify/sync';
import {readFileSync} from 'node:fs';
import {checkRequest,type StudioRequest} from './contracts.ts';
import {renderDescription} from './render.ts';

const text=z.string().trim().min(1).max(1000);
export const adaptiveSchema=z.object({
  category:z.string().max(100),
  coverage:z.object({kind:z.enum(['file','public','manual','unsupported']),source:text,observedAt:z.iso.datetime(),missing:z.array(text).max(30)}).strict(),
  requirements:z.array(z.object({id:text,question:text,required:z.boolean(),factIds:z.array(text).max(30)}).strict()).max(30),
  conflicts:z.array(z.object({id:text,question:text,sources:z.array(text).min(2).max(10),resolved:z.boolean(),decision:z.string().max(1000)}).strict()).max(20),
  catalog:z.object({currency:z.enum(['BRL','USD','EUR']),approved:z.boolean(),source:text,
    variants:z.array(z.object({variantId:text,price:z.string().regex(/^\d+(\.\d{1,2})?$/),barcode:z.string().regex(/^\d*$/),stock:z.number().int().nonnegative().nullable()}).strict()).max(200)
  }).strict().optional(),
  components:z.array(z.object({id:text,title:text,factIds:z.array(text).min(1).max(30),mediaIds:z.array(text).max(12)}).strict()).max(10),
  guides:z.array(z.object({id:text,title:text,componentId:z.string().max(1000),source:text,unit:z.enum(['cm','mm','in']),approved:z.boolean(),
    columns:z.array(text).min(1).max(8),rows:z.array(z.object({size:text,values:z.array(z.number().finite().positive()).min(1).max(8)}).strict()).min(1).max(30)
  }).strict()).max(10).optional(),
}).strict();
export const deliverableSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('pending'),questions:z.array(text).min(1).max(20)}).strict(),
  z.object({kind:z.literal('draft'),blocks:z.array(z.object({id:text,section:z.enum(['presentation','context','fit','features','composition','care','size']),text:z.string().min(1).max(2000),factIds:z.array(text).min(1).max(30)}).strict()).min(1).max(10)}).strict(),
  z.object({kind:z.literal('quality'),verdict:z.enum(['pass','revise','needs_info']),findings:z.array(z.object({blockId:text,reason:text,factIds:z.array(text).max(30)}).strict()).max(30),limits:z.array(text).min(1).max(10)}).strict(),
  z.object({kind:z.literal('plan'),structure:z.array(text).min(1).max(10),questions:z.array(text).max(20)}).strict(),
]);
export type Deliverable=z.infer<typeof deliverableSchema>;
const normText=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function apparelCategoryPreset(category:string){
  const c=normText(category);
  if(/\b(kit|conjunto)\b/.test(c))return {kind:'kit' as const,incompatibleTerms:[] as string[]};
  if(/\b(calca|bermuda|short|shorts|legging|saia)\b/.test(c))return {kind:'bottom' as const,incompatibleTerms:['manga longa','manga curta','gola padre','gola redonda','gola v','capuz','dedeira','palmilha','solado antiderrapante']};
  if(/\b(calcado|botina|bota|tenis|sapato|sandalia|chinelo)\b/.test(c))return {kind:'footwear' as const,incompatibleTerms:['manga longa','manga curta','gola padre','gola redonda','gola v','capuz','dedeira','entrepernas']};
  if(/\b(bone|chapeu|viseira|touca|gorro)\b/.test(c))return {kind:'headwear' as const,incompatibleTerms:['manga longa','manga curta','gola padre','gola redonda','entrepernas','barra da calca','solado','palmilha']};
  if(/\b(camisa.*botao|camisa social|camisa flanela|camisa sarja)\b/.test(c))return {kind:'button_shirt' as const,incompatibleTerms:['ziper frontal','gola padre com ziper','dedeira','solado antiderrapante','palmilha']};
  if(/\b(camisa|camiseta|blusa|jaqueta|moletom|top|regata|polo)\b/.test(c))return {kind:'top' as const,incompatibleTerms:['solado antiderrapante','palmilha anatomica','bico quadrado','entrepernas']};
  return {kind:'general' as const,incompatibleTerms:[] as string[]};
}
export function pending(input:StudioRequest,role?:'planner'|'production'|'quality'){
  const a=input.adaptive;
  const items=checkRequest(input).filter(i=>!['REQUIRED_PENDING','CONFLICT','SOURCE_UNSUPPORTED',...(role==='quality'?['COPY_PENDING']:[])].includes(i.code)).map(i=>({id:i.code+':'+i.subject,question:i.message,required:true,owner:'planner'}));
  if(input.product.variants.some(v=>!v.sku))items.push({id:'missing-sku',question:'Há variantes sem SKU. Confirme os códigos antes de exportar cadastro; a descrição pode avançar pelo ID do produto.',required:!!input.adaptive?.catalog,owner:'support'});
  if(a){
    if(a.coverage.kind==='unsupported')items.push({id:'source',question:'Fonte incompatível. Forneça arquivo ou ficha manual.',required:true,owner:'support'});
    for(const r of a.requirements)if(!r.factIds.length||r.factIds.some(id=>!input.product.facts.some(f=>f.id===id&&f.approved)))items.push({...r,owner:'support'});
    for(const c of a.conflicts)if(!c.resolved||!c.decision.trim())items.push({id:c.id,question:c.question,required:true,owner:'planner'});
    const catNorm=normText(a.category);
    if(/\b(infantil|kids|bebe|baby|juvenil)\b/.test(catNorm)&&input.product.variants.some(v=>v.size)&&!(a.guides??[]).some(g=>g.approved)&&!input.product.facts.some(f=>f.approved&&f.section==='size'))
      items.push({id:'kids-size-guide',question:'Peça infantil com grade de tamanhos: há tabela de medidas/faixa etária oficial da fonte?',required:false,owner:'support'});
    if(/\b(revenda|multimarca)\b/.test(catNorm)&&!input.product.facts.some(f=>f.approved&&/\b(marca|fabricante|procedencia|origem)\b/.test(normText(f.text))))
      items.push({id:'resale-origin',question:'Produto de revenda: confirme a marca original do fabricante e não atribua fabricação própria.',required:false,owner:'planner'});
  }
  return [...new Map(items.map(i=>[i.id,i])).values()];
}
export function adaptiveIssues(input:StudioRequest){
  const a=input.adaptive;if(!a)return [];
  const issues:{code:string;message:string;subject:string}[]=[];
  const add=(code:string,message:string,subject='produto')=>issues.push({code,message,subject});
  if(a.coverage.kind==='unsupported')add('SOURCE_UNSUPPORTED','Forneça arquivo ou ficha manual compatível.');
  const preset=apparelCategoryPreset(a.category);
  if(preset.kind==='kit'&&a.components.length<2)add('KIT_COMPONENTS_MISSING','Produto classificado como kit exige ao menos dois componentes distintos com fatos próprios.');
  if(preset.incompatibleTerms.length){
    const bodyNorm=normText([input.product.title,...input.blocks.map(b=>b.text)].join(' '));
    for(const term of preset.incompatibleTerms)if(bodyNorm.includes(term))add('SEMANTIC_CATEGORY_CONFLICT',`Termo incompatível com a categoria (${a.category}): ${term}`);
  }
  const guides=a.guides??[];
  if(new Set(guides.map(g=>g.id)).size!==guides.length)add('GUIDE_DUPLICATE','Guia duplicado.');
  for(const g of guides){
    if(!g.approved)add('GUIDE_PENDING','Confira o guia com a fonte.',g.id);
    if(g.componentId&&!a.components.some(c=>c.id===g.componentId))add('GUIDE_COMPONENT','Componente do guia inexistente.',g.id);
    if(g.rows.some(r=>r.values.length!==g.columns.length)||new Set(g.rows.map(r=>r.size)).size!==g.rows.length)add('GUIDE_SHAPE','Medidas incompletas ou tamanho duplicado.',g.id);
  }
  for(const r of a.requirements)if(r.required&&(!r.factIds.length||r.factIds.some(id=>!input.product.facts.some(f=>f.id===id&&f.approved))))add('REQUIRED_PENDING',r.question,r.id);
  for(const c of a.conflicts)if(!c.resolved||!c.decision.trim())add('CONFLICT',c.question,c.id);
  if(new Set(a.components.map(c=>c.id)).size!==a.components.length)add('COMPONENT_DUPLICATE','Componente duplicado.');
  for(const c of a.components){
    if(c.factIds.some(id=>!input.product.facts.some(f=>f.id===id&&f.approved)))add('COMPONENT_FACT','Componente sem fonte aprovada.',c.id);
    if(c.mediaIds.some(id=>!input.media.some(m=>m.id===id)))add('COMPONENT_MEDIA','Mídia de componente inexistente.',c.id);
  }
  return issues;
}
export function validateDeliverable(input:StudioRequest,role:string,value:unknown){
  const d=deliverableSchema.parse(value);
  if(d.kind==='pending')return d;
  if(({production:'draft',quality:'quality',planner:'plan'}as Record<string,string>)[role]!==d.kind)throw Error('Entrega incompatível com a função.');
  if(d.kind==='draft'){
    const candidate={...input,mode:'rewrite' as const,blocks:d.blocks.map(b=>({...b,approved:true}))};
    const fatal=checkRequest(candidate).filter(i=>['DUPLICATE','UNSOURCED','UNSUPPORTED_CLAIM','FORBIDDEN','SEMANTIC_CATEGORY_CONFLICT'].includes(i.code));
    if(fatal.length)throw Error(fatal.map(i=>i.message).join('; '));
  }
  if(d.kind==='quality'){
    if(d.verdict==='pass'&&!input.blocks.length)throw Error('QA não pode aprovar conteúdo inexistente.');
    if(d.verdict==='pass'&&d.findings.length)throw Error('QA contraditória.');
    for(const f of d.findings)if(!input.blocks.some(b=>b.id===f.blockId)||f.factIds.some(id=>!input.product.facts.some(p=>p.id===id)))throw Error('QA referencia bloco/fato inexistente.');
  }
  return d;
}
export function catalogFiles(input:StudioRequest,template:'essential'|'editorial',color:string){
  const catalog=input.adaptive?.catalog;if(!catalog)return {};
  if(!catalog.approved||checkRequest(input).length)throw Error('Cadastro exige dados e regras aprovados.');
  if(input.product.variants.some(v=>!v.sku))throw Error('Cadastro exige SKU confirmado em cada variante.');
  if(catalog.variants.length!==input.product.variants.length||new Set(catalog.variants.map(v=>v.variantId)).size!==catalog.variants.length||catalog.variants.some(v=>!input.product.variants.some(p=>p.id===v.variantId)))throw Error('Cadastro exige uma correspondência exata por variante.');
  const combinations=input.product.variants.map(v=>JSON.stringify([v.color,v.size]));
  if(new Set(combinations).size!==combinations.length)throw Error('Combinação de opções duplicada.');
  if(input.product.variants.some(v=>!!v.color!==!!input.product.variants[0].color||!!v.size!==!!input.product.variants[0].size))throw Error('Opções incompletas entre variantes.');
  const rendered=renderDescription(input,template,{selectedColor:color}),html=rendered.html;
  const seoTitle=input.product.title.replace(/\s+/g,' ').trim().slice(0,70);
  const seoDescription=rendered.plan.blocks.map(b=>b.text.replace(/\s+/g,' ').trim()).join(' ').slice(0,160);
  const shortDescription=(rendered.plan.blocks.map(b=>b.text.replace(/\s+/g,' ').trim()).filter(Boolean).join(' ')||input.product.facts.filter(f=>f.approved).map(f=>f.text.replace(/\s+/g,' ').trim()).join(' ')).replace(/^[\s\u0000-\u001f=+@-]+/u,'').slice(0,250);
  const category=input.adaptive?.category??'';
  if(input.product.existing)return {'alteracoes-produto.json':JSON.stringify({id:input.product.id,previous:input.product.original,proposedDescription:html,seoTitle,seoDescription,variants:catalog.variants,currency:catalog.currency,apply:false},null,2)};
  const headers=JSON.parse(readFileSync(new URL('../../schemas/bling-59.json',import.meta.url),'utf8')).headers as string[];
  const bling:Record<string,string>[]=[];
  const parent:Record<string,string>={'Código':input.product.id,'Descrição':input.product.title,'Unidade':'UN','Descrição Complementar':html,'Produto Variação':'Produto','Marca':input.brand.name,'Descrição Curta':shortDescription,'Categoria do produto':category};bling.push(parent);
  const shopify=input.product.variants.map((v,index)=>{
    const c=catalog.variants.find(c=>c.variantId===v.id)!;
    if(v.sku===input.product.id&&(input.product.variants.length>1||v.color||v.size))throw Error('SKU da variante colide com código do pai.');
    bling.push({'Código':v.sku,'Descrição':[v.color,v.size].filter(Boolean).join(' / ')||input.product.title,'Unidade':'UN','Descrição Complementar':html,'Código Pai':input.product.id,'Produto Variação':'Variação','Marca':input.brand.name,'Descrição Curta':shortDescription,'Categoria do produto':category,'Preço':c.price.replace('.',','),'GTIN/EAN':c.barcode,'Estoque':c.stock===null?'':String(c.stock)});
    return {'Title':index===0?input.product.title:'','URL handle':'catana-'+createHash('sha256').update(JSON.stringify([input.scope,input.product.id])).digest('hex').slice(0,32),'Description':index===0?html:'','Vendor':index===0?input.brand.name:'','Type':index===0?category:'','Status':'draft','Published on online store':'false','SKU':v.sku,'Barcodes':c.barcode,'Option1 name':v.color?'Cor':v.size?'Tamanho':'Title','Option1 value':v.color||v.size||'Default Title','Option2 name':v.color&&v.size?'Tamanho':'','Option2 value':v.color?v.size:'','Price':c.price,'SEO Title':index===0?seoTitle:'','SEO Description':index===0?seoDescription:''};
  });
  if(input.product.variants.length===1&&!input.product.variants[0].color&&!input.product.variants[0].size){bling.shift();bling[0]['Código Pai']='';bling[0]['Produto Variação']='Produto';bling[0]['Descrição']=input.product.title;bling[0]['Marca']=input.brand.name;bling[0]['Descrição Complementar']=html;bling[0]['Descrição Curta']=shortDescription;}
  for(const row of [...bling,...shopify])for(const value of Object.values(row))if(/^[\s\u0000-\u001f]*[=+@-]/u.test(value))throw Error('CSV contém célula com possível fórmula; corrija a origem sem alterar identificadores silenciosamente.');
  return {'shopify-rascunhos.csv':stringify(shopify,{header:true,record_delimiter:'\r\n'}),'bling-validacao.csv':stringify(bling,{header:true,columns:headers,delimiter:';',bom:true,record_delimiter:'\r\n'}),'cadastro.json':JSON.stringify({currency:catalog.currency,source:catalog.source,seoTitle,seoDescription,compatibility:'Não verificada por importação',variants:input.product.variants},null,2)};
}
