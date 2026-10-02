import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {prepareJudgmentPlan,planHash} from '../experiments/judgment-review/plan.js';
import {buildOutputContext} from '../src/ai/output/context.js';
import {createTaskLedContext,TASK_LED_VERSION,taskLedView} from '../experiments/judgment-review/task-led.js';
import {renderTaskLedPreview} from '../experiments/judgment-review/task-led-view.js';
export async function prepareTaskLedDemo(directory){
  if(fs.existsSync(directory))throw Error('New directory required');
  const canonical=(await prepareJudgmentPlan()).cases[0].canonical,source=await buildOutputContext(canonical,{includeMissingRecords:true});
  const dom=new JSDOM('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>任务分流 · 开发预览</title></head><body><main><h1>事实、建议、趋势</h1><p>沿用已曝光盘的手工展示样例；不是模型回复，不代表自然语言自动识别任务，也不是正式产品截图。</p></main></body></html>');
  const doc=dom.window.document,style=doc.createElement('style');style.textContent=':root{color-scheme:light dark}body{font:16px/1.75 system-ui,sans-serif;margin:0}main{max-width:760px;margin:auto;padding:24px}article{padding:20px 0;border-top:1px solid #7a8c83}h1,h2{font-weight:600}p,li{overflow-wrap:anywhere}ul,ol{padding-left:24px}details{margin:12px 0}summary{cursor:pointer;padding:8px 0}section{margin:20px 0}';doc.head.append(style);
  const cases=[];
  try{
    for(const task of ['facts','advice','trend']){
      const fact_ids=[...Array.from({length:6},(_,i)=>`fact:/lines/${i}/moving`),'fact:/hexagram/shi_line','fact:/hexagram/ying_line'];
      const context=await createTaskLedContext(source,task,task==='facts'?{fact_ids}:{});
      const answer=task==='facts'?null:task==='advice'?{schema_version:TASK_LED_VERSION,context_id:context.context_id,task,advice:['先明确自己的练习目标，再记录实际反馈。'],limits:['这是一般建议展示样例，未形成趋势判断。']}:
        {schema_version:TASK_LED_VERSION,context_id:context.context_id,task,conclusion:{direction:'unclear',answer:'本样例没有建立合理取法，不能确认目标能否完成。'},focus:[],major_factor_ids:[],counter_factor_ids:[],tradeoff_reason:'手工展示样例没有支持相关性或比较权重，不作取舍。',factors:[],general_advice:[],uncertainties:['真实模型仍可能越界，需要独立内容检查。']};
      const article=doc.createElement('article');renderTaskLedPreview(article,answer,context);doc.querySelector('main').append(article);
      cases.push({task,context_id:context.context_id,view:taskLedView(answer,context),synthetic_answer:answer});
    }
    const plan={version:TASK_LED_VERSION,synthetic:true,production:false,network_calls:0,automatic_task_classification:false,cases};
    fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(directory,'preview.html'),dom.serialize(),{flag:'wx'});
    return {plan_hash:planHash(plan),cases:3,network_calls:0};
  }finally{dom.window.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(await prepareTaskLedDemo(process.argv[2])));
