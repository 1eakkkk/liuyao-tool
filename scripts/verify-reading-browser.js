import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { OUTPUT_VERSION } from '../src/ai/output/contract.js';
const target = process.argv[2];
const server = target ? null : await preview({ preview: { port: 4337, strictPort: true } });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true,
  ...(target && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const report = [];
fs.mkdirSync('test-results/reading', { recursive: true });
function answer(input) {
  return { schema_version: OUTPUT_VERSION, context_id: input.context_id, answer: '可以先整理书目，再安排阅读。<img src=x onerror=alert(1)>',
    direction: 'unclear', yongshen_candidates: [], factors: [{ assessment: 'neutral', interpretation: '仅核对第一爻的六亲，不断言现实结果。', evidence_ids: ['fact:/lines/0/relative'] }],
    timing_candidates: [], uncertainties: ['这是模拟回复，格式核对不代表预测正确。'] };
}
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    let behavior = 'valid';
    await page.route('https://api.deepseek.com/**', async route => {
      const body = route.request().postDataJSON(); requests.push(body);
      assert.equal(body.response_format.type, 'json_object');
      const input = JSON.parse(body.messages[1].content), response = answer(input);
      if (behavior === 'invalid') response.factors[0].evidence_ids = ['fact:fake'];
      if (behavior === 'delayed') await new Promise(resolve => setTimeout(resolve, 1200));
      const content = JSON.stringify(response);
      const stream = `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: behavior === 'truncated' ? 'length' : 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 30 } })}\n\ndata: [DONE]\n\n`;
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: stream });
    });
    await page.goto(target || server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.locator('#onboardCloseBtn').click();
    await page.locator('[data-tab="caster"]').click(); await page.locator('[data-mode="manual"]').click();
    for (let i = 0; i < 6; i++) await page.locator(`#manualLine${i}`).selectOption(i === 0 ? '6' : '8');
    await page.locator('#manualCastBtn').click();
    await page.locator('[data-tab="ai"]').click();
    await page.locator('#questionInput').fill('如何安排读书计划？');
    await page.locator('#readingMode').selectOption('structured');
    await page.locator('#promptBtn').click();
    const extract = text => JSON.parse(text.split('【卦盘、问题与历史数据】\n')[1].split('\n\n请返回完整')[0]);
    let input = extract(await page.locator('#readingPrompt').inputValue());
    assert.equal(requests.length, 0);
    await page.reload(); await page.locator('[data-tab="ai"]').click();
    await page.locator('#readingPanel').waitFor({ state: 'visible' });
    assert.equal(extract(await page.locator('#readingPrompt').inputValue()).context_id, input.context_id);
    await page.locator('#readingPaste').fill(JSON.stringify(answer(input)));
    await page.locator('#readingImport').click();
    assert((await page.locator('#readingStatus').textContent()).includes('确认'));
    await page.locator('#readingComplete').check(); await page.locator('#readingImport').click();
    await page.locator('#readingTurns h2').waitFor();
    assert.equal(await page.locator('#readingTurns img').count(), 0);
    assert.equal(await page.locator('#readingTurns details[open]').count(), 0);
    await page.locator('#readingFollow').fill('请继续说明依据'); await page.locator('#readingFollowExport').click();
    const next = extract(await page.locator('#readingPrompt').inputValue());
    assert.notEqual(next.context_id, input.context_id); assert.equal(next.conversation.history.length, 1);
    await page.locator('#readingPaste').fill(JSON.stringify(answer(input)));
    await page.locator('#readingComplete').check(); await page.locator('#readingImport').click();
    assert((await page.locator('#readingStatus').textContent()).includes('未通过'));
    // Saved test key never leaves the mocked route.
    await page.evaluate(() => localStorage.setItem('liuyao_deepseek_api_key', 'TEST_ONLY'));
    await page.reload(); await page.locator('[data-tab="ai"]').click();
    await page.locator('#readingFollow').fill('请给一项建议'); await page.locator('#readingFollowApi').click();
    await page.waitForFunction(() => document.querySelectorAll('#readingTurns article').length === 3);
    assert.equal(requests.length, 1); assert.equal(JSON.parse(requests[0].messages[1].content).conversation.history.length, 2);
    behavior = 'invalid'; await page.locator('#readingFollow').fill('再次检查依据'); await page.locator('#readingFollowApi').click();
    await page.waitForFunction(() => document.querySelectorAll('#readingTurns article').length === 4);
    assert((await page.locator('#readingStatus').textContent()).includes('未通过'));
    behavior = 'truncated'; await page.locator('#readingFollow').fill('截断测试'); await page.locator('#readingFollowApi').click();
    await page.waitForFunction(() => document.querySelectorAll('#readingTurns article').length === 5);
    assert((await page.locator('#readingTurns article').last().textContent()).includes('未完成'));
    behavior = 'delayed'; await page.locator('#readingFollow').fill('停止测试'); await page.locator('#readingFollowApi').click();
    await page.locator('#stopGenBtn').waitFor({ state: 'visible' });
    assert(await page.locator('#manualCastBtn').isDisabled()); assert(await page.locator('#readingMode').isDisabled());
    await page.locator('#stopGenBtn').click();
    await page.waitForFunction(() => document.querySelectorAll('#readingTurns article').length === 6);
    assert((await page.locator('#readingTurns article').last().textContent()).includes('未完成'));
    await page.locator('#readingTurns details').first().evaluate(node => { node.open = true; });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `test-results/reading/${target ? 'remote' : 'local'}-${width}.png`, fullPage: true });
    await page.locator('[data-tab="caster"]').click(); await page.locator('[data-mode="manual"]').click();
    for (let i = 0; i < 6; i++) await page.locator(`#manualLine${i}`).selectOption(i === 0 ? '7' : '8');
    await page.locator('#manualCastBtn').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('liuyao_structured_reading_v1')), null);
    assert(await page.locator('#readingPanel').isHidden());
    await page.locator('[data-tab="ai"]').click();
    behavior = 'valid'; await page.locator('#interpretBtn').click();
    await page.waitForFunction(() => document.querySelectorAll('#readingTurns article').length === 1);
    assert((await page.locator('#readingTurns h2').textContent()).includes('结论'));
    const initial = JSON.parse(requests.at(-1).messages[1].content);
    assert.equal(initial.conversation.history.length, 0);
    await page.reload(); await page.locator('[data-tab="ai"]').click();
    await page.locator('#readingTurns h2').waitFor();
    assert.equal(await page.locator('#readingTurns article').count(), 1);
    assert.deepEqual(errors, []);
    report.push({ width, api: 'mocked', export_roundtrip: 'passed', replay_rejected: true, restore: 'passed', stop: 'passed', replacement: 'passed', errors });
    await context.close();
  }
} finally { await browser.close(); await server?.httpServer.close(); }
fs.writeFileSync(`test-results/reading/${target ? new URL(target).hostname : 'local'}-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
