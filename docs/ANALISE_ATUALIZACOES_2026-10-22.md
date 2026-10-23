# Análise das atualizações de 22/10/2026

Repositório oficial: pensador999/shopmoney. Referência examinada: 14c205d. Commits novos: 6d95a87, cd92105 e 14c205d. Snapshot isolado em artifacts/review-14c205d. Não houve merge, alteração no banco, cobrança ou execução de integrações externas.

## Resultado verificável

- 111/111 testes da referência remota aprovados; TypeScript aprovado.
- Teste adicional em SQLite em memória reproduziu alterações indevidas em identificadores, autorização de mídia, fatos e restrições editoriais.
- Consulta somente de leitura em aqkwbmggkvvfhqaivxlh: 13 tabelas no schema catanaops; operation_snapshots e public.catanaops_operation continuam ausentes.
- O checkout local possui dois commits exclusivos (af689fb e 9e2b328); o remoto possui três exclusivos. As correções locais anteriores não foram incorporadas no remoto. Não fazer reset ou substituição automática de uma versão pela outra.

## Documentos Supabase encontrados

1. docs/MODELO_SUPABASE.md: desenho de dados e limites de acesso. Data 17/10; a declaração de nenhuma migração aplicada está ultrapassada. Não usar como inventário atual.
2. docs/LOGIN_SUPABASE.md: descreve bootstrap, vínculo de operador e políticas de leitura. Data 18/10; inclui pendências de identidade já superadas pelo uso anterior do painel. Preservar como registro histórico, não roteiro atual de cadastro.
3. docs/STATUS.md: diferencia leitura remota e operação local. Ainda menciona 33 testes e teste da ponte apenas em fixture; não incorpora os testes PostgreSQL WASM realizados localmente em 21/10.
4. schemas/supabase-brazil-operations.sql: migração executável da ponte de validação, não aplicada remotamente. Permanece idêntica à referência 70b16dc nos três novos commits.
5. docs/VALIDACAO_SQL_ISOLADA_2026-10-21.md: documento local vigente de evidência dos 26 testes SQL. Ainda não existe na linha remota examinada, pois faz parte do commit local exclusivo.

Não surgiu novo documento Supabase nos três commits: as alterações documentais estão em README.md e docs/STATUS.md. O SQL previamente validado não mudou, mas as novas ações do aplicativo exigem regressão do conjunto combinado.

## Melhorias úteis

- Ações remotas de revisão e custos agora reutilizam Service.approveRevision e Service.recordEconomics; reduzem diferenças de comportamento entre operação local e adaptador.
- Handoffs passam a atualizar artefatos por papel/revisão, corrigindo a preservação indevida do primeiro resultado. Em contrapartida, isso não é um histórico imutável de cada passagem; manter trilha de alterações por evento/hash.
- Autopilot constrói fichas por agrupamento de produto e inclui conteúdo no ZIP, substituindo parte da reutilização cega de ficha de camiseta.
- Exportação Bling utiliza o molde de 59 colunas e HTML na descrição complementar. Compatibilidade por importação real continua não comprovada.
- Ofertas e interface usam BRL/PT-BR; prazo de pagamento confirmado considera os dias da oferta; opt-out reconhece palavras em português.
- Diagnóstico público ganha rota específica; tamanho e categoria recebem sugestões melhores.

## Bloqueadores

### P1 — preparação automática transforma pendências em aprovações

src/content-studio/operations.ts, prepareRecordForOrchestration, linhas aproximadas 212–451:

- Define brand.approved e materialAuthorization como true.
- Mídias recebem authorized, approved e viewConfirmed verdadeiros.
- Conflitos recebem resolved=true e uma decisão genérica.
- Uma fonte unsupported torna-se manual e perde a lista de informações ausentes.
- Termos proibidos presentes no texto são removidos da política da marca.
- Alegação em bloco sem fonte pode ser copiada para um novo fato aprovado, referenciando a origem genérica do produto.

Reprodução sintética: um bloco “Produto milagroso impermeável com 100% seda”, não aprovado, gerou fato-bloco-1 aprovado. “milagroso” desapareceu dos termos proibidos; conflito de composição foi resolvido e imagens não autorizadas tornaram-se autorizadas. Evidência: artifacts/review-14c205d/review-repro.json.

Isso contorna a conferência em vez de resolver a origem do problema. Deve gerar proposta/pendência e preservar fonte e decisão humana. O teste chama o preparador isoladamente; não representa execução real de produção nem publicação.

### P1 — SKU e grade protegidos são alterados

O preparador e o construtor de fichas renomeiam SKUs repetidos, truncam códigos e inventam tamanhos para obter combinações únicas. Reproduzido: 000120-AREIA-P duplicado virou 000120-AREIA-P-2. A saída editorial pode divergir dos identificadores do arquivo original e do catálogo.

Não corrigir identificadores por adição de sufixo sem regra aprovada. Duplicidade ou grade desconhecida deve bloquear a seleção afetada e pedir decisão.

### P1 — autopilot ainda confunde simulação com execução comprovada

Continuam presentes: simulação de pagamento, aprovação visual programática, custos fixos, promoção de aprendizado e encerramento automático. QA declara nota 100. O novo caminho Studio também registra horas/custos fixos e autoriza escopo sozinho. Nenhuma dessas ações comprova medição, revisão humana ou qualidade semântica real.

Houve melhoria: o autopilot deixou de promover o requisito Shopify ao comparar o próprio CSV. Ainda é apenas consistência local, não importação.

### P1 — regressões corrigidas aqui continuam no remoto

ContentStudio.get remoto ainda compara o hash após inserir defaults de mídia. A correção de leitura legada e a invalidação de pedido/pacote por revisão editorial estão no commit local af689fb, não na linha remota. O novo upsert de ZIP/briefing não substitui versionamento e invalidação de aprovações.

### P2 — liberação comercial foi ampliada

commercialEnabled deixou de ser sempre false: pode ser habilitado por variável de ambiente; Payments também aceita setting global brlCommercialEnabled. O padrão continua bloqueado, mas a ativação agora afeta pedidos que guardavam oferta desabilitada.

Revisar isso ao integrar, mantendo validação comercial explícita, oferta contratada imutável e ausência de cobrança durante ensaios. Não foi lido nem alterado o .env; não se presume qual valor está configurado.

## Supabase e sequência recomendada

A leitura remota já existe; a escrita da ponte ainda não. Criar tabelas não conectará automaticamente Content Studio, aprendizado, executor e arquivos ao mesmo pedido.

1. Integrar as três atualizações remotas às duas correções locais, resolvendo os conflitos deliberadamente.
2. Manter as melhorias de exportação, agrupamento e Service; retirar a promoção automática de autorizações/fatos e a alteração de SKU.
3. Reexecutar regressões negativas e a validação SQL isolada sobre a versão combinada.
4. Consolidar um documento de estado vigente, deixando os textos de 17–19/10 identificados como históricos.
5. Revisar a fronteira de escrita direta das tabelas: RLS por workspace não substitui a proteção de lease/contrato implementada na RPC.
6. Somente com autorização específica aplicar o conjunto remoto e testar JWT, PostgREST, upload privado e concorrência real. A autorização mais recente foi para validação isolada; este pedido é de análise.

Os 111 testes aprovados cobrem o comportamento esperado pelo código novo, incluindo automações permissivas. Não anulam os bloqueadores reproduzidos pelo teste adicional.
