# Momento de importar na Vercel

Status em 17/10/2026: ainda não liberado para implantação da aplicação. Banco estruturado não significa painel migrado.

## Incremento aplicado e verificado

- Supabase Catana Ops: 12 tabelas privadas, RLS ativa e sem grants anon/authenticated; bucket `catanaops-private` privado, limite de arquivo 8 MB. Sem usuários operacionais ou arquivos de clientes.
- Migrações remotas: `catanaops_private_foundation`, `catanaops_persistent_workflow`, `catanaops_serial_dispatch`. Snapshots SQL em `schemas/`, na mesma ordem. Não reaplicar os snapshots em projeto já migrado.
- Tarefas com revisão, dependência, função, versões de política/negócio, chave única, máximo de três tentativas, lease e geração do executor. Uma execução ativa por workspace, escolhida com lock transacional. Reexecução só após expiração.
- Teste transacional remoto como service_role: dependências, bloqueio de produção não paga, serialização de tarefas independentes, recuperação, rejeição de executor antigo, rejeição de conclusão após cancelamento, chave duplicada e bloqueio anon. Fixtures revertidas. O teste exercita chamadas sequenciais representando executores distintos; não é ensaio de carga simultânea.
- Painel local: quadro de responsáveis e próximo passo; tarefa consultiva recebe contexto do pedido sem SKU, registros de origem ou outro cliente. Solicitação repetida não duplica job. Contexto substituído antes de iniciar execução é cancelado sem consumir chamada IA.
- Executor local: se AI_ENABLED=true, cria sugestões para as etapas atuais automaticamente, dentro do limite existente de uma chamada por vez/12 tentativas diárias. Não avança estado comercial pela resposta do modelo. Produção/QA seguem determinísticas.
- Contexto empresarial versionado e contratos por papel são enviados ao Eve; conclusão registra versão no audit. Não são oito processos autônomos nem ferramentas externas liberadas por papel.
- 28 testes locais aprovados, TypeScript e sintaxe JS válidos; teste HTTP inclui vínculo cliente/pedido e deduplicação da análise. Navegador confirmou criação da demonstração e solicitação da análise. Nenhuma chamada real ao modelo neste incremento.

## Bloqueios concretos para a primeira preview

1. **Persistência:** `Service`, pagamentos, mail e servidor ainda consultam `Store` SQLite e SQL síncrono. Criar adaptador remoto assíncrono com gravação transacional de pedido/tarefas/auditoria e arquivos no Storage. O painel não lê as 12 tabelas remotas hoje.
2. **Identidade:** implementar login Supabase e autorização pelo workspace em toda operação. `workspace_members` continua sem bootstrap de operador. `server.ts` usa Host/token de localhost; o canal Eve ainda usa `placeholderAuth` para navegador em produção. Não substituir por acesso público.
3. **Execução:** conectar dispatcher remoto ao runtime hospedado/Workflow e às transições do serviço. As funções SQL claim/finish persistem tarefas, mas não executam catálogos nem enviam mensagens por si só. Testar interrupção entre etapas sem depender do PC.
4. **Modelos e configuração:** acesso MCP deste chat não é credencial do aplicativo. Não há configuração Supabase no `.env` do app. Manter login ChatGPT local somente na validação; escolher autenticação suportada em servidor e orçamento explícito antes de IA hospedada, sem fallback pago.
5. **Build:** `npm run build` executa apenas `eve build`. Ainda não existe build/entrypoint hospedado do painel customizado. Compor painel/API e Eve após resolver os itens anteriores; executar build completo, autenticação e ciclo sintético antes de importar.

**Sinal de liberação da preview:** login real, pedido sintético gravado no Supabase, original e ZIP privados recuperáveis, fila retomando após reinício, autorização negando outro workspace e build do painel/API/Eve aprovado. Nesse momento importar `pensador999/catanaops`, branch main, em ambiente de preview protegido, com envio e cobrança reais desativados.

Preview não equivale à operação comercial: Gmail, Stripe sandbox, importação Shopify de teste, termos, custos e autorização de campanha continuam gates distintos. Não é necessário concluir a venda para testar uma preview protegida; é necessário concluir a aplicação remota.

## Próximo incremento de engenharia

Implementar a interface remota de persistência e operações transacionais, preservando a suíte local como referência de equivalência. Em seguida conectar login e arquivos; só depois o executor e o build Vercel. Não copiar os dados locais automaticamente. A fila comercial completa e mensagens livres continuam pendentes.

Advisor de segurança nesta etapa: somente 12 avisos INFO de RLS sem policies, esperados em schema privado e fechado. Políticas de operador/Storage ainda precisam ser implementadas e testadas antes de acesso de usuários: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy .

Fontes técnicas verificadas: https://vercel.com/docs/functions/limitations e https://supabase.com/docs/guides/storage/security/access-control .
