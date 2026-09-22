import { stableJson, textHash, validateCorpus } from './validate.js';
import { compareIds, dedupeUnits } from './dedupe.js';

export const CORPUS_VERSION = 'phase7.1-initial-1';
export const RETRIEVAL_POLICY_VERSION = 'deterministic-literature-1.0';
const states = new WeakMap();
const sorted = values => [...new Set(values)].sort(compareIds);
const keys = { sources: 'source_id', segments: 'segment_id', units: 'knowledge_id', commentary: 'commentary_id' };
function canonicalSnapshot(corpus) {
  const c = structuredClone(corpus);
  for (const [set, key] of Object.entries(keys)) c[set].sort((a, b) => compareIds(a[key], b[key]));
  for (const [set, key] of [['concepts', 'concept_id'], ['categories', 'category_id'], ['tags', 'tag_id']]) c.catalog[set].sort((a, b) => compareIds(a[key], b[key]));
  return c;
}
export function createKnowledgeIndex(corpus, { ruleIds, rulesetVersion, previous } = {}) {
  const c = canonicalSnapshot(corpus);
  const admission = validateCorpus(c, { ruleIds, rulesetVersion, previous, mode: 'production', requireImageWitness: true });
  const handle = Object.freeze({ corpus_version: CORPUS_VERSION, corpus_hash: textHash(stableJson(c)), retrieval_policy_version: RETRIEVAL_POLICY_VERSION });
  const postings = { concepts: new Map(), categories: new Map(), related_rule_ids: new Map() };
  const add = (map, term, id) => { if (!map.has(term)) map.set(term, new Set()); map.get(term).add(id); };
  for (const u of c.units) if (admission.admitted.units.includes(u.knowledge_id)) {
    u.related_concepts.forEach(t => add(postings.concepts, t, u.knowledge_id));
    add(postings.categories, u.category, u.knowledge_id);
    u.related_rule_ids.forEach(t => add(postings.related_rule_ids, t, u.knowledge_id));
  }
  const concepts = new Set(c.catalog.concepts.map(x => x.concept_id)), aliases = new Map();
  for (const x of c.catalog.concepts) for (const a of [x.label, ...x.aliases]) aliases.set(a, x.concept_id);
  states.set(handle, { c, admission, postings, concepts, aliases, ruleIds: [...ruleIds] });
  return handle;
}

const queryFields = ['concepts', 'categories', 'related_rule_ids', 'allowed_editions', 'verification_status', 'limit', 'terms', 'condition_statuses'];
const conditionFields = ['applicable_conditions', 'exclusions', 'exceptions'];
function parseQuery(query, state) {
  if (!query || Object.getPrototypeOf(query) !== Object.prototype) throw new Error('Query must be a plain object');
  for (const key of Object.keys(query)) if (!queryFields.includes(key)) throw new Error(`Unknown query field: ${key}`);
  const q = { limit: 10, verification_status: 'reviewed', condition_statuses: {}, ...structuredClone(query) };
  for (const key of ['concepts', 'categories', 'related_rule_ids', 'allowed_editions', 'terms']) {
    if (!Object.hasOwn(q, key)) q[key] = [];
    if (!Array.isArray(q[key]) || q[key].some(v => typeof v !== 'string' || !v.trim())) throw new Error(`Invalid ${key}`);
    q[key] = sorted(q[key]);
  }
  if (!Number.isSafeInteger(q.limit) || q.limit < 0 || q.limit > 100) throw new Error('limit must be an integer from 0 to 100');
  if (!['draft', 'source_checked', 'reviewed', 'disputed', 'retired'].includes(q.verification_status)) throw new Error('Invalid verification_status');
  if (!q.condition_statuses || Object.getPrototypeOf(q.condition_statuses) !== Object.prototype) throw new Error('Invalid condition_statuses');
  for (const [key, value] of Object.entries(q.condition_statuses)) if (!conditionFields.includes(key) || !['specified', 'none_stated', 'unreviewed'].includes(value)) throw new Error('Unknown condition metadata');
  const check = (values, known, label) => values.forEach(v => { if (!known.includes(v)) throw new Error(`Unknown ${label}: ${v}`); });
  check(q.allowed_editions, state.c.sources.map(s => s.edition_id), 'edition');
  check(q.categories, state.c.catalog.categories.map(s => s.category_id), 'category');
  check(q.related_rule_ids, state.ruleIds, 'r1 rule');
  // concepts accepts IDs only; free exact labels/aliases are explicit terms, not NLP.
  check(q.concepts, [...state.concepts], 'concept');
  return q;
}

export function retrieve(index, query = {}) {
  const s = states.get(index); if (!s) throw new Error('Validated knowledge index required');
  const q = parseQuery(query, s), reasons = new Map(), excluded = [];
  const normalizedTerms = q.terms.map(term => ({ term, concept_id: s.concepts.has(term) ? term : s.aliases.get(term) ?? null }));
  const concepts = sorted([...q.concepts, ...normalizedTerms.map(x => x.concept_id).filter(Boolean)]);
  const segments = new Map(s.c.segments.map(x => [x.segment_id, x]));
  const has = (kind, terms, id) => terms.some(t => s.postings[kind].get(t)?.has(id));
  const matched = [];
  for (const u of s.c.units) {
    const id = u.knowledge_id, rejection = s.admission.excluded.find(x => x.id === id);
    if (rejection) { excluded.push(structuredClone(rejection)); continue; }
    const why = [], match = [], segment = segments.get(u.segment_ref.segment_id);
    if (q.verification_status !== 'reviewed') why.push('reviewed_only');
    if (q.allowed_editions.length && !q.allowed_editions.includes(segment.edition_id)) why.push('edition_filter');
    if ((q.concepts.length || q.terms.length) && !has('concepts', concepts, id)) why.push('concept_filter');
    if (q.categories.length && !has('categories', q.categories, id)) why.push('category_filter');
    if (q.related_rule_ids.length && !has('related_rule_ids', q.related_rule_ids, id)) why.push('rule_filter');
    for (const key of conditionFields) if (q.condition_statuses[key] && u[key].status !== q.condition_statuses[key]) why.push(`condition_metadata:${key}`);
    if (why.length) { excluded.push({ id, reasons: why }); continue; }
    for (const c of u.related_concepts.filter(c => q.concepts.includes(c))) match.push(`exact_concept:${c}`);
    for (const r of u.related_rule_ids.filter(r => q.related_rule_ids.includes(r))) match.push(`exact_rule:${r}`);
    if (q.categories.includes(u.category)) match.push(`exact_category:${u.category}`);
    for (const t of normalizedTerms) if (u.related_concepts.includes(t.concept_id)) match.push(`term:${t.term}->${t.concept_id}`);
    if (q.allowed_editions.length) match.push(`edition:${segment.edition_id}`);
    for (const key of conditionFields) if (q.condition_statuses[key]) match.push(`condition_metadata:${key}=${q.condition_statuses[key]}`);
    if (!match.length) match.push('admitted_reviewed');
    reasons.set(id, sorted(match)); matched.push(u);
  }
  const groups = dedupeUnits(matched); // Stable representative chosen by ID, never a score.
  const selected = [];
  const citationFor = u => {
    const segment = segments.get(u.segment_ref.segment_id), source = s.c.sources.find(x => x.source_id === segment.source_ref.source_id);
    return { knowledge_id: u.knowledge_id, source_id: source.source_id, source_revision: source.revision,
      edition_id: source.edition_id, title: source.title, source_url: source.provenance.source_url,
      segment_ref: structuredClone(u.segment_ref), locator: structuredClone(segment.locator),
      artifact_hash: source.provenance.artifact_hash, text_hash: segment.text_hash };
  };
  groups.forEach((group, i) => {
    const u = group[0], id = u.knowledge_id;
    for (const duplicate of group.slice(1)) excluded.push({ id: duplicate.knowledge_id, reasons: [`same_proposition:${id}`] });
    if (i >= q.limit) { excluded.push({ id, reasons: ['limit'] }); return; }
    selected.push({ unit: structuredClone(u), match_reasons: sorted(group.flatMap(x => reasons.get(x.knowledge_id))),
      same_proposition_ids: group.map(x => x.knowledge_id),
      citation: citationFor(u), same_proposition_citations: group.map(citationFor),
      association: { ruleset_version: 'r1', related_rule_ids: sorted(group.flatMap(x => x.related_rule_ids)), semantics: 'association_only',
        knowledge_role: 'literature_context', independent_evidence: false, evidence_identity: null, requires_cast_binding: true } });
  });
  return { ...index, selected, excluded: excluded.sort((a, b) => compareIds(a.id, b.id)),
    admission_excluded: structuredClone(s.admission.excluded), normalized_terms: normalizedTerms };
}
