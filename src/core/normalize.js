import { calculateCast } from './casting.js';

export const SCHEMA_VERSION = '1.0';
export const VERSIONS = Object.freeze({ app: '2.0.0', engine: 'desktop-2026-09-15-2', prompt: 'p1' });

// One value per field in memory. Presence lists preserve missing vs empty legacy fields.
const TOP = {
  ganzhi: 'calendar.day_ganzhi', yearGanzhi: 'calendar.year_ganzhi',
  monthGanzhi: 'calendar.month_ganzhi', hourGanzhi: 'calendar.hour_ganzhi',
  fourPillarsText: 'display.four_pillars_text', kongText: 'display.kong_text',
  dateText: 'display.date_text', palaceText: 'display.palace_text',
  lowerUpperText: 'display.lower_upper_text', dayKongText: 'display.day_kong_text',
  guaName: 'hexagram.primary.name', bianGuaName: 'hexagram.changed.name',
  source: 'meta.source', rulesVersion: 'versions.legacy_rules', coinConvention: 'meta.coin_convention',
  castAnchorY: 'calendar.anchor.year', castAnchorM: 'calendar.anchor.month', castAnchorD: 'calendar.anchor.day',
  overallTrendText: 'display.overall_trend_text',
};
const LINE = {
  爻位: 'position_label', 六亲: 'relative', 六神: 'spirit', 纳甲: 'ganzhi', 五行: 'element', 状态: 'state_text',
  是否动爻: 'moving', 是否世爻: 'is_shi', 是否应爻: 'is_ying', 是否空亡: 'is_kongwang',
  变纳甲: 'changed.ganzhi', 变五行: 'changed.element', 变六亲: 'changed.relative',
  伏神六亲: 'hidden.relative', 伏神纳甲: 'hidden.ganzhi', 伏神五行: 'hidden.element',
  月令: 'relations.month_strength', 日辰关系: 'relations.day_relation',
  回头: 'relations.return_relation', 进退神: 'relations.advance_retreat', 伏神与飞神关系: 'relations.hidden_relation',
};
const read = (obj, path) => path.split('.').reduce((value, key) => value?.[key], obj);
function write(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  for (const key of keys) obj = obj[key] ??= {};
  obj[last] = value;
}
function mapInto(raw, target, mapping) {
  const presence = [], extensions = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'canonical' || key === 'lines') continue;
    if (mapping[key]) { presence.push(key); write(target, mapping[key], value); }
    else extensions[key] = value;
  }
  target.compatibility = { presence, extensions };
}
function mapBack(value, mapping) {
  const result = { ...value.compatibility.extensions };
  for (const key of value.compatibility.presence) {
    let field = read(value, mapping[key]);
    if (field === undefined && mapping === LINE && /^(changed|hidden)\./.test(mapping[key])) field = '';
    if (field === undefined && key === 'bianGuaName' && value.hexagram.changed === null) field = null;
    result[key] = field;
  }
  return result;
}
function legacyId(raw, createdAt) {
  // Stable identifier for imported records, not a security/content-integrity hash.
  let hash = 2166136261;
  for (const c of JSON.stringify([raw, createdAt])) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `legacy-${(hash >>> 0).toString(16)}`;
}
export function isCanonicalCast(value) { return value?.schema_version === SCHEMA_VERSION; }
export function assertCanonicalCast(cast) {
  if (!isCanonicalCast(cast) || !cast.meta || !cast.calendar || !cast.hexagram || !cast.display || !cast.compatibility ||
      !Array.isArray(cast.lines) || cast.lines.length !== 6 || cast.lines.some((line, i) =>
        line.position !== i + 1 || !['yin', 'yang'].includes(line.yin_yang) || typeof line.moving !== 'boolean' || !line.compatibility)) {
    throw new Error('卦盘标准数据无效或版本不受支持');
  }
  return cast;
}

export function normalizeLegacyCast(raw, { question = '', createdAt = null, castId } = {}) {
  if (isCanonicalCast(raw)) return assertCanonicalCast(raw);
  if (raw?.canonical) return assertCanonicalCast(raw.canonical);
  if (raw?.schema_version || !Array.isArray(raw?.lines) || raw.lines.length !== 6) throw new Error('旧卦盘数据不完整');
  const cast = {
    schema_version: SCHEMA_VERSION,
    meta: { cast_id: castId || legacyId(raw, createdAt), created_at: createdAt == null ? null : new Date(createdAt).toISOString() },
    question: { text: question, topic: null },
    versions: { ...VERSIONS }, calendar: {}, hexagram: { primary: {}, changed: null }, display: {}, lines: [],
  };
  mapInto(raw, cast, TOP);
  if (cast.hexagram.changed?.name === null) cast.hexagram.changed = null;
  const branchOf = text => typeof text === 'string' && /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(text) ? text[1] : null;
  cast.calendar.month_branch = branchOf(cast.calendar.month_ganzhi);
  cast.calendar.day_branch = branchOf(cast.calendar.day_ganzhi);
  cast.calendar.kongwang = (raw.kongText || raw.dayKongText || '').split('空亡：')[1]?.match(/[子丑寅卯辰巳午未申酉戌亥]/g) || [];
  cast.hexagram.primary.palace = raw.palaceText?.split(' · ')[0] || null;
  cast.hexagram.primary.lower_trigram = raw.lowerUpperText?.match(/下卦：\S+\s+(\S+)/)?.[1] || null;
  cast.hexagram.primary.upper_trigram = raw.lowerUpperText?.match(/上卦：\S+\s+(\S+)/)?.[1] || null;
  cast.lines = raw.lines.map((original, i) => {
    if (!original || typeof original.状态 !== 'string') throw new Error('旧爻数据缺少状态');
    const line = { position: i + 1, yin_yang: /^(少阳|老阳)/.test(original.状态) ? 'yang' : 'yin', changed: null, hidden: null, relations: {} };
    mapInto(original, line, LINE);
    line.branch = line.ganzhi?.[1] || null;
    for (const group of ['changed', 'hidden']) {
      if (line[group] && Object.values(line[group]).every(value => value === '')) line[group] = null;
      if (line[group]) line[group].branch = line[group].ganzhi?.[1] || null;
    }
    return line;
  });
  cast.hexagram.shi_line = cast.lines.find(line => line.is_shi)?.position ?? null;
  cast.hexagram.ying_line = cast.lines.find(line => line.is_ying)?.position ?? null;
  return assertCanonicalCast(cast);
}

export function toLegacyCast(value) {
  if (value == null) return null;
  const cast = normalizeLegacyCast(value);
  return { ...mapBack(cast, TOP), lines: cast.lines.map(line => mapBack(line, LINE)) };
}

export function buildCanonicalCast({ lines, source = 'system', calendar, daySelectionMode = 'auto', question = '', createdAt = Date.now(), castId = crypto.randomUUID() }) {
  const { cast } = calculateCast(lines, source, calendar, daySelectionMode);
  return normalizeLegacyCast(cast, { question, createdAt, castId });
}

// Old renderers receive a temporary projection; it is never an independent stored cast.
export function toPlateLineData(cast) {
  return assertCanonicalCast(cast).lines.map(line => ({
    pos: line.position - 1, lineNum: line.position,
    l: { yang: line.yin_yang === 'yang', moving: line.moving },
    stem: line.ganzhi?.[0], branch: line.branch, branchEl: line.element, spirit: line.spirit, liuqin: line.relative,
    isWorld: line.is_shi, isResponse: line.is_ying, isKong: line.is_kongwang,
    bianGanzhi: line.changed?.ganzhi || '', bianBranchEl: line.changed?.element || '', bianLiuqin: line.changed?.relative || '',
    jinTuiShen: line.relations.advance_retreat, huitou: line.relations.return_relation,
    yueling: line.relations.month_strength, dayRelation: line.relations.day_relation,
    fushen: line.hidden ? { liuqin: line.hidden.relative, ganzhi: line.hidden.ganzhi, branchEl: line.hidden.element, feishenRelation: line.relations.hidden_relation } : null,
  }));
}
