import fs from 'node:fs';
import { auditReading } from '../experiments/reading-quality/audit.js';
const source = JSON.parse(fs.readFileSync(new URL('../docs/acceptance/reading-v3-live-review.json', import.meta.url)));
const reviews = JSON.parse(fs.readFileSync(new URL('../experiments/reading-quality/reviews.json', import.meta.url)));
if (source.entries.length !== reviews.reviews.length) throw Error('Review count mismatch');
const entries = source.entries.map((entry, i) => auditReading(entry, reviews.reviews[i]));
const report = { version: reviews.version, network_calls: 0, scope: reviews.scope,
  limitations: ['Not blind or independent review', 'No model-wide accuracy estimate', 'No automatic inference of question relevance', 'Missing direct citation is not proof that a rule cannot indirectly support a claim'], entries };
fs.mkdirSync('test-results/reading-quality', { recursive: true });
fs.writeFileSync('test-results/reading-quality/development-baseline.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(entries.map(e => ({id:e.id,mechanical:e.mechanical.status,...e.annotated_facts,scope:e.scope.rating,support:e.support.rating})), null, 2));

const { buildQualityCases } = await import('../experiments/reading-quality/cases.js');
const canonical=JSON.parse(fs.readFileSync(new URL('../experiments/phase7/fixtures/compat-1.json',import.meta.url)));
const controls=await buildQualityCases(canonical);
const results=controls.map(({entry,review,expected})=>{
  const result=auditReading(entry,review), f=result.annotated_facts;
  if(f.checked!==expected.checked || f.conflicts!==expected.conflicts || f.missing_direct_citations!==expected.missing) throw Error(`Control mismatch: ${review.id}`);
  return {id:review.id,expected,actual:f,mechanical:result.mechanical};
});
fs.writeFileSync('test-results/reading-quality/relative-role-controls.json',JSON.stringify({network_calls:0,kind:'Synthetic annotated development controls, not automatic language recognition',cases:results},null,2)+'\n');
console.log(`Relative/role controls: ${results.length} passed; no model calls.`);

const {checkExplicitPrimaryFacts}=await import('../experiments/reading-quality/explicit-facts.js');
const {buildExplicitContextControls}=await import('../experiments/reading-quality/explicit-controls.js');
const registry=controls[0].entry.quoted_evidence;
const candidates=[...controls.map(({entry,review,expected})=>({id:review.id,answer:JSON.parse(entry.raw),expected})),
  ...buildExplicitContextControls(registry)];
const candidateCases=candidates.map(({id,answer,expected})=>{
  const result=checkExplicitPrimaryFacts(answer,registry);
  if(result.checked!==expected.checked || result.conflicts!==expected.conflicts || result.missing_direct_citations!==expected.missing)
    throw Error(`Explicit fact candidate mismatch: ${id}`);
  return {id,expected,result};
});
const exposedReplies=source.entries.map(entry=>({id:`${entry.batch}/${entry.transport.id}`,
  result:checkExplicitPrimaryFacts(JSON.parse(entry.raw),entry.quoted_evidence)}));
const candidateReport={network_calls:0,production_changes:false,kind:'Exposed synthetic development controls; not blind acceptance',
  limitations:['Only whole-factor standalone primary-line relative/shi/ying assertions are recognized',
    'Unassessed prose is not passed; main answer and other output fields are outside coverage',
    'Rule mentions of a fact do not establish semantic support',
    'No automated scope/advice/real-world prediction judgment'],
  case_count:candidateCases.length,cases:candidateCases,exposed_replies:exposedReplies};
fs.writeFileSync('test-results/reading-quality/explicit-primary-candidate.json',JSON.stringify(candidateReport,null,2)+'\n');
console.log(`Explicit primary fact candidate: ${candidateCases.length} development controls passed; production unchanged.`);
console.log(JSON.stringify(exposedReplies.map(e=>({id:e.id,checked:e.result.checked,unassessed:e.result.unassessed,conflicts:e.result.conflicts}))));
