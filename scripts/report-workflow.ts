import { writeFileSync } from 'node:fs';
import { workflowDefinition } from '../src/workflow.ts';
const d=workflowDefinition();
const lines=[`# Prontidão do copiloto interno — ${d.version}`,'',
'Fonte canônica: src/workflow.ts. Gerado por node scripts/report-workflow.ts; o painel utiliza a mesma definição. Evidências são de testes/inspeções registrados, não monitoramento contínuo.', '',
'## Diagnóstico executivo','',
'O copiloto local pode ser usado com dados sintéticos e supervisão. Oito papéis compartilham o executor Eve; produção e QA são código. Login e leitura Supabase confirmados pelo titular. Ponte brasileira de escrita/arquivos/executor preparada e testada em fixture; migração real não aplicada por indisponibilidade da revisão automática. Não há operação comercial liberada. Orçamento zero.','',
'## Ofertas brasileiras em teste','',...Object.values(d.services.offers).map(o=>`- ${o.name}: R${(o.cents/100).toFixed(2)}; ${o.enabled?'simulação disponível':'bloqueado até validação técnica'}.`),'','Preços e ICP: docs/BRASIL.md. Evidências atuais e bloqueios: docs/IMPLEMENTACAO_BRASIL.md. Sem cobrança ou campanha.','', '## Contratos e revisão dos oito papéis','',
...d.roles.flatMap(r=>[`### ${r.owner}`,'',`- Executor: ${r.executor}.`,`- Situação: ${r.state}.`,`- Entrada: ${r.input}.`,`- Entrega: ${r.output}.`,`- Evidência: ${r.evidence}`,`- Próxima função: ${r.next.map(id=>d.roles.find(x=>x.id===id)!.owner).join(', ')}.`,`- Ferramentas: ${r.tools}`,`- Operador: ${r.human}`,`- Limitação/exceção: ${r.limitation}`,`- Procedimento: ${r.procedure}; SHA-256 ${r.procedureVersion}.`,'']),
'## Fluxo e passagens','',...d.edges.map(e=>`- ${e.from} → ${e.to}: ${e.label}${'exception' in e?' (retorno/exceção)':''}.`),'','Coordenação supervisiona o conjunto. As ligações representam o processo esperado, não passagens comprovadas. IA consultiva concluída não equivale a etapa operacional concluída.','',
...d.milestones.flatMap(m=>[`## ${m.label}`,'',m.criterion,'',...d.readiness.filter(i=>i.milestone===m.id).flatMap(i=>[`### ${i.area}`,'',`- Situação: ${i.status==='verified'?'evidência registrada':i.status==='partial'?'parcial':'pendente'}.`,`- Evidência: ${i.evidence}`,`- Impacto: ${i.impact}`,`- Responsável: ${i.owner}.`,`- Dependência: ${i.dependency}`,`- Próxima ação: ${i.next}`,`- Aceite: ${i.acceptance}`,''])]),
'## Prioridade e participação manual','',
'1. Consolidar orientação e regras; corrigir encaminhamento de atendimento/comercial.',
'2. Implementar respostas especializadas e validar próxima ação pelo estado do pedido.',
'3. Integrar escrita remota, arquivos e executor com recuperação.',
'4. Repetir cenário sintético com dados ausentes, QA reprovado, cancelamento e retomada.',
'5. Para comercial: titular disponibiliza loja de teste, configura processador sandbox, aprova identidade/termos e autoriza destinatários/campanha. Nenhum desses itens bloqueia o uso local supervisionado.',
'','## Limites das evidências','',
'31 testes, 11 verificações verticais e duas rodadas Eve referem-se às validações registradas anteriores. Testes atuais da nova interface devem constar na RETOMADA. Testes SQL de autorização usam transações revertidas e não substituem login real. A lista remota é limitada; agregados são calculados sobre toda a fonte autorizada. Revisões antigas são histórico. Custos hipotéticos não representam receita ou margem comprovada. Hospedagem e API paga continuam dependentes de aprovação de orçamento.',''];
writeFileSync(new URL('../docs/PRONTIDAO_COPILOTO.md',import.meta.url),lines.join('\n'));
console.log('docs/PRONTIDAO_COPILOTO.md atualizado');
