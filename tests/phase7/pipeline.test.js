// @vitest-environment node
import { test, expect, vi, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { readCorpus } from '../../src/knowledge/load.js';
import { recordHash, stableJson, textHash } from '../../src/knowledge/validate.js';
import { buildStructuredAiInput } from '../../src/ai/structured-input.js';
import { buildRulesAiInput, assertRulesAiInput } from '../../src/ai/rules-input.js';
import { AI_INPUT_SCHEMA, validateAiValue } from '../../src/ai/schemas.js';
import { evaluateRules, readEvidencePath } from '../../src/rules/engine.js';
import { KNOWLEDGE_AI_SCHEMA } from '../../src/ai/knowledge-schema.js';
import { buildKnowledgePair, assertKnowledgeInput, assertKnowledgePair, assertKnowledgeLiterature,
  buildRelationAnchors, commonBase, renderKnowledgePrompt, FROZEN_CORPUS_HASH, KNOWLEDGE_SYSTEM_PROMPT } from '../../src/ai/knowledge-input.js';
import { exportKnowledgePairs } from '../../scripts/phase7-knowledge.js';

const priorCorpusVersion = process.env.LIUYAO_KNOWLEDGE_CORPUS_VERSION;
process.env.LIUYAO_KNOWLEDGE_CORPUS_VERSION = 'phase7.1-initial-1';
afterAll(() => {
  if (priorCorpusVersion === undefined) delete process.env.LIUYAO_KNOWLEDGE_CORPUS_VERSION;
  else process.env.LIUYAO_KNOWLEDGE_CORPUS_VERSION = priorCorpusVersion;
});
const root = path.resolve('experiments/phase7');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.fixture.json'), 'utf8'));
const corpus = readCorpus();
const fixture = i => JSON.parse(fs.readFileSync(path.join(root, `fixtures/compat-${i}.json`), 'utf8'));
const build = (i = 1, extra = {}) => buildKnowledgePair({ canonical: fixture(i), corpus, case_id: `compat-0${i}`, ...extra });
const count = x => [...x].length;
const walk = (value, fn) => { if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) { fn(key, child); walk(child, fn); } };
const allQuery = { concepts: ['interpretation-boundary'], limit: 100 };
function smallBase() {
  // Synthetic compatibility mutation, not a valid unseen effect-test cast.
  const c = fixture(1);
  for (const l of c.lines) {
    l.moving = true; l.is_kongwang = false;
    l.changed = { ganzhi: '甲子', branch: '子', element: '水', relative: '兄弟' }; l.hidden = { ...l.changed };
    for (const key of Object.keys(l.relations)) l.relations[key] = '';
  }
  return c;
}
test.each([1, 2, 3])('compatibility fixture %s produces valid symmetric 1.2 inputs', i => {
  const entry = config.cases[i - 1], pair = build(i, { query: entry.query });
  for (const arm of [pair.off, pair.on]) {
    validateAiValue(arm.input, KNOWLEDGE_AI_SCHEMA); assertKnowledgeInput(arm.input);
    expect(arm.input.ai_input_schema_version).toBe('1.2');
    expect(Object.keys(arm.input.F_literature_context)).toEqual(['items']);
  }
  expect(pair.off.input.F_literature_context.items).toEqual([]);
  expect(commonBase(pair.on.input)).toEqual(pair.off.input);
  expect(assertKnowledgePair(pair.off.input, pair.on.input)).toBe(true);
});
test('1.0 and 1.1 retain their original schemas and do not gain F or new flags', () => {
  const c = fixture(1), a = buildStructuredAiInput(c), b = buildRulesAiInput(c, 'on'), before = stableJson([a, b]);
  build();
  validateAiValue(a, AI_INPUT_SCHEMA); assertRulesAiInput(b);
  expect(stableJson([buildStructuredAiInput(c), buildRulesAiInput(c, 'on')])).toBe(before);
  expect(a.ai_input_schema_version).toBe('1.0'); expect(b.ai_input_schema_version).toBe('1.1');
  expect(b.E_rule_results.enabled).toBe(true);
  expect(a).not.toHaveProperty('F_literature_context'); expect(b).not.toHaveProperty('F_literature_context');
});
test('factory does not mutate Canonical, topic, corpus, existing rules or old projections', () => {
  const c = fixture(1), before = stableJson([c, corpus]), rules = evaluateRules(c), pair = build(1, { canonical: c });
  expect(stableJson([c, corpus])).toBe(before);
  expect(pair.on.input.C_canonical_cast).toEqual(buildStructuredAiInput(c).C_canonical_cast);
  expect(pair.on.input.E_rule_results.rule_result).toEqual(rules);
  expect(pair.off.input.E_rule_results).toEqual(pair.on.input.E_rule_results);
  expect(pair.archive.question_domain).toBe('unknown');
});
test('corpus, policy, projection, prompt and schema versions are pinned in private trace', () => {
  const a = build().archive;
  expect(a).toMatchObject({ corpus_hash: FROZEN_CORPUS_HASH, corpus_version: 'phase7.1-initial-1',
    retrieval_policy_version: 'deterministic-literature-1.0', knowledge_projection_version: 'literature-whitelist-1.0',
    prompt_version: 'structured-literature-p1', ai_input_schema_version: '1.2', validation_only: true });
  expect(corpus.units.filter(u => u.verification_status === 'reviewed')).toHaveLength(7);
  expect(corpus.units.filter(u => u.verification_status === 'source_checked')).toHaveLength(3);
});
test('resealed changes to corpus text, status or metadata cannot bypass the frozen hash', () => {
  for (const edit of [u => { u.notes += ' test'; }, u => { u.verification_status = 'draft'; }]) {
    const c = structuredClone(corpus); edit(c.units[0]); c.units[0].content_hash = recordHash(c.units[0]);
    expect(() => build(1, { corpus: c })).toThrow(/Frozen corpus/);
  }
});
test('only admitted units reach F; all three source_checked candidates remain excluded', () => {
  const p = build(1, { query: allQuery });
  for (const item of p.on.input.F_literature_context.items) expect(corpus.units.find(u => u.knowledge_id === item.knowledge_id).verification_status).toBe('reviewed');
  const excluded = p.archive.retrieval_trace.admission_excluded.map(x => x.id);
  for (const name of ['day-combine-context', 'return-scope', 'flying-hidden-context']) expect(excluded).toContain(`zsby-${name}-001`);
  const onlyPending = build(1, { query: { concepts: ['day-combine', 'return-relation', 'flying-hidden'] } });
  expect(onlyPending.on.input.F_literature_context.items).toEqual([]);
});
test('model-visible objects reject assignment fields at every protocol layer', () => {
  const pair = build();
  const banned = ['enabled', 'mode', 'treatment', 'variant', 'group', 'assignment', 'experiment_group'];
  for (const arm of [pair.off, pair.on]) walk(arm.input, key => expect(banned).not.toContain(key));
  for (const key of banned) {
    const input = structuredClone(pair.on.input); input.F_literature_context[key] = true;
    expect(() => assertKnowledgeInput(input)).toThrow();
  }
  for (const marker of ['Knowledge ON', 'Knowledge OFF', 'experiment group', 'control group', 'rules ON/OFF', '实验组', '对照组', '命中组']) {
    expect(pair.off.text).not.toContain(marker); expect(pair.on.text).not.toContain(marker);
  }
});
test('strict pair assertion detects changes anywhere outside F.items', () => {
  const pair = build();
  for (const edit of [x => { x.A_user_question += 'changed'; }, x => { x.D_ai_task.push('different'); },
    x => { x.B_program_facts[0] += 'different'; }, x => { x.C_canonical_cast.display.date_text = 'different'; }]) {
    const on = structuredClone(pair.on.input); edit(on);
    expect(() => assertKnowledgePair(pair.off.input, on)).toThrow(/differs outside/);
  }
  expect(() => assertKnowledgePair(pair.on.input, pair.on.input)).toThrow();
});
test('common-base hash includes common instructions and equals both empty-F renderings', () => {
  const p = build(), hash = textHash(renderKnowledgePrompt(commonBase(p.on.input)));
  expect(p.archive.common_base_hash).toBe(hash);
  expect(p.archive.off_common_base_hash).toBe(hash); expect(p.archive.on_common_base_hash).toBe(hash);
  expect(p.archive.off_visible_prompt_hash).toBe(textHash(p.off.text)); expect(p.archive.on_visible_prompt_hash).toBe(textHash(p.on.text));
});
test('both F hashes and full prompt character counts can be independently reproduced', () => {
  const p = build();
  for (const name of ['off', 'on']) {
    expect(p.archive.f_hash[name]).toBe(textHash(stableJson(p[name].input.F_literature_context)));
    expect(p.archive.prompt_chars[name]).toBe(count(p[name].text));
    expect(p.archive.f_chars[name]).toBe(count(JSON.stringify(p[name].input.F_literature_context)));
  }
  expect(p.archive.delta_chars).toBe(count(p.on.text) - count(p.off.text));
});
test('repeated pair building is byte-identical and independent of date, RNG and preferences', () => {
  const expected = build();
  const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Unexpected clock'); });
  const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Unexpected RNG'); });
  try { expect(build()).toEqual(expected); } finally { now.mockRestore(); random.mockRestore(); }
});
test('projected items preserve complete text and all condition/exception objects', () => {
  const p = build(1, { query: allQuery });
  for (const item of p.on.input.F_literature_context.items) {
    const u = corpus.units.find(u => u.knowledge_id === item.knowledge_id), s = corpus.segments.find(s => s.segment_id === u.segment_ref.segment_id);
    expect(item.original_text).toBe([...s.text].slice(u.segment_ref.span.start, u.segment_ref.span.end).join(''));
    for (const key of ['normalized_statement', 'applicable_conditions', 'exclusions', 'exceptions']) expect(item[key]).toEqual(u[key]);
    expect(item.source_role).toBe(u.source_type);
  }
});
test('projection excludes workflow/debug fields, record hashes, free tags and notes', () => {
  const p = build(1, { query: allQuery });
  const banned = ['provenance', 'notes', 'content_hash', 'text_hash', 'artifact_hash', 'reviewed_by', 'acquisition_date', 'verification_status', 'tags', 'retrieval_trace', 'match_reasons'];
  walk(p.on.input.F_literature_context, key => expect(banned).not.toContain(key));
  expect(p.on.text).not.toContain(FROZEN_CORPUS_HASH);
  expect(p.on.text).not.toContain('codex-visual-review');
  expect(p.archive.retrieval_trace.selected[0].unit).toHaveProperty('provenance');
});
test('citation pins edition, chapter, image page, segment revision and exact Unicode span', () => {
  for (const item of build().on.input.F_literature_context.items) {
    const s = corpus.segments.find(s => s.segment_id === item.citation.segment_id);
    expect(item.citation.edition_id).toBe(s.edition_id);
    expect(item.citation.segment_revision).toBe(s.revision);
    expect(item.citation.image_page).toBe(s.locator.image_page);
    expect(item.citation.chapter).toBe(s.locator.chapter);
    expect(item.citation.span.end - item.citation.span.start).toBe(count(item.original_text));
  }
});
test('content validator rejects changed original text, conditions, citation or unrelated links', () => {
  const p = build();
  for (const edit of [i => { i.original_text += '伪原文'; }, i => { i.exceptions.statements.push('invented'); },
    i => { i.citation.image_page++; }, i => { i.relation_links = []; }]) {
    const input = structuredClone(p.on.input); edit(input.F_literature_context.items[0]);
    expect(() => assertKnowledgeLiterature(input, corpus)).toThrow();
  }
});
test('all three budget constraints hold together over the compatibility fixtures', () => {
  for (let i = 1; i <= 3; i++) {
    const p = build(i, { query: allQuery });
    expect(p.on.input.F_literature_context.items.length).toBeLessThanOrEqual(4);
    expect(p.archive.f_chars.on).toBeLessThanOrEqual(2400);
    expect(p.archive.delta_percent).toBeLessThanOrEqual(15);
  }
});
test('over-budget candidates are excluded whole in retrieval order, not shortened', () => {
  const p = build(1, { query: allQuery });
  expect(p.archive.budget_excluded.length).toBeGreaterThan(0);
  expect(p.archive.budget_excluded.some(x => x.constraints.includes('max_f_code_points'))).toBe(true);
  expect(p.archive.selected_knowledge_ids).toEqual(['zsby-advance-definition-001', 'zsby-day-clash-context-001']);
  const accounted = [...p.archive.selected_knowledge_ids, ...p.archive.budget_excluded.map(x => x.knowledge_id)].sort();
  expect(accounted).toEqual(p.archive.retrieval_trace.selected.map(s => s.unit.knowledge_id).sort());
});
test('small synthetic base activates the percentage cap before the F character cap', () => {
  const p = build(1, { canonical: smallBase(), query: allQuery });
  expect(p.archive.budget_excluded.some(x => x.constraints.includes('max_delta_percent') && !x.constraints.includes('max_f_code_points'))).toBe(true);
  expect(p.archive.delta_chars * 100).toBeLessThanOrEqual(p.archive.prompt_chars.off * 15);
  expect(p.archive.selected_knowledge_ids).toEqual(['zsby-advance-definition-001']);
});
test('schema rejects more than four units and validator rejects F above 2400 characters', () => {
  const p = build(), item = p.on.input.F_literature_context.items[0];
  const tooMany = structuredClone(p.off.input);
  tooMany.F_literature_context.items = Array.from({ length: 5 }, () => structuredClone(item));
  expect(() => assertKnowledgeInput(tooMany)).toThrow();
  const tooLong = structuredClone(p.on.input); tooLong.F_literature_context.items[0].original_text = '甲'.repeat(2401);
  expect(() => assertKnowledgeInput(tooLong)).toThrow(/F budget/);
});
test('budget accounting uses Unicode code points rather than UTF-16 units', () => {
  const c = fixture(1); c.question.text += '😀😀';
  const p = build(1, { canonical: c });
  expect(p.archive.prompt_chars.off).toBe(count(p.off.text));
  expect(p.archive.prompt_chars.off).toBeLessThan(p.off.text.length);
});
test('zero-match pair remains valid and carries identical texts, hashes and zero delta', () => {
  const p = build(3, { query: config.cases[2].query });
  expect(p.on.input.F_literature_context.items).toEqual([]);
  expect(p.off.text).toBe(p.on.text); expect(p.archive.delta_chars).toBe(0);
  expect(p.archive.off_visible_prompt_hash).toBe(p.archive.on_visible_prompt_hash);
});
test('no rule hits does not accidentally turn the default selector into retrieve-all', () => {
  const c = fixture(1); c.calendar.month_branch = null; c.calendar.day_branch = null;
  c.hexagram.shi_line = null; c.hexagram.ying_line = null;
  for (const l of c.lines) { l.moving = false; l.is_kongwang = false; for (const key of Object.keys(l.relations)) l.relations[key] = ''; }
  const p = build(1, { canonical: c });
  expect(p.on.input.E_rule_results.rule_result.hits).toEqual([]);
  expect(p.on.input.F_literature_context.items).toEqual([]);
});
test('anchors use structured r1 identity, target, direction and exact C paths, not labels', () => {
  const p = build(), result = p.on.input.E_rule_results.rule_result, anchors = buildRelationAnchors(result);
  expect(anchors).toEqual(p.on.input.E_rule_results.relation_anchors);
  expect(new Set(anchors.map(a => a.evidence_identity)).size).toBe(result.hits.length);
  for (let i = 0; i < anchors.length; i++) {
    expect(anchors[i].target).toEqual(result.hits[i].target);
    expect(anchors[i].direction.from).toEqual(result.hits[i].result.from ?? null);
    for (const e of result.hits[i].evidence) expect(readEvidencePath(p.on.input.C_canonical_cast, e.path)).toBe(e.value);
  }
  const labels = structuredClone(result); labels.hits.forEach(h => { h.result.label = 'arbitrary display wording'; });
  expect(buildRelationAnchors(labels)).toEqual(anchors);
});
test('literature links refer to existing exact r1 hits and never add relation hits', () => {
  const p = build(), { rule_result: result, relation_anchors: anchors } = p.on.input.E_rule_results;
  expect(result).toEqual(evaluateRules(fixture(1)));
  for (const item of p.on.input.F_literature_context.items) {
    const u = corpus.units.find(u => u.knowledge_id === item.knowledge_id);
    expect(item.relation_links).toEqual(anchors.filter(a => u.related_rule_ids.includes(a.rule_id)).map(a => a.evidence_identity));
    expect(item.independent_evidence).toBe(false);
    expect(item.role).toBe('literature_context');
  }
});
test('concept-only context has a literature identity and no fabricated evidence link', () => {
  const p = build(1, { query: { concepts: ['advance'] } });
  const item = p.on.input.F_literature_context.items[0];
  expect(item.knowledge_id).toBe('zsby-advance-definition-001'); expect(item.relation_links).toEqual([]);
  expect(item.literature_identity).toBe('literature/zsby-advance-definition-001@1');
  expect(item.independent_evidence).toBe(false);
});
test('bad anchors, unknown links, duplicate links/items and invented evidence are rejected', () => {
  const p = build();
  for (const edit of [x => { x.E_rule_results.relation_anchors[0].evidence_identity += 'bad'; },
    x => { x.F_literature_context.items[0].relation_links.push('invented'); },
    x => { const links = x.F_literature_context.items[0].relation_links; links.push(links[0]); },
    x => { x.F_literature_context.items.push(x.F_literature_context.items[0]); },
    x => { x.F_literature_context.items[0].independent_evidence = true; }]) {
    const input = structuredClone(p.on.input); edit(input); expect(() => assertKnowledgeInput(input)).toThrow();
  }
});
test('instructions impose role, conflict, duplicate-evidence and leakage boundaries in both arms', () => {
  const p = build();
  for (const text of [p.off.text, p.on.text]) {
    expect(text.startsWith(KNOWLEDGE_SYSTEM_PROMPT)).toBe(true);
    for (const fragment of ['不是 Canonical fact', '不能覆盖 Canonical 或修改 Rule Result', '保留程序事实、说明文献语境差异', '不能因为数量多就自动提高权重', '不要在回答中提及输入协议', '只回答用户问题']) expect(text).toContain(fragment);
  }
});
test('no network or model request is made while building a pair', () => {
  const fetch = vi.fn(() => { throw new Error('Network forbidden in pipeline validation'); });
  vi.stubGlobal('fetch', fetch);
  try { build(); expect(fetch).not.toHaveBeenCalled(); } finally { vi.unstubAllGlobals(); }
});
test('CLI creates neutral texts, private trace/mapping, reproducible bytes and refuses overwrite', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase7-pipeline-'));
  try {
    const first = path.join(temp, 'first'), second = path.join(temp, 'second');
    exportKnowledgePairs({ config, configDirectory: root, outputDirectory: first });
    exportKnowledgePairs({ config, configDirectory: root, outputDirectory: second });
    expect(fs.readdirSync(path.join(first, 'execution')).sort()).toEqual(config.cases.flatMap(c => [`${c.case_id}-A.txt`, `${c.case_id}-B.txt`]).sort());
    for (const folder of ['execution', 'private']) for (const file of fs.readdirSync(path.join(first, folder))) {
      const a = fs.readFileSync(path.join(first, folder, file), 'utf8');
      expect(a).toBe(fs.readFileSync(path.join(second, folder, file), 'utf8'));
      if (folder === 'execution') { expect(a).not.toContain(config.assignment_seed); expect(a).not.toContain('assignment'); expect(a).not.toContain('model_settings'); }
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(first, 'private/manifest.json'), 'utf8'));
    expect(manifest.assignment_seed).toBe(config.assignment_seed);
    expect(manifest.model_settings).toEqual(config.model_settings);
    for (const c of manifest.cases) {
      expect(Object.values(c.assignment).sort()).toEqual(['off', 'on']);
      const archive = JSON.parse(fs.readFileSync(path.join(first, `private/${c.case_id}.json`), 'utf8'));
      for (const label of ['A', 'B']) expect(textHash(fs.readFileSync(path.join(first, `execution/${c.case_id}-${label}.txt`), 'utf8'))).toBe(archive[`${c.assignment[label]}_visible_prompt_hash`]);
    }
    expect(() => exportKnowledgePairs({ config, configDirectory: root, outputDirectory: first })).toThrow(/overwrite/);
    const cli = spawnSync(process.execPath, ['scripts/phase7-knowledge.js', path.join(root, 'config.fixture.json'), path.join(temp, 'cli')], { encoding: 'utf8' });
    expect(cli.status).toBe(0); expect(JSON.parse(cli.stdout).pairs).toBe(3);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test('invalid export config fails before creating an output package', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase7-config-'));
  try {
    for (const edit of [c => { c.data_kind = 'effect_experiment'; }, c => { c.cases.push(c.cases[0]); },
      c => { c.cases[0].case_id = '../escape'; }, c => { c.cases[0].case_id = 'manifest'; }, c => { c.cases[1].query.enabled = true; }]) {
      const c = structuredClone(config); edit(c); const output = path.join(temp, 'out');
      expect(() => exportKnowledgePairs({ config: c, configDirectory: root, outputDirectory: output })).toThrow();
      expect(fs.existsSync(output)).toBe(false);
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test('old production transport, Core and r1 files retain their frozen source bytes', () => {
  const hashes = {
    'src/ai/structured-input.js': '89fa199a0eea1bc27c1524d4b5e3336ac425115ecab28dd340b7cfff0837be7b',
    'src/ai/rules-input.js': '4d49c008cef6554a021369133aab396bdd30cc429e1eef1ff7845cfdacfbe78a',
    'src/ai/schemas.js': 'f2cb602a6f0b75bf6360991a5aa90f6f1fb8f14e3414ede77747577a4459c94c',
    'src/ai/prompt-builder.js': 'd4e1c4872ad579d615afee1fc27c721e3e041ea540c586aeaf422077565e14bf',
    'src/ai/formatter.js': '845244d2b45b29b012e4d3a571c3c0472a822acc7775e2c6248c68e253ae5089',
    'src/ai/interpreter.js': 'ba8b0c37a5be6145596cd6831d3efbf58cb16a0b9e50b070a8e87cc10617d009',
    'src/rules/engine.js': '0ddaa9aba9f98c41f5d5e6b2382d4abf40279a208da1a108bd3ea5d659286038',
    'src/rules/registry.js': '27206a2c58195328ee38c65a902771f0d4688458b73cd598a92fd21c41fb0cc9',
    'src/core/normalize.js': 'dbdea13cc1290060623f853c4ac942568bd1ef909e3961586210f353bac5a086'
  };
  for (const [file, hash] of Object.entries(hashes)) expect(textHash(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'))).toBe(`sha256:${hash}`);
});
