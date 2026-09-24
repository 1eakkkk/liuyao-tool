import fs from 'node:fs';
import path from 'node:path';
import { buildOutputContext } from '../src/ai/output/context.js';
const root = process.argv[2];
if (!root) throw Error('Provide completed stream directory');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'plan.json')));
const cases = [];
for (const c of plan.cases) {
  const context = await buildOutputContext(c.canonical);
  const sse = fs.readFileSync(path.join(root, `${c.id}-raw.sse`), 'utf8');
  let response = '';
  for (const event of sse.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data || data === '[DONE]') continue;
    const item = JSON.parse(data); response += item.choices?.[0]?.delta?.content ?? '';
  }
  cases.push({ id: c.id, question: c.canonical.question.text, program_facts: context.input.C_canonical_cast,
    evidence: context.evidence, response });
}
fs.writeFileSync(path.join(root, 'review-packet.json'), JSON.stringify({ prompt_version: plan.prompt_version,
  limitations: 'Development questions, not blind holdout. Mechanical scores and private reasoning excluded.',
  criteria: ['fact_contradiction', 'scope_violation', 'plain_language', 'citation_relevance', 'unsupported_inference'], cases,
}, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ cases: cases.length, packet_written: true }));
