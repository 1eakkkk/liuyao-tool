// Explicit, reviewed question scope only. No question parser or production filtering.
export const EVIDENCE_SCOPE_VERSION = 'reviewed-evidence-scope-dev-1';
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function references(value) {
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !id.trim()) || new Set(value).size !== value.length)
    throw Error('Invalid scope reference list');
}
export function scopeReadingEvidence(registry, selection) {
  if (!Array.isArray(registry) || !selection || Object.getPrototypeOf(selection) !== Object.prototype ||
      Object.keys(selection).sort().join(',') !== 'fact_ids,reason,rule_ids' ||
      typeof selection.reason !== 'string' || !selection.reason.trim()) throw Error('Explicit reviewed scope required');
  references(selection.fact_ids); references(selection.rule_ids);
  if (!selection.fact_ids.length && !selection.rule_ids.length) throw Error('Empty scope is not a complete reading');
  const byId = new Map();
  for (const e of registry) {
    if (typeof e?.id !== 'string' || !e.id.trim() || byId.has(e.id)) throw Error('Invalid evidence registry');
    byId.set(e.id, e);
  }
  const requireKind = (id, kind) => {
    const e = byId.get(id);
    if (!e || e.kind !== kind) throw Error('Unknown or mismatched scope reference');
    return e;
  };
  const facts = new Set(selection.fact_ids), dependencies = new Map();
  selection.fact_ids.forEach(id => requireKind(id, 'program_fact'));
  for (const id of selection.rule_ids) {
    const r = requireKind(id, 'rule_result'); references(r.source_facts);
    if (!r.source_facts.length) throw Error('Rule has no source facts');
    for (const factId of r.source_facts) {
      requireKind(factId, 'program_fact'); facts.add(factId);
      if (!dependencies.has(factId)) dependencies.set(factId, []);
      dependencies.get(factId).push(id);
    }
  }
  const selected = [...facts, ...selection.rule_ids].sort(compare);
  return { evidence: selected.map(id => structuredClone(byId.get(id))), audit: {
    version: EVIDENCE_SCOPE_VERSION, method: 'explicit_development_review', reason: selection.reason,
    original_count: registry.length, selected_count: selected.length,
    selected: selected.map(id => ({ id, reasons: selection.rule_ids.includes(id) ? ['explicit_rule'] :
      [...(selection.fact_ids.includes(id) ? ['explicit_fact'] : []), ...(dependencies.get(id) ?? []).sort(compare).map(r => `source_of:${r}`)] })),
    excluded_ids: [...byId.keys()].filter(id => !selected.includes(id)).sort(compare),
    omitted_is_not_absent: true, question_relevance: 'caller_reviewed_not_independently_validated'
  } };
}
