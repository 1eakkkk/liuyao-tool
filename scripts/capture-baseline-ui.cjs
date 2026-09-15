const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { EPOCH } = require('../tests/regression/harness.cjs');
(async()=>{
 const html = fs.readFileSync(path.join(__dirname,'../tests/regression/baseline/index.html'));
 const server = http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
  for(const width of [1280,390]){
   const context=await browser.newContext({viewport:{width,height:900},timezoneId:'Asia/Shanghai'});
   const page=await context.newPage();
   await page.route('https://fonts.googleapis.com/**',route=>route.abort());
   await page.clock.install({time:EPOCH});
   await page.clock.pauseAt(EPOCH);
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   const out=path.join(__dirname,'../docs/acceptance/baseline');fs.mkdirSync(out,{recursive:true});
   await page.screenshot({path:`${out}/${width}-onboard.png`});
   await page.locator('#onboardCloseBtn').click();
   for(const tab of ['basics','caster','guide','ai']){
    await page.locator(`[data-tab="${tab}"]`).click();
    if(tab==='caster')await page.evaluate(()=>renderPlate([7,8,9,7,6,8].map(lineFromSum),'manual'));
    await page.clock.runFor(400);
    await page.screenshot({path:`${out}/${width}-${tab}.png`,fullPage:true});
   }
   await context.close();
  }
 } finally {await browser.close();server.close();}
 console.log('Captured 10 baseline screenshots with fixed clock, local font fallback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
