import {prepareClarityPairs,clarityInstructions} from './sourced-clarity.js';
import {sealPlan} from './knowledge-pairs.js';
import {buildSourceCatalog} from './source-bindings.js';
import {BOUND_OUTPUT_VERSION} from './bound-reading.js';
import {stableJson} from '../../src/knowledge/validate.js';
export const BOUND_INSTRUCTIONS_VERSION='sourced-instructions-dev-3';
export function boundInstructions(){
  const old=clarityInstructions(),start=old.indexOf('返回 JSON：'),end=old.indexOf('文献是解释背景');
  if(start<0 || end<=start)throw Error('Instruction skeleton changed');
  const example={schema_version:BOUND_OUTPUT_VERSION,source_catalog_hash:'输入 source_catalog.catalog_hash 原值',
    conclusion:'简短回答及限制',facts:[{evidence_id:'输入 program_fact ID',value:'保持原值与类型'}],
    rules:[{evidence_id:'输入 rule_result ID',result:{code:'原始 code',label:'原始 label'}}],
    interpretations:[{text:'解释当前问题',fact_ids:['facts 的 ID'],rule_ids:['rules 的 ID'],literature_ids:['被引用的 literature ID'],
      source_ids:['该文献原文字段的 source_id','该文献某现代条件字段的 source_id'],
      applicability:{program:'当前程序事实如何命中规则',editorial:[{source_id:'上面列出的现代条件 source_id',explanation:'仅说明这个条件为何适用或有何限制'}]},
      uncertainties:['不能确认的结论']}],advice:[{text:'一般建议',basis:'general_advice'}]};
  // Keep terminology guidance, replace the obsolete source_claims protocol instructions.
  const guidance=old.slice(old.indexOf('术语与出处边界修订'));
  return `离线候选 ${BOUND_OUTPUT_VERSION}，提示 ${BOUND_INSTRUCTIONS_VERSION}，不用于生产。返回 JSON：\n${JSON.stringify(example)}\n
facts 只复制 program_fact；rules 完整复制 rule_result.result，包含所有原字段。引用规则的全部 source_facts 必须列入 facts 和本段 fact_ids。
source_catalog 由程序根据本次资料包生成；复制 catalog_hash，选择实际使用的 source_id，不输出 source_claims，不自己抄写或改造引文、字段路径及来源标签。每个 source_id 的 literature_id 必须出现在本段 literature_ids。
资料的完整原文、条件、排除及例外由程序作为背景保留，不要求每段使用全部资料，不将背景条数当证据数量。
applicability.program 只解释程序事实与规则；现代摘要、适用条件、排除条件及例外分别放 applicability.editorial。每个实际使用的现代条目分别填写一个 source_id 与 explanation，不在一项解释里混入另一条未引用条件。摘要条目说明其含义与本段关系，不把摘要自动当作适用条件。每个现代 source_id 必须有独立 editorial 条目；不使用的背景不要虚列为依据。
解释使用原文时列原文字段 source_id；程序将显示完整转录片段。正文仍须如实说明相关作者评价，不能用完整资料附录代替正文说明，也不能将文献评价当已发生的排盘事实。
没有引用文献时 literature_ids、source_ids、applicability.editorial 都为空，不虚构出处。没有声明例外只表示材料未说明，不能说没有例外。
未标注的自由文字、条件是否真的适用、解释支持度和外部真实性仍需独立审查；字段绑定通过不证明这些内容。
结论、解释、不确定性和建议只回答当前窄问题，不将现代限制在这些自由文字里冒充原文。
${guidance.replace('将对应字段的短引文另列为 modern_editorial','将每个对应字段的 source_id 单独绑定到 applicability.editorial').replace('不能只附 original_text 的引文','不能只绑定原文字段')}`;
}
export async function prepareBoundPairs(){
  const base=await prepareClarityPairs(),plan=structuredClone(base);
  plan.version='source-bound-reading-pairs-dev-3';plan.output_version=BOUND_OUTPUT_VERSION;
  plan.instructions_version=BOUND_INSTRUCTIONS_VERSION;plan.base_plan_hash=sealPlan(base);
  plan.scope='Exposed development cases, program-owned quotations and source labels; not semantic or blind acceptance';
  for(const c of plan.cases)for(const arm of c.arms){
    const payload=JSON.parse(arm.body.messages[1].content);payload.source_catalog=buildSourceCatalog(payload.literature_packet);
    arm.body.messages[0].content=boundInstructions();arm.body.messages[1].content=stableJson(payload);
    arm.input_bytes_with_allowance=Buffer.byteLength(JSON.stringify(arm.body.messages),'utf8')+4096;
    if(arm.input_bytes_with_allowance>plan.input_token_allowance)throw Error('Bound request exceeds unchanged allowance');
  }
  return plan;
}
