// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const script = path.join(repo, 'scripts/deepseek-output-smoke.js');
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-smoke-'));
  try {
    const input = path.join(root, 'input');
    execFileSync(process.execPath, ['scripts/prepare-luna-output-pilot.js', input, '--readability'], { cwd: repo });
    // Every test subprocess is forced offline, including any accidental new endpoints.
    const mock = path.join(root, 'offline.mjs');
    fs.writeFileSync(mock, `import fs from 'node:fs'; globalThis.fetch = async () => { fs.appendFileSync('calls.txt', 'called\\n'); throw Error('DO_NOT_LOG_SECRET'); };`);
    const invoke = (...args) => spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, script, '--input', input,
      '--output', path.join(root, 'output'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, DEEPSEEK_API_KEY: '' } });
    run({ root, input, invoke });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
test('preparation requires no key, makes no network requests, and refuses overwrite', () => fixture(({ root, invoke }) => {
  const result = invoke();
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).api_called).toBe(false);
  expect(fs.existsSync(path.join(root, 'calls.txt'))).toBe(false);
  expect(invoke().status).not.toBe(0);
}));
test('missing or inadequate budget blocks execution before credentials or network', () => fixture(({ root, invoke }) => {
  expect(invoke('--execute').status).not.toBe(0);
  expect(invoke('--execute', '--budget-cny', '0.001').status).not.toBe(0);
  expect(fs.existsSync(path.join(root, 'output'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'calls.txt'))).toBe(false);
}));
test('tampered frozen input blocks preparation', () => fixture(({ input, invoke }) => {
  fs.appendFileSync(path.join(input, 'pilot-01/canonical.json'), ' ');
  expect(invoke().status).not.toBe(0);
}));
test('request failure stops after one attempt, records unknown cost, and does not expose error text', () => fixture(({ root, invoke }) => {
  fs.writeFileSync(path.join(root, '.env.deepseek.local'), 'DEEPSEEK_API_KEY=');
  // An empty inherited variable must not fall through into a paid request.
  expect(invoke('--execute', '--budget-cny', '2').status).not.toBe(0);
  expect(fs.existsSync(path.join(root, 'calls.txt'))).toBe(false);
  // Set a synthetic credential only in the subprocess, never use the user's local key.
  const mock = path.join(root, 'mock-key.mjs');
  fs.writeFileSync(mock, `import fs from 'node:fs'; process.env.DEEPSEEK_API_KEY='SYNTHETIC_TEST_KEY'; globalThis.fetch=async()=>{fs.appendFileSync('calls.txt','called\\n');throw Error('DO_NOT_LOG_SECRET');};`);
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, script, '--input', path.join(root, 'input'), '--output', path.join(root, 'output'), '--execute', '--budget-cny', '2'], { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(2);
  expect(fs.readFileSync(path.join(root, 'calls.txt'), 'utf8')).toBe('called\n');
  const summary = fs.readFileSync(path.join(root, 'output/summary.json'), 'utf8');
  expect(JSON.parse(summary).results[0].cost_unknown).toBe(true);
  expect(summary + result.stdout + result.stderr).not.toMatch(/SYNTHETIC_TEST_KEY|DO_NOT_LOG_SECRET/);
}));
for (const finishReason of ['stop', 'length']) test(`mock completion ${finishReason} controls validation and continuation`, () => fixture(({ root, input }) => {
  fs.writeFileSync(path.join(root, '.env.deepseek.local'), 'DEEPSEEK_API_KEY=');
  const mock = path.join(root, 'completion.mjs');
  fs.writeFileSync(mock, `import fs from 'node:fs';
import { buildOutputContext } from ${JSON.stringify(pathToFileURL(path.join(repo, 'src/ai/output/context.js')).href)};
import { syntheticOutput } from ${JSON.stringify(pathToFileURL(path.join(repo, 'experiments/structured-output/example.js')).href)};
process.env.DEEPSEEK_API_KEY='SYNTHETIC_TEST_KEY'; let count=0;
globalThis.fetch=async()=>{ count++; const context=await buildOutputContext(JSON.parse(fs.readFileSync(${JSON.stringify(input)}+'/pilot-0'+count+'/canonical.json','utf8')));
return {ok:true,text:async()=>JSON.stringify({model:'mock-only',choices:[{finish_reason:${JSON.stringify(finishReason)},message:{content:JSON.stringify(syntheticOutput(context))}}],usage:{prompt_tokens:100,completion_tokens:100}})};};`);
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, script, '--input', input, '--output', path.join(root, 'output'), '--execute', '--budget-cny', '2'], { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(finishReason === 'stop' ? 0 : 2);
  const summary = JSON.parse(fs.readFileSync(path.join(root, 'output/summary.json'), 'utf8'));
  expect(summary.results).toHaveLength(finishReason === 'stop' ? 3 : 1);
  expect(summary.results[0].status).toBe(finishReason === 'stop' ? 'validated' : 'fallback');
  expect(summary.exact_billed_cost).toBeNull();
}));
