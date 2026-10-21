import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const target=process.argv[2]||'http://127.0.0.1:4338/',engine=process.env.BROWSER_ENGINE||'chromium';
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{}),...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
const report=[],extract=t=>JSON.parse(t.split('【卦盘、问题与历史数据】\n')[1].split('\n\n请返回完整')[0]);
fs.mkdirSync('test-results/experience',{recursive:true});
const reply=i=>({schema_version:'structured-selection-2',context_id:i.context_id,answer:'象意上更适合继续小步推进，主要支持来自当前观察对象的条件。需留意动变与外部牵制，建议先完成一项小目标，再根据实际反馈调整。',direction:'favorable',main_choice:{basis_id:'l1',reason:'选取与当前问题有关的主要观察位置。'},factors:[{basis_ids:['l1'],assessment:'support',interpretation:'这项条件为推进提供一个支持角度，不证明实际结果已发生。'},{basis_ids:['l1','l2','l3','l4','l5','l6','l1'],assessment:'conditional',interpretation:'组合观察六爻，重复编号只显示一次。'},{basis_ids:[],assessment:'neutral',interpretation:'一般建议不伪装成已引用的程序事实。'}],background_usage:[],timing_candidates:[],uncertainties:['实际结果取决于后续行动。']});
try{for(const [index,width]of [1280,390,320].entries()){
 const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage(),errors=[],calls=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('liuyao_deepseek_api_key','TEST_ONLY'));
 await page.route('https://api.deepseek.com/**',async route=>{const b=route.request().postDataJSON(),i=JSON.parse(b.messages[1].content);assert.equal(i.conversation.judgment_policy,7);assert.equal(i.conversation.basis_policy,undefined);assert(i.bases.length>6);calls.push(b);
 const a=reply(i);if(calls.length===2){a.answer='完整正文仍可阅读：先做一个小工具，再根据使用反馈选择方向。';a.factors[0].basis_ids=['unknown-reference'];}
 const args=calls.length===2?JSON.stringify(a).replace('"direction":"favorable"','"direction":"有"坏引号""'):JSON.stringify(a);
 await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{index:0,finish_reason:'tool_calls',message:{role:'assistant',content:'解读如下',tool_calls:[{id:'mock',type:'function',function:{name:'submit_reading',arguments:args}}]}}],usage:{prompt_tokens:30,completion_tokens:40}})});});
 await page.goto(target);
 await page.screenshot({path:`test-results/experience/after-caster-${engine}-${width}.png`,fullPage:true});
 assert(await page.locator('#castNext').isHidden());
 await page.locator('[data-mode="manual"]').click();for(let n=0;n<6;n++)await page.locator(`#manualLine${n}`).selectOption('8');await page.locator('#manualCastBtn').click();
 const plateText=await page.locator('#plateWrap').textContent();
 await page.locator('#castSummary').screenshot({path:`test-results/experience/after-plate-${engine}-${width}.png`});
 assert(await page.locator('#castSummary').isVisible());
 const summaryBox=await page.locator('#castSummary').boundingBox(),plateBox=await page.locator('#plateWrap').boundingBox();
 assert(summaryBox.y+summaryBox.height<=plateBox.y+1);
 assert.equal(await page.locator('.plate-calendar').evaluate(n=>n.open),false);
 await page.locator('#gotoAiTabBtn').click();assert(await page.locator('#currentCastStatus').isVisible());
 assert(await page.locator('#questionInput').evaluate(n=>n===document.activeElement));
 await page.locator('#viewCurrentCastBtn').click();assert.equal(await page.locator('#plateWrap').textContent(),plateText);
 await page.locator('#gotoAiTabBtn').click();assert(await page.locator('#aiStats').isHidden());
 for(const theme of ['dark','light']){
   await page.locator('.theme-picker > summary').click();await page.locator(`[data-theme-choice-button=${theme}]`).click();await page.keyboard.press('Escape');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`test-results/experience/after-ai-${engine}-${width}-${theme}.png`,fullPage:true});
 }
 const q=['我现在想用ai做东西，帮我算一下我做什么比较好？','只核对世应五行','我能活多久，我很焦虑'][index];await page.locator('#questionInput').fill(q);await page.locator('#readingMode').selectOption('structured');await page.locator('#promptBtn').click();await page.locator('#readingPrompt').waitFor();const i=extract(await page.locator('#readingPrompt').inputValue());assert(i.chart.lines.length===6);assert.equal(i.conversation.judgment_policy,7);assert.equal(await page.locator('#readingAvailability').count(),0);
 await page.locator('#readingPaste').fill(JSON.stringify(reply(i)));await page.locator('#readingComplete').check();await page.locator('#readingImport').click();await page.locator('#readingTurns h2').waitFor();assert((await page.locator('#readingTurns').textContent()).includes('偏有利'));assert((await page.locator('#readingStatus').textContent()).includes('通过'));
 assert.equal(await page.locator('.reading-conclusion').textContent(),reply(i).answer);
 assert.equal(await page.locator('.reading-analysis').evaluate(n=>n.open),false);
 assert.equal(await page.locator('.reading-factor-overview').count(),0);
 assert(await page.locator('#readingTurns .reading-note').first().isHidden());
 await page.locator('#readingPanel').screenshot({path:`test-results/experience/after-reading-${engine}-${width}.png`});
 await page.locator('#readingFollow').fill(q);await page.locator('#readingFollowApi').click();await page.waitForFunction(()=>document.querySelectorAll('#readingTurns article').length===2);assert.equal(calls.length,1);assert((await page.locator('#readingStatus').textContent()).includes('已完成'));
 await page.locator('#readingFollow').fill('我能活多久，我很焦虑');await page.locator('#readingFollowApi').click();await page.waitForFunction(()=>document.querySelectorAll('#readingTurns article').length===3);assert.equal(calls.length,2);assert((await page.locator('#readingTurns article').last().textContent()).includes('完整正文仍可阅读'));assert((await page.locator('#readingStatus').textContent()).includes('正文已显示'));assert.equal(await page.locator('#readingTurns article').last().locator('details[open]').count(),0);
 await page.reload();assert(await page.locator('#castNext').isHidden());
 await page.locator('[data-tab="ai"]').click();assert.equal(await page.locator('#questionInput').inputValue(),'');
 assert(await page.locator('#currentCastStatus').isHidden());assert(await page.locator('#readingPanel').isHidden());
 await page.locator('#toggleHistoryBtn').click();
 await page.locator('#aiHistorySearch').fill('没有这条记录');assert.equal(await page.locator('.history-item').count(),0);
 assert((await page.locator('#historyEmpty').textContent()).includes('没有找到'));
 await page.locator('#aiHistorySearch').fill(q.slice(0,4));assert.equal(await page.locator('.history-item').count(),1);
 assert((await page.locator('.history-preview').textContent()).includes('象意上'));
 await page.locator('.history-item-head').first().click();
 assert.equal(await page.locator('.history-reading-evidence').first().evaluate(n=>n.open),false);
 assert(await page.locator('.history-turn-assistant').first().isVisible());
 assert((await page.locator('.history-item-body').textContent()).includes('完整正文仍可阅读'));assert((await page.locator('.history-item-body').textContent()).includes('附带格式或引用尚未完整核对'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.equal(await page.locator('.history-turn-label').first().textContent(),'首次解读');
 assert((await page.locator('.history-item-body').textContent()).includes('第 1 次追问'));
 await page.locator('#historyPanel').screenshot({path:`test-results/experience/after-history-${engine}-${width}.png`});
 await page.locator('#aiHistorySearch').fill('');
 if(index===1){
   await page.clock.setFixedTime(new Date('2026-10-21T12:00:00+08:00'));
   await page.evaluate(()=>{
     const key='liuyao_interpret_history',record=JSON.parse(localStorage.getItem(key))[0];
     localStorage.setItem(key,JSON.stringify([ {...record,id:'earlier',ts:new Date('2026-10-10T10:00:00+08:00').getTime()}, {...record,id:'week',ts:new Date('2026-10-20T10:00:00+08:00').getTime()}, {...record,ts:Date.now()} ]));
   });
   await page.locator('#aiHistorySearch').fill(q.slice(0,4));
   assert.deepEqual(await page.locator('.history-group-title').allTextContents(),['今天','本周','更早']);
   assert.equal(await page.locator('.history-item').count(),3);
   await page.locator('#aiHistorySearch').fill('');
 }
 await page.locator('#toggleHistoryBtn').click();
 // Also exercise the initial API button, not only the follow-up route.
 if(index!==0){await page.locator('[data-tab="caster"]').click();await page.locator('[data-mode="manual"]').click();for(let n=0;n<6;n++)await page.locator(`#manualLine${n}`).selectOption('8');await page.locator('#manualCastBtn').click();await page.locator('[data-tab="ai"]').click();}
 await page.locator('#questionInput').fill('我能活多久，我很焦虑');await page.locator('#readingMode').selectOption('structured');await page.locator('#interpretBtn').click();await page.waitForFunction(()=>document.querySelectorAll('#readingTurns article').length===1,{},{timeout:90000});assert.equal(calls.length,3);assert((await page.locator('#readingStatus').textContent()).includes('已完成'));assert.deepEqual(errors,[]);
 report.push({engine,width,castHandoff:true,exportImport:true,initialApi:true,autoCast:index===0,api:'mocked',readableFallback:true,historySearch:true,themes:['light','dark'],errors});await context.close();
}}finally{await browser.close();}
fs.mkdirSync('test-results/practical-browser',{recursive:true});fs.writeFileSync(`test-results/practical-browser/${new URL(target).hostname==='127.0.0.1'?'local':'production'}-${engine}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

