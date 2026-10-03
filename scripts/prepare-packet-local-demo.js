import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {planHash} from '../experiments/judgment-review/plan.js';
import {buildOutputContext} from '../src/ai/output/context.js';
import {createPacketLocalContext,packetLocalView,validatePacketLocalAnswer,PACKET_LOCAL_VERSION} from '../experiments/judgment-review/packet-led-local.js';
import {renderPacketLocalPreview} from '../experiments/judgment-review/packet-led-local-view.js';
export async function preparePacketLocalDemo(directory){
  if(fs.existsSync(directory))throw Error('New directory required');
  const input=JSON.parse(fs.readFileSync('docs/acceptance/packet-led-20261003/plan.json','utf8')).cases[0].canonical;
  const context=await createPacketLocalContext(await buildOutputContext(input,{includeMissingRecords:true}));
  const answer={schema_version:PACKET_LOCAL_VERSION,context_id:context.context_id,task:'trend',
    conclusion:{direction:'unclear',answer:'目前没有确认适合私人相册的取法，不能据这些事实判断能否成册。'},focus:[],
    tradeoff_reason:'盘面记录与实际筛选进度是两回事；此手工样例只展示依据和解释如何分开。',
    factors:[{id:'f1',priority:'background',effect:'conditional',packet_ids:['role:primary:3'],basis_ids:['fact:/lines/2/relative'],
      question_relevance:'若用此类角色观察整理过程的约束，需先确认这种取象适用于私人相册；目前不能确定其现实作用。',
      assumption:'取象仅为待核对假设。',limitation:'不能确认筛选方法、投入时间或完成结果。'}],
    general_advice:['可以先试选一小组照片，观察整理是否顺手。'],uncertainties:['此处所有解释均为手工开发文字，不是模型回复。']};
  const missing=structuredClone(answer);missing.factors[0].basis_ids.push('fact:/lines/3/relative');
  let rejection;try{validatePacketLocalAnswer(missing,context);throw Error('Expected local rejection');}catch(e){rejection=e.message;if(rejection!=='Basis absent from selected packets')throw e;}
  const wrong=structuredClone(answer);wrong.factors[0].question_relevance='第4爻官鬼金旺，所以一定能够迅速成册。';wrong.general_advice=['必须每天筛选，否则一定无法成册。'];
  validatePacketLocalAnswer(wrong,context);
  const dom=new JSDOM('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>局部依据 · 离线预览</title></head><body><main><h1>依据与解释分开</h1><p>手工离线样例 · 已曝光开发盘 · 尚未接入正式网站</p><article></article></main></body></html>');
  try{
    const doc=dom.window.document,style=doc.createElement('style');style.textContent=':root{color-scheme:light dark}body{font:16px/1.7 system-ui,sans-serif;margin:0}main{max-width:760px;margin:auto;padding:24px}h1,h2{font-weight:600}section{margin:20px 0}details{margin:12px 0}summary{cursor:pointer;padding:8px 0}p{overflow-wrap:anywhere}';doc.head.append(style);
    renderPacketLocalPreview(doc.querySelector('article'),answer,context);
    const plan={version:PACKET_LOCAL_VERSION,synthetic:true,production:false,network_calls:0,source_kind:'exposed_first_development_case',source_input_hash:planHash(input),
      samples:[{id:'local-separated',answer,expected_semantic_status:'limited_demonstration_not_acceptance',view:packetLocalView(answer,context)},
        {id:'missing-local-basis',answer:missing,expected_mechanical_error:rejection},
        {id:'free-prose-counterexample',answer:wrong,mechanical_status:'accepted_membership_only',expected_semantic_status:'reject_unsupported_claim_and_necessity',view:packetLocalView(wrong,context)}]};
    fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(directory,'preview.html'),dom.serialize(),{flag:'wx'});
    return {plan_hash:planHash(plan),network_calls:0,provider_calls:0};
  }finally{dom.window.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(await preparePacketLocalDemo(process.argv[2])));
