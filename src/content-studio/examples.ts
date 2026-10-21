import {z} from 'zod';
import {Store} from '../store.ts';
import {digest} from './render.ts';
import type {StudioScope} from './contracts.ts';

const tokens=(s:string)=>new Set(s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]{3,}/g)??[]);
export class Examples {
  store:Store;
  constructor(store:Store){this.store=store;store.db.exec('CREATE TABLE IF NOT EXISTS studio_examples(id TEXT PRIMARY KEY, scope TEXT NOT NULL, data TEXT NOT NULL);');}
  save(scope:StudioScope,source:{id:string;revision:number;category:string;productId:string;blocks:unknown},input:unknown){
    const correction=z.object({problem:z.string().min(5).max(1000),reason:z.string().min(10).max(1500),operator:z.string().min(1).max(100)}).strict().parse(input);
    const id=digest({scope,source,correction});
    const value={...source,sourceId:source.id,id,...correction,active:true,version:1,createdAt:new Date().toISOString()};
    this.store.db.prepare('INSERT OR IGNORE INTO studio_examples VALUES(?,?,?)').run(id,JSON.stringify(scope),JSON.stringify(value));
    this.store.audit(null,'QA-01','example_approved',{id,scope,operator:correction.operator,source:source.id,revision:source.revision});return id;
  }
  list(scope:StudioScope){return(this.store.db.prepare('SELECT data FROM studio_examples WHERE scope=?').all(JSON.stringify(scope))as {data:string}[]).map(r=>JSON.parse(r.data));}
  revoke(scope:StudioScope,id:string,operator:string){
    z.string().min(1).parse(operator);const value=this.list(scope).find(v=>v.id===id);if(!value)throw Error('Exemplo inexistente neste escopo.');
    value.active=false;value.version++;this.store.db.prepare('UPDATE studio_examples SET data=? WHERE id=? AND scope=?').run(JSON.stringify(value),id,JSON.stringify(scope));
    this.store.audit(null,'QA-01','example_revoked',{id,scope,operator});
  }
  retrieve(scope:StudioScope,category:string,query:string,excludeProduct:string){
    const q=tokens(query);
    const candidates=this.list(scope).filter(v=>v.active&&v.category===category&&v.productId!==excludeProduct);
    const docSets=candidates.map(v=>({v,t:tokens(v.problem+' '+v.reason+' '+JSON.stringify(v.blocks))}));
    const N=Math.max(1,docSets.length);
    const idf=(term:string)=>{
      const df=docSets.filter(d=>d.t.has(term)).length;
      return Math.log(1+(N-df+0.5)/(df+0.5))+1;
    };
    return docSets.map(({v,t})=>{
      const matched=[...q].filter(w=>t.has(w));
      if(!matched.length)return {...v,score:0};
      const weightedOverlap=matched.reduce((sum,w)=>sum+idf(w),0);
      const unionWeight=[...new Set([...q,...t])].reduce((sum,w)=>sum+idf(w),0);
      return {...v,score:Number((weightedOverlap/Math.max(1,unionWeight)).toFixed(4))};
    }).filter(v=>v.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,2).map(v=>({id:v.id,score:v.score,reason:v.reason,blocks:v.blocks}));
  }
}
