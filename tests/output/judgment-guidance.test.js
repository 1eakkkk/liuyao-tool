// @vitest-environment node
import {test,expect} from 'vitest';
import fs from 'node:fs';
import {createReadingSession,prepareReadingTurn,readingExport,serializeReadingSession,restoreReadingSession,appendReadingTurn} from '../../src/ai/output/session.js';
import {readingRequestBody} from '../../src/ai/output/client.js';
import {syntheticOutput} from '../../experiments/structured-output/example.js';
import {calculateCast} from '../../src/core/casting.js';
import {lineFromSum} from '../../src/core/physics.js';
import {JIAZI60} from '../../src/core/constants.js';
import {upgradeOverviewText,overviewEnding} from '../../src/core/overview.js';
const fixture=JSON.parse(fs.readFileSync(new URL('../../experiments/phase7/fixtures/compat-1.json',import.meta.url)));
test.each([
  {sums:[8,9,7,9,9,8],counts:'4爻、当令减力(休/囚/死)2爻',ending:'当令得力爻数量较多'},
  {sums:[7,8,7,8,8,9],counts:'2爻、当令减力(休/囚/死)4爻',ending:'当令减力爻数量较多'},
])('opposite user-feedback counts have distinct factual summaries: $ending',({sums,counts,ending})=>{
  const {cast}=calculateCast(sums.map(lineFromSum),'manual',{now:new Date('2026-10-01T22:00:00+08:00'),day:JIAZI60.find(d=>d.label==='戊申'),ymh:{yearLabel:'丙午',monthLabel:'丁酉',hourLabel:'癸亥'},dateText:'反馈案例'},'date');
  expect(cast.overallTrendText).toContain(counts);expect(cast.overallTrendText).toContain(ending);
  expect(cast.overallTrendText).not.toContain('爻数相当');expect(cast.overallTrendText).toContain('不代表整体吉凶');
});
test('equal and missing seasonal data are distinct; historical overview display is corrected without changing the record',()=>{
  expect(overviewEnding(3,3)).toContain('两类爻数量相同');
  expect(overviewEnding(0,0)).toContain('月令信息不足');
  const original={text:'当令得力(旺/相)4爻、当令减力(休/囚/死)2爻；世应：应克世——当令得力与减力的爻数相当，旺衰不算悬殊，具体判断还要结合用神细看'};
  const saved=JSON.stringify(original),corrected=upgradeOverviewText(original.text);
  expect(corrected).toContain('世应：应克世');expect(corrected).toContain('当令得力爻数量较多');
  expect(upgradeOverviewText(corrected)).toBe(corrected);expect(JSON.stringify(original)).toBe(saved);
  expect(upgradeOverviewText('旧记录没有该摘要')).toBe('旧记录没有该摘要');
});
test('new API and exported prompts share guidance and retain the same identity after restoration',async()=>{
  const session=createReadingSession(fixture),p=await prepareReadingTurn(session,'我的游戏段位能提升吗？');
  expect(session.prompt).toBe('reading-production-4');
  expect(readingRequestBody(p).messages).toEqual(p.messages);
  expect(readingExport(p)).toContain(p.messages[0].content);expect(readingExport(p)).toContain(p.messages[1].content);
  expect(p.messages[0].content).toContain('一般建议，不当成盘面支持');
  expect(p.messages[0].content).toContain('不为了结论多样而强行判吉凶');
  expect(p.messages[0].content).toContain('不可把所有回头克一律判不利');
  expect(p.context.input.C_canonical_cast.display).not.toHaveProperty('overall_trend_text');
  const restored=await restoreReadingSession(serializeReadingSession(session,p.question));
  expect(restored.pending.messages).toEqual(p.messages);expect(restored.pending.context.context_id).toBe(p.context.context_id);
});
test('production-3 remains readable with its previous guidance and identity rather than silently adopting version 4',async()=>{
  const s=createReadingSession(fixture);s.prompt='reading-production-3';
  const p=await prepareReadingTurn(s,'核对动静');expect(p.messages[0].content).not.toContain('本轮判断指引 reading-production-4');
  expect(p.messages[0].content).toContain('本轮可靠性要求');
  const restored=await restoreReadingSession(serializeReadingSession(s,p.question));
  expect(restored.session.prompt).toBe('reading-production-3');expect(restored.pending.messages).toEqual(p.messages);
});
test.each(['favorable','unfavorable','mixed','unclear'])('direction remains a model claim, not an automatic score: %s',async direction=>{
  const s=createReadingSession(fixture),p=await prepareReadingTurn(s,'解释本卦');
  const a=syntheticOutput(p.context);a.direction=direction;
  const result=appendReadingTurn(s,p,JSON.stringify(a),true,'external').result;
  expect(result.status).toBe('validated');expect(result.answer.direction).toBe(direction);
  // Format acceptance does not certify a semantic justification for any label.
});
