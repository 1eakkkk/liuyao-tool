import { castStore } from './cast-store.js';
import { showToast, showConfirm } from '../ui/dialogs.js';
import { logCastEvent, castsRemainingInWindow } from '../storage/cast-log.js';
import { state } from './state.js';



/* ==================================================================
   生死寿数类问题过滤 —— 呼应传统占卦规矩"不轻断生死寿数"：
   这类判断风险高、容易断错，也怕给提问的人带来不必要的心理暗示，
   命中关键词就不生成解读，而不是靠 AI 自己去把握分寸。
   ================================================================== */
const LIFESPAN_KEYWORDS = [
  '还能活多久', '还能活几年', '还能活几天', '还能活多长时间',
  '寿命还有', '寿命有多长', '阳寿', '大限',
  '什么时候死', '啥时候死', '哪天死', '几岁死', '死期',
  '还有多久死', '还能撑多久', '命还有多久',
];

// 纯子字符串匹配会误伤"这盆绿植还能活多久"这类问的根本不是人命的问题——
// 补一份"非人类主体"提示词，命中其一就不当成生死寿数问题拦截，只在没有这些词、
// 又命中上面关键词时才判定为真的在问人（含默认问自己）的寿数。这不是万能的语义理解，
// 但能挡掉审查报告里指出的这类典型误伤场景。
const LIFESPAN_NON_HUMAN_HINTS = [
  '植物','绿植','花','树','草','苗','盆栽','盆景','种子','多肉','花草',
  '宠物','猫','狗','鱼','乌龟','仓鼠','兔子','鸟','虫','昆虫',
  '手机','电脑','电池','轮胎','汽车','爱车','摩托','电动车','冰箱','空调','家电','机器','设备','硬盘','灯泡','充电宝',
  '西瓜','水果','蔬菜','菜','面包','食物',
];

function isLifespanQuestion(text){
  if(!LIFESPAN_KEYWORDS.some(kw => text.includes(kw))) return false;
  if(LIFESPAN_NON_HUMAN_HINTS.some(kw => text.includes(kw))) return false;
  return true;
}


// 问题文字归一化：只用于"是不是同一个问题"的判断，
// 忽略空白和末尾标点，避免用户补个问号、多敲个空格就被判成新问题而重摇重扣费。
function normQuestion(s){
  return String(s || '').replace(/\s+/g, '').replace(/[。．.!！?？~～、，,]+$/, '');
}

function isSameQuestion(a, b){
  return normQuestion(a) === normQuestion(b);
}


// 摇卦前统一走这个校验：频率限制 + 一事一挂规矩。
// 通过则记一次摇卦事件并返回 true；不通过则返回 false（各调用方自行决定要不要再给提示）。
//
// 规矩：同一件事不重复起卦。但"摇卦"按钮本身不像"AI 解读"/"输出提示词"那两条路径——
// 它不一定绑定问题文字（可以先摇卦、后写问题，甚至压根不写问题），所以这里不能照抄那两条
// 路径"比较新旧问题文字是否相同"的判断，只能用一个不依赖文字内容的信号：上一卦是否还在。
// 于是改成跟那两处一致的"确认式"体验——弹窗问用户是否要另起一卦，而不是像以前那样只要
// 输入框空着/文字没变就直接硬拦、不给走。
//
// opts.skipCastConfirm：供"AI 解读"/"输出提示词"这两个调用方使用——它们在调用这里之前，
// 已经自己弹过一次"是同一件事，还是换新事了？"的确认框，判断出确实要重新起卦了，
// 这里就不用再问第二遍，只需要跟着把状态清干净、正常走频率限制+记录这一次摇卦事件。
async function guardBeforeCast(opts = {}){
  const { skipCastConfirm = false, background = false } = opts;
  if(castsRemainingInWindow() <= 0){
    showToast('短时间内已经摇太多次了，心诚则灵，稍等一会再摇（10 分钟内最多 3 次）', 'error', 4500);
    return false;
  }
  if(castStore.legacy){
    if(!skipCastConfirm){
      const wantsNewCast = await showConfirm(
        '上一卦还在。按"一事不问二卦"的规矩，同一件事不重复起卦——你是否需要再次起卦？',
        { title: '再次起卦？', okText: '是，重新起卦', cancelText: '不用了' }
      );
      if(!wantsNewCast) return false;
    }
    // 不管是刚刚用户点了"是，重新起卦"，还是调用方自己那套"换新事了"确认框已经问过一遍、
    // 传 skipCastConfirm 跳过了这里的重复确认——只要确定要重新起卦，就要把跟"上一卦"绑定的
    // 状态一并清掉。这一步是专门补的：以前"清空"按钮只清了 AI 对话相关的状态
    // （currentConversation 等），没碰 castStore.legacy / lastCastQuestion，
    // 导致用户就算把问题框里的字删光，这两个变量依然停在"上一卦"的值上，一摇卦立刻又撞上
    // 同一条拦截逻辑——不清掉这两个变量，这条老毛病换个壳还会再犯一次。
    if(state.castMode === 'manual' && !background) castStore.legacy = null;
    if(state.castMode === 'manual' && !background) castStore.question = '';
    if(!skipCastConfirm && state.castMode === 'manual' && !background){
      // 只有"摇卦"/"生成排盘"这种不一定跟问题绑定、可以直接重摇的场景，才顺手清空问题框
      // （呼应罗士程的建议：点另一卦的同时直接消去这里的文本）；"AI 解读"/"输出提示词"走
      // skipCastConfirm 这条分支时，输入框里的文字就是用户马上要问的新问题，不能跟着清掉。
      const qEl = document.getElementById('questionInput');
      if(qEl){
        qEl.value = '';
        qEl.dispatchEvent(new Event('input'));
      }
    }
  }
  if(state.castMode === 'manual' && !background) logCastEvent();
  return true;
}

export { LIFESPAN_KEYWORDS, LIFESPAN_NON_HUMAN_HINTS, isLifespanQuestion, normQuestion, isSameQuestion, guardBeforeCast };
