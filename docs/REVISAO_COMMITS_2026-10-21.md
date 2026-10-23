# Revisão dos commits de 21/10/2026 — Catana Ops

## Escopo e método

Janela: 21/10/2026, 00:00–23:59, America/Sao_Paulo. Repositório oficial: pensador999/shopmoney. Referência remota examinada: 70b16dc. O checkout operacional permaneceu em bde0b8b; nenhum merge, deploy ou alteração no Supabase foi realizado.

O dia contém oito commits: bde0b8b (base local previamente validada), 7461400 (vínculo editorial), 1b79037 (economia e handoffs), 381608f (lotes e conciliação), 62ae06e (interface), 1a62113 (tema), 6acbdcf (aprendizado), 70b16dc (autopilot). Os sete incrementais alteram 28 arquivos, com 2.253 inserções e 107 exclusões. A análise concentra-se nesses incrementos, sem reauditar todo o histórico da base.

Snapshot isolado: `artifacts/review-70b16dc`. Validação: 107/107 testes aprovados e TypeScript sem erros. A primeira execução teve restrição de loopback; a repetição autorizada passou. Testes complementares executados em SQLite em memória; sem emails, pagamentos, IA paga ou lojas reais. Evidências: `review-tests-unrestricted.log`, `review-repro.ts` e `review-repro.json` nesse diretório. Não houve validação visual no navegador nesta revisão.

## Resultado

Há melhorias úteis de integração local, mas o último autopilot não deve ser tratado como operação validada. Aprovação da suíte não cobre as regressões abaixo. A atualização do Supabase é necessária, porém não corrige automaticamente esses comportamentos.

### P1 — Fichas antigas deixam de abrir

`src/content-studio/contracts.ts` acrescenta defaults `view` e `viewConfirmed` à mídia. `ContentStudio.get` normaliza com o novo schema e compara o hash ao registro antigo. A normalização muda o objeto, provocando “Conteúdo persistido foi alterado.” Reproduzido com uma ficha válida no formato anterior.

Correção: leitura por versão, validação do hash original antes da migração e migração explícita das revisões. Não simplesmente ignorar o hash. Testar fichas antigas aprovadas/exportadas e preservar rastreabilidade.

### P1 — Autopilot aprova dados de demonstração como conteúdo do produto

`src/autopilot.ts:181–208` reutiliza `studioFixture`, trocando apenas nome da marca e título. Na execução, “Camisa Linho Puro Respiravel” recebeu fatos de camiseta de gola redonda, composição fictícia de algodão e SKUs `000120-*`. A aprovação marcou conferência visual, textual e factual como realizadas. Também promoveu o exemplo para aprendizado.

Correção: construir a ficha a partir do produto efetivamente selecionado e de suas fontes; manter ausência/conflito como pendência; exigir confirmação visual real. Fixtures só em demonstrações claramente separadas, sem promover aprendizado de cliente. A ficha criada por esse caminho não usa o vínculo de `StudioOperations`, apesar do comentário afirmar vínculo ao pedido.

### P1 — Conciliação consigo mesmo libera requisito de importação

`src/autopilot.ts:279–280` passa o próprio CSV gerado para `reconcileImport(..., true)`. Reproduzido: requisito global `shopifyImport` preenchido sem acesso ou importação em Shopify.

Correção: separar teste de consistência local de evidência externa de importação. Uma demonstração nunca deve liberar esse requisito global. Registrar origem, loja de teste, execução e responsável pela confirmação. Comparação de arquivos, por si só, não comprova importação.

### P1 — Aprovações e encerramento sem evidência independente

O autopilot aprova escopo, simula pagamento, registra entrega, aprova aprendizado e fecha o pedido na mesma chamada. O mapeador retorna `requiresHumanReview: true`, mas esse sinal não interrompe o caminho. Ausência de métricas de QA vira nota 100 e aprovação `true`. Apenas um trabalho consultivo de coordenação é enfileirado; os oito cartões concluídos não são oito execuções independentes de IA.

Correção: preservar a automação determinística, mas distinguir etapa preparada, simulada, conferida e aprovada. Omissão de evidência não pode significar aprovação. Aprovação de regras permanece do operador. Repetição da requisição precisa de chave idempotente, pois a criação atual usa novos UUIDs.

### P1 — Custos hipotéticos apresentados como apurados

`src/autopilot.ts:233–273`: horas por fórmula, taxas R$24,90, custos R$12,50 e tributos R$41,40 fixos. Resultado reproduzido: contribuição R$554,20, sem medição de trabalho ou recebimento real. A interface textual chama isso de margem líquida.

Correção: separar estimativa e medição; custos desconhecidos continuam desconhecidos. Não promover resultado demonstrativo para comprovação de margem. Contribuição não é lucro líquido.

### P2 — Revisões editoriais e artefatos do pedido podem divergir

`StudioOperations.synchronizeScope` grava briefing por revisão do pedido, enquanto fichas têm revisão independente. A gravação de artefatos em `Store` usa inserção que preserva a primeira ocorrência. O mesmo padrão aparece no pacote de entrega. Uma nova ficha na mesma revisão do pedido pode atualizar o estado sem substituir o artefato anterior.

Correção proposta: revisão/hash agregado das fichas como identidade de pacote, invalidar saída/aprovação dependente e manter versões anteriores imutáveis. Adicionar regressão: entregar, alterar ficha, reaprovar, entregar novamente e conferir conteúdo baixado. Achado por inspeção; esse cenário específico não foi executado.

### P2 — Aprendizado ainda heurístico e escopo incompleto

O motor combina similaridade textual, sinônimos, regras e exemplos. É útil para sugerir; suas porcentagens não demonstram acurácia estatística em dados externos. O mapeamento tem fallback por posição de coluna. Parte do histórico é selecionada por cliente, sem separar loja/workspace; a declaração `tenantIsolated` não prova isolamento completo dessas consultas.

Correção: identidade composta por workspace/cliente/loja, bloquear inferência ambígua e avaliar conjunto independente. Separar progresso de preenchimento de acurácia. Não há necessidade demonstrada de treinar modelo próprio.

### P2 — Ensaios chamados de campo não comprovam lojas reais

`src/field-trial.ts` usa entradas construídas localmente e aprovação programática. Os testes verificam que a pontuação aumenta e o fluxo sintético termina. Isso valida mecanismos locais, não qualidade editorial real, demanda ou adaptação comprovada a três clientes. Manter rótulo de ensaio sintético e incluir casos negativos que exijam bloqueio.

## Avanços aproveitáveis

- Ficha editorial conectável ao pedido, pacote multiproduto e acompanhamento de esforço.
- Entrada em lote a partir de snapshot e preservação dos validadores existentes.
- Histórico estruturado de passagens e indicação de orçamento por etapa.
- Conciliação determinística como ferramenta auxiliar, sem tratá-la como prova externa.
- Sugestão de vista de imagem por texto/nome e presets de vestuário.
- Recuperação local de exemplos; estilos e interface unificados.

## Supabase: situação verificada e atualização necessária

Projeto: `aqkwbmggkvvfhqaivxlh`, conexão Catana Ops. Foram verificadas seis migrações aplicadas e 13 tabelas no schema `catanaops`, todas com RLS habilitada. `public` sem tabelas não significa banco vazio. Funções remotas encontradas: `catanaops_dashboard`, `catanaops_workflow`, `bind_confirmed_operator`, `claim_task`, `finish_task`.

A função `public.catanaops_operation`, chamada por `src/remote-operations.ts`, não existe no banco consultado. A tabela `operation_snapshots` também está ausente. O SQL preparatório está em `schemas/supabase-brazil-operations.sql`, já presente na base anterior. Os sete novos commits não acrescentam migrações SQL.

Os registros editoriais, revisões, perfis, pacotes e aprendizado continuam SQLite. Não basta criar tabelas com nomes iguais: os caminhos de escrita/leitura e o executor precisam usar o mesmo contrato remoto e arquivos privados. Não foi feito teste autenticado de escrita remota nesta revisão.

### Ordem recomendada

1. Corrigir compatibilidade de fichas, aprovações, evidência de importação, custos e idempotência; adicionar regressões negativas.
2. Validar a ponte SQL existente em ambiente isolado, incluindo permissões, conflito de versão, lease expirado, usuário sem vínculo e isolamento entre workspaces. Revisar Storage e permissões antes de aplicação remota.
3. Aplicar migração aditiva versionada de `operation_snapshots`/RPC, com política restrita a validação. Registrar migração e testar leitura/escrita autenticadas.
4. Definir persistência editorial remota: perfil versionado, vínculo pedido/ficha/revisão, manifesto e pacote privado; distinguir dados locais históricos de registros migrados.
5. Integrar executor ao mesmo pedido, com lease, identidade idempotente, retomada e rastreabilidade das passagens. Não misturar filas locais/remotas no painel.
6. Validar ciclo sintético remoto completo, alteração que invalida aprovação, falha/reinício e isolamento. Só depois anunciar acompanhamento integrado.

Nenhuma atualização remota foi aplicada. O próximo passo técnico recomendado é corrigir os bloqueadores locais antes de migrar estados que hoje podem declarar verificações inexistentes. A geração editorial com API continua adiada conforme instrução anterior.
