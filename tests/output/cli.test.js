// @vitest-environment node
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { syntheticOutput } from '../../experiments/structured-output/example.js';

const fixture = 'experiments/phase7/fixtures/compat-1.json';
const run = (...args) => spawnSync(process.execPath, ['scripts/structured-output.js', ...args], { encoding: 'utf8' });
test('offline package carries no API execution and refuses overwriting previous work', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'output-package-'));
  try {
    const output = path.join(root, 'prepared');
    const result = run('prepare', '--canonical', fixture, '--output', output);
    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json')));
    expect(manifest.real_api_called).toBe(false); expect(manifest.model).toBe('not-run');
    const original = fs.readFileSync(path.join(output, 'prompt.txt'), 'utf8');
    expect(run('prepare', '--canonical', fixture, '--output', output).status).not.toBe(0);
    expect(fs.readFileSync(path.join(output, 'prompt.txt'), 'utf8')).toBe(original);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}, 15000);

test('CLI requires explicit completion, validates against rebuilt context and does not overwrite output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'output-validation-'));
  try {
    const prepared = path.join(root, 'prepared'), response = path.join(root, 'response.json');
    expect(run('prepare', '--canonical', fixture, '--output', prepared).status).toBe(0);
    fs.writeFileSync(response, JSON.stringify(syntheticOutput(JSON.parse(fs.readFileSync(path.join(prepared, 'context.json'))))));
    const base = ['validate', '--canonical', fixture, '--response', response];
    const incomplete = path.join(root, 'incomplete.json'), complete = path.join(root, 'complete.json');
    expect(run(...base, '--output', incomplete).status).toBe(2);
    expect(JSON.parse(fs.readFileSync(incomplete)).issues[0].code).toBe('incomplete_response');
    expect(run(...base, '--completed', '--output', complete).status).toBe(0);
    expect(JSON.parse(fs.readFileSync(complete)).status).toBe('validated');
    expect(run(...base, '--completed', '--output', complete).status).not.toBe(0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}, 15000);
