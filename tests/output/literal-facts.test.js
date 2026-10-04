// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { prepareJudgmentPlan } from '../../experiments/judgment-review/plan.js';
import { createReadingSession, prepareCompactReadingTurn, prepareReadingTurn, appendReadingTurn, serializeReadingSession, restoreReadingSession } from '../../src/ai/output/session.js';
import { syntheticOutput } from '../../experiments/structured-output/example.js';
const spec = (await prepareJudgmentPlan()).cases[0];
const session = () => createReadingSession(spec.canonical, {style:'brief',custom:''});
const prepared = await prepareCompactReadingTurn(session(), spec.question);
function reply(text, ids, answerText='仅核对本卦指定属性。') {
  return { ...syntheticOutput(prepared.context), answer:answerText, yongshen_candidates:[], timing_candidates:[],
    factors:[{assessment:'neutral',interpretation:text,evidence_ids:ids}], uncertainties:['本次只检查明确事实，不能验证解释及现实结果。'] };
}
const run = answer => appendReadingTurn(session(), prepared, JSON.stringify(answer), true, 'external').result;
const fact = (n,field) => `fact:/lines/${n-1}/${field}`;

test('a correct local claim requires all stated properties, not a citation to another line', () => {
  const text='第4爻为世爻父母亥水，月令相。';
  const ids=['is_shi','relative','element','relations/month_strength'].map(f=>fact(4,f));
  expect(run(reply(text,ids)).status).toBe('validated');
  expect(run(reply(text,ids.filter(id=>id!==fact(4,'element')))).issues[0].code).toBe('literal_fact_citation_missing');
  expect(run(reply('第4爻为父母。',[fact(3,'relative')])).issues[0].code).toBe('literal_fact_citation_missing');
  expect(run(reply('第4爻的六亲为父母，五行为水，月令相。',ids)).status).toBe('validated');
  expect(run(reply('第4爻的六亲为父母，五行为金，月令相。',ids)).issues[0].code).toBe('literal_fact_conflict');
});

test('the exact hexagram role position covers the same line without redundant boolean citations', () => {
  expect(run(reply('第4爻为世爻。',['fact:/hexagram/shi_line'])).status).toBe('validated');
  expect(run(reply('初爻为应爻。',['fact:/hexagram/ying_line'])).status).toBe('validated');
  expect(run(reply('第4爻为世爻。',['fact:/hexagram/ying_line'])).issues[0].code).toBe('literal_fact_citation_missing');
  expect(run(reply('第3爻为世爻。',['fact:/hexagram/shi_line'])).issues[0].code).toBe('literal_fact_conflict');
});

test('wrong relatives, elements, month labels and shi/ying are rejected in factors and conclusion', () => {
  for (const [text,field] of [['第四爻为官鬼。','relative'],['第4爻五行为金。','element'],['第4爻月令旺。','relations/month_strength'],['第3爻为世爻。','is_shi'],['第4爻为应爻。','is_ying']]) {
    expect(run(reply(text,[fact(4,field)])).issues[0].code,text).toBe('literal_fact_conflict');
    expect(run(reply('第4爻为父母。',[fact(4,'relative')],text)).issues[0].code,text).toBe('literal_fact_conflict');
  }
});

test('grouped numbered lines each need the correct local properties', () => {
  const ids=[fact(3,'relative'),fact(5,'relative'),fact(3,'relations/month_strength'),fact(5,'relations/month_strength')];
  expect(run(reply('三爻与五爻均为官鬼，月令旺。',ids)).status).toBe('validated');
  expect(run(reply('四爻与五爻都是官鬼，月令旺。',ids)).issues[0].code).toBe('literal_fact_conflict');
  expect(run(reply('三爻与五爻均为官鬼，月令旺。',ids.slice(0,3))).issues[0].code).toBe('literal_fact_citation_missing');
});

test('a rule may cover its real source properties but not unrelated attributes; references are local to each item', () => {
  const rule=prepared.context.evidence.find(e=>e.kind==='rule_result'&&e.target.line===4&&e.result.label==='月令相');
  expect(rule).toBeTruthy();
  expect(run(reply('第4爻月令相。',[rule.id])).status).toBe('validated');
  expect(run(reply('第4爻为父母，月令相。',[rule.id])).issues[0].code).toBe('literal_fact_citation_missing');
  const a=reply('第4爻为父母。',[fact(4,'relative')]);
  a.factors.push({assessment:'neutral',interpretation:'第5爻为官鬼。',evidence_ids:[fact(4,'relative')]});
  expect(run(a).issues[0].path).toBe('$.factors[1].interpretation');
});

test('questions, conditions, negations, quotations, ambiguous strength and changed/hidden subjects are skipped', () => {
  for (const text of ['第4爻为官鬼吗？','请核对第4爻是否为官鬼。','如果第4爻为官鬼，可以另看。','即使第4爻为官鬼也不能保证结果。','第4爻并非官鬼。','“第4爻为官鬼”是错误说法。',"'第4爻为官鬼'不是盘面事实。",'第4爻变出妻财。','第4爻伏神为子孙。','第4爻月令旺相。','第4爻为官鬼还是父母？','第4爻可能为官鬼。','第13爻为官鬼。','第四次尝试与官鬼无关。','第4爻父母，官鬼月令旺。']) {
    // The final example asserts a correct relative but does not attach the new subject's strength to line 4.
    expect(run(reply(text,[fact(4,'relative')])).status,text).toBe('validated');
  }
});

test('a real rejected reply remains rejected even after removing the already-checked bad target', () => {
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/real-answer-line-offset-20261004.json',import.meta.url)));
  const answer=JSON.parse(fixture.raw); answer.yongshen_candidates=[];
  const result=run(answer);
  expect(result.status).toBe('fallback'); expect(result.issues[0].code).toBe('literal_fact_conflict');
});

test('later changed-line wording cannot shield explicit primary facts; changed subjects remain out of scope', () => {
  expect(run(reply('第4爻为官鬼，变爻为妻财。',[fact(4,'relative')])).issues[0].code).toBe('literal_fact_conflict');
  expect(run(reply('第4爻为父母亥水发动，变爻妻财丑土回头克。',[fact(4,'relative')])).issues[0].code).toBe('literal_fact_citation_missing');
  expect(run(reply('第4爻为父母，变爻为妻财。',[fact(4,'relative')])).status).toBe('validated');
  expect(run(reply('变爻第4爻为妻财。',[fact(4,'relative')])).status).toBe('validated');
  expect(run(reply('第4爻为官鬼，之前说父母不正确。',[fact(4,'relative')])).issues[0].code).toBe('literal_fact_conflict');
  expect(run(reply('第4爻为官鬼这种说法不正确。',[fact(4,'relative')])).status).toBe('validated');
});

test('new-turn check survives storage and pending export; frozen legacy validation stays unchanged', async () => {
  const a=reply('第4爻为官鬼。',[fact(4,'relative')]);
  const s=session(), p=await prepareCompactReadingTurn(s,spec.question);
  appendReadingTurn(s,p,JSON.stringify(a),true,'external');
  const restored=await restoreReadingSession(serializeReadingSession(s,'继续核对'));
  expect(restored.session.turns[0].result.status).toBe('fallback');
  expect(restored.pending.literalFacts).toBe(true);
  expect(restored.pending.context.conversation.history[0].answer).toBeNull();
  const old=session(), original=await prepareReadingTurn(old,spec.question);
  expect(appendReadingTurn(old,original,JSON.stringify(a),true,'external').result.status).toBe('validated');
});
