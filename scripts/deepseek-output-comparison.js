import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildOutputContext } from '../src/ai/output/context.js';
import { buildOutputMessages } from '../src/ai/output/prompt.js';
import { OUTPUT_PROMPT_VERSION } from '../src/ai/output/contract.js';
import { parseOutputAnswer } from '../src/ai/output/parse.js';
import { buildSystemPrompt } from '../src/ai/prompt-builder.js';
import { formatCastDataForAI } from '../src/ai/formatter.js';
import { reserveCampaign } from './deepseek-campaign-budget.js';

const [action, directory, ...args] = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const json = x => JSON.stringify(x, null, 2) + '\n';
const sha = x => createHash('sha256').update(x).digest('hex');
const write = (name, value) => fs.writeFileSync(path.join(directory, name), json(value), { flag: 'wx' });
if (!directory || !['prepare', 'execute'].includes(action)) throw Error('Use prepare|execute <new-or-prepared-directory> --input <pilot> | --ledger <campaign-file>');
if (action === 'prepare') {
  const input = option('--input');
  if (!input) throw Error('Missing input');
  const bytes = fs.readFileSync(path.join(input, 'manifest.json'));
  if (sha(bytes) !== fs.readFileSync(path.join(input, 'manifest.sha256'), 'utf8').trim()) throw Error('Input seal changed');
  const source = JSON.parse(bytes), cases = [], requests = [];
  if (source.cases.length !== 3) throw Error('Expected three development cases');
  const variants = ['structured-high-16k', 'structured-direct-8k', 'legacy-high-16k'];
  for (const [index, item] of source.cases.entries()) {
    if (!/^pilot-0[1-3]$/.test(item.id)) throw Error('Unexpected case ID');
    const canonicalBytes = fs.readFileSync(path.join(input, item.id, 'canonical.json'));
    if (sha(canonicalBytes) !== item.canonical_sha256) throw Error('Canonical input changed');
    const canonical = JSON.parse(canonicalBytes), context = await buildOutputContext(canonical);
    cases.push({ id: item.id, canonical, expectations: item.expectations });
    // Rotate order per question to avoid always warming the cache for the same variant.
    for (let j = 0; j < 3; j++) {
      const variant = variants[(index + j) % 3], structured = variant.startsWith('structured');
      const direct = variant === 'structured-direct-8k';
      const messages = structured ? buildOutputMessages(context) : [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: `排盘数据：\n${formatCastDataForAI(canonical)}\n\n提问者的问题是：${canonical.question.text}\n\n请结合以上排盘数据给出解卦回复。` },
      ];
      const body = { model: 'deepseek-flash', messages, thinking: { type: direct ? 'disabled' : 'enabled' },
        ...(direct ? {} : { reasoning_effort: 'high' }), max_tokens: direct ? 8192 : 16384, stream: false };
      const inputAllowance = Buffer.byteLength(JSON.stringify(messages)) + 4096;
      requests.push({ id: `${item.id}-${variant}`, case_id: item.id, variant, structured, body,
        inputAllowance, reserve_cny: (inputAllowance * 2 + body.max_tokens * 8) / 1e6 });
    }
  }
  const plan = { version: 'deepseek-development-comparison-1', prompt_version: OUTPUT_PROMPT_VERSION,
    source_manifest_sha256: sha(bytes), cases, requests, source_seen: true, blind_holdout: false,
    legacy_preferences: 'repository defaults: no browser localStorage; paired high effort and 16k limit',
    inference: 'three exposed development cases, one sample per variant; no significance or accuracy claims',
    criteria: ['completion', 'structure_and_references_for_structured_only', 'fact_contradiction', 'scope_violation', 'plain_language', 'citation_relevance', 'unsupported_inference', 'latency', 'usage'],
    stop_policy: 'record format/length failure and continue predeclared different requests; stop on transport, HTTP or missing/excess usage; no retry',
    reserve_cny: requests.reduce((s, r) => s + r.reserve_cny, 0),
    pricing: { checked: '2026-09-24', input_peak_uncached: 2, output_peak: 8, per: 1000000 },
  };
  fs.mkdirSync(directory); write('plan.json', plan);
  fs.writeFileSync(path.join(directory, 'plan.sha256'), sha(json(plan)), { flag: 'wx' });
  console.log(JSON.stringify({ prepared: requests.length, reserve_cny: plan.reserve_cny, api_called: false }));
} else {
  const bytes = fs.readFileSync(path.join(directory, 'plan.json'));
  if (sha(bytes) !== fs.readFileSync(path.join(directory, 'plan.sha256'), 'utf8').trim()) throw Error('Plan changed');
  const plan = JSON.parse(bytes);
  if (plan.version !== 'deepseek-development-comparison-1' || plan.prompt_version !== OUTPUT_PROMPT_VERSION) throw Error('Plan version mismatch');
  for (const r of plan.requests) {
    if (!/^pilot-0[1-3]-(structured-high-16k|structured-direct-8k|legacy-high-16k)$/.test(r.id) ||
      r.body.model !== 'deepseek-flash' || r.body.stream !== false || ![8192, 16384].includes(r.body.max_tokens)) throw Error('Unexpected request');
    const allowance = Buffer.byteLength(JSON.stringify(r.body.messages)) + 4096;
    if (allowance !== r.inputAllowance || r.reserve_cny !== (allowance * 2 + r.body.max_tokens * 8) / 1e6) throw Error('Reservation mismatch');
  }
  const sum = plan.requests.reduce((s, r) => s + r.reserve_cny, 0);
  if (sum !== plan.reserve_cny || plan.requests.length !== 9 || new Set(plan.requests.map(r => r.id)).size !== 9) throw Error('Plan totals mismatch');
  if (fs.existsSync(path.join(directory, 'execution.json'))) throw Error('Already attempted');
  const ledger = option('--ledger'); if (!ledger) throw Error('Campaign ledger required');
  process.loadEnvFile('.env.deepseek.local');
  const key = process.env.DEEPSEEK_API_KEY?.trim(); if (!key) throw Error('Missing local credential');
  const reservation = reserveCampaign(ledger, { run: path.resolve(directory), amount: sum, planHash: sha(bytes) });
  write('execution.json', { started_at: new Date().toISOString(), reservation });
  const results = [];
  for (const r of plan.requests) {
    write(`${r.id}-attempt.json`, { started_at: new Date().toISOString(), request_sha256: sha(json(r.body)) });
    const start = Date.now(); let httpStatus = null;
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(r.body), signal: AbortSignal.timeout(180000) });
      httpStatus = response.status; if (!response.ok) throw Error('HTTP failure');
      const raw = await response.text(); fs.writeFileSync(path.join(directory, `${r.id}-raw.json`), raw, { flag: 'wx' });
      const data = JSON.parse(raw), choice = data.choices?.[0], usage = data.usage;
      const text = choice?.message?.content ?? '';
      const context = await buildOutputContext(plan.cases.find(c => c.id === r.case_id).canonical);
      const parsed = r.structured ? parseOutputAnswer(text, context, { completed: choice?.finish_reason === 'stop' }) : null;
      const validUsage = Number.isSafeInteger(usage?.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isSafeInteger(usage?.completion_tokens) && usage.completion_tokens >= 0;
      const withinReserve = validUsage && usage.prompt_tokens <= r.inputAllowance && usage.completion_tokens <= r.body.max_tokens;
      const result = { id: r.id, variant: r.variant, case_id: r.case_id, returned_model: data.model,
        finish_reason: choice?.finish_reason ?? null, status: parsed?.status ?? (choice?.finish_reason === 'stop' && text ? 'complete_plain_text' : 'incomplete_plain_text'),
        issues: parsed?.issues ?? [], usage: usage ?? null, elapsed_ms: Date.now() - start,
        response_sha256: sha(text), within_reserve: withinReserve,
        cost_upper_estimate_cny: validUsage ? (usage.prompt_tokens * 2 + usage.completion_tokens * 8) / 1e6 : null };
      write(`${r.id}-result.json`, result); results.push(result);
      console.log(JSON.stringify({ id: r.id, status: result.status, finish_reason: result.finish_reason }));
      if (!withinReserve) break;
    } catch {
      const result = { id: r.id, status: 'request_or_processing_error', http_status: httpStatus, cost_unknown: true, retry: false };
      write(`${r.id}-error.json`, result); results.push(result); break;
    }
  }
  write('summary.json', { results, exact_billed_cost: null });
  console.log(JSON.stringify({ attempted: results.length, complete: results.filter(r => ['validated', 'complete_plain_text'].includes(r.status)).length }));
}
