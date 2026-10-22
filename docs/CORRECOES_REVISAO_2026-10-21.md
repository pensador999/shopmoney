# Correções da revisão — 21/10/2026

Base atualizada por fast-forward de bde0b8b para 70b16dc. Correções locais aplicadas:

- Entrada assistida substitui a execução que inventava contato, aprovações, custos e encerramento. Analisa arquivo e sugere mapeamento, sem efeitos persistentes; repetir a análise não cria pedidos duplicados. O cadastro e a produção supervisionados existentes continuam disponíveis.
- Removida geração de ficha sintética como produto do cliente nesse caminho. Nenhuma chamada IA ou promoção automática de aprendizado ocorre nessa análise.
- Leitura legada confere hash original antes de normalizar os novos campos de mídia; cria revisão, preserva histórico e exige nova aprovação. Adulteração continua bloqueada.
- Revisão editorial invalida escopo, QA e entrega vinculados e incrementa a revisão do pedido. Pacotes antigos permanecem imutáveis.
- Conciliação CSV não pode promover automaticamente o requisito Shopify. Evidência externa continua necessária.
- Inferência não preenche campos obrigatórios pela posição das colunas. Histórico de mapeamento foi restringido também pela chave do fornecedor; isolamento completo de aprendizado por workspace/loja ainda precisa evoluir antes de operação remota multicliente.
- Interface distingue análise, simulação e aprovação; formulários de revisão continuam disponíveis. Removidas alegações de ciclo 100% autônomo e margem apurada.

Validação: 110/110 testes aprovados; TypeScript, sintaxe de public/app.js e git diff --check aprovados. Inclui regressões de migração legada, adulteração, invalidação de pacote e ausência de efeitos colaterais na análise. Não houve inspeção visual no navegador nem reinício do servidor existente.

## Supabase — aplicação bloqueada, nenhuma mudança remota

Projeto conferido: aqkwbmggkvvfhqaivxlh. A revisão automática rejeitou a aplicação de `schemas/supabase-brazil-operations.sql`: a migração concede escrita autenticada em várias tabelas, acrescenta políticas Storage e substitui claim_task. Solicitou autorização mais explícita e validação isolada suficiente. Não houve tentativa de contornar o bloqueio.

Conjunto proposto para aprovação: tabela operation_snapshots, RPC catanaops_operation SECURITY INVOKER, permissões/políticas limitadas a membros do workspace e pedidos de teste, inserção em Storage privado e exclusão das projeções de validação do dispatcher. Não altera planos pagos nem habilita cobrança. Após aprovação, validar isolamento e concorrência em ambiente isolado antes de reapresentar a migração para aplicação.

O banco ainda não contém essa ponte; as fichas editoriais e o aprendizado permanecem locais. Não apresentar o painel como integrado remotamente.

Advisors existentes: operator_bootstrap sem políticas (tabela fechada por RLS, não abrir indiscriminadamente) e proteção contra senhas vazadas desabilitada. Referência: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. Nenhuma configuração de Auth ou contratação foi alterada.

## Retomada

1. Obter aprovação explícita para o conjunto remoto acima e validar a migração de forma isolada.
2. Aplicar, confirmar schema/RPC e testar acesso anônimo negado, usuário sem vínculo, outro workspace, repetição e executor vencido.
3. Integrar persistência editorial e aprendizado com escopo completo; não transferir automaticamente registros sintéticos antigos.
4. Manter geração editorial via API adiada e operação comercial desativada.
