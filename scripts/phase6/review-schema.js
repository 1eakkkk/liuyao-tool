import { validateAiValue } from '../../src/ai/schemas.js';
export const METRICS = ['fact_errors', 'relation_errors', 'relevant_omissions', 'fact_overrides', 'contradictions', 'double_counting'];
export const TURNS = ['initial', 'follow_up'];
const str = { type: 'string' }, arr = items => ({ type: 'array', items });
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const quote = obj({ turn: { enum: TURNS }, start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 }, text: str });
const finding = obj({ finding_id: str, turn: { enum: [...TURNS, 'cross_turn'] }, quotes: arr(quote), fact_ids: arr(str),
  checklist_id: { type: ['string', 'null'] }, direction_error: { type: 'boolean' }, reason: str });
export const REVIEW_SCHEMA = obj({ rubric_version: { const: 'blind-review-v1' }, reviews: arr(obj({
  case_id: str, variant: { enum: ['A', 'B'] }, reviewer_id: str, review_status: { enum: ['pending', 'complete'] },
  blinding_compromised: { type: 'boolean' }, blinding_note: str, notes: str,
  ...Object.fromEntries([...METRICS, 'uncertain'].map(key => [key, arr(finding)])),
  checklist_assessments: arr(obj({ checklist_id: str, turn: { enum: TURNS }, assessment: { enum: ['pending', 'used', 'omitted', 'uncertain'] }, reason: str })),
})) });
// Conservative marker detection is a backstop, not a substitute for the reviewer's judgment.
export const revealsTreatment = text => /E_rule_results|canonical_annotation|\benabled\b|\bhits\b|Rules\s*(?:ON|OFF)|规则(?:层|引擎|命中)|标准化索引|对照组|实验组/i.test(text);
export function reviewTemplate(packet) {
  return { rubric_version: 'blind-review-v1', reviews: packet.cases.flatMap(c => c.answers.map(a => ({
    case_id: c.case_id, variant: a.variant, reviewer_id: '', review_status: 'pending',
    blinding_compromised: TURNS.some(t => revealsTreatment(a[t])), blinding_note: '', notes: '',
    ...Object.fromEntries([...METRICS, 'uncertain'].map(key => [key, []])),
    checklist_assessments: c.checklist.flatMap(item => item.turns.map(turn => ({ checklist_id: item.checklist_id, turn, assessment: 'pending', reason: '' }))),
  }))) };
}
const require = (ok, message) => { if (!ok) throw Error(message); };
export function validateReviews(document, packet) {
  validateAiValue(document, REVIEW_SCHEMA);
  const expectedCount = packet.cases.reduce((n, c) => n + c.answers.length, 0);
  require(document.reviews.length === expectedCount, 'Every anonymous answer pair must be reviewed');
  const seen = new Set();
  for (const review of document.reviews) {
    const key = `${review.case_id}-${review.variant}`;
    require(!seen.has(key), 'Duplicate review'); seen.add(key);
    const c = packet.cases.find(c => c.case_id === review.case_id), answer = c?.answers.find(a => a.variant === review.variant);
    require(answer && review.review_status === 'complete' && review.reviewer_id.trim(), 'Review is incomplete or unknown');
    const leaked = TURNS.some(t => revealsTreatment(answer[t]));
    require(!leaked || review.blinding_compromised, 'Answer may reveal treatment: mark blinding_compromised');
    require(!review.blinding_compromised || review.blinding_note.trim(), 'Explain compromised blinding');
    const factIds = new Set(c.facts.map(f => f.fact_id)), sharedFindings = new Map();
    for (const category of [...METRICS, 'uncertain']) {
      const ids = new Set();
      for (const f of review[category]) {
        require(f.finding_id.trim() && !ids.has(f.finding_id) && f.reason.trim(), 'Finding needs unique id and reason'); ids.add(f.finding_id);
        const serialized = JSON.stringify(f);
        require(!sharedFindings.has(f.finding_id) || sharedFindings.get(f.finding_id) === serialized, 'Shared finding id must identify the same incident');
        sharedFindings.set(f.finding_id, serialized);
        require(new Set(f.fact_ids).size === f.fact_ids.length && f.fact_ids.every(id => factIds.has(id)), 'Unknown or duplicate fact reference');
        require(!['fact_errors', 'relation_errors', 'fact_overrides'].includes(category) || f.fact_ids.length, 'Factual finding needs neutral fact reference');
        require(['relevant_omissions', 'uncertain'].includes(category) || f.quotes.length, 'Finding needs original quotation');
        for (const q of f.quotes) {
          require(q.end > q.start && q.text.length && answer[q.turn].slice(q.start, q.end) === q.text, 'Quotation does not match raw answer (UTF-16 offsets)');
          require(f.turn === 'cross_turn' || q.turn === f.turn, 'Quotation turn mismatch');
        }
        if (category === 'contradictions') {
          require(f.quotes.length >= 2, 'Contradiction requires both conflicting quotations');
          if (f.turn === 'cross_turn') require(new Set(f.quotes.map(q => q.turn)).size === 2, 'Cross-turn contradiction requires both turns');
        }
        if (f.checklist_id !== null) require(c.checklist.some(item => item.checklist_id === f.checklist_id), 'Unknown checklist reference');
        if (category === 'relevant_omissions') require(f.checklist_id !== null && f.turn !== 'cross_turn', 'Omission requires frozen checklist and turn');
      }
    }
    for (const category of [...METRICS, 'uncertain']) for (const f of review[category]) require(!f.direction_error || review.relation_errors.some(r => r.finding_id === f.finding_id), 'Direction errors must also be indexed in relation_errors');
    const assessments = new Map();
    for (const a of review.checklist_assessments) {
      const item = c.checklist.find(item => item.checklist_id === a.checklist_id), id = `${a.checklist_id}:${a.turn}`;
      require(item?.turns.includes(a.turn) && !assessments.has(id) && a.assessment !== 'pending' && a.reason.trim(), 'Checklist assessment incomplete, duplicate or unknown');
      assessments.set(id, a);
      const omissions = review.relevant_omissions.filter(f => f.checklist_id === a.checklist_id && f.turn === a.turn);
      require(omissions.length === (a.assessment === 'omitted' ? 1 : 0), 'Omission must match frozen checklist assessment exactly');
      if (a.assessment === 'uncertain') require(review.uncertain.some(f => f.checklist_id === a.checklist_id && f.turn === a.turn), 'Uncertain assessment needs uncertain finding');
    }
    require(assessments.size === c.checklist.reduce((n, i) => n + i.turns.length, 0), 'All frozen checklist items must be assessed');
  }
  return document;
}
