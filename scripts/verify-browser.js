import { chromium } from 'playwright';
import { preview, createServer } from 'vite';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';

const EPOCH = new Date('2026-09-15T12:00:00+08:00').getTime();
const baseline = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(fs.readFileSync('tests/regression/baseline/index.html'));
});
await new Promise(resolve => baseline.listen(0, '127.0.0.1', resolve));
const built = await preview({ preview: { port: 0 } });
const dev = await createServer({ server: { port: 0 } });
await dev.listen();
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const report = [];
try {
  const urls = { baseline: `http://127.0.0.1:${baseline.address().port}`, built: built.resolvedUrls.local[0], dev: dev.resolvedUrls.local[0] };
  for (const width of [1280, 390]) {
    const outputs = {};
    for (const [name, url] of Object.entries(urls)) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Shanghai' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://fonts.googleapis.com/**', route => route.abort());
      await page.clock.install({ time: EPOCH });
      await page.clock.pauseAt(EPOCH);
      await page.goto(url);
      await page.locator('#manualLine5').waitFor({ state: 'attached' });
      // Finish CSS transitions identically; fake timers alone do not advance compositor animations.
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
      const out = `docs/acceptance/${name}`;
      fs.mkdirSync(out, { recursive: true });
      outputs[name] = {};
      const capture = async tab => {
        await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
        outputs[name][tab] = await page.screenshot({ path: `${out}/${width}-${tab}.png`, fullPage: true });
      };
      await capture('onboard');
      await page.locator('#onboardCloseBtn').click();
      for (const tab of ['basics', 'caster', 'guide', 'ai']) {
        await page.locator(`[data-tab="${tab}"]`).click();
        if (tab === 'caster') {
          await page.locator('[data-mode="manual"]').click();
          for (const [i, sum] of [7, 8, 9, 7, 6, 8].entries()) await page.locator(`#manualLine${i}`).selectOption(String(sum));
          await page.locator('#manualCastBtn').click();
          await page.waitForFunction(() => document.querySelector('#plateWrap table'));
        }
        await capture(tab);
      }
      await page.locator('#questionInput').fill('固定浏览器回归问题');
      await page.locator('#promptBtn').click();
      await page.waitForFunction(() => document.getElementById('promptOutputText').value.length > 100);
      outputs[name].prompt = await page.locator('#promptOutputText').inputValue();
      assert.deepEqual(errors, [], `${name} browser errors`);
      assert.equal(await page.evaluate(() => typeof CANNON.World), 'function');
      await context.close();
    }
    for (const name of ['built', 'dev']) {
      for (const tab of ['onboard', 'basics', 'caster', 'guide', 'ai']) {
        const a = PNG.sync.read(outputs.baseline[tab]), b = PNG.sync.read(outputs[name][tab]);
        assert.equal(a.width, b.width); assert.equal(a.height, b.height);
        let maximumChannelDifference = 0;
        for (let i = 0; i < a.data.length; i++) maximumChannelDifference = Math.max(maximumChannelDifference, Math.abs(a.data[i] - b.data[i]));
        // Edge compositing varies by 1–2 levels even on repeated unbundled captures.
        // No differing geometry or larger pixel difference is accepted.
        assert.ok(maximumChannelDifference <= 2, `${name} ${width} ${tab}: channel difference ${maximumChannelDifference}`);
        report.push({ width, target: name, tab, maximumChannelDifference });
      }
      assert.equal(outputs[name].prompt, outputs.baseline.prompt, `${name} exported prompt`);
      report.push({ width, target: name, screenshots: 5, prompt: 'identical', errors: 0 });
    }
  }
  fs.writeFileSync('docs/acceptance/browser-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await dev.close();
  await new Promise(resolve => built.httpServer.close(resolve));
  await new Promise(resolve => baseline.close(resolve));
}
