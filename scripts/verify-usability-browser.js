import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { preview } from 'vite';
import { createReadingSession, serializeReadingSession } from '../src/ai/output/session.js';

const target = process.argv[2];
const server = target ? null : await preview({ preview: { port: 4341, strictPort: true } });
const base = target || server.resolvedUrls.local[0];
const canonical = JSON.parse(fs.readFileSync('experiments/phase7/fixtures/compat-1.json', 'utf8'));
canonical.question.text = '旧问题：如何安排读书计划？';
const saved = serializeReadingSession(createReadingSession(canonical, {style:'deep',custom:''}), canonical.question.text);
const reports = [];
fs.mkdirSync('test-results/usability', {recursive:true});
try {
  for (const engine of ['chromium','webkit']) {
    const browser = await (engine === 'webkit' ? webkit : chromium).launch({headless:true,
      ...(engine === 'chromium' ? {channel:process.env.BROWSER_CHANNEL || 'msedge'} : {}),
      ...(target && process.env.HTTPS_PROXY ? {proxy:{server:process.env.HTTPS_PROXY}} : {})});
    try {
      const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const errors=[], requests=[];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://api.deepseek.com/**', route => { requests.push(route.request().url()); return route.abort(); });
      await page.goto(base, {waitUntil:'domcontentloaded',timeout:60000});
      assert(await page.locator('#caster').isVisible());
      assert(await page.locator('#onboardOverlay').isHidden());
      const action = await page.locator('#castBtn').boundingBox();
      assert(action.y + action.height < 760, 'Casting action belongs in the first screen');
      await page.evaluate(saved => {
        localStorage.setItem('liuyao_structured_reading_v1', saved);
        localStorage.setItem('liuyao_reply_style','deep');
      }, saved);
      await page.reload();
      assert.equal(await page.locator('#plateWrap table').count(),0);
      await page.locator('[data-mode=manual]').click();
      for(let i=0;i<6;i++)await page.locator(`#manualLine${i}`).selectOption(String(canonical.lines[i].yin_yang==='yang'?(canonical.lines[i].moving?9:7):(canonical.lines[i].moving?6:8)));
      await page.locator('#manualCastBtn').click();
      await page.locator('[data-mode=system]').click();
      for (const width of [320,390,580,768,1024,1280]) {
        await page.setViewportSize({width,height:844});
        const layout = await page.locator('#plateWrap').evaluate(node => {
          const rect=node.getBoundingClientRect();
          return {display:getComputedStyle(node).display, overflow:document.documentElement.scrollWidth > innerWidth+1,
            rows:[...node.children].filter(n=>n.getBoundingClientRect().height>0).map(n=>({cls:n.className,width:n.getBoundingClientRect().width,y:n.getBoundingClientRect().y})),width:rect.width};
        });
        assert.equal(layout.display,'block'); assert.equal(layout.overflow,false);
        for (const row of layout.rows) assert(row.width >= layout.width*.9, `${engine} ${width}: squeezed ${row.cls}`);
        await page.screenshot({path:`test-results/usability/${engine}-${width}-restored.png`,fullPage:true});
      }
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.locator('#questionInput').inputValue(),'');
      await page.locator('[data-tab=ai]').click();
      await page.locator('#questionInput').fill(canonical.question.text);
      await page.locator('[data-tab=caster]').click();
      await page.locator('#castPace').selectOption('all');
      await page.locator('#castBtn').click();
      await page.locator('#confirmCancelBtn').click();
      assert.equal(await page.locator('#questionInput').inputValue(),canonical.question.text);
      await page.locator('#castBtn').click(); await page.locator('#confirmOkBtn').click();
      await page.locator('.physics-close').click();
      assert.equal(await page.locator('#questionInput').inputValue(),canonical.question.text,'Cancelling physical casting preserves the question');
      await page.locator('#castBtn').click(); await page.locator('#confirmOkBtn').click();
      // Real CANNON world and real animation frames, without stubbing the result.
      const started=Date.now();
      await page.locator('.physics-throw').click();
      await page.locator('.physics-dialog.is-complete').waitFor({timeout:240000});
      const castMs=Date.now()-started;
      await page.locator('.physics-throw').click();
      assert.equal(await page.locator('#questionInput').inputValue(),'','Successful new cast clears old question');
      assert.equal(await page.evaluate(()=>localStorage.getItem('liuyao_structured_reading_v1')),null);
      await page.locator('[data-tab="ai"]').click();
      await page.locator('#questionInput').fill('请给两项建议，关于学习计划，不预测。');
      await page.locator('#readingMode').selectOption('structured');
      await page.locator('#promptBtn').click();
      await page.locator('#readingPrompt').waitFor();
      assert(await page.locator('#confirmOverlay').isHidden(),'Fresh cast does not repeat the changed-question confirmation');
      assert((await page.locator('#readingPrompt').inputValue()).includes('700–800 字'));
      assert(await page.locator('#roleSelect').isDisabled()); assert(await page.locator('#effortSelect').isDisabled());
      assert(!(await page.locator('#styleSelect').isDisabled()));
      assert.deepEqual(requests,[]); assert.deepEqual(errors,[]);
      reports.push({engine,restoredWidths:[320,390,580,768,1024,1280],cancel:'preserved',newCast:'question-cleared',physicalSimulation:'real',castMs,exportStyle:'deep',paidRequests:0,errors});
    } finally { await browser.close(); }
  }
} finally { await server?.httpServer.close(); }
fs.writeFileSync(`test-results/usability/${target ? new URL(target).hostname : 'local'}-report.json`,JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports));
