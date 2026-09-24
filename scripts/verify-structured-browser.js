import { chromium } from 'playwright';
import { createServer, preview } from 'vite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildAbRecord } from '../src/ai/exports.js';
import { buildStructuredAiInput } from '../src/ai/structured-input.js';

const dev = await createServer({ server: { port: 4322, strictPort: true } });
await dev.listen();
const built = await preview({ preview: { port: 4323, strictPort: true } });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const report = [], records = [];
const usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100 };
const answer = '固定流式回复，供 Phase 4 链路验证。';
try {
  for (const [target, url] of Object.entries({ dev: dev.resolvedUrls.local[0], built: built.resolvedUrls.local[0] })) {
    const context = await browser.newContext({ timezoneId: 'Asia/Shanghai', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('https://api.deepseek.com/chat/completions', async route => {
      requests.push(route.request().postData());
      const chunks = [{ choices: [{ delta: { content: answer } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage }];
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n' });
    });
    await page.goto(`${url}?debug=1&ai_input=structured`);
    await page.locator('#onboardCloseBtn').click();
    await page.locator('[data-tab="ai"]').click();
    await page.locator('#questionInput').fill('固定 Phase 4 对照问题');
    await page.locator('[data-tab="caster"]').click();
    await page.locator('[data-mode="manual"]').click();
    for (const [i, sum] of [7, 8, 9, 7, 6, 8].entries()) await page.locator(`#manualLine${i}`).selectOption(String(sum));
    await page.locator('#manualCastBtn').click();
    await page.locator('[data-tab="ai"]').click();
    await page.locator('#promptBtn').click();
    await page.locator('#export-structured').waitFor();
    const exports = {};
    for (const mode of ['legacy', 'structured']) {
      await page.locator(`#export-${mode}`).click();
      exports[mode] = await page.locator('#promptOutputText').inputValue();
      await page.locator('#copyPromptBtn').click();
      assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), exports[mode]);
    }
    assert.ok(exports.legacy.includes('排盘数据：'));
    assert.ok(exports.structured.includes('C_canonical_cast'));
    assert.ok(!exports.structured.includes('overall_trend_text'));
    await page.locator('#promptExtraToggle').click();
    await page.locator('#cleanupInputText').fill('之前的人工回答');
    await page.locator('#followUpExportInput').fill('请解释世应依据');
    await page.locator('#followUpExportBtn').click();
    assert.ok((await page.locator('#followUpExportOutput').inputValue()).includes('C_canonical_cast'));
    await page.locator('#toggleSettingsBtn').click();
    await page.locator('#apiKeyInput').fill('synthetic-phase4-key');
    await page.locator('#saveKeyBtn').click();
    await page.locator('#toggleSettingsBtn').click();
    const cast = await page.evaluate(() => JSON.parse(localStorage.getItem('liuyao_interpret_history')).at(-1).cast.canonical);
    const send = async (mode, selector, followUp = null) => {
      if (followUp) await page.locator('#followUpInput').fill(followUp);
      const start = performance.now(), index = requests.length;
      await page.locator(selector).click();
      await page.waitForFunction(selector => !document.querySelector(selector).disabled, selector);
      assert.equal(requests.length, index + 1);
      const payload = requests[index], body = JSON.parse(payload);
      records.push({ ...(await buildAbRecord({ input_mode: mode, model: body.model, payload, response: answer,
        usage, latency: { milliseconds: performance.now() - start, source: 'mock_browser_end_to_end' },
        payload_kind: 'api_body', case_id: target, order: records.length + 1 })), mock: true });
      return body;
    };
    const structured = await send('structured', '#interpretBtn');
    assert.deepEqual(JSON.parse(structured.messages[1].content), buildStructuredAiInput(cast));
    const follow = await send('structured', '#followUpBtn', '请解释动爻');
    assert.deepEqual(follow.messages[1], structured.messages[1]);
    // Change URL to legacy, reload: the restored conversation must still be structured.
    await page.evaluate(() => history.replaceState(null, '', '?debug=1'));
    await page.reload();
    await page.locator('[data-tab="ai"]').click();
    await page.waitForFunction(() => document.getElementById('aiResult').textContent.includes('固定流式回复'));
    const restored = await send('structured', '#followUpBtn', '还是同一件事，请说明不确定性');
    assert.deepEqual(restored.messages[1], structured.messages[1]);
    assert.ok(restored.messages[0].content.includes('不得重新排盘'));
    await page.locator('#questionInput').fill('固定 Phase 4 对照问题');
    const legacy = await send('legacy', '#interpretBtn');
    assert.ok(legacy.messages[1].content.startsWith('排盘数据：'));
    assert.equal(legacy.model, structured.model);
    assert.deepEqual(legacy.thinking, structured.thinking);
    assert.equal(legacy.reasoning_effort, structured.reasoning_effort);
    assert.deepEqual(errors, []);
    report.push({ target, mock_requests: requests.length, paired_copy: 'passed', structured_followup_export: 'passed', restore_mode_lock: 'passed', errors });
    await context.close();
  }
  fs.mkdirSync('test-results/phase4', { recursive: true });
  fs.writeFileSync('test-results/phase4/browser.json', JSON.stringify({ report, records }, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close(); await dev.close(); await new Promise(resolve => built.httpServer.close(resolve));
}
