import fs from 'node:fs';
import path from 'node:path';
import { buildOutputContext } from '../src/ai/output/context.js';
const root = process.argv[2];
if (!root) throw Error('Provide completed comparison directory');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'plan.json')));
const cases = [];
for (const c of plan.cases) {
  const context = await buildOutputContext(c.canonical);
  const answers = plan.requests.filter(r => r.case_id === c.id).map(r => {
    const response = JSON.parse(fs.readFileSync(path.join(root, `${r.id}-raw.json`)));
    return { id: r.id, response: response.choices?.[0]?.message?.content ?? '' };
  });
  cases.push({ id: c.id, question: c.canonical.question.text, expectations: c.expectations,
    program_facts: context.input.C_canonical_cast, evidence: context.evidence, answers });
}
fs.writeFileSync(path.join(root, 'review-packet.json'), JSON.stringify({
  limitations: 'Same exposed development questions, different output contracts; no correctness claim from JSON success, no significance, same-model judge is not independent-model evidence.',
  criteria: plan.criteria, cases,
}, null, 2), { flag: 'wx' });
console.log('Review packet saved without mechanical scores, token counts or hidden reasoning.');
