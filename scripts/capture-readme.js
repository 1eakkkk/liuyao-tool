// Fresh public screenshots with clean storage and model requests blocked.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {preview} from 'vite';
const server=await preview({preview:{host:'127.0.0.1',port:4391,strictPort:true}});
const browser=await chromium.launch({channel:'msedge',headless:true});
const images='docs/images';fs.mkdirSync(images,{recursive:true});
try{
  const context=await browser.newContext({viewport:{width:1280,height:900},colorScheme:'light',reducedMotion:'reduce'});
  let modelCalls=0;await context.route('https://api.deepseek.com/**',route=>{modelCalls++;return route.abort();});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.locator('#tabbtn-caster').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:`${images}/desktop-casting.png`,animations:'disabled'});
  await page.locator('#tabbtn-ai').click();await page.locator('#questionInput').fill('这次计划应该如何安排？');
  await page.screenshot({path:`${images}/ai-reading.png`,animations:'disabled'});
  await page.locator('#toggleSettingsBtn').click();
  await page.screenshot({path:`${images}/ai-settings.png`,animations:'disabled'});
  await page.keyboard.press('Escape');await page.locator('#tabbtn-caster').click();
  await page.locator('#castBtn').click();await page.locator('.physics-dialog').waitFor();
  await page.screenshot({path:`${images}/physical-casting.png`,animations:'disabled'});
  await page.locator('.physics-close').click();
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,colorScheme:'dark',reducedMotion:'reduce'});
  await mobileContext.route('https://api.deepseek.com/**',route=>{modelCalls++;return route.abort();});
  const mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(server.resolvedUrls.local[0]);
  await mobile.locator('#tabbtn-caster').waitFor();await mobile.evaluate(()=>document.fonts.ready);
  assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await mobile.screenshot({path:`${images}/mobile-dark.png`,animations:'disabled'});
  assert.equal(modelCalls,0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({screenshots:5,model_calls:0,page_errors:errors,source:'local production build; clean browser storage'}));
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
