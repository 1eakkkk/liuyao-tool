import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {preview} from 'vite';
const target=process.argv[2], server=target?null:await preview({preview:{port:4343,strictPort:true}});
const reports=[];fs.mkdirSync('test-results/controls',{recursive:true});
try {
  for (const engine of ['chromium','webkit']) {
    const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{}),...(target&&process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
    try {
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(target||server.resolvedUrls.local[0]);
      await page.locator('#castPace-trigger').tap();
      assert.equal(await page.locator('.select-menu').count(),1);
      await page.locator('.select-option').last().tap();
      assert.equal(await page.locator('#castPace').inputValue(),'all');
      await page.locator('#castPace-trigger').focus();await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Home');await page.keyboard.press('Enter');
      assert.equal(await page.locator('#castPace').inputValue(),'step');
      await page.locator('#castPace-trigger').tap();await page.keyboard.press('Escape');
      assert.equal(await page.locator('.select-menu').count(),0);
      assert.equal(await page.locator('#castPace-trigger').evaluate(n=>n===document.activeElement),true);
      await page.locator('[data-mode=manual]').tap();
      for(let i=0;i<6;i++) await page.locator(`#manualLine${i}`).selectOption('8');
      await page.locator('#manualCastBtn').tap();
      await page.locator('#factCheckPanel > details > summary').tap();
      await page.locator('#factCheckTopic-trigger').tap();
      assert.equal(await page.locator('.select-menu [role=option]:focus').count(),1,'Nested labels must not steal menu focus');
      await page.keyboard.press('End'); await page.keyboard.press('Enter');
      assert((await page.locator('#factCheckResult').textContent()).length>10);
      await page.locator('[data-tab=basics]').tap();
      assert.equal(await page.locator('#basics .block-collapse').count(),5);
      assert.equal(await page.locator('#basics').evaluate(n=>getComputedStyle(n).animationName),'page-enter');
      await page.locator('#basics .disclosure-trigger').first().tap();
      assert.equal(await page.locator('#basics .disclosure-trigger').first().getAttribute('aria-expanded'),'true');
      await page.locator('[data-tab=ai]').tap();await page.locator('#toggleSettingsBtn').tap();
      for(const width of [320,580,1280]) {
        await page.setViewportSize({width,height:900});
        for(const mode of ['light','dark']) {
          await page.locator(`[data-theme-choice-button=${mode}]`).tap();
          await page.locator('#styleSelect-trigger').tap();
          const box=await page.locator('.select-menu').boundingBox();
          assert(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=901);
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
          await page.screenshot({animations:'disabled',path:`test-results/controls/${engine}-${width}-${mode}-menu.png`});
          await page.keyboard.press('Escape');
        }
      }
      await page.setViewportSize({width:390,height:844});
      await page.locator('[data-tab=caster]').tap();await page.locator('[data-mode=system]').tap();await page.locator('#castBtn').tap();await page.locator('#confirmOkBtn').tap();
      assert.equal(await page.locator('.physics-throw').evaluate(n=>getComputedStyle(n).userSelect),'none');
      assert(!(await page.locator('.physics-dialog').textContent()).includes('拖动'));
      const close=await page.locator('.physics-close').boundingBox(), icon=await page.locator('.physics-close svg').boundingBox();
      await page.screenshot({animations:'disabled',path:`test-results/controls/${engine}-physical.png`});
      assert(Math.abs(close.x+close.width/2-icon.x-icon.width/2)<1);
      assert(Math.abs(close.y+close.height/2-icon.y-icon.height/2)<1);
      await page.screenshot({animations:'disabled',path:`test-results/controls/${engine}-physical.png`});
      await page.locator('.physics-throw').tap();
      await page.locator('.physics-results .is-done').first().waitFor({timeout:90000});
      assert.equal(await page.locator('.physics-results .is-done').count(),1);
      await page.locator('.physics-close').tap();
      await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-tab=ai]').tap();
      assert.equal(await page.locator('#ai').evaluate(n=>getComputedStyle(n).animationName),'none');
      assert.deepEqual(errors,[]);
      reports.push({engine,menus:'touch-and-keyboard',sizes:[320,580,1280],animation:'respects-reduced-motion',physical:'single-tap-real-simulation',errors});
    } finally {await browser.close();}
  }
} finally {await server?.httpServer.close();}
fs.writeFileSync(`test-results/controls/${target?new URL(target).hostname:'local'}-report.json`,JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports));
