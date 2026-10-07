import {readingTask,selectionCatalog} from './selection.js';
import {hasMappingAdmission,reviewedGoal} from './mapping-admission.js';
import {admittedMappingsFor,pendingConfirmation,planGoal} from './plan-admission.js';

// This is a program capability check, not an AI judgment about the cast.
// Three distinct gaps are reported separately so they are never merged into one message:
//   method_not_covered   - no reviewed interpretive method applies to this question
//   chart_basis_missing  - a method applies, but this chart lacks the basis it requires
//   conditions_unconfirmed - a limited observation is available, but its real-world
//                            premise is still open; generation is NOT blocked.
export function readingAvailability(context){
 const task=readingTask(context);
 if(!hasMappingAdmission(context)||context.conversation?.judgment_policy!==6||task!=='interpretation')return {blocked:false,kind:'available'};
 const question=context.input.A_user_question;
 if(/双色球|大乐透|刮刮乐|彩票/.test(question)&&/中奖|中[一二三四五六七八九十\d]*等奖|中奖率|概率|几率/.test(question))return {
  blocked:true,kind:'lottery_prediction',title:'卦象不能可靠判断中奖概率',
  message:'本模式不提供彩票中奖概率或开奖结果预测。已摇出的卦盘仍可查看；中奖与否请以实际开奖为准。',
 };
 const mappings=admittedMappingsFor(context,selectionCatalog(context).entries);
 if(mappings.length)return mappings.some(mapping=>mapping.unconfirmed?.length)
  ?{blocked:false,kind:'conditions_unconfirmed',title:'可以给出有限的局部观察，现实条件仍待确认',
    message:`已经有卦盘，也有适用于这类问题的已核对取法：${[...new Set(mappings.map(mapping=>mapping.source.chapter))].join('、')}。以下现实前提尚未确认，所以本轮只作条件性观察，不据此判断计划能否成功。`,
    items:pendingConfirmation(mappings)}
  :{blocked:false,kind:'observation_only'};
 if(coveredGoal(question))return {blocked:true,kind:'chart_basis_missing',title:'这类问题有适用取法，但本盘缺少它需要的依据',
  message:'已经有卦盘，这道题也已有适用于它的已核对取法；但本卦没有该取法要求的依据（如世爻动而化进／化退、回头生克、月合月破、日合日冲，或对应的世应生克），因此本轮不生成解读。这是本盘依据的缺口，不是对计划成败的判断。',
  items:['可以重新摇卦后再问这道题。','也可以切换普通解读，保留当前问题和卦盘；普通解读不具备同等取法准入核对。']};
 return {blocked:true,kind:'method_not_covered',title:'当前结构化模式尚不支持这类判断',
  message:'已经有卦盘，但目前尚无适用于这个问题的已核对取法。这是功能覆盖不足，不代表事情没有希望，也不是卦象结论。'};
}
// Both reviewed families are named, so the gap is reported by question coverage
// rather than by whether this particular chart happened to satisfy the method.
const coveredGoal=question=>reviewedGoal(question)!==null||planGoal(question)!==null;
