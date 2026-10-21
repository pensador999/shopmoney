import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { workflowDefinition } from './workflow.ts';
import { offers, offerVersion, recurringOffer } from './offers.ts';
import { RemoteOperations } from './remote-operations.ts';
import { z } from 'zod';

// Local Auth validation only; independent of the operational panel and its database.
const server = createServer(async(req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; connect-src 'self' https://aqkwbmggkvvfhqaivxlh.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  if (!['localhost:3000','127.0.0.1:3000'].includes(req.headers.host ?? '')) {res.writeHead(403);res.end();return;}
  const path = new URL(req.url!, 'http://localhost:3000').pathname;
  if(path.startsWith('/api/remote/')&&req.method==='POST'){
    try{
      if(req.headers.origin!==`http://${req.headers.host}`||req.headers['content-type']!=='application/json'||!req.headers.authorization?.startsWith('Bearer '))throw Error('Origem ou autenticação inválida.');
      const chunks:Buffer[]=[];let size=0;for await(const c of req){size+=c.length;if(size>8_000_000)throw Error('Requisição excede limite.');chunks.push(c);}
      const body=JSON.parse(Buffer.concat(chunks).toString());
      const config=JSON.parse(readFileSync(new URL('../artifacts/auth-public.json',import.meta.url),'utf8'));
      const remote=new RemoteOperations({...config,token:req.headers.authorization.slice(7)});
      const workspace=z.uuid().parse(body.workspace);let result;
      switch(path){
        case '/api/remote/create':result=await remote.create(workspace,body.input);break;
        case '/api/remote/action':result=await remote.action(workspace,z.uuid().parse(body.id),z.string().parse(body.action),body.extra??{});break;
        case '/api/remote/download':res.setHeader('Content-Type','application/zip');res.end(await remote.download(workspace,z.uuid().parse(body.id)));return;
        default:throw Error('Rota indisponível.');
      }res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
    }catch{res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Operação remota não confirmada. Integração brasileira depende da migração validada, sessão ativa e materiais completos. Repita usando o mesmo identificador para evitar duplicação.'}));}return;
  }
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  if(path==='/offers.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({offers,offerVersion,recurringOffer,mode:'validation'}));return;}
  if (path === '/public-case-summary.json') {
    const file=new URL('../artifacts/public-case-summary.json',import.meta.url);
    if(!existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type','application/json');res.end(readFileSync(file));return;
  }
  if (path === '/workflow-definition.json') {
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(workflowDefinition()));return;
  }
  if (path === '/config.json') {
    res.setHeader('Content-Type','application/json');
    res.end(readFileSync(new URL('../artifacts/auth-public.json',import.meta.url)));return;
  }
  if (!['/','/auth-local.js','/auth-local.css','/style.css','/workflow-ui.js','/brazil-ui.js'].includes(path)) {res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',path==='/'?'text/html; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');
  res.end(readFileSync(new URL(`../public/${path==='/'?'auth-local.html':path.slice(1)}`,import.meta.url)));
});
server.listen(3000,'127.0.0.1',()=>console.log('Auth local: http://localhost:3000'));
