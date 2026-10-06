import { validateOutputAnswer } from './parse.js';
import { collectEvidencePresentation } from './evidence-presentation.js';
import {renderBackgroundSources} from './background-view.js';
import {readingAvailability} from './availability.js';

const assessment = { support: '支持因素', oppose: '不利因素', neutral: '中性因素', conditional: '条件因素' };
const component = { primary: '本爻', changed: '变爻', hidden: '伏神' };
const direction = { favorable: '偏有利', unfavorable: '偏不利', mixed: '利弊并存', unclear: '暂不明确' };
let conclusionId = 0;
const transportCodes=new Set(['incomplete_response','response_token_limit','response_filtered','provider_interrupted','stream_not_finished',
 'stream_missing_finish_reason','unexpected_finish_reason','request_timeout','aborted','sse_invalid_utf8','sse_invalid_chunk','sse_malformed_event',
 'sse_after_done','sse_conflicting_finish_reason','sse_event_too_large','sse_stream_too_large','sse_stream_error',
 'strict_invalid_envelope','strict_unexpected_text','strict_tool_count','strict_tool_identity','strict_invalid_arguments','strict_invalid_json','strict_response_too_large','strict_read_error']);
export function outputFailureSummary(result){
 const code=result.issues?.[0]?.code;
 if(transportCodes.has(code))return '解读未完整接收，已保留收到的原文。';
 if(code==='invalid_json')return '回复无法作为完整 JSON 读取，已保留原文。';
 if(code==='context_mismatch')return '回复与当前问答不匹配，已保留原文。';
 return '回复未通过字段、引用或内容约束检查，已保留原文。';
}
export function outputIssueText(result) {
  const code=result.issues?.[0]?.code;
  const message=({
    strict_invalid_envelope:'接口返回的数据包不完整或不符合约定，未将其当作有效解读。',
    strict_unexpected_text:'接口同时返回了额外正文，未将两份回答混合成解读。',
    strict_tool_count:'接口没有返回唯一的一份解读数据，本站未执行任何工具动作。',
    strict_tool_identity:'接口返回的数据身份不匹配，未接受为本轮解读。',
    strict_invalid_arguments:'接口的解读数据类型不正确，已保留原文。',
    strict_invalid_json:'接口数据包无法作为完整 JSON 读取，已保留收到的原文。',
    strict_response_too_large:'接口数据包超过接收上限，本次未完整读取。',
    strict_read_error:'接收接口数据包时发生中断或编码异常，已保留收到的内容。',
    response_token_limit:'回复达到输出上限而截断，没有取得完整 JSON。可缩短篇幅后手动重新生成；本站不会自动重试。',
    response_filtered:'接口提前停止了这次回复，没有返回完整解读。',
    provider_interrupted:'接口因服务资源不足提前结束，未取得完整解读。',
    stream_not_finished:'连接结束前没有收到完整结束标记，可能发生断流，未将部分回复当作完整解读。',
    stream_missing_finish_reason:'接口未说明回复是否正常完成，暂不能将收到的文本视为完整解读。',
    unexpected_finish_reason:'接口没有以正常文本回复结束，本次不能作为完整解读。',
    request_timeout:'等待解读超时，已停止本次请求；这不是 JSON 字段格式错误。',
    aborted:'本次生成被停止，尚未取得完整回复。',
    sse_stream_error:'接收回复时连接中断，已保留中断前收到的文本。',
    sse_malformed_event:'接口返回的流数据无法读取，尚未取得完整回复；这不是解读字段不匹配。',
    sse_invalid_utf8:'收到的流数据存在编码错误，无法完整读取。',
    sse_invalid_chunk:'收到的流数据类型异常，无法完整读取。',
    sse_after_done:'接口结束标记之后仍返回了数据，本次流状态异常。',
    sse_conflicting_finish_reason:'接口返回了相互冲突的结束状态，本次不能确认完整性。',
    sse_event_too_large:'单段接口流数据超出接收限制，本次未完整读取。',
    sse_stream_too_large:'接口流数据超出总接收限制，本次未完整读取。',
    incomplete_response:'回复尚未完整结束，可能被停止或截断。请取得完整回复后再检查。',
    response_too_large:'回复过长，超过本站可检查的范围。请缩短后重新提交。',
    invalid_json:'回复格式无法读取。请贴回完整 JSON，去掉外层代码围栏和额外说明。',
    duplicate_field:'回复中存在重复字段，内容有歧义。请让 AI 重新整理，每个字段只保留一次。',
    context_mismatch:'这份回复与当前卦盘或问答轮次不匹配。请使用本轮提示词取得对应回复。',
    unknown_evidence:'回复引用了本卦证据目录中不存在的条目，暂不能核对依据。',
    model_fact_restatement:'AI 重新陈述了应由程序展示的卦盘属性，请按本轮提示词只选择依据并解释。',
    duplicate_basis:'回复重复使用了同一依据，请合并后重新检查。',
    unrequested_prediction_window:'当前问题未询问预测时间，回复却增加了预测窗口，请删除额外时间判断。',
    reported_premise_erased:'回复抹掉了用户已提供的部署描述。请区分用户陈述与尚未核实的可访问性、运行状态。',
    unbacked_reality_assertion:'回复中出现了未说明来源的现实断言。卦盘不能证明项目阶段、运行状态或实际助力，请核对来源或保留未知。',
    unbacked_reality_quote:'回复引用的现实描述不在本轮问题或可用资料原文中，请核对完整原话，不用引号包装推断。',
    role_perspective_mismatch:'观察角度与程序位置不对应，不能把其他位置当作自身或对应方，请按目录核对。',
    unresolved_factor_application:'回复列入了尚未建立目标关联的因素。本站未将它参与判断，也不会删项后自动改判；请说明关联缺口或按本轮协议重新生成。',
    unconfirmed_effect_as_decisive:'回复把尚未确认的作用条件当成了明确支持或阻碍，本站已保留原文，未自动改判。',
    effect_condition_source_mismatch:'回复声称某项条件来自你的描述，但未提供当前问题中的对应原句。本站未将其视为已提供的条件。',
    missing_effect_conditions:'回复声称作用依赖现实条件，却没有列出条件，已保留原文。',
    unexpected_effect_conditions:'回复声明只作象意推论，同时又列入现实前提，作用范围不一致。',
    unexpected_effect_source:'待核条件附带了用户来源，来源身份不一致，已保留原文。',
    unreviewed_mapping:'回复使用了未核对适用范围的取法，本站未将其参与判断。',
    mapping_scope_mismatch:'回复的对象或依据不符合这项取法已核对的适用范围，已保留原文。',
    mapping_effect_overreach:'这项取法只用于条件性观察，不能单独作为明确支持或阻碍。',
    rule_subject_mismatch:'规则与所解释的对象位置不对应，请核对关联对象及其与问题的关系。',
    omitted_decisive_factor:'取舍遗漏了本轮已列出的支持或阻碍，请一并说明主次。',
    missing_role_tradeoff:'同一对象被解释为支持与阻碍，但缺少条件、机制和取舍说明。',
    duplicate_role_tradeoff:'同一对象的双重作用说明重复，请合并。',
    unmatched_role_tradeoff:'双重作用说明未对应本轮同时有支持与阻碍的对象。',
    unselected_judgment_basis:'取舍引用了本轮未列出的因素，请先完整说明该依据。',
    missing_judgment_basis:'判断倾向缺少参与取舍的因素，请说明依据或保留不明确。',
    judgment_basis_mismatch:'参与最终取舍的因素不能支持所填倾向，请重新核对主次，不要只换标签。',
    formal_relation_effect_overreach:'所选依据只提供基础五行方向，尚未核对有效作用，不能直接标为支持或不利。请重新核对论证，不要只换编号或标签来通过检查。',
    direction_basis_mismatch:'判断倾向与所列因素标签不一致。请重新核对作用与取舍，不要只改标签来通过检查；依据不足时应明确说明。',
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
  const path=result.issues?.[0]?.path;
  return typeof path==='string'&&path!=='$'?`${message} 出错位置：${path.replace(/^\$\./,'')}`:message;
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
    fragment.append(node('p', outputFailureSummary(result)));
    const explanation=node('p',outputIssueText(result)); explanation.className='reading-issue'; fragment.append(explanation);
    const raw = node('pre', result.display_text);
    if (collapseFallback) {
      const details = node('details'); details.append(node('summary', '查看未通过检查的原始回复'), raw); fragment.append(details);
    } else fragment.append(raw);
  } else {
    validateOutputAnswer(result.answer, context);
    const answer = result.answer;
    const capability=readingAvailability(context);
    if(capability.blocked&&answer.factors.length===0){
      fragment.append(node('h2','模式支持范围'),node('p',capability.message),node('p','这是程序对模式能力的说明，不是 AI 对事情结果的判断。'));
      const original=node('details');original.className='reading-original';original.append(node('summary','查看此前收到的 AI 回复'),node('pre',answer.answer),node('p',answer.uncertainties.join('\n')));fragment.append(original);
      container.replaceChildren(fragment);return;
    }
    const conclusion = node('p', answer.answer); conclusion.className = 'reading-conclusion';
    fragment.append(node('h2', capability.kind==='observation_only'?'条件性观察':capability.kind==='conditions_unconfirmed'?'条件性观察（现实条件待确认）':'解读结论'), conclusion);
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
    fragment.append(node('p', capability.kind==='observation_only'?'观察范围：仅提供条件性解释，不判断事情成败。':capability.kind==='conditions_unconfirmed'?'观察范围：仅提供条件性解释，不判断事情成败；实际作用前提仍待核实。':`判断倾向：${direction[answer.direction]} · 属于 AI 推论`));
    if(capability.kind==='conditions_unconfirmed'&&capability.items?.length){
      const pending=node('ul');pending.className='reading-availability-items';
      for(const item of capability.items)pending.append(node('li',item));
      fragment.append(node('p','需要你确认的现实条件：'),pending);
    }
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
    overview.append(previews); if(answer.factors.length)fragment.append(overview);
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
