import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { agentContracts, type AgentRole } from './business-context.ts';

// Only repository-authored, allowlisted documents become trusted instructions.
export function agentPlaybook(role: AgentRole,service?:string) {
  if (!Object.hasOwn(agentContracts, role)) throw new Error('Função desconhecida');
  const common = readFileSync(new URL('../docs/agents/COMMON.md', import.meta.url), 'utf8');
  const procedure = readFileSync(new URL(`../docs/agents/${role}.md`, import.meta.url), 'utf8');
  const specialist=['content','combined'].includes(service??'')&&['planner','production','quality'].includes(role)?readFileSync(new URL('../docs/agents/marketing-product.md',import.meta.url),'utf8'):'';
  const productSkill=['content','combined'].includes(service??'')&&['research','support','planner','production','quality'].includes(role)?readFileSync(new URL('../agent/skills/catana-produto-marca/SKILL.md',import.meta.url),'utf8'):'';
  const runtimeContract=readFileSync(new URL('../agent/instructions.md',import.meta.url),'utf8');
  const text = `${runtimeContract}\n${common}\n${procedure}${specialist?'\n'+specialist:''}${productSkill?'\n'+productSkill:''}`;
  return { text, version: createHash('sha256').update(text).digest('hex') };
}
