# LeakFinder adaptado à Catana Ops

Atualização de campo: [TESTE_CAMPO_LEAKFINDER_INSIDER.md](TESTE_CAMPO_LEAKFINDER_INSIDER.md). Coleta real de uma peça/69 variantes concluída, seleção por produto incorporada e suíte ampliada para 77 testes aprovados. Os resultados sintéticos abaixo permanecem como histórico.

Implementação local de 19/10/2026. Origem fixada em pensador999/leakfinder-saas, commit 34874334726717c4ff3eb5472cef4145e3897a86. A análise anterior continua em ANALISE_LEAKFINDER.md; este documento registra a integração posterior.

## O que foi baixado

Cinco arquivos úteis: coleta pública, motor de variantes, fila de coleta, contrato de evidências e memória por loja. Originais preservados como referências .txt, fora do runtime, em references/leakfinder. manifest.json registra hashes, tamanho e commit. Não foi baixado ou instalado o SaaS completo.

A adaptação reimplementa os conceitos úteis com dependências já existentes. Não executa os pseudoauditores, MCP com resposta fixa, métricas presumidas, Gemini, anúncios, ERP ou autoaprendizado do projeto original.

## Estrutura e fluxo

| Arquivo | Responsabilidade |
| --- | --- |
| src/inspection/snapshot.ts | Contratos Zod, hashes canônicos, fontes, escopo e validação do JSON |
| src/inspection/collector.ts | HTTPS somente leitura, origem aprovada, resolução pública fixada à conexão, coleta serial, limites, timeout, retry e checkpoint |
| src/inspection/catalog-audit.ts | Produtos/variantes, observações com JSON pointer, QA estrutural e comparação temporal |
| src/inspection/evidence.ts | Persistência local imutável por workspace/cliente, revisão do operador e vínculo à revisão do pedido |
| src/inspection/bridge.ts | Entrada supervisionada no serviço de diagnóstico, idempotente e transacional |
| src/service-editorial.ts | Pacote existente ampliado com fontes, análise técnica e revisão; bloqueia anexo incompatível |
| src/coordination.ts | Resumo verificado e limitado para o papel consultivo responsável, sem corpos das páginas |
| src/simulate-inspection.ts | Ensaio reproduzível e isolado, sem rede ou IA |

Fluxo: origem aprovada → coleta/snapshot → observações → revisão humana → pedido demonstrativo de diagnóstico → aprovação de escopo → confirmação simulada → conferência → ZIP em estado ready. O componente não aprova escopo, não cobra e não envia a entrega por conta própria.

## Regras corrigidas

- Ausente permanece desconhecido. Disponibilidade omitida não vira ruptura.
- SKU e EAN são texto; zeros à esquerda preservados. Identificador técnico de observação não é SKU.
- Preço zero permanece zero; preço ausente não recebe 169.90 nem outra hipótese. Moeda dos produtos não é inferida da oferta BRL.
- Variantes com o mesmo SKU são preservadas e a colisão é registrada.
- LINHA e FULL não isentam automaticamente produto ou variantes.
- Tamanho segue nome/posição da opção e perfil versionado revisado; sem grade M/G universal.
- Indisponibilidade pública não comprova demanda, fabricação própria, ERP, estoque físico ou prioridade de reposição.
- Imagens ficam como metadados/referências, com observação de alt explicitamente vazio quando disponível. Não há download, edição ou julgamento visual.
- Evidência inclui página, instante, JSON pointer, valor e hash do corpo original.
- Categorias: observado, hipótese e requer informação interna. O motor atual não gera projeções financeiras ou pontuações de confiança.
- Comparação exige duas capturas cronológicas, mesma origem e mesmo escopo. Compara variantes identificáveis na interseção; ausência em amostra não é remoção ou venda.

## Limites e segurança da coleta

Somente endpoints /products.json e /products/<handle>.json de origem HTTPS explicitamente aprovada. Seleção direcionada aceita até cinco handles válidos e distintos, mantendo cobertura amostral. Sem credenciais, portas customizadas, redirects ou destinos locais/privados. O endereço DNS validado é fixado à conexão TLS; não há segunda resolução implícita para escolher outro destino.

Até cinco páginas tecnicamente permitidas, padrão três, cinco produtos por página, no máximo dez pais na análise; limite de 2MB por resposta e dez segundos por requisição. Coleta serial, até duas tentativas para 429/503. Retry-After longo gera pausa, não espera indefinida nem contorno do bloqueio.

Falha antes da primeira página não cria sucesso fictício. Falha posterior retorna snapshot interrupted para persistência e retomada pelo chamador. O ensaio demonstra salvar checkpoint em arquivo; ainda não há um daemon de coleta agendado. endpoint-complete significa fim observado desse endpoint público, não catálogo administrativo inteiro ou toda a loja auditada.

## Persistência e revisão

Tabela SQLite catalog_inspections é criada somente quando a integração é utilizada; não há migração ou escrita Supabase neste incremento. Chave composta: workspace_id/client_id/snapshot_id. Acesso requer os dois escopos.

Um snapshot possui uma análise/perfil/revisão humana imutáveis nesta versão. Outro perfil ou revisão exige nova captura. O pedido tem identidade derivada do escopo, snapshot e perfil; reinício não cria outro pedido. Snapshot, pedido e anexos são gravados na mesma transação; falha ao anexar desfaz a criação.

Pedidos gerados pela ponte são sempre demo. A revisão humana registrada por API local é evidência administrativa do operador; não é assinatura digital ou decisão autônoma do modelo.

Mudança de revisão do pedido invalida aprovação e QA. Anexo da revisão antiga não libera produção na nova; a interface genérica de revisão não reconecta automaticamente uma inspeção. A revisão supervisionada dessa ligação é evolução pendente, e o bloqueio está testado.

## Agentes

Mantidos oito papéis e executor serial. Pesquisa, Planejamento, Produção e Qualidade receberam orientações MD específicas.

orderAgentRequest verifica o anexo e fornece contagens, categorias, códigos, fontes, modo e cobertura. Não transfere HTML, linhas completas, outros clientes ou todo o histórico. Falha de verificação aparece como blocked. IA não recebe ferramenta nova de navegação nem pode declarar visita, screenshot ou coleta própria.

O QA confere campos protegidos diretamente contra o JSON e verifica consistência do relatório com regras versionadas. Parte das verificações usa o mesmo analisador; não deve ser apresentado como auditoria semântica independente completa. Revisão humana, testes de regressão e validação visual continuam distintos.

## Como repetir a validação

Na raiz do projeto:

    npm run test:inspection
    npm run demo:inspection
    npm run typecheck

A demonstração cria diretório próprio artifacts/leakfinder-fit-<instante>, SQLite isolado, checkpoint, snapshots, análise, comparação, ZIP e relatório. Não carrega .env, não inicia runtime, email, modelo ou processador financeiro.

Para uso programático, collectCatalog exige origin, approvedOrigin, scope e mode. synthetic exige transporte fixture explícito e não usa rede por padrão. public-readonly usa transporte HTTPS real, validado posteriormente no teste de campo. collectProductPages aceita seleção de até cinco peças. AnalyzeSnapshot também aceita snapshots de arquivos fornecidos pelo operador. Regras atuais: catana-catalog-audit-2, com leitor QA compatível com versão 1.

Depois de revisão, createInspectionDiagnostic recebe scope, snapshot, profile e review. O cliente deve existir no Store. Aprovação do escopo e simulação continuam comandos separados do Service.

## Resultado executado

- 19 testes novos cobrem normalização, opções infantis, colisões, desconhecidos, adulteração, coleta/429/cancelamento, limites, retomada, comparação, isolamento, idempotência, rollback e resumo consultivo.
- TypeScript aprovado e suíte final 73/73 aprovada, incluindo os dois testes HTTP locais executados com a permissão adequada. Log: artifacts/leakfinder-full-tests-final.txt.
- Simulação artifacts/leakfinder-fit-1792456710304: seis pais, doze variantes, 21 observações, dez verificações de encaixe, pacote gerado e zero chamadas de rede/IA.
- O briefing resume até 19 observações e uma nota de cobertura; todas as observações geradas ficam no anexo técnico, limitado a 200. Exceder o limite não é alegação de auditoria completa.
- Receita real R$0. Nenhuma importação, envio, cobrança, publicação ou custo externo.

Consulte RETOMADA.md para os resultados finais da suíte e seus logs. Os ensaios não equivalem a validação de loja real ou avaliação semântica de oito chamadas IA.

## Próximos limites conhecidos

Não foram conectados formulário de inspeção no painel, fila de coleta ao Eve, armazenamento remoto ou captura visual em navegador. Não há crawl genérico, auditoria de checkout/SEO técnico, ligação a estoque privado, reposição ou envio automático. Essas capacidades não devem ser anunciadas como operacionais a partir desta integração.
