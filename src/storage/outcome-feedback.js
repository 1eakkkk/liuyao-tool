import { safeGetItem, safeSetItem } from './local.js';
import { historyTurnsOf, buildHistoryCastSnapshot } from './history.js';
import { hashOutput } from '../ai/output/context.js';

export const FEEDBACK_KEY = 'liuyao_outcome_feedback_v1';
export const OUTCOMES = { pending: '尚未发生', matches: '大体符合', partial: '部分符合', differs: '不符合', unclear: '无法判断' };

function snapshotCast(raw) {
  try {
    const cast = buildHistoryCastSnapshot(raw);
    if (!cast) return null;
    const scalar = (obj, keys) => Object.fromEntries(keys.filter(k =>
      obj[k] === null || ['string', 'number', 'boolean'].includes(typeof obj[k])).map(k => [k, obj[k]]));
    const fields = ['ganzhi','yearGanzhi','monthGanzhi','hourGanzhi','fourPillarsText','kongText','dateText','palaceText',
      'lowerUpperText','dayKongText','guaName','bianGuaName','source','rulesVersion','coinConvention',
      'castAnchorY','castAnchorM','castAnchorD','overallTrendText'];
    const lineFields = ['爻位','六亲','六神','纳甲','五行','状态','是否动爻','是否世爻','是否应爻','是否空亡',
      '变纳甲','变五行','变六亲','伏神六亲','伏神纳甲','伏神五行','月令','日辰关系','回头','进退神','伏神与飞神关系'];
    return { ...scalar(cast, fields), lines: cast.lines.map(line => scalar(line, lineFields)) };
  }
  catch { return null; } // Legacy incomplete plates must not block reading or recording the answer.
}

export function feedbackSnapshot(record) {
  const answer = historyTurnsOf(record).find(t => t.role === 'assistant')?.text;
  if (!answer || record.type === 'prompt') return null;
  return { historyId: String(record.id), readingAt: record.ts ?? null,
    question: String(record.question || historyTurnsOf(record)[0]?.text || ''),
    answer: String(answer), cast: snapshotCast(record.cast) };
}

export function loadFeedback() {
  try {
    const raw = safeGetItem(FEEDBACK_KEY);
    if (!raw) return { entries: [], writable: true };
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.entries) || data.entries.some(e =>
      !e || typeof e.historyId !== 'string' || typeof e.snapshotHash !== 'string' || !e.snapshot ||
      typeof e.snapshot.answer !== 'string' || typeof e.snapshot.question !== 'string' ||
      typeof e.note !== 'string' || !Object.hasOwn(OUTCOMES, e.outcome))) throw Error('Invalid feedback');
    return { entries: data.entries, writable: true };
  } catch { return { entries: [], writable: false }; }
}

export async function saveFeedback(record, { outcome, note, observedOn }) {
  const snapshot = feedbackSnapshot(record);
  if (!snapshot || !Object.hasOwn(OUTCOMES, outcome) || typeof note !== 'string' || note.length > 2000 ||
    (observedOn && !/^\d{4}-\d{2}-\d{2}$/.test(observedOn))) return false;
  const snapshotHash = await hashOutput(snapshot);
  // Re-read after hashing so concurrent saves do not overwrite another record.
  const data = loadFeedback();
  if (!data.writable) return false;
  const previous = data.entries.find(e => e.historyId === snapshot.historyId);
  // A changed original answer requires a new history record; never silently rebind feedback.
  if (previous && previous.snapshotHash !== snapshotHash) return false;
  const entry = { historyId: snapshot.historyId, snapshotHash, snapshot,
    outcome, note: note.trim(), observedOn: observedOn || '',
    createdAt: previous?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(),
    kind: 'retrospective_user_feedback' };
  const entries = data.entries.filter(e => e.historyId !== snapshot.historyId).concat(entry);
  return safeSetItem(FEEDBACK_KEY, JSON.stringify({ version: 1, entries }));
}

// Allowlisted export: never serialize the raw history record or local settings.
export function feedbackExport(entry) {
  const s = entry.snapshot;
  return { version: 1, kind: 'retrospective_user_feedback', warning: '本机用户事后反馈；不是预测准确率或可信时间戳。',
    snapshotHash: entry.snapshotHash, snapshot: { historyId: s.historyId, readingAt: s.readingAt,
      question: s.question, answer: s.answer, cast: snapshotCast(s.cast) },
    feedback: { outcome: entry.outcome, note: entry.note, observedOn: entry.observedOn,
      createdAt: entry.createdAt, updatedAt: entry.updatedAt } };
}
