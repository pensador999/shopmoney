# Políticas operacionais — 2026-10-15.1

Estas regras são aplicadas pelo código. A IA não pode ampliá-las.

| Regra | Comportamento |
|---|---|
| SCOPE-01 | Um fornecedor, no máximo 50 pais e 500 variantes. Dados completos, mapeamento explícito e aprovação antes de cobrar. Novo fornecedor exige nova identificação. |
| DATA-01 | Identificadores como texto; preços preservados; sem suposição de GTIN, estoque, atributos ou classificação BRK. Fonte desconhecida vira pendência. |
| QA-01 | Comparação independente de fonte e saída. Falha impede entrega. Até duas revisões de entrada; uma rodada após entrega dentro de sete dias. |
| TENANT-01 | Contextos de IA isolados; namespace por cliente e fornecedor. Arquivos originais e revisões imutáveis no SQLite. |
| PAY-01 | Webhook autenticado, valor/moeda/pedido conferidos. Pagamento de sandbox não permite email de produção. Repasse é um evento distinto. |
| AI-01 | Uma chamada por vez. Falha persiste tarefa e aplica espera progressiva. Sem fallback pago, compra de créditos ou ampliação automática da cota. |
| SALES-01 | Campanha desativada até autorização e evidências. Cinco contatos/dia, um acompanhamento após cinco dias úteis, recusa interrompe a campanha. |
| DELIVERY-01 | Pacote em rascunho, sem publicação. SMTP incerto exige conciliação em Enviados. Encerramento administrativo não significa aceite. |
| CANCEL-01 | Cancelamento bloqueia mensagens pendentes; pagamento tardio gera reembolso pendente. Execução de reembolso é explícita no painel. |

## Vertical Shopify / vestuário

- Unidade de cadastro: variante; unidade de agrupamento: produto pai; unidade de conteúdo: página do pai. Não multiplicar por público ou número de lojas.
- Tamanhos e nomes das opções vêm do perfil aprovado. Não assumir a grade da BRK para outra empresa.
- Produto existente, atualização de estoque, migração ERP e aplicação por Tampermonkey ficam fora deste piloto de novos rascunhos.
- Referências de imagens podem ser relacionadas por SKU em `media-review.json`. Não são baixadas, hospedadas nem publicadas. A agência confirma associação e direitos; o sistema não inventa uma regra de deduplicação.
- HTML de entrada é tratado como texto e escapado. Layout HTML autorizado de cada cliente é uma oferta distinta, ainda não conectada aos repositórios BRK.
- Arquivo gerado não comprova importação. A liberação comercial exige teste na Shopify.

## Limites da autonomia atual

Produção, conferência, recebimento de eventos, retomada e envio de templates autorizados são automáticos. Mapeamento inicial, cadastro de contas, qualificação dos contatos e disputas exigem revisão. Respostas livres da IA são sugestões; não substituem termos, aprovação de escopo ou evidência financeira.
