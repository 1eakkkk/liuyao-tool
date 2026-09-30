import fs from 'node:fs';
import { prepareKnowledgePairs, sealPlan } from '../experiments/reading-quality/knowledge-pairs.js';
import { literatureSourceViews } from '../src/knowledge/source-view.js';
const plan = await prepareKnowledgePairs();
const cases = plan.cases.map(c => {
  const withMaterial = c.arms.find(a => a.arm === 'with-literature');
  const views = literatureSourceViews(withMaterial.material.packet, withMaterial.material.packet.cards.map(c => c.literature_id));
  const missing = c.target_fact_ids.filter(id => !c.evidence.some(e => e.id === id));
  if (missing.length) throw Error('Scoped input lost rule source facts');
  return { id: c.id, question: c.question, scope_audit: c.scope_audit, target_fact_ids: c.target_fact_ids,
    missing_required_facts: missing, source_labels: views.map(v => ({ id: v.literature_id, original: v.source.label, editorial: v.editorial.label })),
    inputs: c.arms.map(a => ({ id: a.id, input_bytes_with_allowance: a.input_bytes_with_allowance, packet_hash: a.material.packet_hash })) };
});
const report = { version: plan.version, plan_hash: sealPlan(plan), network_calls: 0, production_changes: false,
  scope: 'Exposed manually scoped development cases; no automatic intent understanding or live quality improvement established',
  semantic_support: 'unassessed', source_attribution_in_model_prose: 'unassessed', cases };
fs.mkdirSync('test-results/knowledge-reading', { recursive: true });
fs.writeFileSync('test-results/knowledge-reading/scoped-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(cases.map(c => ({ id: c.id, before: c.scope_audit.original_count, after: c.scope_audit.selected_count,
  missing_required_facts: c.missing_required_facts.length, labels: c.source_labels }))));
