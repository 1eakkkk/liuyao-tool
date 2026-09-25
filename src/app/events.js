import { selectedRulesMode, buildRulesPair, buildRulesExportPrompt } from '../ai/rules-input.js';
import { initializeReading, readingSelected, startReading, clearReading } from '../ui/reading.js';
import { bindDisclosure } from '../ui/disclosure.js';
import { showRulesExportComparison } from '../ui/rules-debug.js';
import { buildPairedPromptExports, buildStructuredExportPrompt } from '../ai/exports.js';
import { showAiExportComparison } from '../ui/ai-debug.js';
import { selectedAiInputMode } from '../ai/structured-input.js';
import { castStore } from './cast-store.js';
import { cx, cy, R, pos, arcPath, activateWxNode } from '../ui/basics.js';
import { manualLineTouched, buildManualLinesUI, renderManualPreview, performManualCast } from '../ui/manual-cast.js';
import { isLifespanQuestion, isSameQuestion, guardBeforeCast } from '../app/question.js';
import { castInputFromEvent, performBackgroundCast, performCast } from '../ui/physics-view.js';
import { renderCastQuota, renderPlateFromCastData } from '../ui/casting-view.js';
import { resetConversation, updateHistorySession } from '../app/conversation.js';
import { renderStats, renderHistory } from '../ui/history-view.js';
import { tabButtons, switchTab } from '../ui/navigation.js';
import { renderConversation, withThinkingIndicator, renderLive, hidePromptExportBoxes, showStopBtn, hideStopBtn, showPromptOutput } from '../ui/ai-view.js';
import { updateApiKeyStatus, refreshPriceOverridePlaceholders, fillPriceOverrideInputs, lockApiKeyInput, unlockApiKeyInput } from '../ui/settings.js';
import { showToast, showConfirm, ONBOARD_KEY, updateOnboardFade, openOnboard, closeOnboard } from '../ui/dialogs.js';
import { bindCharCounter, copyTextToClipboard } from '../ui/helpers.js';
import { svg, dayGanzhiSelect, dayLookupDateInput, castBtn, plateWrap, castModeToggle, systemCastPanel, manualCastPanel, manualCastBtn, onboardCloseBtn, helpFab, onboardScroll, questionInput, questionCharCounter, interpretBtn, aiStatus, aiResult, aiMeta, copyRow, copyResultBtn, copyAllBtn, clearResultBtn, promptBtn, promptOutputBox, promptOutputText, copyPromptBtn, closePromptBtn, promptExtraTools, promptExtraToggle, cleanupInputText, cleanupOutputText, cleanupRunBtn, cleanupCopyRow, copyCleanupBtn, followUpExportInput, followUpExportOutput, followUpExportBtn, followUpExportCopyRow, copyFollowUpExportBtn, followUpBox, followUpInput, followUpCharCounter, followUpBtn, followUpStatus, stopGenBtn, toggleSettingsBtn, aiSettings, apiKeyInput, saveKeyBtn, clearKeyBtn, styleSelect, customStyleWrap, customStyleInput, roleSelect, roleHint, customRoleWrap, customRoleInput, effortSelect, modelSelect, priceHit, priceMiss, priceOutput, savePriceOverrideBtn, resetPriceOverrideBtn, gotoAiTabBtn, toggleHistoryBtn, historyPanel, historyList, clearHistoryBtn } from '../ui/dom.js';
import { interpretWithDeepSeek, followUpWithDeepSeek } from '../ai/interpreter.js';
import { formatCastDataForAI } from '../ai/formatter.js';
import { resultUsageText } from '../ai/client.js';
import { buildExportPromptText, buildExportFollowUpPromptText } from '../ai/prompt-builder.js';
import { annotateShichen, annotateGanzhiDay, stripMarkdown } from '../ai/text.js';
import { currentRoleLabel, currentRoleCustomSnapshot, currentReplyStyleLabel, currentStyleCustomSnapshot } from '../ai/preferences.js';
import { LS_KEY_CAST_LOG, configureQuotaNotifications, logCastEvent, castsRemainingInWindow } from '../storage/cast-log.js';
import { loadActiveConversationFromStorage } from '../storage/conversation.js';
import { LS_KEY_HISTORY, loadHistory, saveHistory, appendHistory, LS_KEY_LIFETIME_STATS, clearLifetimeStats, buildHistoryCastSnapshot } from '../storage/history.js';
import { loadRoleChoice, saveRoleChoice, loadCustomRole, saveCustomRole, loadModelChoice, saveModelChoice, savePriceOverride, clearPriceOverride, loadApiKey, saveApiKey, clearApiKey, loadStyleChoice, saveStyleChoice, loadCustomStyle, saveCustomStyle, loadEffortChoice, saveEffortChoice } from '../storage/settings.js';
import { configureStorageNotifications, safeGetItem, safeSetItem } from '../storage/local.js';
import { state } from '../app/state.js';
import { ROLE_HINTS } from '../ai/config.js';
import { getTodayJiaziIndex } from '../core/ganzhi.js';
import { BAGUA, WX, JIAZI60 } from '../core/constants.js';

export function initializeApp(){
  configureStorageNotifications(showToast);
  configureQuotaNotifications(renderCastQuota);
/* ==================================================================
  ③ 逻辑区目录（按出现顺序，各节都有同款横幅注释可搜索跳转）：

  【界面基础】
  tabs 标签切换（role="tablist"/"tab"/"tabpanel"，含左右方向键/Home/End 导航与
  roving tabindex）→ bagua grid 八卦卡片渲染 → wuxing wheel 五行轮盘交互

  【排盘核心（纯数据与算法，与界面无关，最值得测试的部分）】
  najia data 纳甲表/地支五行/六神 → eight-palace 八宫64卦生成（世应位）
  → six relatives 六亲判定 → 60 jiazi / kongwang 六十甲子与空亡
  → getTodayJiaziIndex 今日日柱推算

  【摇卦规则与流程】
  生死寿数问题过滤 → safeSetItem/safeRemoveItem 安全本地存储写入（localStorage
  失败时走 toast 提示，所有用户直接触发的设置写入都走这一层）
  → 摇卦前置校验（一事一挂 + 10分钟频率限制，normQuestion 问题归一化）
  → caster 系统摇卦 → 线下摇卦手动填入（含"修正录入不算重摇"特例）
  → renderPlate 排盘渲染与结构化数据（lastCastData/lastCastQuestion/lastCastTime）

  【通用UI】
  Toast 提示 → 弹层焦点管理工具（getFocusableIn/trapTabKey，Tab循环限制在弹层内，
  showConfirm 和新手教程弹层共用）→ 通用确认弹层 showConfirm（默认焦点在"取消"，
  关闭后焦点还原）→ 新手教程弹层（打开自动聚焦"知道了"，Esc/点击遮罩关闭）

  【AI 解卦】
  ROLE_PRESETS 角色设定 / REPLY_STYLE_PRESETS 回复风格 / PRICE_TABLES 计费单价（分模型）
  → localStorage 键管理（Key/风格/历史）→ stripMarkdown → buildSystemPrompt 系统提示词
  → formatCastDataForAI 排盘转文本 → buildExportPromptText 提示词导出文本（不经API Key）
  → interpretWithDeepSeek 调用API与计费估算
  → UI绑定：Key打码管理（含 interpretBtn 按需显隐）/ 历史记录与累计统计
  → interpretBtn 主流程（含：问题认领10分钟时效 → 判断是否重摇 → 调AI → 写历史）
  → promptBtn 提示词导出主流程（复用同一套问题认领/重摇判断，但不调API、不写历史）
================================================================== */
/* ---------------- 折叠区块：进阶/参考内容默认收起，点标题展开 ---------------- */
document.querySelectorAll('section.block-collapse').forEach((sec, index)=>{
  const h2 = sec.querySelector('h2');
  const hint = document.createElement('span');
  hint.className = 'collapse-hint';
  h2.appendChild(hint);
  bindDisclosure(h2, sec.querySelector('.block-collapse-body'), sec, `section-details-${index}`);
});
document.querySelectorAll('.settings-group.collapsible').forEach((group, index)=>{
  const title = group.querySelector('.settings-group-title');
  bindDisclosure(title, group.querySelector('.settings-group-body'), group, `settings-details-${index}`);
});
// 供 AI 面板顶部状态条使用：有 castStore.legacy 就显示"当前排盘：卦名 · 日柱"，
// 没有（还没摇过卦，或者数据被清空）就隐藏整条，不占位置。挂在 window 上是因为
// 摇卦/复原历史卦等多处写 castStore.legacy 的代码分散在文件后面，
// 那几处会直接调用 window.updateCurrentCastStatus() 同步这条状态。
window.updateCurrentCastStatus = function(){
  const box = document.getElementById('currentCastStatus');
  if(!box) return;
  const d = castStore.legacy;
  if(d && d.guaName){
    const bianText = d.bianGuaName && d.bianGuaName !== d.guaName ? `（变 ${d.bianGuaName}）` : '';
    box.innerHTML = `当前排盘：<b>${d.guaName}</b>${bianText} · ${d.ganzhi || ''}日`;
    box.style.display = 'block';
  } else {
    box.style.display = 'none';
  }
};
tabButtons.forEach((btn, i)=>{
  btn.addEventListener('click',()=> switchTab(btn.dataset.tab));
  // 左右方向键 / Home / End 在标签之间移动焦点并直接切换面板（标准tablist行为，
  // 不需要用户额外按Tab/Enter）；上下方向键留给页面自身滚动，不拦截。
  btn.addEventListener('keydown', (e)=>{
    let targetIndex = null;
    if(e.key === 'ArrowRight') targetIndex = (i + 1) % tabButtons.length;
    else if(e.key === 'ArrowLeft') targetIndex = (i - 1 + tabButtons.length) % tabButtons.length;
    else if(e.key === 'Home') targetIndex = 0;
    else if(e.key === 'End') targetIndex = tabButtons.length - 1;
    if(targetIndex === null) return;
    e.preventDefault();
    const target = tabButtons[targetIndex];
    switchTab(target.dataset.tab);
    target.focus();
  });
});
document.getElementById('baguaGrid').innerHTML = BAGUA.map(g=>`
  <div class="gua-card">
    <div class="sym">${g.sym}</div>
    <div class="name">${g.name}　·　${g.el}</div>
    <div class="meta">${g.meta}</div>
  </div>`).join('');
WX.forEach((w,i)=>{
  const a = -Math.PI/2 + i*(2*Math.PI/5);
  pos[w] = {x:cx+R*Math.cos(a), y:cy+R*Math.sin(a)};
});

// sheng arrows (outer pentagon, i -> i+1)
WX.forEach((w,i)=>{
  const a=pos[w], b=pos[WX[(i+1)%5]];
  state.svgHtml += `<path class="wx-arrow sheng" data-from="${w}" data-to="${WX[(i+1)%5]}" d="${arcPath(a,b,cx,cy,26)}"/>`;
});
// ke arrows (inner star, i -> i+2)
WX.forEach((w,i)=>{
  const a=pos[w], b=pos[WX[(i+2)%5]];
  state.svgHtml += `<path class="wx-arrow ke" data-from="${w}" data-to="${WX[(i+2)%5]}" d="${arcPath(a,b,cx,cy,-14,0.72)}"/>`;
});
WX.forEach(w=>{
  const p=pos[w];
  state.svgHtml += `<g class="wx-node" data-el="${w}" tabindex="0" role="button" aria-label="查看${w}的生克关系" transform="translate(${p.x},${p.y})">
    <circle r="22"/><text x="0" y="6" text-anchor="middle">${w}</text></g>`;
});
svg.insertAdjacentHTML('beforeend', state.svgHtml);
svg.querySelectorAll('.wx-node').forEach(node=>{
  node.addEventListener('click',()=>activateWxNode(node));
  // 键盘用户（Tab 聚焦 + Enter/空格触发）之前完全摸不到这个交互，纯 click 监听
  // 覆盖不到键盘操作，这里补上 keydown 处理，跟鼠标/触屏走同一套 activateWxNode 逻辑。
  node.addEventListener('keydown',(e)=>{
    if(e.key==='Enter' || e.key===' ' || e.key==='Spacebar'){
      e.preventDefault();
      activateWxNode(node);
    }
  });
});
dayGanzhiSelect.innerHTML = JIAZI60.map((d,i)=>`<option value="${i}">${d.label}</option>`).join('');
dayGanzhiSelect.value = String(getTodayJiaziIndex());

// ---- 年月时柱/日期显示要用哪个"时刻"算：默认是null，表示用renderPlate()里现取的
// "现在"（正常摇卦场景）；只有下面"按公历日期反查日柱"成功命中之后，才会把那个具体日期
// 存进来，让年月时柱和日期显示也对上那次反查的真实日期，而不是"现在"——
// 这样AI断卦时用到的月柱（月建定旺相休囚死）才是那个历史卦例真正的月柱，不是复盘当天的。
// 只要用户之后没有手动去改日柱下拉框，这个关联就一直有效；一旦手动改了下拉框
// （见下面dayGanzhiSelect的change监听），就清空退回"现在"——因为单选一个干支
// 本身是模糊的（六十天一轮回，没法反推唯一对应哪一天），没法再关联到具体日期。


dayGanzhiSelect.addEventListener('change', ()=>{state.knownCastDate=null;state.daySelectionMode='manual';document.getElementById('dayLookupDate').value='';document.getElementById('dayLookupTime').value='';});
if(dayLookupDateInput){
  dayLookupDateInput.addEventListener('change', ()=>{
    const v = dayLookupDateInput.value; // "YYYY-MM-DD"
    if(!v){state.knownCastDate=null;state.daySelectionMode='auto';dayGanzhiSelect.value=String(getTodayJiaziIndex());return;}
    const [y,m,d] = v.split('-').map(Number);
    if(!y || !m || !d) return;
    const picked = new Date(y, m-1, d); // 按本地日历日期算，跟getTodayJiaziIndex(new Date())默认走同一套时区口径
    // 用JS赋值.value不会触发上面dayGanzhiSelect的'change'监听（那个监听只认用户手动在下拉框里
    // 选选项这种真实交互），所以这里设置knownCastDate不会被自己刚改的下拉框清空。
    dayGanzhiSelect.value = String(getTodayJiaziIndex(picked));
    state.knownCastDate = picked; state.daySelectionMode='date';
    const time=document.getElementById('dayLookupTime').value;if(time){const [h,min]=time.split(':').map(Number);state.knownCastDate.setHours(h,min);}
    showToast(`已按 ${v} 反查并选中日柱：${JIAZI60[getTodayJiaziIndex(picked)].label}`);
  });
}

document.getElementById('dayLookupTime').addEventListener('change',()=>{
  if(state.knownCastDate){const [h,m]=(document.getElementById('dayLookupTime').value||'00:00').split(':').map(Number);state.knownCastDate.setHours(h,m,0,0);}
});


castBtn.addEventListener('click', async ()=>{
  if(!(await guardBeforeCast())) return;
  // 物理投掷完成六爻后才调用 renderPlate；期间锁定其他起卦和解读入口。
  // 这期间 castStore.legacy/lastCastQuestion 还停在"上一卦"。这段时间如果去点"AI解读"
  // /"输出提示词"，读到的就是即将被替换掉的旧卦；如果去点"线下摇卦·生成排盘"，动画结束时
  // 系统摇出的新卦又会把手动填的排盘直接覆盖掉——所以动画期间把这几个按钮一并锁住。
  manualCastBtn.disabled = true;
  interpretBtn.disabled = true;
  promptBtn.disabled = true;
  // 摇卦动画结束时 renderPlate() 会调用 resetConversation() 把 currentConversation 置空；
  // 如果这期间"追问"或"清空"还能点，追问请求返回时对着已被置空的 currentConversation
  // 写数据会直接报错（追问那次问答白问、token 白扣），"清空"同理会跟这次摇卦互相打架，
  // 所以这两个按钮也要在动画期间一并锁住。
  followUpBtn.disabled = true;
  clearResultBtn.disabled = true;
  try{
    await performCast();
  }catch(e){
    showToast(e.message, 'error');
  }finally{
    manualCastBtn.disabled = false;
    interpretBtn.disabled = false;
    promptBtn.disabled = false;
    followUpBtn.disabled = false;
    clearResultBtn.disabled = false;
  }
});
buildManualLinesUI();

castModeToggle.addEventListener('click', (e)=>{
  const btn = e.target.closest('.mode-btn');
  if(!btn) return;
  state.castMode = btn.dataset.mode;
  [...castModeToggle.querySelectorAll('.mode-btn')].forEach(b => b.classList.toggle('active', b === btn));
  systemCastPanel.style.display = state.castMode === 'system' ? '' : 'none';
  manualCastPanel.style.display = state.castMode === 'manual' ? '' : 'none';
  // 切到"线下摇卦"时顺手刷新一次预览——但只在右边此刻还没有一份"摇卦/生成排盘"摇出来的
  // 真实结果时才刷（判断依据：.plate下唯一的子元素还是最初的占位提示文字，或者就是
  // 我们自己这份预览本身）。如果右边正摆着一份真实结果，说明用户是切过去核对/对比的，
  // 不该被一次单纯的切标签页动作顶掉；真要重填，用户改动某一个下拉框（上面的change
  // 监听）就会顶替它，那才是"我要重新填一次"的明确信号。
  if(state.castMode === 'manual' && plateWrap.querySelector('.placeholder, .manual-preview-partial, .manual-preview-complete')){
    renderManualPreview();
  }
});

manualCastBtn.addEventListener('click', async ()=>{
  if(!manualLineTouched.every(Boolean)){showToast('请先逐一确认六爻的录入结果，再生成排盘','error');return;}
  // 修正录入的特例：上一卦本来就是手动填的、问题也没换，
  // 说明大概率是填错了某一爻想改——现实中的摇卦只发生了一次，
  // 重新生成排盘只是数据修正，不算重新起卦，不受"一事不问二卦"拦截。
  // 但注意：这里只豁免"同一件事"的判定，不豁免频率限制——
  // 否则只要一直把问题框留空、反复改六爻选项点"生成排盘"，就能绕开
  // 10分钟最多3次的频率限制无限重摇，跟系统摇卦模式的规矩不一致。
  // 所以修正录入依然要占用一次摇卦名额（logCastEvent），只是跳过"是否同一件事"的比对。
  const currentQuestion = questionInput ? questionInput.value.trim() : '';
  const sameQuestion = castStore.legacy &&
    (currentQuestion === '' || isSameQuestion(currentQuestion, castStore.question || ''));
  if(castStore.legacy && castStore.legacy.source === 'manual' && sameQuestion){
    if(castsRemainingInWindow() <= 0){
      showToast('短时间内已经摇太多次了，心诚则灵，稍等一会再摇（10 分钟内最多 3 次）', 'error', 4500);
      return;
    }
    logCastEvent();
    performManualCast(true);
    return;
  }
  if(!(await guardBeforeCast())) return;
  performManualCast(false);
});

if(!safeGetItem(ONBOARD_KEY)){
  openOnboard();
}
onboardCloseBtn.addEventListener('click', ()=>{
  safeSetItem(ONBOARD_KEY, '1');
  closeOnboard();
});
helpFab.addEventListener('click', openOnboard);
if(onboardScroll){
  onboardScroll.addEventListener('scroll', updateOnboardFade);
  // 横竖屏切换/窗口尺寸变化可能让内容从"需要滚动"变成"一屏放得下"（或反过来），
  // 跟着重新算一次，不然提示可能在不该出现的时候还留着。
  window.addEventListener('resize', updateOnboardFade);
}
bindCharCounter(questionInput, questionCharCounter, 500);
bindCharCounter(followUpInput, followUpCharCounter, 500);
stopGenBtn.addEventListener('click', ()=>{
  if(state.activeAbortController){
    state.activeAbortController.abort();
    stopGenBtn.disabled = true; // 点一下就禁用，避免中断过程中重复点击
  }
});
fillPriceOverrideInputs();

savePriceOverrideBtn.addEventListener('click', ()=>{
  const pick = (el) => {
    const v = parseFloat(el.value);
    return Number.isFinite(v) && v >= 0 ? v : undefined;
  };
  const filled = { hit: pick(priceHit), miss: pick(priceMiss), output: pick(priceOutput) };
  Object.keys(filled).forEach(k => filled[k] === undefined && delete filled[k]);
  if(Object.keys(filled).length === 0){
    clearPriceOverride();
    showToast('没填任何单价，已恢复用内置默认值');
  }else{
    // 填的按"闲时"单价存；高峰单价 = 闲时 ×2（官方峰谷倍率），自动换算好一起存，不用用户再填一遍。
    const peakFilled = {};
    Object.keys(filled).forEach(k => { peakFilled[k] = filled[k] * 2; });
    savePriceOverride({ offpeak: filled, peak: peakFilled });
    showToast('单价已保存（按闲时价填写，高峰价已自动×2换算），之后的计费会按新单价估算');
  }
});

resetPriceOverrideBtn.addEventListener('click', ()=>{
  clearPriceOverride();
  fillPriceOverrideInputs();
  showToast('已恢复内置默认单价');
});
if(gotoAiTabBtn){
  gotoAiTabBtn.addEventListener('click', ()=> switchTab('ai'));
}
['copy','cut','contextmenu'].forEach(evt=>{
  apiKeyInput.addEventListener(evt, e=>{
    if(apiKeyInput.readOnly) e.preventDefault();
  });
});

// 初始化设置区域显示值
{
  const existingKey = loadApiKey();
  if(existingKey){ lockApiKeyInput(existingKey); } else { unlockApiKeyInput(); }
  updateApiKeyStatus();
}
styleSelect.value = loadStyleChoice();
customStyleInput.value = loadCustomStyle();
customStyleWrap.style.display = (styleSelect.value === 'custom') ? 'block' : 'none';
roleSelect.value = loadRoleChoice();
customRoleInput.value = loadCustomRole();
customRoleWrap.style.display = (roleSelect.value === 'custom') ? 'block' : 'none';
roleHint.textContent = ROLE_HINTS[roleSelect.value] || '';
roleSelect.addEventListener('change', ()=>{
  saveRoleChoice(roleSelect.value);
  customRoleWrap.style.display = (roleSelect.value === 'custom') ? 'block' : 'none';
  roleHint.textContent = ROLE_HINTS[roleSelect.value] || '';
});
customRoleInput.addEventListener('input', ()=>{
  saveCustomRole(customRoleInput.value);
});
effortSelect.value = loadEffortChoice();
effortSelect.addEventListener('change', ()=>{ saveEffortChoice(effortSelect.value); });
modelSelect.value = loadModelChoice();
modelSelect.addEventListener('change', ()=>{
  saveModelChoice(modelSelect.value);
  refreshPriceOverridePlaceholders();
});

toggleSettingsBtn.addEventListener('click', ()=>{
  aiSettings.classList.toggle('open');
  toggleSettingsBtn.setAttribute('aria-expanded', aiSettings.classList.contains('open') ? 'true' : 'false');
});

saveKeyBtn.addEventListener('click', ()=>{
  if(apiKeyInput.readOnly){
    showToast('已经保存过了，要换Key的话先点"清除 Key"', 'error');
    return;
  }
  const v = apiKeyInput.value.trim();
  if(!v){ showToast('Key 不能为空', 'error'); return; }
  saveApiKey(v);
  lockApiKeyInput(v);
  updateApiKeyStatus();
  showToast('Key 已保存在本机浏览器', 'success');
});

clearKeyBtn.addEventListener('click', ()=>{
  clearApiKey();
  unlockApiKeyInput();
  updateApiKeyStatus();
  apiKeyInput.focus();
  showToast('Key 已清除，可以重新粘贴新的了');
});

toggleHistoryBtn.addEventListener('click', ()=>{
  historyPanel.classList.toggle('open');
  toggleHistoryBtn.setAttribute('aria-expanded', historyPanel.classList.contains('open') ? 'true' : 'false');
  if(historyPanel.classList.contains('open')) renderHistory();
});

historyList.addEventListener('click', (e)=>{
  const actionEl = e.target.closest('[data-action]');
  if(!actionEl) return;
  const item = e.target.closest('.history-item');
  const id = item?.dataset.id;
  if(actionEl.dataset.action === 'toggle'){
    item.classList.toggle('expanded');
  }else if(actionEl.dataset.action === 'delete'){
    const list = loadHistory().filter(r => String(r.id) !== id);
    saveHistory(list);
    renderHistory();
    showToast('已删除这条记录');
  }
});

clearHistoryBtn.addEventListener('click', async ()=>{
  if(!loadHistory().length) return;
  const ok = await showConfirm('确定清空全部历史记录和累计统计吗？此操作不可撤销。', {
    title: '清空历史记录', okText: '清空', cancelText: '取消'
  });
  if(!ok) return;
  saveHistory([]);
  clearLifetimeStats(); // 确认弹窗里说的是"清空历史记录和累计统计"，累计统计现在存在独立计数器里，这里得一并清掉
  renderHistory();
  renderStats();
  showToast('历史记录已清空');
});

renderStats();

// 摇卦配额提示：页面一打开先渲染一次；配额是10分钟滑动窗口，就算用户什么都不点，
// 名额也会随时间自动恢复，所以额外开一个定时器每30秒刷新一次，不然"已用完"的提示
// 会一直停在页面刚打开时的状态，看不出窗口已经过去、其实可以再摇了。
// 顺带在页面重新回到前台时也刷新一次，覆盖"切到别的标签页/锁屏放了一会儿再回来"这种
// 定时器在后台被浏览器节流、没按时触发的情况。
renderCastQuota();
setInterval(renderCastQuota, 30000);
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible') renderCastQuota();
});

// ---- 跨标签页同步：如果同时开了两个标签页用这个工具（比如手机和电脑各开一个，或者
// 电脑上开了两个标签），每个标签页的 currentConversation/currentHistorySessionId 都是
// 各自独立的内存状态，互相不知道对方的存在。这里只做"只读视图跟着刷新"这一层——
// 另一个标签页写了 localStorage，这个标签页的历史面板/统计条/配额提示如果正显示着，
// 就跟着重新读一遍，不会一直停留在打开这个标签页那一刻的旧数据。
// 注意：这解决的是"看到的是过期数据"，不是"两个标签页同时各自摇卦/追问时数据互相覆盖"
// 那种更底层的写入竞态——本站所有历史记录的写入本来就是"读最新的 localStorage → 改 → 存回"
// 这种前后紧挨着、中间没有await的同步操作，两个标签页真的在同一毫秒内各自完成一整套
// 读改存、彼此的写入穿插进对方那两步之间——这种概率极低，没有为这个再引入更重的
// 跨标签锁机制，权衡下来不划算。
// storage 事件只会在"别的标签页/窗口"修改了 localStorage 时触发，当前这个标签页自己的
// 修改不会触发给自己，所以不用担心跟本页面自己的 renderHistory()/renderStats() 调用重复触发。
window.addEventListener('storage', (e)=>{
  // e.key 为 null 通常是别的标签页调用了 localStorage.clear()，这种整体清空的情况也一并刷新。
  if(e.key === null || e.key === LS_KEY_HISTORY || e.key === LS_KEY_LIFETIME_STATS){
    renderStats();
    if(historyPanel.classList.contains('open')) renderHistory();
  }
  if(e.key === null || e.key === LS_KEY_CAST_LOG){
    renderCastQuota();
  }
});

// ---- 恢复上次刷新前还没结束的会话（如果有的话），恢复后就能直接在原对话基础上继续追问 ----
(function restoreActiveConversation(){
  const saved = loadActiveConversationFromStorage();
  if(!saved || !saved.conversation || !Array.isArray(saved.conversation.turns) || !saved.conversation.turns.length) return;
  state.currentConversation = saved.conversation;
  state.currentHistorySessionId = saved.sessionId || null;
  // 把当时的排盘也一起恢复出来：既让用户能看到这次对话对应的是哪一卦，
  // 也避免 castStore.legacy 空着导致下次点"AI 解读"时被误判成"没摇过卦"而悄悄重摇。
  if(saved.castData){
    renderPlateFromCastData(saved.castData, saved.castQuestion, saved.castTime);
  }
  renderConversation();
  aiMeta.textContent =
    `（已从上次未结束的会话恢复，累计约¥${(state.currentConversation.cumCost||0).toFixed(4)}，仅供参考，以DeepSeek账单为准）`;
  copyRow.style.display = 'flex';
  followUpBox.style.display = 'flex';
})();

initializeReading();

styleSelect.addEventListener('change', ()=>{
  saveStyleChoice(styleSelect.value);
  customStyleWrap.style.display = (styleSelect.value === 'custom') ? 'block' : 'none';
});

customStyleInput.addEventListener('input', ()=>{
  saveCustomStyle(customStyleInput.value);
});

copyResultBtn.addEventListener('click', ()=>{
  const turns = state.currentConversation?.turns || [];
  const lastAnswer = [...turns].reverse().find(t => t.role === 'assistant');
  const textToCopy = lastAnswer ? lastAnswer.text : aiResult.textContent;
  copyTextToClipboard(textToCopy).then(()=>{
    copyResultBtn.textContent = '已复制';
    setTimeout(()=>{ copyResultBtn.textContent = '复制最新回复'; }, 1500);
  }).catch(()=>{
    showToast('自动复制没成功（可能是浏览器权限限制），请长按文字手动复制', 'error');
  });
});

// ---- 复制全部对话：把首次解读 + 所有追问轮次按"问/答"顺序拼成一段文字一起复制，
// 不再只有最后一条回复——追问多轮之后想整段留档/转发的场景就靠这个。 ----
copyAllBtn.addEventListener('click', ()=>{
  const turns = state.currentConversation?.turns || [];
  const textToCopy = turns.length
    ? turns.map(t => `${t.role === 'user' ? '问' : '答'}：${t.text}`).join('\n\n')
    : aiResult.textContent;
  copyTextToClipboard(textToCopy).then(()=>{
    copyAllBtn.textContent = '已复制';
    setTimeout(()=>{ copyAllBtn.textContent = '复制全部对话'; }, 1500);
  }).catch(()=>{
    showToast('自动复制没成功（可能是浏览器权限限制），请长按文字手动复制', 'error');
  });
});

clearResultBtn.addEventListener('click', ()=>{
  aiResult.textContent = '';
  aiMeta.textContent = '';
  copyRow.style.display = 'none';
  resetConversation();
  questionInput.value = ''; // 答案清空的同时把提问框也清掉，避免刷新后"问题还在、答案没了"的错觉
  questionInput.dispatchEvent(new Event('input')); // 同步触发一次，让字数计数器跟着归零
});

copyPromptBtn.addEventListener('click', ()=>{
  copyTextToClipboard(promptOutputText.value).then(()=>{
    copyPromptBtn.textContent = '已复制';
    setTimeout(()=>{ copyPromptBtn.textContent = '复制提示词'; }, 1500);
  }).catch(()=>{
    showToast('自动复制没成功（可能是浏览器权限限制），请长按文字手动复制', 'error');
  });
});

closePromptBtn.addEventListener('click', ()=>{
  promptOutputBox.style.display = 'none';
  promptExtraTools.style.display = 'none';
  promptExtraTools.classList.remove('open');
});

// 备用工具折叠入口：点一下展开/收起里面的"整理格式"和"生成追问提示词"，
// 用法与页面里其它折叠区块（block-collapse / settings-group.collapsible）一致。
bindDisclosure(promptExtraToggle, promptExtraTools.querySelector('.prompt-extra-body'), promptExtraTools, 'prompt-extra-content');

// ---- 贴回矫正：把对方AI回复原文本地跑一遍 stripMarkdown + annotateShichen + annotateGanzhiDay，
// 不发任何网络请求，纯字符串处理，复用"AI 解读"清洗回复用的同一套函数，保证
// 两条路径最终展示给用户的格式风格一致（干支日换算成具体日期也在这一步一并做掉）。 ----
cleanupRunBtn.addEventListener('click', ()=>{
  const raw = cleanupInputText.value;
  if(!raw.trim()){
    showToast('先把对方AI的回复粘贴进来', 'error');
    return;
  }
  cleanupOutputText.value = annotateGanzhiDay(annotateShichen(stripMarkdown(raw)));
  cleanupOutputText.style.display = 'block';
  cleanupCopyRow.style.display = 'flex';
});

copyCleanupBtn.addEventListener('click', ()=>{
  copyTextToClipboard(cleanupOutputText.value).then(()=>{
    copyCleanupBtn.textContent = '已复制';
    setTimeout(()=>{ copyCleanupBtn.textContent = '复制整理结果'; }, 1500);
  }).catch(()=>{
    showToast('自动复制没成功（可能是浏览器权限限制），请长按文字手动复制', 'error');
  });
});

// ---- 生成追问提示词：优先用"贴回矫正"清洗后的结果当作"上一轮回复"，没清洗过就退回用原始粘贴内容，
// 都没有就提示用户先去上面贴一次。lastExportCastText/lastExportQuestion 由 promptBtn 那次点击时记下。 ----
followUpExportBtn.addEventListener('click', ()=>{
  const followUpText = followUpExportInput.value.trim();
  if(!followUpText){
    showToast('先写一下这次想追问的内容', 'error');
    return;
  }
  const priorAnswerText = (cleanupOutputText.value || cleanupInputText.value || '').trim();
  if(!priorAnswerText){
    showToast('先把对方AI上一轮的回复粘贴到上面"整理格式"里', 'error');
    return;
  }
  if(!state.lastExportCastText || !state.lastExportQuestion){
    showToast('请先点一次"输出提示词"生成初次提示词', 'error');
    return;
  }
  followUpExportOutput.value = state.lastExportMode === 'rules'
    ? buildRulesExportPrompt(state.lastRulesExportInput, priorAnswerText, followUpText)
    : state.lastExportMode === 'structured'
    ? buildStructuredExportPrompt(state.lastStructuredExportInput, priorAnswerText, followUpText)
    : buildExportFollowUpPromptText(state.lastExportQuestion, state.lastExportCastText, priorAnswerText, followUpText);
  followUpExportOutput.style.display = 'block';
  followUpExportCopyRow.style.display = 'flex';
});

copyFollowUpExportBtn.addEventListener('click', ()=>{
  copyTextToClipboard(followUpExportOutput.value).then(()=>{
    copyFollowUpExportBtn.textContent = '已复制';
    setTimeout(()=>{ copyFollowUpExportBtn.textContent = '复制追问提示词'; }, 1500);
  }).catch(()=>{
    showToast('自动复制没成功（可能是浏览器权限限制），请长按文字手动复制', 'error');
  });
});

interpretBtn.addEventListener('click', async (event)=>{
  const physicalInput = castInputFromEvent(event);
  const question = questionInput.value.trim();
  if(!question){
    showToast('先写一下想问的问题', 'error');
    return;
  }
  if(isLifespanQuestion(question)){
    showToast('传统上卦师不轻断生死寿数，这类问题这里不会生成解读——如果是身体或者情绪上的真实担忧，更建议找医生或者信得过的人聊聊', 'error', 6000);
    return;
  }
  if(!loadApiKey()){
    aiSettings.classList.add('open');
    showToast('先在下面"设置"里填一下 DeepSeek API Key', 'error');
    apiKeyInput.focus();
    return;
  }

  interpretBtn.disabled = true;
  // 解读进行中锁住两个摇卦入口，防止中途换卦导致"旧卦的解读显示在新卦下面"的错位
  castBtn.disabled = true;
  manualCastBtn.disabled = true;
  // 同时锁住"清空回复"：这里马上要调用 resetConversation()，如果解读请求跑到一半用户又点了
  // 清空（其实这时候清不清效果一样），问题不大；但真正要防的是反过来的顺序——如果不锁，用户
  // 能在下面 DeepSeek 请求流式返回期间点"清空回复"，那次清空会把 currentConversation 置空，
  // 等请求结束回来准备写回结果时可能就对着一个已经被清空的对象操作，体验很怪。统一锁住最省心。
  clearResultBtn.disabled = true;
  // "AI 解读"这里马上会调用 resetConversation()，把 currentConversation 置空；如果这期间
  // "追问"还能点，追问请求返回时对着已被置空的 currentConversation 写数据会直接报错
  // （那次追问白问、token 照样扣但结果丢了），所以追问按钮也要在这整个流程期间锁住。
  followUpBtn.disabled = true;
  aiResult.textContent = '';
  aiMeta.textContent = '';
  copyRow.style.display = 'none';
  // 点"AI 解读"意味着开始一次新的解卦会话（换问题、重新起卦、或者对同一卦重新生成都算），
  // 之前如果有追问上下文，这里清掉，避免新一卦的解读里混进上一卦追问的对话历史。
  resetConversation();
  // 切到"AI 解读"这条路径，就把"输出提示词"那一屏（主提示词/贴回矫正/追问提示词）收起来，
  // 避免两条路径的结果区同屏叠着分不清该看哪个；卦是否真的换了由下面的重摇逻辑决定，
  // 真重摇了会经 performCast→renderPlate 把 lastExportCastText/lastExportQuestion 一并作废。
  hidePromptExportBoxes();

  try{
    // 如果已经摇过一卦、但摇的时候问题框还是空的（先摇卦、后写问题的顺序），
    // 就把当前问题"认领"给这一卦——这卦就是为这个问题摇的，不重摇、不多扣次数。
    // 只认领 10 分钟内摇的卦：放太久的空问题旧卦（比如页面开着忘了）不认领，直接重摇新卦。
    const ADOPT_WINDOW_MS = 10 * 60 * 1000;
    if(castStore.legacy && !(castStore.question || '').trim()
       && (Date.now() - (castStore.time || 0)) <= ADOPT_WINDOW_MS){
      castStore.question = question;
    }
    // 判断是否要重新起卦：要么根本没摇过卦，要么问题跟上次摇卦时不一样——
    // 但"字面不一样"不代表真的是另一件事（可能只是同一件事换个说法/继续追问），
    // 所以这里不再静默自动重摇，改成弹窗让用户自己确认。
    const questionChanged = !!castStore.legacy && !isSameQuestion(question, castStore.question || '');
    let shouldRecast = !castStore.legacy; // 压根没摇过卦，必须起一卦，不用问

    if(castStore.legacy && questionChanged){
      const userSaysNewEvent = await showConfirm(
        `这次问题和上一卦提问的文字不完全一样：\n\n上一卦问的：${castStore.question}\n这次写的：${question}\n\n是同一件事换个说法/继续追问，还是确实换了件不相关的新事？`,
        { title: '是同一件事，还是换新事了？', okText: '换新事了，重摇', cancelText: '同一件事，不重摇' }
      );
      if(userSaysNewEvent){
        shouldRecast = true;
      }else{
        // 用户确认还是同一件事：把这次的说法记成"这一卦对应的问题"，
        // 免得下次又换个说法问，还得再弹一次确认。
        castStore.question = question;
        showToast('沿用上一卦解读', 'info');
      }
    }

    if(shouldRecast){

      // 这里如果 castStore.legacy 还在，说明能走到这一步是因为上面 questionChanged 分支里
      // 用户已经在"是同一件事，还是换新事了？"那个确认框里点过"换新事了，重摇"——
      // 已经问过一遍了，传 skipCastConfirm 避免 guardBeforeCast() 里再弹一次重复的确认框。
      if(!(await guardBeforeCast({ skipCastConfirm: true, background: true }))){
        interpretBtn.disabled = false;
        return;
      }
      aiStatus.textContent = '正在后台起卦…';
      aiStatus.textContent = '正在后台起卦…';
      await performBackgroundCast(physicalInput, (done,total)=>{ aiStatus.textContent = `正在后台起卦 · ${done}/${total} 爻`; });
      castBtn.disabled = true; // performCast 结束会解锁摇卦按钮，这里重新锁住直到本次解读完成
    }

    aiStatus.textContent = '正在调用 DeepSeek 生成解卦回复…';
    showToast('正在调用 DeepSeek 生成解卦回复…');
    if (readingSelected()) {
      await startReading(castStore.canonical, 'api');
      aiStatus.textContent = '结构化解读见下方';
      return;
    }
    const structuredCast = selectedAiInputMode() === 'structured' ? castStore.canonical : null;
    const castText = structuredCast ? null : formatCastDataForAI(castStore.canonical);
    // 这条历史记录id必须在调用 interpretWithDeepSeek 之前就生成好：interpretWithDeepSeek 内部
    // 拿到回复后会立刻调用一次 saveActiveConversation()，把 sessionId 存进"当前会话"缓存里；
    // 如果这里不提前赋值，那次保存用的还是 resetConversation() 刚清成的 null，
    // 等回复结束回到这里才把 currentHistorySessionId 换成真正的新id——这中间就产生了错位：
    // localStorage 里"当前会话"记的 sessionId 还是旧的 null，可后面 appendHistory() 建的
    // 历史记录用的却是新id。这时候如果刷新/关闭页面，恢复出来的 currentHistorySessionId 就是
    // null，后续追问会拿着这个 null 去 updateHistorySession() 找记录，永远找不到匹配项，
    // 追问内容就悄悄没能存进历史（且不会报错提示），历史记录里就只剩最初那一问一答，
    // 后面继续追问的内容全部看不到。
    state.currentHistorySessionId = Date.now();
    const controller = new AbortController();
    state.activeAbortController = controller;
    stopGenBtn.disabled = false;
    showStopBtn();
    const thinking = withThinkingIndicator(question, (delta, fullSoFar)=>{
      renderLive(question, fullSoFar);
    });
    let result;
    const requestConfig = {roleLabel: currentRoleLabel(), styleLabel: currentReplyStyleLabel(),
      roleCustomText: currentRoleCustomSnapshot(), styleCustomText: currentStyleCustomSnapshot()};
    try{
      result = await interpretWithDeepSeek(question, castText, thinking.onDelta, controller.signal, structuredCast, selectedRulesMode());
    }finally{
      thinking.stop(); // 保底：万一中途出错/被中断，没等到第一个delta，也要把跳秒计时器停掉
      state.activeAbortController = null;
      hideStopBtn();
    }
    renderConversation();
    aiMeta.textContent = resultUsageText(result);
    copyRow.style.display = 'flex';
    followUpBox.style.display = 'flex';

    // 一次摇卦对应一条历史"会话"记录：这里建条，用的是前面已经提前生成好的
    // currentHistorySessionId（跟 saveActiveConversation 里存的 sessionId 是同一个值），
    // 后面每次追问都更新同一条，而不是每问一句就在历史列表里新开一条互不相干的记录。
    // 这一步单独包一层try/catch：此时AI回复其实已经拿到、也已经渲染出来了，
    // 写历史记录失败（比如某些浏览器隐私模式禁用了localStorage、或者存储配额满了）
    // 不该把下面"完成"的状态和提示覆盖成报错，让用户误以为这次白问了、回去重新问一遍。
    try{
      appendHistory({
        id: state.currentHistorySessionId,
        ts: state.currentHistorySessionId,
        type: 'ai',
        question,
        cast: buildHistoryCastSnapshot(castStore.canonical),
        turns: state.currentConversation.turns.slice(),
        totalTokens: state.currentConversation.cumTokens,
        costYuan: state.currentConversation.cumCost,
        isPeak: result.isPeak,
        ...requestConfig,
      });
      renderStats();
      if(historyPanel.classList.contains('open')) renderHistory();
    }catch(histErr){
      showToast('回复已经生成，但这条没能存进历史记录（' + (histErr.message || '本地存储异常') + '）', 'error', 5000);
    }
    aiStatus.textContent = result.interrupted ? '解读未完整结束' : '完成';
    showToast(result.interrupted?'解读未完整结束，已保留收到的内容':'解读完成', result.interrupted?'info':'success');
  }catch(e){
    const msg = e.message || '出错了，再试一次';
    aiStatus.textContent = msg;
    showToast(msg, 'error', 5000);
  }finally{
    interpretBtn.disabled = false;
    castBtn.disabled = false;
    manualCastBtn.disabled = false;
    clearResultBtn.disabled = false;
    followUpBtn.disabled = false;
  }
});

// ---- "输出提示词"主流程：和"AI 解读"共用同一套"要不要重新起卦"的判断逻辑
// （问题认领10分钟时效 / 问题变了要不要重摇的确认弹窗 / 手动模式下的提示），
// 这几步特意按interpretBtn那边的写法原样再写一遍、不做抽取合并，避免为了复用而牵动
// 已经跑通的interpretBtn主流程。区别只在最后一步：不调用DeepSeek、不计费、不写历史，
// 而是把 buildSystemPrompt + 排盘数据 + 问题 拼成文本，直接显示出来给用户复制。
// 开头会顺手把 interpretBtn 也锁住，防止"AI解读"和"输出提示词"这两个入口同时抢同一个
// castStore.legacy / 摇卦次数配额；反过来 interpretBtn 点击时也会顺带锁住摇卦按钮，
// 这里额外检查 interpretBtn.disabled，防止"AI解读"正在跑的时候被"输出提示词"插队。
promptBtn.addEventListener('click', async (event)=>{
  const physicalInput = castInputFromEvent(event);
  if(interpretBtn.disabled){
    showToast('"AI 解读"正在进行中，请稍等它结束', 'error');
    return;
  }
  const question = questionInput.value.trim();
  if(!question){
    showToast('先写一下想问的问题', 'error');
    return;
  }
  if(isLifespanQuestion(question)){
    showToast('传统上卦师不轻断生死寿数，这类问题这里不会生成解读——如果是身体或者情绪上的真实担忧，更建议找医生或者信得过的人聊聊', 'error', 6000);
    return;
  }

  promptBtn.disabled = true;
  interpretBtn.disabled = true;
  castBtn.disabled = true;
  manualCastBtn.disabled = true;
  // 这条路径如果判断需要重新起卦，内部会走到跟"摇卦"按钮一样的 performCast()，
  // 同样会把 currentConversation 置空；"清空"按钮同理会跟这里的流程互相打架，
  // 所以追问和清空这两个按钮也要在这整个流程期间锁住，理由与"摇卦"按钮那边一致。
  followUpBtn.disabled = true;
  clearResultBtn.disabled = true;
  // 切到"输出提示词"这条路径，同样把"AI 解读"那边的结果区收起来（不清空 aiResult 文本本身，
  // 只收起复制/追问这两排按钮），避免两条路径的结果区同屏叠着。
  copyRow.style.display = 'none';
  followUpBox.style.display = 'none';

  try{
    const ADOPT_WINDOW_MS = 10 * 60 * 1000;
    if(castStore.legacy && !(castStore.question || '').trim()
       && (Date.now() - (castStore.time || 0)) <= ADOPT_WINDOW_MS){
      castStore.question = question;
    }
    const questionChanged = !!castStore.legacy && !isSameQuestion(question, castStore.question || '');
    let shouldRecast = !castStore.legacy;

    if(castStore.legacy && questionChanged){
      const userSaysNewEvent = await showConfirm(
        `这次问题和上一卦提问的文字不完全一样：\n\n上一卦问的：${castStore.question}\n这次写的：${question}\n\n是同一件事换个说法/继续追问，还是确实换了件不相关的新事？`,
        { title: '是同一件事，还是换新事了？', okText: '换新事了，重摇', cancelText: '同一件事，不重摇' }
      );
      if(userSaysNewEvent){
        shouldRecast = true;
      }else{
        castStore.question = question;
        showToast('沿用上一卦排盘生成提示词');
      }
    }

    if(shouldRecast){

      // 同上（interpretBtn 那边一致）：能走到这一步说明 questionChanged 分支里用户已经确认过
      // "换新事了，重摇"，这里跳过 guardBeforeCast() 里那次会重复的确认框。
      if(!(await guardBeforeCast({ skipCastConfirm: true, background: true }))){
        return;
      }
      aiStatus.textContent = '正在后台起卦…';
      await performBackgroundCast(physicalInput, (done,total)=>{ aiStatus.textContent = `正在后台起卦 · ${done}/${total} 爻`; });
    }

    if (readingSelected()) {
      await startReading(castStore.canonical, 'external');
      aiStatus.textContent = '结构化提示词见下方';
      return;
    }
    clearReading();
    const castText = formatCastDataForAI(castStore.canonical);
    state.lastExportCastText = castText;
    state.lastExportQuestion = question;
    state.lastExportMode = 'legacy';
    state.lastStructuredExportInput = null;
    showPromptOutput(buildExportPromptText(question, castText));
    if (new URLSearchParams(location.search).get('debug') === '1') {
      if (question !== castStore.canonical.question.text) throw new Error('实验导出问题与卦盘不一致');
      showAiExportComparison(buildPairedPromptExports(castStore.canonical), selectedAiInputMode());
      const rulesMode = selectedRulesMode();
      if (rulesMode !== null) showRulesExportComparison(buildRulesPair(castStore.canonical), rulesMode);
    }
    aiStatus.textContent = '提示词已生成';
    showToast('提示词已生成，复制后可以粘贴去其他AI软件解卦', 'success');

    // "输出提示词"这条路径之前不写历史，导致这里生成过的卦在"历史记录"里完全找不到。
    // 这里补一条记录，但只存问题+这一卦的关键排盘信息（跟"AI 解读"共用同一个快照函数），
    // 不把 buildExportPromptText() 拼出来的那一整段人设/规则长文本存进去。
    // 同理单独包一层try/catch：提示词此时已经生成并展示给用户了，写历史失败不该
    // 被外层catch误报成"生成提示词时出错了"，那会让人误以为上面显示的提示词也不作数。
    try{
      appendHistory({
        id: Date.now(),
        ts: Date.now(),
        type: 'prompt',
        question,
        cast: buildHistoryCastSnapshot(castStore.canonical),
        roleLabel: currentRoleLabel(),
        styleLabel: currentReplyStyleLabel(),
        roleCustomText: currentRoleCustomSnapshot(),
        styleCustomText: currentStyleCustomSnapshot(),
      });
      renderStats();
      if(historyPanel.classList.contains('open')) renderHistory();
    }catch(histErr){
      showToast('提示词已生成，但这条没能存进历史记录（' + (histErr.message || '本地存储异常') + '）', 'error', 5000);
    }
  }catch(e){
    showToast(e.message || '生成提示词时出错了，再试一次', 'error', 5000);
  }finally{
    promptBtn.disabled = false;
    interpretBtn.disabled = false;
    castBtn.disabled = false;
    manualCastBtn.disabled = false;
    followUpBtn.disabled = false;
    clearResultBtn.disabled = false;
  }
});

followUpBtn.addEventListener('click', async ()=>{
  const followUpText = followUpInput.value.trim();
  if(!followUpText){
    showToast('先写一下想追问的内容', 'error');
    return;
  }
  if(isLifespanQuestion(followUpText)){
    showToast('传统上卦师不轻断生死寿数，这类问题这里不会生成解读——如果是身体或者情绪上的真实担忧，更建议找医生或者信得过的人聊聊', 'error', 6000);
    return;
  }
  if(!state.currentConversation){
    showToast('还没有可以追问的解读，先点一次"AI 解读"', 'error');
    return;
  }
  if(!loadApiKey()){
    aiSettings.classList.add('open');
    showToast('先在下面"设置"里填一下 DeepSeek API Key', 'error');
    return;
  }

  followUpBtn.disabled = true;
  interpretBtn.disabled = true; // 追问期间也锁住"AI 解读"，避免同时起两个请求把 currentConversation 弄乱
  // "输出提示词"内部会检查 interpretBtn.disabled 来判断能不能执行，锁住 interpretBtn 已经能
  // 功能上挡住它；这里再顺手把它也显式禁用，避免按钮看着能点、点了却只弹出一句
  // "AI 解读正在进行中"（其实是追问在进行中）这种文案对不上的体验。
  promptBtn.disabled = true;
  // 追问期间同样要锁住摇卦入口：这两个按钮之前一直没被追问锁住，用户能在追问的流式请求还没
  // 返回时就点"摇卦"，performCast→renderPlate 里的 resetConversation() 会把 currentConversation
  // 提前置空，等追问请求回来 followUpWithDeepSeek 里再往 currentConversation.messages 写东西时
  // 就是对着 null 操作，直接报错，这次回答也白白问了（token 照样扣，结果却丢了）。
  castBtn.disabled = true;
  manualCastBtn.disabled = true;
  // "清空回复"同理会调 resetConversation()，追问期间也先锁住，等这轮追问完整结束再放开。
  clearResultBtn.disabled = true;
  followUpStatus.textContent = '正在追问…';

  try{
    // 追问的实时预览要接在"已经落定的对话"后面，renderLive/renderThinking内部本来就会先铺settled turns，
    // 但此时followUpWithDeepSeek还没把这轮user文本push进turns，所以这里传的questionText就是followUpText本身。
    const controller = new AbortController();
    state.activeAbortController = controller;
    stopGenBtn.disabled = false;
    showStopBtn();
    const thinking = withThinkingIndicator(followUpText, (delta, fullSoFar)=>{
      renderLive(followUpText, fullSoFar);
    });
    let result;
    try{
      result = await followUpWithDeepSeek(followUpText, thinking.onDelta, controller.signal);
    }finally{
      thinking.stop();
      state.activeAbortController = null;
      hideStopBtn();
    }
    followUpInput.value = '';
    followUpInput.dispatchEvent(new Event('input')); // 同步触发一次，让字数计数器跟着归零
    renderConversation();
    aiMeta.textContent = resultUsageText(result);
    followUpStatus.textContent = result.interrupted ? (result.interruptReason === 'user' ? '已停止' : result.interruptReason === 'limit' ? '达到长度上限' : '网络中断') : '完成';

    // 更新同一条历史会话记录（用首次解读时记住的sessionId去找），把新的这两轮追加进turns里；
    // 找不到就说明历史被清空过，直接放弃写回，不强行拼一条新的。
    // 同上，单独包一层try/catch：追问的回复此时已经拿到并渲染出来、followUpStatus也已经
    // 设成"完成"了，写历史失败不该被外层catch覆盖成报错状态。
    try{
      const updated = updateHistorySession(state.currentHistorySessionId, {
        turns: state.currentConversation.turns.slice(),
        totalTokens: state.currentConversation.cumTokens,
        costYuan: state.currentConversation.cumCost,
        isPeak: result.isPeak,
      });
      if(updated){
        renderStats();
        if(historyPanel.classList.contains('open')) renderHistory();
      }
    }catch(histErr){
      showToast('追问回复已经生成，但这条没能存进历史记录（' + (histErr.message || '本地存储异常') + '）', 'error', 5000);
    }
  }catch(e){
    const msg = e.message || '出错了，再试一次';
    followUpStatus.textContent = msg;
    showToast(msg, 'error', 5000);
  }finally{
    followUpBtn.disabled = false;
    interpretBtn.disabled = false;
    castBtn.disabled = false;
    manualCastBtn.disabled = false;
    clearResultBtn.disabled = false;
    promptBtn.disabled = false;
  }
});
}
