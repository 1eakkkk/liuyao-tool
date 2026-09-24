// Synthetic UI/contract example only. Not a model response or an outcome case.
import { OUTPUT_VERSION } from '../../src/ai/output/contract.js';
export function syntheticOutput(context) {
  const line = context.input.C_canonical_cast.lines[0];
  return {
    schema_version: OUTPUT_VERSION, context_id: context.context_id,
    answer: '这是离线展示样例：可以先核对现有条件，再决定下一步。此段文字由程序提供，用于演示展示和校验，不是真实 AI 解卦。',
    direction: 'unclear',
    yongshen_candidates: [{ relative: line.relative, targets: [{ line: 1, component: 'primary' }],
      reason: '仅演示如何把候选关联到真实爻位，不表示本题应取此用神。', evidence_ids: ['fact:/lines/0/relative'] }],
    factors: [{ assessment: 'conditional', interpretation: '这里只确认引用指向输入里的第一爻六亲；其对问题的意义仍需另行判断。',
      evidence_ids: ['fact:/lines/0/relative'] }],
    timing_candidates: [], uncertainties: ['未进行真实模型调用，也没有实际结果反馈。'],
  };
}
