# Validação isolada da ponte Supabase

Resultado: aprovado no escopo local, sem aplicação no projeto compartilhado.

Executor: PostgreSQL WASM PGlite 0.5.11, em memória, instalado com versão fixa e scripts de instalação desativados em artifacts/isolated-postgres. Nenhuma credencial, conexão remota ou dado real utilizado. Sem mudança no package.json/lockfile da aplicação.

Reprodução: `node scripts/validate-isolated-database.mjs`. Instalação da ferramenta documentada no cabeçalho do script. Resultado detalhado em artifacts/isolated-postgres/result.json.

## Cobertura executada

26 verificações aprovadas: sete scripts SQL aplicados (foundation, workflow, workflow-serial, operator-access, dashboard, workflow-read e brazil-operations), mais 19 verificações comportamentais.

- Anônimo e usuário sem vínculo rejeitados.
- Criação por membro autorizado; repetição idempotente; conflito de hash rejeitado.
- Outro workspace bloqueado na RPC e invisível por consulta direta com RLS.
- Segundo executor bloqueado enquanto há lease; geração/versão antigas rejeitadas.
- Valor contratado imutável e remoção do arquivo original rejeitada.
- Salvamento autorizado, expiração, retomada e rejeição do executor substituído.
- Inserção de objeto privado no pedido de teste aceita; outro workspace rejeitado.

O primeiro ensaio encontrou uma fixture incompleta (sem arquivo original); o banco rejeitou source_sha256 nulo. A fixture foi corrigida para representar o contrato real. Nenhuma alteração na migração foi necessária para os cenários testados.

## Limitações e próximos testes

Auth e Storage foram representados por schemas mínimos locais. As políticas, funções e RLS da aplicação executaram em PostgreSQL; login, JWT real, PostgREST, upload HTTP e Storage real não foram exercitados.

PGlite utiliza uma conexão: foram verificadas transições e competição sequencial por lease, não concorrência simultânea entre sessões/processos. Os SQLs locais representam a base; não foi comparado um dump integral do banco remoto.

As permissões de escrita direta da ponte também existem fora da RPC: a validação de lease/contrato dentro da função não é uma proteção contra um membro autorizado que escreva diretamente nas tabelas. Não apresentar estes testes como prova de prevenção desse cenário. Revisar essa fronteira de confiança antes de expor acesso a clientes ou operadores não confiáveis.

Próxima etapa: autorização específica para aplicação remota e verificação com sessão autenticada, API, arquivos privados e concorrência real. Esta autorização foi somente para validação isolada; nenhuma migração foi enviada novamente ao Supabase e nenhum serviço pago foi criado.
