# Conteúdo por produto, identidade da loja e prévias — análise

Atualização posterior: acesso público confirmado e primeira versão implementada mediante autorização. Consulte [CONTEUDO_PREVIA.md](CONTEUDO_PREVIA.md) para estado atual, testes e limites. O restante preserva a análise que antecedeu a implementação.

Data: 19/10/2026. Proposta de arquitetura; não implementa geração visual, nova skill, publicação ou aplicação em lojas.

## Evidência consultada

Repositório privado pensador999/DESCRI-OES-PRODUTOS, main no commit c70db34705fd37e292cf534bc2ccb83e9e866e71, de 19/10/2026 às 19:40:15 UTC. Metadados indicam último push às 19:41:39 UTC. A conexão GitHub retornou 404; a autenticação local existente confirmou acesso ao repositório privado e permitiu leitura.

Comparação com o snapshot local b12792f9feaf1da5cfb8dc47dc8b43a61cbf5f19 encontrou 34 commits. Leitura direcionada atual: core/template_engine.py, core/html_builder.py, api/product_db.py, js/modal.js e dois arquivos de testes. Cópias em ../analyses/descriptions-c70db34. Não carregados catálogos, relatórios de produtos, credenciais ou integrações de escrita.

A cópia local antiga de batch_mass_generator, sibling_matcher e html_replacer foi consultada como referência histórica, sem atribuí-la às mudanças novas. Não foi executada a suíte Python atual nem comprovada aplicação nas lojas. O presente diagnóstico é inspeção de código e cruzamento com o código Catana.

## Conclusão

Há boa base conceitual para ligar seleção de produto, família/variantes, imagens oficiais, modelos editoriais, prévia e saída HTML. Recomenda-se adaptar essa estrutura em módulos, preservando políticas e ofertas atuais da Catana. Não copiar os textos, identidade, prefixos, prazos, fichas técnicas ou defaults do universo BRK.

Personalização deve combinar identidade consistente por loja com fatos específicos do produto. Não exige criar um design inteiramente diferente para cada SKU.

## O que a versão atual mostra

- api/product_db.py: busca por ID, SKU ou handle; auditoria de vínculos de fotos por variante; coleta pública para itens recentes; geração de HTML e inspeção de galeria.
- core/template_engine.py: classificação por categoria, resolução de origem, seleção de imagens por arquétipo, fichas e narrativas por loja.
- core/html_builder.py: montagem de HTML de descrição, blocos específicos, marcação de rastreabilidade e dados estruturados.
- js/modal.js: visualização de produto e versões de HTML, atualização da galeria e deduplicação no cliente.
- Testes abrangem cenários e padrões BRK; sua existência não comprova portabilidade para outra marca.

Fontes fixadas:

- [Índice e busca](https://github.com/pensador999/DESCRI-OES-PRODUTOS/blob/c70db34705fd37e292cf534bc2ccb83e9e866e71/api/product_db.py#L1086).
- [Auditoria de mídia](https://github.com/pensador999/DESCRI-OES-PRODUTOS/blob/c70db34705fd37e292cf534bc2ccb83e9e866e71/api/product_db.py#L258).
- [Seleção de imagens de vestuário](https://github.com/pensador999/DESCRI-OES-PRODUTOS/blob/c70db34705fd37e292cf534bc2ccb83e9e866e71/core/template_engine.py#L1840).
- [Narrativa e identidade por loja](https://github.com/pensador999/DESCRI-OES-PRODUTOS/blob/c70db34705fd37e292cf534bc2ccb83e9e866e71/core/template_engine.py#L2587).
- [Galeria na interface](https://github.com/pensador999/DESCRI-OES-PRODUTOS/blob/c70db34705fd37e292cf534bc2ccb83e9e866e71/js/modal.js#L1703).

## Regras que precisam mudar para Catana

1. O fallback atual usa o primeiro SKU e split('-')[0] como mestre em alguns caminhos. Isso é convenção local, não identidade universal. SKU ABC-PRETO-M não pode virar ABC sem regra aprovada, pois produtos diferentes podem compartilhar prefixos.
2. O índice by_sku usa atribuição direta. Se houver colisão, a última entrada pode substituir a anterior nesse índice. Catana deve manter candidatos e bloquear vínculo ambíguo, sem sobrescrever registros.
3. O motor contém defaults de tecido, composição, proteção UV e prazo por arquétipo. São regras específicas da operação de origem; não são fatos de uma loja nova.
4. A seleção de imagens usa prefixos, nomes de arquivos e exceções de SKUs. Serve como lógica de perfil local, não como validação visual universal.
5. A auditoria classifica imagem compartilhada entre variantes como duplicidade e pode pedir correção. Para vestuário, P/M/G da mesma cor podem compartilhar corretamente uma foto. Falta de image_id também pode corresponder a galeria herdada; não comprova imagem errada.
6. O título contendo LINHA desvia parte da auditoria de mídia. Isso não deve isentar uma camiseta chamada Linha Básica.
7. O limiar de 800px não considera papel da imagem, espaço de exibição e proporção. Dimensão é observável; qualidade visual ou inadequação requer contexto e, quando cabível, inspeção visual.
8. Em parte da deduplicação do frontend, imagens de variantes com mesmas dimensões podem ser reduzidas à primeira. Mesmas dimensões não significam mesma imagem nem mesma cor.
9. Conteúdo de produto semelhante pode orientar estrutura, mas composição, benefícios e fotos só são compartilhados quando a relação e os fatos forem explicitamente aprovados.

São observações estáticas dos caminhos lidos; não constituem teste completo ou auditoria de segurança do repositório.

## Identidade e SKU

Unidade de conteúdo padrão: produto pai. Unidade de identidade comercial: variante/SKU. Unidade de mídia: imagem e seus vínculos ao produto, variante ou cor.

Chave primária de trabalho:

    workspace_id + loja_id + shopify_product_id

Vínculos:

    product_id → variant_id → SKU textual
    product_id → image_id → variant_ids/cor explicitamente informados

SKU serve para localizar a peça correta no escopo da loja. ID e vínculo explícito têm precedência. Identidade ambígua gera pendência. Preservar zeros, grafia e os códigos originais; normalizações e decomposição de código pertencem a perfil versionado.

Se cada cor possui página própria, cada product_id recebe sua descrição e conjunto de mídia. Se as cores são variantes no mesmo pai, preparar texto comum e imagens vinculadas às opções corretas, com diferenças factuais quando justificadas. Não gerar 69 descrições por haver 69 variantes.

## Skill proposta: catana-produto-marca

Uma skill é procedimento de decisão e entrega. Não substitui contratos tipados, validações de código, persistência ou permissões. O desenho usa as orientações de skill-creator e aproveita os papéis existentes.

Acionamento: ao preparar ou revisar conteúdo/prévia de um produto com fontes e materiais autorizados. Não é ferramenta de prospecção, publicação ou auditoria financeira.

### Entradas

- Identidade: workspace, cliente, loja, pedido, revisão e product_id; mapa explícito de SKUs, variantes e imagens.
- Perfil de marca versionado: público, proposta de valor aprovada, tom, vocabulário, termos proibidos, exemplos aprovados e orientações visuais.
- Dados do produto: materiais, composição, modelagem, medidas, cuidados, aplicações e limitações, cada um com fonte e situação de aprovação.
- Materiais: textos existentes e imagens fornecidos/autorizados, com vínculos e finalidade de uso.
- Escopo: preservar, reorganizar ou reescrever; destino HTML da descrição ou proposta de página; limites da oferta.

### Procedimento

1. Verificar identidade e correspondência de produto/variantes/mídia. Não aceitar similaridade como confirmação.
2. Analisar a loja: separar estilo observado de posicionamento proposto. Paleta e tom observados não equivalem a briefing aprovado.
3. Analisar produto: separar fatos documentados, características visíveis e informações desconhecidas. Foto não comprova composição, proteção UV, certificação ou desempenho.
4. Preservar o que já funciona. Não presumir que texto foi feito por IA nem reescrever apenas para trocar palavras.
5. Propor estrutura editorial adequada ao tipo de peça e à loja. Cada bloco deve ter finalidade, fatos e mídia correspondentes.
6. Redigir rascunho e listar alegações/fontes, pendências e justificativas. Sem urgência, escassez ou prova social inventadas.
7. Renderizar prévia isolada e conferir produto, cor, responsividade e alegações.
8. Registrar revisão de texto, mídia e layout pelo operador/cliente. Alterar fatos, vínculo, perfil ou template invalida aprovações dependentes.

### Saídas

- BrandProfile: observado versus aprovado, versão, referências e limites.
- ProductBrief: fatos, fontes, aprovação e informações faltantes.
- MediaManifest: imagens escolhidas, produto/variante/cor, papel pretendido, evidência e necessidade de revisão.
- PagePlan: blocos escolhidos e justificativa, sem dados presumidos.
- ContentDraft: título, descrição, SEO e mapa de alegações.
- PreviewManifest: versões, hashes, template e modo de demonstração.
- QualityReport: divergências e critérios de aprovação; não permite autoaceite textual do agente.

Papéis: Planejamento aplica o procedimento; Produção redige a proposta e o código renderiza; Qualidade confere contra fontes; Atendimento apresenta opções e registra aprovação. Coordenador controla revisão e dependências. Não criar outro time permanente.

## Templates propostos

Templates representam estrutura; não contêm tecido, benefício ou prazo padrão.

| Template | Uso | Blocos opcionais conforme fonte |
| --- | --- | --- |
| Essencial | Peça simples, informação rápida | Imagem principal, apresentação curta, características, composição/cuidados e medidas |
| Editorial | Marca que valoriza estilo e contexto | Introdução, contexto de uso aprovado, caimento/modelagem, detalhe visual e ficha |
| Técnico | Produto com informações funcionais documentadas | Aplicações, características comprovadas, especificações, cuidados, medidas e FAQ aprovado |

Um token de identidade por cliente controla tipografia, contraste, espaçamento e cores aprovadas. Escolher a estrutura pela peça, volume de informação e identidade; não impor o padrão BRK de três atos nem inventar texto para preencher espaços.

Não usar todas as fotos no corpo da descrição. Selecionar poucas imagens pertinentes e evitar repetir a galeria nativa sem utilidade. Falta de imagem de detalhe não autoriza chamar uma foto qualquer de macro ou gerar uma nova característica visual.

## Prévia antes de aplicação

Duas camadas separadas:

1. Fragmento de descrição: mostra exatamente o HTML de conteúdo proposto. É o primeiro alvo de implementação.
2. Mock de página: composição demonstrativa com galeria e espaço do tema, rotulada como simulação. Não comprova funcionamento de seletores, checkout, apps ou tema real.

O usuário compara original/proposto e, inicialmente, duas opções de template, em desktop e celular. Se houver diferenças entre cores, pode conferir o conjunto de fotos relacionado. Apresentar pendências e fatos usados; botões de compra ficam desativados na demonstração.

Renderização local isolada: HTML controlado, CSS limitado ao componente, sem scripts de terceiros ou HTML administrativo vindo do cliente. Prévia do mock não deve ser confundida com publicação. Layout final do tema exige teste autorizado no tema/ambiente apropriado.

Imagens de cliente exigem confirmação de direitos e vínculo. Material público de loja usada como referência não vira ativo comercial de outra marca.

## Encaixe na base atual

Já existe: src/brand-content.ts com perfil de marca, fatos/fontes aprovados, termos proibidos, texto aprovado e checagem determinística; src/supplier-adapter.ts com vínculo explícito pai/variante; inspeção pública, snapshots e resumo consultivo dos agentes.

Ainda falta: manifesto de mídia com image_id/variant_ids/dimensões preservados no modelo normalizado, identidade por loja além de cliente, análise visual quando suportada e autorizada, plano editorial estruturado, renderer de templates, comparação de prévias, aprovação granular e exportação de alteração por identificador.

O normalizador de inspeção atual conserva principalmente src/alt e não mantém todos os vínculos e dimensões no produto normalizado; o JSON bruto guarda a fonte, mas isso não equivale a um manifesto pronto. O gerador de conteúdo atual escapa parágrafos e não é um construtor de páginas ricas.

Não transportar o sincronizador Admin, Tampermonkey, credenciais, paletas ou defaults BRK para completar essa lacuna.

## Sequência recomendada

1. Definir contrato de identidade, mapa de variantes e MediaManifest; testar colisões de SKU e fotos compartilhadas por tamanho.
2. Escrever a skill e dois perfis de marcas fictícias, com fatos e materiais sintéticos.
3. Implementar Essencial e Editorial como fragmentos isolados; usar a mesma peça para demonstrar personalização de marca sem alterar fatos.
4. Validar uma peça simples e outra com múltiplas cores, observando SKU repetido, ausência de ficha, imagem ambígua e alteração de revisão.
5. Medir esforço e revisar a oferta antes de prometer página completa ao preço atual de conteúdo.
6. Só depois conectar a aprovação de prévias ao painel e preparar teste autorizado em Shopify.

## Critérios de aceite

- Mesma família não mistura composições ou fotos de outra cor.
- SKU duplicado não escolhe silenciosamente um produto.
- Mesma foto compartilhada entre tamanhos não é erro automático.
- Cada alegação técnica remete a fonte aprovada; dados visuais não substituem ficha.
- Dois perfis produzem linguagem/apresentação distintas e fatos idênticos para a mesma peça.
- Mudança de produto, mídia, fatos, identidade ou template invalida a aprovação pertinente.
- Prévia não publica, não cobra e não oferece compra funcional.
- QA distingue conformidade estrutural, análise visual e funcionamento real do tema.

## Negócio

O serviço pode ser apresentado como conteúdo de produto com identidade de marca e prévia para aprovação. A hipótese de diferenciação é reduzir retrabalho e corrigir associação de informações/mídia; não apenas produzir mais texto.

Manter o serviço vigente de conteúdo como referência, sem afirmar que R$490 já cobre redesign de página, análise visual e integração de tema. Conteúdo, reparo de mídia e mudança de tema têm escopos diferentes. Preços e margem devem ser testados com esforço de atendimento, briefing, revisão e QA incluídos.

Estado ao encerrar: análise salva, acesso ao commit atual confirmado, nenhuma skill instalada, nenhum template implementado, nenhuma imagem comercial ou configuração BRK reaproveitada e nenhuma alteração em lojas.
