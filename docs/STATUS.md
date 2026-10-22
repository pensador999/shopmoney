# Atualização Brasil — 19/10/2026

Prevalecem [BRASIL.md](BRASIL.md) e [IMPLEMENTACAO_BRASIL.md](IMPLEMENTACAO_BRASIL.md). Quatro serviços sintéticos completos localmente; oito papéis com respostas controladas, sem novo teste semântico Eve. Perfis/contratos/revisões/custos e aprendizado por cliente implementados. Migração e RLS reais pendentes por indisponibilidade da revisão automática; ponte testada somente em fixture. Não declarar operação integrada.

# Estado vigente do projeto — 19/10/2026

## Copiloto interno supervisionado

Mapa dos oito papéis e relatório de prontidão implementados no painel local. A fonte de responsabilidades, conexões e pendências é src/workflow.ts; relatório gerado em [PRONTIDAO_COPILOTO.md](PRONTIDAO_COPILOTO.md). Não são oito processos autônomos: Eve atende sessões consultivas; produção/QA são código.

## Confirmado

- Login e vínculo administrador catanaops@gmail.com confirmados pelo titular.
- Supabase aqkwbmggkvvfhqaivxlh: 13 tabelas em catanaops, workspace e bucket privado.
- Leitura remota, isolamento por membership e acompanhamento com filtro explícito de workspace.
- 33 testes locais aprovados, TypeScript aprovado. Teste SQL de acompanhamento com 125 tarefas e dois workspaces, rollback das fixtures.
- Interface verificada com API simulada, incluindo abas, teclado, cancelamento, QA, logout e viewport de 390px. Consulta real sem login rejeitada com401.
- Gmail IMAP real e deduplicação testados em banco isolado; SMTP Auth configurado. Envio operacional permanece desativado.

## Falta integrar

Escrita remota, originais/ZIP no Storage, executor consumindo a mesma fila, contratos especializados por função e roteamento correto de atendimento/comercial. UI nova autenticada com Supabase deve ser conferida pelo titular após atualizar e entrar novamente; não extraímos senha ou sessão do navegador.

O aplicativo de produção de catálogos continua SQLite/local. IA e processamento exigem computador/processos ativos. Não há hospedagem publicada, cobrança, campanha ou receita comprovada. Orçamento zero. Vercel e Stripe não bloqueiam o uso local assistido com dados sintéticos; seus critérios estão em [LIBERACAO_VERCEL.md](LIBERACAO_VERCEL.md).

Ofertas vigentes em validação local (`br-2026-10-19.1`, BRL, vestuário Shopify): Diagnóstico de catálogo (R$ 190, até 10 produtos, 2 dias úteis), Conteúdo de produto (R$ 490, até 10 produtos, 3 dias úteis), Preparação de cadastro (R$ 690, 1 fornecedor, até 20 produtos e 200 variantes, 3 dias úteis) e Lançamento combinado (R$ 990, até 20 produtos/200 variantes + 10 conteúdos, 3 dias úteis). Padronização de imagens (R$ 290) e assinatura mensal (R$ 1.490) permanecem bloqueadas. A hipótese histórica de US$ 149 é mantida apenas para leitura de registros legados. Histórico detalhado em [RETOMADA.md](../RETOMADA.md).
