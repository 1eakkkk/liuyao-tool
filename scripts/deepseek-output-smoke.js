// Local evaluation only. No imports from browser entry points; never log credentials.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildOutputContext } from '../src/ai/output/context.js';
import { buildOutputMessages } from '../src/ai/output/prompt.js';
import { OUTPUT_PROMPT_VERSION } from '../src/ai/output/contract.js';
import { parseOutputAnswer } from '../src/ai/output/parse.js';

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const input = option('--input'), out = option('--output');
if (!input || !out) throw Error('Use --input <frozen pilot directory> --output <new directory> [--execute --budget-cny <authorized amount>]');
const json = value => JSON.stringify(value, null, 2) + '\n';
const sha = value => createHash('sha256').update(value).digest('hex');
const manifestBytes = fs.readFileSync(path.join(input, 'manifest.json'));
if (sha(manifestBytes) !== fs.readFileSync(path.join(input, 'manifest.sha256'), 'utf8').trim()) throw Error('Input seal changed');
const manifest = JSON.parse(manifestBytes);
if (manifest.cases.length !== 3) throw Error('This smoke test requires exactly three cases');
const packets = [];
for (const item of manifest.cases) {
  if (!/^pilot-0[1-3]$/.test(item.id)) throw Error('Unexpected case identifier');
  const bytes = fs.readFileSync(path.join(input, item.id, 'canonical.json'));
  if (sha(bytes) !== item.canonical_sha256) throw Error('Frozen input changed');
  const context = await buildOutputContext(JSON.parse(bytes));
  if (context.context_id !== item.context_id) throw Error('Context changed');
  const body = { model: 'deepseek-flash', messages: buildOutputMessages(context),
    thinking: { type: 'enabled' }, reasoning_effort: 'high', max_tokens: 8192, stream: false };
  // Conservative planning estimate: UTF-8 bytes plus framing allowance as input tokens,
  // maximum output, peak uncached prices. Not a provider-enforced spending cap.
  const inputAllowance = Buffer.byteLength(JSON.stringify(body.messages), 'utf8') + 4096;
  const reserveCny = (inputAllowance * 2 + body.max_tokens * 8) / 1e6;
  packets.push({ id: item.id, context, body, inputAllowance, reserveCny });
}
const reserve = packets.reduce((sum, p) => sum + p.reserveCny, 0);
const execute = args.includes('--execute');
const budget = Number(option('--budget-cny'));
if (execute && (!Number.isFinite(budget) || budget <= 0 || reserve > budget)) throw Error('Explicit authorized budget is missing or below the conservative batch reserve');
if (fs.existsSync(out)) throw Error('Output directory already exists; no resume or retries');
let key;
if (execute) {
  // This file is ignored by Git and is never read in preparation mode.
  process.loadEnvFile('.env.deepseek.local');
  key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key || /[\r\n]/.test(key)) throw Error('Local API key is missing or invalid');
}
fs.mkdirSync(out);
const write = (name, value) => fs.writeFileSync(path.join(out, name), json(value), { flag: 'wx' });
write('plan.json', { input_manifest_sha256: sha(manifestBytes), prompt_version: OUTPUT_PROMPT_VERSION,
  model: 'deepseek-flash', stream: false, comparison: 'smoke_only_not_legacy_AB',
  price_checked: '2026-09-24', price_source: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  peak_cny_per_million: { input_uncached: 2, output: 8 }, conservative_reserve_cny: reserve,
  authorized_budget_cny: execute ? budget : null, execute,
  cases: packets.map(p => ({ id: p.id, request_sha256: sha(json(p.body)), reserve_cny: p.reserveCny })) });
for (const p of packets) write(`${p.id}-request.json`, p.body);
if (!execute) {
  console.log(JSON.stringify({ prepared: true, api_called: false, conservative_reserve_cny: reserve, out }));
} else {
  const results = [];
  for (const p of packets) {
    const start = Date.now();
    write(`${p.id}-attempt.json`, { started_at: new Date().toISOString(), reserve_cny: p.reserveCny });
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(p.body), signal: AbortSignal.timeout(180000),
      });
      // Do not save HTTP error bodies or throw provider text that could contain secrets.
      if (!response.ok) throw Error(`HTTP_${response.status}`);
      const raw = await response.text();
      fs.writeFileSync(path.join(out, `${p.id}-raw.json`), raw, { flag: 'wx' });
      const data = JSON.parse(raw), choice = data.choices?.[0], usage = data.usage;
      const parsed = parseOutputAnswer(choice?.message?.content ?? '', p.context, { completed: choice?.finish_reason === 'stop' });
      const validUsage = Number.isSafeInteger(usage?.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isSafeInteger(usage?.completion_tokens) && usage.completion_tokens >= 0;
      const withinReserve = validUsage && usage.prompt_tokens <= p.inputAllowance && usage.completion_tokens <= p.body.max_tokens;
      const result = { id: p.id, status: parsed.status, issues: parsed.issues, finish_reason: choice?.finish_reason ?? null,
        returned_model: data.model ?? null, usage: usage ?? null, elapsed_ms: Date.now() - start,
        cost_upper_estimate_cny: validUsage ? (usage.prompt_tokens * 2 + usage.completion_tokens * 8) / 1e6 : null,
        within_reserve: withinReserve };
      write(`${p.id}-validation.json`, result); results.push(result);
      // Stop even on a format failure; no silent repairs, retries or unbounded spending.
      if (parsed.status !== 'validated' || !withinReserve) break;
    } catch {
      const result = { id: p.id, status: 'request_or_processing_error', elapsed_ms: Date.now() - start,
        cost_unknown: true, reserved_cny: p.reserveCny, retry: false };
      write(`${p.id}-error.json`, result); results.push(result); break;
    }
  }
  write('summary.json', { results, api_called: true, exact_billed_cost: null });
  console.log(JSON.stringify({ completed_cases: results.length, validated: results.filter(x => x.status === 'validated').length, out }));
  if (results.length !== 3 || results.some(x => x.status !== 'validated' || !x.within_reserve)) process.exitCode = 2;
}
