import { migrateStorage, migrateHistoryRecord, migrateCastSnapshot, canWriteStoredJson } from './versions.js';
import { normalizeLegacyCast, toLegacyCast } from '../core/normalize.js';
import { safeGetItem, safeSetItem, safeRemoveItem } from './local.js';

     // 'high' | 'max'
const LS_KEY_HISTORY = 'liuyao_interpret_history';

const HISTORY_MAX = 200;


function loadHistory(){ return migrateStorage().history; }

function saveHistory(list){
  if(!canWriteStoredJson(LS_KEY_HISTORY)) return false;
  return safeSetItem(LS_KEY_HISTORY, JSON.stringify(list.slice(-HISTORY_MAX).map(migrateHistoryRecord)));
}

function appendHistory(record){
  const list = loadHistory();
  list.push(record);
  saveHistory(list);
  return list;
}


// ---- 终身累计消费统计：跟"历史记录列表"完全脱钩，不受 HISTORY_MAX 裁剪影响 ----
// 背景：renderStats() 原来直接从 loadHistory() 现算总花费/总token——但历史记录超过
// HISTORY_MAX(200) 条后，saveHistory() 会静默裁掉最老的记录，连带着那些记录的
// costYuan/totalTokens 也从"累计"里消失，导致界面上显示的金额会随着历史被裁剪而"缩水"，
// 跟用户实际花掉的钱对不上。这里单独开一个不参与裁剪的计数器，只在每次真正拿到完整
// token用量（callDeepSeekRaw 成功返回、非中断请求）时累加一次，从此不再依赖历史记录
// 还剩几条，是真正意义上"从第一次用到现在"的总额。
const LS_KEY_LIFETIME_STATS = 'liuyao_lifetime_stats';

function loadLifetimeStats(){
  try{
    const raw = JSON.parse(safeGetItem(LS_KEY_LIFETIME_STATS) || 'null');
    if(raw && typeof raw === 'object'){
      return { cost: raw.cost || 0, tokens: raw.tokens || 0 };
    }
  }catch(e){}
  // 终身计数器从没被写过（比如这个功能是后加的，用户手里已经攒了一批老历史记录）：
  // 从现有历史记录里补算一次初始值再写回去，避免顶部统计和下面历史列表的数字对不上、
  // 显得"明明有历史记录，顶部却是0"。之后每次新解读走 addLifetimeUsage() 正常往上加，
  // 不会重复计入这次补算的部分。
  try{
    const hist = loadHistory();
    let cost = 0, tokens = 0;
    hist.forEach(r=>{ cost += (r.costYuan||0); tokens += (r.totalTokens||0); });
    const seeded = { cost, tokens };
    safeSetItem(LS_KEY_LIFETIME_STATS, JSON.stringify(seeded));
    return seeded;
  }catch(e){}
  return { cost: 0, tokens: 0 };
}

function addLifetimeUsage(costYuan, totalTokens){
  if(!costYuan && !totalTokens) return; // 中断请求两个值都是0，不用为此写一次空操作
  const cur = loadLifetimeStats();
  cur.cost += (costYuan || 0);
  cur.tokens += (totalTokens || 0);
  safeSetItem(LS_KEY_LIFETIME_STATS, JSON.stringify(cur));
}

function clearLifetimeStats(){
  safeRemoveItem(LS_KEY_LIFETIME_STATS);
}

function historyTurnsOf(record){
  if(Array.isArray(record.turns)) return record.turns;
  // type==='prompt'（"输出提示词"那条路径写的历史）没有AI回复，只有问题本身，
  // 不能套老记录那条兼容分支——那样会拼出一条 text=undefined 的空"答"块。
  if(record.type === 'prompt') return [ { role: 'user', text: record.question, ts: record.ts } ];
  return [ { role: 'user', text: record.question, ts: record.ts },
        { role: 'assistant', text: record.text, ts: record.ts } ];
}


// ---- 历史记录里的排盘快照：只挑排盘本身的几个关键结构化字段存下来——卦名/变卦、宫位、
// 上下卦、日柱空亡、逐爻明细（六亲/六神/纳甲/五行/状态/世应空亡动标记）——不存"输出提示词"
// 按钮生成的那一整段人设+回复风格+格式规则的长文本：那段是讲给AI听的"提示词"，不是卦本身
// 的信息，塞进历史记录里既占地方、回看时也没有意义。这份快照两条写历史的路径共用同一个函数，
// 保证"AI 解读"和"输出提示词"两条历史记录里看到的排盘信息格式一致。
function buildHistoryCastSnapshot(castData){
  if(!castData) return null;
  const canonical = normalizeLegacyCast(castData);
  castData = toLegacyCast(canonical);
  if(!castData || !Array.isArray(castData.lines)) return null;
  return {
    canonical,
    ganzhi: castData.ganzhi,
    yearGanzhi: castData.yearGanzhi,
    monthGanzhi: castData.monthGanzhi,
    hourGanzhi: castData.hourGanzhi,
    fourPillarsText: castData.fourPillarsText,
    kongText: castData.kongText,
    dateText: castData.dateText,
    palaceText: castData.palaceText,
    lowerUpperText: castData.lowerUpperText,
    dayKongText: castData.dayKongText,
    guaName: castData.guaName,
    bianGuaName: castData.bianGuaName,
    source: castData.source,
    rulesVersion: castData.rulesVersion, coinConvention: castData.coinConvention,
    castAnchorY: castData.castAnchorY, castAnchorM: castData.castAnchorM, castAnchorD: castData.castAnchorD,
    lines: castData.lines,
    overallTrendText: castData.overallTrendText,
  };
}

export { LS_KEY_HISTORY, HISTORY_MAX, loadHistory, saveHistory, appendHistory, LS_KEY_LIFETIME_STATS, loadLifetimeStats, addLifetimeUsage, clearLifetimeStats, historyTurnsOf, buildHistoryCastSnapshot };
