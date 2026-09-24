// Read only the first 32 development case objects. Stop before the first holdout case byte.
// This is deliberately narrower than JSON.parse(readFileSync(benchmark)).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const benchmarkPath = fileURLToPath(new URL('../../experiments/phase8/query-planning-task-gate/benchmark.json', import.meta.url));
export function readTaskGateDevelopment() {
  const fd = fs.openSync(benchmarkPath, 'r');
  const byte = Buffer.alloc(1);
  let prefix = '', inString = false, escaped = false, objectDepth = 0, current = [], cases = [], inCases = false;
  try {
    while (fs.readSync(fd, byte, 0, 1, null) === 1) {
      const ch = byte.toString('utf8');
      if (!inCases) {
        prefix += ch;
        if (prefix.endsWith('"cases": [')) inCases = true;
        continue;
      }
      if (!objectDepth && ch !== '{') continue;
      if (ch === '{' && !inString) objectDepth++;
      if (objectDepth) current.push(byte[0]);
      if (ch === '}' && !inString) objectDepth--;
      if (ch === '"' && !escaped) inString = !inString;
      escaped = ch === '\\' && !escaped;
      if (objectDepth === 0 && current.length) {
        const item = JSON.parse(Buffer.from(current).toString('utf8'));
        if (item.split !== 'development') throw new Error('Development split ended before 32 cases');
        cases.push(item); current = [];
        if (cases.length === 32) break;
      }
    }
  } finally { fs.closeSync(fd); }
  if (!prefix.includes('"version": "query-planning-task-gate-candidate-1.2"') || cases.length !== 32)
    throw new Error('Task Gate development benchmark identity/count mismatch');
  return cases;
}
