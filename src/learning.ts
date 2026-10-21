import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Store } from './store.ts';
import { assert } from './policy.ts';
import { replenishmentReadiness } from './handoffs.ts';
import { economics } from './order-workflow.ts';
import { Examples } from './content-studio/examples.ts';
import type { StudioScope } from './content-studio/contracts.ts';

export const proposalSchema=z.object({orderId:z.uuid(),revision:z.number().int().nonnegative(),problem:z.string().min(1).max(2000),evidence:z.array(z.string().min(1).max(1000)).min(1).max(10),proposedRule:z.string().min(1).max(3000)}).strict();
export function proposeLearning(store:Store,input:unknown){
  const p=proposalSchema.parse(input),order=store.get(p.orderId);assert(order.revision===p.revision,'Aprendizado de revisão antiga.');
  const id=randomUUID(),data={...p,clientId:order.clientId,status:'proposed',scope:'client-only',createdAt:new Date().toISOString()};
  store.db.prepare('INSERT INTO learning_proposals VALUES(?,?,?)').run(id,order.clientId,JSON.stringify(data));
  order.learningProposals=[...(order.learningProposals??[]),{id,...data}];store.save(order);return {id,...data};
}
export function reviewLearning(store:Store,id:string,clientId:string,input:unknown){
  const review=z.object({approved:z.boolean(),testEvidence:z.string().min(1).max(2000)}).strict().parse(input);
  const row=store.db.prepare('SELECT data FROM learning_proposals WHERE id=? AND client_id=?').get(id,clientId) as any;assert(row,'Proposta não encontrada para este cliente.');
  const p=JSON.parse(row.data);assert(p.status==='proposed','Proposta já revisada.');
  const order=store.get(p.orderId);assert(order.revision===p.revision,'Teste e aprovação devem se referir à revisão atual.');
  const next={...p,...review,status:review.approved?'approved':'rejected',approvedBy:'local_operator',reviewedAt:new Date().toISOString()};
  store.db.prepare('UPDATE learning_proposals SET data=? WHERE id=? AND client_id=?').run(JSON.stringify(next),id,clientId);
  order.learningProposals=(order.learningProposals??[]).map(v=>v.id===id?{id,...next}:v);store.save(order);
  store.audit(p.orderId,'SCOPE-01','learning_reviewed',{id,status:next.status,scope:'client-only'});return next;
}

const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const bigrams=(s:string)=>{const clean=norm(s).replace(/\s+/g,'');if(clean.length<2)return [clean];const out:string[]=[];for(let i=0;i<clean.length-1;i++)out.push(clean.slice(i,i+2));return out;};
const diceSimilarity=(a:string,b:string)=>{
  if(norm(a)===norm(b))return 1;
  const ba=bigrams(a),bb=bigrams(b);
  const counts=new Map<string,number>();
  for(const g of ba)counts.set(g,(counts.get(g)??0)+1);
  let overlap=0;
  for(const g of bb){const c=counts.get(g)??0;if(c>0){overlap++;counts.set(g,c-1);}}
  return (2*overlap)/Math.max(1,ba.length+bb.length);
};

const FIELD_SYNONYMS:Record<string,string[]>={
  productId:['product_id','productid','id_produto','cod_pai','codigo_pai','referencia','ref','ref_peca','parent_id','agrupador'],
  title:['title','titulo','nome','produto','nome_produto','desc_curta','descricao_curta'],
  sku:['sku','codigo','cod_item','codigo_variante','ref_variante','item_sku'],
  price:['price','preco','valor','vlr_venda','preco_venda','valor_unitario'],
  barcode:['barcode','gtin','ean','ean13','cod_barras','codigo_barras','gtin_ean'],
  description:['description','descricao','detalhes','body_html','descricao_complementar'],
  color:['cor','color','variacao_cor','grade_cor','tonalidade'],
  size:['tamanho','size','tam','grade_tam','medida_grade'],
};

export function inferSupplierMapping(store:Store,clientId:string,headers:string[],supplierKey='fornecedor-local') {
  const clientOrders=store.orders().filter(o=>o.clientId===clientId&&o.scopeApproved&&o.mapping?.productId);
  const learnedColumns:Record<string,Set<string>>={};
  for(const o of clientOrders){
    for(const k of ['productId','title','sku','price','barcode','description'] as const){
      const col=(o.mapping as any)[k];
      if(typeof col==='string'&&col){learnedColumns[k]??=new Set();learnedColumns[k].add(norm(col));}
    }
    for(const opt of o.mapping.options??[]){
      const key=norm(opt.name).includes('cor')?'color':norm(opt.name).includes('tam')||norm(opt.name).includes('size')?'size':'';
      if(key){learnedColumns[key]??=new Set();learnedColumns[key].add(norm(opt.column));}
    }
  }
  const bestMatch=(field:string)=>{
    const synonyms=FIELD_SYNONYMS[field]??[field];
    const learned=learnedColumns[field]??new Set<string>();
    let bestCol='',bestScore=0;
    for(const h of headers){
      const nh=norm(h);
      const learnedBoost=learned.has(nh)?0.38:0;
      const synScore=Math.max(...synonyms.map(s=>diceSimilarity(nh,s)));
      const score=Math.min(1,Number((synScore+learnedBoost).toFixed(4)));
      if(score>bestScore){bestScore=score;bestCol=h;}
    }
    return {column:bestScore>=0.45?bestCol:'',confidence:bestScore,learnedFromHistory:learned.has(norm(bestCol))};
  };
  const mProductId=bestMatch('productId'),mTitle=bestMatch('title'),mSku=bestMatch('sku'),mPrice=bestMatch('price'),mBarcode=bestMatch('barcode'),mDesc=bestMatch('description'),mColor=bestMatch('color'),mSize=bestMatch('size');
  const options:{name:string;column:string}[]=[];
  if(mColor.column)options.push({name:'Cor',column:mColor.column});
  if(mSize.column)options.push({name:'Tamanho',column:mSize.column});
  const coreScores=[mProductId.confidence,mTitle.confidence,mSku.confidence,mPrice.confidence];
  const overallConfidence=Number((coreScores.reduce((a,b)=>a+b,0)/coreScores.length).toFixed(4));
  return {
    mapping:{
      supplierKey,
      productId:mProductId.column||headers[0]||'product_id',
      title:mTitle.column||headers[1]||'title',
      sku:mSku.column||headers[2]||'sku',
      price:mPrice.column||headers[3]||'price',
      ...(mBarcode.column?{barcode:mBarcode.column}:{}),
      ...(mDesc.column?{description:mDesc.column}:{}),
      options,
    },
    confidence:overallConfidence,
    fieldConfidences:{productId:mProductId,title:mTitle,sku:mSku,price:mPrice,barcode:mBarcode,description:mDesc,color:mColor,size:mSize},
    learnedOrdersCount:clientOrders.length,
    requiresHumanReview:true as const,
  };
}

const APPAREL_PRIORS:Record<string,string[]>={
  camisa:['camisa','manga','gola','punho','botao','botoes','colarinho','uv50','fpu50','protecao solar','blusa'],
  camiseta:['camiseta','tshirt','t-shirt','malha','gola redonda','careca','algodao','basica'],
  calca:['calca','jeans','cintura','barra','entrepernas','quadril','bolso','bermuda','short'],
  botina:['botina','bota','calcado','solado','palmilha','cano','couro','antiderrapante','sapato','tenis'],
  kit:['kit','conjunto','combo','duplo','pares','pecas','superior','inferior'],
  infantil:['infantil','kids','bebe','rn',' Juvenil','crianca','escolar','menino','menina'],
};

export function predictApparelCategory(store:Store,scope:StudioScope,text:string) {
  const clean=norm(text);
  const words=new Set(clean.split(/\s+/).filter(w=>w.length>=2));
  const examples=new Examples(store).list(scope).filter(e=>e.active);
  const scores:Record<string,{score:number;matched:string[];fromStore:number}>={};
  for(const [cat,priors] of Object.entries(APPAREL_PRIORS)){
    const matched=priors.filter(p=>clean.includes(norm(p)));
    const storeMatches=examples.filter(e=>norm(e.category).includes(cat)).reduce((acc,e)=>{
      const exTokens=norm(e.problem+' '+e.reason+' '+JSON.stringify(e.blocks)).split(/\s+/);
      const overlap=exTokens.filter(t=>t.length>=3&&words.has(t)).length;
      return acc+(overlap>0?0.35+Math.min(0.45,overlap*0.1):0);
    },0);
    scores[cat]={score:Number((matched.length*0.42+storeMatches).toFixed(4)),matched,fromStore:Number(storeMatches.toFixed(4))};
  }
  const ranked=Object.entries(scores).sort((a,b)=>b[1].score-a[1].score);
  const top=ranked[0]??['vestuario',{score:0,matched:[],fromStore:0}];
  const total=ranked.reduce((s,[,v])=>s+v.score,0);
  const confidence=top[1].score>0?Number(Math.min(0.99,0.45+(top[1].score/Math.max(1,total))*0.5).toFixed(4)):0.25;
  return {
    predictedCategory:top[1].score>0?top[0]:'vestuario',
    confidence,
    matchedFeatures:top[1].matched,
    learnedFromStoreExamples:top[1].fromStore>0,
    activeStoreExamples:examples.length,
  };
}

export function evaluateStoreAdaptation(store:Store,input:{
  scope:StudioScope;
  expectedSizes?:string[];
  observedVariants:{sku:string;size?:string;available?:boolean|null}[];
  previousVariants?:{sku:string;available?:boolean|null}[];
  replenishmentInput?:{historyDays:number;sales:boolean;availability:boolean;stock:boolean;inTransit:boolean;leadTime:boolean};
}) {
  const examples=new Examples(store).list(input.scope).filter(e=>e.active);
  const proposals=(store.db.prepare('SELECT data FROM learning_proposals WHERE client_id=?').all(input.scope.clientId) as {data:string}[])
    .map(r=>JSON.parse(r.data)).filter(p=>p.status==='approved');
  const clientOrders=store.orders().filter(o=>o.clientId===input.scope.clientId);
  const totalVariants=input.observedVariants.length;
  const unavailableVariants=input.observedVariants.filter(v=>v.available===false).length;
  const unknownAvailability=input.observedVariants.filter(v=>v.available===undefined||v.available===null).length;
  const stockoutRate=totalVariants>0?Number((unavailableVariants/totalVariants).toFixed(4)):0;
  const observedSizes=new Set(input.observedVariants.map(v=>norm(v.size??'')).filter(Boolean));
  const missingSizes=(input.expectedSizes??[]).filter(s=>!observedSizes.has(norm(s)));
  let restockedSkus:string[]=[],newlyOutOfStockSkus:string[]=[];
  if(input.previousVariants?.length){
    const prevMap=new Map(input.previousVariants.map(v=>[v.sku,v.available]));
    for(const cur of input.observedVariants){
      const prev=prevMap.get(cur.sku);
      if(prev===false&&cur.available===true)restockedSkus.push(cur.sku);
      if(prev===true&&cur.available===false)newlyOutOfStockSkus.push(cur.sku);
    }
  }
  const repGate=replenishmentReadiness(input.replenishmentInput??{
    historyDays:0,sales:false,availability:unknownAvailability===0&&totalVariants>0,stock:false,inTransit:false,leadTime:false,
  });
  const measuredOrders=clientOrders.filter(o=>o.economicsRecordedAt);
  const healthyMarginOrders=measuredOrders.filter(o=>economics(o).targetMet);
  const adaptationScore=Math.min(100,Math.round(
    40 +
    Math.min(25,examples.length*12.5) +
    Math.min(20,proposals.length*10) +
    (missingSizes.length===0?15:5)
  ));
  return {
    scope:input.scope,
    storeFit:{
      adaptationScore,
      activeExamplesCount:examples.length,
      approvedClientRulesCount:proposals.length,
      tenantIsolated:true as const,
      mode:'local-sqlite-heuristic-ml' as const,
    },
    demandDiagnostics:{
      totalVariants,
      unavailableVariants,
      unknownAvailability,
      stockoutRate,
      missingExpectedSizes:missingSizes,
      restockedSkus,
      newlyOutOfStockSkus,
      replenishmentGate:repGate,
      interpretation:repGate.status==='eligible_for_review'
        ? 'Elegível para revisão humana de reposição com histórico de 90 dias e estoque físico verificado.'
        : 'Oscilação pública de disponibilidade e grade observada; não equivale a demanda real nem autoriza compra automática sem 90 dias de vendas líquidas e estoque físico.',
    },
    objectiveAlignment:{
      ordersCount:clientOrders.length,
      measuredOrdersCount:measuredOrders.length,
      healthyMarginOrdersCount:healthyMarginOrders.length,
      targetMarginRate:0.4,
      laborRateBRL:60,
    },
  };
}
