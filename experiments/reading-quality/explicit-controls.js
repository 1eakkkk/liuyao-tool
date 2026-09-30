// Exposed developer controls, not independently collected model replies.
export function buildExplicitContextControls(registry) {
  const cases=[];
  const add=(id,text,evidence_ids,expected)=>cases.push({id,answer:{factors:[{interpretation:text,evidence_ids}]},expected});
  for(let i=0;i<6;i++) {
    const relative=`fact:/lines/${i}/relative`, shi=`fact:/lines/${i}/is_shi`, ying=`fact:/lines/${i}/is_ying`;
    const value=id=>registry.find(e=>e.id===id).value;
    const n=['一','二','三','四','五','六'][i];
    for(const [id,text] of [[relative,`本卦第${n}爻的六亲是${value(relative)}。`],
      [shi,`本卦第${n}爻${value(shi)?'为':'非'}世爻。`],
      [ying,`本卦第${n}爻${value(ying)?'是':'不是'}应爻。`]])
      add(`${i+1}-${id.split('/').at(-1)}-variant`,text,[id],{checked:1,conflicts:0,missing:0});
    const fragments=[
      ['question',`第${i+1}爻是世爻？`],
      ['hypothesis',`如果第${i+1}爻是世爻，才考虑此关系。`],
      ['quote',`“第${i+1}爻是世爻。”`],
      ['changed',`第${i+1}爻变出的六亲是父母。`],
      ['hidden',`第${i+1}爻的伏神六亲为父母。`],
      ['quote-negation',`不能断言“第${i+1}爻是世爻”。`],
      ['multiple-sentences',`第${i+1}爻是世爻。对方一定会配合。`],
      ['uncertain',`第${i+1}爻可能是世爻。`],
    ];
    for(const [kind,text] of fragments) add(`${i+1}-${kind}`,text,[shi],{checked:0,conflicts:0,missing:0});
  }
  return cases;
}
