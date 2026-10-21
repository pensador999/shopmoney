export async function mountStudio({api,notice}){
  const el=(tag,text,attrs={})=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);return node;};
  const root=el('section',undefined,{id:'studio',class:'tab'});root.hidden=true;document.querySelector('main').append(root);
  const nav=el('button','Conteúdo e prévia',{'data-tab':'studio'});document.querySelector('nav').append(nav);
  nav.onclick=()=>{document.querySelectorAll('.tab').forEach(n=>n.hidden=n!==root);document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n===nav));};
  const link=el('link',undefined,{rel:'stylesheet',href:'/content-studio.css'});document.head.append(link);
  let request,record=null,dirty=true,creationId=crypto.randomUUID(),busy=false;
  const status=el('p','Carregando…',{'aria-live':'polite'}),list=el('select',undefined,{'aria-label':'Conteúdo salvo'});
  const intro=el('article');intro.append(el('p','CONTEÚDO DE PRODUTO',{class:'eyebrow'}),el('h2','Uma peça, a linguagem da sua loja.'),
    el('p','Validação local supervisionada. Fatos e imagens autorizados → prévia → conferência → aprovação → exportação. Sem publicação, cobrança ou envio.'),status);
  const actions=el('div',undefined,{class:'actions'});
  const action=(label,fn,parent=actions)=>{const b=el('button',label,{type:'button'});b.onclick=()=>run(fn);parent.append(b);return b;};
  action('Novo exemplo · Linha Clara',()=>loadFixture('clara'));action('Novo exemplo · Ateliê Horizonte',()=>loadFixture('horizonte'));
  let savedRecords=[];const filterStore=el('input',undefined,{'aria-label':'Filtrar loja',placeholder:'Filtrar loja'}),filterCategory=el('input',undefined,{'aria-label':'Filtrar categoria',placeholder:'Filtrar categoria'}),filterState=el('select',undefined,{'aria-label':'Filtrar estado'}),filteredCount=el('p');for(const v of ['','draft','approved','exported','cancelled'])filterState.append(el('option',v||'Todos os estados',{value:v}));for(const f of [filterStore,filterCategory,filterState])f.oninput=renderSaved;actions.append(filterStore,filterCategory,filterState,filteredCount);
  actions.append(list);action('Abrir salvo',async()=>{if(!list.value)throw Error('Selecione um conteúdo.');const value=JSON.parse(list.value);await loadRecord(await api('studio/read',value));});
  intro.append(actions);root.append(intro);
  const handoffBox=el('article');handoffBox.append(el('h2','Pendências e próximo passo'));const handoffText=el('div');handoffBox.append(handoffText);root.append(handoffBox);
  const editor=el('article');editor.append(el('h2','1. Produto e identidade'));
  const form=el('form'),fields={};
  const field=(label,value='',type='text',parent=form)=>{
    const wrapper=el('label',label),input=el(type==='textarea'?'textarea':'input');
    if(type!=='textarea')input.type=type;input.value=value;if(type==='textarea')input.rows=3;
    wrapper.append(input);parent.append(wrapper);return input;
  };
  const row=el('div',undefined,{class:'fields'});form.append(row);
  for(const [key,label]of [['client','Cliente / marca'],['email','Email de referência'],['store','Identificador da loja'],['workspace','Workspace local'],['product','ID do produto'],['title','Título']])
    fields[key]=field(label,'',key==='email'?'email':'text',row);
  const existing=field('Produto já existe?','', 'checkbox');existing.removeAttribute('value');
  const modeLabel=el('label','Tratamento do texto'),mode=el('select');for(const [v,t]of [['preserve','Preservar texto aprovado'],['reorganize','Reorganizar trechos originais'],['rewrite','Preparar texto com fatos aprovados']])mode.append(el('option',t,{value:v}));modeLabel.append(mode);form.append(modeLabel);
  const original=field('Texto original · exibido sem executar HTML','','textarea');
  const category=field('Categoria observada do produto');
  const copyBox=el('details');copyBox.append(el('summary','Blocos propostos — revisar antes de aprovar'));form.append(copyBox);
  const copyRows=[];
  function fillBlocks(blocks){copyBox.querySelectorAll('fieldset').forEach(e=>e.remove());copyRows.length=0;for(const block of blocks){const box=el('fieldset');box.append(el('legend',block.section+' · '+block.id));const content=field('Texto proposto',block.text,'textarea',box);const checked=field('Texto conferido com as fontes','','checkbox',box);checked.checked=block.approved;box.append(el('p','Fatos: '+block.factIds.join(', ')));copyRows.push({block,content,checked});copyBox.append(box);}}
  const brandDetails=el('details');brandDetails.append(el('summary','Perfil versionado e apresentação da loja'));form.append(brandDetails);
  const bf={};for(const [key,label]of [['name','Nome da marca'],['version','Versão do perfil — alterar ao mudar a identidade'],['audience','Público'],['proposition','Proposta aprovada'],['tone','Tom'],['introduction','Introdução aprovada da marca']])
    bf[key]=field(label,'',key==='introduction'?'textarea':'text',brandDetails);
  bf.accent=field('Cor de destaque','#245f58','color',brandDetails);bf.background=field('Fundo','#f4faf7','color',brandDetails);bf.text=field('Cor do texto','#263838','color',brandDetails);
  const fontLabel=el('label','Tipografia'),font=el('select');font.append(el('option','Sistema',{value:'system'}),el('option','Editorial serifada',{value:'serif'}));fontLabel.append(font);brandDetails.append(fontLabel);
  const mediaHosts=field('Hosts HTTPS autorizados para imagens (separados por vírgula)','','text',brandDetails);
  const brandApproved=field('Perfil de marca aprovado','', 'checkbox',brandDetails),rights=field('Direitos de uso dos materiais confirmados','', 'checkbox',brandDetails);
  const facts=el('div'),variants=el('div'),media=el('div');form.append(el('h3','2. Fatos e fontes'),facts);
  const collections={facts,variants,media},rows={facts:[],variants:[],media:[]};
  const bool=(label,value,parent)=>{const node=field(label,'','checkbox',parent);node.checked=value;return node;};
  function addRow(kind,item){
    const box=el('fieldset'),row={};
    const keys=kind==='facts'?[['id','ID do fato'],['text','Texto factual'],['source','Fonte']]:
      kind==='variants'?[['id','ID da variante'],['productId','Produto pai'],['sku','SKU exato'],['color','Cor'],['size','Tamanho']]:
      [['id','ID da imagem'],['productId','Produto pai'],['url','URL HTTPS ou ilustração sintética'],['source','Origem / autorização'],['color','Cor'],['alt','Texto alternativo'],['variantIds','IDs das variantes, separados por vírgula']];
    for(const [key,label]of keys)row[key]=field(label,Array.isArray(item[key])?item[key].join(', '):item[key]??'',key==='text'?'textarea':'text',box);
    if(kind==='facts'){
      const l=el('label','Bloco editorial'),select=el('select');for(const [value,text]of [['presentation','Apresentação'],['context','Contexto de uso'],['fit','Caimento'],['features','Características'],['composition','Composição'],['care','Cuidados'],['size','Medidas']])select.append(el('option',text,{value}));select.value=item.section??'features';l.append(select);box.append(l);row.section=select;
      row.approved=bool('Fato e fonte revisados',item.approved,box);
    }
    if(kind==='media'){
      const l=el('label','Papel da imagem'),select=el('select');for(const [value,text]of [['hero','Principal'],['detail','Detalhe'],['context','Contexto']])select.append(el('option',text,{value}));select.value=item.role??'hero';l.append(select);box.append(l);row.role=select;
      row.approved=bool('Conferi visualmente a peça e a cor',item.approved,box);row.authorized=bool('Uso autorizado',item.authorized,box);
    }
    const remove=el('button','Remover',{type:'button'});remove.onclick=()=>{rows[kind]=rows[kind].filter(x=>x!==row);box.remove();markDirty();};box.append(remove);
    rows[kind].push(row);collections[kind].append(box);
  }
  action('Adicionar fato',()=>{addRow('facts',{id:'fato-'+(rows.facts.length+1),approved:false});markDirty();},form);
  const variantDetails=el('details');variantDetails.append(el('summary','3. Variantes e SKUs'),variants);form.append(variantDetails);
  action('Adicionar variante',()=>{addRow('variants',{productId:fields.product.value});markDirty();},variantDetails);
  const mediaDetails=el('details');mediaDetails.append(el('summary','4. Associação de imagens'),el('p','Fotos compartilhadas por tamanhos da mesma cor são permitidas. Confirmar peça, cor e direitos. A IA não analisou estas imagens.'),media);form.append(mediaDetails);
  action('Adicionar imagem',()=>{addRow('media',{productId:fields.product.value,approved:false,authorized:false,variantIds:[]});markDirty();},mediaDetails);
  const kitBox=el('details');kitBox.append(el('summary','5. Componentes do kit e guias de medidas'));form.append(kitBox);
  const componentRows=[],guideRows=[];
  const split=v=>v.split(';').map(x=>x.trim()).filter(Boolean);
  function componentRow(c={}){const box=el('fieldset'),r={};for(const [k,l]of [['id','ID do componente'],['title','Nome do componente'],['factIds','IDs dos fatos (separados por ;)'],['mediaIds','IDs das imagens (separados por ;)']])r[k]=field(l,Array.isArray(c[k])?c[k].join(';'):c[k]??'','text',box);componentRows.push(r);action('Remover componente',()=>{componentRows.splice(componentRows.indexOf(r),1);box.remove();markDirty();},box);kitBox.append(box);}
  function guideRow(g={}){const box=el('fieldset'),r={};for(const [k,l]of [['id','ID do guia'],['title','Título do guia'],['componentId','ID do componente (vazio para a peça)'],['source','Fonte das medidas'],['unit','Unidade: cm, mm ou in'],['columns','Colunas de medidas (separadas por ;)']])r[k]=field(l,Array.isArray(g[k])?g[k].join(';'):g[k]??'','text',box);
   r.rows=field('Uma linha por tamanho: P;48;68 (valores na ordem das colunas)',(g.rows??[]).map(x=>[x.size,...x.values].join(';')).join('\n'),'textarea',box);r.approved=bool('Medidas conferidas na fonte',!!g.approved,box);guideRows.push(r);action('Remover guia',()=>{guideRows.splice(guideRows.indexOf(r),1);box.remove();markDirty();},box);kitBox.append(box);}
  action('Adicionar componente',()=>{componentRow();markDirty();},kitBox);action('Adicionar guia de medidas',()=>{guideRow({unit:'cm'});markDirty();},kitBox);
  const intake=el('article');intake.append(el('h2','Começar com os materiais da loja'),el('p','A página pública fornece referências; confirme fatos, imagens e perfil antes de aprovar. Uma fonte incompatível pode ser substituída por ficha JSON ou preenchimento manual.'));
  const urlField=field('URL HTTPS do produto Shopify','','url',intake),fileField=field('Ficha Catana em JSON','','file',intake);fileField.accept='.json,application/json';
  action('Nova ficha em branco',async()=>{const v=await api('studio/fixture');v.product={...v.product,id:'novo-produto',title:'Novo produto',source:'Materiais a confirmar',original:{html:'',text:'',approved:false},facts:[],variants:[{id:'variante-1',productId:'novo-produto',sku:'',color:'',size:''}]};v.media=[];v.blocks=[];v.brand={...v.brand,name:'Nova loja',version:crypto.randomUUID(),introduction:'',audience:'A confirmar',proposition:'A confirmar',tone:'A confirmar',approved:false,materialAuthorization:false};record=null;creationId=crypto.randomUUID();fill(v);fields.client.value='';fields.email.value='';markDirty();},intake);
  action('Ler produto público',async()=>{const base=gather();const result=await api('studio/collect',{url:urlField.value,scope:base.scope,brand:base.brand});if(!result.records.length)throw Error(result.rejected.map(r=>r.reason).join('; ')||'Fonte sem produto utilizável; preencha manualmente.');record=null;creationId=crypto.randomUUID();fill(result.records[0]);markDirty();notice('Referências recebidas. Revise fontes, SKUs, imagens e identidade; nada foi aprovado.');},intake);
  action('Carregar ficha JSON',async()=>{const file=fileField.files[0];if(!file||file.size>1000000)throw Error('Selecione JSON de até 1 MB.');const v=JSON.parse(await file.text());v.brand.approved=false;v.brand.materialAuthorization=false;v.brand.version=crypto.randomUUID();v.product.original.approved=false;v.product.facts.forEach(f=>f.approved=false);v.media.forEach(m=>{m.approved=false;m.authorized=false;});(v.blocks??[]).forEach(b=>b.approved=false);(v.adaptive?.guides??[]).forEach(g=>g.approved=false);if(v.adaptive?.catalog)v.adaptive.catalog.approved=false;record=null;creationId=crypto.randomUUID();fill(v);markDirty();notice('Ficha carregada para revisão, sem herdar aprovações.');},intake);
  root.append(intake);
  const operations=el('article');operations.append(el('h2','Pedido e tarefas desta ficha'));const orderId=field('ID de pedido existente (opcional)','','text',operations),operationState=el('div');
  action('Vincular pedido ou criar pedido de validação',async()=>{if(!record||dirty)throw Error('Salve a ficha primeiro.');await api('studio/connect-order',{id:record.id,scope:record.request.scope,...(orderId.value?{orderId:orderId.value}:{})});await showOperations();},operations);operations.append(operationState);root.append(operations);
  async function showOperations(){if(!record)return;const o=await api('studio/operations',{id:record.id,scope:record.request.scope});operationState.replaceChildren(el('p',o.order?'Pedido '+o.order.id+' · '+o.order.status+' · validação local':'Nenhum pedido vinculado'),el('p',o.operatorNext));for(const t of o.operationalTasks)operationState.append(el('p',t.owner+' · '+t.expected+' · '+t.state));for(const t of o.editorialTasks)operationState.append(el('p','Editorial: '+t.role+' · '+t.state+' · revisão '+t.revision));}
  const save=el('button','Salvar rascunho e atualizar prévias',{type:'submit',class:'primary'});form.append(save);
  form.onsubmit=e=>{e.preventDefault();run(saveDraft);};form.addEventListener('input',markDirty);
  const advanced=el('details');advanced.append(el('summary','Opção avançada · documento completo em JSON'));
  const json=field('Edite e aplique ao formulário antes de salvar. Blocos reescritos devem referenciar fatos aprovados.','','textarea',advanced);json.rows=14;
  action('Aplicar JSON ao formulário',()=>{fill(JSON.parse(json.value));markDirty();},advanced);
  editor.append(form,advanced);root.append(editor);
  const previewBoard=el('article');previewBoard.append(el('h2','5. Comparar e conferir'));
  const controls=el('div',undefined,{class:'fields'}),template=el('select',undefined,{'aria-label':'Template para aprovação'}),color=el('select',undefined,{'aria-label':'Cor para prévia'}),device=el('select',undefined,{'aria-label':'Tamanho da prévia'});
  template.append(el('option','Essencial',{value:'essential'}),el('option','Editorial',{value:'editorial'}));device.append(el('option','Desktop · 960 px',{value:'desktop'}),el('option','Celular · 390 px',{value:'mobile'}));
  for(const [label,node]of [['Template para aprovar',template],['Cor exibida',color],['Visualização',device]]){const l=el('label',label);l.append(node);controls.append(l);}
  previewBoard.append(controls);
  const issueList=el('ul',undefined,{'aria-live':'polite'}),frames={};previewBoard.append(issueList);
  for(const [key,label]of [['original','Texto original'],['essential','Proposta · Essencial'],['editorial','Proposta · Editorial']]){
    const block=key==='original'?el('details'):el('section');block.append(el(key==='original'?'summary':'h3',label));
    const scroll=el('div',undefined,{class:'studio-scroll'}),stage=el('div',undefined,{class:'studio-stage','data-device':'desktop'});
    const iframe=el('iframe',undefined,{sandbox:'',title:label,loading:'lazy',class:'studio-frame'});stage.append(iframe);scroll.append(stage);block.append(scroll);previewBoard.append(block);frames[key]={iframe,stage};
  }
  function previews(){
    Object.values(frames).forEach(f=>f.stage.dataset.device=device.value);
    if(!record||dirty){Object.values(frames).forEach(f=>f.iframe.removeAttribute('src'));return;}
    for(const [kind,frame]of Object.entries(frames)){
      const q=new URLSearchParams({workspace:record.request.scope.workspaceId,client:record.request.scope.clientId,store:record.request.scope.storeId,color:color.value,...(kind==='original'?{original:'1'}:{})});
      frame.iframe.src='/content-preview/'+record.id+'/'+(kind==='original'?'essential':kind)+'/'+record.revision+'?'+q;
    }
  }
  device.onchange=previews;color.onchange=()=>{previews();syncButtons();};template.onchange=syncButtons;
  root.append(previewBoard);
  const review=el('article');review.append(el('h2','6. Aprovação da revisão'),el('p','A confirmação abaixo é registrada como declaração do operador. Não equivale a aceite do cliente ou teste no tema Shopify.'));
  const operator=field('Operador responsável','','text',review),note=field('Evidência / observações da revisão','','textarea',review);
  const visual=bool('Conferi a imagem e a associação de cor/tamanho',false,review),text=bool('Conferi os textos e a identidade da loja',false,review),source=bool('Conferi os fatos e as fontes',false,review);
  const approve=action('Aprovar template e cor selecionados',async()=>{
    record=await api('studio/approve',{id:record.id,scope:record.request.scope,revision:record.revision,approval:{template:template.value,color:color.value,operator:operator.value,note:note.value,visualChecked:visual.checked,textChecked:text.checked,factsChecked:source.checked}});
    syncButtons();previews();await refreshList();notice('Revisão aprovada. Exportação disponível para a seleção registrada.');
  },review);
  const download=action('Exportar pacote aprovado',async()=>{
    const response=await fetch('/api/studio/export',{method:'POST',headers:{'content-type':'application/json','x-catalog-token':document.querySelector('meta[name="catalog-token"]').content},
      body:JSON.stringify({id:record.id,scope:record.request.scope,revision:record.revision})});
    if(!response.ok)throw Error((await response.json()).error);
    const url=URL.createObjectURL(await response.blob()),a=el('a',undefined,{href:url,download:'conteudo-'+record.id+'.zip'});a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    record=await api('studio/read',{id:record.id,scope:record.request.scope});syncButtons();notice('Pacote exportado. Nenhum envio ou publicação foi realizado.');
  },review);
  const advice=action('Solicitar análise consultiva do planejamento',async()=>{await api('studio/advice',{id:record.id,scope:record.request.scope,role:'planner'});notice('Tarefa na fila serial. A prévia não foi aprovada pela IA.');},review);
  action('Solicitar rascunho consultivo da produção',async()=>{if(!record||dirty)throw Error('Salve o rascunho antes de consultar.');await api('studio/advice',{id:record.id,scope:record.request.scope,role:'production'});notice('Rascunho solicitado na fila serial. Sem execução de IA neste painel de validação; requer executor disponível.');},review);
  const results=el('div');review.append(results);
  action('Atualizar respostas consultivas',async()=>{
    if(!record)throw Error('Selecione um conteúdo salvo.');
    const jobs=await api('studio/jobs',{id:record.id,scope:record.request.scope});results.replaceChildren();
    if(!jobs.length)results.append(el('p','Nenhuma resposta nesta revisão.'));
    for(const job of jobs){const d=el('details');d.append(el('summary',job.role+' · '+job.status),el('p',job.result?.summary_pt??job.error??'Aguardando executor serial.'));
      if(job.result?.reply_client)d.append(el('p','Sugestão consultiva: '+job.result.reply_client));results.append(d);}
  },review);
  const cancel=action('Cancelar este conteúdo',async()=>{record=await api('studio/cancel',{id:record.id,scope:record.request.scope,revision:record.revision});syncButtons();previews();await refreshList();},review);
  root.append(review);
  const adaptive=el('article');adaptive.append(el('h2','Produção e conferência estruturadas'),el('p','Salve a ficha. Solicite o rascunho, execute uma tarefa da fila e aplique a proposta. Revise os blocos, salve e solicite a conferência independente.'));
  for(const [role,label]of [['planner','Planejar estrutura'],['production','Gerar proposta de descrição'],['quality','Conferir descrição com as fontes']])action(label,async()=>{if(!record||dirty)throw Error('Salve a ficha antes de solicitar.');await api('studio/structured',{id:record.id,scope:record.request.scope,role});notice('Tarefa persistida. Execute o trabalhador editorial local para processar a fila.');},adaptive);
  action('Consultar entregas estruturadas',async()=>{
    if(!record||dirty)throw Error('Selecione uma revisão salva.');const jobs=await api('studio/jobs',{id:record.id,scope:record.request.scope});structuredResults.replaceChildren();
    for(const j of jobs){const d=el('article');d.append(el('h3',j.role+' · '+j.status),el('p',j.error??j.result?.summary_pt??'Aguardando executor'));
      if(j.result?.deliverable){d.append(el('pre',JSON.stringify(j.result.deliverable,null,2)));if(j.result.deliverable.kind==='draft')action('Aplicar como nova revisão sem aprovação',async()=>{await loadRecord(await api('studio/apply-draft',{id:record.id,scope:record.request.scope,revision:record.revision,jobId:j.id}));await refreshList();notice('Proposta aplicada. Revise os blocos e salve antes da QA.');},d);}structuredResults.append(d);}
  },adaptive);
  const structuredResults=el('div');adaptive.append(structuredResults);
  const problem=field('Correção / problema observado','','textarea',adaptive),reason=field('Justificativa e resultado da correção','','textarea',adaptive);
  action('Registrar revisão aprovada como exemplo da loja',async()=>{if(!record||dirty)throw Error('Salve e aprove antes de registrar.');await api('studio/learn',{id:record.id,scope:record.request.scope,correction:{problem:problem.value,reason:reason.value,operator:operator.value}});await loadRecord(record);notice('Exemplo aprovado registrado somente nesta loja.');},adaptive);root.append(adaptive);
  const effort=el('article');effort.append(el('h2','Esforço e custos do ensaio'),el('p','Referência de trabalho: R$60/h. Sem recebimento real, contribuição permanece desconhecida. Custos em branco são desconhecidos.'));
  const effortFields={};for(const [key,label]of [['hours','Horas totais'],['fees','Taxas (R$)'],['costs','Custos variáveis (R$)'],['taxes','Tributos (R$)']]){effortFields[key]=field(label,'','number',effort);effortFields[key].min='0';effortFields[key].step='0.01';}
  const effortNote=field('Origem dos valores / observações','','textarea',effort);
  action('Registrar esforço',async()=>{
    if(!record)throw Error('Salve o conteúdo antes de registrar esforço.');
    if(!effortFields.hours.value)throw Error('Informe as horas medidas.');
    const values=Object.fromEntries(Object.entries(effortFields).map(([k,v])=>[k,v.value===''?null:Number(v.value)]));
    record=await api('studio/effort',{id:record.id,scope:record.request.scope,effort:{...values,note:effortNote.value}});
    notice('Esforço registrado. Referência de trabalho: R$'+(record.effort.hours*60).toFixed(2)+'. Receita e contribuição não foram presumidas.');
  },effort);root.append(effort);
  function markDirty(){dirty=true;visual.checked=false;text.checked=false;source.checked=false;syncButtons();previews();}
  function syncButtons(){
    status.textContent=record?'Conteúdo '+record.id+' · revisão '+record.revision+' · '+record.status+(dirty?' · alterações não salvas':''):'Novo rascunho · dados sintéticos até substituir por materiais autorizados.';
    const inactive=!record||dirty||record.status==='cancelled';
    approve.disabled=inactive||!!record?.issues?.length;advice.disabled=inactive;cancel.disabled=!record||record.status==='cancelled';
    download.disabled=inactive||!record.approval||record.approval.template!==template.value||record.approval.color!==color.value;
  }
  function fill(value){
    request=structuredClone(value);
    for(const [key,v]of Object.entries({client:value.brand.name,email:'studio-fixture@example.invalid',store:value.scope.storeId,workspace:value.scope.workspaceId,product:value.product.id,title:value.product.title}))fields[key].value=v;
    existing.checked=value.product.existing;mode.value=value.mode;original.value=value.product.original.text;
    category.value=value.adaptive?.category??'';fillBlocks(value.blocks);kitBox.querySelectorAll('fieldset').forEach(x=>x.remove());componentRows.length=0;guideRows.length=0;(value.adaptive?.components??[]).forEach(componentRow);(value.adaptive?.guides??[]).forEach(guideRow);
    for(const key of ['name','version','audience','proposition','tone','introduction'])bf[key].value=value.brand[key]??'';
    for(const key of ['accent','background','text'])bf[key].value=value.brand.visual[key];
    mediaHosts.value=value.brand.mediaHosts.join(', ');font.value=value.brand.visual.font;brandApproved.checked=value.brand.approved;rights.checked=value.brand.materialAuthorization;
    for(const kind of ['facts','variants','media']){collections[kind].replaceChildren();rows[kind]=[];for(const item of (kind==='media'?value.media:value.product[kind]))addRow(kind,item);}
    color.replaceChildren();const colors=[...new Set(value.product.variants.map(v=>v.color).filter(Boolean))];
    for(const c of colors.length?colors:[''])color.append(el('option',c||'Sem cor específica',{value:c}));
    json.value=JSON.stringify(value,null,2);visual.checked=false;text.checked=false;source.checked=false;
  }
  function gather(){
    const value=structuredClone(request);
    value.scope.storeId=fields.store.value;value.scope.workspaceId=fields.workspace.value;
    value.product.id=fields.product.value;value.product.title=fields.title.value;value.product.existing=existing.checked;
    value.product.original.text=original.value;value.mode=mode.value;
    value.blocks=copyRows.map(({block,content,checked})=>({...block,text:content.value,approved:checked.checked}));
    if(value.adaptive)value.adaptive.category=category.value;
    else if(category.value)value.adaptive={category:category.value,coverage:{kind:'manual',source:value.product.source,observedAt:new Date().toISOString(),missing:[]},requirements:[],conflicts:[],components:[]};
    if(componentRows.length||guideRows.length||value.adaptive){value.adaptive??={category:category.value,coverage:{kind:'manual',source:value.product.source,observedAt:new Date().toISOString(),missing:[]},requirements:[],conflicts:[],components:[]};value.adaptive.components=componentRows.map(r=>({id:r.id.value,title:r.title.value,factIds:split(r.factIds.value),mediaIds:split(r.mediaIds.value)}));if(guideRows.length||value.adaptive.guides)value.adaptive.guides=guideRows.map(r=>({id:r.id.value,title:r.title.value,componentId:r.componentId.value,source:r.source.value,unit:r.unit.value,approved:r.approved.checked,columns:split(r.columns.value),rows:r.rows.value.split('\n').filter(x=>x.trim()).map(line=>{const [size,...values]=line.split(';');return {size:size.trim(),values:values.map(v=>v.trim()?Number(v.replace(',','.')):NaN)};})}));}
    for(const key of ['name','version','audience','proposition','tone','introduction'])value.brand[key]=bf[key].value;
    for(const key of ['accent','background','text'])value.brand.visual[key]=bf[key].value;
    value.brand.mediaHosts=mediaHosts.value.split(',').map(x=>x.trim()).filter(Boolean);value.brand.visual.font=font.value;value.brand.approved=brandApproved.checked;value.brand.materialAuthorization=rights.checked;
    for(const kind of ['facts','variants','media']){
      const values=rows[kind].map(row=>Object.fromEntries(Object.entries(row).map(([key,input])=>[key,input.type==='checkbox'?input.checked:key==='variantIds'?input.value.split(',').map(s=>s.trim()).filter(Boolean):input.value])));
      if(kind==='media')value.media=values;else value.product[kind]=values;
    }
    return value;
  }
  async function loadFixture(brand){record=null;handoffText.replaceChildren();operationState.replaceChildren();creationId=crypto.randomUUID();fill(await api('studio/fixture?brand='+brand));dirty=true;syncButtons();previews();}
  async function loadRecord(value){
    value=await api('studio/read',{id:value.id,scope:value.request.scope});
    record=value;fill(value.request);dirty=false;
    if(value.client){fields.client.value=value.client.name;fields.email.value=value.client.email;}
    if(value.approval){template.value=value.approval.template;color.value=value.approval.color;}
    syncButtons();previews();await showIssues();await showOperations();
    const handoff=await api('studio/handoff',{id:record.id,scope:record.request.scope});handoffText.replaceChildren(el('p',handoff.owner+' · '+handoff.next));
    for(const q of handoff.questions)handoffText.append(el('p',(q.required?'Pendente: ':'Opcional: ')+q.question));
    for(const e of handoff.examples??[]){if(e.active)action('Desativar exemplo · '+e.problem,async()=>{await api('studio/revoke-example',{id:record.id,scope:record.request.scope,exampleId:e.id,operator:operator.value});await loadRecord(record);},handoffText);}
  }
  async function showIssues(){
    issueList.replaceChildren();
    const pending=record;
    // Server computes full QA before approval. Display result from the read endpoint.
    for(const issue of pending?.issues??[])issueList.append(el('li',issue.message));
    if(record&&pending){record.issues=pending.issues;syncButtons();}
  }
  async function saveDraft(){
    const value=gather();
    const saved=record?await api('studio/revise',{id:record.id,scope:record.request.scope,revision:record.revision,request:value}):
      await api('studio/create',{id:creationId,name:fields.client.value,email:fields.email.value,request:value});
    await loadRecord(saved);await refreshList();notice('Rascunho salvo. Confira as duas propostas antes de aprovar.');
  }
  async function refreshList(){savedRecords=await api('studio/list');renderSaved();}
  function renderSaved(){const values=savedRecords.filter(v=>(v.brand+' '+v.scope.storeId).toLowerCase().includes(filterStore.value.toLowerCase())&&(v.category??'').toLowerCase().includes(filterCategory.value.toLowerCase())&&(!filterState.value||v.status===filterState.value));filteredCount.textContent=values.length+' de '+savedRecords.length+' fichas carregadas (até 100 recentes)';list.replaceChildren(el('option','Selecionar conteúdo salvo',{value:''}));for(const v of values)list.append(el('option',v.brand+' · '+v.product+' · r'+v.revision+' · '+v.status,{value:JSON.stringify({id:v.id,scope:v.scope})}));}
  async function run(fn){if(busy)return;busy=true;save.disabled=true;try{await fn();}catch(e){notice(e.message,true);}finally{busy=false;save.disabled=false;}}
  await loadFixture('clara');await refreshList();
}
