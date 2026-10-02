// Prepare a local synthetic preview. No network, credentials, payment or deployment.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {prepareJudgmentPlan,planHash} from '../experiments/judgment-review/plan.js';
import {buildOutputContext} from '../src/ai/output/context.js';
import {createEvidenceLedContext,EVIDENCE_LED_VERSION,evidenceLedMessages} from '../experiments/judgment-review/evidence-led.js';
import {renderEvidenceLedPreview} from '../experiments/judgment-review/evidence-led-view.js';
export function evidenceLedSynthetic(context){
  return {schema_version:EVIDENCE_LED_VERSION,context_id:context.context_id,
    summary:'这是程序编写的离线展示样例，不是解卦结果。程序事实可以核对，但不能仅凭这些事实确认现实结果；本例不作趋势判断。',
    decision:{task:context.task,direction:'unclear',focus:[],major_factor_ids:[],counter_factor_ids:[],
      tradeoff_reason:'本例只展示引用组织，没有建立取用或解释支持，不能凭因素数量决定吉凶。'},
    factors:[{id:'f1',effect:'neutral',evidence_ids:['fact:/lines/0/relative'],
      interpretation:'本项只演示如何查看第一爻的程序记录，不从六亲推断项目表现、竞争状态或他人意愿。',
      assumption:'没有采用具体传统取象。',limitation:'单个程序属性不能确认现实事件。'}],
    general_advice:[],uncertainties:['样例是手工编写，不表示模型会遵守新协议，也没有预测结果反馈。']};
}
export async function prepareEvidenceLedDemo(directory){
  const source=await prepareJudgmentPlan(),cases=[];
  const dom=new JSDOM('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>引用事实与解释 · 离线设计样例</title></head><body><main><h1>引用事实与解释</h1><p>两条已曝光开发案例，全部展示文字为手工样例；未请求 AI，未接入正式网站。</p></main></body></html>');
  const doc=dom.window.document,style=doc.createElement('style');
  style.textContent=':root{color-scheme:light dark}body{font:16px/1.7 system-ui,sans-serif;margin:0}main{max-width:760px;margin:auto;padding:24px}article{padding:24px 0;border-top:1px solid #87958b}h1,h2{font-weight:600}details{margin:12px 0}summary{cursor:pointer;padding:8px 0}p{overflow-wrap:anywhere}section{margin:20px 0}';doc.head.append(style);
  try{for(const c of source.cases){
    const context=await createEvidenceLedContext(await buildOutputContext(c.canonical,{includeMissingRecords:true}),'trend');
    const answer=evidenceLedSynthetic(context),article=doc.createElement('article'),title=doc.createElement('h2'),container=doc.createElement('div');
    title.textContent=c.question;article.append(title,container);doc.querySelector('main').append(article);
    renderEvidenceLedPreview(container,answer,context);
    cases.push({id:c.id,context_id:context.context_id,messages:evidenceLedMessages(context),synthetic_answer:answer});
  }
    const plan={version:EVIDENCE_LED_VERSION,production:false,source_plan_hash:planHash(source),
      network_calls:0,budget_reserved:false,paid_executor_available:false,semantic_acceptance:'unassessed',
      blind:false,provenance:'Two exposed cases; hand-authored UI/protocol examples only, not model replies.',cases};
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory,'plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
    fs.writeFileSync(path.join(directory,'seal.json'),JSON.stringify({hash:planHash(plan)})+'\n',{flag:'wx'});
    fs.writeFileSync(path.join(directory,'preview.html'),dom.serialize(),{flag:'wx'});
    return {version:EVIDENCE_LED_VERSION,prepared_cases:cases.length,network_calls:0,plan_hash:planHash(plan)};
  }finally{dom.window.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  if(process.argv.length!==3)throw Error('Use prepare-evidence-led <new-local-directory>');
  console.log(JSON.stringify(await prepareEvidenceLedDemo(process.argv[2])));
}
