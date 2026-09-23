// @vitest-environment node
import { test as vitestTest, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { canonicalJsonBytes, prepareV2, rawSha256, verifyFreeze, writeCanonicalJsonArtifact,
  SOURCE_IDENTITY_POLICY, ARTIFACT_HASH_POLICY, JSON_SERIALIZATION_POLICY } from '../../scripts/experiments/freeze-identity.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const test = (name, run) => vitestTest(name, run, 30000);
const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const config = { trackedSourcePaths: ['src/input.js'], artifacts: [
  { path: 'generated/payload.json', kind: 'generated_json' },
  { path: 'generated/prompt.txt', kind: 'generated_text' },
  { path: 'external/answer.txt', kind: 'external' },
  { path: 'external/edition.pdf', kind: 'external' }
] };
function fixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-identity-test-'));
  const repo = path.join(temp, 'repo'), root = path.join(temp, 'round');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true }); fs.mkdirSync(root);
  git(repo, 'init', '-q'); git(repo, 'config', 'user.email', 'fixture@example.invalid');
  git(repo, 'config', 'user.name', 'Synthetic Fixture'); git(repo, 'config', 'core.autocrlf', 'true');
  fs.writeFileSync(path.join(repo, '.gitignore'), 'test-results/\n');
  fs.writeFileSync(path.join(repo, 'src/input.js'), 'export const answer = 42;\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'synthetic baseline');
  writeCanonicalJsonArtifact(root, 'generated/payload.json', { z: 2, a: { y: '甲', x: 1 } });
  fs.writeFileSync(path.join(root, 'generated/prompt.txt'), 'Synthetic prompt\n', { flag: 'wx' });
  fs.mkdirSync(path.join(root, 'external'));
  fs.writeFileSync(path.join(root, 'external/answer.txt'), Buffer.from('synthetic answer\r\n', 'utf8'));
  fs.writeFileSync(path.join(root, 'external/edition.pdf'), Buffer.from('%PDF-1.4\nsynthetic fixture\n', 'utf8'));
  return { temp, repo, root, source: path.join(repo, 'src/input.js') };
}
function withFixture(fn) {
  const x = fixture();
  try { return fn(x); } finally { fs.rmSync(x.temp, { recursive: true, force: true }); }
}
function prepare(x) { return prepareV2({ repo: x.repo, root: x.root, ...config }); }
function legacyRound(x) {
  const root = path.join(x.temp, 'old-round'); fs.mkdirSync(path.join(root, 'private'), { recursive: true });
  const plan = { code_commit: git(x.repo, 'rev-parse', 'HEAD'), working_tree_dirty: false,
    source_hashes: { 'src/input.js': digest(fs.readFileSync(x.source)) } };
  const planBytes = Buffer.from(JSON.stringify(plan));
  fs.writeFileSync(path.join(root, 'private/plan.json'), planBytes);
  const seal = { 'private/plan.json': digest(planBytes) };
  fs.writeFileSync(path.join(root, 'private/seal.json'), JSON.stringify(seal));
  fs.writeFileSync(path.join(root, 'FREEZE.sha256'), digest(Buffer.from(JSON.stringify(seal))));
  return root;
}

test('v2 freezes commit/path/blob identity and exact generated/external bytes', () => withFixture(x => {
  const result = prepare(x), verified = verifyFreeze({ repo: x.repo, root: x.root });
  expect(result.status).toBe('prepared_v2'); expect(verified.status).toBe('verified_v2');
  expect(verified.source_status).toBe('git_blob_match'); expect(verified.artifact_status).toBe('exact_raw_bytes');
  const manifest = JSON.parse(fs.readFileSync(path.join(x.root, 'FREEZE.v2.json'), 'utf8'));
  expect(manifest).toMatchObject({ freeze_schema_version: '2', source_identity_policy_version: SOURCE_IDENTITY_POLICY,
    artifact_hash_policy_version: ARTIFACT_HASH_POLICY });
  expect(manifest.tracked_sources.files).toEqual([{ path: 'src/input.js', blob_oid: git(x.repo, 'rev-parse', 'HEAD:src/input.js') }]);
  expect(manifest.artifacts.find(item => item.kind === 'generated_json').serialization).toBe(JSON_SERIALIZATION_POLICY);
  for (const artifact of manifest.artifacts) expect(artifact.sha256_raw_bytes).toBe(rawSha256(fs.readFileSync(path.join(x.root, artifact.path))));
  const cli = JSON.parse(execFileSync(process.execPath,
    ['scripts/experiments/freeze-identity.js', 'verify', x.root, x.repo], { encoding: 'utf8' }));
  expect(cli.status).toBe('verified_v2');
}));

test('LF/CRLF checkout bytes differ while clean Git blob identity remains stable', () => withFixture(x => {
  prepare(x); const before = rawSha256(fs.readFileSync(x.source)), oid = git(x.repo, 'rev-parse', 'HEAD:src/input.js');
  fs.writeFileSync(x.source, 'export const answer = 42;\r\n');
  expect(rawSha256(fs.readFileSync(x.source))).not.toBe(before);
  expect(git(x.repo, 'diff', '--name-only', 'HEAD', '--')).toBe('');
  expect(git(x.repo, 'rev-parse', 'HEAD:src/input.js')).toBe(oid);
  expect(verifyFreeze({ repo: x.repo, root: x.root }).source_status).toBe('git_blob_match');
}));

test('dirty tracked and staged edits block prepare; ignored untracked output does not', () => withFixture(x => {
  fs.mkdirSync(path.join(x.repo, 'test-results'));
  fs.writeFileSync(path.join(x.repo, 'test-results/ignored.txt'), 'synthetic output');
  expect(prepare(x).status).toBe('prepared_v2');
  const second = path.join(x.temp, 'second'); fs.mkdirSync(second);
  fs.writeFileSync(x.source, 'export const answer = 43;\n');
  expect(() => prepareV2({ repo: x.repo, root: second, ...config })).toThrow(/Dirty tracked/);
  expect(() => verifyFreeze({ repo: x.repo, root: x.root })).toThrow(/Dirty tracked/);
  git(x.repo, 'add', 'src/input.js');
  expect(() => prepareV2({ repo: x.repo, root: second, ...config })).toThrow(/Dirty tracked/);
}));

test('committed tracked content change changes blob and invalidates the old v2 freeze', () => withFixture(x => {
  prepare(x); const oldOid = git(x.repo, 'rev-parse', 'HEAD:src/input.js');
  fs.writeFileSync(x.source, 'export const answer = 43;\n');
  git(x.repo, 'add', 'src/input.js'); git(x.repo, 'commit', '-qm', 'synthetic source change');
  expect(git(x.repo, 'rev-parse', 'HEAD:src/input.js')).not.toBe(oldOid);
  expect(() => verifyFreeze({ repo: x.repo, root: x.root })).toThrow(/Tracked source blob changed/);
}));

test('raw answer and PDF identities reject any byte change without normalization', () => withFixture(x => {
  prepare(x);
  const answer = path.join(x.root, 'external/answer.txt'), pdf = path.join(x.root, 'external/edition.pdf');
  const original = fs.readFileSync(answer);
  fs.writeFileSync(answer, Buffer.concat([original, Buffer.from('!')]));
  expect(() => verifyFreeze({ repo: x.repo, root: x.root })).toThrow(/Raw artifact SHA-256 mismatch: external\/answer.txt/);
  fs.writeFileSync(answer, original);
  const pdfBytes = fs.readFileSync(pdf); pdfBytes[pdfBytes.length - 1] ^= 1; fs.writeFileSync(pdf, pdfBytes);
  expect(() => verifyFreeze({ repo: x.repo, root: x.root })).toThrow(/Raw artifact SHA-256 mismatch: external\/edition.pdf/);
}));

test('canonical JSON is key-order stable, BOM-free and LF-terminated without rewriting values', () => {
  const a = canonicalJsonBytes({ z: 1, a: { y: '甲\r\n乙', x: 2 } });
  const b = canonicalJsonBytes({ a: { x: 2, y: '甲\r\n乙' }, z: 1 });
  expect(a.equals(b)).toBe(true); expect(rawSha256(a)).toBe(rawSha256(b));
  expect(a[0]).not.toBe(0xef); expect(a.at(-1)).toBe(10);
  expect(a.toString('utf8')).not.toContain('\r');
  expect(a.toString('utf8')).toContain('甲\\r\\n乙');
  expect(rawSha256(canonicalJsonBytes({ a: '甲\n乙', z: 1 }))).not.toBe(rawSha256(a));
  expect(() => canonicalJsonBytes({ bad: undefined })).toThrow();
});

test('v2 seal covers policies and manifest; unknown versions fail closed even if resealed', () => withFixture(x => {
  prepare(x); const file = path.join(x.root, 'FREEZE.v2.json'), seal = path.join(x.root, 'FREEZE.v2.sha256');
  const original = fs.readFileSync(file); fs.writeFileSync(file, Buffer.concat([original, Buffer.from(' ')]));
  expect(() => verifyFreeze({ repo: x.repo, root: x.root })).toThrow(/FREEZE seal/);
  const manifest = JSON.parse(original.toString('utf8'));
  manifest.source_identity_policy_version = 'unknown-v3';
  const changed = canonicalJsonBytes(manifest); fs.writeFileSync(file, changed);
  fs.writeFileSync(seal, `${rawSha256(changed)}\n`);
  expect(() => verifyFreeze({ repo: x.repo, root: x.root })).toThrow(/Unknown freeze policy version/);
}));

test('historical v1 distinguishes exact old bytes from Git-equivalent CRLF representation', () => withFixture(x => {
  const root = legacyRound(x);
  const exact = verifyFreeze({ repo: x.repo, root });
  expect(exact).toMatchObject({ policy: 'v1', status: 'exact_match', artifact_status: 'exact_raw_bytes' });
  fs.writeFileSync(x.source, 'export const answer = 42;\r\n');
  const compatible = verifyFreeze({ repo: x.repo, root });
  expect(compatible).toMatchObject({ policy: 'v1', status: 'content_equivalent_git', artifact_status: 'exact_raw_bytes' });
  expect(compatible.raw_worktree_bytes_mismatch).toEqual(['src/input.js']);
  expect(compatible.status).not.toBe('exact_match');
  fs.unlinkSync(x.source);
  expect(verifyFreeze({ repo: x.repo, root }).status).toBe('unverifiable');
}));

test('historical v1 seal remains strict and unknown historical policy fails closed', () => withFixture(x => {
  const root = legacyRound(x), seal = path.join(root, 'FREEZE.sha256');
  fs.writeFileSync(seal, 'bad');
  expect(() => verifyFreeze({ repo: x.repo, root })).toThrow(/Historical FREEZE seal/);
  const data = JSON.parse(fs.readFileSync(path.join(root, 'private/plan.json'), 'utf8'));
  data.freeze_schema_version = '3';
  const planBytes = Buffer.from(JSON.stringify(data)); fs.writeFileSync(path.join(root, 'private/plan.json'), planBytes);
  const map = { 'private/plan.json': digest(planBytes) };
  fs.writeFileSync(path.join(root, 'private/seal.json'), JSON.stringify(map));
  fs.writeFileSync(seal, digest(Buffer.from(JSON.stringify(map))));
  expect(() => verifyFreeze({ repo: x.repo, root })).toThrow(/Unknown freeze policy version/);
}));
