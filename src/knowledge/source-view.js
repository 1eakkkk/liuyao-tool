// Offline view data generated from the packet, never from model-authored quotations.
import { LITERATURE_PACKET_VERSION } from './packet.js';
export function literatureSourceViews(packet, literatureIds) {
  if (packet?.version !== LITERATURE_PACKET_VERSION || !Array.isArray(packet.cards) ||
      !Array.isArray(literatureIds) || literatureIds.some(id => typeof id !== 'string') ||
      new Set(literatureIds).size !== literatureIds.length) throw Error('Current packet and unique references required');
  const cards = new Map();
  for (const c of packet.cards) {
    if (cards.has(c.literature_id)) throw Error('Duplicate literature card');
    cards.set(c.literature_id, c);
  }
  return literatureIds.map(id => {
    const c = cards.get(id);
    if (!c || c.field_origins?.original_text !== 'source_transcription' ||
        ['editorial_summary', 'applicable_conditions', 'exclusions', 'exceptions', 'editorial_guidance']
          .some(field => c.field_origins[field] !== 'modern_editorial') ||
        typeof c.original_text !== 'string' || !c.original_text.trim()) throw Error('Missing reference or ambiguous field origins');
    return { literature_id: id,
      source: { label: '原文转录', source_type: c.source_type, text: c.original_text, citation: structuredClone(c.citation) },
      editorial: { label: '现代整理（不是古籍原文）', summary: c.editorial_summary,
        applicable_conditions: structuredClone(c.applicable_conditions), exclusions: structuredClone(c.exclusions),
        exceptions: structuredClone(c.exceptions), guidance: structuredClone(c.editorial_guidance),
        applicability_review: structuredClone(c.applicability_review) },
      limitation: '文献与现代整理均不证明当前个案结果；模型的出处归属仍需复核。' };
  });
}
