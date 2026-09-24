// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
const repo = fileURLToPath(new URL('../../', import.meta.url));
for (const done of [true, false]) test(`stream runner handles DONE=${done} without retries`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-stream-'));
  try {
    const run = path.join(root, 'run'), ledger = path.join(root, 'budget.json');
    execFileSync(process.execPath, ['scripts/deepseek-output-stream.js', 'prepare', run], { cwd: repo });
    fs.writeFileSync(ledger, JSON.stringify({ limit_cny: 20, reservations: [] }));
    fs.writeFileSync(path.join(root, '.env.deepseek.local'), 'DEEPSEEK_API_KEY=');
    const mock = path.join(root, 'mock.mjs');
    const contextUrl = pathToFileURL(path.join(repo, 'src/ai/output/context.js')).href;
    const exampleUrl = pathToFileURL(path.join(repo, 'experiments/structured-output/example.js')).href;
    fs.writeFileSync(mock, `import fs from 'node:fs';
import { buildOutputContext } from ${JSON.stringify(contextUrl)};
import { syntheticOutput } from ${JSON.stringify(exampleUrl)};
const plan=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(run, 'plan.json'))}));let n=0;
process.env.DEEPSEEK_API_KEY='TEST_ONLY';globalThis.fetch=async()=>{const c=await buildOutputContext(plan.cases[n++].canonical);
const event={choices:[{index:0,delta:{content:JSON.stringify(syntheticOutput(c))},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:20}};
const text='data: '+JSON.stringify(event)+'\\n\\n'+(${done}?'data: [DONE]\\n\\n':'');
return {ok:true,status:200,body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(text));controller.close();}})};};`);
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, path.join(repo, 'scripts/deepseek-output-stream.js'), 'execute', run, '--ledger', ledger], { cwd: root, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const summary = JSON.parse(fs.readFileSync(path.join(run, 'summary.json')));
    expect(summary.results).toHaveLength(done ? 6 : 1);
    expect(summary.results[0].status).toBe(done ? 'validated' : 'fallback');
    expect(fs.readFileSync(path.join(run, 'stream-01-raw.sse'), 'utf8')).toContain('data: ');
    expect(JSON.parse(fs.readFileSync(ledger)).reservations).toHaveLength(1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
