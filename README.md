## Direcionamento vigente: Catana Ops Brasil

Catálogo e conteúdo para marcas brasileiras de vestuário Shopify. [Negócio, preços e limites](docs/BRASIL.md) · [Implementação, evidências e bloqueios](docs/IMPLEMENTACAO_BRASIL.md). Simulação: `node src/simulate-brazil.ts`. Novos pedidos BRL; histórico USD preservado. Ponte remota preparada, migração não aplicada nesta etapa por indisponibilidade da revisão automática. Nenhuma operação comercial liberada.

# Shopmoney · Catana Ops

Repositório central do projeto: https://github.com/pensador999/shopmoney.
Catana Ops é o nome operacional; `catalog-ops` permanece como nome técnico da aplicação e da pasta local.

**Fase atual: validação local brasileira (`br-2026-10-19.1`), sem operação comercial externa liberada.** Objetivo: validar e operar os 4 serviços avulsos em reais (`Diagnóstico de catálogo R$ 190`, `Conteúdo de produto R$ 490`, `Preparação de cadastro R$ 690`, `Lançamento combinado R$ 990`) para marcas brasileiras de vestuário na Shopify, medindo custos, tributos e esforço por etapa a R$ 60/h (meta de contribuição ≥ 40%).

Comece pelo [índice do projeto](docs/README.md), pelo [estado e próximos passos](docs/STATUS.md) e pelas [regras de contribuição](CONTRIBUTING.md).

Aplicação local para diagnóstico, conteúdo e preparação de catálogos de fornecedores como novos rascunhos Shopify e validação Bling (59 colunas). Interface e entregas em português (`pt-BR`), originais preservados, 8 contratos de handoff verificados por hash e decisões auditáveis (histórico USD preservado apenas para compatibilidade).

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
- Integração seletiva LeakFinder: [componentes, teste reproduzível e limites](docs/INTEGRACAO_LEAKFINDER.md). Execute npm run demo:inspection para o ciclo sintético isolado.
