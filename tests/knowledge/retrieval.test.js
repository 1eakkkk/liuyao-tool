// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { readCorpus, loadCorpus } from '../../src/knowledge/load.js';
import { createKnowledgeIndex, retrieve, RETRIEVAL_POLICY_VERSION } from '../../src/knowledge/retrieve.js';
import { associateEvidence } from '../../src/knowledge/dedupe.js';
import { recordHash, textHash, validateCorpus } from '../../src/knowledge/validate.js';
import { fixture, seal } from './fixtures.js';

const options = { ruleIds: RULES.map(x => x.rule_id), rulesetVersion: RULESET_VERSION };
const frozen = JSON.parse(fs.readFileSync(new URL('./retrieval-cases.json', import.meta.url), 'utf8'));
const corpus = readCorpus();
const build = c => createKnowledgeIndex(c, options);
const ids = result => result.selected.map(x => x.unit.knowledge_id);
const unit = (c, name) => c.units.find(x => x.knowledge_id === `zsby-${name}-001`);
const changed = fn => { const c = structuredClone(corpus); fn(c); return seal(c); };

test.each(frozen.cases)('frozen retrieval: $name', ({ query, ids: expected }) => {
  expect(ids(retrieve(build(corpus), query))).toEqual(expected);
});
test('real single edition, nine sources and spans validate without mutation', () => {
  const before = JSON.stringify(corpus), result = validateCorpus(corpus, { ...options, requireImageWitness: true });
  expect(result.counts).toEqual({ sources: 1, segments: 9, units: 10, commentary: 0 });
  expect(result.admitted.units).toHaveLength(7);
  expect(JSON.stringify(corpus)).toBe(before);
  for (const s of corpus.segments) expect(s.text_hash).toBe(textHash(s.text));
  for (const u of corpus.units) {
    const s = corpus.segments.find(s => s.segment_id === u.segment_ref.segment_id);
    expect(u.original_text).toBe([...s.text].slice(u.segment_ref.span.start, u.segment_ref.span.end).join(''));
    expect(u.related_rule_ids.every(id => options.ruleIds.includes(id))).toBe(true);
  }
});
test('fixed artifact provenance separates original holding from acquisition mirror', () => {
  const s = corpus.sources[0];
  expect(s.holding.repository).toBe('中国国家图书馆');
  expect(s.image_witness.mirror.repository).toContain('Wikimedia');
  expect(s.image_witness.page_count).toBe(394);
  expect(s.image_witness.volume_count).toBe(6); expect(s.image_witness.booklet_count).toBe(3);
  expect(s.provenance.artifact_hash).toBe('sha256:caac111bc5c5b1c08fd27b3828e7cf6b5430503800f2427d8f2b28809022abaa');
  expect(s.image_witness.metadata_image_pages).toEqual([21, 339, 393]);
  expect(s.contributors.every(x => x.certainty === 'as_printed' && x.attribution_basis.includes('影像'))).toBe(true);
});
test('frozen corpus hash and policy survive disk reload and input array permutations', () => {
  const a = loadCorpus(undefined, options), c = structuredClone(corpus);
  for (const k of ['sources', 'segments', 'units', 'commentary']) c[k].reverse();
  c.catalog.concepts.reverse(); c.catalog.categories.reverse();
  expect(build(c)).toEqual(a); expect(a.corpus_hash).toBe(frozen.corpus_hash);
  expect(RETRIEVAL_POLICY_VERSION).toBe(frozen.policy_version);
  expect(retrieve(build(c))).toEqual(retrieve(a));
});
test('hash covers catalog aliases, pending records and metadata, not just selected units', () => {
  for (const edit of [c => { c.sources[0].notes += ' changed'; }, c => { c.catalog.concepts[0].aliases.push('test-only-alias'); }, c => { unit(c, 'return-scope').notes += ' changed'; }]) {
    expect(build(changed(edit)).corpus_hash).not.toBe(frozen.corpus_hash);
  }
});
test('index and returned payload cannot mutate later results', () => {
  const c = structuredClone(corpus), index = build(c), before = retrieve(index);
  c.units[0].normalized_statement = 'mutated';
  const result = retrieve(index); result.selected[0].unit.normalized_statement = 'mutated';
  result.admission_excluded[0].reasons.push('mutated');
  expect(retrieve(index)).toEqual(before);
});
test('draft, disputed, retired and upstream non-review cannot become retrievable', () => {
  for (const status of ['draft', 'source_checked', 'disputed', 'retired']) {
    const index = build(changed(c => { unit(c, 'shiying-scope').verification_status = status; }));
    expect(ids(retrieve(index, { concepts: ['shi-ying'] }))).toEqual([]);
  }
  expect(retrieve(build(changed(c => { c.sources[0].verification_status = 'draft'; }))).selected).toEqual([]);
});
test('incomplete witness or imprecise image locator excludes dependent units', () => {
  for (const edit of [c => { delete c.sources[0].image_witness; }, c => { c.sources[0].holding.identifier = null; }, c => { c.sources[0].provenance.rights.status = 'unknown'; }]) {
    expect(retrieve(build(changed(edit))).selected).toEqual([]);
  }
  const c = changed(c => { c.segments[0].locator.image_page = null; });
  expect(ids(retrieve(build(c), { concepts: ['shi-ying'] }))).toEqual([]);
});
test('transcription uncertainty blocks admission even with a reviewed label', () => {
  const c = changed(c => { c.segments[0].transcription_uncertainties = ['test-only simulated unclear glyph']; });
  const result = retrieve(build(c));
  expect(result.admission_excluded.find(x => x.id === 'zsby-1925-s1').reasons).toContain('transcription_uncertain');
  expect(ids(result)).not.toContain('zsby-shiying-scope-001');
});
test('unknown edition and missing/stale segment cannot silently fall back', () => {
  expect(() => retrieve(build(corpus), { allowed_editions: ['unknown'] })).toThrow(/Unknown edition/);
  expect(() => build(changed(c => { c.segments[0].edition_id = 'unknown'; }))).toThrow(/edition\/work/);
  expect(() => build(changed(c => { c.units[0].segment_ref.segment_id = 'unknown'; }))).toThrow(/missing\/stale/);
});
test('inconsistent artifact, outside page and altered transcription are rejected', () => {
  expect(() => build(changed(c => { c.segments[0].provenance.artifact_hash = textHash('other'); }))).toThrow(/artifact/);
  expect(() => build(changed(c => { c.units[0].provenance.artifact_hash = textHash('other'); }))).toThrow(/artifact/);
  expect(() => build(changed(c => { c.segments[0].locator.image_page = 395; }))).toThrow(/page/);
  const c = structuredClone(corpus); c.segments[0].text += '更改'; c.segments[0].content_hash = recordHash(c.segments[0]);
  expect(() => build(c)).toThrow(/text hash/);
});
test('unknown fields and r1 substitutions fail closed', () => {
  for (const key of ['confidence', 'score', 'prediction_weight']) expect(() => build(changed(c => { c.units[0][key] = 1; }))).toThrow(/unknown field/);
  expect(() => build(changed(c => { c.units[0].related_rule_ids = ['INVENTED-001']; }))).toThrow(/unknown r1/);
  expect(() => build(changed(c => { c.sources[0].image_witness.extra = 'guessed'; }))).toThrow(/unknown field/);
});
test('unknown aliases never trigger fuzzy expansion or original-text rewriting', () => {
  const index = build(corpus), before = JSON.stringify(corpus);
  expect(retrieve(index, { terms: [' 世應 '] }).selected).toEqual([]);
  const result = retrieve(index, { terms: ['世應', '世应'] });
  expect(result.selected).toHaveLength(1); expect(result.normalized_terms.every(x => x.concept_id === 'shi-ying')).toBe(true);
  expect(JSON.stringify(corpus)).toBe(before);
  expect(() => build(changed(c => { c.catalog.concepts[0].aliases.push('xunkong'); }))).toThrow(/alias/);
});
test('OR within selectors and AND across selectors are explicit, without weights', () => {
  const result = retrieve(build(corpus), { concepts: ['advance', 'retreat'], categories: ['moving-relation'] });
  expect(ids(result)).toEqual(['zsby-advance-definition-001', 'zsby-retreat-definition-001']);
  expect(retrieve(build(corpus), { concepts: ['advance'], categories: ['void'] }).selected).toEqual([]);
});
test('condition filtering inspects declared status only and rejects inferred properties', () => {
  expect(retrieve(build(corpus), { condition_statuses: { applicable_conditions: 'specified' } }).selected).toHaveLength(7);
  expect(retrieve(build(corpus), { condition_statuses: { exceptions: 'unreviewed' } }).selected).toEqual([]);
  expect(() => retrieve(build(corpus), { condition_statuses: { strong: true } })).toThrow(/condition/);
});
test('query rejects typo fields, invalid types, unknown controlled IDs and unsafe limits', () => {
  for (const query of [{ score: 1 }, { concepts: null }, { terms: '世應' }, { limit: 1.5 }, { limit: -1 }, { limit: 101 }, { concepts: ['missing'] }, { categories: ['missing'] }, { related_rule_ids: ['MISSING'] }]) {
    expect(() => retrieve(build(corpus), query)).toThrow();
  }
  expect(() => retrieve({})).toThrow(/Validated/);
});
test('every nonselected unit has a reason, including admission and deterministic limit', () => {
  const result = retrieve(build(corpus), { limit: 2 });
  expect(result.excluded).toHaveLength(8);
  expect(result.excluded.every(x => x.reasons.length)).toBe(true);
  expect(result.excluded.filter(x => x.reasons.includes('limit'))).toHaveLength(5);
  expect(result.selected.every(x => x.match_reasons.length)).toBe(true);
});
test('same span plus same proposition deduplicates; shared rules or segments alone do not', () => {
  const c = structuredClone(corpus), original = unit(c, 'shiying-scope');
  c.units.push({ ...structuredClone(original), knowledge_id: 'zzz-identical-copy' }); seal(c);
  const result = retrieve(build(c), { concepts: ['shi-ying'] });
  expect(result.selected).toHaveLength(1);
  expect(result.selected[0].same_proposition_ids).toEqual(['zsby-shiying-scope-001', 'zzz-identical-copy']);
  expect(result.selected[0].same_proposition_citations).toHaveLength(2);
  c.units.at(-1).normalized_statement = 'Synthetic distinct proposition for dedupe boundary test'; seal(c);
  expect(retrieve(build(c), { concepts: ['shi-ying'] }).selected).toHaveLength(2);
  expect(retrieve(build(corpus), { categories: ['moving-relation'] }).selected).toHaveLength(2);
});
test('explicit equivalence is stable but disputes exclude both ends', () => {
  const c = structuredClone(corpus), original = unit(c, 'shiying-scope');
  const other = { ...structuredClone(original), knowledge_id: 'zzz-related', normalized_statement: 'Synthetic alternative wording' };
  original.related_units = [{ target: { knowledge_id: other.knowledge_id, revision: 1 }, relationship: 'equivalent' }];
  c.units.push(other); seal(c);
  expect(retrieve(build(c), { concepts: ['shi-ying'] }).selected).toHaveLength(1);
  original.disputes = [{ target: { knowledge_id: other.knowledge_id, revision: 1 }, reason: 'Synthetic unresolved dispute' }]; seal(c);
  expect(retrieve(build(c), { concepts: ['shi-ying'] }).selected).toHaveLength(0);
});
test('evidence identity is inherited, never manufactured for C/E/K or merged across casts/targets', () => {
  const u = unit(corpus, 'shiying-scope'), copy = { ...u, knowledge_id: 'test-only-second-citation' };
  const ref = { rule_id: 'SHI-GENERATE-YING-001', ruleset_version: 'r1', evidence_identity: 'cast-1:shi-ying:direction-1' };
  const linked = associateEvidence([u, copy], [ref, ref]);
  expect(linked).toEqual([{ evidence_identity: ref.evidence_identity, rule_ids: [ref.rule_id], knowledge_ids: [copy.knowledge_id, u.knowledge_id], knowledge_role: 'literature_context', independent_evidence: false }]);
  expect(associateEvidence([u], [])).toEqual([]);
  expect(associateEvidence([u], [ref, { ...ref, evidence_identity: 'cast-2:shi-ying:direction-1' }])).toHaveLength(2);
  expect(associateEvidence([{ ...u, verification_status: 'draft' }], [ref])).toEqual([]);
  expect(retrieve(build(corpus)).selected.every(x => x.association.evidence_identity === null && !x.association.independent_evidence)).toBe(true);
});
test('citations pin source/span/artifact and association metadata carries no cast facts', () => {
  const result = retrieve(build(corpus), { related_rule_ids: ['MONTH-CLASH-001'] }).selected[0];
  expect(result.citation.locator.image_page).toBe(104);
  expect(result.citation.segment_ref).toEqual(result.unit.segment_ref);
  expect(result.association).toEqual({ ruleset_version: 'r1', related_rule_ids: ['MONTH-CLASH-001'], semantics: 'association_only', knowledge_role: 'literature_context', independent_evidence: false, evidence_identity: null, requires_cast_binding: true });
});
test('official corpus has no Commentary, Case, fixture or unapproved statistical fields', () => {
  expect(corpus.commentary).toEqual([]); expect(Object.hasOwn(corpus, 'cases')).toBe(false);
  const visit = x => { if (x && typeof x === 'object') for (const [key, v] of Object.entries(x)) {
    expect(['confidence', 'score', 'prediction_weight', 'case_id']).not.toContain(key); visit(v);
  } };
  visit(corpus);
  expect(() => build(fixture())).toThrow(/test_only/);
  expect(frozen.data_kind).toBe('test_only');
});
test('offline CLI requires explicit pending allowance and retrieval emits a traceable result', () => {
  const args = ['scripts/knowledge/validate-corpus.js'];
  const strict = spawnSync(process.execPath, args, { encoding: 'utf8' });
  expect(strict.status).toBe(1);
  const allowed = spawnSync(process.execPath, [...args, '--allow-pending'], { encoding: 'utf8' });
  expect(allowed.status).toBe(0); expect(JSON.parse(allowed.stdout).admitted.units).toHaveLength(7);
  const query = spawnSync(process.execPath, ['scripts/knowledge/retrieve.js', JSON.stringify({ concepts: ['shi-ying'] })], { encoding: 'utf8' });
  expect(query.status).toBe(0); expect(ids(JSON.parse(query.stdout))).toEqual(['zsby-shiying-scope-001']);
});
test('loader rejects a fixture copied into production and unexpected binary files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-load-'));
  try {
    for (const d of ['sources', 'classics', 'units', 'commentary', 'catalog']) fs.mkdirSync(path.join(root, d));
    fs.writeFileSync(path.join(root, 'catalog/catalog.json'), JSON.stringify(fixture().catalog));
    fs.writeFileSync(path.join(root, 'sources/fixture.json'), JSON.stringify(fixture().sources[0]));
    expect(() => loadCorpus(root, options)).toThrow(/test_only/);
    fs.writeFileSync(path.join(root, 'classics/source.pdf'), 'test-only binary placeholder');
    expect(() => readCorpus(root)).toThrow(/Unexpected corpus file/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('Ruleset r1 implementation and all 25 registry entries remain at the Phase 7.0 baseline', () => {
  const hashes = {
    'engine.js': 'sha256:0ddaa9aba9f98c41f5d5e6b2382d4abf40279a208da1a108bd3ea5d659286038',
    'registry.js': 'sha256:27206a2c58195328ee38c65a902771f0d4688458b73cd598a92fd21c41fb0cc9',
    'schema.js': 'sha256:d46b8a7cb2873dfdde694981863000bab5dad601280afce81052c59eff149ce1'
  };
  expect(RULES).toHaveLength(25); expect(RULESET_VERSION).toBe('r1');
  for (const [file, hash] of Object.entries(hashes)) expect(textHash(fs.readFileSync(`src/rules/${file}`, 'utf8').replaceAll('\r\n', '\n'))).toBe(hash);
});
