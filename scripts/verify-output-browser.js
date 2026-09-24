import { createServer } from 'vite';
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const server = await createServer({ server: { host: '127.0.0.1', port: 4331, strictPort: true } });
await server.listen();
let browser;
const report = [];
fs.mkdirSync('test-results/structured-output', { recursive: true });
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    const page = await context.newPage(), errors = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      if (new URL(route.request().url()).hostname !== '127.0.0.1') { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await page.goto(`${server.resolvedUrls.local[0]}experiments/structured-output/`);
    await page.waitForFunction(() => document.querySelector('#status').textContent === '格式与引用核对通过。');
    assert.equal(await page.locator('#result details').getAttribute('open'), null);
    await page.locator('#result summary').click();
    assert(await page.locator('#result details').isVisible());
    assert(await page.locator('#result').innerText().then(t => t.includes('不确定性')));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/structured-output/${width}.png`, fullPage: true });
    await page.locator('#invalid').click();
    assert((await page.locator('#status').innerText()).includes('unknown_evidence'));
    assert.equal(await page.locator('#result details').count(), 0);
    await page.locator('#partial').click();
    assert((await page.locator('#status').innerText()).includes('incomplete_response'));
    await page.locator('#sample').click();
    const answer = JSON.parse(await page.locator('#response').inputValue());
    answer.answer = '<img src=x onerror="window.compromised=true">';
    await page.locator('#response').fill(JSON.stringify(answer)); await page.locator('#validate').click();
    assert.equal(await page.locator('#result img').count(), 0);
    assert((await page.locator('#result').innerText()).includes('<img'));
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    report.push({ width, validation: 'passed', fallback: 'passed', safe_text: 'passed', external_requests: 0, errors });
    await context.close();
  }
  fs.writeFileSync('test-results/structured-output/browser.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser?.close(); await server.close(); }
