// @vitest-environment node
import fs from 'node:fs';
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn} from '../../src/ai/output/session.js';
import {readingAvailability} from '../../src/ai/output/availability.js';
const plan=JSON.parse(fs.readFileSync('docs/acceptance/mapping-admission-live-20261006/plan.json'));
const prepare=(question,canonical=plan.cases[0].canonical,basis=4)=>prepareSelectedReadingTurn(createReadingSession(canonical),question,{judgmentPolicyVersion:6,basisPolicyVersion:basis});
test('uncovered question is a product capability limit, not a chart verdict',async()=>{
 const p=await prepare('这个网页能火吗？'),r=readingAvailability(p.context);
 expect(r.blocked).toBe(true);expect(r.kind).toBe('method_not_covered');expect(r.message).toContain('已经有卦盘');expect(r.message).toContain('功能覆盖不足');
 expect(p.context.input.C_canonical_cast.lines).toHaveLength(6);
});
test('missing corresponding chart relation is distinct from missing method coverage',async()=>{
 const p=await prepare('他能否帮助我整理旧书？',plan.cases[1].canonical);
 expect(readingAvailability(p.context).kind).toBe('chart_basis_missing');
});
test('admitted assistance is only observation; facts and advice remain available',async()=>{
 const p=await prepare('他能否帮助我整理旧书？');expect(readingAvailability(p.context)).toEqual({blocked:false,kind:'observation_only'});
 for(const q of ['只核对初爻六亲，不预测。','请给两项建议，不预测。'])expect(readingAvailability((await prepare(q)).context)).toEqual({blocked:false,kind:'available'});
 expect(readingAvailability((await prepare('这个网页能火吗？',plan.cases[0].canonical,0)).context).blocked).toBe(false);
});
test('lottery prediction boundary does not block fact checking or general advice',async()=>{
 expect(readingAvailability((await prepare('我今天打了五注双色球，这个彩票中奖的可能大不大？')).context).kind).toBe('lottery_prediction');
 for(const q of ['只核对初爻六亲，不预测双色球中奖。','请给两项建议，核对彩票票面，不预测。'])expect(readingAvailability((await prepare(q)).context).blocked).toBe(false);
});
