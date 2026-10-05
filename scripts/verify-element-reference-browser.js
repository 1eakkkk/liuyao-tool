import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright';
import {prepareJudgmentPlan} from '../experiments/judgment-review/plan.js';
const spec=(await prepareJudgmentPlan()).cases[0],reports=[];
const compact=process.argv.includes('--compact');
const server=await createServer({server:{host:'127.0.0.1',port:4353,strictPort:true}});await server.listen();
try{for(const engine of ['chromium','webkit']){
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
 try{
  const page=await browser.newPage(),errors=[];let paidRequests=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://api.deepseek.com/**',async route=>{paidRequests++;await route.abort();});
  await page.goto('http://127.0.0.1:4353/',{waitUntil:'networkidle'});
  const result=await page.evaluate(async({spec,compact})=>{
   const [{createReadingSession,readingExport},candidate,{readingRequestBody}]=await Promise.all([
    import('/src/ai/output/session.js'),compact?import('/experiments/reading-quality/compact-evidence-reading.js'):import('/experiments/reading-quality/relation-reading.js'),import('/src/ai/output/client.js')]);
   const prepare=compact?candidate.prepareCompactEvidenceTurn:candidate.prepareRelationReadingTurn;
   const prepared=await prepare(createReadingSession(spec.canonical),spec.question);
   const body=readingRequestBody(prepared),payload=JSON.parse(body.messages[1].content);
   return {reference:payload.element_reference,exportIncludesSame:readingExport(prepared).includes(body.messages[1].content),
    sourcesExist:[...payload.element_reference.to_shi,...payload.element_reference.returning].every(row=>row.source_fact_ids.every(id=>payload.evidence.some(e=>e.id===id)))};
  },{spec,compact});
  assert(result.exportIncludesSame);assert(result.sourcesExist);assert.equal(result.reference.to_shi[2].direction,'generates');
  assert.equal(result.reference.to_shi[4].direction,'generates');assert.equal(paidRequests,0);assert.deepEqual(errors,[]);
  reports.push({engine,compact,apiExportShared:true,sourcesExist:true,goldGeneratesWater:true,paidRequests,passed:true});
 }finally{await browser.close();}
}}finally{await server.close();}
fs.mkdirSync('test-results/element-reference',{recursive:true});fs.writeFileSync(`test-results/element-reference/${compact?'compact-browser':'browser'}.json`,JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
