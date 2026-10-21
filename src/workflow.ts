import { agentContracts, type AgentRole, businessContext } from './business-context.ts';
import { agentPlaybook } from './agent-playbooks.ts';
import { offers, recurringOffer, offerVersion } from './offers.ts';

export type ReadinessItem = {
  id: string; area: string; milestone: 'local'|'remote'|'commercial'; status: 'partial'|'verified'|'pending';
  evidence: string; impact: string; owner: string; dependency: string; next: string; acceptance: string;
};
const procedures: Record<AgentRole, {state:string; evidence:string; next:AgentRole[]; tools:string; human:string; limitation:string}> = {
  research:{state:'Implementado, aguardando integração',evidence:'Duas rodadas Eve com agência sintética; fontes comerciais não verificadas.',next:['sales'],tools:'Sem navegação própria; analisa evidências fornecidas e distingue hipótese de fato.',human:'Verificar fonte e aderência do candidato.',limitation:'Não pesquisa contatos sozinho nem comprova interesse de compra.'},
  sales:{state:'Implementado, aguardando integração',evidence:'Resposta em português, serviços BRL e leitura de resposta histórica em inglês.',next:['support'],tools:'Sem envio direto; resposta consultiva.',human:'Revisar escopo e autorizar comunicação.',limitation:'Qualificação e proposta não estão conectadas ao pedido remoto.'},
  support:{state:'Implementado, aguardando integração',evidence:'IMAP real e deduplicação testados; leitura em banco isolado.',next:['planner'],tools:'IMAP pelo código; IA não acessa Gmail.',human:'Associar cliente, arquivo e requisitos.',limitation:'Clientes conhecidos vão para atendimento; leads para comercial. Classificação semântica ambígua exige revisão.'},
  planner:{state:'Implementado, aguardando integração',evidence:'Perfis, herança pai/variante e aprovação explícita testados localmente.',next:['finance','support'],tools:'Parser e validações em código; IA sugere.',human:'Aprovar perfil e resolver ambiguidades.',limitation:'Contratos tipados disponíveis; integração de todos os papéis consultivos permanece supervisionada.'},
  finance:{state:'Implementado, aguardando integração',evidence:'Pagamentos simulados, custo hipotético e encerramento em testes.',next:['production','coordinator'],tools:'Adaptador Stripe em código, sem conta de teste validada.',human:'Conciliação excepcional, disputa e orçamento.',limitation:'Nenhum pagamento, repasse ou assinatura real comprovado.'},
  production:{state:'Implementado e testado localmente',evidence:'CSV, ZIP, preservação de identificadores e rastreabilidade sintéticos.',next:['quality'],tools:'Transformação determinística, sem geração de produto por IA.',human:'Reaprovar revisão de regras.',limitation:'Execução local; não conectada ao Storage e pedidos remotos.'},
  quality:{state:'Implementado e testado localmente',evidence:'qualityCheck compara fonte/saída e detecta adulteração sintética.',next:['support','production'],tools:'Comparador independente em código; IA explica.',human:'Resolver divergências e validar importação Shopify.',limitation:'QA do arquivo não comprova importação na loja.'},
  coordinator:{state:'Implementado, aguardando integração',evidence:'Responsável por estado, fila local e recuperação testados.',next:['research','sales','support','planner','finance','production','quality'],tools:'Estados, regras e leases em código; IA resume.',human:'Exceções e decisões fora da política.',limitation:'Não existe delegação autônoma ponta a ponta; filas local/remota separadas.'},
};
export const workflowStages = [
  {id:'research',role:'research',label:'Pesquisa',requires:[]},
  {id:'sales',role:'sales',label:'Qualificação comercial',requires:['research']},
  {id:'intake',role:'support',label:'Materiais completos',requires:['sales']},
  {id:'plan',role:'planner',label:'Mapeamento aprovado',requires:['intake']},
  {id:'payment',role:'finance',label:'Pagamento / simulação identificada',requires:['plan']},
  {id:'production',role:'production',label:'Produção',requires:['payment']},
  {id:'quality',role:'quality',label:'Qualidade',requires:['production']},
  {id:'delivery',role:'support',label:'Entrega',requires:['quality']},
  {id:'economics',role:'finance',label:'Esforço e custos',requires:['delivery']},
  {id:'close',role:'coordinator',label:'Encerramento',requires:['delivery']},
] as const;
export const workflowEdges = [
  {from:'research',to:'sales',label:'Fontes e candidato'}, {from:'sales',to:'support',label:'Necessidade e escopo'},
  {from:'support',to:'planner',label:'Materiais completos'}, {from:'planner',to:'finance',label:'Perfil aprovado'},
  {from:'finance',to:'production',label:'Confirmação financeira'}, {from:'production',to:'quality',label:'Arquivos e manifesto'},
  {from:'quality',to:'support',label:'Pacote conferido'}, {from:'support',to:'finance',label:'Entrega e esforço'},
  {from:'finance',to:'coordinator',label:'Encerramento e custos'},
  {from:'planner',to:'support',label:'Dados incompletos',exception:true},
  {from:'production',to:'planner',label:'Mapeamento divergente',exception:true},
  {from:'quality',to:'production',label:'QA reprovado',exception:true},
  {from:'finance',to:'coordinator',label:'Disputa ou limite excedido',exception:true},
] as const;
export const stageProjection = {
  plan:{flag:'scope_approved',active:['scoped','revision_approval']},
  payment:{flag:'payment_confirmed',active:['awaiting_payment']},
  production:{done:['ready','delivered','closed'],running:['running'],queued:['queued']},
  quality:{active:['needs_attention']},
  intake:{active:['needs_info']},
  delivery:{done:['delivered','closed'],active:['ready']},
  close:{done:['closed'],active:['delivered']},
} as const;

export const readiness: ReadinessItem[] = [
  {id:'local-cycle',area:'Catálogos, variantes e rastreabilidade',milestone:'local',status:'verified',evidence:'31 testes registrados; simulação vertical com 3 pais/6 variantes e 11 verificações.',impact:'Base técnica utilizável com dados sintéticos.',owner:'Produção',dependency:'Perfil explícito e aprovação do operador.',next:'Repetir amostra representativa ao alterar adaptadores.',acceptance:'CSV/ZIP preservam SKU, GTIN, preço, opções e origem.'},
  {id:'media',area:'Imagens e arquivos de referência',milestone:'local',status:'partial',evidence:'media-review.json associa referências por SKU, sem download.',impact:'Não comprova existência, direitos ou importação das imagens.',owner:'Planejamento',dependency:'Regras de associação fornecidas.',next:'Mostrar referências como pendências de revisão.',acceptance:'Não inventar associação nem anunciar mídia publicada.'},
  {id:'qa',area:'Conferência independente',milestone:'local',status:'verified',evidence:'Comparador por código identifica divergências artificiais em testes.',impact:'Bloqueia entrega de saída divergente.',owner:'Qualidade',dependency:'Fonte, perfil e saída da mesma revisão.',next:'Manter evidência ligada à revisão.',acceptance:'Adulteração de preço/identificador/associação reprova QA.'},
  {id:'contracts',area:'Contratos especializados dos oito papéis',milestone:'local',status:'partial',evidence:'MD por função carregado e versão registrada; Resposta consultiva compatível com histórico; schemas especializados implementados separadamente.',impact:'Resposta válida não garante entrega correta ou próxima ação elegível.',owner:'Coordenação',dependency:'Matriz de entradas, saídas e critérios por etapa.',next:'Criar schemas por função e validação de passagem.',acceptance:'Entregas incompletas não liberam a próxima etapa.'},
  {id:'routing',area:'Atendimento e sequência de ações',milestone:'local',status:'partial',evidence:'Recebimento Gmail testado; cliente conhecido agora encaminhado a support.',impact:'Perguntas redundantes ou fora de ordem.',owner:'Atendimento',dependency:'Classificação cliente/lead e estado do pedido.',next:'Separar atendimento de comercial e validar próxima ação.',acceptance:'Cliente em produção recebe suporte; QA não é exigido antes da produção.'},
  {id:'recovery',area:'Fila local e recuperação',milestone:'local',status:'verified',evidence:'Testes de lease, contexto antigo, três tentativas e falta de cota.',impact:'Permite retomada supervisionada sem duplicar efeitos testados.',owner:'Coordenação',dependency:'Computador e processos ativos.',next:'Exercitar falha/retomada no cenário de aceitação.',acceptance:'Executor antigo não sobrescreve resultado do substituto.'},
  {id:'context',area:'Qualidade semântica e consumo IA',milestone:'local',status:'partial',evidence:'Duas rodadas Eve; contexto melhorado após perguntas redundantes.',impact:'Exige revisão humana das recomendações.',owner:'Coordenação',dependency:'Contratos especializados.',next:'Adicionar avaliações por função com respostas controladas.',acceptance:'Sem avanço automático por declaração do LLM; chamadas só quando úteis.'},
  {id:'docs',area:'Documentação e regras vigentes',milestone:'local',status:'partial',evidence:'RETOMADA atualizada; documentos antigos misturam estados superados.',impact:'Pode orientar implementação com destinos e bloqueios antigos.',owner:'Operador',dependency:'Fonte única do workflow e relatório versionado.',next:'Substituir documentos de status contraditórios por referências atuais.',acceptance:'Login, 13 tabelas e limitações atuais descritos de forma consistente.'},
  {id:'identity',area:'Login e leitura remota',milestone:'remote',status:'verified',evidence:'Titular confirmou Catana Ops — admin na interface; testes RLS admin/outsider/anon.',impact:'Identidade e leitura por workspace disponíveis.',owner:'Engenharia',dependency:'Sessão válida Supabase.',next:'Testar expiração e logout nas novas abas.',acceptance:'Usuário sem vínculo não consulta registros.'},
  {id:'writes',area:'Criação e atualização de pedidos remotos',milestone:'remote',status:'pending',evidence:'Não verificado: Service continua SQLite; painel remoto somente leitura.',impact:'Sem ciclo remoto ponta a ponta.',owner:'Engenharia',dependency:'Repositório assíncrono e transações autorizadas.',next:'Integrar pedidos, revisões, tarefas e auditoria.',acceptance:'Pedido criado no painel persiste no Supabase sem duplicação.'},
  {id:'storage',area:'Originais e pacotes privados',milestone:'remote',status:'partial',evidence:'Bucket privado e política de leitura existem; upload/download do pipeline não testados.',impact:'Arquivos locais ainda não estão integrados aos pedidos remotos.',owner:'Engenharia',dependency:'Persistência remota e autorização de escrita.',next:'Conectar Storage com hash, revisão e leitura privada.',acceptance:'Original e ZIP recuperáveis somente pelo workspace autorizado.'},
  {id:'worker',area:'Executor remoto e acompanhamento',milestone:'remote',status:'partial',evidence:'Dispatcher SQL testado; Eve e Service locais separados das tarefas Supabase.',impact:'Mapa remoto não mostra atividade da fila local.',owner:'Engenharia',dependency:'Adapter remoto e protocolo de execução.',next:'Conectar executor ao mesmo pedido e testar concorrência.',acceptance:'Reinício não perde etapa nem duplica produção/entrega.'},
  {id:'mail',area:'Email operacional',milestone:'commercial',status:'partial',evidence:'IMAP e deduplicação reais; SMTP Auth configurado; envio operacional não testado.',impact:'Receber não comprova entregar emails ao cliente.',owner:'Titular e Atendimento',dependency:'Destinatário de teste e autorização explícita de envio.',next:'Validar envio supervisionado, recusas e conciliação de SMTP incerto.',acceptance:'Mensagem de teste recebida e efeito registrado sem duplicação.'},
  {id:'shopify',area:'Importação Shopify',milestone:'commercial',status:'pending',evidence:'Não verificado: nenhuma importação em loja de teste comprovada.',impact:'Não anunciar compatibilidade comprovada.',owner:'Titular e Qualidade',dependency:'Ambiente de teste autorizado.',next:'Importar amostra sintética e conferir variantes/valores.',acceptance:'Evidência de importação e conferência dos campos protegidos.'},
  {id:'payments',area:'Recebimento e assinatura',milestone:'commercial',status:'pending',evidence:'Testes locais; sem Stripe sandbox, cobrança internacional ou repasse comprovados.',impact:'Não liberar cobrança real ou recorrência.',owner:'Titular e Financeiro',dependency:'Cadastro, credenciais seguras e testes do processador.',next:'Sandbox e conciliação; recorrência somente após recompra.',acceptance:'Eventos autenticados, moeda/valor corretos e ausência de duplicação.'},
  {id:'economics',area:'Custos e capacidade',milestone:'commercial',status:'partial',evidence:'Cálculo local existe; horas e taxas dos cenários são hipóteses; orçamento zero.',impact:'Margem comercial desconhecida.',owner:'Financeiro',dependency:'Horas completas e recebimento real.',next:'Medir esforço por etapa e capacidade antes de prometer volume.',acceptance:'Contribuição medida, separada de lucro e simulação.'},
  {id:'hosting',area:'Hospedagem e disponibilidade',milestone:'remote',status:'pending',evidence:'Não verificado: aplicação sem build hospedado completo; processos locais.',impact:'PC desligado interrompe processamento local.',owner:'Engenharia e Titular',dependency:'Persistência integrada e orçamento aprovado.',next:'Preparar preview protegida após fluxo remoto.',acceptance:'Ciclo com retomada e autenticação aprovado; sem contratação automática.'},
  {id:'commercial',area:'Oferta, termos e campanha',milestone:'commercial',status:'pending',evidence:'Oferta piloto proposta; nenhuma campanha ou receita comprovada.',impact:'Não iniciar contatos ou compromissos comerciais.',owner:'Titular e Comercial',dependency:'Termos, identidade, capacidade e autorização.',next:'Revisar ICP, material e destinatários antes de autorizar.',acceptance:'Oferta aprovada, campanha autorizada e piloto supervisionado.'},
];

const brazilReadiness:Record<string,Partial<ReadinessItem>>={
  'local-cycle':{evidence:'Ensaio Brasil: quatro serviços, ZIPs sintéticos, retomada SQLite e entrega simulada. Testes atuais em docs/IMPLEMENTACAO_BRASIL.md.'},
  contracts:{evidence:'Schemas de oito funções; planejamento, financeiro e QA por código registram contratos. Consultas Eve continuam supervisionadas.',next:'Conferir semântica dos oito papéis reais com as novas regras; não confundir respostas controladas com validação do modelo.'},
  routing:{evidence:'Clientes conhecidos encaminhados a support; leads a sales. Ambiguidade comercial/suporte exige operador.',next:'Conferir mensagens de teste autorizadas; não fazer atendimento externo automático.'},
  writes:{evidence:'Cliente RPC e migração Brasil preparados; fixture passa. Banco real não alterado: revisão automática indisponível.',next:'Reinspecionar schema, aplicar migração e executar testes transacionais com rollback.'},
  storage:{evidence:'Bridge privada com hashes e upload imutável testada em fixture; upload real não verificado.',next:'Testar Storage com sessão do titular após migração; não extrair credenciais.'},
  worker:{evidence:'Processamento local serial com CAS/geração na ponte simulada. Integração remota e novos papéis Eve reais pendentes.',next:'Validar lease/CAS no banco real e ensaio autenticado; sem hospedagem nesta etapa.'},
  economics:{evidence:'BRL, R$60/h, tributos explícitos e meta 40%; legado USD25/h preservado. Nenhuma contribuição real comprovada.',next:'Medir esforço total e custos no piloto, sem somar moedas.'},
  docs:{evidence:'BRASIL.md define oferta vigente; IMPLEMENTACAO_BRASIL.md e RETOMADA distinguem local, fixture e banco real.',next:'Usar a fonte brasileira para novos pedidos; manter registros antigos identificados como históricos.'},
};

export function workflowDefinition() {
  return {version:'br-2026-10-19.1',businessVersion:businessContext.version,source:'Definição do projeto',
    services:{offers,recurringOffer,offerVersion,locale:'pt-BR',currency:'BRL',commercialEnabled:false},
    roles:Object.entries(agentContracts).map(([id,contract])=>({id,...contract,...procedures[id as AgentRole],procedure:`docs/agents/${id}.md`,procedureVersion:agentPlaybook(id as AgentRole).version})),
    stages:workflowStages,edges:workflowEdges,readiness:readiness.map(item=>({...item,...brazilReadiness[item.id]})),projections:stageProjection,
    milestones:[{id:'local',label:'Copiloto interno local',criterion:'Ciclo sintético supervisionado e recomendações revisadas pelo operador.'},{id:'remote',label:'Copiloto integrado ao Supabase',criterion:'Pedido, arquivos e executor na mesma persistência remota.'},{id:'commercial',label:'Operação comercial',criterion:'Integrações, termos, capacidade e autorização comercial comprovados.'}],
  };
}

// Pure projection: no agent response can change an order's operational state.
export function projectStages(order: {status:string;scope_approved?:boolean;payment_confirmed?:boolean}|null) {
  return workflowStages.map(stage=>{
    if (!order || ['research','sales'].includes(stage.id)) return {...stage,state:'unverified',evidence:'Sem evidência operacional nesta fonte.'};
    if (['cancelled','refunded','refund_pending'].includes(order.status)) return {...stage,state:'cancelled',evidence:'Pedido interrompido; histórico deve ser consultado nas tarefas.'};
    const rule=stageProjection[stage.id as keyof typeof stageProjection] as {flag?:string;done?:readonly string[];running?:readonly string[];queued?:readonly string[];active?:readonly string[]}|undefined;
    let state='unverified';
    if(rule){
      if(rule.flag&&(order as any)[rule.flag])state='done';
      else if(rule.done?.includes(order.status))state='done';
      else if(rule.running?.includes(order.status))state='running';
      else if(rule.queued?.includes(order.status))state='queued';
      else if(rule.active?.includes(order.status))state='action_required';
      else state=['plan','payment','production','delivery','close'].includes(stage.id)?'blocked':'unverified';
    }
    return {...stage,state,evidence:'Projeção do estado persistido; não é conclusão por IA.'};
  });
}
