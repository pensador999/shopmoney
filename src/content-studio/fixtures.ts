import {studioRequestSchema,type StudioScope} from './contracts.ts';
export function fixtureSvg(color:'sand'|'blue'){
  const fill=color==='sand'?'#d6c5a4':'#819eae';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 540"><rect width="640" height="540" fill="#f4f1eb"/><ellipse cx="320" cy="467" rx="138" ry="15" fill="#ded9d0"/><path d="M230 92 150 137 110 231 177 260 204 207 196 442 444 442 436 207 463 260 530 231 490 137 410 92 370 72Q320 126 270 72Z" fill="'+fill+'" stroke="#4c5353" stroke-width="3"/><path d="M270 72Q320 150 370 72M206 409H441" fill="none" stroke="#4c5353" stroke-width="3"/><text x="320" y="505" text-anchor="middle" fill="#454d4a" font-family="sans-serif" font-size="15">ILUSTRAÇÃO SINTÉTICA · NÃO É FOTO DE PRODUTO</text></svg>';
}
export function studioFixture(scope:StudioScope,brand:'clara'|'horizonte'='clara'){
  const premium=brand==='horizonte';
  return studioRequestSchema.parse({
    version:'content-studio-1',scope,
    brand:{name:premium?'Ateliê Horizonte':'Linha Clara',version:'synthetic-'+brand+'-1',
      audience:premium?'Público fictício que valoriza composição e apresentação editorial.':'Público fictício que procura informações claras para o cotidiano.',
      proposition:premium?'Escolhas cuidadosas para um guarda-roupa pessoal.':'Clareza para escolher seus essenciais.',
      tone:premium?'Editorial, acolhedor e preciso.':'Direto, leve e objetivo.',
      introduction:premium?'Um olhar atento para as peças que acompanham sua rotina.':'Conheça os detalhes para fazer sua escolha.',
      approved:true,materialAuthorization:true,forbiddenTerms:['milagroso'],approvedExamples:[],variantRules:'Cor explícita; mesma imagem pode representar P e M da mesma cor.',
      visual:{accent:premium?'#7e4056':'#245f58',background:premium?'#fbf4f0':'#f4faf7',text:'#263838',font:premium?'serif':'system',radius:premium?0:14},mediaHosts:[]},
    product:{id:'SYNTHETIC-001',title:'Camiseta Horizonte — demonstração',existing:true,source:'Ficha técnica e imagens sintéticas, sem material de cliente.',
      original:{html:'<p>Camiseta de demonstração. Dados sintéticos.</p>',text:'Camiseta de demonstração. Dados sintéticos.',approved:true},
      variants:[{id:'V-AREIA-P',productId:'SYNTHETIC-001',sku:'000120-AREIA-P',color:'Areia',size:'P'},
        {id:'V-AREIA-M',productId:'SYNTHETIC-001',sku:'000120-AREIA-M',color:'Areia',size:'M'},
        {id:'V-AZUL-M',productId:'SYNTHETIC-001',sku:'000120-AZUL-M',color:'Azul',size:'M'}],
      facts:[{id:'presentation',text:'Camiseta de manga curta com gola redonda. Dados inteiramente sintéticos.',source:'Ficha sintética v1 — construção',approved:true,section:'presentation'},
        {id:'fit',text:'Modelagem reta, conforme a ficha sintética.',source:'Ficha sintética v1 — modelagem',approved:true,section:'fit'},
        {id:'composition',text:'Composição: 100% algodão. Informação fictícia para este ensaio.',source:'Ficha sintética v1 — composição',approved:true,section:'composition'},
        {id:'care',text:'Cuidados: seguir a etiqueta da peça. Etiqueta sintética de demonstração.',source:'Ficha sintética v1 — cuidados',approved:true,section:'care'}]},
    media:[{id:'IMG-AREIA',productId:'SYNTHETIC-001',url:'/studio-fixture-sand.svg',source:'SVG autoral sintético Catana Ops',authorized:true,approved:true,
      variantIds:['V-AREIA-P','V-AREIA-M'],color:'Areia',role:'hero',alt:'Ilustração sintética de camiseta areia; não é fotografia.'},
      {id:'IMG-AZUL',productId:'SYNTHETIC-001',url:'/studio-fixture-blue.svg',source:'SVG autoral sintético Catana Ops',authorized:true,approved:true,
      variantIds:['V-AZUL-M'],color:'Azul',role:'hero',alt:'Ilustração sintética de camiseta azul; não é fotografia.'}],
    mode:'rewrite',blocks:[],
  });
}
