import { loadHistory, saveHistory, buildHistoryCastSnapshot, loadLifetimeStats } from './history.js';
import { evidenceText } from '../ai/output/view.js';

export function readingHistoryText(turn) {
  if (turn.result.status !== 'validated') return `未完成或未通过格式与引用检查：\n${turn.result.display_text}`;
  const answer = turn.result.answer;
  const evidence = new Map(turn.context.evidence.map(e => [e.id, e]));
  const parts = [answer.answer, '以下为 AI 判断；格式与引用检查不代表预测正确。'];
  const add = (title, text, ids = []) => parts.push(`${title}：${text}\n${ids.map(id => evidenceText(evidence.get(id))).join('\n')}`);
  for (const factor of answer.factors) add('依据', factor.interpretation, factor.evidence_ids);
  for (const candidate of answer.yongshen_candidates) add(`用神候选 ${candidate.relative}`, `${candidate.targets.map(t => `第${t.line}爻（${{primary:'本爻',changed:'变爻',hidden:'伏神'}[t.component]}）`).join('、')}。${candidate.reason}`, candidate.evidence_ids);
  for (const timing of answer.timing_candidates) add(`应期候选 ${timing.candidate}`, timing.reason, timing.evidence_ids);
  add('不确定性', answer.uncertainties.join('\n'));
  return parts.join('\n\n');
}

// One conversation, one record. Archiving never increments paid usage.
export function archiveReading(session, pending) {
  if (session.historySuppressed || (!session.turns.length && !pending)) return true;
  const list = loadHistory(), index = list.findIndex(r => r.id === session.historyId);
  const ts = index >= 0 ? list[index].ts : Date.now();
  const turns = session.turns.flatMap(turn => [
    {role:'user', text:turn.question, ts},
    {role:'assistant', text:readingHistoryText(turn), ts}
  ]);
  if (pending) turns.push({role:'user', text:pending.question, ts});
  const record = {id:session.historyId, ts, type:session.turns.length ? 'structured' : 'prompt', readingMode:'structured',
    question:session.canonical.question.text, cast:buildHistoryCastSnapshot(session.canonical), turns,
    costYuan:session.turns.reduce((n,t)=>n+(t.usage?.cost || 0),0),
    totalTokens:session.turns.reduce((n,t)=>n+(t.usage?.total || 0),0),
    externalOnly:session.turns.every(t=>t.source==='external'),
    styleLabel:{brief:'简洁',deep:'详细',custom:'自定义'}[session.preferences?.style],
    styleCustomText:session.preferences?.style === 'custom' ? session.preferences.custom : ''};
  // Seed existing usage before adding restored records, so migration is not charged again.
  loadLifetimeStats();
  if (index >= 0) list[index] = record; else list.push(record);
  return saveHistory(list);
}
