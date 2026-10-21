# Conteúdo por produto, marca e prévia — implementação local

Implementação concluída em 19/10/2026 para validação supervisionada. Não representa lançamento comercial, alteração em lojas ou integração operacional remota.

## Usar

    npm run panel:content

Abrir http://127.0.0.1:4324/ e escolher Conteúdo e prévia.

O servidor usa data/content-studio-validation.sqlite, sem carregar .env, iniciar runtime, enviar email, executar worker de IA ou cobrar. O processo precisa permanecer ligado.

1. Carregar Linha Clara ou Ateliê Horizonte, ou abrir um conteúdo salvo.
2. Substituir a fixture por identidade, dados e materiais autorizados. Identificadores da loja, produto e variantes são explícitos; SKU é texto integral.
3. Conferir perfil versionado, fatos/fontes, variantes e associação de imagens. Novas linhas começam sem aprovação de fato/mídia.
4. Escolher preservar, reorganizar ou preparar texto com fatos aprovados.
5. Salvar rascunho e comparar Essencial e Editorial, com cor e viewport de 960/390px.
6. Registrar operador, evidência e as três confirmações de revisão; aprovar template e cor.
7. Exportar o pacote aprovado. Mudanças de conteúdo invalidam a aprovação; mudar a seleção aprovada cria nova revisão.

Os formulários editoriais e JSON anteriores continuam em Pedidos e arquivos. O novo editor também possui opção de documento JSON completo, inclusive blocos de texto com referência a fatos; alterações avançadas devem ser aplicadas ao formulário antes de salvar.

O original é mostrado como texto aprovado e seu HTML é arquivado como .txt; não executamos HTML recebido. Preservar mantém o texto informado; reorganizar exige trechos presentes no original; reescrever usa blocos aprovados ou composição determinística dos fatos.

## Regras implementadas

- Escopo composto por workspace, cliente e loja, com produto pai e vínculos explícitos de variantes e mídia.
- SKU duplicado ou variante órfã bloqueia aprovação. Não há corte no hífen, geração de família ou identificação por nome de arquivo.
- Foto compartilhada entre tamanhos da mesma cor é válida. Cor divergente, variante inexistente, falta de autorização ou URL não permitida bloqueiam.
- Imagens são referências HTTPS de hosts aprovados; não há download, edição ou análise visual automática.
- Produto multicolorido exige cor/vínculo de mídia e seleção explícita da representação aprovada.
- Perfil de marca imutável por versão dentro da loja. Para mudar tom/paleta/proposta, informar nova versão.
- Fatos e textos devem ter fontes e aprovação. Alegações técnicas reconhecidas sem apoio no fato referenciado são bloqueadas; isso não constitui verificação semântica completa.
- Texto e atributos escapados, cores/valores visuais restritos, contraste mínimo interno e CSS limitado ao componente.
- Cada prévia usa iframe sandbox, política de conteúdo própria e cookie local HttpOnly/SameSite. Nenhum script externo, formulário de compra ou publicação.
- Aprovação vincula revisão, conteúdo, template, cor, renderer e versão do procedimento. Mudanças incompatíveis exigem nova aprovação.
- Exportação idempotente, histórico preservado e cancelamento bloqueando prévia/entrega.

## Arquitetura

src/content-studio contém contratos Zod, planejamento/renderização, persistência e fixtures.

Quatro tabelas SQLite aditivas: content_studios, content_studio_revisions, content_studio_profiles e content_studio_packages. Não foram criadas tabelas Supabase.

Estados: draft → approved → exported; alterações retornam a draft em nova revisão; cancelled bloqueia uso. Esta é uma sessão de conteúdo em laboratório, separada dos pedidos comerciais e suas confirmações financeiras. Não marca pedido comercial como pago, entregue ou aceito.

As consultas individuais exigem workspace/client/store. A lista resumida pertence ao operador do painel local e não deve ser exposta como API multiusuário remota sem autorização/RLS próprias.

APIs locais autenticadas:

- GET studio/fixture e studio/list; POST studio/create e studio/read.
- POST studio/revise, studio/approve, studio/export e studio/cancel.
- POST studio/advice e studio/jobs para análise consultiva.
- POST studio/effort para horas, taxas, custos e tributos, permitindo custos desconhecidos.

Rotas ficam sob /api. A prévia GET /content-preview é autenticada por cookie específico da porta; seus parâmetros carregam escopo, template, revisão e cor. Anônimo, outro escopo ou revisão antiga são bloqueados.

## Agentes e skill

Skill de projeto em agent/skills/catana-produto-marca/SKILL.md. O Eve a reconheceu na compilação; o loader existente também inclui suas instruções nas tarefas content/combined de Pesquisa, Atendimento, Planejamento, Produção e Qualidade. O conteúdo entra no hash do procedimento e na invalidação de contextos.

O painel pode enfileirar consulta de Planejamento ou rascunho consultivo de Produção no executor serial existente. Produção recebe até dez fatos aprovados, com texto e fonte limitados; demais funções recebem resumo. Não recebe imagens para análise visual. Respostas ficam disponíveis na própria área e não são aplicadas ao texto nem aprovam etapas automaticamente.

O roteiro de validação não inicia o executor. Se a fila estiver sem worker/cota, o pedido consultivo aguarda; não há fallback pago. Mudança de revisão/estado/procedimento descarta tarefas antigas antes ou depois da chamada.

A análise semântica dos modelos não foi executada neste incremento. O teste da fila usou respostas controladas.

## Pacote

- descricao.html: fragmento controlado, estático, da seleção aprovada.
- previa.html: documento independente para visualização.
- midias.json e fontes.json: materiais, vínculos e evidências.
- original.html.txt e original-texto.txt: preservação da entrada.
- manifest.json e qualidade.json: revisão, hashes, identidade, aprovação e limites.
- LEIA-ME.txt e, nas fixtures, dois SVGs sintéticos em midias/.

Fragmento de produto existente é identificado como revisão por product_id, não novo cadastro. Não há importação automática ou CSV para sobrescrever loja.

A seleção de cor da prévia não implementa troca dinâmica de variantes no tema. O HTML exportado representa a escolha aprovada. Funcionamento no tema Shopify requer teste autorizado separado.

## Simulação e evidências

    npm run demo:content
    npm run typecheck
    npm test
    npm run build

Simulação final: artifacts/content-studio-1792462138406. Uma peça, três variantes e duas ilustrações próprias; dois perfis fictícios e dois templates geraram quatro prévias e quatro ZIPs. index.html reúne as prévias portáveis.

O roteiro verificou preservação de fatos/SKU, autorização e vínculo compartilhado, bloqueio pré-aprovação, recuperação SQLite e exportação sem duplicação. Aprovações são controladas pelo roteiro e explicitamente rotuladas; não são aceite humano de cliente.

Resultado:

- 92/92 testes aprovados, incluindo 15 novos testes de conteúdo/HTTP.
- TypeScript e sintaxe JavaScript aprovados.
- Compilação Eve concluída, skill registrada em .eve/agent-summary.json.
- Navegador confirmou navegação, duas identidades, prévias, troca de cor, aprovação e bloqueio após edição.
- Navegação por Tab passou do operador às observações; viewport da prévia móvel medido em 390px.
- Servidor reiniciado e rascunhos recuperados. Desktop foi exercitado como viewport virtual de 960px com rolagem horizontal no painel estreito.
- Screenshot artifacts/content-studio-mobile.png registra a prévia móvel. A ilustração é explicitamente sintética.
- Zero chamadas reais de modelo no ensaio; zero publicação, cobrança, email, importação ou receita.

Logs: artifacts/content-studio-tests-final.txt, content-studio-eve-build-final.txt e content-studio-demo-final.txt.

## Dependências e limites

O build encontrou just-bash ausente. Adicionada a dependência local gratuita de desenvolvimento just-bash 3.6.0, com scripts de instalação desativados, sem mudar modelo ou versão Eve.

O npm identificou alertas transitivos reais. Override restrito guarded-fetch → undici 7.30.1 removeu o alerta alto reportado. A instalação final informou quatro alertas moderados remanescentes; não foi aplicado audit fix --force, downgrade de framework ou auditoria de segurança completa. A primeira compilação sob restrição de filesystem falhou com EPERM; compilação local permitida concluiu.

Nada foi instalado em infraestrutura hospedada. Modelos e contas permanecem os configurados pelo titular.

Ainda não há análise visual autônoma, pesquisa automática de posicionamento da marca, entrada automática a partir do LeakFinder, portal de cliente ou aprovação remota. O operador fornece/valida dados no formulário; JSON bruto da coleta não vira briefing aprovado automaticamente.

Não copiar textos, imagens, prefixos, especificações, paletas ou credenciais BRK. O repositório de descrições serviu como referência estrutural, sem sincronizador Admin ou Tampermonkey importados.
