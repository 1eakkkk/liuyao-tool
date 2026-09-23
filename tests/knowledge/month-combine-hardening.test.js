// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { CORPUS_VERSION, createKnowledgeIndex, retrieve } from '../../src/knowledge/retrieve.js';
import { CORPUS_VERSION_ENV, DEFAULT_CORPUS_VERSION, HISTORICAL_CORPUS_VERSION } from '../../src/knowledge/versions.js';
import { recordHash, textHash, validateCorpus } from '../../src/knowledge/validate.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { buildKnowledgePair, assertKnowledgeInput, assertKnowledgePair } from '../../src/ai/knowledge-input.js';

const OLD_HASH = 'sha256:1b24872a9533ef5d94576c2f8df3489eb221c69f7dfbf0167cdc6e00ab868729';
const NEW_HASH = 'sha256:aa3522aebb7e4ad18b54e144ea26499323e55838f79856fdd59f2c53baadcda3';
const options = { ruleIds: RULES.map(rule => rule.rule_id), rulesetVersion: RULESET_VERSION };
const old = readCorpus({ version: HISTORICAL_CORPUS_VERSION });
const current = readCorpus({ version: DEFAULT_CORPUS_VERSION });
const segment = corpus => corpus.segments.find(item => item.segment_id === 'zsby-1925-s3');
const unit = corpus => corpus.units.find(item => item.knowledge_id === 'zsby-month-combine-001');

test('explicit old and new editions have distinct pinned hashes and reject unknown version selection', () => {
  expect(CORPUS_VERSION).toBe(DEFAULT_CORPUS_VERSION);
  expect(loadCorpus({ version: HISTORICAL_CORPUS_VERSION }, options)).toMatchObject({ corpus_version: HISTORICAL_CORPUS_VERSION, corpus_hash: OLD_HASH });
  expect(loadCorpus({ version: DEFAULT_CORPUS_VERSION }, options)).toMatchObject({ corpus_version: DEFAULT_CORPUS_VERSION, corpus_hash: NEW_HASH });
  expect(loadCorpus(undefined, options).corpus_hash).toBe(NEW_HASH);
  expect(NEW_HASH).not.toBe(OLD_HASH);
  expect(() => readCorpus({ version: 'nonexistent' })).toThrow(/Unknown corpus version/);
  expect(() => loadCorpus({ version: 'nonexistent' }, options)).toThrow(/Unknown corpus version/);
});

test('Phase 7 snapshot remains exactly the old corpus rather than an alias for current files', () => {
  expect(segment(old).revision).toBe(1);
  expect(unit(old).revision).toBe(1);
  expect(segment(old).text).toContain('月沖之爻則爲月破無用之爻也。');
  expect(unit(old).segment_ref).toMatchObject({ revision: 1, span: { start: 0, end: 46 } });
  expect(readCorpus().units.find(item => item.knowledge_id === unit(old).knowledge_id).revision).toBe(2);
  const prior = process.env[CORPUS_VERSION_ENV];
  try {
    process.env[CORPUS_VERSION_ENV] = HISTORICAL_CORPUS_VERSION;
    expect(loadCorpus(undefined, options).corpus_hash).toBe(OLD_HASH);
  } finally {
    if (prior === undefined) delete process.env[CORPUS_VERSION_ENV];
    else process.env[CORPUS_VERSION_ENV] = prior;
  }
});

test('source transcription retains edition circles and corrects only the confirmed ending', () => {
  const s = segment(current), expected = '爻逢月合而有用。爻逢月破而無功。○月建合爻則爲月合乃有用之爻也。月沖之爻。卽爲月破無用之爻也。';
  expect(s.text).toBe(expected);
  expect(s.text).toContain('○');
  expect(s.text).toContain('月沖之爻。卽爲');
  expect(s.text).not.toContain('月沖之爻則爲');
  expect(s.text).not.toContain('月沖之爻即為');
  expect(s.revision).toBe(2);
  expect(s.transcription_revision).toBe(2);
  expect(s.verification_status).toBe(segment(old).verification_status);
  expect(s.text_hash).toBe(textHash(expected));
  expect(s.content_hash).toBe(recordHash(s));
  expect(s.notes).toContain('則→卽');
  expect(s.notes).toContain('restored source punctuation after 爻');
});

test('unit pins the corrected span and separates source statement from editorial boundaries', () => {
  const s = segment(current), u = unit(current);
  expect(u.revision).toBe(2);
  expect(u.segment_ref).toEqual({ segment_id: s.segment_id, revision: s.revision, span: { start: 0, end: 47, unit: 'unicode_code_point' } });
  expect(u.original_text).toBe([...s.text].slice(u.segment_ref.span.start, u.segment_ref.span.end).join(''));
  expect(u.normalized_statement).toContain('月合');
  expect(u.normalized_statement).toContain('文献评价措辞');
  expect(u.normalized_statement).not.toContain('当前具体卦');
  expect(u.applicable_conditions.statements.join(' ')).toContain('命名及作者评价措辞');
  expect(u.exclusions.statements.join(' ')).toContain('是否实际发挥作用');
  expect(u.exclusions.statements.join(' ')).toContain('不能仅凭月合关系');
  for (const word of ['有利', '成功', '最终吉凶']) expect(u.exclusions.statements.join(' ')).toContain(word);
  expect(JSON.stringify(u)).not.toMatch(/月合无效|月合不会发挥作用|月合一定不利|月合一定不好/);
  expect(u.exceptions).toEqual({ status: 'none_stated', statements: [] });
  expect(u.related_concepts).toEqual(unit(old).related_concepts);
  expect(u.related_rule_ids).toEqual(unit(old).related_rule_ids);
  expect(u.rule_link_semantics).toBe('association_only');
  expect(u.verification_status).toBe(unit(old).verification_status);
  expect(u.content_hash).toBe(recordHash(u));
});

test('previous snapshot enforces revisions, admission and unchanged review counts', () => {
  const result = validateCorpus(current, { ...options, previous: old, requireImageWitness: true });
  expect(result.valid).toBe(true);
  expect(result.admitted.units).toHaveLength(7);
  expect(current.units.filter(item => item.verification_status === 'reviewed')).toHaveLength(7);
  expect(current.units.filter(item => item.verification_status === 'source_checked')).toHaveLength(3);
  expect(RULES).toHaveLength(25);
  expect(RULESET_VERSION).toBe('r1');
  const stale = structuredClone(current); segment(stale).revision = 1;
  expect(() => validateCorpus(stale, { ...options, previous: old })).toThrow();
});

test('deterministic month-combine retrieval still cites the corrected unit and no new rule evidence', () => {
  const index = loadCorpus({ version: DEFAULT_CORPUS_VERSION }, options);
  const a = retrieve(index, { concepts: ['month-combine'] });
  const b = retrieve(index, { concepts: ['month-combine'] });
  expect(a).toEqual(b);
  expect(a.selected.map(entry => entry.unit.knowledge_id)).toEqual(['zsby-month-combine-001']);
  expect(a.selected[0].citation.segment_ref).toEqual(unit(current).segment_ref);
  expect(a.selected[0].association).toMatchObject({ semantics: 'association_only', independent_evidence: false, evidence_identity: null });
  expect(createKnowledgeIndex(current, { ...options, corpusVersion: DEFAULT_CORPUS_VERSION }).corpus_hash).toBe(NEW_HASH);
});

test('offline 1.2 projection shape preserves original, interpretation, conditions and exclusions', () => {
  const canonical = JSON.parse(fs.readFileSync('experiments/phase7/fixtures/compat-1.json', 'utf8'));
  const pair = buildKnowledgePair({ canonical, corpus: old, case_id: 'compat-01', query: { concepts: ['month-combine'] } });
  const projected = structuredClone(pair.on.input), item = projected.F_literature_context.items[0], u = unit(current);
  expect(item.knowledge_id).toBe(u.knowledge_id);
  Object.assign(item, {
    revision: u.revision, original_text: u.original_text, normalized_statement: u.normalized_statement,
    applicable_conditions: structuredClone(u.applicable_conditions), exclusions: structuredClone(u.exclusions),
    exceptions: structuredClone(u.exceptions), literature_identity: `literature/${u.knowledge_id}@${u.revision}`
  });
  item.citation.segment_revision = u.segment_ref.revision;
  item.citation.span = structuredClone(u.segment_ref.span);
  expect(assertKnowledgeInput(projected)).toBe(projected);
  expect(assertKnowledgePair(pair.off.input, projected)).toBe(true);
  expect(item.original_text).toContain('月沖之爻。卽爲');
  expect(item.exclusions.statements.join(' ')).toContain('个案效力');
  expect(item.independent_evidence).toBe(false);
  // This is a compatibility snapshot only: the frozen 1.2 builder still rejects the new corpus.
  expect(() => buildKnowledgePair({ canonical, corpus: current, case_id: 'compat-01', query: { concepts: ['month-combine'] } })).toThrow(/Frozen corpus/);
});

test('Structured 1.2 transport, schema and prompt source bytes remain unchanged', () => {
  for (const [file, expected] of Object.entries({
    'src/ai/knowledge-input.js': 'sha256:2bb197b3a1a81a7de9461d1c320ac5739146b0b66e019b46519da3a8adcb1769',
    'src/ai/knowledge-schema.js': 'sha256:1bc9cd2ba503de36412bf211bfd076b9b0507d7b965895b166d244809a9dfeb1'
  })) expect(textHash(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'))).toBe(expected);
});
