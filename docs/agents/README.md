# Procedimentos executáveis do time

O carregador `src/agent-playbooks.ts` lê COMMON.md e o MD da função antes da chamada. Não basta criar um documento em outra pasta: apenas esses caminhos fixos são carregados. O texto é enviado junto do contrato empresarial; as restrições do agente raiz continuam vigentes.

| Papel | Procedimento | Responsabilidade |
|---|---|---|
| research | research.md | Qualificação a partir de evidências fornecidas |
| sales | sales.md | Escopo e rascunho comercial |
| support | support.md | Materiais, perguntas e acompanhamento |
| planner | planner.md | Pendências e critérios de mapeamento |
| production | production.md | Explicação da produção determinística |
| quality | quality.md | Explicação de conferências e bloqueios |
| finance | finance.md | Conciliação, esforço e contribuição |
| coordinator | coordinator.md | Dependências e próxima ação |

O hash SHA-256 dos procedimentos compõe a identidade das análises de pedidos e o audit da conclusão. Uma mudança de procedimento permite nova análise sem reutilizar o resultado anterior. Pedido alterado durante a chamada tem resposta descartada antes de qualquer efeito. Cada job tem no máximo três tentativas; falha persistente exige intervenção. O limite global continua em 12 tentativas por dia.

Esses papéis são sessões isoladas do mesmo executor Eve. Não possuem ferramentas externas. Pesquisa não navega; produção e qualidade executam em código. As saídas continuam consultivas no formato JSON comum. Ainda faltam entregas tipadas específicas para cada especialidade, integração comercial completa e persistência remota do aplicativo.

Validação deste incremento: TypeScript aprovado e 30 testes aprovados, incluindo alteração de pedido durante chamada e limite de tentativas. O modelo foi substituído por respostas controladas nos testes; não houve chamada real à IA, envio, cobrança ou deploy.
