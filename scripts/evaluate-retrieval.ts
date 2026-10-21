import {mkdirSync,writeFileSync} from 'node:fs';
import {Store} from '../src/store.ts';
import {Examples} from '../src/content-studio/examples.ts';
const store=new Store(':memory:'),examples=new Examples(store),scope={workspaceId:'evaluation',clientId:'synthetic',storeId:'fixture'};
try{
 const topics=['gola manga algodão','cintura bolso sarja','capuz punho moletom'];
 const ids=topics.map((text,i)=>examples.save(scope,{id:'approved-fixture-'+i,revision:1,category:'vestuario',productId:'training-'+i,blocks:[{text}]},{problem:text,reason:'Exemplo sintético revisado para teste de recuperação: '+text,operator:'Avaliação automatizada sintética'}));
 const cases=topics.map((query,i)=>({productId:'held-out-'+i,query,expected:ids[i],baseline:ids[0],retrieved:examples.retrieve(scope,'vestuario',query,'held-out-'+i)[0]?.id??null}));
 const result={at:new Date().toISOString(),mode:'synthetic-retrieval-only',cases,baselineAccuracy:cases.filter(c=>c.baseline===c.expected).length/cases.length,retrievalAccuracy:cases.filter(c=>c.retrieved===c.expected).length/cases.length,crossStoreResults:examples.retrieve({...scope,storeId:'other'},'vestuario',topics[0],'held-out').length,modelCalls:0,limits:['Avalia seleção lexical em três exemplos sintéticos, não qualidade das descrições.','Produtos de consulta têm IDs separados; corpus pequeno e vocabulário controlado.','Ganho semântico editorial real permanece adiado até API.']};
 mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/retrieval-evaluation-2026-10-21.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{store.close();}
