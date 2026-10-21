# Conexões e ações manuais — estado verificado

Projeto Supabase aqkwbmggkvvfhqaivxlh, repositório oficial pensador999/shopmoney, administrador catanaops@gmail.com. Orçamento zero; nenhum recurso pago habilitado.

## Banco e editor

13 tabelas no schema catanaops: workspaces, workspace_members, clients, orders, order_revisions, tasks, task_dependencies, artifacts, audit_events, payment_events, outbox, economics_entries, operator_bootstrap. Uma função RPC de leitura no schema public não duplica essas tabelas. Editor estava em public; alterado para catanaops e as 13 tabelas foram exibidas. Link: https://supabase.com/dashboard/project/aqkwbmggkvvfhqaivxlh/editor?schema=catanaops .

Workspace Catana Ops e administrador ativo confirmados. Bucket catanaops-private não público. Pedidos remotos: zero na consulta desta etapa; testes anteriores usaram SQLite ou transações revertidas. Dados locais não foram enviados automaticamente.

## Conexão implementada nesta etapa

RPC public.catanaops_dashboard, SECURITY INVOKER, apenas authenticated, sujeito às RLS das tabelas. Retorna workspaces autorizados, contagens e até 20 pedidos/30 tarefas com metadados; não retorna arquivos, emails, entradas de IA nem secrets. Usuário sem membership recebe erro; anon não possui execute. SQL/teste salvos em schemas/supabase-dashboard*.sql.

Página local http://localhost:3000 agora consulta o RPC após verificar a identidade no Auth. Mostra workspace, função, contagens, pedidos e tarefas, com atualização e logout. Usa chave publicável e access token somente em memória. Nenhuma chave administrativa. Não oferece criação/produção remotas ainda. O servidor src/auth-local.ts precisa estar ativo; inicia com node src/auth-local.ts e lê artifacts/auth-public.json (configuração local ignorada pelo Git, contendo apenas URL e chave pública).

Verificações: administrador acessa RPC em teste transacional; outsider rejeitado; anon rejeitado; API REST real sem login retorna 401; TypeScript e sintaxe JS aprovados; 31 testes locais aprovados. Página servida atualizada em localhost. Não afirmar teste completo da UI autenticada: depende do titular entrar com a senha privada. A simulação SQL do JWT não substitui esse teste.

## Gmail e SMTP

IMAP do aplicativo autenticado e ingestão/deduplicação de mensagem de teste validadas em banco isolado. Envio do aplicativo desativado. SMTP Auth do Supabase configurado pelo titular e conta confirmada; isso é separado de envio operacional pelo aplicativo. Sem campanha habilitada.

## Ações manuais do titular agora

1. Abrir/atualizar localhost:3000 e entrar com a senha Supabase já definida, sem compartilhá-la. Esperado: Catana Ops — admin e contagens remotas. Relatar somente eventual mensagem de erro, nunca tokens/senha.
2. Testar Atualizar dados remotos e Sair; depois entrar novamente. O recarregamento perde a sessão em memória intencionalmente nesta validação.

Depois: ambiente gratuito Shopify para importação sintética; Stripe sandbox quando integração estiver preparada; identidade/termos e autorização comercial antes da operação. Não é necessário contratar hospedagem ou fornecer chave administrativa agora. Não publicar na Vercel enquanto persistência de escrita, arquivos e executor não estiverem integrados.

## Pendências de engenharia

Persistência assíncrona com transações, autorização das escritas, upload/download Storage, integração do pipeline determinístico, leases remotos/recuperação, build hospedado. A consulta remota recém-conectada não é substituto desses componentes. Histórico Git oficial acessível; comparar e integrar antes de push, sem force-push.

Advisor: um INFO intencional em operator_bootstrap fechado e WARN de proteção contra senhas vazadas desativada. Não contratar upgrade para resolver automaticamente; revisar disponibilidade/custo antes. Referência: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .
