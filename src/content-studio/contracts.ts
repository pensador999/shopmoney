import {z} from 'zod';
import {brandProfileSchema} from '../brand-content.ts';
import {publicOrigin} from '../inspection/snapshot.ts';
import {adaptiveSchema,adaptiveIssues} from './adaptive.ts';

const id=z.string().min(1).max(100).refine(v=>v.trim()===v,'Identificador não pode ter espaços externos.');
export const studioScopeSchema=z.object({workspaceId:id,clientId:id,storeId:id}).strict();
export type StudioScope=z.infer<typeof studioScopeSchema>;
export const sectionSchema=z.enum(['presentation','context','fit','features','composition','care','size']);
export const templateSchema=z.enum(['essential','editorial']);
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const studioRequestSchema=z.object({
  version:z.literal('content-studio-1'),scope:studioScopeSchema,
  adaptive:adaptiveSchema.optional(),
  brand:brandProfileSchema.extend({
    approved:z.boolean(),materialAuthorization:z.boolean(),name:z.string().min(1).max(120),
    introduction:z.string().max(500).default(''),
    visual:z.object({accent:color,background:color,text:color,font:z.enum(['system','serif']),radius:z.number().int().min(0).max(24)}).strict(),
    mediaHosts:z.array(z.string().min(1).max(200)).max(10).default([]),
  }).strict(),
  product:z.object({
    id,title:z.string().min(1).max(200),existing:z.boolean(),source:z.string().min(1).max(1000),
    original:z.object({html:z.string().max(100000).default(''),text:z.string().max(12000).default(''),approved:z.boolean()}).strict(),
    variants:z.array(z.object({id,productId:id,sku:z.string().max(100).refine(v=>v.trim()===v),color:z.string().max(100).default(''),size:z.string().max(100).default('')}).strict()).min(1).max(200),
    facts:z.array(z.object({id,text:z.string().min(1).max(1500),source:z.string().min(1).max(1000),approved:z.boolean(),section:sectionSchema}).strict()).max(30),
  }).strict(),
  media:z.array(z.object({
    id,productId:id,url:z.string().max(2000),source:z.string().min(1).max(1000),authorized:z.boolean(),approved:z.boolean(),
    variantIds:z.array(id).max(200).default([]),color:z.string().max(100).default(''),
    role:z.enum(['hero','detail','context']),alt:z.string().min(1).max(300),
  }).strict()).max(12),
  mode:z.enum(['preserve','reorganize','rewrite']),
  blocks:z.array(z.object({id,section:sectionSchema,text:z.string().min(1).max(2000),factIds:z.array(id).min(1).max(30),approved:z.boolean()}).strict()).max(30).default([]),
}).strict();
export type StudioRequest=z.infer<typeof studioRequestSchema>;
export type StudioIssue={code:string;message:string;subject:string};
export const templateVersion='catana-description-3';
const luminance=(hex:string)=>{
  const values=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4));
  return values[0]*0.2126+values[1]*0.7152+values[2]*0.0722;
};
const claimTokens=(s:string)=>(s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/\b(?:uv\s*\d+\+?|fpu\s*\d+\+?|impermeavel|antiodor|antibacterian[oa]|certificad[oa]|secagem rapida|couro|antiderrapante|anti-atrito|costuras planas|algodao|poliester|elastano|nylon|\d+(?:[.,]\d+)?\s*%)/g)??[]);
export function checkRequest(input:StudioRequest){
  const issues:StudioIssue[]=adaptiveIssues(input);
  const add=(code:string,message:string,subject='produto')=>issues.push({code,message,subject});
  const unique=(values:string[],label:string)=>{if(new Set(values).size!==values.length)add('DUPLICATE',label+' duplicado.');};
  unique(input.product.variants.map(v=>v.id),'ID de variante');
  unique(input.product.variants.map(v=>v.sku).filter(Boolean),'SKU');
  unique(input.product.facts.map(f=>f.id),'ID de fato');unique(input.media.map(m=>m.id),'ID de mídia');unique(input.blocks.map(b=>b.id),'ID de bloco');
  if(!input.brand.approved)add('BRAND_PENDING','Perfil da loja precisa de aprovação.');
  if(!input.brand.materialAuthorization)add('RIGHTS','Autorização dos materiais não confirmada.');
  for(const color of [input.brand.visual.text,input.brand.visual.accent]){
    const a=luminance(color),b=luminance(input.brand.visual.background);
    if((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)<4.5)add('CONTRAST','Contraste insuficiente entre texto/destaque e fundo; ajuste o perfil.');
  }
  if(input.product.variants.some(v=>v.productId!==input.product.id))add('ORPHAN','Variante pertence a outro produto.');
  if(input.product.facts.some(f=>!f.approved))add('FACT_PENDING','Há fatos sem aprovação.');
  if(!input.product.facts.some(f=>f.approved))add('FACTS_MISSING','Forneça ao menos um fato aprovado para preparar o conteúdo.');
  const rawText=[input.product.title,input.brand.introduction,...input.blocks.map(b=>b.text),...input.product.facts.map(f=>f.text)].join(' ').toLocaleLowerCase('pt-BR');
  for(const term of input.brand.forbiddenTerms)if(rawText.includes(term.toLocaleLowerCase('pt-BR')))add('FORBIDDEN','Termo proibido: '+term);
  if(input.mode==='preserve'&&(!input.product.original.approved||!input.product.original.text.trim()))add('ORIGINAL_PENDING','Preservação exige texto original aprovado.');
  if(input.mode==='reorganize'&&!input.product.original.approved)add('ORIGINAL_PENDING','Reorganização exige texto original aprovado.');
  if(input.mode==='reorganize'&&!input.blocks.length&&input.product.facts.some(f=>!input.product.original.text.includes(f.text)))add('REORGANIZE','Forneça trechos originais para reorganizar, sem acrescentar fatos ao texto.');
  if(input.product.facts.some(f=>!f.source.trim())||input.media.some(m=>!m.source.trim()))add('SOURCE_EMPTY','Fonte não pode estar em branco.');
  for(const block of input.blocks){
    const facts=block.factIds.map(fid=>input.product.facts.find(f=>f.id===fid));
    if(facts.some(f=>!f?.approved))add('UNSOURCED','Bloco contém referência ausente ou fato sem aprovação.',block.id);
    if(!block.approved)add('COPY_PENDING','Rascunho exige revisão de texto.',block.id);
    if(input.mode==='reorganize'&&!input.product.original.text.includes(block.text))add('REORGANIZE','Reorganização deve preservar os trechos originais.',block.id);
    const approved=facts.filter(Boolean).map(f=>f!.text).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    for(const claim of claimTokens(block.text))if(!approved.includes(claim))add('UNSUPPORTED_CLAIM','Alegação técnica sem apoio no fato referenciado: '+claim,block.id);
  }
  for(const m of input.media){
    if(!m.authorized||!m.approved)add('MEDIA_PENDING','Mídia exige autorização e conferência visual pelo operador.',m.id);
    if(m.productId!==input.product.id)add('MEDIA_PRODUCT','Imagem pertence a outro produto.',m.id);
    const variants=m.variantIds.map(vid=>input.product.variants.find(v=>v.id===vid));
    if(variants.some(v=>!v))add('MEDIA_VARIANT','Imagem aponta para variante inexistente.',m.id);
    const colors=new Set(variants.filter(Boolean).map(v=>v!.color).filter(Boolean));
    if(colors.size>1||m.color&&[...colors].some(c=>c!==m.color))add('MEDIA_COLOR','Associação de cor ambígua; revisar.',m.id);
    if(m.color&&!input.product.variants.some(v=>v.color===m.color))add('MEDIA_COLOR','Cor de mídia não existe nas variantes.',m.id);
    if(!m.variantIds.length&&!m.color&&new Set(input.product.variants.map(v=>v.color).filter(Boolean)).size>1)add('MEDIA_COLOR','Defina a cor/vínculo da imagem em produto multicolorido.',m.id);
    if(!/^\/studio-fixture-(sand|blue)\.svg$/.test(m.url)){
      try{const u=new URL(m.url);publicOrigin(u.origin);if(u.username||u.password||!input.brand.mediaHosts.includes(u.hostname))throw Error();}
      catch{add('MEDIA_URL','URL deve usar HTTPS e host aprovado, sem credenciais.',m.id);}
    }
  }
  for(const host of input.brand.mediaHosts){try{if(new URL(publicOrigin('https://'+host)).hostname!==host)throw Error();}catch{add('MEDIA_HOST','Host de mídia inválido.');}}
  const protectedSource=input.product.facts.filter(f=>f.approved).map(f=>f.text).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  for(const claim of claimTokens(input.brand.introduction))if(!protectedSource.includes(claim))add('BRAND_CLAIM','A introdução contém alegação técnica sem fonte: '+claim);
  return issues;
}
