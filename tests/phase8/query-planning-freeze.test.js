// @vitest-environment node
import { test as vitestTest, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { canonicalJsonBytes, rawSha256, verifyFreeze,
  SOURCE_IDENTITY_POLICY, ARTIFACT_HASH_POLICY, JSON_SERIALIZATION_POLICY } from '../../scripts/experiments/freeze-identity.js';
import { FREEZE_ID, FREEZE_ROOT, SOURCE_COMMIT, SOURCE_PATHS,
  verifyQueryPlanningFreeze } from '../../scripts/phase8/freeze-query-planning.js';
import { validateBenchmarkCandidate } from '../../scripts/phase8/validate-query-planning.js';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const test = (name, run) => vitestTest(name, run, 30000);
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const read = name => JSON.parse(fs.readFileSync(path.join(FREEZE_ROOT, name), 'utf8'));
function withCopy(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase8b-freeze-test-'));
  try {
    for (const name of ['FREEZE.v2.json', 'FREEZE.v2.sha256', 'metadata.json', 'README.md'])
      fs.copyFileSync(path.join(FREEZE_ROOT, name), path.join(root, name));
    return fn(root);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function reseal(root, manifest) {
  const bytes = canonicalJsonBytes(manifest);
  fs.writeFileSync(path.join(root, 'FREEZE.v2.json'), bytes);
  fs.writeFileSync(path.join(root, 'FREEZE.v2.sha256'), `${rawSha256(bytes)}\n`);
}

test('Phase 8B v2 manifest binds exactly the reviewed D1 source files and policy', () => {
  const manifest = read('FREEZE.v2.json');
  expect(manifest).toMatchObject({ freeze_schema_version: '2', source_identity_policy_version: SOURCE_IDENTITY_POLICY,
    artifact_hash_policy_version: ARTIFACT_HASH_POLICY, tracked_sources: { repository_commit: SOURCE_COMMIT } });
  expect(manifest.tracked_sources.files.map(x => x.path)).toEqual([...SOURCE_PATHS].sort());
  for (const source of manifest.tracked_sources.files)
    expect(source.blob_oid).toBe(git('rev-parse', '--verify', `${SOURCE_COMMIT}:${source.path}`));
  expect(verifyQueryPlanningFreeze()).toMatchObject({ freeze_id: FREEZE_ID, status: 'verified_v2',
    source_status: 'git_blob_match', artifact_status: 'exact_raw_bytes', source_files: 10 });
});

test('frozen metadata keeps 72/48/24, isolated families, 23 matching facts and dependencies', () => {
  const data = read('metadata.json'), valid = validateBenchmarkCandidate();
  expect(valid).toMatchObject({ valid: true, cases: 72, development: 48, holdout: 24, families: 24, fact_references: 23 });
  expect(data).toMatchObject({ freeze_id: FREEZE_ID, source_commit: SOURCE_COMMIT,
    benchmark_version: 'query-planning-candidate-1.1', benchmark_source_status: 'candidate_not_frozen',
    planner_contract_version: 'query-plan-1.1', benchmark_invariants: {
      cases: 72, development: 48, holdout: 24, semantic_families: 24, family_cross_split: 0,
      fact_reference_conflicts: 0, fact_references: 23, selected_concepts_max: 2,
      requested_available_selected_separate: true, unresolved_mentions_contract: true,
      acceptable_plans_atomic: true, question_span_unit: 'javascript_utf16_code_unit',
      zero_knowledge_retrieval_query: null, source_checked_selectable: false
    }, referenced_dependencies: {
      ruleset_version: 'r1', ruleset_rule_count: 25, concept_catalog_revision: 2,
      hardened_corpus: { version: 'phase8a-month-combine-hardening-1', hash: 'sha256:aa3522aebb7e4ad18b54e144ea26499323e55838f79856fdd59f2c53baadcda3' },
      historical_corpus: { version: 'phase7.1-initial-1', hash: 'sha256:1b24872a9533ef5d94576c2f8df3489eb221c69f7dfbf0167cdc6e00ab868729' }
    } });
  for (const dep of data.referenced_dependencies.git_blobs)
    expect(dep.blob_oid).toBe(git('rev-parse', '--verify', `${SOURCE_COMMIT}:${dep.path}`));
});

test('generated artifact hashes and seal cover exact canonical bytes', () => {
  const manifest = read('FREEZE.v2.json'), bytes = fs.readFileSync(path.join(FREEZE_ROOT, 'FREEZE.v2.json'));
  expect(bytes.equals(canonicalJsonBytes(manifest))).toBe(true);
  expect(fs.readFileSync(path.join(FREEZE_ROOT, 'FREEZE.v2.sha256'), 'utf8')).toBe(`${rawSha256(bytes)}\n`);
  for (const artifact of manifest.artifacts) {
    expect(artifact.sha256_raw_bytes).toBe(rawSha256(fs.readFileSync(path.join(FREEZE_ROOT, artifact.path))));
    if (artifact.kind === 'generated_json') expect(artifact.serialization).toBe(JSON_SERIALIZATION_POLICY);
  }
});

test('artifact and seal byte changes fail closed', () => withCopy(root => {
  const notes = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  fs.writeFileSync(path.join(root, 'README.md'), notes.replace('Phase 8B.0 query-planning baseline freeze', 'Phase 8B.1 query-planning baseline freeze'));
  expect(() => verifyQueryPlanningFreeze({ root })).toThrow(/Raw artifact SHA-256 mismatch/);
  fs.copyFileSync(path.join(FREEZE_ROOT, 'README.md'), path.join(root, 'README.md'));
  fs.writeFileSync(path.join(root, 'FREEZE.v2.sha256'), 'sha256:incorrect\n');
  expect(() => verifyQueryPlanningFreeze({ root })).toThrow(/FREEZE seal changed/);
}));

test('resealed unknown policy and altered semantic metadata both fail closed', () => withCopy(root => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'FREEZE.v2.json'), 'utf8'));
  manifest.source_identity_policy_version = 'unknown-v3'; reseal(root, manifest);
  expect(() => verifyQueryPlanningFreeze({ root })).toThrow(/Unknown freeze policy version/);
  manifest.source_identity_policy_version = SOURCE_IDENTITY_POLICY;
  manifest.tracked_sources.files[0].extra = 'unexpected'; reseal(root, manifest);
  expect(() => verifyQueryPlanningFreeze({ root })).toThrow(/tracked source schema changed/);
  delete manifest.tracked_sources.files[0].extra;
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8'));
  meta.benchmark_invariants.cases = 71;
  const bytes = canonicalJsonBytes(meta); fs.writeFileSync(path.join(root, 'metadata.json'), bytes);
  manifest.artifacts.find(x => x.path === 'metadata.json').sha256_raw_bytes = rawSha256(bytes);
  reseal(root, manifest);
  expect(verifyFreeze({ repo, root }).status).toBe('verified_v2');
  expect(() => verifyQueryPlanningFreeze({ root })).toThrow(/metadata or benchmark invariants changed/);
}));

test('historical reproducibility and evaluation source blobs remain unchanged', () => {
  for (const name of ['scripts/experiments/freeze-identity.js', 'docs/REPRODUCIBILITY.md',
    'experiments/phase7/evaluation/cases.json', 'docs/PHASE_8A_REPORT.md'])
    expect(git('rev-parse', `HEAD:${name}`)).toBe(git('rev-parse', `${SOURCE_COMMIT}:${name}`));
});
