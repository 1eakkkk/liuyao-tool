// Modern editorial teaching contrasts, derived from existing unit boundaries.
// These are not quotations, historical cases, new facts, or independent evidence.
const guides = {
  'zsby-shiying-scope-001': {
    checks: ['所问是否涉及彼此之事？', '帮助方向是他人助我，还是我替他谋事？', '方向关系是否来自当前程序事实，而不是文献推算？'],
    careful_example: '若所问确属彼此之事，可结合世应方向解释双方关系；是否成事仍须另论。',
    overreach_example: '应生世，所以对方一定答应且事情必成。'
  },
  'zsby-month-clash-001': {
    checks: ['程序是否明确标记月建相冲？', '此处仅需解释月破名称，还是在判断实际效力？'],
    careful_example: '程序标记与月建相冲，本段可用于解释月破名称；不能仅凭名称断定此爻无用。',
    overreach_example: '月破就是永久失效，所以此事没有机会。'
  },
  'zsby-month-combine-001': {
    checks: ['程序是否明确标记月建六合？', '是否把作者的评价措辞误当当前个案已确认的事实？'],
    careful_example: '月合名称可由本段说明；文献评价不能单独证明此爻在本卦发挥作用或事情成功。',
    overreach_example: '月合代表有用，所以这个项目必然成功。'
  },
  'zsby-day-clash-context-001': {
    checks: ['受冲爻是否为静爻？', '旺衰前提是否经过另行判断，而不只是存在日冲？'],
    careful_example: '本段区分旺静、衰静受冲；只有日冲记录而缺少旺衰判断时，不宜直接命名暗动或日破。',
    overreach_example: '程序显示日冲，所以这条爻必然暗动。'
  },
  'zsby-advance-definition-001': {
    checks: ['是否确为动而化，且方向属于本段列举？', '是否将进神直接换成吉利或成功？'],
    careful_example: '本段可解释化进方向；原文保留喜忌之分，不能把进神直接当作成功判词。',
    overreach_example: '化进就是好事，因此不用再看所问和喜忌。'
  },
  'zsby-retreat-definition-001': {
    checks: ['是否确为动而化，且方向属于本段列举？', '是否将退神直接换成凶险或失败？'],
    careful_example: '本段可解释化退方向；原文保留喜忌之分，不能把退神直接当作失败判词。',
    overreach_example: '化退就是坏事，所以这次一定失败。'
  },
  'zsby-void-definition-001': {
    checks: ['旬空是否来自程序的历法计算？', '是否仅解释名称，而没有越界推断真空、假空或实际效力？'],
    careful_example: '本段说明旬空的历法名义；旬空标签本身不证明无用，也不能独自确定出空后的结果。',
    overreach_example: '旬空就是完全没用，出空当天事情一定成功。'
  }
};
export function editorialGuidance(knowledgeId) {
  if (!Object.hasOwn(guides, knowledgeId)) return null;
  return { kind: 'modern_editorial_guidance', review_status: 'development_self_review',
    independent_evidence: false, ...structuredClone(guides[knowledgeId]) };
}
