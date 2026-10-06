import {readingTask,selectionCatalog} from './selection.js';
import {hasMappingAdmission,admittedMappings,reviewedGoal} from './mapping-admission.js';

// This is a program capability check, not an AI judgment about the cast.
export function readingAvailability(context){
 const task=readingTask(context);
 if(!hasMappingAdmission(context)||context.conversation?.judgment_policy!==6||task!=='interpretation')return {blocked:false,kind:'available'};
 const question=context.input.A_user_question;
 if(/双色球|大乐透|刮刮乐|彩票/.test(question)&&/中奖|中[一二三四五六七八九十\d]*等奖|中奖率|概率|几率/.test(question))return {
  blocked:true,kind:'lottery_prediction',title:'卦象不能可靠判断中奖概率',
  message:'本模式不提供彩票中奖概率或开奖结果预测。已摇出的卦盘仍可查看；中奖与否请以实际开奖为准。',
 };
 const mappings=admittedMappings(context,selectionCatalog(context).entries);
 if(mappings.length)return {blocked:false,kind:'observation_only'};
 return {blocked:true,kind:reviewedGoal(question)?'chart_basis_missing':'method_not_covered',title:'当前结构化模式尚不支持这类判断',
  message:reviewedGoal(question)?'已经有卦盘，但本盘没有这项协助观察取法所需的对应依据。这是模式的适用限制，不是对事情成败的判断。':'已经有卦盘，但目前尚无适用于这个问题的已核对取法。这是功能覆盖不足，不代表事情没有希望，也不是卦象结论。'};
}
