// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { createReadingSession, prepareReadingTurn, appendReadingTurn, serializeReadingSession, restoreReadingSession, readingExport } from '../../src/ai/output/session.js';
import { syntheticOutput } from '../../experiments/structured-output/example.js';
import { readingRequestBody } from '../../src/ai/output/client.js';
const canonical = JSON.parse(fs.readFileSync(new URL('../../experiments/phase7/fixtures/compat-1.json', import.meta.url)));
const prepare = () => { const s = createReadingSession(canonical); return s; };
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
