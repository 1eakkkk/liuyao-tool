import { chromium } from 'playwright';
import { createServer, preview } from 'vite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildRulesAbRecord, buildRulesAiInput } from '../src/ai/rules-input.js';

const dev = await createServer({ server: { port: 4324, strictPort: true } });
await dev.listen();
const built = await preview({ preview: { port: 4325, strictPort: true } });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const report = [], records = [];
const usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 100 };
const answer = '固定流式回复，供 Phase 5 链路验证。';
try {
  for (const [target, url] of Object.entries({ dev: dev.resolvedUrls.local[0], built: built.resolvedUrls.local[0] })) {
    const context = await browser.newContext({ timezoneId: 'Asia/Shanghai', viewport: { width: target === 'built' ? 390 : 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    await page.route('https://api.deepseek.com/chat/completions', async route => {
      requests.push(route.request().postData());
      const chunks = [{ choices: [{ delta: { content: answer } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage }];
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n' });
    });
    await page.goto(`${url}?debug=1&ai_input=structured&ai_rules=off`);
    await page.locator('#onboardCloseBtn').click();
    await page.locator('[data-tab="ai"]').click();
    await page.locator('#questionInput').fill('固定 Phase 5 对照问题');
    await page.locator('[data-tab="caster"]').click();
    await page.locator('[data-mode="manual"]').click();
    for (const [i, sum] of [7, 8, 9, 7, 6, 8].entries()) await page.locator(`#manualLine${i}`).selectOption(String(sum));
    await page.locator('#manualCastBtn').click();
    await page.locator('[data-tab="ai"]').click();
    await page.locator('#promptBtn').click();
    await page.locator('#export-rules-off').waitFor();
    const exports = {};
    for (const mode of ['off', 'on']) {
      await page.locator(`#export-rules-${mode}`).click();
      exports[mode] = await page.locator('#promptOutputText').inputValue();
      await page.locator('#copyPromptBtn').click();
      assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'), exports[mode]);
    }
    assert.ok(exports.off.includes('\"enabled\": false'));
    assert.ok(exports.on.includes('\"enabled\": true'));
    assert.ok(!exports.on.includes('overall_trend_text'));
    assert.equal(exports.off.split('======== A / B / C / D / E')[0], exports.on.split('======== A / B / C / D / E')[0]);
    await page.locator('#promptExtraToggle').click();
    await page.locator('#cleanupInputText').fill('之前的人工回答');
    await page.locator('#followUpExportInput').fill('请解释世应依据');
    await page.locator('#followUpExportBtn').click();
    assert.ok((await page.locator('#followUpExportOutput').inputValue()).includes('C_canonical_cast'));
    await page.locator('#toggleSettingsBtn').click();
    await page.locator('#apiKeyInput').fill('synthetic-phase5-key');
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
      records.push({ ...(await buildRulesAbRecord({ mode, input: JSON.parse(body.messages[1].content), model: body.model, payload, response: answer,
        usage, latency: { milliseconds: performance.now() - start, source: 'mock_browser_end_to_end' },
        payload_kind: 'api_body', case_id: target, order: records.length + 1 })), mock: true });
      return body;
    };
    const off = await send('off', '#interpretBtn');
    await page.evaluate(() => history.replaceState(null, '', '?debug=1&ai_input=structured&ai_rules=on'));
    const on = await send('on', '#interpretBtn');
    const onInput = JSON.parse(on.messages[1].content), offInput = JSON.parse(off.messages[1].content);
    assert.deepEqual(onInput, buildRulesAiInput(cast, 'on'));
    assert.deepEqual(offInput, buildRulesAiInput(cast, 'off'));
    assert.deepEqual(on.messages[0], off.messages[0]);
    const onlyTreatment = structuredClone(onInput);
    onlyTreatment.E_rule_results.enabled = false; onlyTreatment.E_rule_results.hits = [];
    assert.deepEqual(onlyTreatment, offInput);
    assert.deepEqual({ ...on, messages: [] }, { ...off, messages: [] });
    const follow = await send('on', '#followUpBtn', '请解释动爻');
    assert.deepEqual(follow.messages[1], on.messages[1]);
    await page.evaluate(() => history.replaceState(null, '', '?debug=1&ai_input=structured&ai_rules=off'));
    await page.reload();
    await page.locator('[data-tab="ai"]').click();
    await page.waitForFunction(() => document.getElementById('aiResult').textContent.includes('固定流式回复'));
    const restored = await send('on', '#followUpBtn', '同一件事，请指出确定事实与推理');
    assert.deepEqual(restored.messages[1], on.messages[1]);
    assert.ok(restored.messages[0].content.includes('不是第二份独立证据，不得重复加权'));
    await page.locator('#questionInput').fill('固定 Phase 5 对照问题');
    const offAgain = await send('off', '#interpretBtn');
    assert.deepEqual(offAgain.messages, off.messages);
    await page.evaluate(() => history.replaceState(null, '', '?debug=1&ai_input=structured'));
    await page.locator('#promptBtn').click();
    assert.equal(await page.locator('#rulesInputComparison').isVisible(), false);
    assert.ok(!(await page.locator('#promptOutputText').inputValue()).includes('E_rule_results'));
    assert.deepEqual(errors, []);
    report.push({ target, width: target === 'built' ? 390 : 1280, mock_requests: requests.length,
      paired_copy: 'passed', rules_followup_export: 'passed', identical_system_prompt: 'passed',
      only_enabled_and_hits_differ: 'passed', restore_rules_lock: 'passed', stale_rules_export_cleared: 'passed', errors });
    await context.close();
  }
  fs.mkdirSync('test-results/phase5', { recursive: true });
  fs.writeFileSync('test-results/phase5/browser.json', JSON.stringify({ report, records }, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close(); await dev.close(); await new Promise(resolve => built.httpServer.close(resolve));
}
