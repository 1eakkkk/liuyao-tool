import { followUpBox, followUpInput, followUpStatus } from '../ui/dom.js';
import { clearActiveConversationStorage } from '../storage/conversation.js';
import { loadHistory, saveHistory } from '../storage/history.js';
import { state } from './state.js';



function resetConversation(){
  state.currentConversation = null;
  state.currentHistorySessionId = null;
  followUpBox.style.display = 'none';
  followUpInput.value = '';
  followUpInput.dispatchEvent(new Event('input')); // 同步触发一次，让字数计数器跟着归零
  followUpStatus.textContent = '';
  clearActiveConversationStorage();
}


// ---- 历史记录持久化：一次摇卦对应一整条"会话"记录，首次解读建条，之后每次追问更新同一条 ----
// 旧版本的历史记录是"一次AI调用=一条平铺记录"（字段是question/text），这里做兼容：
// 没有turns字段的老记录，读取时当成只有一轮问答的会话来显示，不用做数据迁移。
function updateHistorySession(sessionId, patch){
  const list = loadHistory();
  const idx = list.findIndex(r => r.id === sessionId);
  if(idx === -1) return false; // 比如历史被清空过，找不到就算了，不强行拼凑
  list[idx] = { ...list[idx], ...patch };
  saveHistory(list);
  return true;
}

export { resetConversation, updateHistorySession };
