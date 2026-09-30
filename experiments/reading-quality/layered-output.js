// Offline development protocol. Mechanical checks do not establish semantic support.
import { stableJson } from '../../src/knowledge/validate.js';
export const LAYERED_OUTPUT_VERSION = 'layered-reading-dev-2';
export const LAYERED_INSTRUCTIONS_VERSION = 'layered-instructions-dev-3';
function exact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw Error('Invalid output fields');
}
function text(value) {
  if (typeof value !== 'string' || !value.trim() || [...value].length > 10000) throw Error('Invalid output text');
}
function ids(value) {
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !id.trim()) ||
      new Set(value).size !== value.length) throw Error('Invalid reference list');
}
export function checkLayeredOutput(answer, registry, packet) {
  exact(answer, ['schema_version', 'conclusion', 'facts', 'rules', 'interpretations', 'advice']);
  if (answer.schema_version !== LAYERED_OUTPUT_VERSION) throw Error('Unknown output version');
  text(answer.conclusion);
  for (const field of ['facts', 'rules', 'interpretations', 'advice'])
    if (!Array.isArray(answer[field]) || answer[field].length > 100) throw Error('Invalid output section');
  if (!Array.isArray(registry) || !Array.isArray(packet?.cards)) throw Error('Missing evidence inputs');
  const sources = new Map(), literature = new Map();
  for (const e of registry) {
    if (typeof e?.id !== 'string' || !e.id.trim() || sources.has(e.id)) throw Error('Invalid evidence registry');
    sources.set(e.id, e);
  }
  for (const c of packet.cards) {
    if (typeof c?.literature_id !== 'string' || literature.has(c.literature_id) ||
        c.independent_evidence !== false || c.applicability_review?.status !== 'confirmed')
      throw Error('Invalid literature card');
    literature.set(c.literature_id, c);
  }
  const factIds = new Set();
  const facts = answer.facts.map(f => {
    exact(f, ['evidence_id', 'value']);
    if (typeof f.evidence_id !== 'string' || factIds.has(f.evidence_id)) throw Error('Invalid or duplicate fact');
    factIds.add(f.evidence_id);
    const source = sources.get(f.evidence_id);
    if (!source || source.kind !== 'program_fact' || !Object.hasOwn(source, 'value'))
      return { evidence_id: f.evidence_id, status: 'invalid_fact_source' };
    return { evidence_id: f.evidence_id, status: stableJson(f.value) === stableJson(source.value) ? 'consistent' : 'conflict' };
  });
  const ruleIds = new Set();
  const rules = answer.rules.map(r => {
    exact(r, ['evidence_id', 'result']);
    if (typeof r.evidence_id !== 'string' || ruleIds.has(r.evidence_id)) throw Error('Invalid or duplicate rule');
    ruleIds.add(r.evidence_id);
    const source = sources.get(r.evidence_id);
    if (!source || source.kind !== 'rule_result' || !Object.hasOwn(source, 'result') || !Array.isArray(source.source_facts))
      return { evidence_id: r.evidence_id, status: 'invalid_rule_source' };
    if (stableJson(r.result) !== stableJson(source.result)) return { evidence_id: r.evidence_id, status: 'conflict' };
    const missing = source.source_facts.filter(id => !facts.some(f => f.evidence_id === id && f.status === 'consistent'));
    return { evidence_id: r.evidence_id, status: missing.length ? 'missing_source_facts' : 'consistent', missing_fact_ids: missing,
      independent_evidence: false };
  });
  const interpretations = answer.interpretations.map((i, position) => {
    exact(i, ['text', 'fact_ids', 'rule_ids', 'literature_ids', 'applicability', 'uncertainties']);
    text(i.text); text(i.applicability); ids(i.fact_ids); ids(i.rule_ids); ids(i.literature_ids);
    if (!Array.isArray(i.uncertainties)) throw Error('Invalid uncertainties');
    i.uncertainties.forEach(text);
    const invalidFacts = i.fact_ids.filter(id => !facts.some(f => f.evidence_id === id && f.status === 'consistent'));
    const invalidRules = i.rule_ids.filter(id => !rules.some(r => r.evidence_id === id && r.status === 'consistent'));
    // A rule reference must expose its source facts in this interpretation too.
    const missingRuleFacts = [...new Set(i.rule_ids.flatMap(id => sources.get(id)?.source_facts ?? []))]
      .filter(id => !i.fact_ids.includes(id));
    const unknownLiterature = i.literature_ids.filter(id => !literature.has(id));
    return { position, mechanical_status: i.fact_ids.length && !invalidFacts.length && !invalidRules.length && !missingRuleFacts.length && !unknownLiterature.length ? 'linked' : 'invalid_references',
      invalid_fact_ids: invalidFacts, invalid_rule_ids: invalidRules, missing_rule_fact_ids: missingRuleFacts, unknown_literature_ids: unknownLiterature,
      semantic_support: 'unassessed', question_relevance: 'unassessed', independent_literature_evidence: false };
  });
  answer.advice.forEach(a => {
    exact(a, ['text', 'basis']); text(a.text);
    if (a.basis !== 'general_advice') throw Error('Advice must be labeled general_advice');
  });
  return { version: LAYERED_OUTPUT_VERSION, facts, rules, interpretations, advice_count: answer.advice.length,
    mechanical_ok: facts.every(f => f.status === 'consistent') && rules.every(r => r.status === 'consistent') && interpretations.every(i => i.mechanical_status === 'linked'),
    conclusion_support: 'unassessed', advice_semantics: 'unassessed', acceptance: 'not_established' };
}

export function layeredOutputInstructions() {
  return `离线开发协议 ${LAYERED_OUTPUT_VERSION}，提示版本 ${LAYERED_INSTRUCTIONS_VERSION}，不用于生产。返回 JSON：
{"schema_version":"${LAYERED_OUTPUT_VERSION}","conclusion":"自然语言结论及限制",
"facts":[{"evidence_id":"排盘 program_fact ID","value":"原始值，保持类型"}],
"rules":[{"evidence_id":"rule_result ID","result":{"code":"原始规则 code","label":"原始规则 label，其他原始字段也须完整复制"}}],
"interpretations":[{"text":"解释，不混入新排盘事实","fact_ids":["facts 中的 ID"],"rule_ids":["rules 中的 ID"],"literature_ids":["资料包中的 literature ID"],"applicability":"为什么适用，同时检查禁用条件","uncertainties":["尚无法确认之处"]}],
"advice":[{"text":"现实建议","basis":"general_advice"}]}
文献是解释背景，不增加独立证据权重，不证明预测结果；无适用文献允许 literature_ids 为空。
文献条件不满足时不要引用。程序事实必须逐项复制；现实建议不包装成排盘必然结论。
facts 只允许 kind=program_fact；kind=rule_result 必须放在 rules，完整复制 result，禁止将规则放入 facts。
引用 rules 时，必须将该规则 source_facts 的全部原始事实列入 facts，同时列入对应解释的 fact_ids。rules 不增加独立证据权重。无相关规则允许 rules 和 rule_ids 为空。
editorial_guidance 是现代编辑的教学对照，不是古籍原文；overreach_example 是错误示例，不得当作结论采用。
文献字段来源必须区分：只有 original_text 是原文转录；editorial_summary、applicable_conditions、exclusions、exceptions、editorial_guidance 都是现代整理。不得将现代整理说成“古籍明确指出”或“原文明确规定”。原文没有讲个案效力，应说“本原文片段没有给出该结论；编辑整理限制了本次引用范围”。
结论和解释只保留回答所问必要的内容，不枚举无关六亲、六神、动静等事实，不以模型自身知识补写未提供出处的传统细则。
引用存在和原始值一致不代表解释合理，仍需人工检查相关性、支持程度与遗漏。`;
}
