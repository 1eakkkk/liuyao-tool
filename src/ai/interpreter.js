import { buildStructuredMessages, buildStructuredSystemPrompt } from './structured-input.js';
import { STRUCTURED_PROMPT_VERSION, AI_INPUT_SCHEMA_VERSION } from './schemas.js';
import { callDeepSeekRaw } from './client.js';
import { buildSystemPrompt } from './prompt-builder.js';
import { saveActiveConversation } from '../storage/conversation.js';
import { state } from '../app/state.js';



// ---- 首次解读：建立本次会话的消息数组，并把结果存进 currentConversation 供后续追问续接 ----
// signal: 传给 callDeepSeekRaw，用于支持"停止生成"中途打断请求。
async function interpretWithDeepSeek(question, castDataText, onDelta, signal, structuredCast = null){
  const messages = structuredCast ? buildStructuredMessages(question, structuredCast) : [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content:
      `排盘数据：\n${castDataText}\n\n提问者的问题是：${question}\n\n请结合以上排盘数据给出解卦回复。` },
  ];
  const result = await callDeepSeekRaw(messages, onDelta, signal);
  state.currentConversation = {
    ...(structuredCast ? { input_mode: 'structured', prompt_version: STRUCTURED_PROMPT_VERSION, ai_input_schema_version: AI_INPUT_SCHEMA_VERSION } : {}),
    messages: [...messages, { role: 'assistant', content: result.text }],
    turns: [
      { role: 'user', text: question, ts: Date.now() },
      { role: 'assistant', text: result.text, ts: Date.now(), interrupted: !!result.interrupted },
    ],
    cumTokens: result.totalTokens,
    cumCost: result.costYuan,
  };
  saveActiveConversation();
  return result;
}


// ---- 追问：把新的一句用户输入接到已有 messages 后面，整段历史一起发给AI，不是每次都从头起卦 ----
async function followUpWithDeepSeek(followUpText, onDelta, signal){
  if(!state.currentConversation){
    throw new Error('还没有可以追问的解读，先点一次"AI 解读"。');
  }
  const followUpContent =
    `追问：${followUpText}\n\n（请按系统设定里的追问规则，先判断这条追问是不是还在问同一件事，再决定要不要正常展开解读。）`;
  // 追问要跟随"当前"的回复风格设置，不能锁死在首次解读那一刻的风格——
  // 用户很可能中途去"设置"里把风格从深究换成精简（或反过来），这里每次追问都
  // 重新生成一份系统提示词，替换掉 currentConversation.messages[0] 里那条旧的，
  // 对话历史（用户问/AI答的具体轮次）不受影响，变的只是这条system指令本身。
  const mode = state.currentConversation.input_mode || 'legacy';
  if (!['legacy', 'structured'].includes(mode)) throw new Error('不支持此会话的 AI 输入模式');
  if (mode === 'structured' && (state.currentConversation.prompt_version !== STRUCTURED_PROMPT_VERSION || state.currentConversation.ai_input_schema_version !== AI_INPUT_SCHEMA_VERSION)) throw new Error('此实验会话协议已变化，请重新开始解读');
  const freshSystemMessage = { role: 'system', content: mode === 'structured' ? buildStructuredSystemPrompt() : buildSystemPrompt() };
  const messages = [freshSystemMessage, ...state.currentConversation.messages.slice(1), { role: 'user', content: followUpContent }];
  const result = await callDeepSeekRaw(messages, onDelta, signal);
  state.currentConversation.messages = [...messages, { role: 'assistant', content: result.text }];
  state.currentConversation.turns.push({ role: 'user', text: followUpText, ts: Date.now() });
  state.currentConversation.turns.push({ role: 'assistant', text: result.text, ts: Date.now(), interrupted: !!result.interrupted });
  state.currentConversation.cumTokens += result.totalTokens;
  state.currentConversation.cumCost += result.costYuan;
  saveActiveConversation();
  return result;
}

export { interpretWithDeepSeek, followUpWithDeepSeek };
