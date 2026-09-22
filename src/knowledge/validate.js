// Offline Node validator only. It never imports AI, Core, or a corpus at runtime.
import { createHash } from 'node:crypto';
import { CORPUS_SCHEMA } from './schemas.js';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const fail = message => { throw new Error(`Knowledge validation: ${message}`); };
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const textHash = text => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
// Hash the complete record (sorted object keys, array order retained), excluding only its own content_hash.
export function recordHash(record) {
  const { content_hash: ignored, ...content } = record;
  return textHash(stableJson(content));
}

// Implements exactly the keywords used in schemas.js, not a general JSON Schema library.
export function validateValue(value, schema, path = '$') {
  const error = reason => fail(`${path}: ${reason}`);
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (own(schema, 'const') && value !== schema.const) error('const');
  if (schema.enum && !schema.enum.includes(value)) error('enum');
  if (schema.type && ![].concat(schema.type).some(t => t === type || (t === 'integer' && Number.isInteger(value)))) error('type');
  if (type === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity))) error('minimum/finite');
  if (type === 'string') {
    if (!value.trim() || [...value].length < (schema.minLength ?? 0)) error('empty/minLength');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) error('pattern');
    if (schema.format === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) error('date');
  }
  if (type === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) error('plain object required');
    for (const key of schema.required || []) if (!own(value, key)) error(`missing ${key}`);
    for (const [key, child] of Object.entries(value)) {
      if (!own(schema.properties || {}, key)) error(`unknown field ${key}`);
      validateValue(child, schema.properties[key], `${path}.${key}`);
    }
  }
  if (type === 'array') {
    if (value.length < (schema.minItems ?? 0)) error('minItems');
    if (schema.uniqueItems && new Set(value.map(stableJson)).size !== value.length) error('duplicate items');
    value.forEach((child, i) => validateValue(child, schema.items, `${path}[${i}]`));
  }
  return value;
}
function index(items, key) {
  const map = new Map();
  for (const item of items) {
    if (map.has(item[key])) fail(`duplicate ${key}: ${item[key]}`);
    map.set(item[key], item);
  }
  return map;
}
function reference(map, ref, key) {
  const item = map.get(ref[key]);
  if (!item || item.revision !== ref.revision) fail(`missing/stale ${key}: ${ref[key]}@${ref.revision}`);
  return item;
}
function checkSpan(segments, ref) {
  const segment = reference(segments, ref, 'segment_id');
  const chars = [...segment.text];
  if (ref.span.end <= ref.span.start || ref.span.end > chars.length) fail('invalid span bounds');
  return { segment, text: chars.slice(ref.span.start, ref.span.end).join('') };
}
const precise = l => ['page', 'leaf', 'image_page', 'anchor'].some(k => l[k] !== null);
const reviewed = r => r.verification_status === 'reviewed';
const sets = ['sources', 'segments', 'units', 'commentary'];
const keys = ['source_id', 'segment_id', 'knowledge_id', 'commentary_id'];

export function validateCorpus(corpus, { ruleIds, rulesetVersion, mode = 'production', previous = null, requireImageWitness = false } = {}) {
  if (!['production', 'fixture'].includes(mode)) fail('invalid mode');
  if (rulesetVersion !== 'r1' || !Array.isArray(ruleIds) || ruleIds.length !== 25 || new Set(ruleIds).size !== 25) fail('explicit Ruleset r1 / 25 rule registry required');
  validateValue(corpus, CORPUS_SCHEMA);
  const maps = sets.map((set, i) => index(corpus[set], keys[i]));
  const [sources, segments, units] = maps;
  const allIds = sets.flatMap((set, i) => corpus[set].map(r => r[keys[i]]));
  if (new Set(allIds).size !== allIds.length) fail('record IDs must be globally unique');
  index(corpus.sources, 'edition_id');
  const concepts = index(corpus.catalog.concepts, 'concept_id');
  const categories = index(corpus.catalog.categories, 'category_id');
  const tags = index(corpus.catalog.tags, 'tag_id');
  const aliases = new Set(concepts.keys());
  for (const concept of concepts.values()) for (const alias of [concept.label, ...concept.aliases]) {
    if (aliases.has(alias)) fail(`ambiguous/duplicate concept alias: ${alias}`);
    aliases.add(alias);
  }
  for (const set of sets) for (const r of corpus[set]) {
    if (mode === 'production' && (r.data_kind !== 'corpus' || r.provenance.method === 'fixture' || r.provenance.rights.status === 'test_only')) fail('test_only fixture cannot enter production corpus');
    if (mode === 'fixture' && r.data_kind !== 'test_only') fail('fixture mode requires test_only records');
    if (recordHash(r) !== r.content_hash) fail('content hash mismatch');
    const p = r.provenance;
    if (!p.identifier && !p.source_url) fail('provenance URL or identifier required');
    if (p.source_url) {
      let url; try { url = new URL(p.source_url); } catch { fail('invalid source URL'); }
      if (!['https:', 'http:'].includes(url.protocol)) fail('source URL protocol');
    }
    if ((p.reviewed_by === null) !== (p.reviewed_at === null)) fail('review identity/date must be paired');
    if (reviewed(r) && (!p.reviewed_by || !p.reviewed_at)) fail('reviewed requires reviewer/date');
    if (p.reviewed_at && p.reviewed_at < p.acquisition_date) fail('review predates acquisition');
    for (const c of r.contributors || []) {
      if (c.certainty === 'unknown' && c.name !== null) fail('unknown attribution requires null name');
      if (c.certainty !== 'unknown' && c.name === null) fail('named attribution required');
    }
    for (const c of r.related_concepts || []) if (!concepts.has(c)) fail(`unknown concept: ${c}`);
    for (const t of r.tags || []) if (!tags.has(t)) fail(`unknown controlled tag: ${t}`);
  }
  for (const s of sources.values()) if (s.image_witness) {
    const w = s.image_witness;
    for (const value of [w.mirror.url, w.rights_statement_url]) {
      let url; try { url = new URL(value); } catch { fail('invalid witness URL'); }
      if (!['http:', 'https:'].includes(url.protocol)) fail('witness URL protocol');
    }
    if (w.metadata_image_pages.some(p => p > w.page_count)) fail('witness page outside artifact');
  }
  for (const s of segments.values()) {
    const source = reference(sources, s.source_ref, 'source_id');
    if (s.work_id !== source.work_id || s.edition_id !== source.edition_id) fail('segment edition/work mismatch');
    if (textHash(s.text) !== s.text_hash) fail('text hash mismatch');
    if (source.image_witness) {
      if (s.provenance.artifact_hash !== source.provenance.artifact_hash) fail('segment artifact differs from edition');
      if (s.locator.image_page > source.image_witness.page_count) fail('segment page outside artifact');
    }
  }
  for (const u of units.values()) {
    const { segment, text } = checkSpan(segments, u.segment_ref);
    if (sources.get(segment.source_ref.source_id).image_witness && u.provenance.artifact_hash !== segment.provenance.artifact_hash) fail('unit artifact differs from segment');
    if (own(u, 'original_text') && u.original_text !== text) fail('original_text differs from segment span');
    if (u.source_type !== (segment.text_role === 'original_body' ? 'classical_body' : 'historical_commentary')) fail('original/commentary role mismatch');
    if (!categories.has(u.category)) fail('unknown category');
    for (const field of ['applicable_conditions', 'exclusions', 'exceptions']) {
      const condition = u[field];
      if ((condition.status === 'specified') !== (condition.statements.length > 0)) fail(`${field}: status/statements mismatch`);
    }
    for (const rule of u.related_rule_ids) if (!ruleIds.includes(rule)) fail(`unknown r1 rule: ${rule}`);
    for (const relation of [...u.related_units, ...u.disputes]) {
      if (relation.target.knowledge_id === u.knowledge_id) fail('self relation');
      reference(units, relation.target, 'knowledge_id');
    }
    // Supersedes points to the prior snapshot, never a silently discarded historical revision.
    for (const ref of u.supersedes) {
      if (!previous) fail('supersedes requires previous corpus');
      reference(index(previous.units, 'knowledge_id'), ref, 'knowledge_id');
      if (ref.knowledge_id === u.knowledge_id && ref.revision >= u.revision) fail('supersedes must precede revision');
    }
  }
  for (const c of corpus.commentary) {
    if (!c.segment_refs.length && !c.knowledge_refs.length) fail('commentary requires a source/unit reference');
    c.segment_refs.forEach(ref => checkSpan(segments, ref));
    c.knowledge_refs.forEach(ref => reference(units, ref, 'knowledge_id'));
  }
  if (previous) {
    validateValue(previous, CORPUS_SCHEMA);
    for (let i = 0; i < sets.length; i++) for (const old of previous[sets[i]]) {
      if (recordHash(old) !== old.content_hash) fail('previous content hash mismatch');
      const current = maps[i].get(old[keys[i]]);
      if (!current) fail('records must be retired, not deleted');
      if (current.content_hash === old.content_hash) continue;
      if (current.revision !== old.revision + 1) fail('changed record must increment revision by one');
      if (i === 1 && current.text !== old.text && current.transcription_revision !== old.transcription_revision + 1) fail('changed text must increment transcription revision');
    }
    if (stableJson(corpus.catalog) !== stableJson(previous.catalog) && corpus.catalog.revision !== previous.catalog.revision + 1) fail('changed catalog must increment revision by one');
  }

  // Eligibility is stricter than structural validity. This is a validator result, not a runtime loader.
  const admitted = Object.fromEntries(sets.map(k => [k, []]));
  const excluded = [];
  const eligible = new Set();
  for (let i = 0; i < sets.length; i++) for (const r of corpus[sets[i]]) {
    const reasons = [];
    if (r.data_kind !== 'corpus') reasons.push('test_only');
    if (!reviewed(r)) reasons.push(`verification:${r.verification_status}`);
    if (['unknown', 'test_only'].includes(r.provenance.rights.status)) reasons.push('reuse_not_cleared');
    if ((r.contributors || []).some(c => c.certainty === 'disputed')) reasons.push('attribution_disputed');
    if (i === 0) {
      if (!r.edition.designation || !r.holding.repository || !r.holding.identifier || !r.contributors.length) reasons.push('incomplete_edition_provenance');
      if (!r.provenance.artifact_hash) reasons.push('source_artifact_not_pinned');
      if (requireImageWitness && !r.image_witness) reasons.push('image_witness_missing');
    } else if (i === 1) {
      if (!eligible.has(r.source_ref.source_id)) reasons.push('source_not_admitted');
      if (!precise(r.locator)) reasons.push('imprecise_locator');
      if (r.transcription_uncertainties?.length) reasons.push('transcription_uncertain');
      if (requireImageWitness && r.locator.image_page === null) reasons.push('image_page_missing');
    } else if (i === 2) {
      if (!eligible.has(r.segment_ref.segment_id)) reasons.push('segment_not_admitted');
      if (['applicable_conditions', 'exclusions', 'exceptions'].some(k => r[k].status === 'unreviewed')) reasons.push('conditions_unreviewed');
      if (r.disputes.length || corpus.units.some(u => u.disputes.some(d => d.target.knowledge_id === r.knowledge_id))) reasons.push('unresolved_dispute');
    } else {
      if (r.segment_refs.some(ref => !eligible.has(ref.segment_id)) || r.knowledge_refs.some(ref => !eligible.has(ref.knowledge_id))) reasons.push('reference_not_admitted');
    }
    const recordId = r[keys[i]];
    if (reasons.length) excluded.push({ id: recordId, reasons });
    else { admitted[sets[i]].push(recordId); eligible.add(recordId); }
  }
  return { valid: true, counts: Object.fromEntries(sets.map(k => [k, corpus[k].length])), admitted, excluded };
}
