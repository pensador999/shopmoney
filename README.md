# Shopmoney · Catana Ops

Repositório central do projeto: https://github.com/pensador999/shopmoney.
Catana Ops é o nome operacional; `catalog-ops` permanece como nome técnico da aplicação e da pasta local.

**Fase atual: validação local, sem operação comercial liberada.** Objetivo: entregar um piloto de preparação de catálogo Shopify em dólares, medindo custos e esforço total.

Comece pelo [índice do projeto](docs/README.md), pelo [estado e próximos passos](docs/STATUS.md) e pelas [regras de contribuição](CONTRIBUTING.md).

Aplicação local para preparar catálogos de fornecedores como novos rascunhos Shopify. Interface em português, entrega em inglês, originais preservados e decisões auditáveis.

## Executar

```powershell
npm ci
npm run typecheck
npm test
npm run demo
npm start
```

Painel: http://127.0.0.1:4318

Para os agentes, execute `npm run agents` em outro terminal e configure `AI_ENABLED=true` no `.env`. O motor usa o login ChatGPT local, sem fallback pago. A demonstração e o processamento de catálogo não precisam de IA.

## Documentação

- [Guia de configuração](GUIA_CONFIGURACAO.md): Gmail, Stripe, Cloudflare, Shopify e execução.
- [Políticas](POLITICAS.md): escopo, limites e regras aplicadas.
- [Arquitetura](ARQUITETURA.md): módulos e pontos de integração BRK.
- [Retomada](RETOMADA.md): estado e pendências para continuar sem reconstruir o contexto.

## Estado real

O fluxo local e as regras têm testes automatizados. Eve respondeu a dados sintéticos usando ChatGPT. Não foram configurados Gmail, Stripe, Cloudflare ou loja Shopify, nem feitas vendas ou abordagens. Assinatura, pesquisa de contatos e integração de código dos repositórios BRK permanecem pendentes conforme o documento de retomada.

Não expor o painel local na internet. Não versionar `.env`, `data`, `backups` ou pacotes de clientes. Use `node src/cli.ts backup` para uma cópia consistente do SQLite.
