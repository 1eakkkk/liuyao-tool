import { validateOutputAnswer } from './parse.js';

const assessment = { support: '支持因素', oppose: '不利因素', neutral: '中性因素', conditional: '条件因素' };
const component = { primary: '本爻', changed: '变爻', hidden: '伏神' };
const direction = { favorable: '偏有利', unfavorable: '偏不利', mixed: '利弊并存', unclear: '暂不明确' };
function evidenceText(entry) {
  if (entry.kind === 'program_fact') return `${entry.label}：${entry.value === null ? '未记载' : typeof entry.value === 'boolean' ? (entry.value ? '是' : '否') : String(entry.value)}`;
  const { from, to } = entry.result;
  const arrow = from && to ? `（第${from.line}爻${component[from.component]} → 第${to.line}爻${component[to.component]}）` : '';
  return `${entry.label}${arrow}`;
}

// All model text uses textContent. Never render model HTML, Markdown or links.
export function renderOutputResult(container, result, context) {
  const doc = container.ownerDocument;
  const node = (tag, text) => { const el = doc.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
  const fragment = doc.createDocumentFragment();
  if (result.status !== 'validated') {
    fragment.append(node('p', '回复未完成或未通过格式与引用检查，保留原文供查看。'), node('pre', result.display_text));
  } else {
    validateOutputAnswer(result.answer, context);
    const answer = result.answer;
    fragment.append(node('h2', '解读结论'), node('p', answer.answer));
    fragment.append(node('p', `判断倾向：${direction[answer.direction]} · 属于 AI 推论`));
    const details = node('details');
    details.append(node('summary', '查看依据、应期候选与不确定性'));
    details.append(node('p', '已核对格式与引用；这些检查不能证明解读或预测正确。'));
    const registry = new Map(context.evidence.map(e => [e.id, e]));
    const item = (title, text, ids) => {
      const section = node('section'); section.append(node('h3', title), node('p', text));
      if (ids?.length) {
        const ul = node('ul');
        for (const id of ids) ul.append(node('li', evidenceText(registry.get(id))));
        section.append(ul);
      }
      details.append(section);
    };
    for (const factor of answer.factors) item(assessment[factor.assessment], factor.interpretation, factor.evidence_ids);
    for (const candidate of answer.yongshen_candidates) item(`用神候选：${candidate.relative}`,
      `${candidate.targets.map(t => `第${t.line}爻${component[t.component]}`).join('、')}。${candidate.reason}`, candidate.evidence_ids);
    for (const timing of answer.timing_candidates) item(`应期候选：${timing.candidate}`, timing.reason, timing.evidence_ids);
    if (!answer.timing_candidates.length) item('应期候选', '本次未给出可用候选。');
    item('不确定性', answer.uncertainties.join('\n'));
    fragment.append(details);
  }
  container.replaceChildren(fragment);
}
