import {packetLocalView} from './packet-led-local.js';
const directions={favorable:'偏有利',unfavorable:'偏不利',mixed:'利弊并存',unclear:'依据不足'};
export function renderPacketLocalPreview(container,answer,context){
  const v=packetLocalView(answer,context),doc=container.ownerDocument;
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const fragment=doc.createDocumentFragment();fragment.append(node('p','开发预览 · 内容尚未验收'),node('h2','直接回答'),node('p',v.summary),node('p',directions[v.direction]));
  for(const f of v.factors){
    const section=node('section');section.append(node('h3',`${f.priority==='primary'?'主要解释':f.priority==='counter'?'需权衡的解释':'背景解释'} · ${f.id}`),node('h4','问题对应解释'),node('p',f.question_interpretation.relevance));
    const details=node('details');details.append(node('summary','程序依据、假设与限制'));
    for(const fact of f.program_basis.facts)details.append(node('p',`${fact.rule_premise?'规则前提':fact.identity_background?'参与者身份背景':'所选程序事实'} · ${fact.text}`));
    for(const rule of f.program_basis.rules)details.append(node('p',`规则 · ${rule.text}；来源：${rule.source_ids.map(id=>f.program_basis.facts.find(f=>f.id===id).text).join('；')}`));
    details.append(node('p',`取象假设：${f.question_interpretation.assumption}`),node('p',`适用限制：${f.question_interpretation.limitation}`));
    section.append(details);fragment.append(section);
  }
  const limits=node('details');limits.append(node('summary','取舍与不确定性'),node('p',v.tradeoff_reason));
  for(const f of v.focus)limits.append(node('p',f.program_identity),node('p',f.role_hypothesis));
  v.uncertainties.forEach(t=>limits.append(node('p',t)));fragment.append(limits);
  if(v.general_advice.length){fragment.append(node('h3','现实建议'),node('p','一般操作建议，未作为卦盘依据。'));v.general_advice.forEach(t=>fragment.append(node('p',t)));}
  container.replaceChildren(fragment);return v;
}
