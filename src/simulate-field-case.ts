import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import {stringify} from 'csv-stringify/sync';
import {Store} from './store.ts';
import {Service} from './service.ts';
import {createEditorial} from './service-editorial.ts';
import {contentRequestSchema,prepareContent} from './brand-content.ts';
import {enqueueAgent,runAgentQueue,callEve} from './agents.ts';
import {agentContracts,type AgentRole} from './business-context.ts';
import {offerVersion} from './offers.ts';
import {qualityCheck,readTable} from './catalog.ts';
import {replenishmentReadiness} from './handoffs.ts';

const live=process.argv.includes('--live');
const directory=resolve('artifacts',`field-minimalista-${Date.now()}`);mkdirSync(directory,{recursive:true});
const dbPath=resolve(directory,'simulation.sqlite');let store=new Store(dbPath);
const home='https://minimalistashop.com.br/';
const product=home+'products/body-de-bebe-manga-curta-unissex-bolinhas-claro';
const kit=home+'products/conjunto-bebe-unissex-calca-body-curto-babador-racer-beige-e-beige';
const sources=[{url:'https://www.shopify.com/br/blog/lojas-virtuais-shopify',fact:'Shopify lista MiniMalista como loja brasileira de moda infantil.'},
  {url:home,fact:'Categorias infantis, novidades e conjuntos. Extração mostra limites de frete grátis diferentes no topo e no rodapé.'},
  {url:product,fact:'Amostra tem descrição estruturada, dados técnicos e tabela de medidas, além de opções de idade. Não comprova autoria por IA.'},
  {url:kit,fact:'Na extração, o título de um conjunto não corresponde ao tema descrito no corpo. Confirmar página atual e regras internas antes de corrigir.'}];
const observations=[
  {subject:'Comunicação de frete',category:'observed' as const,finding:'Extração pública da home informa R$299 no topo e R$500 no rodapé.',evidence:[{source:home,note:'Conteúdo público extraído; checkout, região e condições promocionais não foram testados.'}],nextAction:'Confirmar regra vigente e abrangência com o responsável; não alterar configuração de frete.'},
  {subject:'Consistência entre título e conteúdo do conjunto',category:'observed' as const,finding:'Título/URL e descrição do conjunto remetem a referências diferentes na versão extraída.',evidence:[{source:kit,note:'Página indexada há seis dias; pode haver cache ou edição recente. Não é prova de erro no catálogo atual inteiro.'}],nextAction:'Conferir versão atual e identificadores com a loja antes de propor correção.'},
  {subject:'Descrição da amostra individual',category:'observed' as const,finding:'Há especificações, descrição por seções e tabela de medidas. Não recomendar reescrita total por padrão.',evidence:[{source:product,note:'Observação de estrutura pública; não verificamos tecnicamente as alegações do fabricante.'}],nextAction:'Preservar informações existentes e qualificar somente inconsistências concretas.'},
  {subject:'Conjuntos e estoque',category:'needs_internal_evidence' as const,finding:'Não sabemos se o conjunto tem SKU/estoque próprio ou é composto a partir de SKUs de peças.',evidence:[{source:kit,note:'Vitrine mostra conjunto, não a regra operacional de estoque.'}],nextAction:'Solicitar regra de kit, composição e vínculo de variantes; não implantar sincronização ou reposição.'},
];
const evidence={reference:'MiniMalista Baby',url:home,sources,observations,qualification:'Aderência técnica parcial: Shopify, vestuário infantil e variantes. Porte, esforço manual, lote, aprovador, orçamento e intenção de compra não confirmados.',rejectedCandidate:{reference:'Saint Studio',reason:'A página consultada identifica tecnologia JET; não selecionar como caso Shopify sem confirmação.'},mode:'Pesquisa pública feita pelo chat; agentes research não possuem navegação própria.'};
const checks:string[]=[],agents:any[]=[],deliveries:any[]=[];
const mapping={supplierKey:'fixture-infantil',productId:'parent',title:'title',sku:'sku',price:'price',barcode:'ean',csvDelimiter:';' as const,priceDecimalSeparator:',' as const,options:[{name:'Tamanho',column:'size'},{name:'Cor',column:'color'}]};
const rows=['RN','0-3 meses','3-6 meses'].flatMap((size,i)=>[
  {parent:'F01',title:'Peça infantil sintética A',sku:`00010${i}`,price:'44,70',ean:i===0?'0012345678905':'',size,color:'Cor fictícia A'},
  {parent:'F02',title:'Peça infantil sintética B',sku:`00020${i}`,price:'53,40',ean:'',size,color:'Cor fictícia B'},
]);
const encode=(r:typeof rows)=>Buffer.from('\uFEFF'+stringify(r,{header:true,delimiter:';'}));
const brand={version:'fixture-infantil-1',audience:'Responsáveis por crianças — premissa sintética',proposition:'Informações claras sobre o produto fictício',tone:'Objetivo, sem promessas de saúde',forbiddenTerms:['hipoalergênico','UV50','cura'],materialAuthorization:true};
const content={brand,products:[{id:'F01',title:'Peça infantil sintética A',facts:[{text:'Composição: algodão.',source:'Ficha fictícia aprovada pelo operador do ensaio',approved:true}],copy:[],copyApproved:false}]};
const ids:Record<string,string>={};let completed=false;let failure:string|null=null;
const started=Date.now();
function persist(){
  const report={at:new Date().toISOString(),offerVersion,completed,mode:live?'Eve real solicitado':'respostas controladas; modelos não avaliados',failure,evidence,checks,agents,deliveries,technicalTimeMs:Date.now()-started,actualRevenueBRL:0,actualMargin:null,limits:['Diagnóstico público limitado; a loja não participou e não é cliente qualificado.','Dados, preços, identificadores, marca e conteúdo dos arquivos operacionais são sintéticos.','Observações da vitrine não foram copiadas para campos dos produtos fictícios.','Roteiro conduz transições; não comprova coordenação autônoma.','Sem contato, envio, cobrança, importação, fotos baixadas ou conexão remota.','Modelo Eve real bloqueado por permissão de symlink/revisão indisponível na tentativa desta etapa.']};
  writeFileSync(resolve(directory,'report.json'),JSON.stringify(report,null,2));
  writeFileSync(resolve(directory,'RESULTADO.md'),['# Ensaio de campo — MiniMalista Baby','',`Ciclo técnico completo: ${completed}. Modo: ${report.mode}.`,'',evidence.qualification,'','## Observações públicas',...observations.map(o=>`- **${o.subject}** (${o.category}): ${o.finding} Próximo passo: ${o.nextAction} [Fonte](${o.evidence[0].source})`),'','## Verificações',...checks.map(c=>'- '+c),'','## Papéis',...agents.map(a=>`- ${agentContracts[a.role as AgentRole].owner}: ${a.status}; ${a.result?.summary_pt??a.error??'pendente'}`),'','## Limites',...report.limits.map(l=>'- '+l),'','Receita real R$0. Contribuição desconhecida; tempo técnico não substitui esforço comercial.'].join('\n'));
}
try{
  writeFileSync(resolve(directory,'public-evidence.json'),JSON.stringify(evidence,null,2));
  const diagnosis=createEditorial(store,{name:'Ensaio público — não é cliente MiniMalista',email:'public-reference@example.invalid',service:'diagnostic',brief:{products:[{id:'PUBLIC-SAMPLE',title:'Amostra infantil analisada',description:'Descrição e detalhes já presentes; texto original não copiado.',source:product}],observations},demo:true});ids.diagnostic=diagnosis.id;
  let svc=new Service(store);svc.approve(diagnosis.id);svc.simulatePayment(diagnosis.id);await svc.process(diagnosis.id);
  const diagnosisZip=store.artifact(diagnosis.id,'delivery-0.zip');writeFileSync(resolve(directory,'diagnostico-publico.zip'),diagnosisZip);
  const publicReport=JSON.parse(new AdmZip(diagnosisZip).readAsText('diagnostico.json'));
  assert.equal(publicReport.findings.length,0);assert.equal(publicReport.observations.length,4);checks.push('Diagnóstico preserva quatro observações com fonte e não inventa descrição ausente.');
  deliveries.push({service:'diagnostic',id:diagnosis.id,amount:19000,currency:'BRL',simulated:true});
  const invalid=structuredClone(content);invalid.products[0].facts[0].approved=false;
  assert.throws(()=>prepareContent(contentRequestSchema.parse(invalid)));checks.push('Fato sem aprovação bloqueia conteúdo.');
  const dangerous=structuredClone(content);dangerous.products[0].facts[0].text='Proteção UV50';assert.throws(()=>prepareContent(contentRequestSchema.parse(dangerous)));checks.push('Alegação técnica proibida bloqueada mesmo na fixture.');
  const editorial=createEditorial(store,{name:'Marca infantil fictícia',email:'fixture@example.invalid',service:'content',brief:content,demo:true});ids.content=editorial.id;svc.approve(editorial.id);svc.simulatePayment(editorial.id);await svc.process(editorial.id);writeFileSync(resolve(directory,'conteudo-sintetico.zip'),store.artifact(editorial.id,'delivery-0.zip'));deliveries.push({service:'content',id:editorial.id,amount:49000,currency:'BRL',simulated:true});
  const bad=structuredClone(rows);bad[0].price='';const order=await svc.create({name:'Marca infantil fictícia',email:'fixture@example.invalid',filename:'fixture.csv',data:encode(bad),mapping,demo:true,service:'combined',content});ids.combined=order.id;
  assert.equal(order.status,'needs_info');await assert.rejects(()=>svc.process(order.id));checks.push('Preço ausente bloqueia execução; atendimento recebe campo e linha.');
  await svc.revise(order.id,encode(rows),'fixture-corrigida.csv',mapping);svc.approve(order.id);await assert.rejects(()=>svc.process(order.id));checks.push('Escopo aprovado sem pagamento/simulação não libera produção.');
  svc.simulatePayment(order.id);store.close();store=new Store(dbPath);svc=new Service(store);assert.equal(store.get(order.id).status,'queued');checks.push('Reabertura do banco recupera o mesmo pedido e revisão.');
  const ready=await svc.process(order.id);const output=await readTable(store.artifact(order.id,'shopify-1.csv'),'.csv');assert.equal(output.length,6);assert.equal(output[0].SKU,'000100');assert.equal(output[0].Price,'44.70');assert.equal(output[0].Barcodes,'0012345678905');checks.push('Dois pais/seis variantes infantis, zeros e decimal preservados.');
  const originals=JSON.parse(store.artifact(order.id,'source-1.json').toString());output[0].Price='0.01';assert(qualityCheck(originals,output,ready.mapping).length);checks.push('QA independente detecta adulteração do preço.');
  const zip=store.artifact(order.id,'delivery-1.zip');assert(new AdmZip(zip).getEntry('conteudo-por-identificador.csv'));writeFileSync(resolve(directory,'combinado-sintetico.zip'),zip);deliveries.push({service:'combined',id:order.id,amount:99000,currency:'BRL',simulated:true});
  const before=store.db.prepare('SELECT count(*) n FROM outbox').get()?.n;await assert.rejects(()=>svc.process(order.id));assert.equal(store.db.prepare('SELECT count(*) n FROM outbox').get()?.n,before);checks.push('Reexecução não duplica entrega.');
  assert.equal(replenishmentReadiness({historyDays:0,sales:false,availability:false,stock:false,inTransit:false,leadTime:false}).status,'not_evaluable');checks.push('Sem histórico, não recomenda reposição por status esgotado.');
  for(const role of Object.keys(agentContracts) as AgentRole[]){
    const job=enqueueAgent(store,role,{service:'combined',caseEvidence:evidence,synthetic:true,contractedOffer:ready.offer,operationalEvidence:{sourceReceived:true,structuralValidation:true,products:2,variants:6,scopeApproved:true,simulatedPayment:true,quality:ready.qa,missingKitRules:true,costsMeasured:false},instruction:'Avalie somente sua função. Não trate observações como fonte de dados de produto. Descrição da loja já é estruturada; não recomende reescrita genérica. Necessidade, orçamento e estoque são desconhecidos. Diferencie teste de execução comercial.'},order.clientId);
    await runAgentQueue(store,live?callEve:async()=>({summary_pt:'Resposta controlada: fila, idioma e isolamento testados; raciocínio do agente não foi avaliado.',reply_client:'',language:'pt-BR',action:'needs_info',rule:'SCOPE-01'}));
    const row=store.db.prepare('SELECT role,status,result,error FROM ai_jobs WHERE id=?').get(job) as any;agents.push({...row,result:row.result?JSON.parse(row.result):null});persist();if(row.status!=='done')throw Error(`Papel ${role} indisponível: ${row.error}`);
  }
  checks.push('Oito papéis passaram na fila; respostas controladas não são teste semântico de IA.');
  assert.equal(store.db.prepare("SELECT count(*) n FROM outbox WHERE status<>'draft'").get()?.n,0);checks.push('Nenhum envio, cobrança ou importação na loja.');completed=true;
}catch(e){failure=String(e);throw e;}finally{persist();store.close();writeFileSync(resolve('artifacts','field-case-summary.json'),JSON.stringify({reference:evidence.reference,url:home,directory,generatedAt:new Date().toISOString(),completed,mode:live?'Eve solicitado; consultar resultados':'Código real e respostas controladas; IA real pendente',observations,checks,agents,deliveries,actualRevenueBRL:0},null,2));console.log(JSON.stringify({directory,completed,checks:checks.length,roles:agents.filter(a=>a.status==='done').length,live}));}
