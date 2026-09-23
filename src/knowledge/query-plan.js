// Offline deterministic baseline. This file is not imported by a production entry point.
import { QUERY_PLAN_VERSION, validateQueryPlan, validateRuleConceptMap, identityHash } from './query-plan-schema.js';
import { QUERY_INTENT_PATTERNS, QUERY_INTENT_PAIR_PATTERNS,
  QUERY_CONTEXTUAL_SPAN_CUES, UNRESOLVED_TERMS } from './query-intent-patterns.js';
import { stableJson, textHash } from './validate.js';

const span = (question, start, end) => ({ start, end, matched_text: question.slice(start, end) });
const occurrence = (question, term) => {
  const starts = []; let start = question.indexOf(term);
  while (start !== -1) { starts.push(start); start = question.indexOf(term, start + term.length); }
  return starts;
};
const same = (a, b) => stableJson(a) === stableJson(b);
const sortAnchors = anchors => anchors.sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
const anchor = hit => ({ rule_id: hit.rule_id, target: { line: hit.target.line,
  component: hit.target.component, related_line: hit.target.related_line ?? null } });

function recognize(question, catalog) {
  const matches = [];
  const add = (term, concept_id, basis) => {
    for (const start of occurrence(question, term)) matches.push({ concept_id, basis, question_span: span(question, start, start + term.length) });
  };
  for (const concept of catalog.concepts) {
    add(concept.label, concept.concept_id, 'exact_term');
    for (const alias of concept.aliases) add(alias, concept.concept_id, 'catalog_alias');
  }
  for (const pattern of QUERY_INTENT_PATTERNS)
    if (!pattern.requires || question.includes(pattern.requires)) add(pattern.text, pattern.concept_id, 'deterministic_phrase');
  for (const pair of QUERY_INTENT_PAIR_PATTERNS) for (const left of occurrence(question, pair.left)) {
    const right = occurrence(question, pair.right).find(start => start >= left + pair.left.length &&
      start - left - pair.left.length <= pair.max_between);
    if (right !== undefined) add(question.slice(left, right + pair.right.length), pair.concept_id, 'deterministic_phrase');
  }
  matches.sort((a, b) => a.question_span.start - b.question_span.start ||
    (b.question_span.end - b.question_span.start) - (a.question_span.end - a.question_span.start) || a.concept_id.localeCompare(b.concept_id));
  const nonOverlapping = [];
  for (const match of matches) {
    if (nonOverlapping.some(x => x.question_span.start < match.question_span.end && match.question_span.start < x.question_span.end)) continue;
    nonOverlapping.push(match);
  }
  const byConcept = new Map();
  for (const match of nonOverlapping) {
    if (!byConcept.has(match.concept_id)) byConcept.set(match.concept_id, []);
    byConcept.get(match.concept_id).push(match);
  }
  for (const evidence of byConcept.values()) if (evidence.length > 1) {
    const expansions = evidence.map(match => QUERY_CONTEXTUAL_SPAN_CUES.flatMap(cue => {
      const s = match.question_span, edge = cue.side === 'prefix' ? s.start - cue.text.length : s.end;
      if (edge < 0 || question.slice(edge, edge + cue.text.length) !== cue.text) return [];
      return [{ cue, start: cue.side === 'prefix' ? edge : s.start,
        end: cue.side === 'suffix' ? edge + cue.text.length : s.end }];
    }));
    const roles = new Set(expansions.flat().map(x => x.cue.role));
    if (roles.has('theory') && roles.has('case')) evidence.forEach((match, i) => {
      const chosen = expansions[i][0];
      if (chosen) { match.question_span = span(question, chosen.start, chosen.end); match.basis = 'deterministic_phrase'; }
    });
  }
  const requested = [];
  for (const [concept_id, evidence] of byConcept) {
    const positive = evidence.filter(x => !/概念我知道了/.test(question.slice(x.question_span.end, x.question_span.end + 8)));
    const ordered = positive.length ? positive : evidence;
    const [first, ...rest] = ordered;
    requested.push({ concept_id, basis: first.basis, question_span: first.question_span,
      additional_question_spans: rest.map(x => x.question_span) });
  }
  requested.sort((a, b) => a.question_span.start - b.question_span.start || a.concept_id.localeCompare(b.concept_id));
  return requested;
}

function unresolved(question, requested) {
  const result = [];
  for (const term of UNRESOLVED_TERMS) for (const found of (term.text ?
    occurrence(question, term.text).map(start => ({ start, text: term.text })) :
    [...question.matchAll(term.pattern)].map(match => ({ start: match.index, text: match[0] })))) {
    const s = span(question, found.start, found.start + found.text.length);
    if (!requested.some(r => r.question_span.start === s.start && r.question_span.end === s.end))
      result.push({ text: found.text, question_span: s, reason: term.reason, candidate_concepts: term.candidate_concepts });
  }
  // A bare 空 is not a synonym for 旬空 or 空亡. The explicit full term remains recognizable.
  if (!requested.some(r => r.concept_id === 'xunkong')) for (const start of occurrence(question, '空')) {
    if (question[start - 1] === '旬' || question[start + 1] === '亡') continue;
    result.push({ text: '空', question_span: span(question, start, start + 1),
      reason: 'ambiguous_term', candidate_concepts: ['xunkong'] });
  }
  return result.sort((a, b) => a.question_span.start - b.question_span.start);
}

function explicitExclusion(question, request) {
  const before = question.slice(Math.max(0, request.question_span.start - 7), request.question_span.start);
  if (/(?:不是问|先别说|先别管|不讨论|不要讨论|除了|排除|别顺带讲)$/.test(before)) return true;
  const after = question.slice(request.question_span.end);
  if (/^(?:先放一边|先排除)/.test(after)) return true;
  return /^(?:，|、|；|;|但)/.test(after) && /但我只看/.test(after) &&
    request.question_span.start < question.indexOf('但我只看');
}

function constraintsFor(question) {
  const output_constraints = [];
  const names = /(?:只报|只问|告诉我)\s*(?:本卦和变卦)?(?:的)?(?:名称|卦名)/.test(question) ||
    /只想知道这叫什么卦/.test(question);
  const positions = /只列动爻位置/.test(question);
  const counts = /只要动爻数量/.test(question);
  if (names) output_constraints.push('names_only');
  if (positions) output_constraints.push('line_positions_only');
  if (/(?:只看|只解释|先单独讲|只要.{0,4}定义|只查)/.test(question) && !names && !positions)
    output_constraints.push('topic_only');
  if (/(?:别解释|不要解释|不用引用古书)/.test(question)) output_constraints.push('no_explanation');
  if (/(?:不要判断吉凶|不替我断成败|别直接断凶|别合成吉凶结论|不要推断应期|别判断好坏|先不下吉凶判断)/.test(question)) output_constraints.push('no_prediction');
  const narrow_request = names || positions || counts || /(?:不要引用文献|不要塞古籍)/.test(question);
  const knowledge_allowed = !narrow_request && !/(?:不用引用古书|先别引用文献)/.test(question);
  return { exclude_concepts: [], knowledge_allowed, narrow_request, output_constraints };
}

function scopeFor(question, canonical, requested, unresolvedMentions, constraints) {
  if (constraints.narrow_request && constraints.output_constraints.some(x => ['names_only', 'line_positions_only'].includes(x))) return 'unknown';
  if (constraints.narrow_request && /只列出.*(?:第几爻|位置)/.test(question)) return 'unknown';
  const caseWords = /(?:本卦|这卦|这个卦|这爻|此爻|这一爻|这个爻|这里|我这个|初爻|五爻|这次|当前卦|动爻)/.test(question);
  const theoryWords = /(?:一般|通常|六爻术语|六爻理论|在六爻里|术语里|先学术语|先解释)/.test(question);
  if (!canonical) return requested.length ? 'theory' : 'unknown';
  if (/(?:不谈这个卦|不针对当前卦|不看当前卦)/.test(question) && requested.length) return 'theory';
  if (!requested.length && !unresolvedMentions.length) return 'unknown';
  if (!requested.length && caseWords) return 'case_specific';
  if (!requested.length) return 'unknown';
  if (caseWords && theoryWords && /(?:再看|这卦的|本卦月|又该)/.test(question)) return 'mixed';
  if (theoryWords && !caseWords) return 'theory';
  if (/可以同时讨论/.test(question) && !caseWords) return 'theory';
  return 'case_specific';
}

function availabilityFor(ruleResult, map) {
  const byRule = new Map(map.entries.map(entry => [entry.rule_id, entry]));
  const byConcept = new Map();
  for (const hit of ruleResult?.hits ?? []) {
    const entry = byRule.get(hit.rule_id);
    if (!entry) throw new Error(`Unknown Rule hit: ${hit.rule_id}`);
    if (!byConcept.has(entry.concept_id)) byConcept.set(entry.concept_id, {
      concept_id: entry.concept_id, exposure: entry.exposure, rule_anchors: [] });
    byConcept.get(entry.concept_id).rule_anchors.push(anchor(hit));
  }
  return [...byConcept.values()].map(x => ({ ...x, rule_anchors: sortAnchors(x.rule_anchors) }))
    .sort((a, b) => a.concept_id.localeCompare(b.concept_id));
}

export function planQuery({ question, canonical = null, ruleResult = null, catalog, map, corpus, ruleIds }) {
  if (typeof question !== 'string' || !question.trim()) throw new Error('Question required');
  if ((canonical === null) !== (ruleResult === null)) throw new Error('Canonical and Rule Result must be supplied together');
  validateRuleConceptMap(map, { ruleIds, catalog });
  const available_concepts = availabilityFor(ruleResult, map);
  const requested_concepts = recognize(question, catalog);
  const unresolved_mentions = unresolved(question, requested_concepts);
  const constraints = constraintsFor(question);
  const scope = scopeFor(question, canonical, requested_concepts, unresolved_mentions, constraints);
  for (const request of requested_concepts) if (explicitExclusion(question, request)) request.basis = 'explicit_exclusion';
  const onlyAt = question.indexOf('只看');
  if (onlyAt >= 0 && requested_concepts.length > 1) {
    const clauseEnd = question.slice(onlyAt + 2).search(/[，。；;]/);
    const end = clauseEnd < 0 ? question.length : onlyAt + 2 + clauseEnd;
    const focused = requested_concepts.filter(r => [r.question_span, ...r.additional_question_spans]
      .some(s => s.start >= onlyAt + 2 && s.end <= end));
    if (focused.length) for (const request of requested_concepts)
      if (!focused.includes(request)) request.basis = 'explicit_exclusion';
  }
  if (/可以同时讨论/.test(question)) for (const request of requested_concepts) if (request.basis !== 'explicit_exclusion') request.basis = 'explicit_comparison';
  // Repeated synonyms are useful recognition evidence, but extra spans are contractually
  // needed only when the same topic is requested in both theory and current-case form.
  if (scope !== 'mixed') for (const request of requested_concepts) request.additional_question_spans = [];
  constraints.exclude_concepts = requested_concepts.filter(r => r.basis === 'explicit_exclusion').map(r => r.concept_id);
  const active = requested_concepts.filter(r => r.basis !== 'explicit_exclusion');
  const reviewed = corpus.units.filter(u => u.data_kind === 'corpus' && u.verification_status === 'reviewed');
  const facing = new Set(map.entries.filter(e => e.exposure === 'user_facing').map(e => e.concept_id));
  const availableById = new Map(available_concepts.map(x => [x.concept_id, x]));
  const selected_concepts = [], selection_reasons = [], excluded_concepts = [];
  for (const request of requested_concepts) {
    const id = request.concept_id;
    if (request.basis === 'explicit_exclusion') { excluded_concepts.push({ concept_id: id, reason: 'explicit_exclusion' }); continue; }
    if (active.length > 2) { excluded_concepts.push({ concept_id: id, reason: 'too_many_requested_topics' }); continue; }
    if (!constraints.knowledge_allowed) { excluded_concepts.push({ concept_id: id, reason: 'narrow_request' }); continue; }
    if (scope === 'unknown') { excluded_concepts.push({ concept_id: id, reason: 'unknown_scope' }); continue; }
    if (!facing.has(id)) { excluded_concepts.push({ concept_id: id, reason: 'internal_only' }); continue; }
    const anchors = availableById.get(id)?.rule_anchors ?? [];
    if (scope !== 'theory' && !anchors.length) { excluded_concepts.push({ concept_id: id, reason: 'case_relation_not_present' }); continue; }
    const eligible = reviewed.filter(u => u.related_concepts.includes(id) &&
      (scope === 'theory' || anchors.some(a => u.related_rule_ids.includes(a.rule_id))));
    if (!eligible.length) { excluded_concepts.push({ concept_id: id, reason: 'knowledge_not_admitted' }); continue; }
    selected_concepts.push(id);
    selection_reasons.push({ concept_id: id, uses: scope === 'mixed' ? ['theory_context', 'case_relation'] :
      scope === 'theory' ? ['theory_context'] : ['case_relation'], basis: request.basis,
    question_span: request.question_span, rule_anchors: scope === 'theory' ? [] : anchors.filter(a => eligible.some(u => u.related_rule_ids.includes(a.rule_id))) });
  }
  const status = active.length > 2 ? 'needs_narrowing' : selected_concepts.length ? 'ready' :
    unresolved_mentions.length && constraints.knowledge_allowed ? 'ambiguous' : 'zero_knowledge';
  const plan = { planner_version: QUERY_PLAN_VERSION, status, question_scope: scope, requested_concepts,
    unresolved_mentions, available_concepts, selected_concepts, excluded_concepts, constraints, selection_reasons,
    retrieval_query: status === 'ready' ? { concepts: selected_concepts, limit: 4, verification_status: 'reviewed' } : null,
    input_identity: { question_hash: textHash(question), canonical_hash: canonical ? identityHash(canonical) : null,
      rule_result_hash: ruleResult ? identityHash(ruleResult) : null, ruleset_version: 'r1', mapping_version: map.version,
      catalog_revision: catalog.revision, corpus_version: corpus.corpus_version, corpus_hash: corpus.corpus_hash } };
  if (status !== 'ready') { plan.selected_concepts = []; plan.selection_reasons = []; plan.retrieval_query = null; }
  validateQueryPlan(plan, { question, canonical, ruleResult, catalog, corpus, map, ruleIds });
  return plan;
}
