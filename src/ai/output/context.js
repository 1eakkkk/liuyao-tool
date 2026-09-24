import { buildRulesAiInput } from '../rules-input.js';
import { OUTPUT_VERSION, OUTPUT_PROMPT_VERSION, stableOutputJson } from './contract.js';

const trusted = new WeakSet();
export const isOutputContext = context => trusted.has(context);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export async function hashOutput(value) {
  const bytes = new TextEncoder().encode(stableOutputJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')}`;
}
const labels = { position: '爻位', yin_yang: '阴阳', moving: '动爻', ganzhi: '纳甲', branch: '地支',
  element: '五行', relative: '六亲', spirit: '六神', is_shi: '世爻', is_ying: '应爻', is_kongwang: '旬空',
  month_strength: '月令', day_relation: '日辰关系', return_relation: '回头关系', advance_retreat: '进退',
  hidden_relation: '飞伏关系', name: '卦名', palace: '卦宫', shi_line: '世爻位置', ying_line: '应爻位置',
  year_ganzhi: '年柱', month_ganzhi: '月柱', day_ganzhi: '日柱', hour_ganzhi: '时柱',
  day_branch: '日支', month_branch: '月支', kongwang: '空亡', state_text: '爻状态' };
function factLabel(path) {
  const parts = path.split('/').slice(1);
  const prefix = parts[0] === 'lines' ? `第${Number(parts[1]) + 1}爻` : parts[0] === 'calendar' ? '历法' : '卦盘';
  const component = parts.includes('changed') ? '变爻／变卦' : parts.includes('hidden') ? '伏神' : '';
  return `${prefix}${component} · ${labels[parts.at(-1)] ?? labels[parts.at(-2)] ?? parts.at(-1)}`;
}
export async function buildOutputContext(canonical, { rulesMode = 'on' } = {}) {
  const input = buildRulesAiInput(canonical, rulesMode);
  const evidence = [];
  function walk(value, path) {
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}/${key}`);
    } else if (value !== undefined && value !== null && value !== '') {
      evidence.push({ id: `fact:${path}`, kind: 'program_fact', path, value, label: factLabel(path) });
    }
  }
  for (const section of ['calendar', 'hexagram', 'lines']) walk(input.C_canonical_cast[section], `/${section}`);
  for (const hit of input.E_rule_results.hits) {
    const { line, component, related_line = null } = hit.target;
    evidence.push({ id: `rule:${hit.rule_id}:${component}:${line}:${related_line ?? '-'}`,
      kind: 'rule_result', rule_id: hit.rule_id, target: structuredClone(hit.target),
      result: structuredClone(hit.result), source_facts: hit.evidence.map(e => `fact:${e.path}`),
      label: `${hit.rule_id} · 第${line}爻 · ${hit.result.label}` });
  }
  const context = { output_version: OUTPUT_VERSION, prompt_version: OUTPUT_PROMPT_VERSION,
    input, evidence };
  const ids = new Set(evidence.map(e => e.id));
  if (ids.size !== evidence.length || evidence.some(e => e.kind === 'rule_result' && e.source_facts.some(id => !ids.has(id))))
    throw new Error('Output evidence registry is incomplete');
  context.context_id = await hashOutput(context);
  trusted.add(context);
  return freeze(context);
}
