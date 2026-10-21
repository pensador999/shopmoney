# Fluxo local sem chamadas de IA — 21/10/2026

## Escopo solicitado
Geração editorial real (ponto 1) adiada até configuração de API. Nenhuma credencial criada, modelo trocado, chamada de IA, contato, cobrança, importação em loja ou publicação nesta etapa.

## Implementado
- Vínculo persistente entre ficha e pedido local de validação, com identidade única, cliente, loja, revisão e tarefas no painel. Criação idempotente; vínculo entre lojas bloqueado. Pedido revisado exige reconfirmação explícita do mesmo ID; cancelamento/encerramento bloqueia execução/aprovação/exportação editorial.
- Tarefas comerciais e respostas editoriais apresentadas juntas, com sua natureza preservada: resposta done/pending aparece como needs_info, e uma resposta do modelo não conclui a operação. O vínculo não simula pagamento nem conclui etapas comerciais.
- Entrada guiada: ficha manual em branco, ficha Catana JSON até 1 MB, URL HTTPS de produto Shopify pelo coletor seguro existente. O caminho por URL é uma amostra de um produto, não crawler universal. Fontes incompatíveis podem usar formulário ou ficha JSON. CSV/XLSX continuam no fluxo de cadastro existente, não são automaticamente convertidos em briefing editorial.
- Importação de imagens públicas como candidatas (até 12), com IDs de variantes quando disponíveis; sem aprovação, direitos ou confirmação visual presumidos. Campo de hosts permitidos disponível no perfil; confirmação por operador necessária.
- Formulários de componentes de kit e guias de medidas: componente opcional, fonte, unidade cm/mm/in, colunas e linhas; validação de duplicatas, formato e aprovação. Tabelas renderizadas nos dois templates e exportadas com a descrição; imagens podem ser vinculadas aos componentes. Não desmembra estoque nem cria combinações de kits.
- Filtros por loja, categoria e estado; contagem informa limite dos 100 registros recentes. Perguntas essenciais de requisitos/conflitos deixam de ser duplicadas por código e por contrato. Fonte explicitamente incompatível bloqueia aprovação até substituição.
- Recuperação local avaliada com três referências sintéticas e consultas com IDs distintos. Seleção fixa escolheu 1/3 referências esperadas, similaridade lexical 3/3; outra loja recebeu zero exemplos. Corpus propositalmente pequeno: NÃO comprova melhoria editorial, generalização ou aprendizado de modelo.

## Verificação
- 101/101 testes aprovados: artifacts/local-flow-2026-10-21-tests.txt.
- TypeScript e sintaxe JS aprovados.
- Navegador: salvou ficha sintética 36c7289e-30fa-4112-b3b0-a08f596c8fd1 e vinculou pedido de validação b1c82c4b-1f44-4ee8-9483-b961c6781bef. Reinício preservou vínculo. Guia sintético salvo na revisão 1 e visível em ambos os templates.
- Prévia móvel adaptada ao espaço de 343px; screenshot artifacts/local-flow-2026-10-21.png. Nenhuma aprovação de cliente foi registrada; ficha permanece draft.
- Coleta de imagens exercitada com transporte sintético; não fizemos nova coleta externa nesta rodada.
- Avaliação: artifacts/retrieval-evaluation-2026-10-21.json; repetir com node scripts/evaluate-retrieval.ts, sem API.

## Limites e próximos passos
- Ponto 1 e avaliação da qualidade semântica real permanecem adiados pelo usuário até API.
- A integração implementada é LOCAL em SQLite. Não é migração para Supabase nem execução autônoma dos oito papéis. O mesmo pedido referencia a ficha editorial; respostas não substituem os controles comerciais existentes.
- URL aceita página Shopify /products/handle; outros layouts usam entrada alternativa. Aprovar fatos/direitos não é inferido pela coleta.
- Guias/medidas precisam de fonte fornecida. Associação visual continua humana. Compatibilidade Shopify/Bling por importação real continua sem comprovação.
- Os filtros cobrem as 100 fichas recentes explicitamente informadas, não agregação global.
- Geração e QA reais, importação autorizada e liberação comercial não foram realizadas.

## Uso no painel
1. Abra Conteúdo e prévia em http://127.0.0.1:4324/.
2. Use ficha em branco, JSON ou URL; revise perfil, fatos, SKUs e imagens.
3. Salve a ficha. Vincule um pedido de validação existente ou deixe o ID vazio para criar um.
4. Informe componentes e guias quando aplicável; salve para atualizar as prévias.
5. Confira template/cor e fontes. Aprovação/exportação seguem os bloqueios locais existentes. Não acione geração de IA até configurar e validar a API.
