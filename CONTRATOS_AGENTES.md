# Contratos do time — especificação para implementação

Atualização 16/10: etapas do pedido agora persistem em `order_tasks` e aparecem no painel, derivadas do estado do pedido. Responsável, dependência, resultado esperado, regra, revisão, prazo e limite de produção estão representados. Comercial e pesquisa ainda não são tarefas conectadas a esse ciclo. Não há delegação automática para especialistas LLM.

Prioridade: entrega utilizável de piloto e margem medida. Este documento define o próximo incremento; não afirma que toda a orquestração já esteja implementada.

Cada tarefa persistida deve conter: id, cliente (ou prospect identificado), pedido quando existir, perfil/versão, responsável, etapa, entradas por referência, dependências, prazo ou pendência de prazo, resultado esperado, critérios de aceite, tentativas/limite, estado, regra aplicada e evidências. Uma etapa concluída não implica conclusão da seguinte. O coordenador deve derivar a próxima ação dos estados no banco.

| Função | Entrada | Entrega verificável | Executor |
|---|---|---|---|
| Coordenação | Estados, capacidade, prazos e exceções | Próxima tarefa elegível com responsável e dependências | Código; IA resume exceções |
| Pesquisa | Público e critérios comerciais | Candidato, evidência de serviço, fonte e contato publicado | Pesquisa assistida e revisão |
| Comercial | Candidato qualificado e autorização | Necessidade confirmada e escopo delimitado | IA prepara; envio controlado |
| Atendimento | Mensagens e materiais do cliente | Dados completos ou perguntas objetivas | IA sugere; código controla fila |
| Planejamento | Original e requisitos | Perfil versionado aprovado e critérios de aceite | Código valida; aprovação explícita |
| Produção | Perfil aprovado e confirmação financeira | Saída e rastreabilidade | Código determinístico |
| Qualidade | Original, perfil e saída | Evidências comparativas ou bloqueio | Código independente; IA explica |
| Financeiro/encerramento | Eventos autenticados, entrega e custos | Conciliação, esforço total, margem e pendências | Código; exceções humanas |

Transições obrigatórias: planejamento pendente bloqueia cobrança; pagamento não confirmado bloqueia produção; QA reprovado bloqueia entrega; cancelamento bloqueia mensagens; encerramento não inventa aceite. Correções têm limite da política. Repetição após falha deve respeitar idempotência e nunca duplicar cobrança ou envio.

Economia: receita confirmada menos taxas, custos variáveis e horas totais × US$25. Horas incluem pesquisa, comercial, atendimento, produção e correções. Dados incompletos significam margem desconhecida. Reembolso e disputa devem ser considerados; não contar simulações como receita.

No estado atual, papéis são sessões lógicas de IA, uma chamada por vez; produção e qualidade já são código. Atendimento foi acrescentado como papel. Ainda não há contrato completo de tarefa, handoff persistido de todos os papéis ou painel com custos por etapa.

Infraestrutura mínima proposta para validação: arquivos e processamento locais; recepção externa apenas quando contas e integrações forem configuradas e testadas. Migrar processamento para servidor depende de orçamento e autenticação de modelo compatível. Não presumir que login ChatGPT local é credencial de servidor. Não contratar ou publicar nesta etapa.
