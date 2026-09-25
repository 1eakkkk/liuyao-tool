import { buildFactCheck, FACT_CHECK_TOPICS } from '../core/fact-check.js';

export function renderFactCheckPanel(container, canonical) {
  if (!container) return;
  container.replaceChildren(); container.hidden = !canonical;
  if (!canonical) return;
  const doc = container.ownerDocument;
  const node = (tag, text) => { const el = doc.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
  const outer = node('details'); outer.append(node('summary', '核对卦盘事实'));
  outer.append(node('p', '选择要核对的项目，由本页直接读取卦盘，不调用 AI，不消耗 API 额度。'));
  const label = node('label', '核对项目 '), select = node('select'); select.id = 'factCheckTopic';
  for (const [value, title] of Object.entries(FACT_CHECK_TOPICS)) { const option = node('option', title); option.value = value; select.append(option); }
  label.append(select); outer.append(label);
  const result = node('div'); result.id = 'factCheckResult'; result.setAttribute('aria-live', 'polite');
  const show = () => {
    result.replaceChildren();
    try {
      const answer = buildFactCheck(canonical, select.value);
      const text = node('p', answer.summary); text.className = 'fact-check-answer'; result.append(text);
      const details = node('details'); details.append(node('summary', '查看核对依据'));
      const list = node('ul');
      for (const e of answer.evidence) list.append(node('li', `${e.label}：${e.value}`));
      details.append(list); result.append(details, node('p', answer.scope));
    } catch (error) { result.append(node('p', `暂不能核对：${error.message}`)); }
  };
  select.addEventListener('change', show); outer.append(result); container.append(outer); show();
}
