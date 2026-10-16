# Destinos da operação — configuração pendente

## Destinos informados pelo titular

- GitHub principal pretendido: https://github.com/catanaops-bit/shopmoney
- Supabase: https://dlyltdqojbmmcwkwjnuf.supabase.co
- Projeto Supabase: `dlyltdqojbmmcwkwjnuf`
- Vercel: importação futura; ainda não existe implantação validada neste fluxo.

## Verificação desta etapa

A consulta do novo GitHub por Git retornou Repository not found. O conector Supabase lista somente outro projeto; consulta de leitura no projeto acima retornou falta de permissão. Nenhuma tabela, credencial ou permissão remota foi alterada. O projeto Anzol não será usado para esta operação.

O remote `origin` anterior permanece preservado para não perder a referência já funcional. O novo destino está registrado como `catanaops`, ainda sem acesso confirmado. Não enviar alterações novas ao repositório anterior como substituição silenciosa.

## Ação do titular

Autorizar a integração GitHub para acessar `catanaops-bit/shopmoney` e conectar o Supabase à conta/organização que possui `dlyltdqojbmmcwkwjnuf`. Não é necessário tornar o repositório público nem enviar senhas, tokens ou service_role no chat.

## Sequência após acesso

1. Inspecionar conteúdo e branch do novo repositório antes de sincronizar; nunca force-push sobre trabalho existente.
2. Inspecionar schemas, tabelas, políticas e usuários do projeto indicado, sem exportar dados.
3. Preparar migração versionada de clientes, pedidos, tarefas, eventos e referências de arquivos; políticas RLS e buckets privados.
4. Validar isolamento com identidades sintéticas e recuperação/idempotência; migrar o adaptador síncrono SQLite para operações remotas explícitas.
5. Conectar Auth e sessão do operador, separar executor do servidor local e testar o ciclo completo.
6. Preparar configuração Vercel e ambiente de preview; importar somente quando esses pré-requisitos estiverem verificados.

A URL Supabase identifica o destino; não concede acesso nem substitui credenciais. Criar projeto e importar Git não tornam o aplicativo atual compatível com execução na nuvem. A fonte operacional permanece SQLite local até migração testada. Nenhum dado local será enviado automaticamente.
