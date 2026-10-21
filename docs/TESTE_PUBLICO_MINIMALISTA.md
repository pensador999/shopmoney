# Ensaio de campo — MiniMalista Baby

19/10/2026. Pesquisa pública real + diagnóstico por código + fluxo sintético. A loja não participou: não houve contratação, contato, autorização de acesso ou importação. Não é validação comercial nem atendimento de cliente real.

## Seleção e achados

Shopify lista MiniMalista entre lojas brasileiras. Home apresenta vestuário infantil, novidades e conjuntos; página amostrada tem opções por idade. Isso demonstra aderência técnica, não confirma porte, esforço manual, próximo lote, orçamento ou intenção de contratar.

1. **Preservar o que já existe:** a página individual consultada tem descrição estruturada, dados técnicos e tabela de medidas. Não há motivo demonstrado para vender reescrita integral. Não sabemos quem escreveu o texto.
2. **Frete:** extração da home apresenta R$299 no topo e R$500 no rodapé. Confirmar condições e página atual; não presumir a regra efetiva do checkout.
3. **Título versus descrição:** na versão extraída do conjunto, o título e o tema descrito não correspondem. Página indexada há seis dias; pode ser edição recente/cache. Conferir com o responsável antes de corrigir.
4. **Kits:** precisamos saber se há SKU/estoque próprio ou composição por peças. O fluxo atual não implementa estoque de componentes. Não vender integração de kits nem reposição com base na vitrine.

Fontes primárias:

- https://www.shopify.com/br/blog/lojas-virtuais-shopify
- https://minimalistashop.com.br/
- https://minimalistashop.com.br/products/body-de-bebe-manga-curta-unissex-bolinhas-claro
- https://minimalistashop.com.br/products/conjunto-bebe-unissex-calca-body-curto-babador-racer-beige-e-beige

Saint Studio foi descartada como referência Shopify nesta pesquisa: a página consultada apresenta tecnologia JET. Não inferir plataforma por segmento ou aparência.

## Execução verificável

Script src/simulate-field-case.ts. Resultado: artifacts/field-minimalista-1792384728855/RESULTADO.md, relatório estruturado, SQLite e três ZIPs. Doze verificações passaram: diagnóstico com quatro observações, bloqueio de fato não aprovado, alegação proibida, preço ausente, pagamento pendente, retomada SQLite, seis variantes/zeros/decimal, adulteração, duplicação, reposição sem dados, fila dos oito papéis e ausência de efeitos externos.

O diagnóstico público usa somente observações e fontes resumidas, sem copiar descrições/imagens da loja. Conteúdo e combinado são inteiramente fictícios: dois pais e seis variantes, produtos, identificadores e preços sintéticos. Não aplicar esses pacotes na loja de referência.

**Oito papéis passaram pela fila com respostas controladas. Não houve oito análises reais do modelo.** Tentativa de iniciar Eve falhou ao criar symlink; execução ampliada impedida pela revisão automática indisponível por capacidade do modelo. Não alteramos o framework ou tentamos contornar o revisor. Rodada semântica do Eve fica pendente; o script suporta --live somente quando a execução estiver permitida.

## Melhoria descoberta no sistema

Diagnóstico anterior só representava campos ausentes. Agora aceita observações estruturadas, categoria, evidência e próxima ação; preserva informações presentes e não converte divergência em ausência fictícia. O executor verifica formato/rastreabilidade; não navega nem autentica fatos externos sozinho. Novo teste de regressão verifica saída e bloqueio de observação sem fonte.

Painel 4323 mostra resumo em seção separada da fila. Nenhum pedido desse ensaio foi inserido em banco operacional ou remoto. Parâmetros/insumos ficam no banco isolado do artefato.

## Decisão comercial sugerida

Caso a loja confirme essas necessidades, começar por diagnóstico delimitado de consistência; não oferecer automaticamente pacote de R$990 ou assinatura. Frete fora de escopo de alteração: apenas observação para responsável. Conteúdo/cadastro dependem de materiais autorizados e da regra de kits. R$190 é hipótese de preço, não valor aceito pela loja. Receita R$0, contribuição desconhecida.

Antes de avaliar imagens, precisamos examinar materiais autorizados; nenhuma imagem foi baixada ou editada. Para reposição: histórico por SKU/variante, disponibilidade, estoque, trânsito e prazo. Não inferir procura pelo termo esgotado ou por mensagens simultâneas extraídas do template.

Verificação final: TypeScript e sintaxe JS aprovados; 54 testes executados, 52 aprovados e dois HTTP impedidos por EACCES. Log artifacts/field-case-tests.txt. A suíte não foi integralmente aprovada.
