// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { reserveCampaign } from '../../scripts/deepseek-campaign-budget.js';
const repo = fileURLToPath(new URL('../../', import.meta.url));
function temporary(run) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-comparison-')); try { run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); } }
test('campaign reservations accumulate and reject duplicates, overspend and concurrent writes', () => temporary(root => {
  const ledger = path.join(root, 'budget.json'); fs.writeFileSync(ledger, JSON.stringify({ limit_cny: 2, reservations: [] }));
  expect(reserveCampaign(ledger, { run: 'one', amount: 1, planHash: 'a' }).remaining_unreserved_cny).toBe(1);
  expect(() => reserveCampaign(ledger, { run: 'one', amount: .2 })).toThrow(/already reserved/);
  expect(() => reserveCampaign(ledger, { run: 'two', amount: 1.01 })).toThrow(/budget exceeded/);
  fs.writeFileSync(ledger + '.lock', '');
  expect(() => reserveCampaign(ledger, { run: 'two', amount: .1 })).toThrow();
  expect(JSON.parse(fs.readFileSync(ledger)).reservations).toHaveLength(1);
}));
test('frozen comparison executes each declared mock request once, preserves a length failure and refuses repeat', () => temporary(root => {
  const input = path.join(root, 'input'), run = path.join(root, 'run'), ledger = path.join(root, 'budget.json');
  execFileSync(process.execPath, ['scripts/prepare-luna-output-pilot.js', input, '--readability'], { cwd: repo });
  execFileSync(process.execPath, ['scripts/deepseek-output-comparison.js', 'prepare', run, '--input', input], { cwd: repo });
  fs.writeFileSync(ledger, JSON.stringify({ limit_cny: 20, reservations: [] }));
  fs.writeFileSync(path.join(root, '.env.deepseek.local'), 'DEEPSEEK_API_KEY=');
  const mock = path.join(root, 'mock.mjs');
  fs.writeFileSync(mock, `import fs from 'node:fs';
import { buildOutputContext } from ${JSON.stringify(pathToFileURL(path.join(repo, 'src/ai/output/context.js')).href)};
import { syntheticOutput } from ${JSON.stringify(pathToFileURL(path.join(repo, 'experiments/structured-output/example.js')).href)};
const plan=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(run, 'plan.json'))}));let n=0;
process.env.DEEPSEEK_API_KEY='TEST_ONLY';globalThis.fetch=async()=>{const r=plan.requests[n++];fs.appendFileSync('calls.txt',r.id+'\\n');
const c=await buildOutputContext(plan.cases.find(c=>c.id===r.case_id).canonical);
return {ok:true,status:200,text:async()=>JSON.stringify({model:'mock',choices:[{finish_reason:n===1?'length':'stop',message:{content:r.structured?JSON.stringify(syntheticOutput(c)):'仅测试纯文本'}}],usage:{prompt_tokens:10,completion_tokens:20}})};};`);
  const invoke = () => spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, path.join(repo, 'scripts/deepseek-output-comparison.js'), 'execute', run, '--ledger', ledger], { cwd: root, encoding: 'utf8' });
  const result = invoke(); expect(result.status, result.stderr).toBe(0);
  const summary = JSON.parse(fs.readFileSync(path.join(run, 'summary.json')));
  expect(summary.results).toHaveLength(9); expect(summary.results[0].status).toBe('fallback');
  expect(summary.results.filter(r => r.status === 'validated')).toHaveLength(5);
  expect(summary.results.filter(r => r.status === 'complete_plain_text')).toHaveLength(3);
  expect(invoke().status).not.toBe(0);
  expect(fs.readFileSync(path.join(root, 'calls.txt'), 'utf8').trim().split('\n')).toHaveLength(9);
  expect(JSON.parse(fs.readFileSync(ledger)).reservations).toHaveLength(1);
}));
