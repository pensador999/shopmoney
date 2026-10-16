# Referências BRK — leitura de código em 16/10/2026

Os quatro repositórios foram baixados em `../references/`. Não foram instalados nem executados. Esta é uma leitura estrutural, não uma auditoria completa ou comprovação de funcionamento nas lojas. Nenhuma imagem, catálogo ou configuração de conta foi importada no serviço. O adaptador novo é uma implementação independente das regras explícitas abaixo.

| Repositório | Commit consultado | Evidência e aplicação |
|---|---|---|
| [HOOK-PRIME](https://github.com/pensador999/HOOK-PRIME) | `02a3ce3008d20fcf417093fd1d532d3f7d658eb3` | `hub/public/js/autopilot/products/variation.js` distingue pai e filhos por tamanho. A linha pai tem função no layout Bling, não é uma variante adicional no Shopify. |
| [DATA-SUITE-SANKHYA](https://github.com/pensador999/DATA-SUITE-SANKHYA) | `e00205c7f131f97cdc9c3c2de9c59844c63fa59c` | `pages/1_Formatador_Sankhya.py` importa `core/motor_sankhya.py`. Não confundir com o cruzador antigo `core/cruzador_padrao_ouro.py`. |
| [SCRIPTS-TAMPERMONKEY](https://github.com/pensador999/SCRIPTS-TAMPERMONKEY) | `564e9375ca5ef8384a0664557891c34294e204d5` | README distingue ativos/legados. Aplicação em UI, extração de IDs Shopify e configuração Magis5 são passos diferentes da preparação de arquivos. README não comprova qual versão está instalada hoje. |
| [DESCRI-OES-PRODUTOS](https://github.com/pensador999/DESCRI-OES-PRODUTOS) | `b12792f9feaf1da5cfb8dc47dc8b43a61cbf5f19` | `core/html_replacer.py` mantém um fluxo próprio de alteração de HTML; `core/sibling_matcher.py` usa similaridade de títulos. Conteúdo e sugestão de associação não autorizam mudança de identidade. |

## Fluxo transferível

Originais imutáveis → perfil aprovado do fornecedor → identificação exata de pais e variantes → normalização explícita → validação → arquivo por destino → aplicação autorizada → reconciliação no destino.

- Fabricação/revenda é uma dimensão de negócio separada de pai/variante. Produto fabricado também tem variantes; produto revendido também pode tê-las.
- SKU, EAN, ID de produto Shopify e código interno ERP têm papéis distintos. Não substituir um pelo outro sem contrato de mapeamento.
- Contar variantes efetivamente informadas; não multiplicar automaticamente por gênero, canal ou loja.
- Imagens precisam de identidade, associação e confirmação. Ordem de mídia, hospedagem e direitos pertencem ao perfil e ao escopo; uma referência não comprova disponibilidade.
- Geração de descrição, reparo de HTML e cadastro de produto são serviços separados.
- Núcleo determinístico + perfil por cliente/fornecedor + adaptadores de entrada e saída + execução/reconciliação por destino. Agentes interpretam pendências; código aplica as regras.

## Regras que não foram transferidas

- Estoque 1000, geração de SKU por concatenação, NCM por gênero e preços padrão de HOOK-PRIME.
- Valores fiscais, dimensões, marca e classificação por grupos BRK no DATA-SUITE. O motor inclui exceções de revenda em grupos de fabricação; copiar somente o prefixo perderia essa complexidade.
- Remoção de zeros à esquerda em `_limpar_chave_match` do cruzador antigo.
- Similaridade de título para aprovar automaticamente associação de produtos ou imagens.
- Lista fixa de hosts considerados inválidos no reparador HTML. Hospedagem externa não prova imagem quebrada.

O README de HOOK-PRIME declara licença privada; não foi encontrada licença raiz nos quatro checkouts. O uso atual é de referência estrutural, sem incorporação de código desses repositórios no produto comercial.

## Implementação verificada

`src/supplier-adapter.ts` exige perfil versionado, tipos de linha e vínculos explícitos. Aceita herança declarada apenas de título, marca e descrição; bloqueia herança de preço e identificadores, pais duplicados, variantes órfãs e pais sem variantes. Retorna rastreabilidade por linha e valida os limites do piloto. Não infere fabricação/revenda nem executa integrações.

`tests/supplier-adapter.test.ts` conecta o resultado ao serviço real de preparação, com cliente sintético, pagamento simulado, conferência e ZIP. Integração disponível como função TypeScript; upload pelo painel e persistência do perfil/linhagem ainda precisam ser conectados antes do uso comercial.

## Próximos passos verificáveis

1. Persistir perfil aprovado e linhagem junto ao original, com revisão e identidade do aprovador; expor seleção no painel.
2. Implementar contratos de tarefas de `CONTRATOS_AGENTES.md`, mantendo pedidos e efeitos financeiros sob código.
3. Medir tempo total e registrar custos completos; impedir que ausência de custos seja exibida como margem medida.
4. Testar importação de amostra no ambiente Shopify autorizado e reconciliar variantes, preços e IDs. Ainda pendente.
