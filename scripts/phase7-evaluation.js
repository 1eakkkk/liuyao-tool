#!/usr/bin/env node
import fs from 'node:fs';
import { prepare, verify, importAnswer, exportScoring, lockReviews, unblind, report, status } from './phase7/evaluation-workflow.js';
const [command, root, argument] = process.argv.slice(2);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
try {
  if (!root) throw Error('Usage: node scripts/phase7-evaluation.js prepare|verify|import|scoring|lock|unblind|report|status <experiment-dir> [config.json|import.json|scoring-dir|reviews.json]');
  const actions = {
    prepare: () => prepare(root, read(argument)),
    verify: () => { verify(root); return {status:"freeze_verified"}; },
    import: () => importAnswer(root, read(argument)),
    scoring: () => exportScoring(root, argument),
    lock: () => lockReviews(root, argument),
    unblind: () => unblind(root), report: () => report(root), status: () => status(root),
  };
  if (!actions[command]) throw Error('Unknown command');
  console.log(JSON.stringify(await actions[command](), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
