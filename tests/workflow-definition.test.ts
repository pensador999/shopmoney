import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowDefinition, projectStages } from '../src/workflow.ts';

test('mapa, contratos e prontidão usam os oito papéis reais e dependências existentes',()=>{
  const d=workflowDefinition(), roles=new Set(d.roles.map(r=>r.id)), stages=new Set(d.stages.map(s=>s.id));
  assert.equal(roles.size,8);
  for(const e of d.edges){assert(roles.has(e.from));assert(roles.has(e.to));}
  for(const s of d.stages){assert(roles.has(s.role));for(const dependency of s.requires)assert(stages.has(dependency));}
  assert(d.edges.some(e=>e.from==='quality'&&e.to==='production'&&'exception' in e));
  assert(d.roles.every(r=>r.procedureVersion.length===64&&r.human&&r.limitation));
  assert(d.readiness.every(i=>i.evidence&&i.acceptance&&i.next&&i.owner&&i.dependency&&i.impact));
  assert.equal(d.readiness.find(i=>i.id==='writes')?.status,'pending');
});
test('projeção mantém lacunas e bloqueios sem inventar execução IA ou QA',()=>{
  const at=(status:string,id:string,flags={})=>projectStages({status,...flags}).find(s=>s.id===id)!;
  assert.equal(at('needs_info','intake').state,'action_required');
  assert.equal(at('scoped','plan').state,'action_required');
  assert.equal(at('needs_attention','quality').state,'action_required');
  assert.equal(at('ready','quality').state,'unverified');
  assert.equal(at('ready','production').state,'done');
  assert.equal(at('closed','economics').state,'unverified');
  assert.equal(at('ready','research').state,'unverified');
  assert.equal(at('cancelled','production').state,'cancelled');
  assert(projectStages(null).every(s=>s.state==='unverified'));
});
