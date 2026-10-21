# Catana Ops — plano consolidado de cadastro, conteúdo e validação

Estado: planejamento; nenhuma implementação operacional realizada por este documento.
Data de referência: 20/10/2026, America/Sao_Paulo.

## Evidências desta revisão

- HOOK-PRIME: 4143898005b83250d45c8e91cad03716e84073ec, conferido no GitHub. A Catana já registra moldes Bling59/Sankhya45 e transformação supervisionada; não integra o motor inteiro do HOOK.
- DESCRI-OES-PRODUTOS: somente os dez commits de 20/10, consultados entre 03:00Z de 20/10 e 02:59:59Z de 21/10. Base c70db34705fd37e292cf534bc2ccb83e9e866e71; ponta 372af50488ed4cfb4da977b0e399062f7a0c23ba.
- Revisão estática dos patches pertinentes em template_engine, html_builder, semantic_auditor, product_db, interface e testes. Não executamos a suíte Python, não inspecionamos visualmente as fotos e não copiamos catálogos comerciais para testes.
- A mensagem do commit 24be7b2 menciona correção de 6.230 produtos. Isso é declaração do repositório, não resultado reproduzido nesta revisão.

## Mudanças de hoje e decisões de adaptação

| Commits | Mudança observada | Decisão Catana |
|---|---|---|
| b8d3ef5 | Seleção de frente/costas, subtipos e alinhamento Python/JS | Uma definição central de regras; nomenclatura do arquivo fornece pista, não confirmação visual |
| fc6f568, 730ba35, cd43a4f, 6dc4625 | Cards técnicos, alternância de vistas e lupa | Prévia estática primeiro; interação opcional somente em ambiente compatível e testado |
| ec871a7 | Capa humanizada e prevenção de repetição em quatro posições | Manifesto explícito de mídia, sem listas de hashes particulares da BRK |
| 02631dc | Kit com componentes distintos, dois guias e recorte lateral | Componentes e tabelas com fonte própria; recorte depende de confirmação visual |
| 24be7b2 | Classificação, títulos, vocabulário por loja e auditoria | Revisão factual independente da lista de textos permitidos pelo produtor |
| bbe5965 | Desativa alternância em itens inadequados; amplia marcas de revenda | Capacidades por produto; marca e origem confirmadas por fonte |
| 372af50 | Filtros e contagens por categoria | Contagens coerentes com loja/categoria e cobertura da coleta |

Limites encontrados: títulos e categorias ainda disparam alegações técnicas, medidas fixas e deduções de fabricante. Listas de hashes de fotos resolvem casos particulares. O auditor amplia textos permitidos por arquétipo, mas essa permissão não demonstra a verdade de cada alegação. A alternância de duas vistas não comprova visualização 3D/360 contínua. O termo ML nos commits da lupa refere-se a Mercado Livre; esses commits não demonstram treinamento de machine learning.

## Arquitetura e contratos

Fluxo: materiais e fontes → ficha única do produto → perfil da loja → planejamento → cadastro e conteúdo → qualidade independente → prévia → aprovação → exportação → confirmação de aplicação quando disponível.

Preservar TypeScript, SQLite, oito papéis e executor serial. Adaptar lógica selecionada para o núcleo existente; não manter uma segunda aplicação Python ou copiar o hub inteiro.

Contratos aditivos, versionados e com leitura dos registros antigos:

- ProductRecord: workspace/cliente/loja/produto, identificadores externos, categoria observada/aprovada, fatos com origem e aprovação, variantes/SKUs textuais, componentes opcionais de kit e revisão.
- StoreProfile: público, tom, vocabulário, exemplos, restrições, regras comerciais e visuais; hipóteses distintas de aprovações.
- MediaManifest: autorização, produto/componente, variante/cor, papel editorial, vista observada/proposta, confirmação visual e recorte opcional.
- SourceCoverage: capacidade da fonte, campos disponíveis/ausentes, data, falha e alternativa de entrada.
- TaskHandoff: pedido/revisão, função, entrega estruturada, evidências, pendências, próxima etapa e limite de tentativas.
- Draft/QA: blocos com referências a fatos, achados independentes, versões e hashes. Texto consultivo nunca conclui uma etapa.

Precedência: regra explicitamente aprovada por cliente e fato com fonte prevalecem sobre classificação sugerida. Conflitos entre fontes ficam registrados para decisão; o sistema não escolhe silenciosamente. Categoria desconhecida recebe estrutura mínima sem características presumidas.

## Etapas de implementação

### 1. Ficha única e entrada adaptativa

Conectar materiais autorizados, formulários e snapshots públicos existentes ao mesmo produto. Rascunhos de entrada aceitam lacunas; validações obrigatórias são aplicadas no momento da transição pertinente. Omitir campos opcionais; consolidar perguntas essenciais; suspender apenas produtos dependentes e continuar os demais.

Uma URL pública não equivale a ficha técnica aprovada ou autorização de uso comercial das imagens. Nos estudos de campo, manter origem pública, caráter experimental e aprovação comercial ausente.

Auditar configurações sem expor segredos: .env controla credenciais/ativação; políticas e contratos controlam decisões. Ausência de credencial desabilita somente a capacidade dependente. Fonte incompatível oferece arquivo/formulário, sem contornar restrições de acesso.

### 2. Motor de cadastro inspirado no HOOK-PRIME

Extrair funções determinísticas para produto simples, pai/variantes, grades e associação de mídia. Gerar variantes apenas a partir de combinações aprovadas; não presumir todas as combinações de cor/tamanho. Preservar SKU, EAN e preços; proibir estoque, NCM, composição, fabricante e peso de fallback.

Uma única representação interna alimentará saídas específicas. Prioridade: manter Shopify em rascunho e validar leitura do molde Bling59. Exportação Bling terá serializer próprio, com teste de todas as células e conferência de importação antes de alegar compatibilidade. Sankhya permanece formato mapeado; conector e regras fiscais não entram automaticamente no piloto.

Cadastro existente usa identificador explícito e pacote de alterações. Exportado, importado e publicado são eventos distintos; contagem de IDs não substitui conciliação produto a produto.

### 3. Conteúdo por produto e marca

Conectar Eve à proposta de blocos estruturados e fundamentados, preservando compatibilidade com respostas consultivas antigas. A IA recebe somente fatos necessários, perfil e exemplos aprovados do cliente. Validar a resposta antes de oferecer sua aplicação ao rascunho.

Usar Essencial e Editorial com blocos opcionais. O modelo escolhe estrutura e redação, sem fornecer especificações ausentes. Guia de medidas exige fonte/unidade; kits apresentam cada componente e guia separadamente. Kits sem composição explícita ficam pendentes, sem inventar combinações, estoque ou desmembramento comercial.

Evitar textos intercambiáveis, adjetivos vazios e repetições. A QA confere a sustentação das alegações, identidade, clareza e coerência texto/imagem, além dos validadores determinísticos. Aprovação final permanece do operador.

### 4. Mídia e prévia

Classificar imagens como frente, costas, detalhe, uso ou desconhecida; separar sugestão baseada no nome de confirmação visual. Não usar hashes específicos de lojas como conhecimento universal.

Foto compartilhada entre tamanhos da mesma cor pode ser válida. Evitar repetição editorial desnecessária, mas aceitar galeria curta e omitir blocos; nunca exigir quatro fotos nem criar vistas ausentes. Deduplicação não se baseia apenas em dimensões ou remoção indiscriminada dos parâmetros de URL.

Manter HTML exportado estático e prévia isolada. Alternância frente/costas e ampliação são evolução opcional do painel, com teclado, toque e redução de movimento; não prometer 3D. Integração interativa em tema Shopify exige trabalho e autorização separados. Recortes são visuais, não reconstrução generativa, e não podem esconder detalhes essenciais sem revisão.

### 5. Agentes, pendências e painel

Pesquisa entrega evidências/cobertura; Atendimento consolida dúvidas; Planejamento aprova mapeamento e estrutura; Produção prepara cadastro e rascunho; Qualidade compara fontes e saídas; Coordenação controla dependências; Comercial preserva escopo; Financeiro registra esforço/custos.

Exibir por produto: ficha, fontes, pendências agrupadas, responsável, próximo passo, original/proposta, QA e revisão. Usar filtros por loja/categoria/status com contagens consistentes; dados não avaliados não aparecem como saudáveis.

Persistir revisões e tarefas antes de chamadas externas. Idempotência por pedido/produto/revisão/etapa; mudanças de fonte, perfil, mídia ou regras invalidam saídas dependentes. Interrupção e cota geram pausa retomável; cancelamento e resultados antigos não liberam entrega.

### 6. Aprendizado controlado

Registrar correção, contexto, justificativa, resultado e versão por cliente. Implementar recuperação local de exemplos aprovados por categoria/contexto, comparar com baseline sem recuperação e avaliar produtos não usados como exemplos.

Regras novas ficam propostas até revisão, teste e aprovação, com reversão. Compartilhar somente procedimentos genéricos revisados; não transportar dados, voz ou contexto privado entre clientes. Treinamento de modelo próprio depende de volume/qualidade de rótulos e ganho medido; não é requisito inicial e não haverá API paga automática.

## Validação e orçamento

Primeiro: fixtures sintéticas para produto simples, grades não cartesianas, infantil, marca de revenda e kit com duas tabelas. Conferir SKU com zeros/hífens, colisões, variantes órfãs, aspas/quebras de linha no CSV, mídia compartilhada e ambígua, fontes conflitantes e exportação repetida.

Testar alegações falsas que seriam aceitas apenas pela categoria: proteção UV, couro, composição, impermeabilidade e características de costura. Categoria sem fonte não autoriza esses textos. Validar isolamento entre clientes, cancelamento, falta de cota, reinício e invalidação de aprovação.

Depois: três lojas de vestuário diferentes, até dois produtos públicos por loja, mais fonte sintética incompatível. Máximo inicial de nove chamadas reais seriais: perfil, produção em lote e revisão por loja, respeitando o saldo diário existente. Registrar chamadas reais versus respostas simuladas; não gastar cota repetindo lotes já concluídos.

Medir alegações sem fonte (zero para liberação), cobertura, adequação editorial, perguntas necessárias, correções, minutos do operador, custos conhecidos e recuperação. Não atribuir conversão, lucro ou aceite de cliente aos estudos internos.

Executar por blocos de até quatro horas, começando pela ficha/pendências e motor de cadastro. A primeira janela termina com incremento verificável e checkpoint, não promessa de completar todas as etapas. Rodar testes pertinentes, TypeScript e regressão após integração; conferir UI desktop/celular e teclado.

## Aceite e limites

O operador deve conseguir preparar cadastro e descrição usando a mesma ficha, visualizar lacunas, revisar fontes e exportar somente a revisão aprovada. Ausência de informação opcional não interrompe o lote; ausência essencial não gera invenção. Produtos novos e desconhecidos recebem tratamento explícito.

Orçamento zero; operação local supervisionada; dados sintéticos nos testes automatizados. Nenhum contato, cobrança, publicação, contratação, alteração de tema ou importação real nesta implementação. Preservar históricos e ofertas comerciais existentes. Loja de teste autorizada e conciliação no destino continuam necessárias antes de anunciar compatibilidade comprovada.

Este documento consolida o plano adaptativo anterior com o aproveitamento seletivo do HOOK-PRIME e das mudanças de 20/10 do repositório de descrições; não registra essas funcionalidades como já implementadas.
