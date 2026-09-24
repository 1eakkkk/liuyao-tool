// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { buildOutputContext } from '../../src/ai/output/context.js';
import { buildOutputMessages, buildOutputExport } from '../../src/ai/output/prompt.js';
import { parseOutputAnswer, createOutputCollector } from '../../src/ai/output/parse.js';
import { OUTPUT_VERSION, MAX_RESPONSE_CHARS } from '../../src/ai/output/contract.js';
import { syntheticOutput } from '../../experiments/structured-output/example.js';
import { normalizeLegacyCast } from '../../src/core/normalize.js';

const canonical = JSON.parse(fs.readFileSync(new URL('../../experiments/phase7/fixtures/compat-1.json', import.meta.url), 'utf8'));
const context = await buildOutputContext(canonical);
const example = () => syntheticOutput(context);
const parse = answer => parseOutputAnswer(JSON.stringify(answer), context, { completed: true });
const issue = (answer, code) => expect(parse(answer).issues[0].code).toBe(code);

test('existing 24 migration casts have complete output evidence with original rule direction intact', async () => {
  const casts = JSON.parse(fs.readFileSync(new URL('../regression/fixtures/casts.json', import.meta.url), 'utf8'));
  for (const fixture of casts) {
    const canonical = normalizeLegacyCast(fixture.expected.cast, { question: fixture.input.question, createdAt: 0 });
    const context = await buildOutputContext(canonical);
    const rules = context.evidence.filter(e => e.kind === 'rule_result');
    expect(rules.map(e => e.result)).toEqual(context.input.E_rule_results.hits.map(h => h.result));
    expect(parseOutputAnswer(JSON.stringify(syntheticOutput(context)), context, { completed: true }).status).toBe('validated');
  }
});

test('input projection excludes extensions; identity binds question and rules; snapshots are immutable', async () => {
  const copy = structuredClone(canonical), before = JSON.stringify(copy);
  copy.compatibility.extensions.secret = 'PRIVATE_NOT_TRANSMITTED';
  const a = await buildOutputContext(copy), b = await buildOutputContext(canonical);
  expect(a.context_id).toBe(b.context_id);
  expect(JSON.stringify(a)).not.toContain('PRIVATE_NOT_TRANSMITTED');
  expect(JSON.stringify(canonical)).toBe(before);
  expect(Object.isFrozen(a.input.C_canonical_cast.lines[0])).toBe(true);
  copy.question.text += '另一件事';
  expect((await buildOutputContext(copy)).context_id).not.toBe(a.context_id);
  const off = await buildOutputContext(canonical, { rulesMode: 'off' });
  expect(off.context_id).not.toBe(a.context_id);
  expect(off.evidence.some(e => e.kind === 'rule_result')).toBe(false);
});

test('valid output retains exact natural-language answer and references without inventing confidence', () => {
  const answer = example(), result = parse(answer);
  expect(result.status).toBe('validated');
  expect(result.validation).toBe('structure_and_references_only');
  expect(result.display_text).toBe(answer.answer);
  expect(result.answer).toEqual(answer);
  expect(result.answer).not.toHaveProperty('confidence');
});

test('unknown references and another question context fail closed', () => {
  const answer = example(); answer.factors[0].evidence_ids = ['rule:unknown'];
  issue(answer, 'unknown_evidence');
  answer.factors[0].evidence_ids = ['fact:/lines/0/relative']; answer.context_id = 'sha256:wrong';
  issue(answer, 'context_mismatch');
  expect(() => parseOutputAnswer(JSON.stringify(example()), structuredClone(context), { completed: true })).toThrow('untrusted_context');
});

test('model cannot add or overwrite rule direction or fact values through output fields', () => {
  const answer = example(); answer.factors[0].result = { from: 6, to: 1 };
  issue(answer, 'unknown_field');
  delete answer.factors[0].result; answer.factors[0].fact_value = '伪造';
  issue(answer, 'unknown_field');
});

test('target line, component, relative and supporting fact must agree', () => {
  const a = example(); a.yongshen_candidates[0].targets[0].line = 7; issue(a, 'invalid_number');
  const b = example(); b.yongshen_candidates[0].relative = b.yongshen_candidates[0].relative === '父母' ? '兄弟' : '父母';
  issue(b, 'target_relative_mismatch');
  const c = example(); c.yongshen_candidates[0].evidence_ids = ['fact:/lines/0/branch']; issue(c, 'missing_target_evidence');
  const absent = canonical.lines.findIndex(l => !l.hidden);
  const d = example(); d.yongshen_candidates[0].targets = [{ line: absent + 1, component: 'hidden' }];
  issue(d, 'target_relative_mismatch');
});

test('missing fields, future versions, probabilities, empty uncertainty and duplicate refs reject', () => {
  const mutations = [
    [a => delete a.answer, 'missing_field'], [a => a.schema_version = 'future', 'version_mismatch'],
    [a => a.confidence = .95, 'unknown_field'], [a => a.uncertainties = [], 'invalid_count'],
    [a => a.factors[0].evidence_ids.push(a.factors[0].evidence_ids[0]), 'duplicate_item'],
    [a => a.direction = 'guaranteed', 'invalid_enum'], [a => a.answer = ' ', 'invalid_length'],
  ];
  for (const [mutate, code] of mutations) { const a = example(); mutate(a); issue(a, code); }
});

test('non-JSON, fences, partial JSON and wrong root preserve raw text without partial validation', () => {
  for (const raw of ['普通文本回复', '```json\n{}\n```', '{"answer":"半句话', 'null', '[]']) {
    const result = parseOutputAnswer(raw, context, { completed: true });
    expect(result.status).toBe('fallback'); expect(result.answer).toBeNull(); expect(result.display_text).toBe(raw);
  }
});

test('oversized output stays bounded and no field extraction repairs invalid responses', () => {
  const raw = 'x'.repeat(MAX_RESPONSE_CHARS + 100);
  const result = parseOutputAnswer(raw, context, { completed: true });
  expect(result.issues[0].code).toBe('response_too_large'); expect(result.truncated).toBe(true);
  expect(result.display_text).toHaveLength(MAX_RESPONSE_CHARS);
  const answer = example(); answer.answer = 'x'.repeat(6001); issue(answer, 'invalid_length');
});

test('stream validates only complete stop plus DONE; interruption never promotes even valid JSON', () => {
  const raw = JSON.stringify(example());
  for (const end of [{}, { sawDone: true, finishReason: 'length' },
    { sawDone: true, finishReason: 'stop', interrupted: true }]) {
    const collector = createOutputCollector(context); collector.append(raw);
    expect(collector.finish(end).issues[0].code).toBe('incomplete_response');
  }
  const collector = createOutputCollector(context);
  for (const part of raw.match(/.{1,17}/gs)) expect(collector.append(part).status).toBe('pending');
  expect(collector.finish({ sawDone: true, finishReason: 'stop' }).status).toBe('validated');
  expect(() => collector.append('x')).toThrow('collector_closed');
  expect(() => collector.finish()).toThrow('collector_closed');
  const huge = createOutputCollector(context); huge.append('x'.repeat(MAX_RESPONSE_CHARS + 50));
  expect(huge.finish({ sawDone: true, finishReason: 'stop' }).issues[0].code).toBe('response_too_large');
});

test('API and external prompt carry identical input and schema, without pure-text instruction conflict', () => {
  const messages = buildOutputMessages(context), exported = buildOutputExport(context);
  expect(messages.map(x => x.role)).toEqual(['system', 'user']);
  const payload = JSON.parse(messages[1].content);
  expect(payload.context_id).toBe(context.context_id);
  expect(payload.response_schema.properties.schema_version.const).toBe(OUTPUT_VERSION);
  expect(exported).toContain(messages[0].content); expect(exported).toContain(messages[1].content);
  expect(messages[0].content).not.toContain('不输出 Markdown 或 JSON');
});
