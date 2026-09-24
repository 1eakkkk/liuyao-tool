import fs from 'node:fs';
import path from 'node:path';
import { buildOutputContext, hashOutput } from '../src/ai/output/context.js';
import { buildOutputMessages, buildOutputExport } from '../src/ai/output/prompt.js';
import { parseOutputAnswer } from '../src/ai/output/parse.js';
import { OUTPUT_SCHEMA, OUTPUT_VERSION, OUTPUT_PROMPT_VERSION } from '../src/ai/output/contract.js';

const [operation, ...args] = process.argv.slice(2);
function option(name) { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; }
const canonicalPath = option('--canonical'), output = option('--output');
if (!['prepare', 'validate'].includes(operation) || !canonicalPath || !output)
  throw new Error('Use prepare|validate --canonical <file> --output <new path>; validate also needs --response <file> [--completed].');
const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));
const context = await buildOutputContext(canonical);
const json = value => JSON.stringify(value, null, 2) + '\n';
if (operation === 'prepare') {
  const messages = buildOutputMessages(context);
  // Build everything first, then reserve a new directory. Never overwrite a package.
  const contents = { 'prompt.txt': buildOutputExport(context), 'messages.json': json(messages),
    'context.json': json(context), 'response-schema.json': json(OUTPUT_SCHEMA),
    'manifest.json': json({ schema_version: OUTPUT_VERSION, prompt_version: OUTPUT_PROMPT_VERSION,
      context_id: context.context_id, messages_hash: await hashOutput(messages),
      model: 'not-run', real_api_called: false }) };
  fs.mkdirSync(output); // Parent must already exist; EEXIST is intentional.
  for (const [name, bytes] of Object.entries(contents)) fs.writeFileSync(path.join(output, name), bytes, { flag: 'wx' });
  console.log(JSON.stringify({ output, files: Object.keys(contents), real_api_called: false }));
} else {
  const response = option('--response');
  if (!response) throw new Error('--response is required');
  const result = parseOutputAnswer(fs.readFileSync(response, 'utf8'), context, { completed: args.includes('--completed') });
  fs.writeFileSync(output, json({ ...result, completion_source: 'operator_assertion',
    context_id: context.context_id, real_api_called: false }), { flag: 'wx' });
  console.log(JSON.stringify({ output, status: result.status, issues: result.issues }));
  if (result.status !== 'validated') process.exitCode = 2;
}
