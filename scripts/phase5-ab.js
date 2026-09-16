import fs from 'node:fs';
import path from 'node:path';
import { normalizeLegacyCast } from '../src/core/normalize.js';
import { buildRulesPair, buildRulesAbRecord } from '../src/ai/rules-input.js';

// Offline only: no API calls or credentials. Generated files contain synthetic fixture questions.
const root = 'test-results/phase5-manual';
const [action = '--prepare', caseDir, mode, model, responseFile, latencyMs, usageFile] = process.argv.slice(2);
if (action === '--prepare') {
  const fixtures = JSON.parse(fs.readFileSync('tests/regression/fixtures/casts.json', 'utf8'));
  for (const [order, index] of [0, 2, 7, 11, 18, 23].entries()) {
    const fixture = fixtures[index];
    const question = '我正在准备一个项目，本月能否完成约定的交付？目前尚未确定合作方的最终时间。';
    const cast = normalizeLegacyCast(fixture.expected.cast, { question, createdAt: 0 });
    const pair = buildRulesPair(cast);
    const dir = path.join(root, fixture.id);
    if (fs.existsSync(path.join(dir, 'runs.jsonl'))) throw new Error('已有实验记录，不能覆盖其输入；请使用新的输出目录归档旧结果后再准备');
    fs.mkdirSync(dir, { recursive: true });
    for (const mode of ['off', 'on']) {
      fs.writeFileSync(path.join(dir, `${mode}.txt`), pair[mode].text);
      fs.writeFileSync(path.join(dir, `${mode}.input.json`), JSON.stringify(pair[mode].input, null, 2));
    }
    fs.writeFileSync(path.join(dir, 'canonical.json'), JSON.stringify(cast, null, 2));
    fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ case_id: fixture.id,
      suggested_order: order % 2 ? ['on', 'off'] : ['off', 'on'],
      status: 'prepared_not_run', question, instructions: '同模型、同设置、独立新对话；下一轮重复时交换顺序。' }, null, 2));
  }
  console.log(`Prepared 6 offline Schema 1.1 Rules pairs at ${root}; no API calls.`);
} else if (action === '--record') {
  if (!caseDir || !['off', 'on'].includes(mode) || !model || !responseFile || !Number.isFinite(Number(latencyMs)) || Number(latencyMs) < 0) {
    throw new Error('Usage: --record case-directory off|on model-label response.txt latency-ms [usage.json]');
  }
  const plan = JSON.parse(fs.readFileSync(path.join(caseDir, 'plan.json'), 'utf8'));
  const runsPath = path.join(caseDir, 'runs.jsonl');
  const previous = fs.existsSync(runsPath) ? fs.readFileSync(runsPath, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  const record = await buildRulesAbRecord({ mode, model, input: JSON.parse(fs.readFileSync(path.join(caseDir, `${mode}.input.json`), 'utf8')),
    payload: fs.readFileSync(path.join(caseDir, `${mode}.txt`), 'utf8'), response: fs.readFileSync(responseFile, 'utf8'),
    latency: { milliseconds: Number(latencyMs), source: 'manual_wall_clock' },
    usage: usageFile ? JSON.parse(fs.readFileSync(usageFile, 'utf8')) : null, case_id: plan.case_id,
    order: previous.length + 1 });
  fs.appendFileSync(path.join(caseDir, 'runs.jsonl'), JSON.stringify({ ...record, recorded_at: new Date().toISOString(), evaluation: 'pending_human_review' }) + '\n');
  console.log('Recorded hashes and metadata only. Unknown usage remains null.');
} else throw new Error('Expected --prepare or --record');
