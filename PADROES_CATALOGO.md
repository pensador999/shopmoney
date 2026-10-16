# Base de formatos — 16/10/2026

## Escopo e procedência

Análise restrita às mudanças de 16/10/2026 (America/Sao_Paulo). HOOK-PRIME: commit `4143898005b83250d45c8e91cad03716e84073ec`. DESCRI-OES-PRODUTOS: ponta consultada `4064bf6c88a61673713f8bb4dcf7bcd38ae9a54f`, comparada ao estado anterior `b12792f`.

Referências atualizadas em `origin/main`; os checkouts antigos não foram sobrescritos. Leitura por objetos Git. Não foram executados scripts desses repositórios, nem reaproveitados registros de catálogo, imagens, pesos, preços, credenciais ou configurações reais. Listas de cabeçalhos são dados de formato; código comercial permanece independente.

## Moldes registrados

| Molde | Evidência | Regra |
|---|---|---|
| Bling 59 | Nove CSVs em `PLANILHAS EXEMPLOS`, cabeçalhos idênticos e na mesma ordem | UTF-8 com BOM, ponto e vírgula, LF observados. É entrada ERP, não arquivo direto do importador nativo Shopify. |
| Sankhya 45 | Array `SANKHYA_HEADERS_45` em `hub/public/js/spreadsheet-gen.js`, alterado hoje | Cabeçalhos registrados; separador de exportação proposto ainda exige confirmação no importador alvo. Sem copiar constantes fiscais. |
| Shopify drafts | Saída do serviço e documentação oficial consultada hoje | UTF-8, vírgulas, CRLF, preço com ponto, identificadores textuais e produto em rascunho. Importação em loja de teste ainda pendente. |
| Medidas | Estrutura do XLSX: três worksheets, células mescladas e rótulos repetidos de tamanho/comprimento/largura/altura/peso | Tabela de referência em blocos; não tratar como CSV de variantes nem inferir unidade só pelo título. Apenas rótulos genéricos e posições preservados; medidas e produtos excluídos. |

Arquivos de base: `schemas/bling-59.json`, `schemas/sankhya-45.json` e `schemas/reference-headers-2026-10-16.json`. `src/formats.ts` expõe esses formatos e o contrato da saída Shopify ao painel. Não são planilhas preenchidas nem demonstração de compatibilidade de importação real.

Fonte Shopify: https://help.shopify.com/en/manual/products/import-export/using-csv

## Regras de transformação implementadas

1. Delimitador e decimal são opções explícitas do perfil/painel. Não detectar por aproximação nem converter moeda. `19,90` pode virar `19.90` sob regra aprovada; separador de milhar ambíguo é rejeitado.
2. Perfil pode exigir correspondência exata da lista e ordem de cabeçalhos. Uma coluna nova exige revisão do molde.
3. Código de pai e de variante permanecem distintos; zeros são preservados.
4. Herança mapeada permite obter o título da descrição do pai em campo próprio, mantendo a descrição original da variante disponível como opção. Não interpretar automaticamente o texto da descrição como tamanho/cor.
5. Somente título, marca e descrição podem ser herdados. Preço, GTIN, estoque e classificação não são preenchidos por suposição.
6. Mídia continua em relatório separado com referência por SKU, sem baixar ou publicar. Descrições HTML existentes não passam a ser aprovadas ou publicadas automaticamente.
7. Prévia retorna somente nomes de colunas e contagem; não devolve amostras dos produtos.

Os nomes de tipos de linha, a interpretação das opções, a moeda e os campos obrigatórios dependem de aprovação por fornecedor. Cabeçalhos sozinhos não demonstram essas regras. O teste usa `parent`/`variant` e itens inteiramente fictícios; não afirma que esses valores existam nos arquivos BRK.

## Inteligência extraída das mudanças de descrições

- `api/product_db.py`: separação de auditoria de galeria/variantes, com indicadores de variante sem mídia, duplicidade e baixa resolução. Cada indicador deve produzir pendência independente; URL por si só não comprova imagem válida.
- `tampermonkey/brk_assistente_shopify.user.js`: versão observada 6.0.0, seleção de lote/coleção, configuração de pausa por mídia e função de espera de salvamento. A pausa não é universal: depende da configuração. Não transportar isso como garantia de bloqueio automático.
- Injeção no editor, tentativa de salvar e confirmação da aplicação são eventos diferentes. No nosso piloto, a agência aplica; a reconciliação no destino permanece pendente até evidência real.
- `core/template_engine.py`, `core/html_builder.py` e validações de conteúdo foram alterados hoje. A organização por tipo de produto deve evitar inserir tabela de vestuário em itens de outras categorias. Dados e textos comerciais das lojas não entram no nosso padrão.
- O teste de coleções inspecionado ainda exige versão 5.2.0 do userscript, enquanto a versão atual é 6.0.0. Há divergência estática; não executamos essa suíte nem a usamos como certificação do fluxo novo.

Esses critérios orientam a próxima etapa de conteúdo/mídia. Não foi conectado controle de navegador ou edição de produtos reais.

## Verificação e próximos gates

27 testes locais aprovados e TypeScript sem erros. O novo teste monta 59 colunas vazias, adiciona somente dados sintéticos, lê ponto e vírgula/BOM, aplica perfil, preserva SKU/GTIN, normaliza preço e gera pacote Shopify. Bloqueia alteração dos cabeçalhos e preço ambíguo. Não usou linhas reais das referências.

Permanecem externos: Shopify de teste com importação e reconciliação, Gmail, Stripe sandbox, receptor público e identidade/termos para venda. A base de formatos está pronta para validação supervisionada; a operação comercial continua desativada.
