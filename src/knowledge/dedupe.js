import { stableJson } from './validate.js';

export const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;
// No fuzzy synonyms. Identical source span AND proposition/conditions, or an explicit
// reviewed equivalent link, form one citation group. A shared rule ID alone never does.
export function dedupeUnits(units) {
  const sorted = [...units].sort((a, b) => compareIds(a.knowledge_id, b.knowledge_id));
  const parent = new Map(sorted.map(u => [u.knowledge_id, u.knowledge_id]));
  const root = id => { while (parent.get(id) !== id) id = parent.get(id); return id; };
  const join = (a, b) => { a = root(a); b = root(b); if (a !== b) parent.set(compareIds(a, b) < 0 ? b : a, compareIds(a, b) < 0 ? a : b); };
  const seen = new Map();
  for (const u of sorted) {
    const key = stableJson([u.segment_ref, u.source_type, u.normalized_statement, u.applicable_conditions, u.exclusions, u.exceptions]);
    if (seen.has(key)) join(u.knowledge_id, seen.get(key)); else seen.set(key, u.knowledge_id);
    for (const r of u.related_units) if (r.relationship === 'equivalent' && parent.has(r.target.knowledge_id)) join(u.knowledge_id, r.target.knowledge_id);
  }
  const groups = new Map();
  for (const u of sorted) { const id = root(u.knowledge_id); if (!groups.has(id)) groups.set(id, []); groups.get(id).push(u); }
  return [...groups.values()];
}

// Caller supplies identities of existing cast-specific evidence. Knowledge never creates
// a new identity, infers a hit, or recomputes Canonical/Rules. Unmatched links stay unbound.
export function associateEvidence(units, evidenceReferences) {
  const groups = new Map();
  for (const ref of evidenceReferences) {
    if (!ref || Object.keys(ref).sort().join(',') !== 'evidence_identity,rule_id,ruleset_version' ||
      ref.ruleset_version !== 'r1' || typeof ref.rule_id !== 'string' || !ref.rule_id.trim() ||
      typeof ref.evidence_identity !== 'string' || !ref.evidence_identity.trim()) throw new Error('Invalid existing evidence reference');
    const linked = units.filter(u => u.data_kind === 'corpus' && u.verification_status === 'reviewed' && u.ruleset_version === 'r1' && u.rule_link_semantics === 'association_only' && u.related_rule_ids.includes(ref.rule_id));
    if (!linked.length) continue;
    if (!groups.has(ref.evidence_identity)) groups.set(ref.evidence_identity, { evidence_identity: ref.evidence_identity,
      rule_ids: new Set(), knowledge_ids: new Set() });
    const g = groups.get(ref.evidence_identity); g.rule_ids.add(ref.rule_id);
    linked.forEach(u => g.knowledge_ids.add(u.knowledge_id));
  }
  return [...groups.values()].sort((a, b) => compareIds(a.evidence_identity, b.evidence_identity)).map(g => ({
    evidence_identity: g.evidence_identity, rule_ids: [...g.rule_ids].sort(compareIds), knowledge_ids: [...g.knowledge_ids].sort(compareIds),
    knowledge_role: 'literature_context', independent_evidence: false }));
}
