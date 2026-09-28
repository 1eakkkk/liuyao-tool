import { createHash } from 'node:crypto';
const ratings = new Set(['pass', 'partial', 'fail', 'unresolved']);
export function auditReading(entry, review) {
  const id = `${entry.batch}/${entry.transport.id}`;
  if (review.id !== id || review.raw_sha256 !== createHash('sha256').update(entry.raw).digest('hex')) throw Error('Review source mismatch');
  if (review.evidence_sha256 !== createHash('sha256').update(JSON.stringify([entry.question, entry.quoted_evidence])).digest('hex')) throw Error('Review evidence mismatch');
  for (const axis of ['scope', 'support']) if (!ratings.has(review[axis]?.rating) || !review[axis].reason?.trim()) throw Error('Missing review rating/reason');
  const answer = JSON.parse(entry.raw), evidence = new Map(entry.quoted_evidence.map(e => [e.id, e]));
  const claims = review.claims.map(claim => {
    const match = /^\/factors\/(\d+)\/interpretation$/.exec(claim.path);
    if (!match) throw Error('Only explicit factor annotations supported');
    const factor = answer.factors[Number(match[1])];
    if (!claim.quote || !factor?.interpretation.includes(claim.quote) || !claim.facts.length) throw Error('Annotation quote is missing');
    const facts = claim.facts.map(f => {
      const source = evidence.get(f.id);
      if (!source || source.kind !== 'program_fact' || !Object.hasOwn(f, 'asserted')) throw Error('Missing annotated fact');
      return { id: f.id, asserted: f.asserted, actual: source.value,
        consistent: JSON.stringify(f.asserted) === JSON.stringify(source.value),
        directly_cited_in_factor: factor.evidence_ids.includes(f.id) };
    });
    return { path: claim.path, quote: claim.quote, facts };
  });
  const facts = claims.flatMap(c => c.facts);
  return { id, question: entry.question, raw_sha256: review.raw_sha256, evidence_sha256: review.evidence_sha256,
    mechanical: entry.recheck, // Recorded production recheck, not a fresh semantic validation.
    annotated_facts: { checked: facts.length, conflicts: facts.filter(f => !f.consistent).length,
      missing_direct_citations: facts.filter(f => !f.directly_cited_in_factor).length,
      coverage: 'Explicit developer annotations only; unannotated text is not judged.' },
    scope: review.scope, support: review.support, reviewer: review.reviewer, claims };
}
