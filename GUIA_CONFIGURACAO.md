# Configuração e uso local

## 1. Iniciar

Requisito: Node 24.19 ou superior da série 24, npm e Codex autenticado no ChatGPT.

```powershell
cd C:\Users\Pichau\Documents\HIGH\catalog-ops
npm ci
npm run typecheck
npm test
npm run demo
npm start
```

Abra http://127.0.0.1:4318. `npm run demo` cria um pedido sintético e salva seu ZIP em `artifacts/`. No painel, use **Pedidos e arquivos → Baixar pacote**. Nenhum pagamento ou email é enviado pela demonstração.

`npm run doctor` mostra pendências sem imprimir segredos. `node src/cli.ts backup` cria cópia consistente do SQLite em `backups/`; o banco contém arquivos e histórico. Guarde cópias fora do computador por um método escolhido por você. Não publique dados, backups ou `.env` no Git.

## 2. Habilitar IA local

Em outro terminal, execute `npm run agents`. Esse comando desliga ferramentas e extensões de desenvolvimento que permitiriam executar comandos ou alterar o próprio agente. Usa Eve **0.80.0** com `chatgpt()`, sem API paga.

Copie `.env.example` para `.env` e altere `AI_ENABLED=true`. Reinicie `npm start`. As tarefas são processadas uma por vez a cada minuto. O computador e os dois processos precisam continuar abertos. Bloquear a tela não deve encerrar os terminais; suspensão do Windows interrompe o processamento.

Se a cota acabar, a tarefa fica `paused`, com tentativas de 15 minutos até seis horas. Dados anteriores permanecem no banco. Resposta inválida fica `needs_attention`. Não há compra de créditos. O login é controlado pelo Codex; não copie arquivos de autenticação para o projeto.

No Windows, se o Eve falhar ao criar links simbólicos, execute pelo ambiente que já iniciou com sucesso ou configure suporte a links de desenvolvimento. Não desative controles de segurança globalmente.

## 3. Gmail

Use uma caixa dedicada, com autenticação em duas etapas e senha de app quando disponível. Configure `GMAIL_USER` e `GMAIL_APP_PASSWORD` somente no `.env` local. Não cole senhas neste chat.

Primeiro mantenha `MAIL_SEND_ENABLED=false`. Teste leitura e recebimento com uma mensagem sua. A IA resume mensagens de clientes/leads conhecidos; mensagens desconhecidas ficam visíveis para triagem. Anexos não são importados automaticamente: confirme o cliente e o mapeamento em **Pedidos e arquivos**.

Somente após testar o recebimento, configurar identidade e revisar os templates, habilite o envio. A aprovação de uma mensagem não envia imediatamente: o executor verifica as políticas e o ambiente. Propostas e entregas de sandbox e de demonstração nunca são enviadas.

SMTP não fornece garantia universal de exatamente um envio. Em caso de interrupção após transmissão, o sistema marca `uncertain` e procura o Message-ID na pasta Enviados. Se não encontrar, exige revisão; não repete cegamente.

## 4. Stripe + Inter

Você faz cadastro e verificação da conta Stripe com sua identidade. Configure a conta Inter de mesma titularidade no Dashboard da Stripe. Não precisamos de senha ou API do Inter.

Comece em **sandbox separado**. Use uma chave restrita `rk_test_` com acesso somente a Checkout Sessions, leitura dos recursos necessários para reconciliação e reembolsos quando for testar essa função. Coloque em `STRIPE_RESTRICTED_KEY`.

O módulo utiliza Stripe SDK **23.0.0**, com a versão de API padrão correspondente. Configure a versão do endpoint de webhook compatível no Dashboard. Eventos necessários: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.*`, `payout.*`.

Para o receptor público:

1. Crie uma conta Cloudflare Free e um banco D1 `catalog-ops-events`.
2. Preencha o ID real em `worker/wrangler.jsonc`; mantenha plano gratuito.
3. Aplique `worker/schema.sql` no D1 e publique `worker/index.ts` usando Wrangler.
4. Configure os secrets `STRIPE_WEBHOOK_SECRET` e `SYNC_TOKEN` no Worker.
5. Cadastre o endpoint `https://SEU-WORKER.workers.dev/webhook` na Stripe.
6. No `.env` local, configure `PUBLIC_URL` e `PAYMENT_SYNC_TOKEN` com URL/token correspondentes. Separe recursos e segredos de sandbox e produção.
7. Gere um checkout de teste pelo painel, pague com cartão de teste do próprio sandbox e confirme: evento recebido, pedido na fila, pacote criado e evento reconhecido sem duplicação.

O Worker guarda somente campos financeiros mínimos, sem dados de cartão, endereço ou email. O computador busca eventos e confirma o recebimento. Webhooks repetidos são deduplicados. Eventos perdidos de checkout pago também são conciliados pela API.

A evidência de repasse bancário exige uma operação real compatível com a conta; sandbox não prova repasse. Não marque essa etapa como concluída por um teste fictício. O primeiro piloto supervisionado pode servir para verificar esse repasse, mas a campanha automática permanece bloqueada até a verificação. A liberação do primeiro checkout real exige remover apenas o gate de repasse do bloqueio técnico — tratado no código como exceção explícita de primeiro piloto, com evidência de habilitação USD.

## 5. Importação Shopify e perfil por fornecedor

O mapeamento relaciona colunas de origem a produto pai, título, SKU, preço, código de barras e opções. `supplierKey` identifica o fornecedor e deve se manter nos lotes dele; não reutilize a mesma chave para fornecedores diferentes. O sistema acrescenta o namespace do cliente.

Teste o ZIP gerado em uma loja de desenvolvimento autorizada. Confira contagem de pais e variantes, zeros dos identificadores, opções, preço, rascunho/não publicado, texto e campos dependentes. Confira defaults de imposto, envio e estoque da plataforma antes de publicar. Não marcar overwrite. O serviço gera arquivos, não acessa sua loja.

Referências de imagens opcionais geram apenas `media-review.json`. Não foram implementados download, hospedagem ou edição de mídia. Nenhuma métrica de conteúdo é chamada de conversão.

## 6. Comercial e limites atuais

As telas permitem registrar candidatos, fonte do serviço e página do contato. Qualifique após verificar os fatos. O sistema gera templates, limita cinco contatos/dia e um acompanhamento; não pesquisa nem inventa endereços de email. A campanha começa desativada.

Ainda não existe uma lista de 30 agências qualificadas nem validação de preço. O plano de assinatura é uma hipótese bloqueada: não há cobrança recorrente ativa nesta versão. Implementar Billing e testar o ciclo de assinatura somente após dois pilotos pagos independentes, margem medida e demanda de repetição. Antes de ativá-lo, verificar obrigações tributárias aplicáveis; habilitar Stripe Tax sem registros fiscais pertinentes não resolve essas obrigações.

## Referências técnicas

- Shopify CSV: https://help.shopify.com/en/manual/products/import-export/using-csv
- Eve instalado: `node_modules/eve/docs/README.md`
- Stripe: https://docs.stripe.com/checkout/fulfillment
- Cloudflare: https://developers.cloudflare.com/workers/platform/limits/
