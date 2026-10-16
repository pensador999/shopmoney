# Plano operacional e migração — 16/10/2026

Status: proposta técnica baseada no código atual; não representa implantação nem liberação comercial.

## Negócio

Cliente inicial: pequenas agências americanas que implantam ou migram Shopify e recebem arquivos heterogêneos de fornecedores. Comprador: responsável por operação/implantação. Problema: preparar e conferir dados exige trabalho manual mesmo quando existe ferramenta de importação. Diferencial a validar: assumir mapeamento, rastreabilidade e conferência, com escopo delimitado.

Oferta: US$149, um CSV/XLSX, até 50 pais e 500 variantes, produtos novos em rascunho; agência importa. Três dias úteis após pagamento e dados completos, uma rodada de ajustes das regras acordadas. Não inclui aplicação em loja, inventar atributos, pesquisa de dados ou produção de imagens. Preço é hipótese, não demanda comprovada.

Validar com 30 agências qualificadas, campanha somente após autorização, dois pilotos independentes e uma recompra. Registrar respostas, motivos de recusa, horas por etapa, correções e contribuição. Sem resposta qualificada, revisar público/oferta; sem margem, revisar preço/escopo. Assinatura US$399 por quatro lotes é hipótese condicionada à repetição e capacidade.

Contribuição = receita menos taxas, custos variáveis e horas totais × US$25. Exemplo hipotético: US$149 − US$7 de taxas − US$2 de custos − 2h × US$25 = US$90, antes de custos fixos e impostos. As taxas do exemplo não são cotação Stripe. Com US$9 de desembolsos, 5,6h consomem toda essa contribuição; infraestrutura deve entrar na decisão de preço/capacidade.

## Estágio comprovado por leitura de código

Automação local assistida: produção/QA determinísticas, persistência, simulações e fila IA. Oito papéis de IA compartilham o mesmo executor isolado e esquema de resposta; não constituem oito especialistas com ferramentas e handoffs completos. `agents.ts` só aceita Eve em 127.0.0.1, limita 12 tentativas/dia e uma chamada por vez. `runtime.ts` depende de execução periódica no processo local. Pesquisa/comercial ainda não compõem um ciclo integral até pedido. Testes anteriores: 27 aprovados; nenhuma receita comprovada.

Documentos no Git não entram automaticamente no contexto da IA. Hoje as instruções contêm uma oferta resumida, e cada chamada recebe função, versão da política e dados da tarefa. Incremento necessário: contexto empresarial estruturado e versionado, carregado por código com apenas oferta, limites, regra e critérios relevantes ao papel; registrar a versão usada. Não enviar todo o repositório a cada chamada nem permitir que mensagens de clientes redefinam políticas.

## Hospedagem proposta

Destino: painel/API autenticados na Vercel, Postgres gerenciado para estado, armazenamento privado para arquivos, Workflow para etapas duráveis. IA por provedor com autenticação suportada no servidor e teto de custo aprovado. Manter produção/QA sem LLM. Não copiar login ChatGPT do computador para o servidor. Sem credencial/modelo aprovado, tarefas IA ficam suspensas, sem fallback pago.

Transição possível: recepção/painel na nuvem, executor local consumindo fila remota por conexão de saída autenticada. O computador desligado interrompe processamento local, mas não recepção. Banco remoto deve ser fonte única; evitar dois bancos com escrita concorrente e sincronização improvisada. Essa fase híbrida é opcional, não destino obrigatório.

Importação Git na Vercel deve ocorrer após separar entrypoints HTTP do loop local, retirar dependência do arquivo SQLite, migrar transações/leases/idempotência para banco remoto e blobs para armazenamento privado. Substituir proteção baseada em localhost por login real e autorização por cliente/pedido. Preparar ambientes distintos, segredos, backup/restauração, logs com dados mínimos, limites de custo e rollback. Não presumir que `eve build` publique o painel customizado `src/server.ts`.

MCP é interface de ferramentas, não hospedagem nem motor de tarefas. Preferir adaptadores já existentes de Gmail e Stripe. Quando necessário, usar MCP remoto HTTPS autenticado com ferramentas permitidas por papel; servidor stdio/local não fica acessível automaticamente à Vercel. Plugins deste chat não são credenciais do aplicativo. Financeiro consulta eventos; reembolso e compromissos excepcionais continuam sob controle explícito. Não dar shell, segredos ou acesso global a clientes aos papéis.

Vercel Hobby é destinado a uso pessoal/não comercial; operação comercial exige plano apropriado. Antes de contratar, estimar custo total: plataforma, banco, arquivos, modelos e observabilidade. Disponibilidade 24/7 significa eventos persistidos e tarefas retomáveis, não modelos conversando continuamente.

## Painel e automação de preenchimentos

Problemas observados no HTML/JS: JSON de mapeamento/perfil exposto no fluxo principal, separadores escolhidos manualmente, contexto de agente digitado livremente, próximos passos dentro de detalhes de cada pedido e lista genérica de tarefas IA. Existem etapas por responsável, mas falta visão integrada pesquisa → pedido → retorno.

Proposta: tela inicial com pendências acionáveis e quadro por etapa. Cartão mostra cliente, responsável, próxima ação, bloqueio, prazo, evidência e custo conhecido/desconhecido. Clique abre linha do tempo e materiais; configuração técnica fica em modo avançado. Formulário de tarefa IA deriva papel e contexto do pedido, sem copiar texto manualmente.

| Campo | Automação proposta | Quando pedir revisão |
|---|---|---|
| Cliente/email | Reutilizar cadastro ou remetente autenticado associado ao pedido | Associação nova, divergente ou ambígua |
| Separador/BOM | Parser testa estrutura consistente | Mais de uma interpretação válida |
| Molde | Assinatura exata de cabeçalhos e versão de perfil | Mudança de colunas ou fornecedor |
| Decimais | Perfil aprovado, conferir consistência | Valores ambíguos como 1.234 |
| Pai/variante/opções | Regras explícitas do perfil salvo | Nova grade, relação ausente ou conflito |
| SKU/EAN/preços | Preservar e conferir por código | Ausência, duplicidade ou divergência |
| Prazo/preço do serviço | Política + dados completos + pagamento | Exceção ou falta de capacidade |
| Horas/taxas | Cronometragem sugerida e eventos financeiros conciliados | Horas externas, pausas, custos não capturados |

Cabeçalho reconhecido não comprova significado, moeda, relação pai/variante ou permissão de importação. Nunca usar reconhecimento do molde como aprovação de escopo/pagamento. Primeiro lote tem revisão explícita; reaproveitamento de perfil só para mesmo fornecedor/versão sem divergências.

## Fluxo alvo e contratos

Pesquisa → comercial autorizado → atendimento → planejamento aprovado → pagamento confirmado → produção → QA → entrega → ajustes → encerramento → recompra.

Cada passagem persiste tarefa, cliente, pedido, revisão, papel, referências de entrada, dependências, resultado validado, regra, prazo, tentativas, custo e chave idempotente. QA bloqueia entrega; sem pagamento não há produção. Coordenador agenda pelo banco; LLM explica exceções e prepara texto. Resultado inválido não avança etapa. Reexecução não duplica efeitos externos. Nenhuma atividade comercial começa porque uma tela foi simplificada.

## Sequência verificável

1. Contexto empresarial versionado nos agentes: teste de oferta/limites e isolamento entre clientes.
2. Reconhecimento de formato e perfis reutilizáveis: testes com ambiguidade, alteração de cabeçalhos, zeros e decimais; revisão obrigatória demonstrável.
3. Quadro integrado: pedido sintético aparece com responsável, bloqueio e próxima ação; transições refletem estado persistido após reinício.
4. Gmail e Stripe sandbox e importação Shopify de teste: comprovar eventos reais de teste, sem ativar campanha.
5. Migração de persistência, autenticação e executor: provar isolamento, recuperação e idempotência com duas execuções concorrentes antes de deploy público.
6. Preview Vercel protegido e ensaio completo: somente após configuração/custo aprovados; produção comercial depende dos gates e autorização.

## Fontes consultadas

- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/workflows
- https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel
- https://vercel.com/legal/terms

Este documento é planejamento. Não altera permissões, planos, infraestrutura ou a execução atual.
