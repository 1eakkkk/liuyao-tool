import { validateOutputAnswer } from './parse.js';

const assessment = { support: '支持因素', oppose: '不利因素', neutral: '中性因素', conditional: '条件因素' };
const component = { primary: '本爻', changed: '变爻', hidden: '伏神' };
const direction = { favorable: '偏有利', unfavorable: '偏不利', mixed: '利弊并存', unclear: '暂不明确' };
export function outputIssueText(result) {
  const code=result.issues?.[0]?.code;
  return ({
    incomplete_response:'回复尚未完整结束，可能被停止或截断。请取得完整回复后再检查。',
    response_too_large:'回复过长，超过本站可检查的范围。请缩短后重新提交。',
    invalid_json:'回复格式无法读取。请贴回完整 JSON，去掉外层代码围栏和额外说明。',
    duplicate_field:'回复中存在重复字段，内容有歧义。请让 AI 重新整理，每个字段只保留一次。',
    context_mismatch:'这份回复与当前卦盘或问答轮次不匹配。请使用本轮提示词取得对应回复。',
    unknown_evidence:'回复引用了本卦证据目录中不存在的条目，暂不能核对依据。',
    target_relative_mismatch:'用神候选与程序记录的爻位、六亲不一致，暂不能作为有效候选。',
    missing_target_evidence:'用神候选缺少对应爻的六亲引用，需要补齐直接依据。',
    motion_fact_conflict:'回复中明确的动静表述与程序卦盘不一致。请以排盘为准，这份解读需要重新核对。',
    missing_field:'回复缺少必需内容，请让 AI 按本轮提示词补齐完整回复。',
    unknown_field:'回复增加了协议之外的字段，请让 AI 按本轮提示词重新整理格式。',
    version_mismatch:'回复使用的格式版本与当前提示词不一致，请使用本轮提示词。',
    invalid_enum:'回复使用了不支持的选项值，需要按提示词规定的选项重新整理。',
    invalid_type:'回复字段的格式不正确，需要按提示词规定的格式重新整理。',
    invalid_length:'回复中的文字为空或超出长度限制，需要补齐或缩短。',
    invalid_count:'回复条目数量不符合要求，需要按提示词规定的数量重新整理。',
    duplicate_item:'回复包含重复条目，需要去重后重新检查。'
  })[code] || '回复未通过格式与引用检查，请核对是否贴回了本轮完整回复。';
}
export function evidenceText(entry) {
  if (entry.kind === 'program_fact') return `${entry.label}：${entry.value === null ? '未记载' : typeof entry.value === 'boolean' ? (entry.value ? '是' : '否') : String(entry.value)}`;
  const { from, to } = entry.result;
  const arrow = from && to ? `（第${from.line}爻${component[from.component]} → 第${to.line}爻${component[to.component]}）` : '';
  return `${entry.label}${arrow}`;
}

// All model text uses textContent. Never render model HTML, Markdown or links.
export function renderOutputResult(container, result, context, { collapseFallback = false } = {}) {
  const doc = container.ownerDocument;
  const node = (tag, text) => { const el = doc.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
  const fragment = doc.createDocumentFragment();
  if (result.status !== 'validated') {
    fragment.append(node('p', '回复未完成或未通过格式与引用检查，保留原文供查看。'));
    const explanation=node('p',outputIssueText(result)); explanation.className='reading-issue'; fragment.append(explanation);
    const raw = node('pre', result.display_text);
    if (collapseFallback) {
      const details = node('details'); details.append(node('summary', '查看未通过检查的原始回复'), raw); fragment.append(details);
    } else fragment.append(raw);
  } else {
    validateOutputAnswer(result.answer, context);
    const answer = result.answer;
    fragment.append(node('h2', '解读结论'), node('p', answer.answer));
    fragment.append(node('p', `判断倾向：${direction[answer.direction]} · 属于 AI 推论`));
    const details = node('details');
    details.append(node('summary', answer.timing_candidates.length ? '查看依据、应期候选与不确定性' : '查看依据与不确定性'));
    details.append(node('p', '下列解释由 AI 生成；程序仅核对格式和引用，不能证明判断正确。'));
    const registry = new Map(context.evidence.map(e => [e.id, e]));
    const item = (title, text, ids) => {
      const section = node('section'); section.append(node('h3', title), node('p', text));
      if (ids?.length) {
        const ul = node('ul');
        for (const id of ids) {
          const entry=registry.get(id), li=node('li');
          li.append(node('strong',entry.kind==='program_fact'?'程序事实：':'规则标注：'),doc.createTextNode(evidenceText(entry)));
          if(entry.kind==='rule_result') {
            const sources=node('ul'); sources.className='reading-evidence-sources';
            for(const factId of [...new Set(entry.source_facts)]) sources.append(node('li',evidenceText(registry.get(factId))));
            const provenance=node('details');
            provenance.append(node('summary',`查看来源事实（${new Set(entry.source_facts).size}）`),sources);
            li.append(provenance);
          }
          ul.append(li);
        }
        section.append(ul);
      }
      details.append(section);
    };
    for (const factor of answer.factors) item(assessment[factor.assessment], factor.interpretation, factor.evidence_ids);
    for (const candidate of answer.yongshen_candidates) item(`用神候选：${candidate.relative}`,
      `${candidate.targets.map(t => `第${t.line}爻${component[t.component]}`).join('、')}。${candidate.reason}`, candidate.evidence_ids);
    for (const timing of answer.timing_candidates) item(`应期候选：${timing.candidate}`, timing.reason, timing.evidence_ids);
    item('不确定性', answer.uncertainties.join('\n'));
    fragment.append(details);
  }
  container.replaceChildren(fragment);
}
