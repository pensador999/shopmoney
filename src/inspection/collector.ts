// Coleta serial e limitada, adaptada dos conceitos catalog-proxy/adaptiveCrawlerQueue.
// Sem proxy de evasão, navegador, login, upload ou integração de escrita.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { isProductPage, makeSnapshot, parsePage, publicOrigin, scopeSchema, verifySnapshot, type CatalogSnapshot, type InspectionScope } from './snapshot.ts';

export class InspectionUnavailable extends Error {
  retryAfterMs:number;
  constructor(message:string,retryAfterMs=0){super(message);this.retryAfterMs=retryAfterMs;}
}
export function isPublicAddress(address:string){
  if(isIP(address)===4){
    const [a,b,c]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||
      a===192&&(b===168||b===0||b===88&&c===99)||a===100&&b>=64&&b<=127||
      a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
  }
  // Fail closed for mapped IPv4, local, link-local, multicast and special/documentation ranges.
  if(isIP(address)!==6||!/^[23]/i.test(address)||/^2002:/i.test(address))return false;
  const prefix=address.split(':');
  return !(prefix[0].toLowerCase()==='2001'&&(parseInt(prefix[1]||'0',16)<0x200||prefix[1].toLowerCase()==='db8'));
}
export type PageTransport=(url:string,signal:AbortSignal)=>Promise<Response>;
export async function publicPageTransport(url:string,signal:AbortSignal):Promise<Response>{
  const u=new URL(url);publicOrigin(u.origin);
  if(u.username||u.password||u.hash||(u.pathname!=='/products.json'&&!isProductPage(url)))throw Error('Destino fora dos endpoints públicos permitidos.');
  const addresses=await lookup(u.hostname,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw Error('DNS privado ou reservado bloqueado.');
  const selected=addresses[0];
  return new Promise((resolve,reject)=>{
    // Pin the validated address to the actual connection, retaining hostname for TLS.
    const req=request(u,{method:'GET',signal,headers:{Accept:'application/json','User-Agent':'CatanaOps-ReadOnly/1'},
      lookup:((_host:any,_options:any,cb:any)=>_options?.all?cb(null,[selected]):cb(null,selected.address,selected.family)) as any,
    },res=>{
      const chunks:Buffer[]=[];let bytes=0;
      res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>2_000_000){req.destroy(Error('Resposta excede 2MB.'));return;}chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>{
        const headers=new Headers();
        for(const key of ['content-type','retry-after']){const v=res.headers[key];if(typeof v==='string')headers.set(key,v);}
        const status=res.statusCode??502;
        resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(chunks),{status,headers}));
      });
    });
    req.on('error',reject);req.end();
  });
}
async function boundedText(response:Response){
  if(Number(response.headers.get('content-length')??0)>2_000_000)throw Error('Resposta excede 2MB.');
  if(!response.body)throw Error('Resposta sem corpo.');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2_000_000)throw Error('Resposta excede 2MB.');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks).toString('utf8');
}
export async function collectCatalog(input:{
  origin:string;approvedOrigin:string;scope:InspectionScope;maxProducts?:number;maxPages?:number;
  mode:'synthetic'|'public-readonly';resume?:CatalogSnapshot;signal?:AbortSignal;
},dependencies:{transport?:PageTransport;wait?:(ms:number)=>Promise<void>}={}):Promise<CatalogSnapshot>{
  const origin=publicOrigin(input.origin),approved=publicOrigin(input.approvedOrigin),scope=scopeSchema.parse(input.scope);
  if(origin!==approved)throw Error('Origem não aprovada pelo operador.');
  if(input.mode==='synthetic'&&!dependencies.transport)throw Error('Modo sintético exige transporte fixture; rede real bloqueada.');
  const maxProducts=input.maxProducts??10,maxPages=input.maxPages??3,pageSize=5;
  if(!Number.isInteger(maxProducts)||maxProducts<1||maxProducts>10||!Number.isInteger(maxPages)||maxPages<1||maxPages>5)throw Error('Limites inválidos.');
  const seed=input.resume?verifySnapshot(input.resume,scope):undefined;
  if(seed&&(seed.origin!==origin||seed.mode!==input.mode||seed.maxProducts!==maxProducts||seed.coverage!=='interrupted'||seed.pages.some(p=>isProductPage(p.url))))throw Error('Checkpoint incompatível.');
  const pages=seed?[...seed.pages]:[],transport=dependencies.transport??publicPageTransport;
  const wait=dependencies.wait??(ms=>new Promise(r=>setTimeout(r,ms)));
  let coverage:CatalogSnapshot['coverage']='sample',stopReason='Limite da amostra atingido.';
  const count=()=>pages.reduce((n,p)=>n+parsePage(p.body).length,0);
  for(let page=pages.length+1;page<=maxPages&&count()<maxProducts;page++){
    try{
      input.signal?.throwIfAborted();
      const url=origin+'/products.json?limit='+pageSize+'&page='+page;
      let response:Response|undefined;
      for(let attempt=0;attempt<2;attempt++){
        const signal=AbortSignal.any([AbortSignal.timeout(10_000),...(input.signal?[input.signal]:[])]);
        response=await transport(url,signal);
        if(response.status!==429&&response.status!==503)break;
        const raw=response.headers.get('retry-after'),seconds=raw===null?1:Number(raw);
        await response.body?.cancel();
        const delay=Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(raw??'')-Date.now());
        if(attempt||!Number.isFinite(delay)||delay>2000)throw new InspectionUnavailable('Origem temporariamente indisponível; retomar depois.',Number.isFinite(delay)?delay:0);
        input.signal?.throwIfAborted();await wait(delay);
      }
      if(!response||!response.ok){await response?.body?.cancel();throw Error('Coleta HTTP não concluída: '+response?.status);}
      if(!response.headers.get('content-type')?.toLowerCase().includes('application/json')){await response.body?.cancel();throw Error('Resposta não é JSON; sem fallback fictício.');}
      const body=await boundedText(response),products=parsePage(body);
      pages.push({url,capturedAt:new Date().toISOString(),body,sha256:''});
      if(products.length<pageSize&&count()<=maxProducts){coverage='endpoint-complete';stopReason='Fim observado no endpoint público.';break;}
    }catch(error){
      if(!pages.length)throw error;
      coverage='interrupted';stopReason=(error instanceof Error?error.message:'Coleta interrompida.').slice(0,500);break;
    }
  }
  if(!pages.length)throw Error('Nenhuma página coletada.');
  return makeSnapshot({scope,origin,mode:input.mode,pages,maxProducts,coverage,stopReason,capturedAt:seed?.capturedAt});
}

// Seleção explícita de até cinco peças, identificadas na vitrine pública.
// /products/<handle>.json usa preços decimais; não usa o endpoint .js de preços em centavos.
export async function collectProductPages(input:{
  origin:string;approvedOrigin:string;scope:InspectionScope;handles:string[];
  mode:'synthetic'|'public-readonly';signal?:AbortSignal;
},dependencies:{transport?:PageTransport}={}):Promise<CatalogSnapshot>{
  const origin=publicOrigin(input.origin),scope=scopeSchema.parse(input.scope);
  if(origin!==publicOrigin(input.approvedOrigin))throw Error('Origem não aprovada.');
  if(input.mode==='synthetic'&&!dependencies.transport)throw Error('Modo sintético exige fixture.');
  if(!input.handles.length||input.handles.length>5||new Set(input.handles).size!==input.handles.length||
    input.handles.some(h=>!/^[a-z0-9][a-z0-9_-]{0,180}$/i.test(h)))throw Error('Selecione de um a cinco handles públicos válidos e distintos.');
  const pages:{url:string;capturedAt:string;body:string}[]=[];
  let coverage:CatalogSnapshot['coverage']='sample',stopReason='Seleção explícita de páginas de produtos; não é catálogo completo.';
  for(const handle of input.handles){
    try{
      input.signal?.throwIfAborted();
      const url=origin+'/products/'+handle+'.json',signal=AbortSignal.any([AbortSignal.timeout(10_000),...(input.signal?[input.signal]:[])]);
      const response=await (dependencies.transport??publicPageTransport)(url,signal);
      if(!response.ok||!response.headers.get('content-type')?.includes('application/json')){
        await response.body?.cancel();throw Error('Produto não coletado: HTTP '+response.status);
      }
      const body=await boundedText(response),[product]=parsePage(body,true);
      if(product.handle!==handle)throw Error('Produto retornado difere da seleção.');
      pages.push({url,body,capturedAt:new Date().toISOString()});
    }catch(error){
      if(!pages.length)throw error;
      coverage='interrupted';stopReason=String(error).slice(0,500);break;
    }
  }
  return makeSnapshot({scope,origin,mode:input.mode,pages,maxProducts:input.handles.length,coverage,stopReason});
}
