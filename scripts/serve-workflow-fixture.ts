import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { workflowDefinition } from '../src/workflow.ts';
import { offers, offerVersion, recurringOffer } from '../src/offers.ts';
// Explicit UI rehearsal. No Supabase, model, mail or production database connection.
const orders=[['11111111-1111-4111-8111-111111111111','needs_info'],['22222222-2222-4222-8222-222222222222','needs_attention'],['33333333-3333-4333-8333-333333333333','closed'],['44444444-4444-4444-8444-444444444444','cancelled']].map(([id,status])=>({id,status,mode:'test',revision:0,scope_approved:status!=='needs_info',payment_confirmed:status!=='needs_info'}));
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!['localhost:3001','127.0.0.1:3001'].includes(req.headers.host??'')){res.writeHead(403);res.end();return;}
  const path=new URL(req.url!,'http://localhost:3001').pathname;
  if(path==='/mobile'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<!doctype html><html lang="pt-BR"><title>Teste responsivo sintético</title><h1>API simulada — viewport móvel de 390px</h1><iframe title="Catana Ops móvel" src="/" width="390" height="844"></iframe></html>');return;
  }
  const json=(body:unknown)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
  if(path==='/config.json'){json({url:'http://localhost:3001',key:'synthetic-only'});return;}
  if(path==='/workflow-definition.json'){json(workflowDefinition());return;}
  if(path==='/offers.json'){json({offers,offerVersion,recurringOffer,mode:'validation'});return;}
  if(path==='/auth/v1/token'){json({access_token:'synthetic-session-only'});return;}
  if(path==='/auth/v1/user'){json({email:'catanaops@gmail.com',email_confirmed_at:new Date().toISOString()});return;}
  if(path==='/auth/v1/logout'){json({});return;}
  if(path.startsWith('/rest/')){
    if(req.headers.authorization!=='Bearer synthetic-session-only'){res.writeHead(401);res.end();return;}
    if(path.endsWith('catanaops_dashboard')){json({workspaces:[{id:'00000000-0000-4000-8000-000000000001',name:'DEMONSTRAÇÃO SINTÉTICA',role:'admin'}],counts:{clients:0,orders:4,tasks:0,artifacts:0},orders,tasks:[]});return;}
    let body='';for await(const c of req)body+=c;const selected=JSON.parse(body||'{}').p_order;
    const order=orders.find(o=>o.id===selected)??null;
    json({source:'API SIMULADA — não é Supabase',queriedAt:new Date().toISOString(),order,summary:[],taskCount:0,tasks:[],events:[],scope:'Dados fictícios para verificar navegação.'});return;
  }
  if(!['/','/auth-local.js','/workflow-ui.js','/auth-local.css','/style.css','/brazil-ui.js'].includes(path)){res.writeHead(404);res.end();return;}
  let text=readFileSync(new URL(`../public/${path==='/'?'auth-local.html':path.slice(1)}`,import.meta.url),'utf8');
  if(path==='/')text=text.replace('<main>','<main><p role="note">TESTE SINTÉTICO DA INTERFACE — API SIMULADA, sem dados reais</p>');
  res.setHeader('Content-Type',path==='/'?'text/html; charset=utf-8':path.endsWith('.css')?'text/css':'text/javascript');res.end(text);
});
server.listen(3001,'127.0.0.1',()=>console.log('UI fixture: http://localhost:3001 — API simulada'));
