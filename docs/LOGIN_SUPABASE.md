# Administrador e acesso Supabase — 18/10/2026

Projeto: aqkwbmggkvvfhqaivxlh. Email autorizado: catanaops@gmail.com.

Aplicada migração remota catanaops_operator_access; SQL em schemas/supabase-operator-access.sql. Workspace Catana Ops criado e email reservado na tabela privada operator_bootstrap. Não foi criado usuário Auth diretamente por SQL nem definida senha.

## Concluir identidade

No Dashboard do projeto, abrir Authentication → Users → Add user → Invite user e informar catanaops@gmail.com. O titular aceita o convite recebido pelo email e define sua senha pelo fluxo Auth configurado. Não compartilhar senha com o agente. Se o convite redirecionar para URL ainda indisponível, configurar URL de autenticação quando houver callback local ou preview, antes de reenviar; não presumir login do painel funcional.

O plugin atual não possui operações Auth Admin para emitir esse convite. A criação/convite deve ocorrer pelo Dashboard ou por backend com credencial administrativa configurada por canal seguro. Não reutilizar senha de app Gmail como senha do painel.

O trigger privado vincula o primeiro usuário não anônimo com email confirmado correspondente à reserva. Ignora metadados de usuário, não concede privilégios a outros emails e não permite recriar a associação para um segundo ID. Nenhum cadastro aberto recebe função por declarar role=admin.

## Acesso implementado

Membros autenticados podem ler somente seu workspace e suas linhas operacionais; membership é legível apenas pelo próprio usuário. Não há escrita de usuário em clientes/pedidos/tarefas nesta etapa: transições continuam exclusivas do backend. Objetos do bucket privado só ficam legíveis ao membro quando o primeiro segmento do caminho é seu workspace. Sem upload público ou compartilhamento automático. O schema privado ainda precisa de integração backend ou configuração explícita de Data API para uso por aplicação; grants não equivalem à exposição REST.

## Verificação

Teste remoto transacional com rollback em schemas/supabase-operator-access-test.sql: email não confirmado sem vínculo; confirmado recebe admin; outro usuário com metadado admin não vê workspace/membros; alteração direta de membership rejeitada. Fixtures removidas pelo rollback. Conta real ainda não criada. Teste de sessão real e Storage com arquivo real continua pendente.

Advisor: um INFO sobre RLS sem política na tabela operator_bootstrap, intencionalmente fechada e sem grants aos usuários. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

Não confundir este incremento com login no painel local: o aplicativo ainda usa token de localhost e SQLite. Próximo trabalho: adapter remoto, sessão do operador no painel, testes de logout/expiração, arquivos privados e build. Nenhum deploy ou custo habilitado.
