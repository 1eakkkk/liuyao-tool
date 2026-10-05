import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createReadingSession} from '../src/ai/output/session.js';
import {prepareRelationReadingTurn} from '../experiments/reading-quality/relation-reading.js';
import {auditElementClaims} from '../experiments/reading-quality/element-claims.js';
import {buildElementReference} from '../src/ai/output/relation-reference.js';
// Read-only local replay; no key, network request or model-generated repair.
const file=process.argv[2],planFile=process.argv[3];if(!file||!planFile)throw Error('Supply existing local response and frozen plan; never generates a paid reply');
const source=JSON.parse(fs.readFileSync(file,'utf8')),canonical=JSON.parse(fs.readFileSync(planFile,'utf8')).canonical;
if(!canonical||typeof source.raw!=='string')throw Error('Missing archived context/raw');
const prepared=await prepareRelationReadingTurn(createReadingSession(canonical),canonical.question.text);
if(JSON.stringify(prepared.context.input.C_canonical_cast)!==JSON.stringify(source.context.input.C_canonical_cast))throw Error('Archived cast does not match frozen plan');
const report={source_response_sha256:createHash('sha256').update(source.raw).digest('hex'),network_calls:0,
 program_reference:buildElementReference(prepared.context),literal_audit:auditElementClaims(JSON.parse(source.raw),prepared.context),
 limits:['Pronouns without explicit local named lines remain unassessed','Program elemental direction does not establish effective support, role choice or prediction','The old reply is neither modified nor certified as correct']};
fs.mkdirSync('test-results/element-reference',{recursive:true});fs.writeFileSync('test-results/element-reference/replay.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({network_calls:0,shi:report.program_reference.shi_line,gold_to_water:report.program_reference.to_shi.filter(r=>r.from.element==='金'&&r.to.element==='水').map(r=>r.direction),checked:report.literal_audit.checked,conflicts:report.literal_audit.conflicts,unassessed:report.literal_audit.unassessed}));
