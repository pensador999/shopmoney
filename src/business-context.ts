import { policy } from './policy.ts';

// Authored context; customer messages cannot change this policy.
export const businessContext = Object.freeze({
  version: 'catanaops-2026-10-17.1', policy: policy.version, phase: 'validation',
  mission: 'Preparar catálogos Shopify para agências dos EUA com rastreabilidade e contribuição positiva medida.',
  offer: { currency: 'USD', cents: policy.pilotCents, maxProducts: 50, maxVariants: 500, suppliers: 1, businessDays: 3 },
  delivery: 'Novos rascunhos; agência importa. Dados completos e pagamento confirmado iniciam prazo. Uma rodada de ajustes de escopo em sete dias.',
  economics: 'Receita menos taxas, custos variáveis e todas as horas a USD25/h. Simulação não é receita. Custos ausentes significam margem desconhecida.',
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
