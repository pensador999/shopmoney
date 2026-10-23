# Estado operacional — 22/10/2026

Este documento prevalece sobre contagens e pendências históricas de STATUS, LOGIN_SUPABASE, MODELO_SUPABASE e RETOMADA.

## Processo vigente

1. Pesquisa registra fontes e hipóteses. Comercial confirma necessidade e menor serviço suficiente. Nenhum contato autorizado nesta etapa.
2. Atendimento reúne materiais autorizados, cliente/loja e perguntas; campos sugeridos exigem conferência.
3. Planejamento define mapeamento, fatos, variantes, perfil e escopo aprovado pelo operador.
4. Financeiro exige confirmação apropriada; pagamento de demonstração permanece identificado como simulação.
5. Produção executa transformações determinísticas; conteúdo usa fatos aprovados. SKU não é renomeado para esconder duplicidade.
6. Qualidade confere revisão, fontes, dados protegidos e pacote; imagem depende de confirmação visual efetiva. Rascunho IA exige conferência correspondente à revisão.
7. Atendimento prepara entrega somente após os requisitos. Aplicação na loja continua do cliente.
8. Coordenação acompanha dependências, correções, esforço e encerramento. Regras de aprendizado dependem de aprovação do operador.

O botão de análise sugere colunas sem criar pedido/contato. O botão do Studio vincula a ficha e apresenta pendências; não autoriza mídia, aprova fatos, inventa custos, paga ou encerra. O fluxo supervisionado de aprovação e execução permanece disponível.

## Correções incorporadas

- Conciliação dos commits locais af689fb/9e2b328 com os remotos 6d95a87/cd92105/14c205d, preservando histórico.
- Mantidos diagnóstico, exportação Bling de 59 colunas/HTML, evolução do mapeador, correção de qualidade após rascunho e ações remotas centralizadas no Service.
- Retiradas promoção automática de fatos/autorizações, alteração de SKUs, resolução silenciosa de conflitos e custos presumidos.
- Compatibilidade das fichas legadas e invalidação de aprovação/entrega por mudança de revisão preservadas.
- Histórico de arquivos da ponte preservado; retomada usa a versão atual de cada nome e conserva referências antigas.
- Cobrança brasileira permanece bloqueada; setting global não altera a oferta contratada.

## Onde cada parte executa

| Parte | Estado |
|---|---|
| Catálogo, conteúdo e arquivos do Studio | SQLite/pacotes locais; supervisão |
| Autenticação e leitura do painel remoto | Base Supabase existente |
| Ponte remota de pedidos BRL de teste | SQL preparado e validado isoladamente; aplicação bloqueada |
| Persistência remota das fichas do Studio/executor IA | Integração ainda não concluída; não confundir com a ponte de pedidos |
| Publicação, cobrança, campanhas e hospedagem | Não ativadas |

## Supabase: conjunto exato para aprovação

Destino exclusivo aqkwbmggkvvfhqaivxlh. Migração proposta: catanaops_brazil_supervised_bridge. Fonte: schemas/supabase-brazil-operations.sql. SHA-256: 1ef36595bfa287a6faa16e0a6cce8f6718c2a92cc6cf65951434d1e565fae8a3.

Cria operation_snapshots com RLS e políticas por membro/workspace; função privada operation_execute e wrapper público catanaops_operation; papel catanaops_executor sem login e sem BYPASSRLS, herdando authenticated, com as escritas necessárias. Nenhuma escrita direta adicional é concedida ao usuário autenticado nas tabelas. A função privada roda com esse papel, search_path vazio e checagem explícita de auth.uid()/vínculo. O wrapper público é SECURITY INVOKER.

Inclui upload no bucket privado apenas em caminho do workspace/pedido de teste e substitui claim_task para não executar projeções de acompanhamento como tarefas reais. Não remove dados, converte históricos, ativa cobrança nem publica infraestrutura.

Validação combinada: 114 testes da aplicação aprovados; TypeScript e sintaxe JavaScript aprovados. Resultado isolado: 28 verificações aprovadas sobre PostgreSQL WASM, incluindo escrita direta negada, idempotência, isolamento e lease. Limites: conexão única, Auth/Storage mínimos locais; JWT, upload HTTP e concorrência real ainda precisam ser verificados depois da aplicação.

A revisão automática rejeitou a aplicação remota mesmo após o pedido geral de atualização: exige aprovação explícita desse conjunto de permissões, upload e substituição de função. Nenhuma alteração remota foi aplicada. Não contornar o bloqueio por SQL indireto ou fragmentação equivalente da migração.

## Retomada

1. Obter aprovação explícita do conjunto identificado acima e reapresentar a migração pela ferramenta própria.
2. Confirmar schema, privilégios e políticas; testar sessão real, API, upload e retomada, com fixtures descartáveis e limpeza registrada.
3. Conectar fichas, revisões e exemplos ao armazenamento remoto com isolamento completo, antes de anunciar Studio integrado.
4. API editorial, importação Shopify e operação comercial continuam dependências próprias; não representam conclusão da migração.
