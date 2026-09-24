// Offline candidate contract. The frozen query-plan-1.1 schema is never mutated.
import { QUERY_PLAN_SCHEMA } from './query-plan-schema.js';
import { validateValue, stableJson } from './validate.js';

export const QUERY_PLAN_VERSION_12 = 'query-plan-1.2';
export const KNOWLEDGE_TASKS_12 = Object.freeze(['knowledge_seeking', 'non_knowledge', 'mixed', 'unknown']);
export const KNOWLEDGE_USES_12 = Object.freeze(['required', 'not_required', 'excluded', 'uncertain']);
export const TASK_EVIDENCE_KINDS_12 = Object.freeze([
  'knowledge_request', 'operation', 'exclusive_output', 'knowledge_prohibition',
  'output_restriction', 'concept_exclusion', 'scope_cue', 'unresolved_term'
]);
export const AMBIGUITY_REASONS_12 = Object.freeze(['task_conflict', 'unknown_task', 'unresolved_concept', 'unknown_scope']);
export const OUTPUT_DIRECTIVE_KINDS_12 = Object.freeze(['format', 'brevity', 'verbatim']);
const copy = value => structuredClone(value);
const str = { type: 'string', minLength: 1 };
const span = copy(QUERY_PLAN_SCHEMA.properties.requested_concepts.items.properties.question_span);
const id = copy(QUERY_PLAN_SCHEMA.properties.selected_concepts.items);
const list = items => ({ type: 'array', items, uniqueItems: true });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export const QUERY_PLAN_SCHEMA_12 = copy(QUERY_PLAN_SCHEMA);
QUERY_PLAN_SCHEMA_12.properties.planner_version = { const: QUERY_PLAN_VERSION_12 };
QUERY_PLAN_SCHEMA_12.properties.knowledge_task = { type: 'string', enum: [...KNOWLEDGE_TASKS_12] };
QUERY_PLAN_SCHEMA_12.properties.task_evidence = list(object({ kind: { type: 'string', enum: [...TASK_EVIDENCE_KINDS_12] },
  question_span: span, concept_id: { ...id, type: ['string', 'null'] } }));
QUERY_PLAN_SCHEMA_12.properties.task_conflict = object({ present: { type: 'boolean' }, evidence_spans: list(span) });
QUERY_PLAN_SCHEMA_12.properties.ambiguity_reasons = list({ type: 'string', enum: [...AMBIGUITY_REASONS_12] });
QUERY_PLAN_SCHEMA_12.properties.request_relation = { type: 'string', enum: ['none', 'comparison'] };
QUERY_PLAN_SCHEMA_12.properties.output_directives = list(object({
  text: str, question_span: span, kind: { type: 'string', enum: [...OUTPUT_DIRECTIVE_KINDS_12] }
}));
const request = QUERY_PLAN_SCHEMA_12.properties.requested_concepts.items;
request.properties.knowledge_use = { type: 'string', enum: [...KNOWLEDGE_USES_12] };
request.properties.context_use = { type: 'string', enum: ['case_specific', 'theory', 'mixed', 'unknown'] };
request.required.push('knowledge_use', 'context_use');
QUERY_PLAN_SCHEMA_12.properties.constraints.properties.knowledge_prohibited = { type: 'boolean' };
QUERY_PLAN_SCHEMA_12.properties.constraints.required.push('knowledge_prohibited');
QUERY_PLAN_SCHEMA_12.properties.constraints.properties.output_constraints.items.enum.push(
  'number_only', 'string_only', 'boolean_only', 'quote_only', 'verbatim_only');
QUERY_PLAN_SCHEMA_12.properties.excluded_concepts.items.properties.reason.enum.push(
  'task_not_required', 'uncertain_use', 'task_conflict', 'global_knowledge_prohibition', 'unknown_task');
QUERY_PLAN_SCHEMA_12.required.push('knowledge_task', 'task_evidence', 'task_conflict', 'ambiguity_reasons', 'request_relation', 'output_directives');

// Candidate benchmark labels omit the generated availability, selection anchors and
// input hashes; their fixture identity is frozen separately on each benchmark case.
export const QUERY_PLAN_LABEL_SCHEMA_12 = object(Object.fromEntries([
  'question_scope', 'knowledge_task', 'status', 'requested_concepts', 'selected_concepts',
  'excluded_concepts', 'constraints', 'unresolved_mentions', 'task_evidence',
  'task_conflict', 'ambiguity_reasons', 'request_relation', 'output_directives', 'retrieval_query'
].map(key => [key, copy(QUERY_PLAN_SCHEMA_12.properties[key])])));

const fail = message => { throw new Error(`Query plan 1.2: ${message}`); };
const same = (a, b) => stableJson(a) === stableJson(b);
const unique = values => new Set(values).size === values.length;
export const checkQuestionSpan12 = (question, value) => {
  if (value.end <= value.start || question.slice(value.start, value.end) !== value.matched_text)
    fail('invalid UTF-16 question span');
};

export function validateTaskGate12(plan, { question, catalog, availableRuleIds = [], map, reviewedUnits = [], contextMode = 'case' } = {}) {
  validateValue(plan, QUERY_PLAN_LABEL_SCHEMA_12);
  if (typeof question !== 'string' || !question.trim()) fail('question required');
  if (!['case', 'no_case'].includes(contextMode)) fail('context mode');
  if (contextMode === 'no_case' && ['case_specific', 'mixed'].includes(plan.question_scope)) fail('case scope needs Canonical');
  const known = new Set(catalog.concepts.map(x => x.concept_id));
  const requests = plan.requested_concepts, ids = requests.map(x => x.concept_id);
  if (!unique(ids) || !unique(plan.selected_concepts) || !unique(plan.excluded_concepts.map(x => x.concept_id))) fail('duplicate concept');
  const checkedId = id => { if (!known.has(id)) fail(`unknown concept: ${id}`); };
  for (const id of [...ids, ...plan.selected_concepts, ...plan.constraints.exclude_concepts,
    ...plan.excluded_concepts.map(x => x.concept_id)]) checkedId(id);
  for (const req of requests) {
    checkQuestionSpan12(question, req.question_span);
    for (const extra of req.additional_question_spans ?? []) checkQuestionSpan12(question, extra);
    const concept = catalog.concepts.find(x => x.concept_id === req.concept_id);
    if (req.basis === 'exact_term' && req.question_span.matched_text !== concept.label) fail('exact term differs from catalog');
    if (req.basis === 'catalog_alias' && !concept.aliases.includes(req.question_span.matched_text)) fail('alias not in catalog');
    if ((req.knowledge_use === 'excluded') !== (req.basis === 'explicit_exclusion')) fail('excluded use/basis mismatch');
    if (req.context_use === 'mixed' && !(req.additional_question_spans?.length)) fail('mixed concept needs another span');
  }
  for (const ev of plan.task_evidence) {
    checkQuestionSpan12(question, ev.question_span);
    if (ev.concept_id !== null && !ids.includes(ev.concept_id)) fail('task evidence refers to unrequested concept');
  }
  for (const directive of plan.output_directives) {
    checkQuestionSpan12(question, directive.question_span);
    if (directive.text !== directive.question_span.matched_text) fail('output directive text/span mismatch');
  }
  for (const mention of plan.unresolved_mentions) {
    checkQuestionSpan12(question, mention.question_span);
    if (mention.text !== mention.question_span.matched_text) fail('unresolved text/span mismatch');
    mention.candidate_concepts.forEach(checkedId);
  }
  const evidenceSpans = plan.task_evidence.map(x => x.question_span);
  for (const span of plan.task_conflict.evidence_spans) {
    checkQuestionSpan12(question, span);
    if (!evidenceSpans.some(e => same(e, span))) fail('conflict lacks task evidence');
  }
  if (plan.task_conflict.present) {
    if (plan.task_conflict.evidence_spans.length < 2 ||
      !plan.task_evidence.some(x => ['exclusive_output', 'knowledge_prohibition'].includes(x.kind) && plan.task_conflict.evidence_spans.some(s => same(s, x.question_span))) ||
      !plan.task_evidence.some(x => x.kind === 'knowledge_request' && plan.task_conflict.evidence_spans.some(s => same(s, x.question_span))))
      fail('conflict requires opposed prohibition/exclusive-output and Knowledge-request cues');
    if (plan.knowledge_task !== 'unknown' || plan.status !== 'ambiguous' || !plan.ambiguity_reasons.includes('task_conflict')) fail('conflict must fail closed');
  } else if (plan.task_conflict.evidence_spans.length || plan.ambiguity_reasons.includes('task_conflict')) fail('spurious task conflict');
  const prohibited = plan.task_evidence.some(x => x.kind === 'knowledge_prohibition');
  if (plan.constraints.knowledge_prohibited !== prohibited) fail('Knowledge prohibition not evidence-backed');
  const required = requests.filter(x => x.knowledge_use === 'required');
  const allowed = !prohibited && !plan.task_conflict.present &&
    ['knowledge_seeking', 'mixed'].includes(plan.knowledge_task) && required.length > 0;
  if (plan.constraints.knowledge_allowed !== allowed) fail('knowledge_allowed must be derived from task/evidence/use');
  if (plan.constraints.narrow_request !== (plan.knowledge_task === 'non_knowledge')) fail('narrow_request must reflect whole non-Knowledge task');
  if (plan.knowledge_task === 'non_knowledge' && required.length) fail('non-Knowledge task has required Knowledge');
  if (plan.knowledge_task === 'knowledge_seeking' && (!required.length || !plan.task_evidence.some(x => x.kind === 'knowledge_request'))) fail('Knowledge task needs positive request evidence');
  if (plan.knowledge_task === 'knowledge_seeking' && requests.some(x => x.knowledge_use === 'not_required')) fail('mixed use needs mixed task');
  if (plan.knowledge_task === 'mixed' && (!required.length || !plan.task_evidence.some(x => x.kind === 'knowledge_request') ||
    !requests.some(x => x.knowledge_use === 'not_required') && !plan.task_evidence.some(x => x.kind === 'operation'))) fail('mixed task needs Knowledge and operation');
  if (plan.knowledge_task === 'unknown' && !plan.task_conflict.present && !plan.ambiguity_reasons.length) fail('unknown task needs ambiguity reason');
  if (plan.status === 'ambiguous' && !plan.ambiguity_reasons.length) fail('ambiguous needs reason');
  if (plan.status !== 'ambiguous' && plan.ambiguity_reasons.length) fail('non-ambiguous plan has ambiguity reason');
  if (plan.knowledge_task === 'unknown' && plan.status !== 'ambiguous') fail('unknown task must fail closed');
  if (plan.question_scope === 'unknown' && plan.selected_concepts.length) fail('unknown scope cannot select Knowledge');
  if (plan.status === 'ambiguous' && (plan.selected_concepts.length || plan.retrieval_query !== null)) fail('ambiguous must not retrieve');
  const explicit = requests.filter(x => x.knowledge_use === 'excluded').map(x => x.concept_id);
  if (!same([...explicit].sort(), [...plan.constraints.exclude_concepts].sort())) fail('explicit exclusions mismatch');
  const excluded = new Map(plan.excluded_concepts.map(x => [x.concept_id, x.reason]));
  if (excluded.size !== plan.excluded_concepts.length || requests.some(x => !plan.selected_concepts.includes(x.concept_id) && !excluded.has(x.concept_id)) ||
    plan.selected_concepts.some(id => excluded.has(id))) fail('selection/exclusion must partition requested concepts');
  for (const req of requests) {
    const reason = excluded.get(req.concept_id);
    if (req.knowledge_use === 'excluded' && reason !== 'explicit_exclusion') fail('explicit exclusion reason');
    if (req.knowledge_use === 'not_required' && reason !== 'task_not_required') fail('non-Knowledge concept reason');
    if (req.knowledge_use === 'uncertain' && !['uncertain_use', 'task_conflict', 'unknown_task'].includes(reason)) fail('uncertain use must be excluded');
  }
  if (plan.selected_concepts.length > 2 || plan.selected_concepts.some(id => requests.find(x => x.concept_id === id)?.knowledge_use !== 'required')) fail('selected must be required and <=2');
  const first = id => requests.find(x => x.concept_id === id)?.question_span.start ?? Infinity;
  if (!same(plan.selected_concepts, [...plan.selected_concepts].sort((a, b) => first(a) - first(b) || a.localeCompare(b)))) fail('selected order');
  if (required.length > 2 && allowed && plan.status !== 'needs_narrowing') fail('>2 positive topics need narrowing');
  if (plan.status === 'needs_narrowing' && (!allowed || required.length <= 2 || plan.selected_concepts.length)) fail('invalid needs_narrowing');
  if ((plan.status === 'ready') !== (plan.selected_concepts.length > 0)) fail('ready/selection mismatch');
  if (plan.status === 'ready') {
    if (!allowed || !plan.retrieval_query || !same(plan.retrieval_query.concepts, plan.selected_concepts) ||
      plan.retrieval_query.limit > 4) fail('ready query mismatch');
  } else if (plan.retrieval_query !== null) fail('non-ready cannot query');
  if (plan.status === 'zero_knowledge' && plan.selected_concepts.length) fail('zero Knowledge must not select');
  if (plan.status === 'zero_knowledge' && allowed && plan.question_scope !== 'unknown' &&
    required.some(req => !excluded.has(req.concept_id))) fail('zero Knowledge lacks an exclusion reason');
  if (plan.status === 'invalid') fail('invalid status is not a valid candidate label');
  const byRule = new Map(map.entries.map(x => [x.rule_id, x]));
  const available = new Map();
  for (const rule of availableRuleIds) {
    const entry = byRule.get(rule);
    if (!entry) fail('unknown available Rule ID');
    if (!available.has(entry.concept_id)) available.set(entry.concept_id, []);
    available.get(entry.concept_id).push(rule);
  }
  const userFacing = new Set(map.entries.filter(x => x.exposure === 'user_facing').map(x => x.concept_id));
  const admitted = req => reviewedUnits.some(u => u.data_kind === 'corpus' && u.verification_status === 'reviewed' &&
    u.related_concepts.includes(req.concept_id) &&
    (req.context_use === 'theory' || (available.get(req.concept_id) ?? []).some(rule => u.related_rule_ids.includes(rule))));
  for (const req of requests) {
    const id = req.concept_id, reason = excluded.get(id);
    if (plan.selected_concepts.includes(id)) {
      if (!userFacing.has(id) || req.context_use === 'unknown' ||
        (req.context_use !== 'theory' && !(available.get(id)?.length)) || !admitted(req)) fail('selected concept lacks scope/anchor/admission');
    }
    if (reason === 'case_relation_not_present' && available.has(id)) fail('absent anchor is present');
    if (reason === 'case_relation_not_present' && req.context_use === 'theory') fail('theory request cannot lack case anchor');
    if (reason === 'knowledge_not_admitted' && (admitted(req) ||
      (req.context_use !== 'theory' && !available.has(id)))) fail('Knowledge admission reason must follow anchor check');
    if (reason === 'internal_only' && userFacing.has(id)) fail('user-facing concept called internal');
    if (reason === 'too_many_requested_topics' && !(required.length > 2 && plan.status === 'needs_narrowing')) fail('spurious topic cap reason');
    if (reason === 'task_conflict' && !plan.task_conflict.present) fail('spurious task conflict reason');
  }
  return plan;
}
