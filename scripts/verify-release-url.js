import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const base = new URL(process.argv[2]);
assert(base.protocol === 'https:', 'Release verification requires HTTPS');
const manifest = JSON.parse(fs.readFileSync('test-results/release-manifest.json', 'utf8'));
for (const asset of manifest.artifacts) {
  if (asset.path === '_headers') continue; // Cloudflare consumes this configuration file.
  const response = await fetch(new URL(asset.path === 'index.html' ? './' : asset.path, base), { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, asset.path);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `Release asset differs: ${asset.path}`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
}
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const results = [];
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base.href);
    await page.locator('#onboardCloseBtn').click();
    await page.locator('[data-tab="caster"]').click();
    await page.locator('[data-mode="manual"]').click();
    for (const [i, sum] of [7, 8, 9, 7, 6, 8].entries()) await page.locator(`#manualLine${i}`).selectOption(String(sum));
    await page.locator('#manualCastBtn').click();
    await page.locator('#plateWrap table').waitFor();
    await page.locator('[data-tab="ai"]').click();
    await page.locator('#questionInput').fill('发布验证：当前计划应如何安排？');
    await page.locator('#promptBtn').click();
    assert((await page.locator('#promptOutputText').inputValue()).length > 100);
    assert.deepEqual(errors, []);
    results.push({ width, manualCast: 'passed', promptExport: 'passed', pageErrors: errors });
    await context.close();
  }
} finally { await browser.close(); }
const report = { url: base.href, checkedAt: new Date().toISOString(), assets: 'sha256-match', headers: 'passed', realApi: 'not-tested', results };
fs.writeFileSync(`test-results/release-url-${base.hostname}.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
