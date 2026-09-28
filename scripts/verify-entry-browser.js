import {chromium,webkit} from 'playwright';
import {preview} from 'vite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const target=process.argv[2],server=target?null:await preview({preview:{port:4358,strictPort:true}});
fs.mkdirSync('test-results/entry',{recursive:true});
const report=[];
try {for(const engine of [chromium,webkit]) {
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge'}:{})});
 try {for(const width of [320,390,1280]) {
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(target||server.resolvedUrls.local[0]);
  assert.equal(await page.locator('.tabs .tab-btn').count(),2);
  assert.equal(await page.locator('.header-help #helpFab').count(),1);
  await page.locator('[data-tab=ai]').click();
  assert.equal(await page.locator('#readingMode').inputValue(),'');
  assert.equal(await page.locator('#readingMode-trigger span').textContent(),'选择');
  await page.locator('#questionInput').fill('临时问题');await page.locator('#promptBtn').click();
  assert((await page.locator('#toastWrap').textContent()).includes('选择解读方式'));
  await page.locator('#readingMode').selectOption('structured');await page.reload();
  await page.locator('[data-tab=ai]').click();assert.equal(await page.locator('#questionInput').inputValue(),'');
  assert.equal(await page.locator('#readingMode').inputValue(),'');
  await page.locator('#questionInput').fill('返回时清空');await page.goto('about:blank');await page.goBack();
  await page.locator('[data-tab=ai]').click();assert.equal(await page.locator('#questionInput').inputValue(),'');
  await page.locator('[data-tab=caster]').click();await page.locator('[data-mode=manual]').click();
  for(let i=0;i<6;i++)await page.locator(`#manualLine${i}`).selectOption('8');
  await page.locator('#manualCastBtn').click();await page.locator('[data-mode=system]').click();
  await page.locator('#castBtn').click();await page.locator('.physics-dialog').waitFor();assert(await page.locator('#confirmOverlay').isHidden());
  await page.locator('.physics-close').click();
  await page.locator('[data-tab=basics]').click();assert(await page.locator('#basics').isVisible());
  await page.locator('[data-tab=guide]').click();assert(await page.locator('#guide').isVisible());
  await page.locator('[data-tab=caster]').click();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('#helpFab').click();await page.locator('#onboardCloseBtn').click();
  await page.waitForTimeout(3200);
  await page.screenshot({path:`test-results/entry/${engine.name()}-${width}.png`,animations:'disabled'});
  assert.deepEqual(errors,[]);report.push({engine:engine.name(),width,reset:'reload-and-back',emptyRecast:'no-confirmation',navigation:'two-primary',errors});
  await page.close();
 }}finally{await browser.close();}
}}finally{await server?.httpServer.close();}
fs.writeFileSync(`test-results/entry/${target?'production':'local'}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
