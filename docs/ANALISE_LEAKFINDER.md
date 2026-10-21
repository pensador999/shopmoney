# LeakFinder e Catana Ops — análise técnica e de aproveitamento

Atualização posterior: a integração local seletiva foi autorizada e implementada; consultar [INTEGRACAO_LEAKFINDER.md](INTEGRACAO_LEAKFINDER.md). Este documento preserva o diagnóstico anterior do repositório de origem.

Data: 19/10/2026. Repositório: pensador999/leakfinder-saas. Snapshot analisado: 34874334726717c4ff3eb5472cef4145e3897a86, commit de 19/10/2026 às 19:53:41 UTC. Uso como referência autorizado pelo proprietário nesta conversa.

## Conclusão

O LeakFinder pode fornecer a camada de coleta e diagnóstico público que ainda exige trabalho manual na Catana Ops. A recomendação é incorporar componentes selecionados por adaptador, depois de corrigir as regras de evidência; não fundir os dois aplicativos, não trocar o executor e não ativar operação comercial.

O ativo mais útil é a estrutura para transformar páginas e catálogos públicos em observações por produto/variante. As maiores limitações são dados substituídos por valores presumidos, confiança sem verificação independente e fronteiras pouco claras entre simulação e execução. Nenhuma vantagem comercial ou economia anunciada no projeto foi comprovada por esta análise.

## Método e limites

- Consulta autenticada ao GitHub e leitura direcionada de código, contratos, scripts e documentação do commit fixado. A árvore contém 249 arquivos em src; não houve revisão exaustiva de todos eles.
- Cópias dos módulos necessários preservadas sem alterações em ../../analyses/leakfinder-3487433/source.
- Execução isolada da suíte original de variantes: 26/26 cenários aprovados.
- Dois harnesses adicionais com fixtures sintéticas: dois comportamentos positivos e quinze contraexemplos reproduzidos em módulos selecionados.
- Zero chamadas de rede nos harnesses; nenhum modelo, banco, loja, conta de anúncios ou serviço pago acionado.
- Não foi realizado clone completo, instalação, build completo, teste de navegador do LeakFinder ou auditoria de segurança. A inspeção de código não comprova funcionamento de todas as integrações em produção.
- Resultados: ../../analyses/leakfinder-3487433/probes.json e deep-probes.json. Asserções dos harnesses esperam os comportamentos observados; sua aprovação reproduz os problemas, não certifica correção funcional.

## Componentes e decisão

| Componente | Valor para Catana Ops | Decisão |
| --- | --- | --- |
| siteInspector e catalog-proxy | Coleta pública, paginação, coleções, normalização e indicação de cobertura parcial | Adaptar com escopo, tempo limite, origem e permissões explícitas |
| deepSkuAuditEngine | Leitura por variante, identificação de tamanho em opções e análise de grade | Reutilizar somente após eliminar substituições e regras específicas de lojas |
| API audit com Puppeteer | Há código real de navegação e screenshot | Validar captura local separadamente; não confundir com gerador visual sintético |
| Contrato swarmAgentContract | Conceito de fonte, evidência e resultado estruturado | Traduzir para contratos Zod da Catana; interface TypeScript não valida payload em runtime |
| Snapshots e memória por loja | Comparação de catálogo e mudanças entre coletas | Isolar por workspace/cliente e registrar snapshots reais |
| Fila de coleta adaptativa | Limite de concorrência, timeout e retries | Aproveitar controle de carga; não adotar contorno de bloqueios |
| Perfis de vertical | Vocabulário e procedimentos especializados | Converter em perfil aprovado por cliente, sem presumir ERP ou fabricação |
| UI React/Vite e autenticação/pagamentos | Aplicativo próprio, com arquitetura distinta da Catana atual | Não migrar agora |
| MCP e consenso | Há definições e funções, mas partes retornam resultados fixos | Não habilitar sem ligar a execução real e validar evidências |
| Aprendizado e métricas comerciais | Mistura agregação real, valores iniciais e fórmulas de pontuação | Não importar como precisão medida, receita ou regra automaticamente promovida |

O scanner principal usa deepSkuAuditEngine. Os problemas do extrator universal não devem ser atribuídos automaticamente a esse caminho.

## Evidências positivas verificadas

1. No motor principal, uma variante Azul/M com tamanho na segunda opção foi reconhecida como M.
2. O mesmo motor não atribuiu gasto de anúncio quando isAdRunning não foi confirmado.
3. A API de auditoria contém navegação e captura de screenshot reais; o funcionamento completo não foi executado nesta análise.

Fontes: [motor principal](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/src/services/catalog/deepSkuAuditEngine.ts#L143), [navegação](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/api/audit.ts#L223), [captura real](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/api/audit.ts#L420).

## Correções obrigatórias antes de aproveitar

### Caminho principal de variantes

- Preço ausente ou zero torna-se 169.90. Ausente deve permanecer desconhecido; zero exige regra explícita, nunca preço inventado.
- SKU ausente recebe SKU-v1. Um identificador técnico de observação deve ficar separado do SKU comercial.
- Duas variantes distintas com o mesmo SKU resultaram em uma variante auditada. Preservar ambas e registrar colisão.
- Origem de fabricação ausente torna-se FABRICACAO_PROPRIA, com sugestão de OP no Bling. Classificar como desconhecida e perguntar ao cliente.
- Disponibilidade pública não equivale a quantidade física, estoque no ERP, demanda ou prioridade de reposição.

Fontes: [deduplicação e substituições](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/src/services/catalog/deepSkuAuditEngine.ts#L218), [classificação presumida](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/src/services/catalog/deepSkuAuditEngine.ts#L95).

### Extrator universal separado

Seis contraexemplos: disponibilidade ausente interpretada como ruptura; perda fixa de R$1.250 sem vendas/anúncios; falha na opção composta cor/tamanho; palavra LINHA isentando camiseta; um SKU FULL isentando produto inteiro; confiança 99% sem variantes. Esse módulo exige correção mesmo com os 26 cenários originais aprovados.

### Verificação e apresentação

- TruthAuditor aprovou URL example.invalid como página ativa sem fazer HTTP: verificou formato e declarou zero 404.
- O handler MCP audit_store_url declarou sucesso e grounding 100 sem inspecionar a URL.
- O helper playwrightEvidenceCapture produziu coordenadas fixas e endereço mockScreenshot sem captura. Isso não invalida a implementação real de screenshot em api/audit.ts; são caminhos diferentes.
- O avaliador de copy sugeriu urgência e últimas unidades sem dados que as sustentem.
- O gate de consenso constrói propositor/revisor na mesma função com votos e confianças definidos no código. Não constitui, por si, conferência independente por dois modelos.

Fontes: [auditor](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/src/services/orchestrator/truthAuditorAgent.ts#L52), [MCP](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/mcp/leakfinder-mcp-server.ts#L85), [helper visual](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/src/services/vision/playwrightEvidenceCapture.ts#L91), [copy](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/src/services/copyNLPInspector.ts#L1), [consenso](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/src/services/ai/dualAgentConsensusGatekeeper.ts#L1).

### Custos, IA e aprendizado

- Há IA Gemini opcional, com chave própria; sem chave, caminhos retornam heurísticas. Não são necessariamente dezoito agentes autônomos persistentes.
- A orquestração paralela usa hipóteses fixas de pedidos, gasto e tamanhos em partes dos cálculos. Não apresentar esses valores como dados do cliente.
- Há perfis com 412 ciclos e 98.6% de acurácia iniciais fixos. A fórmula de maturidade de outro módulo parte de 86 e adiciona bônus. Nenhum desses números foi validado como precisão medida.
- O histórico pode gerar um primeiro registro a partir do diagnóstico atual e perda estimada; uma única captura não comprova melhoria antes/depois.
- O plano AdShield traz preços, margem, CAC e LTV propostos; não são resultados financeiros comprovados.
- A Catana continua com executor serial, orçamento zero, aprendizado por cliente e promoção de regra aprovada pelo operador. Não adicionar Gemini pago nem compartilhar contexto proprietário entre clientes.

Fontes: [LLM](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/src/services/llmService.ts#L1), [orquestração](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/src/services/orchestrator/parallelAgentSwarm.ts#L79), [perfil de aprendizado](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/src/services/learning/agenticSelfLearningOptimizer.ts#L44), [histórico](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/src/services/history/storeAuditHistoryService.ts#L172), [plano de negócio](https://github.com/pensador999/leakfinder-saas/blob/34874334726717c4ff3eb5472cef4145e3897a86/docs/BUSINESS_PLAN_ADSHIELD_SAAS.md#L65).

## Arquitetura recomendada

Coleta pública limitada → snapshot com fontes → diagnóstico revisado → serviço delimitado → produção Catana → QA independente → nova captura e comparação.

Preservar os oito papéis:

- Pesquisa: acionar coletor e confirmar aderência ao ICP, sem presumir necessidade contratada.
- Comercial: recomendar o menor serviço suficiente a partir de evidências revisadas.
- Atendimento: pedir informações privadas ausentes e autorização dos materiais.
- Planejamento: aprovar mapeamento, perfil, fatos e critérios de aceite.
- Produção: usar transformações e conteúdo da Catana, sem transformar dados públicos inferidos em cadastro.
- Qualidade: comparar fonte e resultado, com poder de bloquear.
- Financeiro: calcular contribuição com custos e horas reais; scanner não calcula receita perdida como fato.
- Coordenação: controlar revisão, idempotência, fila serial e exceções.

Fronteira técnica proposta: um núcleo de diagnóstico extraído, atrás de adaptador tipado. Cada observação terá workspace, cliente, pedido/revisão quando aplicável, URL, instante de coleta, método, caminho JSON/seletor, valor capturado, hash do snapshot, cobertura e categoria: observado, hipótese, simulação parametrizada ou requer dado interno. Valores ausentes serão null/não verificado. Dados de coleta não executarão instruções administrativas.

A Catana mantém SQLite/Supabase, políticas, isolamento, handoffs e executor atuais. O adaptador não poderá modificar loja, enviar contato, abrir OP, pausar anúncio ou cobrar. Evitar dependência direta entre os dois frontends.

## Sequência proposta, ainda não implementada

1. Definir contrato de observação e matriz de cobertura; impedir diagnóstico conclusivo com coleta insuficiente.
2. Extrair leitura de catálogo e corrigir os casos reproduzidos; separar regras universais de perfis aprovados.
3. Conectar coleta ao diagnóstico Catana, inicialmente somente leitura e revisão humana.
4. Testar uma amostra pequena autorizada e fixtures de roupa adulta, infantil, kit, opções invertidas, SKU duplicado, estoque desconhecido e cancelamento.
5. Registrar entrega, tempo, falsos positivos e custo; comparar duas capturas reais antes de oferecer monitoramento recorrente.
6. Só então avaliar interface adicional, captura visual e recorrência.

## Efeito sobre o negócio

Manter ICP brasileiro de vestuário e oferta modular vigente. O diagnóstico de R$190 pode ficar mais fundamentado; valor e margem continuam hipóteses até entrega paga. A combinação potencial é diagnóstico rastreável mais correção utilizável e QA, não um score ou promessa de recuperar receita.

Reposição exige dados internos de vendas líquidas, disponibilidade, estoque, pedidos em trânsito e lead time. Página esgotada isolada não comprova alta procura. Monitoramento recorrente pode ser evolução após validação; não criar assinatura nova nem reprecificar automaticamente.

## Estado ao encerrar

Análise e testes isolados concluídos. Nenhuma integração, migração, alteração no LeakFinder, publicação, envio comercial, cobrança, importação ou gasto realizado. Próxima etapa técnica sugerida: contrato de observação e correção dos parsers antes de qualquer conexão.
