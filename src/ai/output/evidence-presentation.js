// Presentation only: preserves evidence values, deduplicates identity, never scores support.
export function collectEvidencePresentation(registry, ids) {
  if (!Array.isArray(registry) || !Array.isArray(ids)) throw Error('Evidence registry and references required');
  const entries = new Map();
  for (const e of registry) {
    if (typeof e?.id !== 'string' || entries.has(e.id)) throw Error('Invalid evidence registry');
    entries.set(e.id, e);
  }
  const facts = new Map(), rules = new Map();
  const addFact = (id, direct = false) => {
    const e = entries.get(id);
    if (e?.kind !== 'program_fact') throw Error('Missing source fact');
    if (!facts.has(id)) facts.set(id, { entry: e, direct });
    else if (direct) facts.get(id).direct = true;
  };
  for (const id of [...new Set(ids)]) {
    const e = entries.get(id);
    if (!e) throw Error('Unknown evidence reference');
    if (e.kind === 'program_fact') addFact(id, true);
    else if (e.kind === 'rule_result' && Array.isArray(e.source_facts) && e.source_facts.length) {
      const sourceIds = [...new Set(e.source_facts)];
      sourceIds.forEach(source => addFact(source));
      rules.set(id, { entry: e, sourceIds });
    } else throw Error('Invalid evidence kind or rule sources');
  }
  const numbered = [...facts.values()].map((f, i) => ({ ...f, number: i + 1 }));
  const numbers = new Map(numbered.map(f => [f.entry.id, f.number]));
  return { facts: numbered, rules: [...rules.values()].map(r => ({ entry: r.entry,
    sourceNumbers: r.sourceIds.map(id => numbers.get(id)) })) };
}
