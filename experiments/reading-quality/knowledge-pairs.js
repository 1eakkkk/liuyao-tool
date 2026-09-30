import fs from 'node:fs';
import { normalizeLegacyCast } from '../../src/core/normalize.js';
import { buildOutputContext } from '../../src/ai/output/context.js';
import { loadCorpus } from '../../src/knowledge/load.js';
import { buildLiteraturePacket } from '../../src/knowledge/packet.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { layeredOutputInstructions, LAYERED_OUTPUT_VERSION, LAYERED_INSTRUCTIONS_VERSION } from './layered-output.js';
import { stableJson, textHash } from '../../src/knowledge/validate.js';
import { scopeReadingEvidence } from './scope-evidence.js';

export const PAIR_VERSION = 'explicit-literature-pairs-dev-3';
export const INPUT_TOKEN_ALLOWANCE = 50000;
export const MAX_OUTPUT_TOKENS = 4096;
export const RESERVE_RATES = Object.freeze({ input: 3, output: 10 });
export const CHECKED_PEAK_RATES = Object.freeze({ input: 2, output: 8 });
const specs = [
  { id: 'month-break', index: 0, line: 3, unit: 'zsby-month-clash-001', rule: 'MONTH-CLASH-001',
    question: '仅核对本盘第三爻与月建相冲的标注，解释月破名称。月破是否意味着这个爻永久无用、事情必然失败？不选用神、不判断成败、不推应期。',
    reason: '问题明确要求解释月破名称；当前程序已有第三爻月建相冲记录，不借此判断个案效力。' },
  { id: 'month-combine', index: 11, line: 1, unit: 'zsby-month-combine-001', rule: 'MONTH-COMBINE-001',
    question: '仅核对本盘初爻与月建六合的标注，解释月合名称。月合是否就证明本爻实际有用、事情一定成功？不选用神、不判断成败、不推应期。',
    reason: '问题明确要求解释月合名称与评价边界；当前初爻已有月建六合记录，不能据此确认个案效力。' },
  { id: 'void', index: 0, line: 5, unit: 'zsby-void-definition-001', rule: 'LINE-VOID-001',
    question: '仅核对本盘第五爻旬空标注，解释甲子旬空亡的历法名称。旬空是否等于完全无用，出空当天是否必成？不讨论真空假空、不选用神、不推日期。',
    reason: '程序日柱为甲子，问题仅要求甲子旬空亡的名称，第五爻已有旬空记录；与原文甲子旬例对应，不扩展到实际效力。' }
];
export async function prepareKnowledgePairs({ profile = 'three-pairs' } = {}) {
  if (!['three-pairs', 'one-pair'].includes(profile)) throw Error('Unknown pilot profile');
  const allowance = profile === 'one-pair' ? 30000 : INPUT_TOKEN_ALLOWANCE;
  const reservationRates = profile === 'one-pair' ? CHECKED_PEAK_RATES : RESERVE_RATES;
  const fixtures = JSON.parse(fs.readFileSync(new URL('../../tests/regression/fixtures/casts.json', import.meta.url)));
  const index = loadCorpus(undefined, { ruleIds: RULES.map(r => r.rule_id), rulesetVersion: RULESET_VERSION });
  const cases = [];
  for (const spec of profile === 'one-pair' ? specs.slice(0, 1) : specs) {
    const canonical = normalizeLegacyCast(fixtures[spec.index].expected.cast, { question: spec.question, createdAt: 0 });
    const context = await buildOutputContext(canonical);
    const expectedLine = spec.line;
    const hit = context.evidence.find(e => e.rule_id === spec.rule && e.target.line === expectedLine);
    if (!hit) throw Error('Development fixture no longer has the target fact');
    const explicitFacts = [`fact:/lines/${expectedLine - 1}/position`];
    if (spec.id === 'void') explicitFacts.push('fact:/calendar/day_ganzhi', 'fact:/calendar/kongwang/0',
      'fact:/calendar/kongwang/1', `fact:/lines/${expectedLine - 1}/branch`);
    const scoped = scopeReadingEvidence(context.evidence, { fact_ids: explicitFacts, rule_ids: [hit.id], reason: spec.reason });
    if (spec.id === 'void' && scoped.evidence.find(e => e.id === 'fact:/calendar/day_ganzhi')?.value !== '甲子')
      throw Error('Void example no longer matches source scope');
    const selections = [{ knowledge_id: spec.unit, status: 'confirmed', reason: spec.reason }];
    const arms = ['without-literature', 'with-literature'].map(arm => {
      const material = buildLiteraturePacket(index, arm === 'with-literature' ? selections : []);
      if (material.packet.cards.length !== Number(arm === 'with-literature')) throw Error('Selection was excluded');
      const payload = { question: spec.question, evidence: scoped.evidence, literature_packet: material.packet,
        scope_note: '这些是人工复核后为当前窄问题选取的事实；未提供的字段不代表盘中不存在。仅核对所提供事实，不能据此作全盘综合解读。' };
      const body = { model: 'deepseek-flash', thinking: { type: 'disabled' }, max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: 'json_object' }, stream: false,
        messages: [{ role: 'system', content: layeredOutputInstructions() + '\n只复制回答本问题所需的事实，不必枚举全盘；不要新增未要求的用神、应期、成败判断。' },
          { role: 'user', content: stableJson(payload) }] };
      const inputBytesWithAllowance = Buffer.byteLength(JSON.stringify(body.messages), 'utf8') + 4096;
      if (inputBytesWithAllowance > allowance) throw Error('Input exceeds conservative reservation');
      return { id: `${spec.id}-${arm}`, arm, material, body, input_bytes_with_allowance: inputBytesWithAllowance };
    });
    cases.push({ id: spec.id, question: spec.question, context_id: context.context_id, evidence: scoped.evidence, scope_audit: scoped.audit,
      target_fact_ids: hit.source_facts, selections, arms });
  }
  return { version: PAIR_VERSION, profile, output_version: LAYERED_OUTPUT_VERSION, instructions_version: LAYERED_INSTRUCTIONS_VERSION,
    scope: `${cases.length} exposed development cases; same output protocol with/without explicit literature, not old-versus-new or blind acceptance`,
    model: 'deepseek-flash', price_checked: '2026-09-30', price_source: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
    checked_peak_cny_per_million: CHECKED_PEAK_RATES, reservation_cny_per_million: reservationRates,
    input_token_allowance: allowance, max_output_tokens: MAX_OUTPUT_TOKENS,
    reserve_cny: cases.length * 2 * (allowance * reservationRates.input + MAX_OUTPUT_TOKENS * reservationRates.output) / 1e6,
    corpus_hash: index.corpus_hash, cases };
}
export const sealPlan = plan => textHash(stableJson(plan));
