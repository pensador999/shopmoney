# Estado do projeto — 16/10/2026

Atualização técnica 17/10: ler [liberação Vercel](LIBERACAO_VERCEL.md). Supabase acessível, 12 tabelas e bucket privado criados, testes de fila remota passaram. Painel recebeu quadro de responsáveis e análises vinculadas ao pedido; 28 testes locais passaram. Aplicativo ainda usa SQLite; não há login nem executor remoto conectado. Essa atualização substitui os bloqueios antigos de acesso mencionados em documentos anteriores.

## Objetivo comercial

Preparação e conferência de catálogos de fornecedores para pequenas agências Shopify dos EUA. Hipótese inicial: US$149 por um fornecedor, até 50 produtos e 500 variantes, ambos os limites aplicáveis; produtos novos em rascunho. A agência importa o pacote. Preço e demanda ainda não comprovados por vendas.

Margem de contribuição proposta: recebimento líquido menos taxas, custos variáveis e todas as horas a US$25/h. Não confundir demonstração com receita nem contribuição com lucro contábil. Recorrência de US$399/mês só será avaliada após dois pilotos satisfatórios e necessidade repetida.

## Evidências locais existentes

- Entrada CSV/XLSX, perfis pai/variante, originais preservados, conferência e pacote ZIP.
- Persistência SQLite, etapas por responsável, auditoria, interrupção e retomada.
- Painel em português, simulação de pagamento, entrega e encerramento.
- Biblioteca de cabeçalhos Bling 59, Sankhya 45 e saída Shopify; testes somente sintéticos.
- Última execução registrada: 27 testes aprovados e verificação TypeScript sem erros. Isso não valida serviços externos.
- Funções de agentes separadas; não há oito agentes autônomos operando comercialmente.

## Integrações e identidade

- Nome operacional: Catana Ops. Repositório: Shopmoney. Aplicação: catalog-ops.
- Email informado pelo titular: catanaops@gmail.com; plugin Gmail instalado segundo o titular. Conexão do plugin e integração própria do aplicativo ainda não verificadas.
- Gmail/Stripe/recepção pública e importação Shopify ainda precisam de configuração e testes externos.
- Twilio não integra o escopo inicial e não foi autenticado por este trabalho.
- Servidor local não equivale a hospedagem 24/7. Não houve publicação de infraestrutura.

## Próximas entregas, em ordem

1. Conectar a caixa dedicada ao aplicativo e testar recebimento e rascunhos; envio externo requer autorização específica.
2. Configurar Stripe em sandbox; validar Checkout, webhook, conciliação e isolamento de produção.
3. Importar amostra sintética em loja Shopify de teste e registrar resultado.
4. Finalizar identidade, termos, capacidade e custos; decidir infraestrutura mínima após validar integrações.
5. Autorizar explicitamente campanha antes de qualquer contato comercial. Medir dois pilotos independentes e uma recompra antes de ampliar.

## Limites vigentes

Continuar validação local. Não enviar contatos, cobrar clientes, publicar em lojas reais, contratar serviços ou comprar créditos automaticamente. Falta de acesso, cota ou regra suspende a etapa e gera pendência. Dados e materiais BRK não fazem parte deste repositório; somente a estrutura autorizada e referências técnicas são reutilizadas.
