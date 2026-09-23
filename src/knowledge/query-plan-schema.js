// Offline Phase 8B contract only. This module does not classify questions or retrieve knowledge.
import { validateValue, stableJson, textHash } from './validate.js';
import { assertRuleResult } from '../rules/schema.js';
import { readEvidencePath } from '../rules/engine.js';

export const QUERY_PLAN_VERSION = 'query-plan-1.1';
export const RULE_CONCEPT_MAP_VERSION = 'r1-concept-availability-1.0';
export const QUESTION_SCOPES = ['case_specific', 'theory', 'mixed', 'unknown'];
export const PLAN_STATUSES = ['ready', 'zero_knowledge', 'needs_narrowing', 'ambiguous', 'invalid'];
const str = { type: 'string', minLength: 1 };
const id = { ...str, pattern: '^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$' };
const hash = { ...str, pattern: '^sha256:[a-f0-9]{64}$' };
const ruleId = { ...str, pattern: '^[A-Z][A-Z0-9-]+$' };
const list = items => ({ type: 'array', items, uniqueItems: true });
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const oneOf = values => ({ type: 'string', enum: values });
const nullable = schema => ({ ...schema, type: [schema.type, 'null'] });
const span = obj({ start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 }, matched_text: str });
const target = obj({ line: { type: 'integer', minimum: 1 }, component: oneOf(['primary', 'changed', 'hidden']), related_line: { type: ['integer', 'null'], minimum: 1 } });
const anchor = obj({ rule_id: ruleId, target });
const requested = obj({ concept_id: id, basis: oneOf(['exact_term', 'catalog_alias', 'explicit_comparison', 'explicit_exclusion', 'deterministic_phrase']), question_span: span });
requested.properties.additional_question_spans = list(span);
const unresolved = obj({ text: str, question_span: span,
  reason: oneOf(['possible_typo', 'ambiguous_term', 'insufficient_context', 'unknown_term']), candidate_concepts: list(id) });
const excluded = obj({ concept_id: id, reason: oneOf(['explicit_exclusion', 'case_relation_not_present', 'knowledge_not_admitted', 'internal_only', 'narrow_request', 'too_many_requested_topics', 'unknown_scope', 'ambiguous_intent']) });
const constraints = obj({ exclude_concepts: list(id), knowledge_allowed: { type: 'boolean' }, narrow_request: { type: 'boolean' },
  output_constraints: list(oneOf(['names_only', 'line_positions_only', 'no_explanation', 'no_prediction', 'topic_only'])) });
const identity = obj({ question_hash: hash, canonical_hash: nullable(hash), rule_result_hash: nullable(hash),
  ruleset_version: { const: 'r1' }, mapping_version: { const: RULE_CONCEPT_MAP_VERSION },
  catalog_revision: { type: 'integer', minimum: 1 }, corpus_version: id, corpus_hash: hash });

export const RULE_CONCEPT_MAP_SCHEMA = obj({ version: { const: RULE_CONCEPT_MAP_VERSION }, ruleset_version: { const: 'r1' },
  catalog_revision: { type: 'integer', minimum: 1 }, entries: list(obj({ rule_id: ruleId, concept_id: id,
    exposure: oneOf(['user_facing', 'internal_metadata']), note: str })) });
export const QUERY_PLAN_SCHEMA = obj({ planner_version: { const: QUERY_PLAN_VERSION }, status: oneOf(PLAN_STATUSES),
  question_scope: oneOf(QUESTION_SCOPES), requested_concepts: list(requested),
  unresolved_mentions: list(unresolved),
  available_concepts: list(obj({ concept_id: id, exposure: oneOf(['user_facing', 'internal_metadata']), rule_anchors: list(anchor) })),
  selected_concepts: list(id), excluded_concepts: list(excluded), constraints,
  selection_reasons: list(obj({ concept_id: id, uses: list(oneOf(['case_relation', 'theory_context'])),
    basis: oneOf(['exact_term', 'catalog_alias', 'explicit_comparison', 'deterministic_phrase']),
    question_span: span, rule_anchors: list(anchor) })),
  retrieval_query: { type: ['object', 'null'], properties: { concepts: list(id), limit: { type: 'integer', minimum: 1 },
    verification_status: { const: 'reviewed' } }, required: ['concepts', 'limit', 'verification_status'], additionalProperties: false },
  input_identity: identity });

const fail = message => { throw new Error(`Query plan contract: ${message}`); };
const unique = values => new Set(values).size === values.length;
const same = (a, b) => stableJson(a) === stableJson(b);
export const identityHash = value => textHash(stableJson(value));

export function validateRuleConceptMap(map, { ruleIds, catalog }) {
  validateValue(map, RULE_CONCEPT_MAP_SCHEMA);
  if (map.catalog_revision !== catalog.revision) fail('catalog revision mismatch');
  if (!Array.isArray(ruleIds) || ruleIds.length !== 25 || !unique(ruleIds)) fail('r1 must contain 25 unique rules');
  const knownRules = new Set(ruleIds), knownConcepts = new Set(catalog.concepts.map(x => x.concept_id));
  const mapped = map.entries.map(x => x.rule_id);
  if (!unique(mapped) || mapped.length !== ruleIds.length || mapped.some(id => !knownRules.has(id))) fail('mapping must cover each r1 rule exactly once');
  for (const entry of map.entries) if (!knownConcepts.has(entry.concept_id)) fail(`unknown concept: ${entry.concept_id}`);
  return map;
}

export function validateQueryPlan(plan, { question, canonical = null, ruleResult = null, catalog, corpus, map, ruleIds }) {
  validateValue(plan, QUERY_PLAN_SCHEMA);
  validateRuleConceptMap(map, { ruleIds, catalog });
  if (typeof question !== 'string' || !question.trim()) fail('question required');
  const { input_identity: i } = plan;
  if (i.question_hash !== textHash(question) || i.canonical_hash !== (canonical ? identityHash(canonical) : null) ||
      i.rule_result_hash !== (ruleResult ? identityHash(ruleResult) : null) || i.catalog_revision !== catalog.revision ||
      i.mapping_version !== map.version || i.corpus_version !== corpus.corpus_version || i.corpus_hash !== corpus.corpus_hash) fail('input identity mismatch');
  if ((canonical === null) !== (ruleResult === null)) fail('case context must include both Canonical and Rules');
  if (ruleResult) {
    assertRuleResult(ruleResult);
    for (const hit of ruleResult.hits) for (const evidence of hit.evidence) {
      if (readEvidencePath(canonical, evidence.path) !== evidence.value) fail('Rule evidence differs from Canonical');
    }
  }
  if (canonical === null && !['theory', 'unknown'].includes(plan.question_scope)) fail('case or mixed scope requires a cast');
  if (plan.question_scope === 'unknown' && plan.status === 'ready') fail('unknown scope cannot select knowledge');
  const known = new Set(catalog.concepts.map(x => x.concept_id));
  const userFacing = new Set(map.entries.filter(e => e.exposure === 'user_facing').map(e => e.concept_id));
  const checkConcepts = ids => { for (const id of ids) if (!known.has(id)) fail(`unknown concept: ${id}`); };
  const requestedIds = plan.requested_concepts.map(x => x.concept_id);
  for (const mention of plan.unresolved_mentions) {
    spanCheckLater(mention.question_span, question, fail);
    if (mention.question_span.matched_text !== mention.text) fail('unresolved mention text differs from span');
    if (!unique(mention.candidate_concepts)) fail('duplicate unresolved candidate');
    checkKnownLater(mention.candidate_concepts, catalog, fail);
  }
  if (plan.status === 'ambiguous' && !plan.unresolved_mentions.length) fail('ambiguous plan requires unresolved mention');
  if (plan.status === 'zero_knowledge' && plan.unresolved_mentions.length) fail('zero knowledge is not unresolved intent');
  const availableIds = plan.available_concepts.map(x => x.concept_id);
  const selected = plan.selected_concepts;
  checkConcepts([...requestedIds, ...availableIds, ...selected, ...plan.excluded_concepts.map(x => x.concept_id), ...plan.constraints.exclude_concepts]);
  if (!unique(requestedIds) || !unique(availableIds) || !unique(selected) || !unique(plan.excluded_concepts.map(x => x.concept_id))) fail('duplicate concept');
  if (selected.length > 2) fail('maximum two selected concepts');
  const startFor = concept => plan.requested_concepts.find(x => x.concept_id === concept)?.question_span.start ?? Infinity;
  if (!same(selected, [...selected].sort((a, b) => startFor(a) - startFor(b) || a.localeCompare(b)))) fail('selected concepts must follow question order');
  const mapByRule = new Map(map.entries.map(x => [x.rule_id, x]));
  const hitByKey = new Map((ruleResult?.hits || []).map(h => [stableJson({ rule_id: h.rule_id, target: { line: h.target.line, component: h.target.component, related_line: h.target.related_line ?? null } }), h]));
  const availability = new Map();
  for (const [key, hit] of hitByKey) {
    const entry = mapByRule.get(hit.rule_id);
    if (!entry) fail('unknown Rule hit');
    if (!availability.has(entry.concept_id)) availability.set(entry.concept_id, { concept_id: entry.concept_id, exposure: entry.exposure, rule_anchors: [] });
    availability.get(entry.concept_id).rule_anchors.push(JSON.parse(key));
  }
  const expectedAvailability = [...availability.values()].map(x => ({ ...x, rule_anchors: x.rule_anchors.sort((a, b) => stableJson(a).localeCompare(stableJson(b))) })).sort((a, b) => a.concept_id.localeCompare(b.concept_id));
  const actualAvailability = structuredClone(plan.available_concepts).map(x => ({ ...x, rule_anchors: x.rule_anchors.sort((a, b) => stableJson(a).localeCompare(stableJson(b))) })).sort((a, b) => a.concept_id.localeCompare(b.concept_id));
  if (!same(actualAvailability, expectedAvailability)) fail('available concepts must exactly reflect Rule hits, not user intent');
  const spanCheck = s => { if (s.end <= s.start || question.slice(s.start, s.end) !== s.matched_text) fail('invalid UTF-16 question span'); };
  for (const item of plan.requested_concepts) spanCheck(item.question_span);
  for (const item of plan.requested_concepts) for (const extra of item.additional_question_spans ?? []) spanCheck(extra);
  for (const item of plan.selection_reasons) spanCheck(item.question_span);
  if (plan.question_scope === 'mixed' && selected.length) {
    const allUses = plan.selection_reasons.flatMap(reason => reason.uses);
    if (!allUses.includes('theory_context') || !allUses.includes('case_relation')) fail('mixed plan requires theory and case uses');
    for (const reason of plan.selection_reasons.filter(x => x.uses.includes('theory_context') && x.uses.includes('case_relation'))) {
      if (!(plan.requested_concepts.find(x => x.concept_id === reason.concept_id)?.additional_question_spans?.length)) fail('mixed dual-use concept requires both question mentions');
    }
  }
  const explicitExclusions = plan.requested_concepts.filter(x => x.basis === 'explicit_exclusion').map(x => x.concept_id);
  if (!same([...plan.constraints.exclude_concepts].sort(), [...explicitExclusions].sort())) fail('explicit exclusion mismatch');
  if (plan.constraints.narrow_request && plan.constraints.knowledge_allowed) fail('narrow no-literature request cannot allow knowledge');
  const exclusions = new Map(plan.excluded_concepts.map(x => [x.concept_id, x.reason]));
  for (const id of explicitExclusions) if (exclusions.get(id) !== 'explicit_exclusion') fail('explicit exclusion must be recorded');
  const reviewed = corpus.units.filter(u => u.verification_status === 'reviewed' && u.data_kind === 'corpus');
  const reasonByConcept = new Map(plan.selection_reasons.map(x => [x.concept_id, x]));
  if (reasonByConcept.size !== plan.selection_reasons.length || reasonByConcept.size !== selected.length) fail('one selection reason per selected concept');
  for (const id of selected) {
    if (!requestedIds.includes(id) || explicitExclusions.includes(id) || exclusions.has(id) || !plan.constraints.knowledge_allowed) fail('selected concept conflicts with request or constraints');
    if (!userFacing.has(id)) fail('internal concept cannot be selected');
    const reason = reasonByConcept.get(id), request = plan.requested_concepts.find(x => x.concept_id === id);
    if (!reason || reason.basis !== request.basis || !same(reason.question_span, request.question_span)) fail('selection reason must cite question');
    if (!reason.uses.length || (plan.question_scope === 'theory' && !same(reason.uses, ['theory_context'])) ||
        (plan.question_scope === 'case_specific' && !same(reason.uses, ['case_relation']))) fail('selection uses do not match question scope');
    if (reason.uses.includes('theory_context') && !reviewed.some(u => u.related_concepts.includes(id))) fail('theory context requires reviewed knowledge');
    if (reason.uses.includes('case_relation')) {
      const current = availability.get(id);
      if (!current || !reason.rule_anchors.length || reason.rule_anchors.some(a => !current.rule_anchors.some(b => same(a, b)))) fail('case relation anchor missing');
      if (!reviewed.some(u => u.related_concepts.includes(id) && reason.rule_anchors.some(a => u.related_rule_ids.includes(a.rule_id)))) fail('knowledge not admitted for current rule');
    } else if (reason.rule_anchors.length) fail('theory context must not claim current relation anchor');
  }
  for (const [id, reason] of exclusions) {
    if (!requestedIds.includes(id)) fail('excluded concept must be recognized in question');
    if (reason === 'case_relation_not_present' && availability.has(id)) fail('case relation is present');
    if (reason === 'knowledge_not_admitted' && reviewed.some(u => u.related_concepts.includes(id) &&
        (plan.question_scope === 'theory' || (availability.get(id)?.rule_anchors.some(a => u.related_rule_ids.includes(a.rule_id)) ?? false)))) fail('reviewed concept exists for requested scope');
    if (reason === 'internal_only' && userFacing.has(id)) fail('user-facing concept is not internal only');
  }
  if (plan.status === 'ready') {
    if (!selected.length || !plan.retrieval_query || !same(plan.retrieval_query.concepts, selected) || plan.retrieval_query.limit > 4) fail('ready plan must query exactly selected concepts');
  } else if (selected.length || plan.selection_reasons.length || plan.retrieval_query !== null) fail('non-ready plan must not call retrieval');
  if (plan.status === 'needs_narrowing' && requestedIds.filter(id => !explicitExclusions.includes(id)).length <= 2) fail('needs_narrowing requires more than two requested topics');
  if (plan.status === 'zero_knowledge' && plan.constraints.knowledge_allowed && plan.question_scope !== 'unknown' && !exclusions.size && requestedIds.length) fail('zero knowledge needs an auditable reason');
  return plan;
}

function spanCheckLater(s, question, fail) {
  if (s.end <= s.start || question.slice(s.start, s.end) !== s.matched_text) fail('invalid UTF-16 unresolved span');
}
function checkKnownLater(ids, catalog, fail) {
  const known = new Set(catalog.concepts.map(x => x.concept_id));
  for (const id of ids) if (!known.has(id)) fail(`unknown unresolved concept: ${id}`);
}
