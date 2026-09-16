export const RULESET_VERSION = 'r1';
export const RULE_ENGINE_VERSION = '1.0.0';
export const RULE_RESULT_SCHEMA_VERSION = '1.0';
const rows = [
  ['LINE-MOVING-001', 'moving', true, '动爻'],
  ['LINE-VOID-001', 'is_kongwang', true, '旬空'],
  ['DAY-CLASH-001', 'day_relation', '日辰冲', '受日冲'],
  ['DAY-COMBINE-001', 'day_relation', '日辰合', '与日辰六合'],
  ['MOVE-RETURN-GENERATE-001', 'return_relation', '回头生', '回头生'],
  ['MOVE-RETURN-CONTROL-001', 'return_relation', '回头克', '回头克'],
  ['MOVE-ADVANCE-001', 'advance_retreat', '进神', '化进'],
  ['MOVE-RETREAT-001', 'advance_retreat', '退神', '化退'],
  ['HIDDEN-FLY-GENERATE-001', 'hidden_relation', '飞神生伏神', '飞神生伏神'],
  ['HIDDEN-GENERATE-FLY-001', 'hidden_relation', '伏神生飞神', '伏神生飞神'],
  ['HIDDEN-FLY-CONTROL-001', 'hidden_relation', '飞神克伏神', '飞神克伏神'],
  ['HIDDEN-CONTROL-FLY-001', 'hidden_relation', '伏神克飞神', '伏神克飞神'],
  ['HIDDEN-SAME-ELEMENT-001', 'hidden_relation', '飞伏比和', '飞伏比和'],
  ['MONTH-STATE-WANG-001', 'month_strength', '旺', '月令旺'],
  ['MONTH-STATE-XIANG-001', 'month_strength', '相', '月令相'],
  ['MONTH-STATE-XIU-001', 'month_strength', '休', '月令休'],
  ['MONTH-STATE-QIU-001', 'month_strength', '囚', '月令囚'],
  ['MONTH-STATE-SI-001', 'month_strength', '死', '月令死'],
  ['SHI-GENERATE-YING-001', 'shi_ying', '世生应', '世生应'],
  ['YING-GENERATE-SHI-001', 'shi_ying', '应生世', '应生世'],
  ['SHI-CONTROL-YING-001', 'shi_ying', '世克应', '世克应'],
  ['YING-CONTROL-SHI-001', 'shi_ying', '应克世', '应克世'],
  ['SHI-YING-SAME-ELEMENT-001', 'shi_ying', '世应比和', '世应比和'],
  ['MONTH-CLASH-001', 'month_clash', true, '月破（与月建六冲）'],
  ['MONTH-COMBINE-001', 'month_combine', true, '与月建六合'],
];
const sources = {
  moving: 'src/core/normalize.js:lines.moving', is_kongwang: 'src/core/normalize.js:lines.is_kongwang',
  day_relation: 'src/core/relations.js:getDayRelation', return_relation: 'src/core/relations.js:getHuitouRelation',
  advance_retreat: 'src/core/relations.js:computeJinTuiShen', hidden_relation: 'src/core/relations.js:getFeishenFushenRelation',
  month_strength: 'src/core/relations.js:getYuelingState', shi_ying: 'src/core/relations.js:getShiYingRelation',
  month_clash: 'src/core/constants.js:LIUCHONG_PAIR', month_combine: 'src/core/constants.js:LIUHE_PAIR',
};
// These are project implementation references, not independently verified classical citations.
export const RULES = Object.freeze(rows.map(([rule_id, field, expected, label]) => Object.freeze({
  rule_id, rule_version: '1.0.0', field, expected, label,
  code: rule_id.toLowerCase().replace(/-001$/, '').replace(/-/g, '_'),
  origin: field === 'shi_ying' ? 'shared_core_function' : field.startsWith('month_c') ? 'derived_relation' : 'canonical_annotation',
  source_ref: sources[field], scope: field === 'shi_ying' ? 'shi_ying_pair' : field === 'hidden_relation' ? 'hidden_at_line' : 'primary_line',
  limitation: '局部关系；不选用神、不判断吉凶、不评分。',
})));
export const ANNOTATION_ENUMS = Object.freeze({
  day_relation: ['', '日辰冲', '日辰合'], return_relation: ['', '回头生', '回头克'],
  advance_retreat: ['', '进神', '退神'], hidden_relation: ['', '飞神生伏神', '伏神生飞神', '飞神克伏神', '伏神克飞神', '飞伏比和'],
  month_strength: ['', '旺', '相', '休', '囚', '死'],
});
