# Arquitetura e conexão com os repositórios de trabalho

`entrada CSV/XLSX → perfil aprovado → pai/variantes → validação → Shopify CSV → conferência independente → pacote → aplicação pela agência → retorno/aceite`

- `catalog.ts`: núcleo puro, sem APIs e sem IA. Preserva chaves e regras da origem.
- `service.ts` + `store.ts`: estados, isolamento, arquivos originais, histórico, qualidade e entrega.
- `payments.ts`, `mail.ts`, `runtime.ts`: adaptadores e execução serial com efeitos externos controlados.
- `agents.ts` + Eve 0.80.0: sete funções lógicas, sessão separada por tarefa, sem ferramentas arbitrárias ou memória compartilhada entre clientes. Não há sete processos independentes consumindo tokens.
- `worker/`: inbox pública mínima de pagamentos; SQLite local continua sendo a fonte operacional.

## Ponto de integração de cada repositório

| Repositório | Responsabilidade identificada no Tripo | Contrato necessário antes de reaproveitar código |
|---|---|---|
| HOOK-PRIME | Famílias, variantes, mídia e carga Bling | Adaptador de origem que devolva tabela + mapeamento explícito; sem copiar dimensões/preços fixos |
| DATA-SUITE-SANKHYA | Conversão, classificação, SKU/EAN | Identificar conversor ativo; provar equivalência com amostra e reconciliação |
| SCRIPTS-TAMPERMONKEY | Aplicação repetitiva nas interfaces | Adaptador separado de implantação, somente em outro escopo autorizado |
| DESCRI-OES-PRODUTOS | Conteúdo e descrições BRK | Perfil de conteúdo por cliente; não confundir descrição com criação de variante |

Não foram encontrados checkouts desses quatro projetos na pasta HIGH. Nenhum código foi transplantado ou executado nesta implementação. A lógica discutida foi incorporada; integração de código depende de identificar as versões usadas no trabalho e testar amostras autorizadas. Isso evita conectar um conversor legado por engano.

## Interfaces locais

Painel em `127.0.0.1:4318`; API exige token da sessão do painel, Host local e origem compatível. Endpoints: estado, preview, pedidos, ações, revisão, download, evidências, agentes e campanha. Não expor o painel em túnel público.

Originais e pacotes são blobs associados ao pedido, não caminhos recebidos do cliente. Downloads conferem cliente/pedido. O operador local administra todos os clientes; não existe portal multiusuário.
