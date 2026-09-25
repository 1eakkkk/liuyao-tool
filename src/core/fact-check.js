import { assertCanonicalCast } from './normalize.js';
import { getShiYingRelation } from './relations.js';

export const FACT_CHECK_TOPICS = Object.freeze({ shi_ying: '世应五行关系', moving: '动爻与变出六亲', hidden: '伏神记录' });
const elements = new Set(['金', '木', '水', '火', '土']);
const relatives = new Set(['父母', '兄弟', '子孙', '妻财', '官鬼']);
const relative = value => relatives.has(value) ? value : '未记载';

// Explicit topics, never inferred from free text. No model output or question text is used.
export function buildFactCheck(canonical, topic) {
  assertCanonicalCast(canonical);
  if (!Object.hasOwn(FACT_CHECK_TOPICS, topic)) throw new Error('请选择支持的核对项目');
  const evidence = [];
  const add = (line, component, label, value) => evidence.push({ line, component, label, value });
  let summary;
  if (topic === 'shi_ying') {
    const shi = canonical.lines.filter(l => l.is_shi === true), ying = canonical.lines.filter(l => l.is_ying === true);
    if (shi.length !== 1 || ying.length !== 1 || shi[0].position === ying[0].position ||
      shi[0].position !== canonical.hexagram.shi_line || ying[0].position !== canonical.hexagram.ying_line)
      throw new Error('世应位置记录不完整或不一致，暂不能核对');
    const s = shi[0], y = ying[0];
    if (!elements.has(s.element) || !elements.has(y.element)) throw new Error('世应五行记录不完整，暂不能核对');
    const relation = getShiYingRelation(s.element, y.element);
    const descriptions = { 世应比和: `两爻同属${s.element}，世应比和`, 世生应: `世爻生应爻（${s.element}生${y.element}）`,
      应生世: `应爻生世爻（${y.element}生${s.element}）`, 世克应: `世爻克应爻（${s.element}克${y.element}）`,
      应克世: `应爻克世爻（${y.element}克${s.element}）` };
    summary = `世爻在第${s.position}爻，属${s.element}；应爻在第${y.position}爻，属${y.element}。${descriptions[relation]}。`;
    add(s.position, 'primary', '世爻位置与五行', `第${s.position}爻 · ${s.element}`);
    add(y.position, 'primary', '应爻位置与五行', `第${y.position}爻 · ${y.element}`);
    add(null, 'rule', '五行关系', descriptions[relation]);
  } else if (topic === 'moving') {
    const moving = canonical.lines.filter(l => l.moving);
    summary = moving.length ? moving.map(l => `第${l.position}爻为动爻，${relative(l.changed?.relative) === '未记载' ? '变出六亲未记载' : `变出六亲为${l.changed.relative}`}`).join('；') + '。' : '本卦没有动爻，因此没有变出六亲。';
    for (const l of canonical.lines) {
      add(l.position, 'primary', `第${l.position}爻动静`, l.moving ? '动爻' : '静爻');
      if (l.moving) add(l.position, 'changed', `第${l.position}爻变出六亲`, relative(l.changed?.relative));
    }
  } else {
    const recorded = canonical.lines.filter(l => l.hidden != null);
    summary = recorded.length ? recorded.map(l => `第${l.position}爻下记有伏神，六亲${relative(l.hidden.relative) === '未记载' ? '未记载' : `为${l.hidden.relative}`}`).join('；') + '。其余爻位未记载伏神。' : '本卦各爻均未记载伏神，不补推未记载的内容。';
    if (recorded.length === 6) summary = summary.replace('其余爻位未记载伏神。', '');
    for (const l of canonical.lines) add(l.position, 'hidden', `第${l.position}爻伏神记录`, l.hidden == null ? '未记载伏神' : `六亲：${relative(l.hidden.relative)}`);
  }
  return { kind: 'program_fact_check', topic, title: FACT_CHECK_TOPICS[topic], summary, evidence,
    scope: '仅核对当前卦盘所选项目，不选用神，不推断吉凶或应期。' };
}
