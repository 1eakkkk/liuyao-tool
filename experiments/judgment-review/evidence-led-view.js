// Offline preview renderer only. Model text never becomes HTML.
import {evidenceLedView} from './evidence-led.js';
const directions={favorable:'偏有利',unfavorable:'偏不利',mixed:'利弊并存',unclear:'依据不足／本次不作趋势判断'};
const effects={support:'支持',oppose:'阻碍',neutral:'事实核对',conditional:'条件解释'};
export function renderEvidenceLedPreview(container,answer,context){
  const v=evidenceLedView(answer,context),doc=container.ownerDocument;
  const n=(tag,text)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const fragment=doc.createDocumentFragment();
  fragment.append(n('p','离线设计样例 · 非真实模型回答'),n('h2','直接回答'),n('p',v.summary),n('p',directions[v.direction]));
  for(const f of v.factors){
    const section=n('section');section.append(n('h3',`${f.major?'主要依据':f.counter?'需权衡的依据':'补充依据'} · ${effects[f.effect]}`),n('p',f.interpretation));
    const details=n('details');details.append(n('summary','查看程序依据与解释限制'));
    f.source_facts.forEach((e,i)=>details.append(n('p',`事实 ${i+1} · ${e.text}`)));
    for(const r of f.rules)details.append(n('p',`规则标注 · ${r.text}；来源：${r.source_ids.map(id=>`事实 ${f.source_facts.findIndex(e=>e.id===id)+1}`).join('、')}`));
    details.append(n('p',`解释假设：${f.assumption}`),n('p',`适用限制：${f.limitation}`));
    details.append(n('p','规则与来源事实是同一依据的不同表示，不重复计权重。'));
    section.append(details);fragment.append(section);
  }
  const decision=n('details');decision.append(n('summary','取用、主次与不确定性'),n('p',v.tradeoff_reason));
  for(const f of v.focus)decision.append(n('p',f.fact),n('p',`主要取用假设：${f.role_hypothesis}`));
  for(const text of v.uncertainties)decision.append(n('p',text));fragment.append(decision);
  if(v.general_advice.length){fragment.append(n('h3','一般建议'));for(const a of v.general_advice)fragment.append(n('p',a.text));}
  fragment.append(n('p','仅核对结构与引用关系；解释支持和预测效果未验收。'));
  container.replaceChildren(fragment);
}
