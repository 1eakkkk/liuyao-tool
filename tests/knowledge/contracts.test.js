// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { validateCorpus, recordHash, textHash } from '../../src/knowledge/validate.js';
import { checkCorpus, readCorpus } from '../../scripts/knowledge/validate-corpus.js';
import { fixture, seal } from './fixtures.js';
const options = { ruleIds: RULES.map(r => r.rule_id), rulesetVersion: RULESET_VERSION, mode: 'fixture' };
const validate = (c, extra = {}) => validateCorpus(c, { ...options, ...extra });
function reject(change, pattern) { const c = fixture(); change(c); seal(c); expect(() => validate(c)).toThrow(pattern); }
// In-memory simulation of admission only. Never persisted; these invented records remain fixtures on disk.
function admissionFixture() {
  const c = fixture();
  for (const r of [...c.sources, ...c.segments, ...c.units, ...c.commentary]) {
    r.data_kind = 'corpus'; r.verification_status = 'reviewed'; r.provenance.method = 'editorial';
    r.provenance.rights = { status: 'permission', basis: 'Synthetic admission test only' };
    r.provenance.reviewed_by = 'synthetic-reviewer'; r.provenance.reviewed_at = '2026-09-16';
  }
  return seal(c);
}
test('all four fixture contracts validate, remain test_only, and are not mutated', () => {
  const c = fixture(), before = JSON.stringify(c), result = validate(c);
  expect(result.valid).toBe(true); expect(JSON.stringify(c)).toBe(before);
  expect(result.admitted).toEqual({ sources: [], segments: [], units: [], commentary: [] });
});
test('closed schemas reject unknown fields at every record and nested provenance level', () => {
  for (const field of ['sources', 'segments', 'units', 'commentary']) reject(c => { c[field][0].confidence = 0.9; }, /unknown field/);
  reject(c => { c.sources[0].provenance.guessed = true; }, /unknown field/);
  reject(c => { c.catalog.concepts[0].weight = 3; }, /unknown field/);
});
test('required provenance and URL-or-identifier are enforced', () => {
  const c = fixture(); delete c.units[0].provenance; expect(() => validate(c)).toThrow(/missing provenance/);
  reject(c => { c.sources[0].provenance.identifier = null; }, /URL or identifier/);
  reject(c => { c.sources[0].provenance.source_url = 'file:///private'; }, /protocol/);
});
test('revisions must be positive integers and schema versions exact', () => {
  for (const revision of [0, -1, 1.5, '1']) reject(c => { c.units[0].revision = revision; }, /type|minimum/);
  reject(c => { c.units[0].schema_version = '1.1'; }, /const/);
});
test('verification enum and reviewer/date requirements cannot imply review', () => {
  reject(c => { c.units[0].verification_status = 'unknown'; }, /enum/);
  reject(c => { c.units[0].verification_status = 'reviewed'; }, /reviewer/);
  reject(c => { c.sources[0].provenance.acquisition_date = '2026-02-30'; }, /date/);
});
test('record IDs and edition IDs must be unique independently of object equality', () => {
  reject(c => { c.units.push({ ...structuredClone(c.units[0]), notes: 'different' }); }, /duplicate knowledge_id/);
  reject(c => { c.sources.push({ ...structuredClone(c.sources[0]), source_id: 'another-source' }); }, /duplicate edition_id/);
  reject(c => { c.commentary[0].commentary_id = c.units[0].knowledge_id; }, /globally unique/);
});
test('source/edition references and pinned revisions are enforced', () => {
  reject(c => { c.segments[0].source_ref.source_id = 'missing'; }, /missing\/stale/);
  reject(c => { c.segments[0].source_ref.revision = 2; }, /missing\/stale/);
  reject(c => { c.segments[0].edition_id = 'another'; }, /edition\/work/);
  reject(c => { c.units[0].segment_ref.segment_id = 'missing'; }, /missing\/stale/);
});
test('Unicode code-point spans preserve original characters, newlines and exact quotes', () => {
  const c = fixture(); expect(validate(c).valid).toBe(true);
  delete c.units[0].original_text; expect(validate(seal(c)).valid).toBe(true);
  reject(x => { x.units[0].original_text = '甲乙'; }, /differs/);
  reject(x => { x.units[0].segment_ref.span.end = 99; }, /bounds/);
  reject(x => { x.units[0].segment_ref.span.start = 3; }, /bounds/);
});
test('both full record and raw transcription hashes detect silent edits', () => {
  const c = fixture(); c.units[0].normalized_statement += 'edit'; expect(() => validate(c)).toThrow(/content hash/);
  const d = fixture(); d.segments[0].text += 'edit'; d.segments[0].content_hash = recordHash(d.segments[0]);
  expect(() => validate(d)).toThrow(/text hash/);
  expect(textHash('a\r\nb')).not.toBe(textHash('a\nb'));
});
test('record hash is stable under key order but includes metadata and revision', () => {
  const r = fixture().units[0]; expect(recordHash(Object.fromEntries(Object.entries(r).reverse()))).toBe(recordHash(r));
  expect(recordHash({ ...r, revision: 2 })).not.toBe(recordHash(r));
});
test('only r1 IDs and association-only semantics are allowed', () => {
  reject(c => { c.units[0].related_rule_ids = ['FAKE-RULE-001']; }, /unknown r1 rule/);
  reject(c => { c.units[0].rule_link_semantics = 'proves_rule'; }, /const/);
  expect(() => validate(fixture(), { rulesetVersion: 'r2' })).toThrow(/r1/);
});
test('attribution preserves roles and explicit uncertainty without supplying authors', () => {
  const c = fixture(); expect(validate(c).valid).toBe(true); expect(c.sources[0].contributors[0].name).toBeNull();
  reject(x => { x.sources[0].contributors = '某作者'; }, /type/);
  reject(x => { x.sources[0].contributors[0].name = '猜测署名'; }, /unknown attribution/);
});
test('controlled concepts/categories/tags reject free substitutions and ambiguous aliases', () => {
  reject(c => { c.units[0].related_concepts = ['unknown-concept']; }, /unknown concept/);
  reject(c => { c.units[0].tags = ['anything']; }, /controlled tag/);
  reject(c => { c.units[0].category = 'anything'; }, /category/);
  reject(c => { c.catalog.concepts.push({ concept_id: 'second', label: '測試概念', aliases: [], definition: 'test' }); }, /alias/);
});
test('condition/exception states cannot masquerade as reviewed absence', () => {
  reject(c => { c.units[0].exceptions = { status: 'none_stated', statements: ['有例外'] }; }, /mismatch/);
  const c = admissionFixture(); c.units[0].exceptions.status = 'unreviewed';
  expect(validate(seal(c), { mode: 'production' }).admitted.units).toEqual([]);
});
test('historical commentary cannot masquerade as classical body', () => {
  reject(c => { c.segments[0].text_role = 'historical_commentary'; }, /role mismatch/);
});
test('modern commentary requires valid references and remains a separate record', () => {
  reject(c => { c.commentary[0].knowledge_refs = []; }, /requires/);
  reject(c => { c.commentary[0].knowledge_refs[0].revision = 2; }, /missing\/stale/);
});
test('unresolved disputes exclude both ends; dangling/self relationships fail', () => {
  reject(c => { c.units[0].related_units = [{ target: { knowledge_id: 'missing', revision: 1 }, relationship: 'related' }]; }, /missing\/stale/);
  const c = admissionFixture(), other = structuredClone(c.units[0]); other.knowledge_id = 'second-unit';
  c.units.push(other); c.units[0].disputes = [{ target: { knowledge_id: 'second-unit', revision: 1 }, reason: 'Synthetic conflict' }];
  expect(validate(seal(c), { mode: 'production' }).admitted.units).toEqual([]);
});
test('all non-reviewed statuses exclude their dependent units and commentary', () => {
  for (const state of ['draft', 'source_checked', 'disputed', 'retired']) {
    const c = admissionFixture(); c.sources[0].verification_status = state;
    expect(validate(seal(c), { mode: 'production' }).admitted.units).toEqual([]);
  }
});
test('incomplete bibliographic provenance or locator cannot enter admission set', () => {
  const c = admissionFixture(); expect(validate(c, { mode: 'production' }).admitted.units).toHaveLength(1);
  c.sources[0].edition.designation = null; expect(validate(seal(c), { mode: 'production' }).admitted.units).toEqual([]);
  const d = admissionFixture(); d.segments[0].locator.page = null;
  expect(validate(seal(d), { mode: 'production' }).admitted.units).toEqual([]);
});
test('unknown reuse status blocks admission without claiming prediction confidence', () => {
  const c = admissionFixture(); c.sources[0].provenance.rights.status = 'unknown';
  expect(validate(seal(c), { mode: 'production' }).admitted.sources).toEqual([]);
});
test('production rejects fixtures even when reviewed; fixture mode rejects corpus markers', () => {
  expect(() => validate(fixture(), { mode: 'production' })).toThrow(/test_only/);
  const c = fixture(); c.units[0].verification_status = 'reviewed'; c.units[0].provenance.reviewed_by = 'test'; c.units[0].provenance.reviewed_at = '2026-09-16';
  expect(() => validate(seal(c), { mode: 'production' })).toThrow(/test_only/);
  expect(() => validate(admissionFixture())).toThrow(/fixture mode/);
});
test('previous snapshot rejects silent revision edits and deletions', () => {
  const previous = fixture(), c = fixture(); c.units[0].notes = 'changed';
  expect(() => validate(seal(c), { previous })).toThrow(/increment revision/);
  c.units[0].revision = 2; c.commentary[0].knowledge_refs[0].revision = 2; c.commentary[0].revision = 2;
  expect(validate(seal(c), { previous }).valid).toBe(true);
  const d = fixture(); d.commentary = []; expect(() => validate(d, { previous })).toThrow(/retired/);
});
test('supersedes pins a prior supplied snapshot, not an unverifiable history', () => {
  const previous = fixture(), c = fixture(); c.units[0].supersedes = [{ knowledge_id: 'fixture-unit', revision: 1 }];
  expect(() => validate(seal(c))).toThrow(/previous corpus/);
  c.units[0].revision = 2; c.commentary[0].revision = 2; c.commentary[0].knowledge_refs[0].revision = 2;
  expect(validate(seal(c), { previous }).valid).toBe(true);
});
test('source artifact hash is required for admission, separately from record hash', () => {
  const c = admissionFixture(); c.sources[0].provenance.artifact_hash = null;
  const result = validate(seal(c), { mode: 'production' });
  expect(result.admitted.units).toEqual([]); expect(result.excluded[0].reasons).toContain('source_artifact_not_pinned');
});
test('text changes require transcription revision as well as pinned record revisions', () => {
  const previous = fixture(), c = fixture(); c.segments[0].text += '附'; c.segments[0].revision = 2;
  c.units[0].segment_ref.revision = 2; c.units[0].revision = 2;
  c.commentary[0].knowledge_refs[0].revision = 2; c.commentary[0].revision = 2;
  expect(() => validate(seal(c), { previous })).toThrow(/transcription revision/);
  c.segments[0].transcription_revision = 2; expect(validate(seal(c), { previous }).valid).toBe(true);
});
test('catalog changes require their own revision and cannot rewrite original text', () => {
  const previous = fixture(), c = fixture(); c.catalog.concepts[0].aliases.push('别称');
  expect(() => validate(seal(c), { previous })).toThrow(/catalog.*revision/);
  c.catalog.revision = 2; expect(validate(c, { previous }).valid).toBe(true);
  expect(c.segments[0].text).toBe(previous.segments[0].text);
});
test('strict validation rejects null objects, missing required arrays and duplicate references', () => {
  reject(c => { c.sources[0].holding = null; }, /type/);
  reject(c => { delete c.units[0].related_rule_ids; }, /missing/);
  reject(c => { c.units[0].related_concepts.push('fixture-concept'); }, /duplicate/);
});
test('an empty corpus remains valid; production reader stays separate from test fixtures', () => {
  const empty = { sources: [], segments: [], units: [], commentary: [], catalog: { schema_version: '1.0', revision: 1, concepts: [], categories: [], tags: [] } };
  const result = validate(empty, { mode: 'production' });
  expect(result.counts).toEqual({ sources: 0, segments: 0, units: 0, commentary: 0 });
  expect(result.excluded).toEqual([]);
  expect(readCorpus().units.every(u => u.data_kind === 'corpus')).toBe(true);
  expect(checkCorpus().valid).toBe(true);
});
test('CLI rejects a fixture copied into a corpus directory with nonzero exit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-contract-test-'));
  try {
    for (const dir of ['sources', 'classics', 'units', 'commentary', 'catalog']) fs.mkdirSync(path.join(root, dir));
    fs.writeFileSync(path.join(root, 'catalog', 'catalog.json'), JSON.stringify(fixture().catalog));
    fs.writeFileSync(path.join(root, 'sources', 'fixture.json'), JSON.stringify(fixture().sources[0]));
    const cli = spawnSync(process.execPath, ['scripts/knowledge/validate-corpus.js', root], { encoding: 'utf8' });
    expect(cli.status).toBe(1); expect(cli.stderr).toMatch(/test_only/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
