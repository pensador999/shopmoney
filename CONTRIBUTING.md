# Como manter o projeto

## Ambiente

Node.js 24 e npm. Execute `npm ci`, `npm run typecheck` e `npm test`. Use `.env.example` como modelo local; mantenha IA e envio desativados durante testes. Testes devem usar dados sintéticos e bancos isolados. Consulte AGENTS.md antes de alterar agentes Eve.

## Organização

- `src/`: núcleo, serviços, persistência e integrações.
- `agent/`: configuração e instruções Eve.
- `public/`: painel local.
- `schemas/`: cabeçalhos e metadados estruturais, sem registros reais.
- `tests/`: verificações sintéticas.
- `scripts/`: ferramentas auxiliares; extração de referências requer clones externos em `../references/`, não necessários para executar o aplicativo.
- `worker/`: receptor de eventos, ainda sem publicação.
- `docs/`: índice, estado e planejamento; documentos técnicos atuais são ligados pelo índice.

## Alterações

Trabalhe em branch, descreva problema, mudança e evidência de validação. Atualize `docs/STATUS.md` quando mudar uma capacidade ou pendência e `RETOMADA.md` ao concluir uma etapa. Não anuncie integração comprovada com base em teste simulado.

## Dados e segredos

Nunca versionar `.env`, credenciais, tokens, bancos SQLite, backups, logs, pacotes de clientes, catálogos reais ou clones de referência. Revisar `git diff --cached` antes de publicar. `.env.example` só pode conter exemplos vazios ou não secretos. O repositório não concede permissão para copiar materiais de terceiros e não recebe licença de terceiros automaticamente.
