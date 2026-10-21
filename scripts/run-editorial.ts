import {Store} from '../src/store.ts';
import {runAgentQueue} from '../src/agents.ts';
// Explicit invocation, bounded serial work; never loads .env or commercial runtime.
const path=process.argv[2];if(!path)throw Error('Informe o banco local de validação editorial.');
const limit=Number(process.argv[3]??1);if(!Number.isInteger(limit)||limit<1||limit>9)throw Error('Limite deve ser de 1 a 9 tarefas.');
const store=new Store(path);
try{
  for(let n=0;n<limit;n++){
    const row=store.db.prepare("SELECT id,input FROM ai_jobs WHERE status IN ('queued','paused') AND (next_at IS NULL OR next_at<=?) ORDER BY rowid LIMIT 1").get(new Date().toISOString())as any;
    if(!row)break;
    if(!row.id.startsWith('studio-advice-')||!JSON.parse(row.input).structured)throw Error('Fila contém tarefa fora do ensaio editorial. Use banco separado.');
    await runAgentQueue(store);
    const state=store.db.prepare('SELECT id,status,error FROM ai_jobs WHERE id=?').get(row.id)as any;console.log(JSON.stringify(state));
    if(state.status==='paused'||state.status==='needs_attention'||state.status==='queued')break;
  }
}finally{store.close();}
