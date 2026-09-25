import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { preview } from 'vite';
const target = process.argv[2];
const server = target ? null : await preview({ preview: { port: 4336, strictPort: true } });
const url = target || server.resolvedUrls.local[0];
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true,
  ...(target && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const report = [];
fs.mkdirSync('test-results/fact-check', { recursive: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai' });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://api.deepseek.com/**', route => { requests.push(route.request().url()); return route.abort(); });
    await page.goto(url); await page.locator('#onboardCloseBtn').click();
    await page.locator('[data-tab="caster"]').click(); await page.locator('[data-mode="manual"]').click();
    assert(await page.locator('#factCheckPanel').isHidden());
    for (let i = 0; i < 6; i++) await page.locator(`#manualLine${i}`).selectOption('8');
    await page.locator('#manualCastBtn').click();
    await page.locator('#factCheckPanel > details > summary').click();
    await page.locator('#factCheckTopic').selectOption('moving');
    assert.equal(await page.locator('.fact-check-answer').textContent(), '本卦没有动爻，因此没有变出六亲。');
    await page.locator('#factCheckResult details > summary').click();
    assert.equal(await page.locator('#factCheckResult li').count(), 6);
    await page.locator('#factCheckTopic').selectOption('hidden');
    assert((await page.locator('.fact-check-answer').textContent()).includes('未记载伏神'));
    await page.locator('#manualLine0').selectOption('6');
    assert(await page.locator('#factCheckPanel').isHidden(), 'old facts must disappear during new preview');
    await page.locator('#manualCastBtn').click();
    assert.equal(await page.locator('#factCheckTopic').inputValue(), 'shi_ying');
    await page.locator('#factCheckPanel > details > summary').click();
    await page.locator('#factCheckTopic').selectOption('moving');
    assert((await page.locator('.fact-check-answer').textContent()).includes('第1爻为动爻'));
    await page.locator('#factCheckResult details > summary').click();
    assert.equal(await page.locator('#factCheckResult li').count(), 7);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.locator('#factCheckPanel').screenshot({ path: `test-results/fact-check/${target ? 'remote' : 'local'}-${width}.png` });
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    report.push({ width, explicit_scope: 'passed', cast_replacement: 'passed', evidence: 'passed', api_requests: 0, errors });
    await context.close();
  }
} finally { await browser.close(); await server?.httpServer.close(); }
fs.writeFileSync(`test-results/fact-check/${target ? new URL(target).hostname : 'local'}-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
