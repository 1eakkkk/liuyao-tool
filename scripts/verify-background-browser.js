import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';
import {preview} from 'vite';
import {SELECTION_VERSION} from '../src/ai/output/selection.js';
const engine=process.env.BROWSER_ENGINE||'chromium';
const server=await preview({preview:{port:4342,strictPort:true}});
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='webkit'?{}:{channel:'msedge'})});
const url='https://example.org/official',term='某游戏';
const report=[];fs.mkdirSync('test-results/background-ui',{recursive:true});
try{for(const width of [1280,390,320]){
 const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],requests=[];
 let searches=0,reads=0,delay=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('liuyao_deepseek_api_key','test-only'));
 await page.route('https://api.deepseek.com/**',async route=>{
  const body=route.request().postDataJSON();
  if(route.request().url().includes('/anthropic/')){
   searches++;assert.equal(body.tools[0].max_uses,1);assert(!JSON.stringify(body).includes('如何安排'));
   if(delay)await new Promise(r=>setTimeout(r,800));
   await route.fulfill({contentType:'application/json',body:JSON.stringify({stop_reason:'end_turn',content:[{type:'web_search_tool_result',content:[{type:'web_search_result',title:'官方限时模式公告',url}]}],usage:{input_tokens:200,output_tokens:20,server_tool_use:{web_search_requests:1}}})});return;
  }
  const input=JSON.parse(body.messages[1].content);requests.push(input);
  const response={schema_version:SELECTION_VERSION,context_id:input.context_id,answer:"模拟解读，仅作一般建议。",direction:"unclear",main_choice:{basis_id:"none",reason:"一般建议不作取用。"},factors:[{basis_id:"l1",assessment:"neutral",interpretation:"只展示依据，不推测现实结果。"}],background_usage:input.sources.map(s=>({source_id:s.id,state:"not_applicable",note:"限时玩法不能用于主游戏。"})),timing_candidates:[],uncertainties:["实际条件未知。"]};
  await route.fulfill({contentType:'text/event-stream',body:`data: ${JSON.stringify({choices:[{delta:{content:JSON.stringify(response)},finish_reason:'stop'}],usage:{prompt_tokens:30,completion_tokens:20}})}\n\ndata: [DONE]\n\n`});
 });
 await page.route('https://r.jina.ai/**',async route=>{
  reads++;assert.equal(route.request().headers()['x-api-key'],undefined);assert.equal(route.request().headers().authorization,undefined);
  await route.fulfill({contentType:'application/json',body:JSON.stringify({code:200,data:{url,content:'仅限娱乐活动，不代表主游戏。\n\n## 限时玩法：某游戏·迷你模式\n\n仅此模式采用卡牌。<img src=x>\n\n## 无关章节\n其他'}})});
 });
 await page.goto(server.resolvedUrls.local[0]);
 if(await page.locator('#onboardCloseBtn').isVisible())await page.locator('#onboardCloseBtn').click();
 await page.locator('[data-tab="caster"]').click();await page.locator('[data-mode="manual"]').click();
 for(let i=0;i<6;i++)await page.locator(`#manualLine${i}`).selectOption(i===0?'6':'8');
 await page.locator('#manualCastBtn').click();await page.locator('[data-tab="ai"]').click();
 await page.locator('#questionInput').fill('如何安排游戏练习？');await page.locator('#readingMode').selectOption('structured');
 await page.locator('#backgroundCheck > summary').click();
 assert(!(await page.locator('#backgroundConfirmLabel').isVisible()));
 await page.evaluate(()=>localStorage.setItem('liuyao_deepseek_api_key','test-only'));
 await page.locator('#backgroundSubject').fill(term);await page.locator('#backgroundSearchBtn').click();
 await page.locator('#backgroundConfirmLabel').waitFor();
 assert.equal(searches,1);assert.equal(reads,1);assert.equal(await page.locator('#backgroundSources img').count(),0);
 // Unconfirmed search stays out of the exported prompt.
 await page.locator('#promptBtn').click();
 const extract=text=>JSON.parse(text.split('【卦盘、问题与历史数据】\n')[1].split('\n\n请返回完整')[0]);
 assert.equal(extract(await page.locator('#readingPrompt').inputValue()).sources.length,0);
 await page.locator('#backgroundConfirm').check();await page.locator('#promptBtn').click();
 await page.waitForFunction(()=>document.getElementById('readingPrompt').value.includes('"s1"'));
 const input=extract(await page.locator('#readingPrompt').inputValue());
 assert(input.sources[0].excerpt.includes('不代表主游戏'));
 assert(!input.bases.some(e=>e.id.startsWith('web:')));
 await page.locator('#backgroundSources details').evaluate(n=>n.open=true);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.locator('#backgroundCheck').screenshot({path:`test-results/background-ui/${engine}-${width}.png`});
 // Editing the question invalidates approval; explicit reapproval binds the new question.
 await page.locator('#questionInput').fill('如何安排新的游戏练习？');assert(!(await page.locator('#backgroundConfirm').isChecked()));
 await page.locator('#backgroundConfirm').check();await page.locator('#interpretBtn').click();
 await page.locator('#confirmCancelBtn').click();
 await page.locator('#readingTurns h2').waitFor();assert.equal(requests.length,1);assert(requests[0].sources.length===1);
 assert.equal(await page.locator('#readingTurns .background-result').count(),1);
 const history=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('history')).map(k=>localStorage.getItem(k)).join(''));
 assert(history.includes('https://example.org/official'));
 await page.reload();assert.equal(await page.locator('#questionInput').inputValue(),'');assert.equal(await page.locator('#backgroundSubject').inputValue(),'');
 assert(!(await page.locator('#backgroundConfirm').isChecked()));assert.equal(await page.locator('#backgroundSources').textContent(),'');
 // Aborted late requests must not resurrect sources or auto-retry.
 await page.locator('[data-tab="ai"]').click();await page.locator('#readingMode').selectOption('structured');
 await page.locator('#backgroundCheck').evaluate(n=>n.open=true);await page.locator('#backgroundSubject').fill(term);
 delay=true;await page.locator('#backgroundSearchBtn').click();await page.locator('#backgroundClear').click();
 await page.waitForFunction(()=>!document.getElementById('backgroundSearchBtn').disabled);
 assert.equal(await page.locator('#backgroundSources').textContent(),'');assert(!(await page.locator('#backgroundConfirmLabel').isVisible()));
 assert.equal(searches,2);assert.equal(reads,1);assert.deepEqual(errors,[]);
 report.push({engine,width,searches,reads,readingCalls:requests.length,passed:true});await context.close();
}}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
fs.writeFileSync(`test-results/background-ui/${engine}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));

