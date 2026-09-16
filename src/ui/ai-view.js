import { escapeHtml } from './helpers.js';
import { aiResult, promptOutputBox, promptOutputText, promptExtraTools, cleanupInputText, cleanupOutputText, cleanupCopyRow, followUpExportInput, followUpExportOutput, followUpExportCopyRow, stopGenBtn } from './dom.js';
import { annotateShichen, annotateGanzhiDay } from '../ai/text.js';
import { state } from '../app/state.js';



// ---- 单条问答轮次渲染成一个块，首次解读/追问/正在流式输出中的临时块都共用这一个函数 ----
function turnHtml(t){
  const cls = `convo-turn convo-${t.role}${t.interrupted ? ' interrupted' : ''}`;
  return `<div class="${cls}"><b>${t.role === 'user' ? '问' : '答'}：</b>${escapeHtml(t.text)}</div>`;
}


// ---- 把当前会话已经落定的完整往返渲染出来（不含正在流式输出、还没完成的那一条）----
function renderConversation(){
  if(!state.currentConversation){ aiResult.textContent = ''; return; }
  aiResult.innerHTML = state.currentConversation.turns.map(turnHtml).join('');
}


// ---- 流式文字真正开始吐之前（模型还在思考/推理阶段）调用：显示"正在思考中…Ns"，
// 秒数跳字跳动，比干等着一个空光标看着更有反馈感。等第一个delta到了就切到 renderLive。----
function renderThinking(questionText, seconds){
  const settledHtml = state.currentConversation ? state.currentConversation.turns.map(turnHtml).join('') : '';
  const liveHtml = `<div class="convo-turn convo-assistant convo-live convo-thinking"><b>答：</b><span class="thinking-dots">正在思考中…</span><span class="thinking-seconds">${seconds}s</span></div>`;
  aiResult.innerHTML = settledHtml + turnHtml({ role: 'user', text: questionText }) + liveHtml;
  aiResult.scrollTop = aiResult.scrollHeight;
}


// ---- 把"思考中跳秒计时"包装进 onDelta 回调里：调用后立刻显示"正在思考中…0s"并开始跳秒，
// 收到第一个真正的文字delta时自动停表、切换成正常的流式渲染。解读和追问共用这一个包装。
// 用法：const { onDelta, stop } = withThinkingIndicator(questionText, realOnDelta); ... 结束/出错时调用 stop()。
function withThinkingIndicator(questionText, onDelta){
  renderThinking(questionText, 0);
  const startTime = Date.now();
  let ticking = true;
  const timer = setInterval(()=>{
    if(!ticking) return;
    renderThinking(questionText, Math.floor((Date.now() - startTime) / 1000));
  }, 1000);
  const stop = () => { if(ticking){ ticking = false; clearInterval(timer); } };
  const wrappedOnDelta = (delta, fullSoFar) => {
    stop(); // 第一个字来了，思考阶段结束
    onDelta(delta, fullSoFar);
  };
  return { onDelta: wrappedOnDelta, stop };
}


// ---- 流式输出过程中调用：已落定的历史轮次 + 这一问 + 正在打字的实时答案，末尾带个闪烁光标 ----
function renderLive(questionText, liveAnswerText){
  const settledHtml = state.currentConversation ? state.currentConversation.turns.map(turnHtml).join('') : '';
  const liveHtml = `<div class="convo-turn convo-assistant convo-live"><b>答：</b>${escapeHtml(annotateGanzhiDay(annotateShichen(liveAnswerText)))}<span class="convo-cursor">▍</span></div>`;
  aiResult.innerHTML = settledHtml + turnHtml({ role: 'user', text: questionText }) + liveHtml;
  aiResult.scrollTop = aiResult.scrollHeight;
}


// ---- 收起"输出提示词"这一整套（主提示词/贴回矫正/追问提示词三个框），并把跟"上一次输出提示词"
// 绑定的 lastExportCastText/lastExportQuestion 一并作废。用在两个场景：
// 1) renderPlate() 里——一旦真的重新起了一卦，这三个框和这两个变量就全部过期了，
//    不清掉的话会出现"排盘已经是新卦，提示词框还停在旧卦"（错位）或者"生成追问提示词
//    时悄悄用了上一卦的数据"（内容错误）。
// 2) interpretBtn 点击时——即便这次没有触发重摇（同一件事继续问），只是切去"AI解读"这条
//    路径，也应该把"输出提示词"那一屏收起来，避免两条路径的结果区同屏叠着，分不清该看哪个。
//    这种情况下不强制清空 lastExportCastText/lastExportQuestion（卦没变，数据仍然有效），
//    真正的作废只交给 renderPlate() 在"确实重摇了"的时候去做。
function hidePromptExportBoxes(){
  state.lastRulesExportPair = null;
  state.lastRulesExportInput = null;
  const rulesPanel = document.getElementById('rulesInputComparison');
  if (rulesPanel) rulesPanel.style.display = 'none';
  state.lastExportPair = null;
  state.lastStructuredExportInput = null;
  state.lastExportMode = 'legacy';
  promptOutputBox.style.display = 'none';
  promptExtraTools.style.display = 'none';
  promptExtraTools.classList.remove('open'); // 下次重新弹出时重新从折叠态开始，不记住上次展没展开
  cleanupInputText.value = '';
  cleanupOutputText.value = '';
  cleanupOutputText.style.display = 'none';
  cleanupCopyRow.style.display = 'none';
  followUpExportInput.value = '';
  followUpExportOutput.value = '';
  followUpExportOutput.style.display = 'none';
  followUpExportCopyRow.style.display = 'none';
}


// ---- 停止生成：同一时间只会有一个流式请求在跑（解读和追问互相锁定按钮），
// 所以一个 AbortController + 一个共用的停止按钮就够用了。 ----

function showStopBtn(){ stopGenBtn.style.display = 'inline-flex'; }

function hideStopBtn(){ stopGenBtn.style.display = 'none'; }


// ---- 提示词导出结果的显示/复制/收起：和上面"复制最新回复"是同一套复制手法，
// 只是复制的对象换成 promptOutputText 这个只读文本框里的完整提示词。 ----
function showPromptOutput(text){
  promptOutputText.value = text;
  promptOutputBox.style.display = 'block';
  // "贴回矫正"和"生成追问提示词"这两步只在少数场景才用得上（换个AI软件接着问、
  // 对方AI没有上下文记忆、想把这次问答也存一份在本站）——多数人复制主提示词发出去后
  // 会直接在对方AI那边接着聊，所以这里只露出折叠起来的入口，不强行展开占地方。
  promptExtraTools.style.display = 'block';
  promptExtraTools.classList.remove('open');
  promptOutputBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export { turnHtml, renderConversation, renderThinking, withThinkingIndicator, renderLive, hidePromptExportBoxes, showStopBtn, hideStopBtn, showPromptOutput };
