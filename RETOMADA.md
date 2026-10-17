# Retomada — 16/10/2026

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

