// Post-holdout development candidate; the frozen 1.2 implementation stays untouched.
// Protocol remains query-plan-1.2; implementation identity is separately versioned.
export const TASK_SCOPE_REVISION = 'task-scope-revision-1';
import { QUERY_PLAN_VERSION_12, QUERY_PLAN_SCHEMA_12, validateTaskGate12 } from './query-plan-schema-v1.2.js';
import { validateRuleConceptMap, identityHash } from './query-plan-schema.js';
import { validateValue, stableJson, textHash } from './validate.js';
import { assertRuleResult } from '../rules/schema.js';
import { readEvidencePath } from '../rules/engine.js';
import { CONCEPT_PHRASES_12, UNRESOLVED_PHRASES_12, LITERATURE_CUES_12,
  PROHIBITION_CUES_12, OPERATION_CUES_12 } from './query-task-patterns-v1.2.js';

const span = (q, start, end) => ({ start, end, matched_text: q.slice(start, end) });
const occurrences = (q, term) => { const out = []; for (let i = q.indexOf(term); i >= 0; i = q.indexOf(term, i + term.length)) out.push(i); return out; };
const matched = (q, regex) => [...q.matchAll(new RegExp(regex.source, 'gu'))].map(m => span(q, m.index, m.index + m[0].length));
const between = (s, a, b) => s.start >= a && s.end <= b;
const quoteRanges = q => [...q.matchAll(/[“「『][^”」』]*[”」』]/gu)].map(m => [m.index, m.index + m[0].length]);
const matchKind = (q, expressions, kind) => expressions.flatMap(re => matched(q, re)).map(question_span => ({ kind, question_span, concept_id: null }));
const uniqueEvidence = values => values.filter((v, i) => values.findIndex(x => x.kind === v.kind && x.question_span.start === v.question_span.start && x.question_span.end === v.question_span.end) === i)
  .sort((a, b) => a.question_span.start - b.question_span.start || a.question_span.end - b.question_span.end);

function conceptsIn(q, catalog) {
  const all = [];
  for (const c of catalog.concepts) {
    for (const [term, basis] of [[c.label, 'exact_term'], ...c.aliases.map(a => [a, 'catalog_alias'])])
      for (const start of occurrences(q, term)) all.push({ concept_id: c.concept_id, basis, question_span: span(q, start, start + term.length) });
  }
  for (const { text, concept_id } of CONCEPT_PHRASES_12)
    for (const start of occurrences(q, text)) all.push({ concept_id, basis: 'deterministic_phrase', question_span: span(q, start, start + text.length) });
  all.sort((a, b) => a.question_span.start - b.question_span.start ||
    (b.question_span.end - b.question_span.start) - (a.question_span.end - a.question_span.start) || a.concept_id.localeCompare(b.concept_id));
  const nonOverlap = [];
  for (const hit of all) if (!nonOverlap.some(x => x.question_span.start < hit.question_span.end && hit.question_span.start < x.question_span.end)) nonOverlap.push(hit);
  return nonOverlap;
}

function availability(ruleResult, map) {
  const byRule = new Map(map.entries.map(x => [x.rule_id, x]));
  const grouped = new Map();
  for (const hit of ruleResult?.hits ?? []) {
    const mapped = byRule.get(hit.rule_id);
    if (!mapped) throw new Error(`Unmapped Rule hit: ${hit.rule_id}`);
    if (!grouped.has(mapped.concept_id)) grouped.set(mapped.concept_id, { concept_id: mapped.concept_id, exposure: mapped.exposure, rule_anchors: [] });
    grouped.get(mapped.concept_id).rule_anchors.push({ rule_id: hit.rule_id,
      target: { line: hit.target.line, component: hit.target.component, related_line: hit.target.related_line ?? null } });
  }
  return [...grouped.values()].map(x => ({ ...x, rule_anchors: x.rule_anchors.sort((a, b) => stableJson(a).localeCompare(stableJson(b))) }))
    .sort((a, b) => a.concept_id.localeCompare(b.concept_id));
}

function classify(q, rawMatches) {
  const quotes = quoteRanges(q);
  const meta = /(?:作为检索词|能否直接作为检索词|查询可行)/u.test(q) && /(?:不要查询|不要查古籍内容|这里只判断)/u.test(q);
  const transformation = /(?:原样抄写|照抄|改写|压缩)/u.test(q);
  const active = rawMatches.filter(x => !quotes.some(([a, b]) => between(x.question_span, a, b)) && !backgroundMention(q, x));
  // A prohibition bound to an explicitly deferred concept is local, not a ban
  // on a separate positive request. Unbound prohibitions remain conservative.
  const prohibitions = matchKind(q, PROHIBITION_CUES_12, 'knowledge_prohibition').filter(p =>
    !active.some(x => localExclusion(q, x, active) && clauseAt(q, x.question_span.start).end >= p.question_span.end &&
      clauseAt(q, x.question_span.start).start <= p.question_span.start));
  const knowledge = meta ? [] : matchKind(q, LITERATURE_CUES_12, 'knowledge_request').filter(x =>
    !prohibitions.some(p => x.question_span.start < p.question_span.end && p.question_span.start < x.question_span.end) &&
    !/(?:不|别|不要|先别|先不要)$/u.test(q.slice(Math.max(0, x.question_span.start - 3), x.question_span.start)));
  const operations = matchKind(q, OPERATION_CUES_12, 'operation');
  const exclusive = matchKind(q,
    [/(?:整条回答|整个回答|全文|整段)(?:只能|只允许|仅能|只可)(?:包含|输出|给出|是)?[^，。；！？]{0,16}(?:数字|爻号|序号|是或否|有或没有)/u], 'exclusive_output');
  const conflictRestriction = prohibitions.find(x => /(?:整条回答|全文|整段).*(?:不得|不要|不许)/u.test(x.question_span.matched_text)) ?? exclusive[0];
  const globalConflict = knowledge.length && !!conflictRestriction;
  const task = globalConflict ? 'unknown' : knowledge.length ? (operations.length &&
    /(?:先|然后|再|一边|另答)/u.test(q) ? 'mixed' : 'knowledge_seeking') : 'non_knowledge';
  const theoryOnly = /(?:先不分析这卦|不结合当前卦|不讨论(?:本卦|这卦|此卦)|不需要代入卦盘|不判断任何具体卦|一般谈|作为术语|这个术语|术语的原句)/u.test(q);
  const cast = /(?:本卦|这卦|此卦|当前卦|盘中|盘里|盘面|图上|这次查|[初一二三四五六上]爻)/u.test(q);
  const scope = transformation && !knowledge.length ? 'unknown' : theoryOnly && cast && /(?:先转写|先写)/u.test(q) ? 'mixed' :
    theoryOnly ? 'theory' : cast ? 'case_specific' : knowledge.length ? 'theory' : 'unknown';
  return { active, knowledge, prohibitions, operations, exclusive, conflictRestriction,
    globalConflict: !!globalConflict, task, scope, meta, transformation };
}

function clauseAt(q, index) {
  const separators = /[，。；！？：,;!?\n]/u;
  let start = index, end = index;
  while (start > 0 && !separators.test(q[start - 1])) start--;
  while (end < q.length && !separators.test(q[end])) end++;
  return { start, end, text: q.slice(start, end) };
}

function backgroundMention(q, item) {
  const clause = clauseAt(q, item.question_span.start);
  const after = q.slice(item.question_span.end, clause.end);
  // Descriptive UI/background labels are not requests for their meaning.
  // Do not discard a clause that explicitly asks to explain/cite that label.
  return !/(?:请|解释|引用|查找|找文献|给出出处)/u.test(clause.text) &&
    /(?:只是|仅是|写在旁注|标在旁注|另一个标签|背景标签)/u.test(after);
}

function localExclusion(q, item, all) {
  const s = item.question_span, clause = clauseAt(q, s.start);
  const previous = all.filter(x => x.question_span.end <= s.start && x.question_span.end >= clause.start).at(-1);
  const next = all.find(x => x.question_span.start >= s.end && x.question_span.start <= clause.end);
  const before = q.slice(previous?.question_span.end ?? clause.start, s.start);
  const after = q.slice(s.end, next?.question_span.start ?? clause.end);
  return /(?:暂不谈|先不谈|先别说|先不说|排除|不讨论)\s*$/u.test(before) ||
    /^(?:暂且搁置|的话题留待下次|先放一边|只列为待办|(?:这一栏|这栏|栏位)?留白|只写[“「『]未处理[”」』])/u.test(after) ||
    /^(?:的文献|的出处)?(?:暂不提供|不提供|不引用)(?:文献|出处|古籍)?$/u.test(after);
}

function requestUse(q, item, classification) {
  const excluded = localExclusion(q, item, classification.active);
  if (excluded) return 'excluded';
  if (classification.globalConflict) return 'uncertain';
  return classification.knowledge.length ? 'required' : 'not_required';
}

function outputPolicy(q, classification) {
  const out = [], directives = [], evidence = [];
  const add = (name, regex, kind = 'output_restriction') => { const spans = matched(q, regex); if (spans.length) { out.push(name); evidence.push(...spans.map(question_span => ({ kind, question_span, concept_id: null }))); } };
  if (!classification.knowledge.length) {
    if (/(?:是或否|只答是或否)/u.test(q) || /(?:是否有标注|有没有)/u.test(q)) out.push('boolean_only');
    else if (/(?:间隔值|只回数字)/u.test(q)) out.push('number_only');
    else if (/(?:符号|两个数字)/u.test(q)) out.push('string_only');
    else if (/(?:原样抄写)/u.test(q)) out.push('verbatim_only');
  }
  if (classification.knowledge.length && /(?:摘录|原句)/u.test(q) && /(?:不要展开解释|只给原文)/u.test(q)) out.push('quote_only');
  add('no_explanation', /不要展开解释/u);
  add('no_prediction', /别推断吉凶|不要预测吉凶|不判断吉凶/u);
  for (const [regex, kind] of [[/“[^”]+\/[^”]+”/u, 'format'], [/连写成一行/u, 'format'], [/原样抄写/u, 'verbatim'], [/不超过十字|一句话/u, 'brevity']])
    for (const question_span of matched(q, regex)) directives.push({ text: question_span.matched_text, question_span, kind });
  return { out: [...new Set(out)], directives, evidence };
}

export function planTaskGateScopeRevision({ question, canonical = null, ruleResult = null, catalog, map, corpus, ruleIds }) {
  if (typeof question !== 'string' || !question.trim()) throw new Error('Question required');
  if ((canonical === null) !== (ruleResult === null)) throw new Error('Canonical and Rule Result must be paired');
  validateRuleConceptMap(map, { ruleIds, catalog });
  if (ruleResult) {
    assertRuleResult(ruleResult);
    for (const hit of ruleResult.hits) for (const ev of hit.evidence)
      if (readEvidencePath(canonical, ev.path) !== ev.value) throw new Error('Rule evidence differs from Canonical');
  }
  const available_concepts = availability(ruleResult, map);
  const rawMatches = conceptsIn(question, catalog);
  const c = classify(question, rawMatches);
  if (canonical === null && ['case_specific', 'mixed'].includes(c.scope)) throw new Error('Case scope requires Canonical');
  const byConcept = new Map();
  for (const hit of c.active) {
    if (!byConcept.has(hit.concept_id)) byConcept.set(hit.concept_id, []);
    byConcept.get(hit.concept_id).push(hit);
  }
  const requested_concepts = [...byConcept.entries()].map(([concept_id, hits]) => {
    // An exclusion on any occurrence wins conservatively; repeated mentions
    // must not bypass it by putting an earlier positive occurrence first.
    const first = hits.find(hit => requestUse(question, hit, c) === 'excluded') ?? hits[0];
    const extra = hits.filter(hit => hit !== first);
    const knowledge_use = requestUse(question, first, c);
    return { concept_id, basis: knowledge_use === 'excluded' ? 'explicit_exclusion' : first.basis,
      question_span: first.question_span, additional_question_spans: extra.map(x => x.question_span), knowledge_use,
      context_use: c.scope === 'mixed' ? 'theory' : c.scope };
  }).sort((a, b) => a.question_span.start - b.question_span.start);
  // A literature cue without a safely identified positive topic is unresolved task intent.
  // It must not be upgraded from Rule availability or a typo candidate.
  if (!c.globalConflict && ['knowledge_seeking', 'mixed'].includes(c.task) &&
      !requested_concepts.some(x => x.knowledge_use === 'required')) c.task = 'unknown';
  const unresolved_mentions = UNRESOLVED_PHRASES_12.flatMap(term => occurrences(question, term.text).map(start => ({
    text: term.text, question_span: span(question, start, start + term.text.length), reason: term.reason,
    candidate_concepts: term.candidate_concepts })));
  const output = outputPolicy(question, c);
  const exclusionEvidence = requested_concepts.filter(x => x.knowledge_use === 'excluded').map(x => {
    const s = x.question_span, a = Math.max(0, s.start - 4), b = Math.min(question.length, s.end + 8);
    return { kind: 'concept_exclusion', question_span: span(question, a, b), concept_id: x.concept_id };
  });
  const task_evidence = uniqueEvidence([...c.knowledge, ...c.prohibitions, ...c.exclusive, ...exclusionEvidence,
    ...(c.knowledge.length ? c.task === 'mixed' ? c.operations.slice(0, 1) : [] : c.operations.slice(0, 1)), ...output.evidence]);
  const task_conflict = { present: c.globalConflict, evidence_spans: c.globalConflict ?
    [c.conflictRestriction.question_span, c.knowledge[0].question_span] : [] };
  const ambiguity_reasons = c.globalConflict ? ['task_conflict'] : c.task === 'unknown' ? ['unknown_task'] : [];
  const required = requested_concepts.filter(x => x.knowledge_use === 'required');
  const knowledge_allowed = !c.prohibitions.length && !c.globalConflict && ['knowledge_seeking', 'mixed'].includes(c.task) && !!required.length;
  const constraints = { exclude_concepts: requested_concepts.filter(x => x.knowledge_use === 'excluded').map(x => x.concept_id),
    knowledge_allowed, knowledge_prohibited: !!c.prohibitions.length, narrow_request: c.task === 'non_knowledge',
    output_constraints: output.out };
  const facing = new Set(map.entries.filter(x => x.exposure === 'user_facing').map(x => x.concept_id));
  const available = new Map(available_concepts.map(x => [x.concept_id, x]));
  const reviewed = corpus.units.filter(x => x.data_kind === 'corpus' && x.verification_status === 'reviewed');
  const excluded_concepts = [], selected_concepts = [], selection_reasons = [];
  for (const req of requested_concepts) {
    const anchors = available.get(req.concept_id)?.rule_anchors ?? [];
    let reason = req.knowledge_use === 'excluded' ? 'explicit_exclusion' : req.knowledge_use === 'not_required' ? 'task_not_required' :
      req.knowledge_use === 'uncertain' ? (c.globalConflict ? 'task_conflict' : 'uncertain_use') :
      required.length > 2 ? 'too_many_requested_topics' : !knowledge_allowed ? 'global_knowledge_prohibition' :
      c.scope === 'unknown' ? 'unknown_scope' : !facing.has(req.concept_id) ? 'internal_only' :
      req.context_use !== 'theory' && !anchors.length ? 'case_relation_not_present' : null;
    const eligible = reviewed.filter(u => u.related_concepts.includes(req.concept_id) &&
      (req.context_use === 'theory' || anchors.some(a => u.related_rule_ids.includes(a.rule_id))));
    if (!reason && !eligible.length) reason = 'knowledge_not_admitted';
    if (reason) excluded_concepts.push({ concept_id: req.concept_id, reason });
    else {
      selected_concepts.push(req.concept_id);
      selection_reasons.push({ concept_id: req.concept_id, uses: req.context_use === 'theory' ? ['theory_context'] : ['case_relation'],
        basis: req.basis, question_span: req.question_span,
        rule_anchors: req.context_use === 'theory' ? [] : anchors.filter(a => eligible.some(u => u.related_rule_ids.includes(a.rule_id))) });
    }
  }
  const status = c.task === 'unknown' ? 'ambiguous' : knowledge_allowed && required.length > 2 ? 'needs_narrowing' :
    selected_concepts.length ? 'ready' : 'zero_knowledge';
  const plan = { planner_version: QUERY_PLAN_VERSION_12, question_scope: c.scope, knowledge_task: c.task, status,
    requested_concepts, selected_concepts, excluded_concepts, constraints, unresolved_mentions, task_evidence,
    task_conflict, ambiguity_reasons, request_relation: 'none', output_directives: output.directives,
    available_concepts, selection_reasons,
    retrieval_query: status === 'ready' ? { concepts: selected_concepts, limit: 4, verification_status: 'reviewed' } : null,
    input_identity: { question_hash: textHash(question), canonical_hash: canonical ? identityHash(canonical) : null,
      rule_result_hash: ruleResult ? identityHash(ruleResult) : null, ruleset_version: 'r1', mapping_version: map.version,
      catalog_revision: catalog.revision, corpus_version: corpus.corpus_version, corpus_hash: corpus.corpus_hash } };
  validateValue(plan, QUERY_PLAN_SCHEMA_12);
  const labelKeys = ['question_scope', 'knowledge_task', 'status', 'requested_concepts', 'selected_concepts',
    'excluded_concepts', 'constraints', 'unresolved_mentions', 'task_evidence', 'task_conflict', 'ambiguity_reasons',
    'request_relation', 'output_directives', 'retrieval_query'];
  validateTaskGate12(Object.fromEntries(labelKeys.map(key => [key, plan[key]])), { question, catalog,
    availableRuleIds: ruleResult?.hits.map(x => x.rule_id) ?? [], map, reviewedUnits: reviewed,
    contextMode: canonical ? 'case' : 'no_case' });
  return plan;
}
