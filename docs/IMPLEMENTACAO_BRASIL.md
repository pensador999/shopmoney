# Implementação Brasil — 19/10/2026

## Implementado localmente

- Ofertas únicas em src/offers.ts; snapshots por pedido; BRL/pt-BR e R$60/h somente nos novos pedidos. Imagens, assinatura e cobrança bloqueadas.
- Serviços independentes de diagnóstico e conteúdo; cadastro e combinado geram ZIP. Conteúdo não exige planilha de SKU/preço. Fonte, aprovação, termos proibidos, HTML e identificadores conferidos.
- Revisões invalidam QA, entrega e custos; precisam de nova aprovação. Defeitos não consomem a rodada comercial, mas o limite de correções técnicas continua exigindo intervenção após duas revisões.
- Perfis por cliente/versão; contratos especializados; encaminhamento de clientes conhecidos para atendimento. Procedimento de marketing/produto sob demanda. Respostas antigas reply_en continuam legíveis; novas respostas usam reply_client e language.
- Aprendizado proposto/revisado por cliente, evidência e teste; nenhuma mudança automática de regra global.
- Painel local possui serviços independentes; painel autenticado apresenta ofertas e controles do ensaio integrado com custos/revisão/aprendizado. Sintaxe verificada; nova interface ainda sem verificação visual neste incremento.

## Integração preparada, NÃO aplicada no Supabase

src/remote-operations.ts conecta criação, tarefas projetadas, arquivos privados, processamento local supervisionado e retomada ao mesmo pedido. Usa JWT do operador somente na requisição/memória; não usa service_role, senha bancária ou credencial de email. Host Supabase fixado no projeto oficial.

Migração aditiva schemas/supabase-brazil-operations.sql cria snapshots privados, RPC SECURITY INVOKER, políticas por workspace/modo test e upload sem sobrescrita. CAS por versão/geração e lease impedem confirmação por executor substituído. Dispatcher antigo ignora projeções de validação. Originais preservados; SHA-256 conferido no download. Upload incerto é reconciliado pelo conteúdo; criação repetida usa o mesmo UUID/hash da solicitação.

Dois pedidos de consulta ao MCP Supabase foram impedidos antes da execução: revisão automática indisponível por capacidade do modelo. Não é uma reprovação de segurança. Nenhuma migração/linha/arquivo remoto foi criado nesta etapa; não tentamos outro canal para contornar essa revisão. O cliente remoto foi exercitado apenas em fixture controlada; isso NÃO valida o SQL ou o RLS real.

Em localhost:3000, os controles remotos poderão apresentar integração indisponível até aplicar/testar a migração. Não reenviar criação com novo identificador para resolver erro incerto. Os ensaios SQLite não são enviados automaticamente.

## Evidências

- Ensaio artifacts/brazil-1792384091621: quatro serviços, reabertura do SQLite antes de produção, pacotes ZIP reais com dados sintéticos, QA e entrega simulada.
- Oito papéis passaram pela fila com respostas controladas; nenhuma chamada nova ao modelo, portanto não há nova validação semântica do Eve.
- Testes novos de conteúdo sem fonte/aprovação, adulteração, contratos, revisão, perfis, histórico USD, tributos, fila, combinado e limites. Ponte simulada exercita repetição, upload interrompido, corrupção e geração substituída.
- TypeScript e sintaxe dos módulos JS aprovados. Suíte final: 53 testes, 51 aprovados e dois testes HTTP impedidos por EACCES. Resultado em artifacts/brazil-tests.txt; não houve aprovação integral da suíte.
- Dois testes HTTP em localhost bloqueados por EACCES do sandbox. Tentativa de execução autorizada fora do sandbox também impedida pela revisão automática indisponível. Não registrar esses testes como aprovados.

Receita real: R$0. Horas comerciais totais/custos não medidos. Margem não comprovada. Sem contato, cobrança, importação, contratação, deploy ou push ao GitHub.

## Retomada obrigatória

1. Aplicar e testar a migração via MCP quando a revisão automática voltar. Antes disso conferir o schema atual: não foi possível reinspecionar o banco nesta etapa.
2. Rodar teste SQL transacional: membro/outsider/anon, dois workspaces, alteração de workspace bloqueada, imutabilidade da oferta, CAS, lease expirado e dispatcher ignorando projeções. Fazer rollback das fixtures.
3. Com sessão do próprio operador, testar Storage privado real: upload, repetição, hash, download autorizado e negação de outro workspace. Não extrair senha/token do navegador.
4. Rodar os dois testes HTTP, conferir interface no navegador/teclado/mobile e repetir diagnóstico/conteúdo/cadastro/combinado pelo painel autenticado. Corrigir falhas antes de anunciar integração.
5. Reavaliar os oito papéis no Eve com os novos procedimentos quando houver cota; resposta controlada não substitui esse teste.
6. Imagens: implementar e validar padronização fiel com arquivos autorizados/sintéticos antes de habilitar a oferta. Reposição e assinatura permanecem bloqueadas.
7. Antes de vender: importação de amostra em ambiente Shopify autorizado, termos/identidade/capacidade e forma de recebimento liberados, diagnóstico comercial e campanha autorizados pelo titular. Vercel 24/7 não é requisito do piloto assistido.

## Abrir os painéis

- `npm run panel:br`: http://127.0.0.1:4323, SQLite isolado data/brazil-validation.sqlite, sem tick de rotina, leitura/envio de email ou executor IA. Aba Pedidos inclui entradas de diagnóstico e conteúdo. Catálogo e combinado usam o formulário de arquivo; combinado inclui briefing aprovado em JSON. Não afirmar que todas as modalidades foram testadas visualmente.
- `node src/auth-local.ts`: http://localhost:3000, login do próprio titular e consultas existentes. Controles brasileiros remotos dependem da migração; em indisponibilidade mostram erro e mantêm identificador para retomada.
- `npm run demo:br`: novo ensaio isolado, sem API paga ou serviços externos.

Os dois processos locais foram iniciados nesta etapa; disponibilidade futura depende do computador/processo. Não há serviço hospedado 24/7.
