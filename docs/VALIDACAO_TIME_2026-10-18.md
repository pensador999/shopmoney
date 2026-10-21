# Validação do time — 18/10/2026

Executado: TypeScript aprovado, 31 testes aprovados; simulação vertical com 11 verificações e pacote ZIP; simulação controlada dos oito papéis; duas rodadas de oito chamadas reais ao Eve local usando autenticação existente. Nenhuma mensagem, cobrança, importação ou publicação externa.

## Correções implementadas

- Executor que perdeu lease não pode sobrescrever resultado/erro do substituto.
- Papel inválido herdado do protótipo é rejeitado na entrada.
- Runtime agenda IA automaticamente apenas para needs_info, needs_attention e refund_pending. Solicitação explícita pelo painel continua disponível.
- Contexto de pedido inclui recebimento da fonte, validação estrutural, mapeamento e autoria do QA determinístico, sem linhas de produtos.
- Procedimentos distinguem simulação de operação real e conferência por código de importação Shopify.

## Evidências locais ignoradas no Git

- `artifacts/team-1792294627228/report.json`: oito respostas controladas, fluxo e fila testados.
- `artifacts/vertical-1792294628329/RESULTADO.md`: 11 verificações e ZIP de três pais/seis variantes.
- `artifacts/team-1792294636854/report.json`: primeira tentativa real pausada por serviço indisponível; não é sucesso.
- `artifacts/team-1792294681282/report.json`: primeira rodada real, oito respostas válidas; contexto insuficiente causou pedidos redundantes de evidência.
- `artifacts/team-1792294741717/report.json`: segunda rodada real após correção, oito respostas válidas. Atendimento reconheceu arquivo recebido; QA reconheceu conferência independente; coordenação reconheceu encerramento simulado.

## Limites encontrados e trabalho restante

Validade JSON não significa qualidade semântica completa. Atendimento ainda menciona QA antes da etapa adequada; produção pede evidência adicional de artefatos não incluída no contexto. Próximo: contratos especializados e validação de próxima ação pelo grafo, manifestos explícitos e avaliações semânticas por função. A simulação é um roteiro que conduz as transições; não demonstra que agentes negociam e passam entregas autonomamente.

O comando `node src/simulate-team.ts` usa respostas controladas; `--live` faz chamadas reais ao Eve local. Cada execução usa banco isolado e orçamento próprio de teste; não executar repetidamente como rotina, pois consome a cota compartilhada do ChatGPT. Não permite envio ou cobrança.

Continua pendente: adaptação assíncrona Supabase/Storage, login e autorização, executor hospedado, build painel/API, testes externos Gmail/Stripe/Shopify e campanha. Nenhum desses itens foi concluído por esta simulação. Preços propostos no plano diretor não foram ativados.
