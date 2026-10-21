import {createHash} from 'node:crypto';
import {checkRequest,templateSchema,templateVersion,type StudioRequest} from './contracts.ts';
export const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const headings={presentation:'A peça',context:'Como usar',fit:'Caimento',features:'Características',composition:'Composição',care:'Cuidados',size:'Medidas'};
export function planContent(input:StudioRequest){
  const blocks=input.mode==='preserve'?[{id:'original',section:'presentation' as const,text:input.product.original.text,factIds:input.product.facts.map(f=>f.id),approved:input.product.original.approved}]:
    input.blocks.length?input.blocks:input.product.facts.map(f=>({id:f.id,section:f.section,text:f.text,factIds:[f.id],approved:f.approved}));
  return {mode:input.mode,blocks,media:input.media.map(m=>({id:m.id,role:m.role,color:m.color,variantIds:m.variantIds})),limits:['Blocos opcionais, sem preenchimento de fatos ausentes.','Análise visual é do operador.','Não comprova integração com tema Shopify.']};
}
export function renderDescription(input:StudioRequest,templateInput:unknown,options:{original?:boolean;selectedColor?:string}={}){
  const template=templateSchema.parse(templateInput),plan=planContent(input),v=input.brand.visual;
  const order=template==='essential'?['presentation','features','composition','care','size','fit','context']:['presentation','context','fit','features','composition','care','size'];
  const issues=checkRequest(input);
  const selectedColor=options.selectedColor??input.product.variants.find(v=>v.color)?.color??'';
  if(!selectedColor&&input.product.variants.some(v=>v.color))throw Error('Selecione a cor representada na prévia.');
  if(selectedColor&&!input.product.variants.some(v=>v.color===selectedColor))throw Error('Cor de prévia inexistente.');
  const safeMedia=input.media.filter(m=>{
    const color=m.color||input.product.variants.find(v=>m.variantIds.includes(v.id))?.color||'';
    return input.brand.materialAuthorization&&m.authorized&&m.approved&&!issues.some(i=>i.subject===m.id)&&(!selectedColor||!color||color===selectedColor);
  });
  const usedMedia=new Set<string>();
  const image=(role:string,id?:string)=>{const m=safeMedia.find(m=>(id?m.id===id:m.role===role)&&!usedMedia.has(m.url));if(m)usedMedia.add(m.url);return m?'<figure><img src="'+escape(m.url)+'" alt="'+escape(m.alt)+'" loading="lazy"><figcaption>'+escape(m.alt)+'</figcaption></figure>':'';};
  const sections=order.map(section=>{const blocks=plan.blocks.filter(b=>b.section===section);return blocks.length?'<section><h3>'+headings[section as keyof typeof headings]+'</h3>'+blocks.map(b=>'<p>'+escape(b.text).replace(/\n/g,'<br>')+'</p>').join('')+'</section>':'';});
  const css='[data-catana-description]{--accent:'+v.accent+';--surface:'+v.background+';--ink:'+v.text+';color:var(--ink);background:var(--surface);font-family:'+(v.font==='serif'?'Georgia,serif':'system-ui,sans-serif')+';line-height:1.65;overflow-wrap:anywhere;max-width:960px;margin:auto;padding:clamp(18px,4vw,46px);box-sizing:border-box;border-radius:'+v.radius+'px}'+
    '[data-catana-description] *{box-sizing:border-box}[data-catana-description] h2{font-size:clamp(25px,4vw,40px);line-height:1.15;margin:12px 0 22px}[data-catana-description] h3{font-size:18px;color:var(--accent);margin:24px 0 10px}[data-catana-description] p{white-space:pre-wrap;margin:10px 0}[data-catana-description] figure{margin:18px 0}[data-catana-description] img{display:block;width:100%;max-height:510px;object-fit:contain;border-radius:'+v.radius+'px}[data-catana-description] figcaption{font-size:12px;margin-top:8px}[data-catana-description] .catana-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:30px}[data-catana-description] .catana-label{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}@media(max-width:640px){[data-catana-description] .catana-columns{grid-template-columns:1fr;gap:8px}}';
  const guides=(input.adaptive?.guides??[]).filter(g=>g.approved&&!issues.some(i=>i.subject===g.id)).map(g=>'<section><h3>'+escape(g.title)+'</h3><p>'+escape(g.componentId?input.adaptive!.components.find(c=>c.id===g.componentId)?.title??'':'')+' · '+escape(g.unit)+'</p><div style="overflow-x:auto"><table><caption>'+escape(g.source)+'</caption><thead><tr><th scope="col">Tamanho</th>'+g.columns.map(c=>'<th scope="col">'+escape(c)+'</th>').join('')+'</tr></thead><tbody>'+g.rows.map(r=>'<tr><th scope="row">'+escape(r.size)+'</th>'+r.values.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></section>').join('');
  const content=options.original?'<p class="catana-label">Texto original · HTML recebido não executado</p><p>'+escape(input.product.original.text||'Texto original não fornecido.')+'</p>':
    '<p class="catana-label">'+escape(input.brand.name)+'</p><h2>'+escape(input.product.title)+'</h2>'+
    (input.brand.introduction?'<p>'+escape(input.brand.introduction)+'</p>':'')+
    (template==='editorial'?'<div class="catana-columns"><div>'+image('hero')+'</div><div>'+sections.slice(0,3).join('')+'</div></div>'+sections.slice(3).join(''):image('hero')+sections.join(''))+
    image('detail')+(template==='editorial'?image('context'):'')+
    (input.adaptive?.components??[]).map(c=>'<section><h3>'+escape(c.title)+'</h3>'+c.mediaIds.map(id=>image('',id)).join('')+input.product.facts.filter(f=>f.approved&&c.factIds.includes(f.id)).map(f=>'<p>'+escape(f.text)+'</p>').join('')+'</section>').join('')+guides;
  return {template,templateVersion,html:'<style>'+css+'</style><div data-catana-description data-template="'+template+'">'+content+'</div>',plan,issues};
}
export function renderPreview(input:StudioRequest,template:unknown,options:{original?:boolean;selectedColor?:string;approved?:boolean}={}){
  const result=renderDescription(input,template,options);
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>'+escape(input.product.title)+' — prévia</title></head><body style="margin:0;background:#edf1f2"><p style="font:12px system-ui;padding:12px;margin:0;color:#243b45">PRÉVIA LOCAL · '+(options.approved?'revisão aprovada pelo operador':'RASCUNHO — exige revisão')+' · conteúdo da descrição, sem publicação</p>'+result.html+'</body></html>';
}
export function checkRendered(input:StudioRequest,template:unknown,html:string,selectedColor?:string){
  const issues=checkRequest(input);
  if(renderDescription(input,template,{selectedColor}).html!==html)issues.push({code:'OUTPUT_CHANGED',subject:'html',message:'Saída diverge dos blocos e do renderer versionado.'});
  if(/<script\b|\son[a-z]+\s*=|javascript:|<form\b|<iframe\b/i.test(html))issues.push({code:'ACTIVE_CONTENT',subject:'html',message:'Conteúdo ativo bloqueado.'});
  return issues;
}
