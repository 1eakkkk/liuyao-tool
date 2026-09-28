// Synthetic development controls, not model output or independent evaluation.
import { createHash } from 'node:crypto';
import { createReadingSession, prepareReadingTurn, appendReadingTurn } from '../../src/ai/output/session.js';
import { syntheticOutput } from '../structured-output/example.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
export async function buildQualityCases(canonical) {
  const prepared=await prepareReadingTurn(createReadingSession(canonical),'只核对六亲与世应事实，不推断现实人物或结果。');
  const cases=[];
  function add(id,text,facts,ids,expected,extra=[]) {
    const a=syntheticOutput(prepared.context);
    a.answer='这是程序编写的核对样例，不是真实模型回复。';a.yongshen_candidates=[];
    a.factors=[{assessment:'neutral',interpretation:text,evidence_ids:ids},...extra];
    const raw=JSON.stringify(a);
    const entry={batch:'synthetic-relative-role',question:prepared.question,transport:{id},raw,
      quoted_evidence:prepared.context.evidence,
      recheck:appendReadingTurn(createReadingSession(canonical),prepared,raw,true,'external').result};
    entry.recheck={status:entry.recheck.status,issues:entry.recheck.issues};
    const review={id:`${entry.batch}/${id}`,raw_sha256:hash(raw),evidence_sha256:hash(JSON.stringify([entry.question,entry.quoted_evidence])),
      reviewer:'Synthetic developer control; not independent review',scope:{rating:'unresolved',reason:'Control checks annotated facts only.'},
      support:{rating:'unresolved',reason:'No automatic semantic support judgment.'},
      claims:facts.length?[{path:'/factors/0/interpretation',quote:text,facts}]:[]};
    cases.push({entry,review,expected});
  }
  for(const line of prepared.context.input.C_canonical_cast.lines) {
    const i=line.position-1;
    for(const [field,label] of [['relative','六亲'],['is_shi','世爻'],['is_ying','应爻']]) {
      const fact=`fact:/lines/${i}/${field}`, actual=line[field];
      const wrong=field==='relative'?(actual==='父母'?'兄弟':'父母'):!actual;
      const text=v=>field==='relative'?`第${i+1}爻的六亲为${v}。`:`第${i+1}爻${v?'是':'不是'}${label}。`;
      const make=v=>[{id:fact,asserted:v}];
      add(`${i+1}-${field}-correct`,text(actual),make(actual),[fact],{checked:1,conflicts:0,missing:0});
      add(`${i+1}-${field}-conflict`,text(wrong),make(wrong),[fact],{checked:1,conflicts:1,missing:0});
      const unrelated=`fact:/lines/${i}/moving`;
      add(`${i+1}-${field}-wrong-citation`,text(actual),make(actual),[unrelated],{checked:1,conflicts:0,missing:1});
      add(`${i+1}-${field}-borrowed-citation`,text(actual),make(actual),[unrelated],{checked:1,conflicts:0,missing:1},
        [{assessment:'neutral',interpretation:'另一段单独引用该字段，不代替上一段引用。',evidence_ids:[fact]}]);
    }
    // Do not annotate a question, quote, hypothetical or changed/hidden component as a primary fact.
    for(const [kind,text] of [ ['question',`第${i+1}爻是世爻吗？`],['conditional',`如果第${i+1}爻是世爻，需要另行讨论。`],
      ['quotation',`有人说“第${i+1}爻是世爻”，这句话需要核对。`],['changed',`请核对第${i+1}爻变出的六亲。`],['hidden',`请核对第${i+1}爻的伏神六亲。`] ])
      add(`${i+1}-${kind}`,text,[],[`fact:/lines/${i}/relative`],{checked:0,conflicts:0,missing:0});
  }
  return cases;
}
