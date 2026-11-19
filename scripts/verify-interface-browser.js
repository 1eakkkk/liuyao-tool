import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { preview } from 'vite';
import {browserEngines,launchBrowser,selectAppPanel,openAppHelp} from './browser-test-launch.js';

// Freeze the existing product copy separately from the requested visual change.
const contentText = html => {
  const doc = new JSDOM(html).window.document;
  doc.querySelectorAll('script,style').forEach(n => n.remove());
  return ['basics','guide'].map(id => doc.getElementById(id).textContent.replace(/\s+/g, ' ').trim()).join('\n');
};
assert.equal(contentText(fs.readFileSync('index.html', 'utf8')),
  contentText(execFileSync('git', ['show', 'c2b8b77:index.html'], { encoding: 'utf8' })), 'Reference content must remain unchanged');
const target = process.argv[2];
const server = target ? null : await preview({ preview: { port: 4338, strictPort: true } });
const reports = [];
const root = 'test-results/interface'; fs.mkdirSync(root, { recursive: true });
try {
 for(const engine of browserEngines(['chromium'])) {
  const browser=await launchBrowser(engine,target);
  try {
  for (const width of [320, 390, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', timezoneId: 'Asia/Shanghai' });
    const page = await context.newPage(), errors = [], api = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    const base = target || server.resolvedUrls.local[0];
    page.on('request', req => { if (new URL(req.url()).origin !== new URL(base).origin) external.push(req.url()); });
    await page.route('https://api.deepseek.com/**', route => { api.push(route.request().url()); return route.abort(); });
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    assert(await page.locator('#caster').isVisible(), 'Start directly in casting');
    assert(await page.locator('#onboardOverlay').isHidden(), 'No blocking first-use tutorial');
    await openAppHelp(page);
    const bounds = async selector => {
      const b = await page.locator(selector).boundingBox(); assert(b && b.x >= -1 && b.x + b.width <= width + 1, `Outside viewport: ${selector} at ${width}`);
    };
    const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${width}`);
    await bounds('.onboard-card');
    await page.locator('#onboardCloseBtn').click();
    await selectAppPanel(page,'basics');
    await noOverflow();
    await page.screenshot({ path: `${root}/${width}-basics.png`, fullPage: true });
    const fold = page.locator('#basics .disclosure-trigger').first();
    await fold.focus(); await page.keyboard.press('Space'); assert.equal(await fold.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Enter'); assert.equal(await fold.getAttribute('aria-expanded'), 'false');
    const outline = await fold.evaluate(n => getComputedStyle(n).outlineStyle); assert.equal(outline, 'solid');
    await page.locator('[data-tab="caster"]').click();
    await page.locator('#castBtn').click();
    await page.locator('.physics-dialog').waitFor({ state: 'visible' });
    await bounds('.physics-dialog');
    await page.screenshot({ path: `${root}/${width}-physics.png` });
    await page.keyboard.press('Escape');
    assert(await page.locator('.physics-dialog').isHidden());
    await page.locator('.toast').last().waitFor({ state: 'hidden' });
    await page.locator('[data-mode="manual"]').click();
    for (const [i, value] of [7,8,9,7,6,8].entries()) await page.locator(`#manualLine${i}`).selectOption(String(value));
    await page.locator('#manualCastBtn').click();
    await page.locator('[data-mode="system"]').click();
    await page.locator('.calendar-settings > summary').click();
    await page.locator('.toast').last().waitFor({ state: 'hidden' });
    await bounds('#dayLookupDate'); await bounds('#dayLookupTime'); await noOverflow();
    const controlStyles = await page.locator('#dayGanzhi, #dayLookupDate, #dayLookupTime, #manualLine0').evaluateAll(nodes => nodes.map(n => {
      const s = getComputedStyle(n); return [s.borderRadius, s.fontSize, s.minHeight, s.borderColor, s.backgroundColor];
    }));
    for (const value of controlStyles) assert.deepEqual(value, controlStyles[0], `Inconsistent casting fields at ${width}`);
    await page.locator('#factCheckPanel > details > summary').click();
    await page.screenshot({ path: `${root}/${width}-caster.png`, fullPage: true });
    await selectAppPanel(page,'guide'); await noOverflow();
    await page.locator('#guide .disclosure-trigger').first().click();
    await page.screenshot({ path: `${root}/${width}-guide.png`, fullPage: true });
    await page.locator('[data-tab="ai"]').click();
    await page.locator('#questionInput').fill('只核对初爻六亲，不预测。');
    await page.locator('#toggleSettingsBtn').click();
    await page.locator('#advancedSettings > summary').click();
    for (const button of await page.locator('.settings-group.collapsible .disclosure-trigger').all()) await button.click();
    await page.locator('#roleSelect').selectOption('custom');
    await page.locator('#styleSelect').selectOption('custom');
    await page.locator('#customRoleInput').fill('保留内容，只验收控件布局');
    await page.evaluate(() => document.activeElement.blur());
    const settingsStyles = await page.locator('#modelSelect, #apiKeyInput, #priceHit, #customRoleInput').evaluateAll(nodes => nodes.map(n => {
      const s = getComputedStyle(n); return [s.borderRadius, s.fontSize, s.borderColor];
    }));
    for (const value of settingsStyles) assert.deepEqual(value, settingsStyles[0], `Inconsistent settings fields at ${width}`);
    await bounds('#apiKeyInput'); await bounds('#priceHit'); await noOverflow();
    await page.screenshot({ path: `${root}/${width}-settings.png`, fullPage: true });
    await page.locator('#closeSettingsBtn').click();
    await page.locator('#readingMode').selectOption('structured');
    await bounds('#readingMode'); await bounds('#readingModeNote'); await noOverflow();
    await page.screenshot({ path: `${root}/${width}-ai.png`, fullPage: true });
    await page.locator('#promptBtn').click();
    await page.locator('#readingPrompt').waitFor({ state: 'visible' });
    await bounds('#readingPrompt'); await bounds('#readingPaste');
    await page.locator('#readingComplete').check();
    assert((await page.locator('label:has(#readingComplete)').boundingBox()).height >= 44);
    await page.screenshot({ path: `${root}/${width}-export.png`, fullPage: true });
    const smallTargets = await page.locator('button:visible, select:visible').evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().height < 43).map(n => n.id || n.className));
    assert.deepEqual(smallTargets, [], `Small touch targets at ${width}`);
    await noOverflow();
    if (width <= 740) {
      const nav = await page.locator('.tabs').boundingBox();
      assert(Math.abs(nav.y + nav.height - page.viewportSize().height) <= 1, 'Mobile tabs stay at the bottom of the viewport');
      assert(await page.locator('#tabbtn-caster').evaluate(tab => {
        const box = tab.getBoundingClientRect();
        return tab.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), 'Mobile navigation stays reachable after a long reading');
      await selectAppPanel(page,'basics');
      const heading = await page.locator('#basics > section > h2').first().boundingBox(),sticky=await page.locator('.app-header').boundingBox();
      assert(heading.y>=sticky.y+sticky.height-1&&heading.y<450,'Learning navigation keeps the first heading visible below the sticky header');
    }
    await openAppHelp(page); await bounds('.onboard-card');
    await page.keyboard.press('Escape'); assert(await page.locator('#onboardOverlay').isHidden());
    // Cloudflare injects its existing analytics beacon on the production domain.
    // Keep every other external request forbidden, including fonts and paid API.
    const analytics = external.filter(url => target && ['gua.1eak.cool', 'gua.1eak.me'].includes(new URL(target).hostname) && new URL(url).hostname === 'static.cloudflareinsights.com' && new URL(url).pathname.startsWith('/beacon.min.js/'));
    assert.deepEqual(errors, []); assert.deepEqual(api, []); assert.deepEqual(external.filter(url => !analytics.includes(url)), [], 'No external fonts or unexpected requests');
    reports.push({ engine,width, forms: 'consistent', keyboard: 'passed', touch_targets: 'passed', overflow: 'none', reduced_motion: true, platform_analytics_requests: analytics.length, errors });
    await context.close();
  }
  }finally{await browser.close();}
 }
} finally { await server?.httpServer.close(); }
fs.writeFileSync(`${root}/${target ? new URL(target).hostname : 'local'}-report.json`, JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports));
