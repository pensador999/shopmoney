# Teste de campo dos componentes LeakFinder — vestuário

Data: 19/10/2026. Coleta pública real, sem login, contato ou escrita na loja.

## Resultado

Concluído o fluxo coleta HTTPS real → snapshot → análise → conferência contra a fonte → pedido local demonstrativo → escopo/financeiro simulados → ZIP → resumo consultivo para agentes.

Referência técnica: [Tech T-Shirt da Insider](https://www.insiderstore.com.br/products/tech-t-shirt), acessada a partir de produto publicado na vitrine. É uma empresa maior que o ICP comercial inicial da Catana; foi escolhida para exercitar variantes, não qualificada como cliente ou necessidade comercial.

| Item | Resultado observado |
| --- | --- |
| Produto pai | 1 |
| Variantes cor/tamanho | 69, todas preservadas |
| Tamanhos | PP, P, M, G, GG, XGG e XXGG |
| SKU | Ordem e valores preservados nas 69 variantes |
| Preços | Valores preservados em formato decimal; fonte informa BRL |
| Imagens | 177 referências/metadados; nenhum arquivo de imagem baixado |
| Disponibilidade | Desconhecida nas 69 variantes: campo não retornado nessa fonte |
| QA | Sem divergência estrutural contra o JSON original |
| Pendência resumida | Um aviso de disponibilidade desconhecida para o produto |
| Integração | Pedido local em ready e ZIP com seis arquivos |
| Contexto de agentes | Resumo verificado, sem corpo HTML transferido |
| IA/modelos | Zero chamadas neste teste |
| Receita/envios/escritas na loja | Zero |

O conjunto de tamanhos também foi conferido na página pública. A página tem descrição, características, FAQ e orientação de medidas; o teste não fundamenta recomendar reescrita genérica. Não foram validadas as alegações técnicas da marca.

## Evidências locais finais

Diretório: artifacts/field-inspection-1792458588293.

- snapshot.json: resposta original, hash, instante, origem e escopo.
- audit.json: observações e todas as variantes na versão catana-catalog-audit-2.
- source-crosscheck.json: comparação de quantidade, SKU, preço e disponibilidade contra a fonte.
- agent-context.json: contexto reduzido do papel responsável; não é resposta real de IA.
- field.sqlite: pedido e evidências isolados do banco operacional.
- result.json: etapas e limites do ensaio.
- diagnostico-campo.zip: diagnostico.json, inspecao-tecnica.json, fontes-inspecao.json, revisao-operador.json, manifest.json e LEIA-ME.txt.

Pedido: 9089ec22-026d-4c48-83e8-a8e00ba9623e.
Snapshot: 295fa09540f668d674abadf6f2c558d51bd4269e807a7e4816f5c0c3ce325232.

Review do pacote identifica codex-field-test e declara expressamente revisão técnica do assistente para teste. Não representa aprovação humana, autorização do lojista, contratação ou aceite comercial. A confirmação financeira é DEMO-NO-MONEY e a mensagem permanece rascunho.

## O que o campo revelou e o que foi ajustado

1. A amostra inicial da DUAS tinha dez produtos, nove acessórios e uma peça com variante única. Conexão real funcionou, mas a seleção não exercitava grades. Diretório preliminar: artifacts/field-inspection-1792458376300.
2. Na Insider, as duas primeiras páginas também retornaram principalmente kits promocionais e um item auxiliar, todos com variante única. Diretório preliminar: artifacts/field-inspection-1792458398475. Não tratar ausência de SKU em kit público como cadastro interno incorreto.
3. Acrescentado collectProductPages para até cinco handles explicitamente selecionados da vitrine, sem varrer o catálogo. Usa /products/<handle>.json e não o .js com convenção de preço em centavos.
4. O parser aceita esse envelope product e preserva JSON pointers /product/variants/<índice>. Uma resposta de produto diferente do solicitado é bloqueada.
5. A fonte do produto selecionado não retorna available. O sistema manteve null e não classificou nenhuma variante como esgotada. A afirmação geral de envio imediato na página não resolve disponibilidade individual de 69 variantes.
6. Agrupadas pendências repetidas de disponibilidade por produto, conservando os dados completos de cada variante e até cinco evidências representativas. Não apresentar 69 campos desconhecidos como 69 defeitos comerciais.
7. Regras novas versionadas como catana-catalog-audit-2. QA mantém leitor de catana-catalog-audit-1; conferência do arquivo histórico artifacts/leakfinder-fit-1792456710304/audit.json continuou sem erros.

Também foi verificado que um parâmetro handle no endpoint geral é ignorado pela loja: a seleção só é considerada válida quando a resposta contém exatamente o handle esperado. Não houve contorno de autenticação ou bloqueios.

## Validação

- Quatro testes novos para produto direcionado, contrato de resposta, agrupamento e compatibilidade histórica.
- Suíte final: 77/77 aprovados, incluindo HTTP local com permissão apropriada.
- TypeScript aprovado.
- Log: artifacts/field-inspection-tests.txt.
- Comparação com fonte: todas as variantes, SKUs e preços conservados; nenhum falso esgotamento.
- Segunda execução da produção bloqueada; um rascunho de entrega e nenhum envio.

A tentativa inicial no sandbox falhou por DNS; o mesmo coletor foi executado com permissão de rede e acesso HTTPS direto. Não se substituiu a coleta por fixtures ou resultado do navegador.

## Reprodução

    node scripts/field-inspection.ts collect https://www.insiderstore.com.br tech-t-shirt

Após examinar o snapshot e o relatório, a etapa demonstrativa separada é:

    node scripts/field-inspection.ts rehearse artifacts/field-inspection-<instante>

Sem handles, collect mantém a coleta inicial limitada do catálogo. O ensaio não carrega .env nem inicia rotina de envio, cobrança ou IA.

## Conclusão operacional

Os novos componentes funcionaram com dados públicos reais de vestuário e chegaram ao serviço de diagnóstico local. O principal ganho comprovado foi preservar variantes e reconhecer limites da evidência sem inventar problemas.

Não há prova de demanda comercial, margem, importação Shopify ou autonomia dos oito agentes. O teste não justifica vender correção para a Insider. Próximos avanços úteis: seleção assistida de amostra no painel e, se o serviço exigir estoque, fonte adequada de disponibilidade por variante com contrato validado. Reposição ainda exige histórico e dados internos apropriados.
