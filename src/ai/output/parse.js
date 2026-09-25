import { MAX_RESPONSE_CHARS, OutputError, validateOutputShape } from './contract.js';
import { isOutputContext } from './context.js';

function references(answer) {
  return [...answer.factors, ...answer.yongshen_candidates, ...answer.timing_candidates];
}
export function validateOutputAnswer(answer, context) {
  if (!isOutputContext(context)) throw new OutputError('untrusted_context');
  validateOutputShape(answer);
  if (answer.context_id !== context.context_id) throw new OutputError('context_mismatch', '$.context_id');
  const registry = new Map(context.evidence.map(e => [e.id, e]));
  for (const item of references(answer)) for (const id of item.evidence_ids)
    if (!registry.has(id)) throw new OutputError('unknown_evidence', '$.evidence_ids');
  for (const candidate of answer.yongshen_candidates) for (const target of candidate.targets) {
    const line = context.input.C_canonical_cast.lines[target.line - 1];
    const record = target.component === 'primary' ? line : line[target.component];
    if (!record || record.relative !== candidate.relative) throw new OutputError('target_relative_mismatch', '$.yongshen_candidates');
    const pointer = `/lines/${target.line - 1}/${target.component === 'primary' ? '' : target.component + '/'}relative`;
    if (!candidate.evidence_ids.includes(`fact:${pointer}`)) throw new OutputError('missing_target_evidence', '$.yongshen_candidates');
  }
  return answer;
}

// Strict JSON only. Never silently extract a fragment, repair fields, or retry a paid call.
// JSON.parse silently accepts repeated keys. Reject ambiguous objects, including
// escaped spellings of the same key, before treating any response as validated.
function hasDuplicateKeys(raw) {
  const stack = [];
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '{') stack.push({ keys: new Set(), keyExpected: true });
    else if (char === '[') stack.push(null);
    else if (char === '}' || char === ']') stack.pop();
    else if (char === ',' && stack.at(-1)) stack.at(-1).keyExpected = true;
    else if (char === '"') {
      const start = i;
      for (i++; i < raw.length; i++) { if (raw[i] === '\\') i++; else if (raw[i] === '"') break; }
      const frame = stack.at(-1);
      if (frame?.keyExpected) {
        const key = JSON.parse(raw.slice(start, i + 1));
        if (frame.keys.has(key)) return true;
        frame.keys.add(key); frame.keyExpected = false;
      }
    }
  }
  return false;
}
export function parseOutputAnswer(rawText, context, { completed = false } = {}) {
  if (!isOutputContext(context)) throw new OutputError('untrusted_context');
  if (typeof rawText !== 'string') throw new OutputError('invalid_response_type');
  const plain = (code, path = '$') => ({ status: 'fallback', validation: 'not_validated',
    answer: null, display_text: rawText.slice(0, MAX_RESPONSE_CHARS),
    truncated: rawText.length > MAX_RESPONSE_CHARS, issues: [{ code, path }],
    notice: '本次回复未通过结构与引用校验，以下仅保留原始文本。' });
  if (rawText.length > MAX_RESPONSE_CHARS) return plain('response_too_large');
  if (!completed) return plain('incomplete_response');
  let answer;
  try { answer = JSON.parse(rawText); } catch { return plain('invalid_json'); }
  if (hasDuplicateKeys(rawText)) return plain('duplicate_field');
  try {
    validateOutputAnswer(answer, context);
    return { status: 'validated', validation: 'structure_and_references_only',
      answer, display_text: answer.answer, truncated: false, issues: [],
      notice: '格式与引用已核对；AI 的解释和预测尚未经事实效果验证。' };
  } catch (error) {
    if (!(error instanceof OutputError)) throw error;
    return plain(error.code, error.path);
  }
}

export function createOutputCollector(context) {
  if (!isOutputContext(context)) throw new OutputError('untrusted_context');
  let text = '', closed = false, exceeded = false;
  return {
    get rawText() { return text; },
    append(delta) {
      if (closed) throw new OutputError('collector_closed');
      if (typeof delta !== 'string') throw new OutputError('invalid_response_type');
      if (text.length + delta.length > MAX_RESPONSE_CHARS) exceeded = true;
      text += delta.slice(0, Math.max(0, MAX_RESPONSE_CHARS + 1 - text.length));
      return { status: 'pending', characters: text.length }; // Never expose half a validated card.
    },
    finish({ finishReason = null, sawDone = false, interrupted = false } = {}) {
      if (closed) throw new OutputError('collector_closed');
      closed = true;
      const result = parseOutputAnswer(text, context, { completed: sawDone && finishReason === 'stop' && !interrupted });
      if (exceeded && !result.truncated) throw new OutputError('collector_limit_invariant');
      return result;
    },
  };
}
