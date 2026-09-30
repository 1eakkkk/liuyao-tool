// Local paid development pilot. Existing cumulative authorization only; no retries.
import fs from 'node:fs';
import path from 'node:path';
import { prepareKnowledgePairs, sealPlan, PAIR_VERSION } from '../experiments/reading-quality/knowledge-pairs.js';
import { checkLayeredOutput } from '../experiments/reading-quality/layered-output.js';
import { reserveCampaign } from './deepseek-campaign-budget.js';
const [action, directory] = process.argv.slice(2);
if (!['prepare', 'prepare-small', 'execute'].includes(action) || !directory || process.argv.length !== 4)
  throw Error('Use prepare|prepare-small|execute <new local directory>');
const dir = path.resolve(directory);
const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
if (action.startsWith('prepare')) {
  const plan = await prepareKnowledgePairs({ profile: action === 'prepare-small' ? 'one-pair' : 'three-pairs' });
  fs.mkdirSync(dir); write('plan.json', plan); write('seal.json', { hash: sealPlan(plan) });
  console.log(JSON.stringify({ api_called: false, calls: plan.cases.length * 2, reserve_cny: plan.reserve_cny, version: plan.version }));
} else {
  const plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'));
  const seal = JSON.parse(fs.readFileSync(path.join(dir, 'seal.json'), 'utf8'));
  if (plan.version !== PAIR_VERSION || seal.hash !== sealPlan(plan) || sealPlan(await prepareKnowledgePairs({ profile: plan.profile })) !== seal.hash ||
      fs.existsSync(path.join(dir, 'execution.json'))) throw Error('Plan changed or execution already started');
  process.loadEnvFile('.env.deepseek.local');
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key || /[\r\n]/.test(key)) throw Error('Local test credential missing or invalid');
  const reservation = reserveCampaign('test-results/deepseek-campaign-budget.json', {
    run: dir, amount: plan.reserve_cny, planHash: seal.hash });
  write('execution.json', { started_at: new Date().toISOString(), reservation, automatic_retries: false });
  const results = []; let stop = false;
  for (const c of plan.cases) {
    for (const arm of c.arms) {
      write(`${arm.id}-attempt.json`, { started_at: new Date().toISOString(), model: plan.model });
      try {
        const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', redirect: 'error',
          signal: AbortSignal.timeout(180000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify(arm.body) });
        if (!response.ok) throw Error('Provider HTTP error');
        const data = await response.json(), choice = data.choices?.[0];
        // Save only response content and usage, never request headers or provider errors.
        write(`${arm.id}-response.json`, { model: data.model ?? null, finish_reason: choice?.finish_reason ?? null,
          content: choice?.message?.content ?? '', usage: data.usage ?? null });
        const u = data.usage;
        const within = Number.isSafeInteger(u?.prompt_tokens) && u.prompt_tokens >= 0 && u.prompt_tokens <= plan.input_token_allowance &&
          Number.isSafeInteger(u?.completion_tokens) && u.completion_tokens >= 0 && u.completion_tokens <= plan.max_output_tokens;
        if (!within || choice?.finish_reason !== 'stop') throw Error('Incomplete response or unknown/out-of-bound usage');
        const answer = JSON.parse(choice.message.content);
        const check = checkLayeredOutput(answer, c.evidence, arm.material.packet);
        const result = { id: arm.id, case_id: c.id, arm: arm.arm, finish_reason: choice.finish_reason, usage: u,
          conservative_peak_cost_cny: (u.prompt_tokens * plan.checked_peak_cny_per_million.input + u.completion_tokens * plan.checked_peak_cny_per_million.output) / 1e6,
          within_reserve: true, check, target_facts_omitted: c.target_fact_ids.filter(id => !answer.facts.some(f => f.evidence_id === id)),
          model_quality: 'manual_review_pending' };
        write(`${arm.id}-check.json`, result); results.push(result);
        console.log(JSON.stringify({ id: arm.id, mechanical_ok: check.mechanical_ok }));
        if (!check.mechanical_ok) { stop = true; break; }
      } catch {
        const result = { id: arm.id, status: 'request_or_processing_failed', cost_unknown: true, retry: false };
        write(`${arm.id}-failure.json`, result); results.push(result); stop = true; break;
      }
    }
    if (stop) break;
  }
  write('summary.json', { scope: plan.scope, planned_calls: plan.cases.length * 2, attempted_calls: results.length, results,
    exact_billed_cost_cny: null, reservation, production_changes: false });
  if (stop) process.exitCode = 2;
}
