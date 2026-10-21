import { createHash } from 'node:crypto';
import { z } from 'zod';

export const sha = (value: string) => createHash('sha256').update(value).digest('hex');
export const scopeSchema = z.object({ workspaceId:z.string().min(1).max(100), clientId:z.string().min(1).max(100) }).strict();
export type InspectionScope = z.infer<typeof scopeSchema>;
export const profileSchema = z.object({
  version:z.string().min(1).max(80),
  sizeOptionNames:z.array(z.string().min(1).max(60)).max(10).default(['Tamanho','Size']),
  expectedSizes:z.array(z.string().min(1).max(60)).max(40).default([]),
}).strict();
export type AuditProfile = z.infer<typeof profileSchema>;
const pageSchema = z.object({
  url:z.url().max(1000), capturedAt:z.iso.datetime(), body:z.string().max(2_000_000),
  sha256:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const snapshotSchema = z.object({
  version:z.literal('leakfinder-adapter-1'), scope:scopeSchema, origin:z.url().max(500),
  mode:z.enum(['synthetic','public-readonly']), capturedAt:z.iso.datetime(),
  pages:z.array(pageSchema).min(1).max(5), maxProducts:z.number().int().min(1).max(10),
  coverage:z.enum(['endpoint-complete','sample','interrupted']),
  stopReason:z.string().max(500), id:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type CatalogSnapshot = z.infer<typeof snapshotSchema>;
export function publicOrigin(value:string) {
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash)
    throw Error('Use somente a origem HTTPS pública, sem caminho, porta ou credenciais.');
  if(!/^[a-z0-9.-]+$/i.test(u.hostname)||!u.hostname.includes('.')||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname)||/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname))
    throw Error('Host público inválido.');
  return u.origin;
}
export function isProductPage(url:string){return /^\/products\/[a-z0-9][a-z0-9_-]*\.json$/i.test(new URL(url).pathname);}
export function productPointer(url:string,index:number){return isProductPage(url)?'/product':'/products/'+index;}
export function parsePage(body:string,singleProduct=false):Record<string,unknown>[] {
  const value:unknown=JSON.parse(body);
  if(singleProduct){
    const product=value&&typeof value==='object'?(value as any).product:undefined;
    if(!product||typeof product!=='object'||Array.isArray(product))throw Error('Resposta não contém product válido.');
    return [product];
  }
  if(!value||typeof value!=='object'||!Array.isArray((value as any).products))
    throw Error('Resposta não contém catálogo products; não usar fallback fictício.');
  const products=(value as any).products as unknown[];
  if(products.length>250||products.some(p=>!p||typeof p!=='object'||Array.isArray(p)))throw Error('Catálogo inválido ou acima do limite de página.');
  return products as Record<string,unknown>[];
}
function canonical(value:any):any {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
}
export function snapshotId(input:Omit<CatalogSnapshot,'id'>) { return sha(JSON.stringify(canonical(input))); }
export function makeSnapshot(input:Omit<CatalogSnapshot,'version'|'id'|'capturedAt'|'pages'> & {
  capturedAt?:string; pages:{url:string;body:string;capturedAt?:string}[];
}):CatalogSnapshot {
  const at=input.capturedAt??new Date().toISOString();
  const base={...input,version:'leakfinder-adapter-1' as const,capturedAt:at,
    pages:input.pages.map(p=>({...p,capturedAt:p.capturedAt??at,sha256:sha(p.body)}))};
  const snapshot=snapshotSchema.parse({...base,id:snapshotId(base)});
  verifySnapshot(snapshot);return snapshot;
}
export function verifySnapshot(value:unknown,scope?:InspectionScope):CatalogSnapshot {
  const snapshot=snapshotSchema.parse(value),{id,...base}=snapshot;
  if(snapshotId(base)!==id)throw Error('Snapshot alterado.');
  if(scope&&(snapshot.scope.clientId!==scope.clientId||snapshot.scope.workspaceId!==scope.workspaceId))throw Error('Snapshot pertence a outro cliente/workspace.');
  const origin=publicOrigin(snapshot.origin);
  const urls=new Set<string>();
  for(const page of snapshot.pages){
    const url=new URL(page.url);
    if(url.origin!==origin||(url.pathname!=='/products.json'&&!isProductPage(page.url))||url.username||url.password||url.hash||urls.has(page.url))throw Error('Fonte de catálogo inválida ou repetida.');
    urls.add(page.url);
    if(sha(page.body)!==page.sha256||Buffer.byteLength(page.body)>2_000_000)throw Error('Conteúdo alterado ou excessivo.');
    parsePage(page.body,isProductPage(page.url));
  }
  return snapshot;
}
export function atPointer(value:unknown,pointer:string):unknown {
  if(pointer==='')return value;
  if(!pointer.startsWith('/'))throw Error('JSON pointer inválido.');
  let current:any=value;
  for(const segment of pointer.slice(1).split('/').map(s=>s.replace(/~1/g,'/').replace(/~0/g,'~'))){
    if(current===null||typeof current!=='object'||!Object.hasOwn(current,segment))return undefined;
    current=current[segment];
  }
  return current;
}
