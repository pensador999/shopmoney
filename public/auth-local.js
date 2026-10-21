import { createWorkflowUI } from './workflow-ui.js';
import { mountBrazilUI } from './brazil-ui.js';
const fragment = new URLSearchParams(location.hash.slice(1));
let token = fragment.get('access_token');
const hadError = fragment.has('error');
history.replaceState(null,'','/');
const status = document.getElementById('status');
const form = document.getElementById('form');
const submit = document.getElementById('submit');
const logout = document.getElementById('logout');
const password = document.getElementById('password');
const cloud = document.getElementById('cloud');
const retry = document.getElementById('retry');
let config;
let brazilUI,workspaceId;
let activation = !!token;
const uiReady=createWorkflowUI(async(name,body)=>{
  const response=await fetch(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',cache:'no-store'});
  if(!response.ok)throw Error('Consulta remota indisponível. Verifique a sessão e tente atualizar.');
  return response.json();
});
async function request(path, options = {}) {
  const response = await fetch(config.url + '/auth/v1/' + path, { ...options, headers: {apikey:config.key, 'Content-Type':'application/json', ...(token ? {Authorization:'Bearer '+token} : {})}, redirect:'error' });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw Error('Falha de autenticação. Verifique a senha ou solicite um novo convite.');
  return data;
}
async function verify() {
  const user = await request('user');
  if (user.email !== 'catanaops@gmail.com' || !user.email_confirmed_at) throw Error('Esta conta não corresponde ao administrador confirmado.');
  return user;
}
async function loadDashboard() {
  const response = await fetch(config.url+'/rest/v1/rpc/catanaops_dashboard',{
    method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',redirect:'error',cache:'no-store'
  });
  if (!response.ok) throw Error('Não foi possível acessar o workspace. Verifique a sessão e o vínculo de operador.');
  const data = await response.json();
  if (!Array.isArray(data.workspaces) || !data.workspaces.length || !data.counts) throw Error('Resposta do workspace inválida.');
  workspaceId=data.workspaces[0].id;
  if(!brazilUI)brazilUI=await mountBrazilUI({getToken:()=>token,getWorkspace:()=>workspaceId,onChange:loadDashboard});
  document.getElementById('workspace').textContent=data.workspaces.map(w=>`${w.name} — ${w.role}`).join(', ');
  document.getElementById('counts').textContent=`Clientes: ${data.counts.clients}; pedidos: ${data.counts.orders}; tarefas: ${data.counts.tasks}; arquivos registrados: ${data.counts.artifacts}.`;
  const metrics=document.getElementById('metrics');metrics.replaceChildren();
  for(const [key,label] of [['clients','Clientes'],['orders','Pedidos'],['tasks','Tarefas'],['artifacts','Arquivos']]) {
    const card=document.createElement('div');card.className='metric';
    const value=document.createElement('strong');value.textContent=String(data.counts[key]);
    const name=document.createElement('span');name.textContent=label;card.append(value,name);metrics.append(card);
  }
  for (const [id, rows, format] of [
    ['orders',data.orders,o=>`${o.id} — ${o.status} — ${o.mode}`],
    ['tasks',data.tasks,t=>`${t.role} — ${t.status} — tentativas: ${t.attempts}`]
  ]) {
    const list=document.getElementById(id); list.replaceChildren();
    for (const row of rows) {const li=document.createElement('li');li.textContent=format(row);if(id==='orders'){const b=document.createElement('button');b.type='button';b.textContent='Abrir ensaio brasileiro';b.onclick=()=>brazilUI.resume(row.id);li.append(b);}list.append(li);}
    if (!rows.length) {const li=document.createElement('li');li.textContent='Nenhum registro remoto nesta etapa.';list.append(li);}
  }
  cloud.hidden=false;
  (await uiReady).connected(data);
}
async function init() {
  config = await (await fetch('/config.json')).json();
  if (hadError) throw Error('Link inválido ou expirado. Solicite um novo convite.');
  if (token) {
    await verify(); status.textContent='Email confirmado. Defina uma senha própria para concluir sua conta.'; submit.textContent='Definir senha';
  } else {status.textContent='Entre com o email e a senha da sua conta Supabase.'; password.autocomplete='current-password';}
  submit.disabled=false;
}
form.addEventListener('submit',async event=>{
  event.preventDefault(); submit.disabled=true;status.classList.remove('error');
  try {
    if (activation) {await request('user',{method:'PUT',body:JSON.stringify({password:password.value})});}
    else {
      const result = await request('token?grant_type=password',{method:'POST',body:JSON.stringify({email:document.getElementById('email').value,password:password.value})});
      token=result.access_token;
    }
    await verify(); password.value=''; activation=false; form.hidden=true; logout.hidden=false;
    status.textContent='Conta autenticada. Consultando workspace…';
    await loadDashboard();
    status.textContent='Login e consulta remota concluídos.';
  } catch(error) {status.textContent=error.message;status.classList.add('error');password.value='';submit.disabled=false;retry.hidden=form.hidden===false;}
});
retry.addEventListener('click',async()=>{
  retry.disabled=true;
  try {await loadDashboard();retry.hidden=true;status.classList.remove('error');status.textContent='Login e consulta remota concluídos.';} catch(error) {status.textContent=error.message;} finally {retry.disabled=false;}
});
document.getElementById('refresh').addEventListener('click',async()=>{
  try {await loadDashboard();status.textContent='Dados remotos atualizados.';} catch(error) {cloud.hidden=true;status.textContent=error.message;}
});
logout.addEventListener('click',async()=>{
  try {await request('logout',{method:'POST'});} catch {status.textContent='Não foi possível revogar a sessão no servidor. Feche a página e revise as sessões no Supabase.';return;}
  token=null;(await uiReady).disconnect();location.replace('/');
});
init().catch(error=>{token=null;status.textContent=error.message;});
