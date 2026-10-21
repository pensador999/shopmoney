# Prontidão do copiloto interno — br-2026-10-19.1

Fonte canônica: src/workflow.ts. Gerado por node scripts/report-workflow.ts; o painel utiliza a mesma definição. Evidências são de testes/inspeções registrados, não monitoramento contínuo.

## Diagnóstico executivo

O copiloto local pode ser usado com dados sintéticos e supervisão. Oito papéis compartilham o executor Eve; produção e QA são código. Login e leitura Supabase confirmados pelo titular. Ponte brasileira de escrita/arquivos/executor preparada e testada em fixture; migração real não aplicada por indisponibilidade da revisão automática. Não há operação comercial liberada. Orçamento zero.

## Ofertas brasileiras em teste

- Diagnóstico de catálogo: R190.00; simulação disponível.
- Conteúdo de produto: R490.00; simulação disponível.
- Preparação de cadastro: R690.00; simulação disponível.
- Lançamento combinado: R990.00; simulação disponível.
- Padronização de imagens: R290.00; bloqueado até validação técnica.

Preços e ICP: docs/BRASIL.md. Evidências atuais e bloqueios: docs/IMPLEMENTACAO_BRASIL.md. Sem cobrança ou campanha.

## Contratos e revisão dos oito papéis

### Pesquisa

- Executor: IA assistida.
- Situação: Implementado, aguardando integração.
- Entrada: Evidências e contato publicado.
- Entrega: Qualificação fundamentada e lacunas.
- Evidência: Duas rodadas Eve com agência sintética; fontes comerciais não verificadas.
- Próxima função: Comercial.
- Ferramentas: Sem navegação própria; analisa evidências fornecidas e distingue hipótese de fato.
- Operador: Verificar fonte e aderência do candidato.
- Limitação/exceção: Não pesquisa contatos sozinho nem comprova interesse de compra.
- Procedimento: docs/agents/research.md; SHA-256 721fe6677a249179f80b7fcdcd19635b25086893fe675d510d3ba9fe11276d3f.

### Comercial

- Executor: IA assistida.
- Situação: Implementado, aguardando integração.
- Entrada: Candidato qualificado e autorização.
- Entrega: Rascunho delimitado.
- Evidência: Resposta em português, serviços BRL e leitura de resposta histórica em inglês.
- Próxima função: Atendimento.
- Ferramentas: Sem envio direto; resposta consultiva.
- Operador: Revisar escopo e autorizar comunicação.
- Limitação/exceção: Qualificação e proposta não estão conectadas ao pedido remoto.
- Procedimento: docs/agents/sales.md; SHA-256 855a4fc1963789042a8236b3580c68b151153f70be5e1de5c8b288c0af277616.

### Atendimento

- Executor: IA assistida.
- Situação: Implementado, aguardando integração.
- Entrada: Pedido e pendências.
- Entrega: Perguntas e resumo em português.
- Evidência: IMAP real e deduplicação testados; leitura em banco isolado.
- Próxima função: Planejamento.
- Ferramentas: IMAP pelo código; IA não acessa Gmail.
- Operador: Associar cliente, arquivo e requisitos.
- Limitação/exceção: Clientes conhecidos vão para atendimento; leads para comercial. Classificação semântica ambígua exige revisão.
- Procedimento: docs/agents/support.md; SHA-256 1002b8454e710268bcb0821a60960e82afa30cc341604e4119b1efb16deafc31.

### Planejamento

- Executor: Código + operador + IA.
- Situação: Implementado, aguardando integração.
- Entrada: Relatório estrutural e perfil.
- Entrega: Regras faltantes; aprovação explícita.
- Evidência: Perfis, herança pai/variante e aprovação explícita testados localmente.
- Próxima função: Financeiro, Atendimento.
- Ferramentas: Parser e validações em código; IA sugere.
- Operador: Aprovar perfil e resolver ambiguidades.
- Limitação/exceção: Contratos tipados disponíveis; integração de todos os papéis consultivos permanece supervisionada.
- Procedimento: docs/agents/planner.md; SHA-256 c1066a2240a83d1bc7a9afda4e31e95149801adaa73db8f5c00d53d620ad16b3.

### Produção

- Executor: Código; IA explica.
- Situação: Implementado e testado localmente.
- Entrada: Escopo aprovado e pagamento.
- Entrega: CSV e pacote rastreável.
- Evidência: CSV, ZIP, preservação de identificadores e rastreabilidade sintéticos.
- Próxima função: Qualidade.
- Ferramentas: Transformação determinística, sem geração de produto por IA.
- Operador: Reaprovar revisão de regras.
- Limitação/exceção: Execução local; não conectada ao Storage e pedidos remotos.
- Procedimento: docs/agents/production.md; SHA-256 468e9b4d869002e4d699429b873b0ab402e1400555d4d373f31f1f433be07832.

### Qualidade

- Executor: Código independente; IA explica.
- Situação: Implementado e testado localmente.
- Entrada: Fonte, regras e saída.
- Entrega: Conferência ou bloqueio.
- Evidência: qualityCheck compara fonte/saída e detecta adulteração sintética.
- Próxima função: Atendimento, Produção.
- Ferramentas: Comparador independente em código; IA explica.
- Operador: Resolver divergências e validar importação Shopify.
- Limitação/exceção: QA do arquivo não comprova importação na loja.
- Procedimento: docs/agents/quality.md; SHA-256 9991123d5b837c64f03613f58f88f71a7db628259521243aa781224f7fd2bc99.

### Financeiro

- Executor: Código; IA explica.
- Situação: Implementado, aguardando integração.
- Entrada: Eventos confirmados e custos.
- Entrega: Conciliação e contribuição ou pendência.
- Evidência: Pagamentos simulados, custo hipotético e encerramento em testes.
- Próxima função: Produção, Coordenação.
- Ferramentas: Adaptador Stripe em código, sem conta de teste validada.
- Operador: Conciliação excepcional, disputa e orçamento.
- Limitação/exceção: Nenhum pagamento, repasse ou assinatura real comprovado.
- Procedimento: docs/agents/finance.md; SHA-256 6a81940120c31074e68b9ed108fa402c2445663f37a9d5aaf5944d2998e37704.

### Coordenação

- Executor: Código; IA resume.
- Situação: Implementado, aguardando integração.
- Entrada: Estados persistidos.
- Entrega: Próxima ação permitida e bloqueios.
- Evidência: Responsável por estado, fila local e recuperação testados.
- Próxima função: Pesquisa, Comercial, Atendimento, Planejamento, Financeiro, Produção, Qualidade.
- Ferramentas: Estados, regras e leases em código; IA resume.
- Operador: Exceções e decisões fora da política.
- Limitação/exceção: Não existe delegação autônoma ponta a ponta; filas local/remota separadas.
- Procedimento: docs/agents/coordinator.md; SHA-256 cc6fc8aca0ed9aa1356844d32e930705da064159b1a8abfe7bc0a9a2bf3c983b.

## Fluxo e passagens

- research → sales: Fontes e candidato.
- sales → support: Necessidade e escopo.
- support → planner: Materiais completos.
- planner → finance: Perfil aprovado.
- finance → production: Confirmação financeira.
- production → quality: Arquivos e manifesto.
- quality → support: Pacote conferido.
- support → finance: Entrega e esforço.
- finance → coordinator: Encerramento e custos.
- planner → support: Dados incompletos (retorno/exceção).
- production → planner: Mapeamento divergente (retorno/exceção).
- quality → production: QA reprovado (retorno/exceção).
- finance → coordinator: Disputa ou limite excedido (retorno/exceção).

Coordenação supervisiona o conjunto. As ligações representam o processo esperado, não passagens comprovadas. IA consultiva concluída não equivale a etapa operacional concluída.

## Copiloto interno local

Ciclo sintético supervisionado e recomendações revisadas pelo operador.

### Catálogos, variantes e rastreabilidade

- Situação: evidência registrada.
- Evidência: Ensaio Brasil: quatro serviços, ZIPs sintéticos, retomada SQLite e entrega simulada. Testes atuais em docs/IMPLEMENTACAO_BRASIL.md.
- Impacto: Base técnica utilizável com dados sintéticos.
- Responsável: Produção.
- Dependência: Perfil explícito e aprovação do operador.
- Próxima ação: Repetir amostra representativa ao alterar adaptadores.
- Aceite: CSV/ZIP preservam SKU, GTIN, preço, opções e origem.

### Imagens e arquivos de referência

- Situação: parcial.
- Evidência: media-review.json associa referências por SKU, sem download.
- Impacto: Não comprova existência, direitos ou importação das imagens.
- Responsável: Planejamento.
- Dependência: Regras de associação fornecidas.
- Próxima ação: Mostrar referências como pendências de revisão.
- Aceite: Não inventar associação nem anunciar mídia publicada.

### Conferência independente

- Situação: evidência registrada.
- Evidência: Comparador por código identifica divergências artificiais em testes.
- Impacto: Bloqueia entrega de saída divergente.
- Responsável: Qualidade.
- Dependência: Fonte, perfil e saída da mesma revisão.
- Próxima ação: Manter evidência ligada à revisão.
- Aceite: Adulteração de preço/identificador/associação reprova QA.

### Contratos especializados dos oito papéis

- Situação: parcial.
- Evidência: Schemas de oito funções; planejamento, financeiro e QA por código registram contratos. Consultas Eve continuam supervisionadas.
- Impacto: Resposta válida não garante entrega correta ou próxima ação elegível.
- Responsável: Coordenação.
- Dependência: Matriz de entradas, saídas e critérios por etapa.
- Próxima ação: Conferir semântica dos oito papéis reais com as novas regras; não confundir respostas controladas com validação do modelo.
- Aceite: Entregas incompletas não liberam a próxima etapa.

### Atendimento e sequência de ações

- Situação: parcial.
- Evidência: Clientes conhecidos encaminhados a support; leads a sales. Ambiguidade comercial/suporte exige operador.
- Impacto: Perguntas redundantes ou fora de ordem.
- Responsável: Atendimento.
- Dependência: Classificação cliente/lead e estado do pedido.
- Próxima ação: Conferir mensagens de teste autorizadas; não fazer atendimento externo automático.
- Aceite: Cliente em produção recebe suporte; QA não é exigido antes da produção.

### Fila local e recuperação

- Situação: evidência registrada.
- Evidência: Testes de lease, contexto antigo, três tentativas e falta de cota.
- Impacto: Permite retomada supervisionada sem duplicar efeitos testados.
- Responsável: Coordenação.
- Dependência: Computador e processos ativos.
- Próxima ação: Exercitar falha/retomada no cenário de aceitação.
- Aceite: Executor antigo não sobrescreve resultado do substituto.

### Qualidade semântica e consumo IA

- Situação: parcial.
- Evidência: Duas rodadas Eve; contexto melhorado após perguntas redundantes.
- Impacto: Exige revisão humana das recomendações.
- Responsável: Coordenação.
- Dependência: Contratos especializados.
- Próxima ação: Adicionar avaliações por função com respostas controladas.
- Aceite: Sem avanço automático por declaração do LLM; chamadas só quando úteis.

### Documentação e regras vigentes

- Situação: parcial.
- Evidência: BRASIL.md define oferta vigente; IMPLEMENTACAO_BRASIL.md e RETOMADA distinguem local, fixture e banco real.
- Impacto: Pode orientar implementação com destinos e bloqueios antigos.
- Responsável: Operador.
- Dependência: Fonte única do workflow e relatório versionado.
- Próxima ação: Usar a fonte brasileira para novos pedidos; manter registros antigos identificados como históricos.
- Aceite: Login, 13 tabelas e limitações atuais descritos de forma consistente.

## Copiloto integrado ao Supabase

Pedido, arquivos e executor na mesma persistência remota.

### Login e leitura remota

- Situação: evidência registrada.
- Evidência: Titular confirmou Catana Ops — admin na interface; testes RLS admin/outsider/anon.
- Impacto: Identidade e leitura por workspace disponíveis.
- Responsável: Engenharia.
- Dependência: Sessão válida Supabase.
- Próxima ação: Testar expiração e logout nas novas abas.
- Aceite: Usuário sem vínculo não consulta registros.

### Criação e atualização de pedidos remotos

- Situação: pendente.
- Evidência: Cliente RPC e migração Brasil preparados; fixture passa. Banco real não alterado: revisão automática indisponível.
- Impacto: Sem ciclo remoto ponta a ponta.
- Responsável: Engenharia.
- Dependência: Repositório assíncrono e transações autorizadas.
- Próxima ação: Reinspecionar schema, aplicar migração e executar testes transacionais com rollback.
- Aceite: Pedido criado no painel persiste no Supabase sem duplicação.

### Originais e pacotes privados

- Situação: parcial.
- Evidência: Bridge privada com hashes e upload imutável testada em fixture; upload real não verificado.
- Impacto: Arquivos locais ainda não estão integrados aos pedidos remotos.
- Responsável: Engenharia.
- Dependência: Persistência remota e autorização de escrita.
- Próxima ação: Testar Storage com sessão do titular após migração; não extrair credenciais.
- Aceite: Original e ZIP recuperáveis somente pelo workspace autorizado.

### Executor remoto e acompanhamento

- Situação: parcial.
- Evidência: Processamento local serial com CAS/geração na ponte simulada. Integração remota e novos papéis Eve reais pendentes.
- Impacto: Mapa remoto não mostra atividade da fila local.
- Responsável: Engenharia.
- Dependência: Adapter remoto e protocolo de execução.
- Próxima ação: Validar lease/CAS no banco real e ensaio autenticado; sem hospedagem nesta etapa.
- Aceite: Reinício não perde etapa nem duplica produção/entrega.

### Hospedagem e disponibilidade

- Situação: pendente.
- Evidência: Não verificado: aplicação sem build hospedado completo; processos locais.
- Impacto: PC desligado interrompe processamento local.
- Responsável: Engenharia e Titular.
- Dependência: Persistência integrada e orçamento aprovado.
- Próxima ação: Preparar preview protegida após fluxo remoto.
- Aceite: Ciclo com retomada e autenticação aprovado; sem contratação automática.

## Operação comercial

Integrações, termos, capacidade e autorização comercial comprovados.

### Email operacional

- Situação: parcial.
- Evidência: IMAP e deduplicação reais; SMTP Auth configurado; envio operacional não testado.
- Impacto: Receber não comprova entregar emails ao cliente.
- Responsável: Titular e Atendimento.
- Dependência: Destinatário de teste e autorização explícita de envio.
- Próxima ação: Validar envio supervisionado, recusas e conciliação de SMTP incerto.
- Aceite: Mensagem de teste recebida e efeito registrado sem duplicação.

### Importação Shopify

- Situação: pendente.
- Evidência: Não verificado: nenhuma importação em loja de teste comprovada.
- Impacto: Não anunciar compatibilidade comprovada.
- Responsável: Titular e Qualidade.
- Dependência: Ambiente de teste autorizado.
- Próxima ação: Importar amostra sintética e conferir variantes/valores.
- Aceite: Evidência de importação e conferência dos campos protegidos.

### Recebimento e assinatura

- Situação: pendente.
- Evidência: Testes locais; sem Stripe sandbox, cobrança internacional ou repasse comprovados.
- Impacto: Não liberar cobrança real ou recorrência.
- Responsável: Titular e Financeiro.
- Dependência: Cadastro, credenciais seguras e testes do processador.
- Próxima ação: Sandbox e conciliação; recorrência somente após recompra.
- Aceite: Eventos autenticados, moeda/valor corretos e ausência de duplicação.

### Custos e capacidade

- Situação: parcial.
- Evidência: BRL, R$60/h, tributos explícitos e meta 40%; legado USD25/h preservado. Nenhuma contribuição real comprovada.
- Impacto: Margem comercial desconhecida.
- Responsável: Financeiro.
- Dependência: Horas completas e recebimento real.
- Próxima ação: Medir esforço total e custos no piloto, sem somar moedas.
- Aceite: Contribuição medida, separada de lucro e simulação.

### Oferta, termos e campanha

- Situação: pendente.
- Evidência: Oferta piloto proposta; nenhuma campanha ou receita comprovada.
- Impacto: Não iniciar contatos ou compromissos comerciais.
- Responsável: Titular e Comercial.
- Dependência: Termos, identidade, capacidade e autorização.
- Próxima ação: Revisar ICP, material e destinatários antes de autorizar.
- Aceite: Oferta aprovada, campanha autorizada e piloto supervisionado.

## Prioridade e participação manual

1. Consolidar orientação e regras; corrigir encaminhamento de atendimento/comercial.
2. Implementar respostas especializadas e validar próxima ação pelo estado do pedido.
3. Integrar escrita remota, arquivos e executor com recuperação.
4. Repetir cenário sintético com dados ausentes, QA reprovado, cancelamento e retomada.
5. Para comercial: titular disponibiliza loja de teste, configura processador sandbox, aprova identidade/termos e autoriza destinatários/campanha. Nenhum desses itens bloqueia o uso local supervisionado.

## Limites das evidências

31 testes, 11 verificações verticais e duas rodadas Eve referem-se às validações registradas anteriores. Testes atuais da nova interface devem constar na RETOMADA. Testes SQL de autorização usam transações revertidas e não substituem login real. A lista remota é limitada; agregados são calculados sobre toda a fonte autorizada. Revisões antigas são histórico. Custos hipotéticos não representam receita ou margem comprovada. Hospedagem e API paga continuam dependentes de aprovação de orçamento.
