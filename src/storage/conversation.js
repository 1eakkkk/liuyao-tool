import { migrateStorage, migrateCastSnapshot, canWriteStoredJson } from './versions.js';
import { castStore } from '../app/cast-store.js';
import { safeGetItem } from './local.js';
import { state } from '../app/state.js';



// ---- 对话状态：当前这一卦的多轮解读上下文（首次解读 + 若干次追问）----
// 结构：{ messages: [{role,content}, ...], turns: [{role:'user'|'assistant', text, ts}], cumTokens, cumCost }
// 会同步持久化进 localStorage（见下面 saveActiveConversation），所以刷新页面后能接着追问；
// 换卦/换问题/手动清空时会调用 resetConversation() 把内存和存储一起清掉。

// 当前这一卦对应的历史记录条目id——首次解读时生成，追问时用它去更新同一条历史记录，
// 而不是每追问一次就在历史里新开一条不相关的记录。


// ---- 当前会话的持久化：只存"这一条正在进行中的会话"，跟下面的 liuyao_interpret_history（历史列表）是两回事。
// 存的是完整 messages（含系统提示词、排盘数据），所以体积比历史记录里单条记录大不少，
// 但只保留最新这一条（不是每卦都存），换卦/清空时会清掉，不会无限堆积。
// 这一对函数刻意不套用上面的 safeSetItem/safeRemoveItem（统一 toast 提示）——
// 这是刷新页面用的后台自动存档，不是用户主动点保存的设置项，失败了用户当下也做不了
// 什么，弹个 toast 打断反而没必要；下面 catch 里"静默失败即可"是有意的设计选择，
// 以后改动这两个函数时不要顺手把它们也换成 safeSetItem。
const LS_KEY_ACTIVE_CONVO = 'liuyao_active_conversation';

function saveActiveConversation(){
  if(!state.currentConversation || !canWriteStoredJson(LS_KEY_ACTIVE_CONVO)) return;
  try{
    localStorage.setItem(LS_KEY_ACTIVE_CONVO, JSON.stringify({
      conversation: state.currentConversation,
      sessionId: state.currentHistorySessionId,
      // 连排盘本身也存一份快照，不然刷新恢复对话后排盘表是空的，
      // 而且下次点"AI 解读"会因为 lastCastData 为空而悄悄重新摇一卦。
      castData: castStore.canonical ? migrateCastSnapshot(castStore.canonical) : null,
      castQuestion: castStore.question || '',
      castTime: castStore.time || null,
      savedAt: Date.now(),
    }));
  }catch(e){
    // 比如 localStorage 满了/被禁用，静默失败即可——不影响当前这次问答本身，只是刷新后没法恢复
  }
}

function loadActiveConversationFromStorage(){ return migrateStorage().active; }

function clearActiveConversationStorage(){
  if(!canWriteStoredJson(LS_KEY_ACTIVE_CONVO)) return;
  try{
    localStorage.removeItem(LS_KEY_ACTIVE_CONVO);
  }catch(e){
    // 同上（见 saveActiveConversation 的 catch）：静默失败即可，不影响当前这次操作本身
  }
}

export { LS_KEY_ACTIVE_CONVO, saveActiveConversation, loadActiveConversationFromStorage, clearActiveConversationStorage };
