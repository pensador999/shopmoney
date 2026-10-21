const labels={queued:'Aguardando',running:'Executando',done:'Concluída',needs_attention:'Bloqueada',cancelled:'Cancelada',action_required:'Ação necessária',blocked:'Dependência pendente',unverified:'Não verificado'};
const stateLabel=value=>labels[value]??value;
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function svg(tag,attrs={}){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;}
export async function createWorkflowUI(rpc){
  const definition=await (await fetch('/workflow-definition.json')).json();
  const main=document.querySelector('main'),aside=document.querySelector('aside');
  const nav=el('nav');nav.setAttribute('aria-label','Áreas do workspace');
  const old=aside.querySelector('.nav-item');old.replaceWith(nav);
  const panels={overview:[main.querySelector('header'),main.querySelector('.grid'),document.getElementById('cloud')]};
  const workflow=el('section');workflow.id='workflow-view';workflow.hidden=true;
  const report=el('section');report.id='readiness-view';report.hidden=true;
  main.insertBefore(workflow,main.querySelector('footer'));main.insertBefore(report,main.querySelector('footer'));
  panels.workflow=[workflow];panels.readiness=[report];
  let authenticated=false,current='overview',data=null,generation=0,orderId='',orders=[];
  const buttons={};
  for(const [id,label] of [['overview','Visão geral'],['workflow','Fluxo de trabalho'],['readiness','Prontidão do copiloto']]){
    const b=el('button',label);b.type='button';b.disabled=id!=='overview';b.setAttribute('aria-controls',id==='overview'?'cloud':id==='workflow'?'workflow-view':'readiness-view');
    b.addEventListener('click',()=>show(id));buttons[id]=b;nav.append(b);
  }
  const title=el('h1','Fluxo de trabalho');workflow.append(el('p','TIME E RESPONSABILIDADES','eyebrow'),title,
    el('p','Mapa do processo previsto. Produção e QA são código; as respostas IA são consultivas.'),
    el('p','Origem do acompanhamento: Supabase. A fila Eve/SQLite local ainda não está conectada.','boundary-note'));
  const controls=el('div',undefined,'workflow-controls');const modeLabel=el('label','Visualização');
  const selector=el('select');selector.setAttribute('aria-label','Pedido acompanhado');modeLabel.append(selector);
  const refresh=el('button','Atualizar acompanhamento');refresh.type='button';
  controls.append(modeLabel,refresh);workflow.append(controls);
  const connection=el('p','Aguardando consulta autenticada.','hint');connection.setAttribute('role','status');workflow.append(connection);
  const legend=el('p','✓ Implementado e testado localmente · ◐ Aguardando integração · ○ Planejado. Estados das tarefas usam texto e não indicam que o agente está online.','hint');workflow.append(legend);
  const canvas=el('div',undefined,'workflow-canvas');const graphic=svg('svg',{viewBox:'0 0 1160 720',role:'group','aria-label':'Oito papéis conectados; coordenação supervisiona o processo. A lista abaixo contém as mesmas relações.'});
  const defs=svg('defs');const marker=svg('marker',{id:'flow-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#75998e'}));defs.append(marker);graphic.append(defs);
  const positions={research:[20,50],sales:[395,50],support:[770,50],planner:[770,265],finance:[395,265],production:[20,265],quality:[20,480],coordinator:[770,480]};
  const nodes={};
  function paintCount(node,summary){node.replaceChildren();if(!summary.length){node.textContent='Nenhuma tarefa remota';return;}for(const [index,chunk]of [summary.slice(0,3),summary.slice(3)].entries()){if(!chunk.length)continue;const line=svg('tspan',{x:18,y:index?123:103});line.textContent=chunk.map(s=>`${stateLabel(s.status)} ${s.total}`).join(' · ');node.append(line);}}
  for(const [i,e] of definition.edges.entries()){
    const [x,y]=positions[e.from],[tx,ty]=positions[e.to];let d;
    if(e.from==='quality'&&e.to==='support')d='M180 620 V680 H1130 V20 H930 V50';
    else if(y===ty)d=x<tx?`M${x+320} ${y+68} H${tx}`:`M${x} ${y+68} H${tx+320}`;
    else if(x===tx)d=y<ty?`M${x+160} ${y+136} V${ty}`:`M${x+145} ${y} V${ty+136}`;
    else d=`M${x+160} ${y+136} V${y+170} H${tx+160} V${ty}`;
    const path=svg('path',{d,fill:'none',stroke:e.exception?'#ba8864':'#75998e','stroke-width':2,'marker-end':'url(#flow-arrow)',...(e.exception?{'stroke-dasharray':'7 5'}:{})});const t=svg('title');t.textContent=e.label;path.append(t);graphic.append(path);
  }
  for(const role of definition.roles){
    const [x,y]=positions[role.id];const group=svg('g',{transform:`translate(${x},${y})`,tabindex:0,role:'button','aria-label':`Detalhes de ${role.owner}`});
    group.append(svg('rect',{width:320,height:136,rx:13,class:'role-box'}));
    const name=svg('text',{x:18,y:30,class:'role-title'});name.textContent=role.owner;
    const executor=svg('text',{x:18,y:53,class:'role-caption'});executor.textContent=role.executor;
    const state=svg('text',{x:18,y:78,class:'role-caption'});state.textContent=role.state.includes('testado')?'✓ Testado localmente':'◐ Aguardando integração';
    const count=svg('text',{x:18,y:105,class:'role-counter'});count.textContent='Sem consulta remota';nodes[role.id]=count;
    group.append(name,executor,state,count);group.addEventListener('click',()=>details(role));group.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();details(role);}});graphic.append(group);
  }
  canvas.append(graphic);workflow.append(canvas);
  const detail=el('article');detail.setAttribute('aria-live','polite');workflow.append(detail);
  function details(role){detail.replaceChildren(el('h2',role.owner));for(const [label,value] of [['Entrada',role.input],['Entrega esperada',role.output],['Evidência',role.evidence],['Executor',role.executor],['Procedimento',`${role.procedure} · versão ${role.procedureVersion.slice(0,12)}`],['Ferramentas',role.tools],['Intervenção humana',role.human],['Limitação',role.limitation],['Próxima função',role.next.map(id=>definition.roles.find(r=>r.id===id).owner).join(', ')]]){const p=el('p');p.append(el('strong',label+': '),document.createTextNode(value));detail.append(p);}if(data){const counts=data.summary.filter(s=>s.role===role.id).map(s=>`${stateLabel(s.status)}: ${s.total}`);detail.append(el('p',counts.join(' · ')||'Sem tarefas remotas registradas para esta função.'));}}
  details(definition.roles.find(r=>r.id==='coordinator'));
  const list=el('article');list.append(el('h2','Sequência e conexões'));const sequence=el('ol');
  for(const stage of definition.stages){const li=el('li',`${stage.label} — ${definition.roles.find(r=>r.id===stage.role).owner}. Dependência: ${stage.requires.map(id=>definition.stages.find(s=>s.id===id).label).join(', ')||'início'}.`);sequence.append(li);}list.append(sequence);
  const relations=el('ul');for(const edge of definition.edges)relations.append(el('li',`${definition.roles.find(r=>r.id===edge.from).owner} → ${definition.roles.find(r=>r.id===edge.to).owner}: ${edge.label}${edge.exception?' (retorno / exceção)':''}`));
  list.append(relations,el('p','Coordenação supervisiona todas as etapas. Exceções de qualquer função exigem operador quando não há regra aplicável.','hint'));workflow.append(list);
  const stagePanel=el('article');stagePanel.append(el('h2','Etapas do pedido'));const stageRows=el('ol');stagePanel.append(stageRows);workflow.append(stagePanel);
  const taskPanel=el('article');taskPanel.append(el('h2','Tarefas persistidas e evidências'));const taskRows=el('ul',undefined,'records');const taskNote=el('p',undefined,'hint');taskPanel.append(taskNote,taskRows);workflow.append(taskPanel);
  const rehearsal=el('article');rehearsal.append(el('h2','Último ensaio com referência pública'),el('p','Registro separado da fila Supabase: pesquisa real, execução técnica com catálogo sintético.','boundary-note'));
  workflow.append(rehearsal);
  fetch('/public-case-summary.json',{cache:'no-store'}).then(async response=>{
    if(!response.ok){rehearsal.append(el('p','Nenhum ensaio publicado neste ambiente.'));return;}
    const test=await response.json();rehearsal.append(el('h3',test.title),el('p',`${test.mode} · ${new Date(test.generatedAt).toLocaleString('pt-BR')} · ${test.checks.length} verificações técnicas.`),el('p',test.boundaries));
    const checks=el('ul');for(const item of test.checks)checks.append(el('li',item));rehearsal.append(checks);
    for(const result of test.agents){const d=el('details');const role=definition.roles.find(r=>r.id===result.role);d.append(el('summary',`${role?.owner??result.role} — ${result.action}`),el('p',result.summary_pt));rehearsal.append(d);}
    if(test.supplement){const d=el('details');d.append(el('summary','Reteste de atendimento após melhoria do contexto'),el('p',test.supplement.summary_pt??'Reteste indisponível.'));rehearsal.append(d);}
  }).catch(()=>rehearsal.append(el('p','Não foi possível carregar o registro do ensaio.')));
  selector.addEventListener('change',()=>{orderId=selector.value;load();});refresh.addEventListener('click',()=>load());
  function renderOrders(){const selected=orderId;selector.replaceChildren();const general=el('option','Processo geral — todos os pedidos');general.value='';selector.append(general);for(const o of orders){const opt=el('option',`${o.id.slice(0,8)} · ${o.status} · ${o.mode}`);opt.value=o.id;selector.append(opt);}if(!orders.length){const empty=el('option','Nenhum pedido remoto disponível');empty.disabled=true;selector.append(empty);}selector.value=selected;}
  function renderStages(){stageRows.replaceChildren();if(!data?.order){stageRows.append(el('li','Selecione um pedido remoto para acompanhar suas etapas.'));return;}
    for(const stage of definition.stages){const o=data.order,rule=definition.projections[stage.id];let state='unverified';
      if(['research','sales'].includes(stage.id))state='unverified';
      else if(['cancelled','refunded','refund_pending'].includes(o.status))state='cancelled';
      else if(rule){if(rule.flag&&o[rule.flag])state='done';else if(rule.done?.includes(o.status))state='done';else if(rule.running?.includes(o.status))state='running';else if(rule.queued?.includes(o.status))state='queued';else if(rule.active?.includes(o.status))state='action_required';else state=['plan','payment','production','delivery','close'].includes(stage.id)?'blocked':'unverified';}
      const task=['cancelled','refunded','refund_pending'].includes(o.status)?null:data.tasks.find(t=>t.revision===o.revision&&t.kind===stage.id&&t.kind!=='advisory');
      const evidence=task?`Tarefa ${task.id.slice(0,8)} · revisão ${task.revision}`:'Projeção do estado do pedido; evidência específica não disponível.';
      stageRows.append(el('li',`${stage.label}: ${stateLabel(task?.status??state)}. ${evidence}`));
    }
  }
  async function load(){if(!authenticated)return;const request=++generation;refresh.disabled=true;connection.textContent='Consultando Supabase…';
    try{const result=await rpc('catanaops_workflow',{p_order:orderId||null});if(request!==generation)return;data=result;
      connection.textContent=`Origem: ${result.source} · consulta ${new Date(result.queriedAt).toLocaleString('pt-BR')}. ${result.scope}`;
      for(const role of definition.roles)paintCount(nodes[role.id],result.summary.filter(s=>s.role===role.id));
      renderStages();taskRows.replaceChildren();taskNote.textContent=`${result.taskCount} tarefas registradas; ${result.tasks.length} exibidas. Revisões anteriores são histórico. Respostas consultivas não concluem etapas.`;
      for(const t of result.tasks)taskRows.append(el('li',`${t.role} · ${stateLabel(t.status)} · ${t.kind} · revisão ${t.revision} · ${t.attempts}/${t.max_attempts} tentativas · ${new Date(t.created_at).toLocaleString('pt-BR')}${t.completed_at?' · concluída '+new Date(t.completed_at).toLocaleString('pt-BR'):''}`));
      if(!result.tasks.length)taskRows.append(el('li','Nenhuma tarefa remota disponível. Isso não significa que os agentes foram executados.'));
      for(const e of result.events??[])taskRows.append(el('li',`Evidência: ${e.event} · ${e.rule} · ${new Date(e.created_at).toLocaleString('pt-BR')}`));
    }catch(error){if(request!==generation)return;data=null;for(const n of Object.values(nodes))n.textContent='Sem dados atuais';stageRows.replaceChildren();taskRows.replaceChildren();taskNote.textContent='Consulta indisponível; não interpretar como fila vazia.';connection.textContent=error.message;}finally{if(request===generation)refresh.disabled=false;}
  }
  report.append(el('p',`RELATÓRIO VERSIONADO · ${definition.version}`,'eyebrow'),el('h1','Prontidão do copiloto'),el('p','Revisão de implementação e evidências registradas. Não é um monitor automático de disponibilidade.'),el('p','Agora: copiloto interno supervisionado. Sem cobrança, contatos comerciais ou contratação.','boundary-note'));
  for(const milestone of definition.milestones){const section=el('article');section.append(el('h2',milestone.label),el('p',milestone.criterion));
    for(const item of definition.readiness.filter(i=>i.milestone===milestone.id)){
      const d=el('details');const status=item.status==='verified'?'✓ Evidência registrada':item.status==='partial'?'◐ Parcial':'○ Pendente';d.append(el('summary',`${status} — ${item.area}`));
      for(const [label,value] of [['Evidência',item.evidence],['Impacto',item.impact],['Responsável',item.owner],['Dependência',item.dependency],['Próxima ação',item.next],['Aceite',item.acceptance]]){const p=el('p');p.append(el('strong',label+': '),document.createTextNode(value));d.append(p);}section.append(d);
    }report.append(section);
  }
  const matrix=el('article');matrix.append(el('h2','Contratos do time'));for(const r of definition.roles){const d=el('details');d.append(el('summary',r.owner),el('p',`Entrada: ${r.input}`),el('p',`Entrega: ${r.output}`),el('p',`Evidência: ${r.evidence}`),el('p',`Próxima função: ${r.next.join(', ')}`),el('p',`Exceções/limites: ${r.limitation}`));matrix.append(d);}report.append(matrix);
  const priorities=el('article');priorities.append(el('h2','Próximas prioridades'));const priorityList=el('ol');for(const s of ['Consolidar regras e documentação.','Corrigir encaminhamento e próxima ação.','Implementar contratos especializados e passagens validadas.','Conectar escrita remota e arquivos privados.','Integrar executor ao acompanhamento do pedido.','Executar ciclo sintético completo com falhas e retomada.'])priorityList.append(el('li',s));priorities.append(priorityList,el('p','Hospedagem 24/7, Stripe e prospecção não bloqueiam o uso local supervisionado.'));report.append(priorities);
  function show(id){if(id!=='overview'&&!authenticated)return;current=id;for(const [key,nodes]of Object.entries(panels))for(const n of nodes)n.hidden=key!==id||(key==='overview'&&n.id==='cloud'&&!authenticated);for(const [key,b]of Object.entries(buttons)){b.classList.toggle('active',key===id);b.setAttribute('aria-current',key===id?'page':'false');}if(id==='workflow')load();}
  show('overview');
  return {connected(snapshot){authenticated=true;orders=snapshot.orders;for(const b of Object.values(buttons))b.disabled=false;renderOrders();if(current==='workflow')load();},disconnect(){authenticated=false;generation++;data=null;for(const [key,b]of Object.entries(buttons))b.disabled=key!=='overview';show('overview');}};
}
