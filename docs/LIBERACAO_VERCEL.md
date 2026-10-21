# Liberação da preview Vercel

Estado vigente: 19/10/2026. Repositório oficial pensador999/shopmoney. Orçamento zero; sem contratação ou publicação nesta etapa.

## O que já existe

- Supabase aqkwbmggkvvfhqaivxlh: 13 tabelas no schema catanaops, workspace e administrador confirmados, bucket privado.
- Login e leitura remota confirmados pelo titular. Políticas por membership e RPCs SECURITY INVOKER com acesso autenticado; acompanhamento filtra workspaces explicitamente.
- Painel local possui mapa e relatório do copiloto. Não confundir consulta remota com migração do pipeline.
- Produção/QA e executor IA continuam locais. Evidências completas e pendências em PRONTIDAO_COPILOTO.md; origem canônica src/workflow.ts.

## Critérios para publicar uma preview protegida

1. Integrar escrita assíncrona de pedidos, revisões, tarefas e auditoria ao Supabase.
2. Integrar originais e ZIP privados ao Storage, com hash e autorização.
3. Conectar executor à fila persistente, testar concorrência e recuperação.
4. Concluir sessão/autorização no aplicativo hospedado e build painel/API. eve build sozinho não publica o servidor customizado.
5. Validar login → pedido sintético → processamento → ZIP privado → reinício, com isolamento entre workspaces.
6. Verificar plano/custo e obter autorização antes de contratação ou publicação. IA local não vira credencial hospedada automaticamente.

Copiloto interno local pode ser usado supervisionadamente antes desses critérios. Gmail, Stripe, importação Shopify e campanha são critérios comerciais distintos; não são pré-requisitos para a aba visual ou para testes sintéticos. Não anunciar 24/7, receita ou autonomia integral a partir de tabelas, mapas e simulações.
