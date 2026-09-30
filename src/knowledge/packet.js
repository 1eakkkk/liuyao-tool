// Offline, explicit literature selection. Never decides question intent or cast facts.
import { retrieve } from './retrieve.js';
import { stableJson, textHash } from './validate.js';
import { editorialGuidance } from './guidance.js';
import { compareIds } from './dedupe.js';

export const LITERATURE_PACKET_VERSION = 'explicit-literature-packet-dev-2';
const length = value => [...stableJson(value)].length;

export function literatureCards(index) {
  return retrieve(index, { limit: 100 }).selected.map(({ unit, citation, same_proposition_ids }) => ({
    knowledge_id: unit.knowledge_id,
    literature_id: `literature:${unit.knowledge_id}`,
    source_type: unit.source_type,
    original_text: unit.original_text,
    editorial_summary: unit.normalized_statement,
    applicable_conditions: structuredClone(unit.applicable_conditions),
    exclusions: structuredClone(unit.exclusions),
    exceptions: structuredClone(unit.exceptions),
    citation: structuredClone(citation),
    same_proposition_ids: [...same_proposition_ids],
    independent_evidence: false,
    predictive_validation: 'not_established',
    editorial_guidance: editorialGuidance(unit.knowledge_id),
    field_origins: {
      original_text: 'source_transcription',
      editorial_summary: 'modern_editorial',
      applicable_conditions: 'modern_editorial', exclusions: 'modern_editorial', exceptions: 'modern_editorial',
      editorial_guidance: 'modern_editorial'
    }
  }));
}

// Applicability is a caller's explicit review decision, not a keyword match or proof.
export function buildLiteraturePacket(index, selections, { maxUnits = 4, maxCodePoints = 8000 } = {}) {
  if (!Array.isArray(selections) || selections.length > 100) throw Error('Invalid selections');
  if (!Number.isSafeInteger(maxUnits) || maxUnits < 0 || maxUnits > 4 ||
      !Number.isSafeInteger(maxCodePoints) || maxCodePoints < 512 || maxCodePoints > 20000)
    throw Error('Invalid literature budget');
  const cards = literatureCards(index), seen = new Set();
  for (const s of selections) {
    if (!s || Object.keys(s).sort().join(',') !== 'knowledge_id,reason,status' ||
        typeof s.knowledge_id !== 'string' || seen.has(s.knowledge_id) ||
        !['confirmed', 'uncertain', 'not_applicable'].includes(s.status) ||
        typeof s.reason !== 'string' || !s.reason.trim() || [...s.reason].length > 500)
      throw Error('Invalid or duplicate applicability decision');
    seen.add(s.knowledge_id);
  }
  const packet = { version: LITERATURE_PACKET_VERSION, corpus_version: index.corpus_version,
    corpus_hash: index.corpus_hash, mode: 'offline_explicit_review',
    selection_semantics: 'Caller-reviewed applicability; not automatic or independently verified',
    independent_evidence: false, cards: [] };
  const excluded = [];
  for (const s of [...selections].sort((a, b) => compareIds(a.knowledge_id, b.knowledge_id))) {
    const card = cards.find(c => c.same_proposition_ids.includes(s.knowledge_id));
    let reason;
    if (!card) reason = 'not_admitted';
    else if (s.status !== 'confirmed') reason = s.status;
    else if (packet.cards.some(c => c.knowledge_id === card.knowledge_id)) reason = 'same_proposition';
    else if (packet.cards.length >= maxUnits) reason = 'unit_budget';
    else {
      const entry = { ...structuredClone(card), applicability_review: { status: s.status, reason: s.reason } };
      const proposed = { ...packet, cards: [...packet.cards, entry] };
      if (length(proposed) > maxCodePoints) reason = 'text_budget';
      else packet.cards.push(entry);
    }
    if (reason) excluded.push({ knowledge_id: s.knowledge_id, reason });
  }
  if (length(packet) > maxCodePoints) throw Error('Budget smaller than empty packet');
  // Hash/budget cover the complete serialized input packet. Exclusions stay audit-only.
  return { packet, packet_hash: textHash(stableJson(packet)), code_points: length(packet), excluded };
}
