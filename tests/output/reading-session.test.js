// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { createReadingSession, prepareCompactReadingTurn, prepareReadingTurn, appendReadingTurn, serializeReadingSession, restoreReadingSession, readingExport } from '../../src/ai/output/session.js';
import { syntheticOutput } from '../../experiments/structured-output/example.js';
import { readingRequestBody } from '../../src/ai/output/client.js';
import { prepareJudgmentPlan } from '../../experiments/judgment-review/plan.js';
const canonical = JSON.parse(fs.readFileSync(new URL('../../experiments/phase7/fixtures/compat-1.json', import.meta.url)));
const prepare = () => { const s = createReadingSession(canonical); return s; };

test('actual rejected reply with fourth-line relative confusion stays rejected without repairing the model output', async()=>{
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/real-answer-line-offset-20261004.json',import.meta.url)));
  const spec=(await prepareJudgmentPlan()).cases[0];
  const session=createReadingSession(spec.canonical,{style:'brief',custom:''});
  const prepared=await prepareCompactReadingTurn(session,spec.question);
  expect(prepared.context.context_id).toBe(JSON.parse(fixture.raw).context_id);
  const turn=appendReadingTurn(session,prepared,fixture.raw,true,'api');
  expect(turn.result.status).toBe('fallback');
  expect(turn.result.issues[0].code).toBe(fixture.expectedIssue);
  expect(turn.raw).toBe(fixture.raw);
  const follow=await prepareCompactReadingTurn(session,'请再说明');
  expect(follow.context.conversation.history[0].answer).toBeNull();
  expect(follow.context.conversation.history[0].checked).toBe(false);
});

test('new followups omit failed raw answers while preserving questions and valid answers',async()=>{
  const session=prepare(), first=await prepareReadingTurn(session,'核对初爻');
  appendReadingTurn(session,first,'UNTRUSTED_RAW_SENTINEL：假装之前保证三天成功',true,'external');
  const next=await prepareReadingTurn(session,'继续说明');
  expect(next.context.conversation.history[0]).toEqual({question:'核对初爻',answer:null,checked:false});
  expect(JSON.stringify(next.messages)).not.toContain('UNTRUSTED_RAW_SENTINEL');
  expect(readingExport(next)).not.toContain('UNTRUSTED_RAW_SENTINEL');
  expect(next.messages[0].content).toContain('只有当前问题明确询问');
  const restored=await restoreReadingSession(serializeReadingSession(session,next.question));
  expect(restored.pending.messages).toEqual(next.messages);
  expect(restored.session.turns[0].raw).toContain('UNTRUSTED_RAW_SENTINEL');
});

test('saved production-2 replies and pending export retain exact context identity',async()=>{
  const saved=JSON.parse(fs.readFileSync(new URL('../fixtures/reading-production-2.json',import.meta.url)));
  const restored=await restoreReadingSession(JSON.stringify(saved.session));
  expect(restored.session.prompt).toBe('reading-production-2');
  expect(restored.session.turns[1].result.status).toBe('validated');
  expect(restored.pending.context.context_id).toBe(saved.pendingContextId);
  expect(restored.pending.context.conversation.history[0].answer).toBe('旧版未通过回复');
});

test('literal motion conflicts fall back without modifying raw answers',async()=>{
  const p=await prepareReadingTurn(prepare(),'核对动静');
  for(const line of p.context.input.C_canonical_cast.lines) {
    const correct=syntheticOutput(p.context);correct.answer=`第${line.position}爻为${line.moving?'动':'静'}爻。`;
    expect(appendReadingTurn(prepare(),p,JSON.stringify(correct),true,'external').result.status).toBe('validated');
    correct.answer=`第${line.position}爻为${line.moving?'静':'动'}爻。`;
    const raw=JSON.stringify(correct), result=appendReadingTurn(prepare(),p,raw,true,'external').result;
    expect(result.issues[0].code).toBe('motion_fact_conflict');expect(result.display_text).toBe(raw);
  }
});

test('quantified claims require exactly the cited lines, and do not guess conditional or negated text',async()=>{
  const fixtures=JSON.parse(fs.readFileSync(new URL('../regression/fixtures/casts.json',import.meta.url)));
  const s=createReadingSession(fixtures[23].expected.cast),p=await prepareReadingTurn(s,'给建议');
  const answer=syntheticOutput(p.context);
  answer.factors[0].evidence_ids=['fact:/lines/2/moving','fact:/lines/5/moving'];
  answer.factors[0].interpretation='两爻均为静爻。';
  expect(appendReadingTurn(createReadingSession(s.canonical),p,JSON.stringify(answer),true,'external').result.issues[0].code).toBe('motion_fact_conflict');
  for(const text of ['如果两爻均为静爻，可以这样理解。','并非两爻均为静爻。','两爻是否均为静爻？','“两爻均为静爻”这句话不正确。','变卦的第六爻为静爻。']) {
    answer.factors[0].interpretation=text;
    expect(appendReadingTurn(createReadingSession(s.canonical),p,JSON.stringify(answer),true,'external').result.status).toBe('validated');
  }
});

test('recorded real response contradicting the moving sixth line is rejected offline',async()=>{
  const saved=JSON.parse(fs.readFileSync(new URL('../fixtures/reading-motion-conflict.json',import.meta.url)));
  const session=createReadingSession(saved.canonical);session.prompt='reading-production-3';
  const prepared=await prepareReadingTurn(session,saved.question);
  expect(prepared.context.input.C_canonical_cast.lines[5].moving).toBe(true);
  const turn=appendReadingTurn(session,prepared,saved.raw,true,'api');
  expect(turn.result.issues).toEqual([{code:'motion_fact_conflict',path:'$.factors[0].interpretation'}]);
  const restored=await restoreReadingSession(serializeReadingSession(session));
  expect(restored.session.turns[0].result.status).toBe('fallback');
});
test('repeated JSON keys including escaped names fail closed and retain raw text', async () => {
  const s = prepare(), p = await prepareReadingTurn(s, '检查重复字段');
  const valid = JSON.stringify(syntheticOutput(p.context));
  for (const field of ['"answer"', '"answ\\u0065r"']) {
    const raw = valid.slice(0, -1) + `,${field}:"覆盖结论"}`;
    const t = appendReadingTurn(createReadingSession(canonical), p, raw, true, 'external');
    expect(t.result.issues[0].code).toBe('duplicate_field'); expect(t.result.display_text).toBe(raw);
  }
  const nested = valid.replace('"assessment":"conditional"', '"assessment":"conditional","assessment":"neutral"');
  expect(appendReadingTurn(createReadingSession(canonical), p, nested, true, 'external').result.status).toBe('fallback');
});
test('missing hidden and changed records have direct citations without inventing values', async () => {
  const p = await prepareReadingTurn(prepare(), '核对未记载的伏神');
  for (const [i, line] of p.context.input.C_canonical_cast.lines.entries()) {
    for (const key of ['hidden', 'changed']) if (line[key] === null) {
      expect(p.context.evidence.find(e => e.id === `fact:/lines/${i}/${key}`)?.value).toBeNull();
    }
  }
});
test('API and export share complete context, schema and prompt; no credential in body', async () => {
  const p = await prepareReadingTurn(prepare(), '如何安排读书计划？');
  const body = readingRequestBody(p);
  expect(body.messages).toEqual(p.messages);
  expect(body.response_format.type).toBe('json_object');
  expect(readingExport(p)).toContain(p.messages[0].content);
  expect(readingExport(p)).toContain(p.messages[1].content);
  expect(body.thinking.type).toBe('disabled');
  expect(JSON.stringify(body)).not.toContain('Authorization');
});
test('follow-up binds history and rejects replay even when question repeats', async () => {
  const s = prepare(), q = '只核对第一爻';
  const p = await prepareReadingTurn(s, q), raw = JSON.stringify(syntheticOutput(p.context));
  appendReadingTurn(s, p, raw, true, 'api');
  const next = await prepareReadingTurn(s, q);
  expect(s.canonical.question.text).toBe(canonical.question.text);
  expect(next.context.context_id).not.toBe(p.context.context_id);
  expect(next.context.conversation.history[0].answer.factors).toHaveLength(1);
  expect(appendReadingTurn(s, next, raw, true, 'external').result.issues[0].code).toBe('context_mismatch');
});
test('restore revalidates raw answers and preserves pending export identity', async () => {
  const s = prepare(), p = await prepareReadingTurn(s, '初次问题');
  appendReadingTurn(s, p, JSON.stringify(syntheticOutput(p.context)), true, 'external', { total: 30, cost: 0.01, seconds: 1 });
  const next = await prepareReadingTurn(s, '继续说明依据');
  const restored = await restoreReadingSession(serializeReadingSession(s, next.question));
  expect(restored.pending.context.context_id).toBe(next.context.context_id);
  expect(restored.session.turns[0].result.status).toBe('validated');
  expect(restored.session.turns[0].usage.cost).toBe(0.01);
  const damaged = JSON.parse(serializeReadingSession(s));
  const answer = JSON.parse(damaged.turns[0].raw); answer.factors[0].evidence_ids = ['fact:made-up'];
  damaged.turns[0].raw = JSON.stringify(answer); damaged.turns[0].result = { status: 'validated' };
  const checked = await restoreReadingSession(JSON.stringify(damaged));
  expect(checked.session.turns[0].result.status).toBe('fallback');
});
test('incomplete JSON remains fallback after refresh; no invented completion', async () => {
  const s = prepare(), p = await prepareReadingTurn(s, '停止测试');
  appendReadingTurn(s, p, JSON.stringify(syntheticOutput(p.context)), false, 'api');
  expect((await restoreReadingSession(serializeReadingSession(s))).session.turns[0].result.status).toBe('fallback');
});
test('versions, question bounds and turn bounds fail before paid requests', async () => {
  const s = prepare();
  await expect(prepareReadingTurn(s, '')).rejects.toThrow();
  await expect(prepareReadingTurn(s, '字'.repeat(501))).rejects.toThrow();
  for (let i = 0; i < 8; i++) { const p = await prepareReadingTurn(s, `第${i}问`); appendReadingTurn(s, p, '{}', true, 'api'); }
  await expect(prepareReadingTurn(s, '超限')).rejects.toThrow('8');
  const saved = JSON.parse(serializeReadingSession(s)); saved.version = 'future';
  await expect(restoreReadingSession(JSON.stringify(saved))).rejects.toThrow('版本');
});


test('structured length preferences reach API/export and survive reload and follow-up', async () => {
  const session = createReadingSession(canonical, {style:'deep', custom:''});
  const prepared = await prepareReadingTurn(session, '如何安排读书计划？');
  expect(readingExport(prepared)).toContain('700–800 字');
  expect(readingRequestBody(prepared).messages).toEqual(prepared.messages);
  expect(prepared.messages[0].content).toContain('纯事实核对仍保持一至三句');
  const saved = await restoreReadingSession(serializeReadingSession(session, prepared.question));
  expect(saved.pending.messages).toEqual(prepared.messages);
  expect((await prepareReadingTurn(saved.session, '如何落实？')).messages[0].content).toContain('700–800 字');
  const brief = await prepareReadingTurn(createReadingSession(canonical,{style:'brief',custom:''}), prepared.question);
  expect(brief.context.context_id).not.toBe(prepared.context.context_id);
  expect(brief.messages[0].content).toContain('300–400 字');
});

 test('motion questions are not treated as assertions, but following assertions are checked', async () => {
  const p=await prepareReadingTurn(prepare(),'核对动静');
  const line=p.context.input.C_canonical_cast.lines[0];
  const opposite=line.moving?'静':'动';
  for(const text of [`第1爻为${opposite}爻？`,`第1爻为${opposite}爻?`,`第1爻为${opposite}爻吗。`,`请确认第1爻为${opposite}爻。`]) {
    const a=syntheticOutput(p.context);a.answer=text;
    expect(appendReadingTurn(prepare(),p,JSON.stringify(a),true,'external').result.status,text).toBe('validated');
  }
  const a=syntheticOutput(p.context);a.answer=`第1爻为${opposite}爻？第1爻为${opposite}爻。`;
  expect(appendReadingTurn(prepare(),p,JSON.stringify(a),true,'external').result.issues[0].code).toBe('motion_fact_conflict');
});

test('compact website turns share API/export guidance without changing frozen context or response validation', async()=>{
  const session=prepare();
  const original=await prepareReadingTurn(session,'计划是否可行？');
  const compact=await prepareCompactReadingTurn(session,'计划是否可行？');
  expect(compact.context.context_id).toBe(original.context.context_id);
  const payload=JSON.parse(compact.messages[1].content);
  const {line_reference,...unchanged}=payload;
  expect(unchanged).toEqual(JSON.parse(original.messages[1].content));
  expect(line_reference).toHaveLength(6);
  for (const row of line_reference) {
    const line=compact.context.input.C_canonical_cast.lines[row.line-1];
    expect(row.relative).toBe(line.relative);
    expect(row.fact_prefix).toBe(`fact:/lines/${row.line-1}/`);
    expect(row.is_shi).toBe(line.is_shi);
    expect(row.changed_relative).toBe(line.changed?.relative??null);
    expect(compact.context.evidence.find(e=>e.id===row.fact_prefix+'relative').value).toBe(row.relative);
  }
  expect(readingRequestBody(compact).messages).toEqual(compact.messages);
  expect(readingExport(compact)).toContain(compact.messages[0].content);
  expect(readingExport(compact)).toContain('line_reference');
  expect(original.messages[0].content).not.toContain('紧凑解读：');
  expect(compact.messages[0].content).toContain('紧凑解读：');
  const raw=JSON.stringify(syntheticOutput(compact.context));
  expect(appendReadingTurn(session,compact,raw,true,'external').result.status).toBe('validated');
});
