import { Store } from '../src/store.ts';
import { createApp } from '../src/server.ts';
// No runtime tick, env loading, IMAP, AI worker, external sends or payments.
const store=new Store('./data/brazil-validation.sqlite');
const server=createApp(store,4323);
server.listen(4323,'127.0.0.1',()=>console.log('Copiloto Brasil sintético: http://127.0.0.1:4323 — sem rotina externa'));
const stop=()=>server.close(()=>{store.close();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
