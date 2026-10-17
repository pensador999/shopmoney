# Destinos da operação — configuração pendente

## Destinos informados pelo titular

- GitHub principal: https://github.com/pensador999/catanaops
- Supabase: https://aqkwbmggkvvfhqaivxlh.supabase.co
- Projeto Supabase: `aqkwbmggkvvfhqaivxlh`
- Vercel: importação futura; ainda não existe implantação validada neste fluxo.

## Verificação desta etapa

Em 17/10/2026, o novo GitHub foi acessado por Git e estava vazio. O conector Supabase ainda lista somente Anzol; consulta de leitura no projeto acima retornou falta de permissão. Nenhuma tabela, credencial ou permissão remota foi alterada. O projeto Anzol não será usado para esta operação.

O remote principal `origin` aponta para `pensador999/catanaops`. Destinos anteriores foram preservados como `legacy-shopmoney` e `legacy-catanaops-bit`, sem novos envios. A pasta local permanece `catalog-ops` para preservar automações e execução existentes.

## Ação do titular

Reconectar o plugin Supabase autorizando a organização que possui `aqkwbmggkvvfhqaivxlh`. O acesso Git ao novo repositório já funciona. Não é necessário tornar o repositório público nem enviar senhas, tokens ou service_role no chat.

## Sequência após acesso

1. Inspecionar conteúdo e branch do novo repositório antes de sincronizar; nunca force-push sobre trabalho existente.
2. Inspecionar schemas, tabelas, políticas e usuários do projeto indicado, sem exportar dados.
3. Preparar migração versionada de clientes, pedidos, tarefas, eventos e referências de arquivos; políticas RLS e buckets privados.
4. Validar isolamento com identidades sintéticas e recuperação/idempotência; migrar o adaptador síncrono SQLite para operações remotas explícitas.
5. Conectar Auth e sessão do operador, separar executor do servidor local e testar o ciclo completo.
6. Preparar configuração Vercel e ambiente de preview; importar somente quando esses pré-requisitos estiverem verificados.

A URL Supabase identifica o destino; não concede acesso nem substitui credenciais. Criar projeto e importar Git não tornam o aplicativo atual compatível com execução na nuvem. A fonte operacional permanece SQLite local até migração testada. Nenhum dado local será enviado automaticamente.
