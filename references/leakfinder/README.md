# Origem e limites das referências LeakFinder

Repositório do titular: https://github.com/pensador999/leakfinder-saas
Commit fixado: 34874334726717c4ff3eb5472cef4145e3897a86, de 19/10/2026.
Autorização: solicitação expressa do proprietário para baixar componentes úteis e adaptar à Catana Ops.

Foram baixados somente cinco arquivos próprios úteis como referência:

- api/catalog-proxy.ts: coleta de catálogo público.
- src/services/catalog/deepSkuAuditEngine.ts: estrutura de variantes.
- src/services/crawler/adaptiveCrawlerQueue.ts: cadência, timeout e retomada.
- src/types/swarmAgentContract.ts: contrato de evidências.
- src/services/memory/storeContextMemory.ts: snapshots e comparação temporal.

As cópias usam extensão .txt e NÃO são importadas nem executadas. Podem conter comportamentos problemáticos identificados na análise; não são componentes homologados. Quebras de linha foram normalizadas e os hashes dos arquivos locais estão em manifest.json.

A implementação adaptada e testada está em src/inspection e usa apenas dependências já existentes. Não foram baixados o aplicativo completo, credenciais, ativos de lojas, dependências, proxies, módulos de pagamento, Gemini, pseudoauditores, autopatches ou infraestrutura.

Conceitos aproveitados: coleta somente leitura, leitura por variante, evidência com caminho de origem, cobertura explícita e snapshots. Reescritas necessárias: desconhecido permanece null, preço zero preservado, SKU/EAN textual, variantes duplicadas mantidas, sem fabricação/ERP/receita presumidos, sem confiança ou aprendizado fictício, sem promoção automática de regras.
