import {sampleContent,sampleImages} from './brazil-ui.js';
export function mountEditorial({api,act,notice}){
  const upload=document.getElementById('upload'),kind=document.createElement('select');kind.name='service';kind.setAttribute('aria-label','Serviço do arquivo');kind.add(new Option('Preparação de cadastro — R$690','catalog'));kind.add(new Option('Lançamento combinado — R$990','combined'));
  const combined=document.createElement('label');combined.textContent='Conteúdo combinado: perfil e até 10 produtos do arquivo (JSON aprovado)';combined.hidden=true;
  const copy=document.createElement('textarea');copy.name='combinedContent';copy.rows=10;copy.value=JSON.stringify(sampleContent,null,2);combined.append(copy);kind.onchange=()=>{combined.hidden=kind.value!=='combined';};
  const uploadDetails=upload.querySelector('details')||upload;uploadDetails.prepend(kind,combined);
  const article=document.createElement('article');article.innerHTML='<h2>Serviços independentes — Brasil</h2><p>Simulação local. Diagnóstico não é obrigatório; cliente importa/publica. Conteúdo exige fatos e textos aprovados. Nenhum envio ou cobrança.</p>';
  const form=document.createElement('form');const select=document.createElement('select');select.setAttribute('aria-label','Serviço independente');select.add(new Option('Conteúdo — R$490','content'));select.add(new Option('Diagnóstico — R$190','diagnostic'));select.add(new Option('Padronização de imagens — R$290','images'));
  const name=document.createElement('input');name.value='Marca sintética';name.required=true;name.setAttribute('aria-label','Nome da marca');
  const email=document.createElement('input');email.type='email';email.value='marca@example.com';email.required=true;email.setAttribute('aria-label','Email sintético');
  const input=document.createElement('textarea');input.rows=12;input.setAttribute('aria-label','Briefing em JSON');
  const reset=()=>{input.value=JSON.stringify(select.value==='content'?sampleContent:select.value==='images'?sampleImages:{products:[{id:'P001',title:'Camiseta sintética',description:'',source:'Fixture sintética',missingFields:['Composição']}]},null,2);};reset();select.onchange=reset;
  const button=document.createElement('button');button.textContent='Criar pedido demonstrativo';button.className='primary';
  form.append(select,name,email,input,button);form.onsubmit=e=>{e.preventDefault();act(async()=>{await api('editorial',{name:name.value,email:email.value,service:select.value,brief:JSON.parse(input.value),demo:true});notice('Serviço sintético criado. Aprove o escopo e simule o pagamento no pedido.');});};article.append(form);
  const revise=document.createElement('form');const id=document.createElement('input');id.placeholder='ID completo do pedido editorial';id.setAttribute('aria-label','Pedido para revisão');id.required=true;
  const reason=document.createElement('select');reason.setAttribute('aria-label','Motivo da revisão');reason.add(new Option('Ajuste de escopo','scope-adjustment'));reason.add(new Option('Correção de defeito','defect'));
  const send=document.createElement('button');send.textContent='Revisar com o briefing acima';revise.append(id,reason,send);revise.onsubmit=e=>{e.preventDefault();act(async()=>{await api('editorial/revise',{id:id.value,brief:JSON.parse(input.value),reason:reason.value});notice('Revisão recebida; confira pendências e reaprovação.');});};article.append(revise);
  const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='⚙️ Serviços independentes avulsos em JSON (Override Manual)';details.append(summary,article);
  document.getElementById('orders').insertBefore(details,document.getElementById('order-list'));
}
