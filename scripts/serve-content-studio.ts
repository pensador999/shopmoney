import {Store} from '../src/store.ts';
import {createApp} from '../src/server.ts';
// Dedicated local validation: no env loading, runtime tick, mail, AI worker or payments.
const port=4324,store=new Store('./data/content-studio-validation.sqlite'),server=createApp(store,port);
server.listen(port,'127.0.0.1',()=>console.log('Conteúdo e prévia — validação local: http://127.0.0.1:'+port));
const stop=()=>server.close(()=>{store.close();process.exit(0);});
process.on('SIGINT',stop);process.on('SIGTERM',stop);
