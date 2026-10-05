import { loadHistory, saveHistory, buildHistoryCastSnapshot, loadLifetimeStats } from './history.js';
import { evidenceText, outputIssueText } from '../ai/output/view.js';
import { collectEvidencePresentation } from '../ai/output/evidence-presentation.js';
import {backgroundText} from '../ai/output/background-view.js';

export function readingHistoryText(turn) {
  if (turn.result.status !== 'validated') {const sources=backgroundText(turn.context.input.background_search);return `未完成或未通过格式与引用检查：\n${outputIssueText(turn.result)}\n\n${turn.result.display_text}${sources?'\n\n'+sources:''}`;}
  const answer = turn.result.answer;
  const parts = [answer.answer, `判断倾向：${{favorable:'偏有利',unfavorable:'偏不利',mixed:'利弊并存',unclear:'暂不明确'}[answer.direction]}`, '以下为 AI 判断；格式与引用检查不代表预测正确。规则和其来源事实不重复计为依据。'];
  const citations = ids => {
    const presentation = collectEvidencePresentation(turn.context.evidence, ids);
    return [...presentation.facts.map(f => `事实 ${f.number} · 程序事实：${evidenceText(f.entry)}`),
      ...presentation.rules.map(r => `规则标注：${evidenceText(r.entry)}\n  来源：${r.sourceNumbers.map(n => `事实 ${n}`).join('、')}（本段列表）`)].join('\n');
  };
  const add = (title, text, ids = []) => parts.push(`${title}：${text}\n${ids.length ? citations(ids) : ''}`);
  for (const factor of answer.factors) add({support:'支持因素',oppose:'不利因素',neutral:'中性因素',conditional:'条件因素'}[factor.assessment], factor.interpretation, factor.evidence_ids);
  for (const candidate of answer.yongshen_candidates) add(`用神候选 ${candidate.relative}`, `${candidate.targets.map(t => `第${t.line}爻（${{primary:'本爻',changed:'变爻',hidden:'伏神'}[t.component]}）`).join('、')}。${candidate.reason}`, candidate.evidence_ids);
  for (const timing of answer.timing_candidates) add(`应期候选 ${timing.candidate}`, timing.reason, timing.evidence_ids);
  add('不确定性', answer.uncertainties.join('\n'));
  if(turn.context.input.background_search)parts.push(backgroundText(turn.context.input.background_search));
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
  if (pending) {const sources=backgroundText(pending.context?.input.background_search);turns.push({role:'user', text:pending.question+(sources?'\n\n'+sources:''), ts});}
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
