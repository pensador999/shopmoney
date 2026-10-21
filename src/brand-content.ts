import { z } from 'zod';
import { hash } from './catalog.ts';

export const brandProfileSchema = z.object({
  version: z.string().min(1).max(80), audience: z.string().min(1).max(1000),
  proposition: z.string().min(1).max(1000), tone: z.string().min(1).max(500),
  approvedExamples: z.array(z.string().max(2000)).max(5).default([]),
  forbiddenTerms: z.array(z.string().min(1).max(100)).max(30).default([]),
  variantRules: z.string().max(2000).default(''), materialAuthorization: z.literal(true),
}).strict();
export const productBriefSchema = z.object({
  id: z.string().min(1).max(100), title: z.string().min(1).max(200),
  facts: z.array(z.object({ text: z.string().min(1).max(1500), source: z.string().min(1).max(500), approved: z.boolean() }).strict()).min(1).max(30),
  // Human-approved copy may express brand language; every claim must reference an approved fact.
  copy: z.array(z.object({ text: z.string().min(1).max(2000), factIndexes: z.array(z.number().int().nonnegative()).min(1) }).strict()).max(10).default([]),
  copyApproved: z.boolean().default(false),
}).strict();
export const contentRequestSchema = z.object({ brand: brandProfileSchema, products: z.array(productBriefSchema).min(1).max(10) }).strict();
export type ContentRequest = z.infer<typeof contentRequestSchema>;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export function validateBrief(input: ContentRequest) {
  const issues: { productId: string; field: string; message: string }[] = [];
  const seen = new Set<string>();
  for (const p of input.products) {
    if([p.id,p.title,...p.facts.map(f=>f.text),...p.copy.map(c=>c.text)].some(v=>/^[\s\u0000-\u001f]*[=+@-]/.test(v)||v.includes('\u0000')))issues.push({productId:p.id,field:'csv',message:'Texto contém fórmula ou caractere não permitido para planilha.'});
    if (seen.has(p.id)) issues.push({ productId:p.id,field:'id',message:'Identificador duplicado.' }); seen.add(p.id);
    if (p.facts.some(f => !f.approved)) issues.push({productId:p.id,field:'facts',message:'Fatos sem aprovação; não gerar alegações.'});
    if (p.copy.length && (!p.copyApproved || p.copy.some(c => c.factIndexes.some(i => !p.facts[i]?.approved)))) issues.push({productId:p.id,field:'copy',message:'Texto exige aprovação humana e referências válidas aos fatos.'});
    const text=[p.title,...p.facts.map(f=>f.text),...p.copy.map(c=>c.text)].join(' ').toLocaleLowerCase('pt-BR');
    for (const term of input.brand.forbiddenTerms) if(text.includes(term.toLocaleLowerCase('pt-BR'))) issues.push({productId:p.id,field:'brand',message:`Termo proibido: ${term}`});
  }
  return issues;
}
export function prepareContent(input: ContentRequest) {
  const issues=validateBrief(input); if(issues.length) throw Error(JSON.stringify(issues));
  return input.products.map(p=>{
    const paragraphs=p.copy.length?p.copy.map(c=>c.text):p.facts.map(f=>f.text);
    return { id:p.id,title:p.title,html:paragraphs.map(t=>`<p>${escape(t)}</p>`).join(''),seoTitle:p.title.slice(0,70),metaDescription:paragraphs.join(' ').slice(0,160),
      provenance:p.facts.map((f,i)=>({index:i,source:f.source,textHash:hash(f.text)})),brandVersion:input.brand.version,
      mode:p.copy.length?'texto aprovado pelo operador':'composição determinística de fatos aprovados' };
  });
}
export function checkContent(input: ContentRequest, output: ReturnType<typeof prepareContent>) {
  const issues=validateBrief(input).map(i=>i.message);
  if(output.length!==input.products.length) issues.push('Quantidade divergente.');
  for(const p of input.products){
    const o=output.find(v=>v.id===p.id); if(!o){issues.push(`Produto ausente: ${p.id}`);continue;}
    const allowed=p.copy.length?p.copy.map(c=>c.text):p.facts.map(f=>f.text);
    if(o.title!==p.title||o.html!==allowed.map(s=>`<p>${escape(s)}</p>`).join('')||o.seoTitle!==p.title.slice(0,70)||o.metaDescription!==allowed.join(' ').slice(0,160)) issues.push(`Conteúdo alterado ou alegação sem fonte: ${p.id}`);
    if(o.brandVersion!==input.brand.version||JSON.stringify(o.provenance)!==JSON.stringify(p.facts.map((f,i)=>({index:i,source:f.source,textHash:hash(f.text)}))))issues.push(`Rastreabilidade alterada: ${p.id}`);
  }
  return issues;
}
