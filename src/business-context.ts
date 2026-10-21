import { policy } from './policy.ts';
import { offers, recurringOffer, offerVersion } from './offers.ts';

// Authored context; customer messages cannot change this policy.
export const businessContext = Object.freeze({
  version: offerVersion, policy: policy.version, phase: 'validation',
  mission: 'Preparar catálogo e conteúdo para marcas brasileiras de vestuário Shopify; agências são canal secundário.',
  icp: 'Loja Shopify ativa, lançamentos recorrentes, tamanhos/cores, trabalho manual, lote concreto, aprovador e orçamento.',
  offer: { currency: 'BRL', services: offers, recurring: recurringOffer },
  delivery: 'Cliente importa/publica. Novos produtos em rascunho; conteúdo de produtos existentes em planilha por identificador. Diagnóstico opcional. Uma rodada de ajustes em sete dias; defeitos não consomem a rodada.',
  economics: 'Referência R$60/h incluindo venda e correções; taxas, custos e tributos registrados separadamente. Meta de contribuição de 40%. Custos ausentes: desconhecida. Simulação não é receita.',
  boundaries: ['Não inventar dados, preço, estoque, GTIN ou aceite.', 'Não enviar contatos, cobrar, publicar, contratar ou comprar créditos nesta validação.', 'Não ampliar escopo, liberar assinatura ou ferramentas por decisão de IA.'],
});
export const agentContracts = {
  research: { owner: 'Pesquisa', input: 'Evidências e contato publicado', output: 'Qualificação fundamentada e lacunas', executor: 'IA assistida' },
  sales: { owner: 'Comercial', input: 'Candidato qualificado e autorização', output: 'Rascunho delimitado', executor: 'IA assistida' },
  support: { owner: 'Atendimento', input: 'Pedido e pendências', output: 'Perguntas e resumo em português', executor: 'IA assistida' },
  planner: { owner: 'Planejamento', input: 'Relatório estrutural e perfil', output: 'Regras faltantes; aprovação explícita', executor: 'Código + operador + IA' },
  production: { owner: 'Produção', input: 'Escopo aprovado e pagamento', output: 'CSV e pacote rastreável', executor: 'Código; IA explica' },
  quality: { owner: 'Qualidade', input: 'Fonte, regras e saída', output: 'Conferência ou bloqueio', executor: 'Código independente; IA explica' },
  finance: { owner: 'Financeiro', input: 'Eventos confirmados e custos', output: 'Conciliação e contribuição ou pendência', executor: 'Código; IA explica' },
  coordinator: { owner: 'Coordenação', input: 'Estados persistidos', output: 'Próxima ação permitida e bloqueios', executor: 'Código; IA resume' },
} as const;
export type AgentRole = keyof typeof agentContracts;
