import fs from 'node:fs';
import path from 'node:path';
import { createReadingSession, prepareReadingTurn, appendReadingTurn } from '../src/ai/output/session.js';
const directory = process.argv[2];
const plan = JSON.parse(fs.readFileSync(path.join(directory, 'plan.json')));
const results = [];
for (const c of plan.cases) {
  const session = createReadingSession(c.canonical);
  for (const [i, question] of [c.question, c.followup].filter(Boolean).entries()) {
    const id = `${c.id}-${i + 1}`;
    const recorded = JSON.parse(fs.readFileSync(path.join(directory, `${id}-review.json`)));
    const transport = JSON.parse(fs.readFileSync(path.join(directory, `${id}-result.json`)));
    const prepared = await prepareReadingTurn(session, question);
    if (prepared.context.context_id !== recorded.context.context_id) throw Error('Recorded input version differs');
    const t = appendReadingTurn(session, prepared, recorded.raw, !transport.error && transport.done && transport.finish === 'stop', 'api');
    results.push({ id, status: t.result.status, issues: t.result.issues });
  }
}
const report = { network_calls: 0, results };
fs.writeFileSync(path.join(directory, 'strict-recheck.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
