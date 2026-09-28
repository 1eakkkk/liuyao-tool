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
