> Estado vigente e sequência de execução: [ESTADO_OPERACIONAL.md](docs/ESTADO_OPERACIONAL.md). As datas e contagens abaixo são registros históricos.

## Prioridade atual — fluxo local sem IA, 21/10/2026

Usuário adiou explicitamente o ponto 1 (geração real) até adicionar API. Não executar novas chamadas para provar qualidade editorial agora. Ler docs/FLUXO_LOCAL_SEM_IA_2026-10-21.md. Implementados vínculos locais ficha/pedido/tarefas, entrada manual/JSON/URL Shopify, imagens candidatas, componentes e guias tipados com formulário, filtros e avaliação lexical sintética. 101/101 testes + TypeScript + sintaxe JS aprovados. Browser confirmou salvar, vínculo persistido após reinício e guia nas duas prévias; screenshot artifacts/local-flow-2026-10-21.png. API/modelo/credenciais e Supabase não alterados. Vínculo não simula pagamento nem promove estado comercial. Geração/QA reais, avaliação semântica e importação continuam pendentes. Mudanças locais, sem push.

## Verificação prioritária — 21/10/2026

Ler docs/VERIFICACAO_PLANO_ADAPTATIVO_2026-10-21.md e docs/PLANO_CONSOLIDADO_CATALOGO_CONTEUDO_2026-10-20.md. O plano está PARCIAL, não concluído. 98/98 testes, TypeScript, JS e build Eve aprovados; logs artifacts/verification-2026-10-21-*.txt. Corrigidos checkpoint que avançava após falha/pending, QA vazia, cancelamento idempotente, QA vinculada a hash/escopo/playbook, produto simples, fórmulas CSV, identidade de handle e modo do manifesto. Regressões em tests/adaptive-content.test.ts.

Campo em artifacts/adaptive-field-2026-10-20: quatro fichas, sete tentativas reais anteriores, sem descrição final aprovada. Retomada nesta rodada preservou sete tentativas e parou nas pendências. Nenhuma chamada nova. Não confundir done com aprovação. Interface visual não revalidada (timeout no navegador); testes HTTP passaram. Painel iniciado por npm run panel:content; verificar listener antes de iniciar outro. Nenhuma ativação comercial, push ou migração remota. Próximo: ciclo editorial real com briefing sintético aprovado e medição, depois completar entrada guiada, mídia/guias/kits, ficha/pedido único e avaliação de recuperação. Blocos abaixo são histórico; afirmações de 92 testes/zero IA descrevem rodadas antigas.

## Conteúdo, marca e prévia implementados — 19/10/2026

Ler docs/CONTEUDO_PREVIA.md. src/content-studio implementa identidade workspace/client/store/product, fatos/blocos aprovados, manifesto por variante/cor, templates Essencial/Editorial, comparação original como texto, render HTML controlado, revisão/aprovação/hash, exportação idempotente, custos desconhecidos e cancelamento. Tabelas SQLite locais aditivas, separadas dos pedidos comerciais; nenhuma migração Supabase. Skill em agent/skills/catana-produto-marca/SKILL.md registrada no build e carregada/hash pelo executor nos papéis pertinentes. Fila consultiva com resumo/fatos limitados, sem imagens; descarta contextos antigos e não aprova conteúdo.

Painel: npm run panel:content, http://127.0.0.1:4324, aba Conteúdo e prévia. DB data/content-studio-validation.sqlite; sem .env/runtime/worker/envios. Exemplos sintéticos Linha Clara/Ateliê Horizonte, formulários, JSON avançado, seleção template/cor, viewports virtuais 960/390, aprovação declarada operador, pacote e esforço. Precisa processo ativo. Novo servidor iniciado nesta rodada; verificar listener antes de reiniciar. Painéis anteriores não foram encerrados.

Validação final: 92/92 testes e TypeScript/JS aprovados; Eve build aprovado. Logs artifacts/content-studio-tests-final.txt e content-studio-eve-build-final.txt. Simulação final artifacts/content-studio-1792462138406 (index.html, quatro prévias/ZIPs/report.json/SQLite); fatos iguais e aparência/introdução distintas. Roteiro corrigiu comparação Buffer/Uint8Array antes do resultado final. Aprovações do roteiro e da UI foram explicitamente sintéticas/assistente, não aceite humano de cliente. Browser confirmou revisão, cor, aprovação, invalidação após editar, recuperação após restart e largura móvel390. Screenshot artifacts/content-studio-mobile.png. Zero chamadas reais IA, email, cobrança, publicação ou importação.

Build exigiu just-bash3.6.0 dev, instalado sem scripts. Override guarded-fetch/undici7.30.1 removeu alerta alto emitido na instalação; quatro moderados permanecem, sem audit fix forçado/downgrade. EPERM de build no sandbox resolvido na compilação local permitida; modelo/Eve não alterados. Não presumir segurança/compatibilidade Shopify comprovada. Falta integração remota, importação/tema, visão automática e entrada automática do LeakFinder. Preços/serviços comerciais intactos. Mudanças locais, sem push.

## Análise de descrições / marca / prévias — 19/10/2026

Ler docs/ANALISE_DESCRICOES_IDENTIDADE_PREVIAS.md. Repositório DESCRI-OES-PRODUTOS privado: connector404, mas gh local autorizado confirmou e leu commit c70db34705fd37e292cf534bc2ccb83e9e866e71 (34 commits desde b12792f). Seis arquivos atuais em ../analyses/descriptions-c70db34; leitura estática, sem testes Python ou integrações. Não abrir catálogos, dados BRK ou credenciais para repetir análise.

Proposta: identidade produto por workspace/loja/product_id, SKU textual para vínculo explícito, MediaManifest por variante/cor, BrandProfile aprovado, skill catana-produto-marca, modelos Essencial/Editorial/Técnico e prévia isolada. Não implementado nesta etapa. Não copiar split('-')[0], specs UV/composição/prazo, paletas ou deduplicação por dimensão; foto compartilhada entre tamanhos pode ser correta. Base Catana já tem fatos/textos aprovados, mas falta renderer, manifesto de mídia e aprovação granular. Aprovação do usuário nesta mensagem foi análise, não alteração de loja ou novo escopo comercial. A pergunta sobre o link foi resolvida pelo acesso local; não pedir acesso novamente por esse 404 do connector.

## Campo real LeakFinder / vestuário — 19/10/2026

Ler docs/TESTE_CAMPO_LEAKFINDER_INSIDER.md. Coletor HTTPS real validado na DUAS e Insider. Primeiras páginas tinham acessórios/kits e não exercitavam tamanhos; implementado collectProductPages para até cinco handles públicos, usando envelope product e JSON pointers corretos, sem conversão monetária implícita. Tech T-Shirt Insider: um pai/69 variantes, sete tamanhos e 177 referências de imagens. Fonte não retorna available; nenhum falso esgotamento. Agrupamento por produto evita 69 avisos redundantes. Regras versão 2 preservam QA de relatórios versão 1, inclusive arquivo histórico real do ensaio anterior.

Resultado final artifacts/field-inspection-1792458588293: snapshot/audit/source-crosscheck/agent-context/result/field.sqlite/diagnostico-campo.zip. Pedido 9089ec22-026d-4c48-83e8-a8e00ba9623e em ready. Coleta real, mas escopo/financeiro demonstrativos e review identifica assistente, não aprovação humana/lojista. Zero chamadas IA, contato, envio, cobrança ou alteração na loja. Contexto consultivo verificado, não teste semântico dos oito modelos.

TypeScript e 77/77 testes aprovados; log artifacts/field-inspection-tests.txt. Quatro testes adicionados. Roteiro scripts/field-inspection.ts separa collect/rehearse; não carrega .env nem inicia runtime. DNS restrito na primeira tentativa; coleta efetiva executada com permissão e transporte original. Não repetir consultas sem nova necessidade. Painel/remote/Eve tools não receberam nova integração neste incremento. Mudanças locais, sem push.

## LeakFinder integrado seletivamente — 19/10/2026

Ler docs/INTEGRACAO_LEAKFINDER.md. Titular autorizou baixar componentes úteis e adaptar. Cinco originais do commit 34874334726717c4ff3eb5472cef4145e3897a86 em references/leakfinder como .txt não executáveis; manifest.json registra hashes. Implementação adaptada em src/inspection: snapshots com Zod/hash, coleta HTTPS serial limitada com checkpoint, variantes sem suposições, evidências, comparação temporal, persistência SQLite por workspace/cliente e ponte idempotente/transacional para diagnóstico demo. service-editorial gera ZIP com fontes/QA/revisão humana e bloqueia anexo errado; coordination fornece resumo limitado, sem HTML, ao papel consultivo. Procedimentos MD atualizados.

Verificação final: TypeScript aprovado; 73/73 testes aprovados em artifacts/leakfinder-full-tests-final.txt. Primeiro sandbox teve dois EACCES HTTP; revisão de execução permitiu reteste local e depois suíte completa, ambos aprovados. 19 testes novos. npm run demo:inspection concluiu artifacts/leakfinder-fit-1792456710304: seis pais/doze variantes, 21 observações, dez verificações, interrupção/retomada, reabertura SQLite, QA, isolamento, comparação e ZIP. Zero rede/IA no ensaio; nenhum envio/cobrança/importação/deploy/gasto. Primeiro ensaio detectou chave extra no roteiro e foi corrigido antes do resultado final.

Limites: integração local por código/roteiro, não novo formulário no painel; sem execução semântica dos oito modelos, teste de coletor em loja real, Storage/Supabase remoto, screenshots ou MCP novo. Ponte só cria demo, exige revisão e não aprova escopo. Snapshot tem um perfil/revisão imutáveis; mudança exige nova captura. Revisão de pedido não reaproveita anexo antigo e permanece bloqueada até reconexão supervisionada. Não anunciar operação comercial pronta. Repetir npm run test:inspection e npm run demo:inspection se necessário; não repetir testes sem mudança. Mudanças ainda locais, sem push.

## Análise LeakFinder — 19/10/2026

Ler docs/ANALISE_LEAKFINDER.md. Snapshot GitHub 34874334726717c4ff3eb5472cef4145e3897a86 analisado com autorização do proprietário. Não integrado. Componentes úteis: coleta pública, leitura de variantes, snapshots e contratos de evidência. Suíte original 26/26; harnesses em ../analyses/leakfinder-3487433 reproduzem 15 problemas e dois comportamentos positivos, sem rede. Motor principal deepSku difere do extrator universal; não confundir os caminhos. Corrigir preço/SKU presumidos, colisões omitidas, fabricação inferida e falsa verificação antes de aproveitar. Manter oito papéis, executor serial e políticas brasileiras. Nenhum gasto/contato/deploy. Próximo passo sugerido: contrato de observação e parsers corrigidos, ainda não autorizado como implementação nesta análise.

## Ensaio público MiniMalista — 19/10/2026

Ler docs/TESTE_PUBLICO_MINIMALISTA.md. Artefatos artifacts/field-minimalista-1792384728855: diagnóstico público com quatro observações e fontes, conteúdo e combinado inteiramente sintéticos, dois pais/seis variantes, 12 verificações, oito papéis com respostas controladas. Não são oito análises reais de IA. Eve falhou por EPERM/symlink e execução ampliada impedida por revisão automática indisponível; não contornar. Nenhum contato, receita, importação ou cópia de materiais da loja.

Melhoria: diagnosticSchema aceita observações categorizadas com evidência e próxima ação; não inventa campo ausente diante de divergência. Painel4323 mostra field-case-summary separado da fila. TypeScript/JS aprovados; suíte54 com52 aprovados e2 HTTP EACCES (artifacts/field-case-tests.txt). Novo teste observa rastreabilidade. Revalidar Eve real quando execução for permitida.

Verificação final Brasil: 53 testes, 51 aprovados e dois HTTP impedidos pelo sandbox; TypeScript/JS aprovados. Logs em artifacts/brazil-tests.txt. Painel sintético sem rotina externa em 127.0.0.1:4323 (`npm run panel:br`); Auth localhost:3000 atualizado. Verificar processos antes de presumir disponibilidade.

# Retomada prioritária — Brasil 19/10/2026

Ler docs/BRASIL.md e docs/IMPLEMENTACAO_BRASIL.md. Código local adaptado para ICP loja brasileira de vestuário Shopify, ofertas versionadas BRL, serviços independentes e combinado, perfis por cliente, contratos, idioma e custos. Ensaio real de código artifacts/brazil-1792384091621: quatro pacotes, retomada SQLite, oito papéis com respostas controladas (não são chamadas novas ao modelo). Zero receita.

MCP Supabase não executou duas consultas: revisão automática indisponível por capacidade. Não contornar. Migração schemas/supabase-brazil-operations.sql SOMENTE PREPARADA; conferir schema, aplicar e testar RLS/CAS/Storage quando revisão voltar. Testes HTTP EACCES; escalada também impedida pelo revisor indisponível. Não alegar UI, SQL ou integração remota validados. Não ativar contatos, pagamentos, importação, infraestrutura ou gasto. Mudanças locais não publicadas no Git.

# Retomada — 16/10/2026

## Ensaio com referência pública DUAS — 19/10/2026

Ler docs/TESTE_PUBLICO_DUAS.md. Pesquisa primária Shopify/loja identificou referência técnica brasileira, não agência/cliente validado. src/simulate-public-case.ts: oito papéis Eve reais, nove verificações técnicas e ZIP sintético (2pais/5variantes), sem copiar produtos/imagens/descrições da marca. Pesquisa web feita no chat, não pelo papel research sem ferramentas. Primeiro teste real pausou com Eve desligado; após iniciar, ciclo completo artifacts/public-case-1792381995156. Atendimento genérico levou à correção do contexto estrutural e da mensagem do parser, que ignorava vírgula. Dois retestes pontuais, último identificou price/linha2 corretamente. businessContext versão catanaops-2026-10-19.1. 34 testes e TypeScript passaram.

Fluxo visual inclui último ensaio separado das tarefas remotas via public-case-summary.json em artifacts. Servidor real reiniciado para servir endpoint; titular atualiza/login novamente. Dados/saídas fictícios, transições pelo roteiro, sem handoffs autônomos; sem cliente, contato, cobrança, importação ou receita. Margem desconhecida. Não anunciar operação pronta por esse teste. Mudanças locais ainda precisam sincronização segura com Git oficial, sem force-push.

## Fluxo visual e prontidão — 19/10/2026

Complemento de aceite: layout em iframe de 390px conferido visualmente com API simulada, incluindo controles móveis sem truncar seleção; fixture desligada após teste. Servidor real localhost3000 retornou definição com oito papéis/18 itens de prontidão. RPC real anônimo401. Relatório/índice e STATUS atualizados; não há migração de produção concluída. Screenshot do mapa é explicitamente de ambiente simulado.

Implementadas abas Visão geral/Fluxo de trabalho/Prontidão do copiloto no auth-local. Definição tipada única em src/workflow.ts; mapa HTML/SVG com oito funções, retornos, detalhes por teclado e lista equivalente. Relatório docs/PRONTIDAO_COPILOTO.md gerado por node scripts/report-workflow.ts da mesma definição. Migração catanaops_workflow_read aplicada com RPC SECURITY INVOKER, membership, RLS e filtros explícitos de workspace em pedidos/tarefas/eventos. Primeiro envio bloqueado por revisão automática por falta desses filtros explícitos; corrigido antes de aplicar. Teste remoto transacional passou com 125 tarefas, lista limitada100, agregadoscompletos, pedido de outro workspace negado, outsider/anon negados; rollback remove fixtures. Só metadados; sem input/result de IA ou conteúdo de emails.

33 testes locais e TypeScript aprovados. Navegador testou login/logout simulados, abas bloqueadas antes de login, mapa, detalhes por Enter, estados vazios, QA e cancelamento com API fixture explicitamente sinalizada em localhost:3001; não se confunde com Auth real. Login real anterior foi confirmado pelo titular; nova aba autenticada real depende de atualizar localhost:3000 e entrar novamente, sem fornecer senha. Viewport desktop conferido; CSS responsivo e lista alternativa implementados, viewport móvel ainda requer conferência visual. Screenshot artifacts/workflow-map-validation.png. Servidor real reiniciado e endpoint /workflow-definition.json habilitado; não copia sessão anterior.

Documentos CONEXAO_NUVEM e LIBERACAO_VERCEL atualizados para eliminar estados antigos de acesso/login. Runtime/comercial, contratos especializados, escrita remota e Storage não foram implementados neste incremento, conforme escopo. Zero cobrança/email/deploy/gasto. Advisor mantém INFO bootstrap privado e WARN proteção de senhas vazadas desativada; sem upgrade contratado.

## Interface do workspace — 19/10/2026

Titular via mensagem indicou texto antigo da página provisória sem CSS. Arquivos atuais já tinham consulta remota, mas aba mantinha versão carregada antiga. Nenhum listener na porta3000 encontrado ao verificar; iniciado node src/auth-local.ts novamente. auth-local.html agora usa identidade visual do painel via auth-local.css/style.css; servidor permite somente rotas CSS explícitas. Indicadores remotos em cartões, estados de erro e botão de repetir consulta após autenticar. TypeScript e sintaxe JS aprovados; navegador recarregado confirmou UI e CSS responsivo no viewport atual. Screenshot artifacts/workspace-design.png. Sessão continua somente em memória: titular deve entrar novamente após reload; não foi testada UI autenticada nesta mudança nem extraída senha/token. Servidor ainda precisa permanecer ativo. Demais bloqueios de escrita remota/Storage/executor não resolvidos por design.

## Leitura remota conectada e tabelas visíveis

Ver docs/CONEXOES_ATUAIS.md. Confirmadas 13 tabelas em catanaops, workspace/admin ativos e bucket privado. Editor estava em public; selecionado catanaops e lista visível, screenshot artifacts/supabase-tables.png. Aplicada migração catanaops_dashboard_read: RPC público somente authenticated SECURITY INVOKER com RLS e membership obrigatório. auth-local.html/js agora consulta workspace/contagens/pedidos/tarefas reais após login. Teste transacional admin/outsider/anon passou e REST sem login retornou401. 31 testes locais, TypeScript e sintaxe JS aprovados. Usuário precisa testar nova tela autenticada com senha privada; sem senha/token extraídos de sessão. Escrita remota, arquivos e executor ainda pendentes. Nenhum envio, cobrança, deploy ou gasto. Advisor INFO bootstrap fechado + WARN leaked-password protection desativada, ver documento. Git oficial acessível via ls-remote, HEAD d78e739; não feito push.

## Administrador ativado — verificação após confirmação do titular

Consulta ao Supabase confirmou catanaops@gmail.com com email confirmado, senha configurada (somente indicador booleano consultado), last_sign_in_at preenchido e membership admin no workspace Catana Ops; operator_bootstrap vinculado corretamente. Não leu senha/hash nem tokens. Evidência de autenticação existente não substitui teste dedicado de login por senha/logout ou integração do painel: aplicativo operacional continua pendente de adapter remoto/sessão. Nenhum reset ou reenvio realizado nesta verificação.

## Retorno local de autenticação — SMTP configurado pelo titular

Dashboard confirmou SMTP personalizado ativo, host smtp.gmail.com/465. URL Auth vigente http://localhost:3000, sem redirects adicionais. Criado src/auth-local.ts e public/auth-local.html/js para receber convite, remover token da URL imediatamente, verificar usuário pelo Auth, permitir que o próprio titular defina senha e testar login/logout. Tokens só em memória, sem localStorage/logs; chave pública em artifacts/auth-public.json ignorado no Git. Servidor local iniciado na porta 3000, sem runtime/mail/pagamentos e sem banco local. TypeScript e sintaxe JS passaram; navegador confirmou formulário carregado. Não testado login real nem senha: isso depende do titular aceitar convite. Não é painel operacional migrado. Reenviar convite pelo Dashboard; titular abre link no mesmo computador e define sua senha. Não automatizar entrada/submissão de nova senha. Screenshot artifacts/auth-local-ready.png.

## Workspace e autorização de administrador — 18/10/2026

Migração remota catanaops_operator_access aplicada. Workspace Catana Ops e reserva catanaops@gmail.com criados; agora 13 tabelas privadas, leitura por membership nas 12 operacionais e Storage restrito ao prefixo workspace. Sem escrita pública. Trigger privado atribui admin somente após confirmação Auth ao email reservado e uma única identidade. Teste transacional com fixtures Auth e rollback passou: não confirmado sem acesso, confirmado vinculado, outsider/metadados admin sem acesso, promoção direta negada. Advisor apenas um INFO intencional em operator_bootstrap. Não foi criada conta Auth real nem senha. Titular deve convidar pelo Dashboard Authentication/Users; ver docs/LOGIN_SUPABASE.md. Painel continua local/SQLite; login real e adapter remoto pendentes. Não anunciar estrutura/app completo.

## Mensagem Gmail ingerida — 18/10/2026

Mensagem do titular com assunto Teste Catana Ops encontrada e ingerida pelo pollInbox real em data/gmail-validation.sqlite, banco isolado. Segunda consulta não duplicou registro. Status received; zero jobs IA pois remetente não cadastrado como cliente/lead, zero outbox; envio false. Não foi ingestão no banco do painel ativo nem teste SMTP. pollInbox agora aceita filtro opcional por assunto para diagnóstico delimitado, runtime padrão preservado. TypeScript aprovado. Nenhum corpo, remetente ou segredo exposto no resultado.

## Gmail autenticado — 18/10/2026

Titular configurou senha de app no .env existente. Teste real IMAP TLS autenticou catanaops@gmail.com e abriu INBOX em modo somente leitura com sucesso. MAIL_SEND_ENABLED=false confirmado. Nenhuma mensagem enviada, conteúdo lido/exportado ou senha exibida. Isso comprova autenticação e acesso à caixa, não ingestão no painel, SMTP ou entrega. Próximo: mensagem sintética do titular e validação de ingestão isolada; depois teste de envio somente com autorização e destinatário definidos.

## Configuração confirmada pelo titular — 18/10/2026

Administrador inicial autorizado: catanaops@gmail.com. Titular informa GitHub/Supabase conectados; não equivale a credenciais do aplicativo. Orçamento disponível agora: zero, sem reserva até o próximo mês; não contratar, habilitar API paga ou assumir gastos futuros automaticamente. Não possui loja Shopify; orientar ambiente de desenvolvimento gratuito para teste, sem contratar loja comercial. Gmail ainda requer configuração local por senha de app, envio desativado. Não há usuário Auth criado por esta anotação.

## Destinos oficiais — confirmação de 18/10/2026

GitHub oficial: https://github.com/pensador999/shopmoney.git. Supabase: aqkwbmggkvvfhqaivxlh. Email: catanaops@gmail.com. Origin atualizado; destino anterior preservado como legacy-catanaops. Esta seção substitui destinos anteriores. Sem push nesta alteração; buscar e comparar histórico remoto antes de enviar. Email operacional não implica bootstrap de administrador Auth.

## Validação real dos papéis — 18/10/2026

Ler docs/VALIDACAO_TIME_2026-10-18.md. 31 testes e TypeScript aprovados, simulação vertical com 11 verificações, oito papéis testados com respostas controladas e duas rodadas reais no Eve local. Contexto de recebimento/mapeamento/QA enriquecido após identificar perguntas redundantes. Fencing do lease local corrigido. IA automática agora apenas para exceções, mantendo botão manual. Script src/simulate-team.ts salva relatório e ZIP isolados; --live consome cota ChatGPT. Ainda há limitações semânticas e não há handoff comercial autônomo. Supabase/app remoto e integrações externas permanecem pendentes. Não declarar operação completa nem publicar na Vercel ainda.

## Procedimentos dos agentes integrados — incremento posterior de 17/10

Oito procedimentos em `docs/agents/` e COMMON.md são carregados por `src/agent-playbooks.ts` nas chamadas Eve. Hash do conteúdo registrado no audit e na chave das análises de pedido. Validação de contexto antes e depois da chamada descarta resposta se pedido/revisão/custos/procedimento mudou. Jobs suspensos após três tentativas; limite diário continua 12. TypeScript e 30 testes passaram; HTTP exigiu permissão localhost. Sem chamada real ao modelo ou operação externa. Mudanças locais desta etapa não equivalem a deploy ou migração do aplicativo.

Próximo bloco: persistência remota assíncrona e autenticação do operador, conforme docs/LIBERACAO_VERCEL.md. O runtime continua SQLite/local. Procedimentos são consultivos; handoffs especializados e integração comercial completa continuam pendentes. Não declarar operação 24/7 pronta.

## Coordenação e fila remota — 17/10/2026

Ler `docs/LIBERACAO_VERCEL.md`. Aplicadas migrações `catanaops_persistent_workflow` e `catanaops_serial_dispatch`: 12 tabelas, bucket privado, dispatcher serial com lease/geração e guard de produção. SQL e teste remoto em `schemas/supabase-workflow*.sql`; testes como service_role com rollback passaram. Painel local mostra responsável/próximo passo e análise do pedido sem redigitar contexto. Contexto empresarial/contratos em `src/business-context.ts`; `coordination.ts` monta pedidos consultivos deduplicados; runtime agenda sugestões se AI_ENABLED=true, sem avançar estados por LLM. 28 testes locais, TypeScript e JS passaram; HTTP precisou rodar fora do bloqueio localhost do sandbox. IA real/envio desativados na demonstração. Banco isolado `data/team-validation.sqlite`, painel verificado em http://127.0.0.1:4322/ (conferir processo antes de presumir disponibilidade futura). Captura local ignorada pelo Git: `artifacts/team-workflow.png`.

Ainda faltam adaptador remoto, login/permissões de operador, integração do Storage, executor hospedado e build do painel/API. Supabase estruturado não significa aplicativo migrado. Não importar na Vercel antes dos critérios do documento. Nenhum deploy, email, cobrança real, gasto de modelo ou publicação em loja executados.

## Supabase acessível e fundação aplicada — 17/10/2026

Conexão `catanaops` acessa `aqkwbmggkvvfhqaivxlh`. Migração remota `catanaops_private_foundation` aplicada: schema privado catanaops, workspaces, workspace_members, clients e orders. SQL correspondente em `schemas/supabase-foundation.sql` (snapshot da migração remota). RLS ativa nas quatro tabelas, sem grants anon/authenticated; backend service_role possui acesso e deve validar autorização. Teste sintético transacional confirmou inserção válida e rejeição de pedido com cliente de outro workspace; rollback removeu todas as fixtures. Advisor retornou quatro avisos INFO de RLS sem policies, intencionais nesta fundação fechada: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy . Não há política de leitura de operadores ainda. Nenhum usuário, bucket ou integração do painel foi criado. SQLite continua ativo. Próximo: completar tarefas/arquivos/eventos, acesso autenticado e adaptador remoto com testes. Esta seção substitui os bloqueios de conexão registrados abaixo e nos documentos antigos.

## Destinos atualizados — 17/10/2026

Base enviada com autorização explícita para `https://github.com/pensador999/catanaops`, branch main. Supabase alvo `aqkwbmggkvvfhqaivxlh` continua recusando consulta de leitura; nenhuma estrutura remota criada. Ler `docs/MODELO_SUPABASE.md` e `docs/CONEXAO_NUVEM.md` antes de migrar. SQLite continua sendo o banco utilizado pelo aplicativo. Reconexão Supabase pelo titular é a dependência atual.

## Atualização mais recente — moldes de hoje

Ler `PADROES_CATALOGO.md`. Refs remotas HOOK-PRIME e DESCRI-OES-PRODUTOS atualizadas; análise focada nos commits de 16/10 em Brasília. Nove CSVs compartilham molde Bling59, não importação nativa Shopify. Base salva apenas com cabeçalhos/formato e metadados estruturais; nenhum registro real foi copiado para testes ou pedidos.

Painel possui biblioteca de formatos, separador CSV e decimal explícitos. Perfil aceita cabeçalhos exatos e herança de título em coluna própria. Prévia não inclui amostras dos produtos. Novo teste com 59 colunas e dados sintéticos passa pelo serviço até ZIP; total 27 testes aprovados, TypeScript sem erros. `scripts/extract-reference-schemas.py` lê apenas estrutura autorizada dos objetos Git e gera schemas. Atualização de descrições gera critérios no documento; automação externa não foi executada.

Painel atual iniciado e conferido no navegador em `http://127.0.0.1:4320/`, usando banco separado `data/formats-validation.sqlite`, IA e envio desativados. Biblioteca mostra Bling 59, Sankhya 45 e Shopify 15 colunas, com seletores de separador CSV e decimal. O painel 4319 da etapa anterior não deve ser considerado ativo. Após encerrar a sessão, verificar disponibilidade antes de informar que o servidor segue online.

## Último incremento — ciclo pelo painel

- Intake `/api/orders` aceita demonstração e perfil pai/variante. `original` guarda o arquivo bruto; `source-N.json` guarda linhas adaptadas; `profile-N.json` e `lineage-N.json` preservam regras e origem. Limite de entrada com perfil: 550 linhas, mantendo 50 pais/500 variantes após adaptação.
- Aprovação local registra ator e perfil no audit. Revisões com perfil mantêm o perfil aprovado original, exigem reaprovação e preservam versões; alterar regras de um perfil durante revisão ainda requer implementação específica.
- `order_tasks` persiste oito etapas do pedido junto com cada gravação: intake, planejamento, pagamento, produção, qualidade, entrega, custos e encerramento. São projeções determinísticas do pedido com responsável/dependência/evidência, não oito agentes autônomos nem uma fila comercial completa. Estados de pedidos anteriores aparecem por projeção e passam a persistir tarefas na próxima gravação.
- Painel permite upload demonstrativo, seleção de perfil JSON, entrega e fim da janela simulados. Custos usam formulário inline (prompt não funciona no navegador integrado), exigem nota e diferenciam ausência de custos, hipótese e contribuição registrada. Revisão invalida a confirmação dos custos até atualização.
- Validação: 26 testes passaram; TypeScript sem erros. Teste HTTP cobre perfil, original, tarefas, cobrança simulada, revisão, reaprovação, entrega, custos e encerramento. Após ajuste final de invalidação de custos, o teste HTTP direcionado foi repetido e passou.
- Navegador conferido em `http://127.0.0.1:4319/`, banco separado `data/panel-validation.sqlite`, IA e envio desativados. Uma demonstração encerrada exibe contribuição hipotética US$90 (2h, US$7 taxas, US$2 custos); receita real zero. Servidor 4318 anterior não foi alterado nesta etapa.
- Próximos bloqueios reais: configurar e testar Gmail/Stripe/recepção pública, importar amostra Shopify, identificar oferta e termos, autorizar campanha. Ainda falta conectar qualificação comercial/atendimento livre ao ciclo. Nenhuma cobrança, envio externo, deploy ou contratação executados.

As seções abaixo registram a evolução anterior; o estado acima prevalece para as funcionalidades atualizadas.

## Estado

Implementação em `catalog-ops/`. Não houve envio comercial, cobrança real, publicação de catálogo ou importação em loja Shopify.

Núcleo CSV/XLSX, SQLite, painel local, qualidade independente, pacote ZIP, webhook Stripe, receptor Cloudflare e adaptadores Gmail estão implementados. Eve 0.80.0 iniciou e respondeu a uma chamada sintética usando o login ChatGPT. Os testes automatizados exercitam cenários locais; não são testes reais de Gmail/Stripe/Shopify.

## Próxima sessão

1. Ler `AGENTS.md`, `POLITICAS.md` e este arquivo.
2. Executar `npm run typecheck`, `npm test`, `npm run doctor` e verificar `git diff`.
3. Preservar `data/`, originais e históricos; não reinicializar banco para resolver erro.
4. Conferir `GUIA_CONFIGURACAO.md` e distinguir recursos implementados de integrações configuradas.
5. Próxima etapa externa: usuário configura Gmail/Stripe/Cloudflare e fornece ambiente Shopify de teste. Nenhum segredo deve ir para mensagens, commits ou logs.

## Pendências explícitas

- Configuração e teste real de Gmail, Stripe sandbox, webhook público e importação Shopify.
- Identidade comercial, termos finais e evidências de habilitação de conta/repasse.
- Quatro repositórios BRK baixados em `../references/` e lidos como referência, com commits em `REFERENCIAS_BRK.md`. Sem execução ou cópia de código para o produto. Adaptador de perfil explícito validado por teste; integração no painel e persistência de perfil/linhagem pendentes.
- Pesquisa e qualificação de 30 candidatos; campanha ainda desativada.
- Assinatura condicionada a pilotos: Billing ainda não implementado.
- Intake inicial e respostas livres ainda requerem revisão. A automação atual cobre templates e etapas determinísticas autorizadas; não é uma empresa totalmente autônoma.

## Decisões do Tripo incorporadas

Pais, variantes, páginas de conteúdo e mídia são unidades diferentes. Não duplicar contagem por público/loja. Nada desconhecido recebe um padrão BRK. CSV é uma entrega intermediária: aplicação e reconciliação no destino continuam separadas. Perfis por fornecedor/cliente precedem reaproveitamento dos adaptadores.

## Verificação concluída nesta sessão

- TypeScript: sem erros.
- Suíte: 25 testes aprovados em 16/10, incluindo adaptador pai/variantes no ciclo sintético e recuperação da fila sob lease. HTTP local exigiu execução fora do bloqueio de rede do sandbox. TypeScript sem erros.
- Eve: chamada real curta por login ChatGPT retornou JSON válido com dados sintéticos; sem API paga.
- Painel: demonstração acionada no navegador e pacote disponível.
- Dependências: npm audit retornou zero vulnerabilidades após override de uuid usado pelo ExcelJS.
- `.env` local habilita a fila de IA; email permanece desligado e credenciais externas vazias. Limite local: 12 tentativas de IA por dia em São Paulo, além da cota do ChatGPT.
- Servidores desta sessão: painel na porta 4318; Eve na porta 2000. Reiniciar com `npm start` e `npm run agents` quando necessário.

## Incremento de 16/10 — referências e retomada

Ler `REFERENCIAS_BRK.md` e `CONTRATOS_AGENTES.md`. Recuperação de tarefas IA interrompidas passou da inicialização do servidor para o executor que adquiriu o lease global; segunda instância não deve resetar tarefa ativa. Nenhuma chamada de IA ou operação comercial foi necessária nos novos testes. Não houve reinício dos servidores nesta etapa; processos antigos precisam recarregar o código antes de refletir mudanças.

Próximo incremento: ligar perfil/linhagem ao intake e artefatos, implementar tarefas com responsável e evidências, e distinguir margem desconhecida de margem medida no painel. Os caminhos GitHub foram confirmados pelo usuário; instalação ativa de scripts BRK ainda não foi confirmada. Não houve teste de importação Shopify, pagamento real ou comprovação de receita.

## Simulação vertical executada — 16/10

Comando reproduzível: `node src/simulate-vertical.ts`. Cada execução cria diretório e SQLite isolados em `artifacts/vertical-<timestamp>`, sem tocar no banco da operação. Resultado desta execução: `artifacts/vertical-1792146464361/RESULTADO.md` e `delivery-synthetic.zip`.

Três pais e seis variantes (camisa, manguito e bandana), fabricação/revenda informada explicitamente, SKU/EAN com zeros, referências de mídia fictícias. Onze verificações passaram; TypeScript sem erros. Inclui rejeição de preço ausente, gates de escopo/pagamento, retomada após reabrir SQLite, QA de preço adulterado, não duplicação de entrega e encerramento sem aceite presumido.

Roteiro usa o código real de adaptação/produção/qualidade. Etapas comerciais e humanas, pagamento e transporte de entrega são simulados; não há chamada a IA, Gmail, Stripe ou loja. Perfil e linhagem foram salvos pelo roteiro; isso não conclui a integração do intake. Receita real zero. Cenário econômico hipotético: 100 minutos totais, US$7 taxas e US$2 custos variáveis, contribuição após referência de trabalho a US$25/h = US$98,33. Não representa margem medida nem inclui impostos/custos fixos.

