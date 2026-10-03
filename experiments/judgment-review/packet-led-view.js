import {packetLedView} from './packet-led.js';
const labels={favorable:'偏有利',unfavorable:'偏不利',mixed:'利弊并存',unclear:'依据不足'};
export function renderPacketLedPreview(container,answer,context){
  const v=packetLedView(answer,context),doc=container.ownerDocument;
  const node=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const fragment=doc.createDocumentFragment();fragment.append(node('p','开发预览 · 尚未接入正式网站'),node('h2','直接回答'),node('p',v.summary),node('p',labels[v.direction]));
  for(const f of v.factors){
    const section=node('section');section.append(node('h3',`${f.major?'主要解释':f.counter?'需权衡的解释':'补充解释'} · ${f.id}`),node('p',f.interpretation));
    const details=node('details');details.append(node('summary','程序依据与解释限制'));
    for(const e of f.facts)details.append(node('p',`${e.rule_premise?'含规则前提':'记录背景'} · ${e.text}`));
    for(const r of f.rules)details.append(node('p',`规则 · ${r.text}；实际来源：${r.source_ids.map(id=>f.facts.find(e=>e.id===id)?.text).join('；')}`));
    details.append(node('p',`取象假设：${f.assumption}`),node('p',`適用限制：${f.limitation}`),node('p','身份背景不自动成为规则前提；重复事实不重复计权。'));section.append(details);fragment.append(section);
  }
  const details=node('details');details.append(node('summary','取舍与不确定性'),node('p',v.tradeoff_reason));
  for(const f of v.focus)details.append(node('p',f.fact),node('p',f.role_hypothesis));for(const text of v.uncertainties)details.append(node('p',text));fragment.append(details);
  if(v.general_advice.length){fragment.append(node('h3','一般建议'));for(const text of v.general_advice)fragment.append(node('p',text));}
  fragment.append(node('p','程序核对记录与引用关系；解释支持和预测效果仍需另行检验。'));container.replaceChildren(fragment);return v;
}
