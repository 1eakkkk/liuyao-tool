// Development-only prompt revision. Old instructions and sealed pilots stay intact.
import {prepareSourcedPairs} from './sourced-pairs.js';
import {sourcedOutputInstructions} from './sourced-output.js';
import {sealPlan} from './knowledge-pairs.js';
export const CLARITY_INSTRUCTIONS_VERSION='sourced-instructions-dev-2';
export const CLARITY_RUBRIC={
  version:'sourced-clarity-rubric-dev-1',
  review_kind:'retrospective_nonblind',
  evaluated_fields:['conclusion','interpretations.text','interpretations.applicability','interpretations.uncertainties','advice.text'],
  criteria:{
    facts:'盘面陈述与输入一致；未提供不等于盘中不存在。',
    scope:'仅回答当前窄问题，限制说明不展开用神、应期或成败判断。',
    support:'六合、六冲、旬空不自动支持生克、旺衰、效力或成败；否定句和条件句按实际含义检查。',
    attribution:'本次引用的使用限制明确归给现代整理；自由文字与逐字引文字段归属一致。',
    verification:'逐字匹配只证明输入连接，不证明外部古籍真实性、整个古法体系或预测结果。'
  },
  uncertain_policy:'无法确认则 uncertain；仅无输入文献且完整输出无来源声明时，出处可 not_applicable。',
  automatic_semantic_validation:false,
  production_ready:false
};
export function clarityInstructions(){
  return sourcedOutputInstructions().replace('sourced-instructions-dev-1',CLARITY_INSTRUCTIONS_VERSION)+`
术语与出处边界修订（适用于 conclusion、解释、applicability、uncertainties 及 advice 全部文字）：
1. 程序标注六合就称六合，六冲就称相冲，旬空就称旬空。未提供另一个关系的事实与规则时，不把它们扩写成相生、相克、冲克、旺衰、实际有用无用或事情成败。不得以条件句引入未经支持的新规则。
2. 可说“当前证据没有提供生克、旺衰判断”，不能说“盘中不存在生克、旺衰”；可以明确否定未经支持的推断，不需要回避这些词。
3. 原文转录只支持其确实写出的内容；谈本次引用的适用条件、排除条件或使用限制，须明确写“现代整理”。若使用这些现代字段作依据，将对应字段的短引文另列为 modern_editorial，不能只附 original_text 的引文。
4. 不能笼统写“资料明确规定”而使现代限制被当成古籍规定。原文未谈某结论，应说“这段原文转录没有给出该结论”，不推成整部古籍或整个体系永远没有该结论。
5. 引文逐字匹配输入不代表已核查影印本或外部来源真实性。建议仍须遵守以上边界；没有文献的对照侧不虚构出处。
6. 原文若含“有用／无用”等评价，应如实说明这是文献的措辞，不能抹去或宣称所有原文都只定义名称。现代整理限制的是本次引用与个案应用，不重新定义古籍写了什么；引用文献评价不等于已证实当前爻的实际效力。
先简短回答问题，再解释名称与限制；不为凑字数新增推断。`;
}
export async function prepareClarityPairs(){
  const base=await prepareSourcedPairs('three-pairs'),plan=structuredClone(base);
  plan.version='sourced-clarity-pairs-dev-2';plan.instructions_version=CLARITY_INSTRUCTIONS_VERSION;
  plan.base_plan_hash=sealPlan(base);plan.evaluation=structuredClone(CLARITY_RUBRIC);
  plan.scope='Three exposed development topics: month clash, month combine, void; new prompt, not blind acceptance';
  plan.execution_policy={preparation_only:true,live_executor_available:false,automatic_retries:false,
    prerequisite:'Freeze review before new replies; recheck current prices and cumulative budget before any paid execution'};
  // Keep the prior 3-pair conservative reserve. Preparation does not spend or reserve it.
  for(const c of plan.cases) for(const arm of c.arms){
    arm.body.messages[0].content=clarityInstructions()+'\n只回答当前窄问题；保留规则完整来源事实。';
    arm.input_bytes_with_allowance=Buffer.byteLength(JSON.stringify(arm.body.messages),'utf8')+4096;
    if(arm.input_bytes_with_allowance>plan.input_token_allowance) throw Error('Clarity candidate exceeds unchanged allowance');
  }
  return plan;
}
