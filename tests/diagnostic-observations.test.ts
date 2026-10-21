import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import {Store} from '../src/store.ts';
import {Service} from '../src/service.ts';
import {createEditorial,diagnosticSchema} from '../src/service-editorial.ts';
test('diagnóstico conserva observações com fonte sem inventar campos faltantes',async()=>{
  const s=new Store(':memory:');try{
    const input={products:[{id:'PUBLIC-SAMPLE',title:'Amostra analisada',description:'Informações presentes',source:'https://example.com/p'}],observations:[{subject:'Regra comercial',category:'observed',finding:'Dois valores informados em locais diferentes.',evidence:[{source:'https://example.com/',note:'Fonte pública de teste, não regra de checkout confirmada.'}],nextAction:'Confirmar com responsável.'}]};
    const order=createEditorial(s,{name:'Ensaio',email:'f@example.com',service:'diagnostic',brief:input,demo:true}),svc=new Service(s);svc.approve(order.id);svc.simulatePayment(order.id);await svc.process(order.id);
    const report=JSON.parse(new AdmZip(s.artifact(order.id,'delivery-0.zip')).readAsText('diagnostico.json'));assert.equal(report.findings.length,0);assert.equal(report.observations[0].category,'observed');assert.equal(report.observations[0].evidence.length,1);
    assert.throws(()=>diagnosticSchema.parse({...input,observations:[{...input.observations[0],evidence:[]}]}));
  }finally{s.close();}
});
