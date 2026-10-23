> Estado vigente e sequência de execução: [ESTADO_OPERACIONAL.md](ESTADO_OPERACIONAL.md). As datas e contagens abaixo são registros históricos.

# Modelo Supabase — primeira etapa

Destino exclusivo: `aqkwbmggkvvfhqaivxlh`. Status em 17/10/2026: desenho preparado a partir de `src/store.ts`; acesso remoto recusado. Nenhuma migração aplicada. Este documento não é SQL executável nem comprovação de integração.

## Limites e identidade

A operação possui um workspace Catana Ops, com operadores autenticados. Agências são clientes desse workspace, não operadores por padrão. Futuro portal de agência terá vínculo explícito a client_id e acesso limitado ao próprio cliente. Não conceder acesso a pedidos com base apenas em estar autenticado ou em email informado pelo navegador.

Todas as tabelas operacionais terão workspace_id. Relacionamentos compostos garantem que pedido, cliente, tarefa e arquivo pertençam ao mesmo workspace. Associação de operadores será criada por administração confiável; usuário não pode se promover usando metadados editáveis ou inserindo sua própria associação.

## Entidades previstas

| Tabela | Chave e vínculos | Conteúdo / invariantes |
|---|---|---|
| workspaces | UUID | Identidade da operação, sem segredos |
| workspace_members | workspace_id + auth user_id | Papel operator/admin; concessão administrativa |
| clients | UUID, workspace_id | Nome/email; email único por workspace |
| supplier_profiles | UUID, workspace_id, client_id, versão | Mapeamento aprovado; versões imutáveis |
| orders | UUID, workspace_id, client_id | Estado, revisão, modo test/live, preço em centavos, moeda, datas e perfil |
| order_revisions | order_id + revisão | Referências de origem, regras e relatórios; sem sobrescrever versões |
| artifacts | UUID, workspace_id, order_id, revisão | Caminho Storage privado, tipo, tamanho e hash; conteúdo fora do banco |
| order_tasks | UUID, workspace_id, order_id | Papel, estado, dependências, tentativas, prazo, entradas e resultado |
| ai_jobs | UUID, workspace_id, client_id opcional | Contexto delimitado, versão de política, orçamento, próxima tentativa e erro sanitizado |
| audit_events | UUID, workspace_id | Ator, regra, versão, evento, referências; append-only por backend |
| payment_events | provedor + ambiente + event_id | Idempotência e conciliação; escrita exclusiva do backend verificado |
| inbox / outbox | UUID, workspace_id, client_id opcional | Referências da mensagem, aprovação, idempotência e estado de envio |
| leads / suppression | workspace_id + identidade | Evidências de qualificação e recusa; recusa bloqueia campanha |
| economics_entries | UUID, workspace_id, order_id | Horas, taxas, despesas, fonte e modo simulado/real |
| leases | workspace_id + recurso | Titular, vencimento e geração; tomada atômica com proteção contra executor antigo |
| settings | workspace_id + chave | Configuração operacional; credenciais ficam em configuração segura do servidor |

Assinaturas ficam fora da primeira migração funcional: a oferta recorrente segue bloqueada por validação comercial. Nenhum registro local deve ser enviado automaticamente.

## Permissões planejadas

RLS habilitada nas tabelas expostas. Sem acesso anon a dados operacionais. Leitura autenticada apenas para membros do workspace; alterações de negócio passam por backend com validação de transição. Não expor escrita direta de status de pagamento, aprovação de QA, membro/admin ou auditoria ao navegador. Consultas privilegiadas devem validar workspace e usuário mesmo usando credencial de servidor.

Storage privado, com caminhos workspace/pedido/revisão/arquivo. Uploads e downloads autorizados por referência persistida; links assinados com validade limitada. Não aceitar um caminho arbitrário como prova de autorização. Bloquear substituição silenciosa de originais.

## Migração do código

O Store atual usa SQLite síncrono, SQL direto e transações locais. Não basta trocar uma URL. Criar interface assíncrona por operação de negócio; migrar service, payments, mail e coordenador gradualmente. Gravar pedido, tarefas e auditoria na mesma transação. Não reproduzir as operações como diversas chamadas REST sem atomicidade.

Eventos externos passam por inbox idempotente. Saídas usam outbox com chave única e reconciliação de estado incerto. Transições usam versão esperada para impedir duas execuções concorrentes. Chave de evento inclui ambiente para nunca misturar sandbox e produção.

## Critérios de aceitação antes da Vercel

1. Dois workspaces e duas identidades sintéticas: provar permissões de leitura/escrita e bloqueio de cruzamento em banco e arquivos.
2. Anon e usuário sem associação não acessam dados; membro não consegue conceder papel admin.
3. Repetir webhook, tarefa e entrega não duplica efeitos. Executor com lease vencido não conclui tarefa tomada por outro.
4. Reiniciar entre processamento e persistência mantém original e permite recuperação sem pacote duplicado.
5. Simulação continua identificada e não libera cobrança/envio real.
6. Executar testes de políticas, advisors e ensaio completo; registrar resultados e migração versionada antes de ligar o backend ao painel.

Próxima ação dependente do titular: reconectar Supabase com acesso à organização do projeto indicado. Não usar Anzol como substituto.
