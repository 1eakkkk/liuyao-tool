import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {preview} from 'vite';
const target=process.argv[2];
const server=target?null:await preview({preview:{port:4342,strictPort:true}});
const reports=[]; fs.mkdirSync('test-results/theme',{recursive:true});
try {
  for(const engine of ['chromium','webkit']) {
    const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{}),...(target&&process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
    try {
      const context=await browser.newContext({viewport:{width:390,height:900},colorScheme:'dark'});
      const page=await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(target||server.resolvedUrls.local[0]);
      const openTheme=async()=>{
        await page.locator('.theme-picker > summary').scrollIntoViewIfNeeded();
        await page.locator('.theme-picker').evaluate(n=>n.open=true);
        assert(await page.locator('[data-theme-choice-button]').evaluateAll(buttons=>buttons.every(button=>{
          const r=button.getBoundingClientRect();
          return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight &&
            button.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));
        })), 'Every theme choice must be fully inside viewport and unobscured');
      };
      const theme=()=>page.locator('html').getAttribute('data-theme');
      assert.equal(await theme(),'dark');
      assert.equal(await page.locator('[data-theme-choice-button=system]').getAttribute('aria-pressed'),'true');
      await openTheme(); await page.locator('[data-theme-choice-button=light]').click(); assert.equal(await theme(),'light');
      await page.reload(); assert.equal(await theme(),'light');
      await page.emulateMedia({colorScheme:'light'}); await page.emulateMedia({colorScheme:'dark'}); assert.equal(await theme(),'light');
      await openTheme(); await page.locator('[data-theme-choice-button=system]').click(); assert.equal(await theme(),'dark');
      await page.emulateMedia({colorScheme:'light'}); await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
      await openTheme(); await page.locator('[data-theme-choice-button=dark]').click(); await page.reload(); assert.equal(await theme(),'dark');
      await page.locator('[data-tab=ai]').click(); await page.locator('#questionInput').fill('切换主题保留问题');
      await page.locator('#toggleSettingsBtn').click();
      assert(await page.locator('#modelSelect').isHidden());
      await page.locator('#advancedSettings > summary').click();
      await page.locator('#closeSettingsBtn').click();
      await page.locator('#readingMode').selectOption('structured');
      await page.locator('#toggleSettingsBtn').click();
      assert(await page.locator('#roleSelect').isHidden()); assert(await page.locator('#effortSelect').isHidden());
      assert(await page.locator('#styleSelect').isVisible());
      await page.locator('#closeSettingsBtn').click();
      await page.locator('#readingMode').selectOption('legacy');
      await page.locator('#toggleSettingsBtn').click();
      assert(await page.locator('#roleSelect').isVisible()); assert(await page.locator('#effortSelect').isVisible());
      await page.locator('#closeSettingsBtn').click();
      for(const width of [320,580,1280]) {
        await page.setViewportSize({width,height:900});
        for(const mode of ['light','dark']) {
          await openTheme(); await page.locator(`[data-theme-choice-button=${mode}]`).click();
          assert.equal(await page.locator('#questionInput').inputValue(),'切换主题保留问题');
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
          for(const button of await page.locator('[data-theme-choice-button]').all()) assert((await button.boundingBox()).height>=44);
          await page.screenshot({path:`test-results/theme/${engine}-${width}-${mode}.png`,fullPage:true});
        }
      }
      await page.locator('#helpFab').click();
      assert.equal(await page.locator('.onboard-card').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(32, 39, 35)');
      await page.locator('#onboardCloseBtn').click(); await page.locator('[data-tab=caster]').click();
      await page.locator('#castBtn').click();
      assert.equal(await page.locator('.physics-dialog').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(32, 39, 35)');
      await page.locator('.physics-close').click();
      assert.deepEqual(errors,[]);
      reports.push({engine,systemChanges:'passed',overrideAndPersistence:'passed',widths:[320,580,1280],structuredSettings:'hidden',legacySettings:'available',errors});
    }finally{await browser.close();}
  }
}finally{await server?.httpServer.close();}
fs.writeFileSync(`test-results/theme/${target?new URL(target).hostname:'local'}-report.json`,JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports));
