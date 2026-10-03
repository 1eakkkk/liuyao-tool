import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {prepareJudgmentPlan,planHash} from '../experiments/judgment-review/plan.js';
import {buildOutputContext} from '../src/ai/output/context.js';
import {createPacketLedContext,packetLedView,PACKET_LED_VERSION} from '../experiments/judgment-review/packet-led.js';
import {renderPacketLedPreview} from '../experiments/judgment-review/packet-led-view.js';
export async function preparePacketLedDemo(directory){
  if(fs.existsSync(directory))throw Error('New directory required');
  const source=await buildOutputContext((await prepareJudgmentPlan()).cases[0].canonical,{includeMissingRecords:true}),context=await createPacketLedContext(source);
  const relation=context.packets.find(p=>p.kind==='relation'&&p.rule.id.includes('MONTH-STATE'));
  const answer={schema_version:PACKET_LED_VERSION,context_id:context.context_id,task:'trend',conclusion:{direction:'unclear',answer:'这是手工程序展示样例，没有建立与具体目标相关的合理取法，不能确认现实结果。'},
    focus:[],major_factor_ids:[],counter_factor_ids:[],tradeoff_reason:'样例只展示程序包的展开；取象和作用没有验收，不作优先判断。',
    factors:[{id:'f1',effect:'neutral',packet_ids:[relation.id],interpretation:'本项只演示规则前提与参与者身份的区别，不判断现实作用。',assumption:'没有认证取法。',limitation:'程序记录不能证明现实能力或结果。'}],general_advice:[],uncertainties:['这不是模型回复、盲测或正式产品截图。']};
  const dom=new JSDOM('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>程序引用包 · 开发预览</title></head><body><main><h1>程序引用包</h1><p>沿用已曝光的手工开发盘。模型只选包，来源由程序展开；此处文字全部手工编写。</p><article></article></main></body></html>');
  try{
    const doc=dom.window.document,style=doc.createElement('style');style.textContent=':root{color-scheme:light dark}body{font:16px/1.7 system-ui,sans-serif;margin:0}main{max-width:760px;margin:auto;padding:24px}h1,h2{font-weight:600}section{margin:20px 0}details{margin:12px 0}summary{cursor:pointer;padding:8px 0}p{overflow-wrap:anywhere}';doc.head.append(style);
    renderPacketLedPreview(doc.querySelector('article'),answer,context);
    const plan={version:PACKET_LED_VERSION,synthetic:true,production:false,network_calls:0,selected_packet_ids:answer.factors[0].packet_ids,view:packetLedView(answer,context)};
    fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(directory,'preview.html'),dom.serialize(),{flag:'wx'});
    return {plan_hash:planHash(plan),network_calls:0};
  }finally{dom.window.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(await preparePacketLedDemo(process.argv[2])));
