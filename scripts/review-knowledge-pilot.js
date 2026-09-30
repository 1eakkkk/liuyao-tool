// Reproducible archive of exposed calls and explicitly self-reviewed findings.
import fs from 'node:fs';
import { sealPlan } from '../experiments/reading-quality/knowledge-pairs.js';
import { textHash } from '../src/knowledge/validate.js';
const roots = ['test-results/knowledge-reading-pilot-01', 'test-results/knowledge-reading-pilot-02'];
const findings = [
  { scope: 'partial', source_support: 'unassessed', source_attribution: 'not_applicable',
    annotations: [{ section: 'facts', quote: 'rule:MONTH-CLASH-001:primary:3:-',
      finding: 'Rule result placed in program facts; missing rule lane in dev-1 protocol exposed.' }] },
  { scope: 'partial', source_support: 'partial', source_attribution: 'not_applicable',
    annotations: [{ section: 'interpretations', quote: '如卯戌合', finding: 'Adds a traditional detail outside the requested naming scope without a supplied literature citation; not judged false here.' },
      { section: 'interpretations', quote: '逢合填实', finding: 'Names an unsourced traditional treatment in uncertainties; qualification does not provide a source.' }] },
  { scope: 'partial', source_support: 'partial', source_attribution: 'fail',
    annotations: [{ section: 'interpretations', quote: '该段也明确不推定无用、永久失效或吉凶',
      finding: 'Attributes modern editorial exclusions to the source passage. Original quotation defines the term; exclusions are editorial metadata, not an explicit statement in this quotation.' },
      { section: 'facts', quote: 'fact:/lines/2/spirit', finding: 'Unneeded spirit fact included despite a narrow term-definition question; value is mechanically correct.' }] }
];
const entries = [];
for (const root of roots) {
  const plan = JSON.parse(fs.readFileSync(`${root}/plan.json`, 'utf8'));
  const seal = JSON.parse(fs.readFileSync(`${root}/seal.json`, 'utf8'));
  if (sealPlan(plan) !== seal.hash) throw Error('Archived plan seal mismatch');
  const summary = JSON.parse(fs.readFileSync(`${root}/summary.json`, 'utf8'));
  for (const result of summary.results) {
    const c = plan.cases.find(c => c.arms.some(a => a.id === result.id));
    const arm = c.arms.find(a => a.id === result.id);
    const response = JSON.parse(fs.readFileSync(`${root}/${result.id}-response.json`, 'utf8'));
    const review = findings[entries.length];
    if (!review || review.annotations.some(a => !response.content.includes(a.quote))) throw Error('Review quotation no longer matches response');
    entries.push({ batch: root.split('/').at(-1), id: result.id, question: c.question, plan_hash: seal.hash,
      output_version: plan.output_version, raw_hash: textHash(response.content), raw: response.content,
      evidence: c.evidence, literature_packet: arm.material.packet, transport: response.usage,
      mechanical_result_as_executed: result.check, self_review: review });
  }
}
if (entries.length !== 3) throw Error('Unexpected call count');
const ledger = JSON.parse(fs.readFileSync('test-results/deepseek-campaign-budget.json', 'utf8'));
const reserved = ledger.reservations.reduce((s, r) => s + r.amount, 0);
const report = { scope: 'Three exposed development calls; one dev-1 failure and one dev-2 pair; author self-review, not independent acceptance',
  live_calls: 3, conservative_peak_cost_cny: entries.reduce((s, e) => s + (e.transport.prompt_tokens * 2 + e.transport.completion_tokens * 8) / 1e6, 0),
  exact_billed_cost_cny: null, price_source: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  campaign_limit_cny: ledger.limit_cny, campaign_reserved_cny: reserved, campaign_remaining_unreserved_cny: ledger.limit_cny - reserved,
  reservation_is_not_actual_spend: true, production_changes: false,
  conclusion: 'New rule lane resolves mechanical defect in this exposed pair; knowledge arm narrows explanation but misattributes editorial restrictions. No production readiness or general improvement established.', entries };
const output = 'test-results/knowledge-reading-pilot-review.json';
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ live_calls: report.live_calls, conservative_peak_cost_cny: report.conservative_peak_cost_cny,
  source_attribution: 'fail_in_knowledge_arm', production_changes: false }));
