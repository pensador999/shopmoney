# Teste prático com referência pública — 19/10/2026

## Seleção e ICP

Referência escolhida: [DUAS Design](https://duasdesign.com/), loja de moda de Recife identificada pela [Shopify](https://www.shopify.com/br/blog/lojas-virtuais-shopify). A vitrine apresenta variações de modelos, materiais e estampas; a [página de uma bolsa](https://duasdesign.com/products/bolsa-isa) permite observar opção de cor. São observações públicas, não diagnóstico de erros internos ou prova de necessidade de contratar.

Comparação exploratória: Minimal Club também apareceu na pesquisa, mas não foi aprofundada. DUAS foi escolhida pela diversidade estrutural visível e pela evidência primária Shopify. Não foi estimado porte, faturamento ou orçamento de nenhuma marca.

ICP comercial principal continua sendo agência com operação recorrente Shopify. DUAS é lojista e serve como referência técnica/hipótese de segmento secundário; não é agência, cliente, prospect qualificado ou parceiro. Frequência de lotes, necessidade, responsável, disponibilidade de dados e intenção de compra são desconhecidos. Não cadastrar como lead confirmado nem enviar abordagem sem autorização.

## Execução e limites

A pesquisa na internet foi realizada neste chat; o papel research do Eve analisou as evidências fornecidas, pois não tem navegação ou ferramentas. Demais papéis também são consultivos. O roteiro, representando operador/código, conduziu as transições. Não houve handoff autônomo comprovado.

Roteiro reproduzível: `node src/simulate-public-case.ts` usa respostas controladas; `--live` usa Eve local e cota da autenticação existente. Uma execução real completa consumiu oito chamadas e dois retestes pontuais de atendimento; não executar em loop. Primeira tentativa real com serviço desligado ficou pausada, não conta como sucesso.

Catálogo inteiramente sintético: dois pais, cinco variantes, duas opções, identificadores com zeros, CSV UTF-8 BOM com ponto-e-vírgula e preço com vírgula. Nenhum nome, SKU, GTIN, preço, descrição ou imagem da marca foi usado na entrega. URLs de mídia são fictícias e não foram baixadas. Moeda BRL dos produtos é premissa da fixture; serviço USD não significa conversão automática.

Nove verificações técnicas passaram: bloqueio por preço ausente; revisão explícita preservando original; produção bloqueada sem pagamento; retomada após reabrir banco; contagens/zeros/decimal; QA detectando adulteração; reexecução sem duplicar entrega; encerramento sem aceite presumido; outbox somente rascunho. Pagamento, aprovação e transporte de entrega são simulados. Nenhuma importação em loja, contato, cobrança ou receita real.

## Resultado por função

| Papel | Resultado observado | Avaliação |
|---|---|---|
| Pesquisa | Reconheceu referência pública, não agência/lead validado | Adequado para qualificação assistida; não realizou pesquisa sozinho |
| Comercial | Não inventou intenção de compra ou autorização | Adequado; próximo contato depende de descoberta real |
| Atendimento | Inicialmente genérico; faltavam erros estruturais no contexto | Corrigido contexto; reteste apontou campo price/linha2 |
| Planejamento | Pediu regras internas e moeda de destino | Cauteloso; precisa separar lacunas do cliente de premissas aprovadas na fixture |
| Financeiro | Não confirmou dinheiro a partir de awaiting_payment ou simulação | Adequado; custos e margem continuam desconhecidos |
| Produção | Código gerou CSV/ZIP; IA pediu evidência adicional | Código aprovado; resposta ainda não é aceite operacional |
| Qualidade | Reconheceu QA por código e separou importação Shopify | Adequado; loja real não testada |
| Coordenação | Reconheceu limites e pediu pendências reais | Ainda repete requisitos gerais; precisa próxima ação especializada |

## Correções feitas a partir do teste

1. Contexto automático dos pedidos agora inclui até dez erros estruturais. Versão de contexto empresarial alterada para invalidar análises antigas.
2. Mensagem de preço inválido respeita o separador decimal aprovado. Antes pedia ponto mesmo em perfil com vírgula; teste de regressão adicionado.
3. Reteste final do atendimento solicitou somente corrigir price na linha2, com vírgula e sem símbolo/separador de milhar.
4. Aba Fluxo de trabalho mostra o último ensaio em seção separada da fila Supabase, com respostas e reteste. Não cria pedido remoto ficticiamente nem mistura contagens.

Validação após correções: TypeScript aprovado e 34 testes locais aprovados. Isso não equivale a implantação ou validação comercial.

## Arquivos e próximos passos

Evidência completa: `artifacts/public-case-1792381995156/RESULTADO.md`, `report.json`, `delivery.zip`, `support-recheck.json` (erro de orientação identificado) e `support-recheck-final.json` (orientação corrigida). Arquivos locais ignorados no Git. A UI usa `artifacts/public-case-summary.json`, resumo sem credenciais ou dados de clientes.

Falta para operação integrada: regras/saídas especializadas entre papéis, roteamento correto de atendimento/comercial, escrita remota, arquivos privados e executor consumindo o mesmo pedido. Para um teste realmente contratado, obter arquivo autorizado e requisitos do comprador, definir responsabilidade de importação e validar pagamento/Shopify. Uma vitrine pública não substitui esses dados.

Receita real: zero. Margem: desconhecida. A entrega de teste não deve ser importada na loja DUAS. Nenhuma autorização da marca foi presumida.
