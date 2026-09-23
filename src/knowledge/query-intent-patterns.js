// Offline, auditable phrase recognition. These are terminology patterns, never cast facts.
export const QUERY_INTENT_PATTERNS_VERSION = 'query-intent-patterns-1.0';
export const QUERY_INTENT_PATTERNS = Object.freeze([
  { text: '与月建相合', concept_id: 'month-combine', why: 'Explicit month-branch combination relation.' },
  { text: '日辰冲', concept_id: 'day-clash', why: 'Explicit day-branch clash relation.' },
  { text: '日辰合', concept_id: 'day-combine', why: 'Explicit day-branch combination relation.' },
  { text: '日旬里缺的两支', concept_id: 'xunkong', why: 'Explicit two missing branches of the day cycle.' },
  { text: '落在日旬缺的地支里', concept_id: 'xunkong', why: 'Explicit branch missing from the day cycle.' },
  { text: '反过来生原爻', concept_id: 'return-relation', why: 'Explicit changed-line return generation.' },
  { text: '回头生', concept_id: 'return-relation', why: 'Named return relation.' },
  { text: '回頭生', concept_id: 'return-relation', why: 'Traditional spelling of named return relation.' },
  { text: '回头克', concept_id: 'return-relation', why: 'Named return relation.' },
  { text: '回頭克', concept_id: 'return-relation', why: 'Traditional spelling of named return relation.' },
  { text: '世爻', requires: '应爻', concept_id: 'shi-ying',
    why: 'The paired 世/应 mention, not 世爻 alone, identifies a 世应 relationship request.' },
]);

export const QUERY_INTENT_PAIR_PATTERNS = Object.freeze([
  { left: '飞神', right: '伏神', max_between: 8, concept_id: 'flying-hidden',
    why: 'A bounded flying-to-hidden pair identifies the relation without fixing intervening words.' },
  { left: '伏神', right: '飞神', max_between: 8, concept_id: 'flying-hidden',
    why: 'The reverse named pair identifies the same relation.' },
]);

export const QUERY_CONTEXTUAL_SPAN_CUES = Object.freeze([
  { side: 'prefix', text: '一般', role: 'theory', why: 'General definition cue before a registered term.' },
  { side: 'suffix', text: '的通常含义', role: 'theory', why: 'General definition cue after a registered term.' },
  { side: 'prefix', text: '这卦的', role: 'case', why: 'Current-cast cue before a registered term.' },
  { side: 'prefix', text: '本卦', role: 'case', why: 'Current-cast cue before a registered term.' },
]);

// A typo or an isolated character is evidence of uncertainty, not a catalog synonym.
export const UNRESOLVED_TERMS = Object.freeze([
  { text: '近神', reason: 'possible_typo', candidate_concepts: ['advance'],
    why: 'Unregistered near-homophone; retain uncertainty rather than autocorrect.' },
  { pattern: /(?:往前|向前)进.{0,3}标注/g, reason: 'insufficient_context', candidate_concepts: ['advance'],
    why: 'A bounded colloquial direction phrase does not establish the technical 进神 term.' },
]);
