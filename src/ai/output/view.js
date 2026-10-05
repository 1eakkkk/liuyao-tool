import { validateOutputAnswer } from './parse.js';
import { collectEvidencePresentation } from './evidence-presentation.js';
import {renderBackgroundSources} from './background-view.js';

const assessment = { support: '支持因素', oppose: '不利因素', neutral: '中性因素', conditional: '条件因素' };
const component = { primary: '本爻', changed: '变爻', hidden: '伏神' };
const direction = { favorable: '偏有利', unfavorable: '偏不利', mixed: '利弊并存', unclear: '暂不明确' };
let conclusionId = 0;
export function outputIssueText(result) {
  const code=result.issues?.[0]?.code;
  return ({
    incomplete_response:'回复尚未完整结束，可能被停止或截断。请取得完整回复后再检查。',
    response_too_large:'回复过长，超过本站可检查的范围。请缩短后重新提交。',
    invalid_json:'回复格式无法读取。请贴回完整 JSON，去掉外层代码围栏和额外说明。',
    duplicate_field:'回复中存在重复字段，内容有歧义。请让 AI 重新整理，每个字段只保留一次。',
    context_mismatch:'这份回复与当前卦盘或问答轮次不匹配。请使用本轮提示词取得对应回复。',
    unknown_evidence:'回复引用了本卦证据目录中不存在的条目，暂不能核对依据。',
    model_fact_restatement:'AI 重新陈述了应由程序展示的卦盘属性，请按本轮提示词只选择依据并解释。',
    duplicate_basis:'回复重复使用了同一依据，请合并后重新检查。',
    missing_main_choice:'趋势判断缺少主要取用，需要补充或改为依据不足。',
    fact_only_scope:'事实核对中加入了趋势判断，请仅保留所问事实。',
    unexpected_timing:'当前问题未询问时间，请移除额外的应期预测。',
    missing_background_review:'有背景来源未说明适用范围，需要逐条核对。',
    duplicate_background_source:'同一背景来源重复标注，请合并。',
    background_scope_mismatch:'限时或迷你玩法资料不能用于当前主游戏，请标注不适用。',
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
  const location = entry.target ? `第${entry.target.line}爻${component[entry.target.component]} · ` : '';
  return `${location}${entry.result.label}${arrow}`;
}

// All model text uses textContent. Never render model HTML, Markdown or links.
export function renderOutputResult(container, result, context, { collapseFallback = false } = {}) {
  const doc = container.ownerDocument;
  const node = (tag, text) => { const el = doc.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
  const fragment = doc.createDocumentFragment();
  if(context.input.background_search){const background=node('details');background.className='background-result';background.append(node('summary','查看本轮公开背景与来源'));const body=node('div');renderBackgroundSources(body,context.input.background_search);background.append(body);fragment.append(background);}
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
    const conclusion = node('p', answer.answer); conclusion.className = 'reading-conclusion';
    fragment.append(node('h2', '解读结论'), conclusion);
    const characters = [...answer.answer];
    if (characters.length > 400) {
      const preview = characters.slice(0, 240).join('') + '…';
      conclusion.textContent = preview; conclusion.id = `reading-conclusion-${++conclusionId}`;
      const toggle = node('button', '展开完整结论'); toggle.type = 'button'; toggle.className = 'reading-text-toggle';
      toggle.setAttribute('aria-controls', conclusion.id); toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        conclusion.textContent = open ? answer.answer : preview;
        toggle.setAttribute('aria-expanded', String(open)); toggle.textContent = open ? '收起完整结论' : '展开完整结论';
      });
      fragment.append(toggle);
    }
    fragment.append(node('p', `判断倾向：${direction[answer.direction]} · 属于 AI 推论`));
    const overview = node('div'); overview.className = 'reading-factor-overview';
    overview.append(node('h3', '依据速览'));
    const caption = node('p', answer.factors.length > 3
      ? `AI 解释 · 按回复顺序显示前 3 项，共 ${answer.factors.length} 项；完整分析见下方`
      : 'AI 解释 · 按回复顺序显示');
    caption.className = 'reading-overview-caption'; overview.append(caption);
    const previews = node('ol'); previews.className = 'reading-factor-previews';
    for (const factor of answer.factors.slice(0, 3)) {
      const row = node('li');
      const label = node('strong', assessment[factor.assessment]);
      label.className = 'reading-factor-label';
      const explanation = node('p', factor.interpretation);
      explanation.className = 'reading-factor-excerpt';
      row.append(label, explanation);
      const text = [...factor.interpretation];
      if (text.length > 180) {
        const preview = text.slice(0, 160).join('') + '…';
        explanation.textContent = preview; explanation.id = `reading-factor-${++conclusionId}`;
        const toggle = node('button', '展开这条解释');
        toggle.type = 'button'; toggle.className = 'reading-text-toggle';
        toggle.setAttribute('aria-controls', explanation.id); toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', () => {
          const open = toggle.getAttribute('aria-expanded') !== 'true';
          explanation.textContent = open ? factor.interpretation : preview;
          toggle.setAttribute('aria-expanded', String(open));
          toggle.textContent = open ? '收起这条解释' : '展开这条解释';
        });
        row.append(toggle);
      }
      previews.append(row);
    }
    overview.append(previews); fragment.append(overview);
    const details = node('details');
    details.append(node('summary', answer.timing_candidates.length ? '查看完整分析、来源、应期与不确定性' : '查看完整分析、来源与不确定性'));
    details.append(node('p', '下列解释由 AI 生成；格式与引用核对不能证明判断正确。规则和其来源事实不重复计为依据。'));
    const item = (title, text, ids) => {
      const section = node('section'); section.append(node('h3', title), node('p', text));
      if (ids?.length) {
        const presentation = collectEvidencePresentation(context.evidence, ids);
        const facts = node('ol'); facts.className = 'reading-evidence-sources';
        for (const fact of presentation.facts) {
          const li = node('li'); li.append(node('strong', '程序事实：'), doc.createTextNode(evidenceText(fact.entry)));
          facts.append(li);
        }
        section.append(facts);
        if (presentation.rules.length) {
          const rules = node('ul'); rules.className = 'reading-evidence-rules';
          for (const rule of presentation.rules) {
            const li = node('li'); li.append(node('strong', '规则标注：'), doc.createTextNode(evidenceText(rule.entry)),
              node('p', `来源：${rule.sourceNumbers.map(n => `事实 ${n}`).join('、')}（见上方列表）`));
            rules.append(li);
          }
          section.append(rules);
        }
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
