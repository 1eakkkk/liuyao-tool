import {taskLedView} from './task-led.js';
const directions={favorable:'偏有利',unfavorable:'偏不利',mixed:'利弊并存',unclear:'依据不足'};
export function renderTaskLedPreview(container,answer,context){
  const view=taskLedView(answer,context),doc=container.ownerDocument;
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const fragment=doc.createDocumentFragment();fragment.append(node('p','开发预览 · 尚未接入正式网站'));
  if(view.task==='facts'){
    fragment.append(node('h2','程序事实核对'),node('p','仅列所选记录，不调用 AI，也不解释吉凶。'));
    const list=node('ul');for(const f of view.facts)list.append(node('li',f.text));fragment.append(list);
  }else if(view.task==='advice'){
    fragment.append(node('h2','一般建议'));
    const list=node('ol');for(const text of view.advice)list.append(node('li',text));fragment.append(list);
    const details=node('details');details.append(node('summary','信息限制'));for(const text of view.limits)details.append(node('p',text));fragment.append(details);
  }else{
    fragment.append(node('h2','直接回答'),node('p',view.summary),node('p',directions[view.direction]));
    for(const f of view.factors){
      const section=node('section');section.append(node('h3',`${f.major?'主要解释':f.counter?'需权衡的解释':'补充解释'} · ${f.id}`),node('p',f.interpretation));
      const details=node('details');details.append(node('summary','程序依据与解释限制'));
      for(const e of f.source_facts)details.append(node('p',e.text));
      for(const r of f.rules)details.append(node('p',`${r.text}；来源：${r.source_ids.map(id=>f.source_facts.find(v=>v.id===id)?.text).join('；')}`));
      details.append(node('p',`取象假设：${f.assumption}`),node('p',`适用限制：${f.limitation}`));section.append(details);fragment.append(section);
    }
    const details=node('details');details.append(node('summary','取舍与不确定性'),node('p',view.tradeoff_reason));
    for(const f of view.focus)details.append(node('p',f.fact),node('p',f.role_hypothesis));
    for(const text of view.uncertainties)details.append(node('p',text));fragment.append(details);
    if(view.general_advice.length){fragment.append(node('h3','一般建议'));for(const a of view.general_advice)fragment.append(node('p',a.text));}
  }
  if(view.task!=='facts')fragment.append(node('p','结构检查不证明解释或预测正确。'));
  container.replaceChildren(fragment);return view;
}
