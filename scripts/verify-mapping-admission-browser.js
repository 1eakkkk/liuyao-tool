import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const target=process.argv[2]||'http://127.0.0.1:4338/';
const engine=process.env.BROWSER_ENGINE||'chromium';
const local=['127.0.0.1','localhost'].includes(new URL(target).hostname);
const browser=await(engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
const dir='test-results/mapping-admission-browser';fs.mkdirSync(dir,{recursive:true});const reports=[];
const extract=text=>JSON.parse(text.split('【卦盘、问题与历史数据】\n')[1].split('\n\n请返回完整')[0]);
function reply(input){
 const mapping=input.admitted_mappings[0];
 const base={schema_version:'structured-selection-2',context_id:input.context_id,direction:'unclear',main_choice: mapping?{basis_id:mapping.role_ids[0],perspective:mapping.perspective,reason:'仅观察本次明确的协助方向。'}:{basis_id:'none',perspective:'none',reason:input.response_schema.properties.main_choice.properties.reason.const},factors:[],judgment:{basis_ids:[],reason:mapping?'条件尚未确认，仅作有限观察，不作成败判断。':input.response_schema.properties.judgment.properties.reason.const},role_tradeoffs:[],general_advice:[],background_usage:[],timing_candidates:[],uncertainties:['现实条件尚未确认。']};
 if(mapping){base.factors=[{basis_id:mapping.basis_ids[0],assessment:'conditional',role:{basis_id:mapping.role_ids[0],perspective:mapping.perspective,meaning:'这是本题明确询问的帮助方，不确认其意愿。'},application:{origin:'model_hypothesis',state:'proposed',goal_link:'仅观察用户所问的彼此帮助方向，不扩展为现实参与或结果。',mapping_id:mapping.id,effect_scope:'requires_conditions',effect_conditions:[{condition:'对方实际愿意协助。',status:'unconfirmed',user_quotes:[]}]},interpretation:'当前只作条件性观察，不能单独判断事情能否成功。'}];base.judgment.basis_ids=[mapping.basis_ids[0]];}
 return base;
}
try{for(const width of [1280,390,320])for(const mapped of [false,true]){
 const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://api.deepseek.com/**',async route=>{const body=route.request().postDataJSON(),input=JSON.parse(body.messages[1].content);requests.push(body);assert.equal(input.conversation.basis_policy,4);assert(body.tools[0].function.strict);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{index:0,finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'mapping-mock',type:'function',function:{name:'submit_reading',arguments:JSON.stringify(reply(input))}}]}}],usage:{prompt_tokens:20,completion_tokens:30}})});});
 await page.goto(target,{waitUntil:'domcontentloaded'});await page.locator('[data-mode="manual"]').click();
 for(const [i,sum] of (mapped?[7,7,8,8,8,8]:[7,8,7,8,8,9]).entries())await page.locator(`#manualLine${i}`).selectOption(String(sum));await page.locator('#manualCastBtn').click();
 await page.locator('[data-tab="ai"]').click();await page.locator('#questionInput').fill(mapped?'他能否帮助我整理旧书？':'我已部署免费网页，仅供自己和朋友娱乐，是否适合继续维护？');await page.locator('#readingMode').selectOption('structured');await page.locator('#promptBtn').click();
 const input=extract(await page.locator('#readingPrompt').inputValue());assert.equal(input.conversation.basis_policy,4);assert.equal(input.admitted_mappings.length,mapped?1:0);if(!mapped)assert.deepEqual(input.bases,[]);
 await page.locator('#readingPaste').fill(JSON.stringify(reply(input)));await page.locator('#readingComplete').check();await page.locator('#readingImport').click();
 assert((await page.locator('#readingStatus').textContent()).includes('通过'));assert((await page.locator('#readingTurns').textContent()).includes(mapped?'条件尚未确认':'取法覆盖不足'));
 if(mapped){await page.locator('#readingTurns details').first().evaluate(n=>n.open=true);assert((await page.locator('#readingTurns').textContent()).includes('取法来源'));}
 await page.locator('#toggleSettingsBtn').click();await page.locator('#apiKeyInput').fill('TEST_ONLY');await page.locator('#saveKeyBtn').click();await page.locator('#closeSettingsBtn').click();
 await page.locator('#readingFollow').fill(mapped?'他能否帮助我整理旧书？':'我已部署免费网页，仅供自己和朋友娱乐，是否适合继续维护？');await page.locator('#readingFollowApi').click();await page.waitForFunction(()=>document.querySelectorAll('#readingTurns article').length===2);assert.equal(requests.length,1);assert((await page.locator('#readingStatus').textContent()).includes('通过'));
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-tab="ai"]').click();await page.locator('#toggleHistoryBtn').click();await page.locator('.history-item-head').first().click();assert((await page.locator('.history-item-body').first().textContent()).includes(mapped?'条件尚未确认':'取法覆盖不足'));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);await page.screenshot({path:`${dir}/${local?'local':'production'}-${engine}-${width}-${mapped?'admitted':'uncovered'}.png`});reports.push({width,engine,mapped,api:'mocked',export_import:true,history:true,errors});await context.close();
}}finally{await browser.close();}
fs.writeFileSync(`${dir}/${local?'local':'production'}-${engine}-report.json`,JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify({passed:reports.length,engine,api:'mocked'}));
