import { turnHtml, renderConversation, renderThinking, withThinkingIndicator, renderLive, hidePromptExportBoxes, showStopBtn, hideStopBtn, showPromptOutput } from './ui/ai-view.js';
import { updateApiKeyStatus, refreshPriceOverridePlaceholders, fillPriceOverrideInputs, lockApiKeyInput, unlockApiKeyInput } from './ui/settings.js';
import { showToast, getFocusableIn, trapTabKey, showConfirm, ONBOARD_KEY, updateOnboardFade, onOnboardKeydown, onOnboardOverlayClick, openOnboard, closeOnboard } from './ui/dialogs.js';
import { spiritDotHtml, boldDateHtml, boldPillarsHtml, replayFadeIn, maskApiKey, bindCharCounter, formatTime, escapeHtml, copyTextToClipboard } from './ui/helpers.js';
import { svg, dayGanzhiSelect, dayLookupDateInput, castBtn, plateWrap, coinLog, castModeToggle, systemCastPanel, manualCastPanel, manualLinesWrap, manualCastBtn, toastWrap, confirmOverlay, confirmTitle, confirmMsg, confirmOkBtn, confirmCancelBtn, onboardOverlay, onboardCloseBtn, helpFab, onboardScroll, onboardFade, questionInput, questionCharCounter, interpretBtn, aiStatus, aiResult, aiMeta, aiStats, copyRow, copyResultBtn, copyAllBtn, clearResultBtn, promptBtn, promptOutputBox, promptOutputText, copyPromptBtn, closePromptBtn, promptExtraTools, promptExtraToggle, cleanupInputText, cleanupOutputText, cleanupRunBtn, cleanupCopyRow, copyCleanupBtn, followUpExportInput, followUpExportOutput, followUpExportBtn, followUpExportCopyRow, copyFollowUpExportBtn, followUpBox, followUpInput, followUpCharCounter, followUpBtn, followUpStatus, stopGenBtn, toggleSettingsBtn, aiSettings, apiKeyInput, apiKeyStatus, saveKeyBtn, clearKeyBtn, styleSelect, customStyleWrap, customStyleInput, roleSelect, roleHint, customRoleWrap, customRoleInput, effortSelect, modelSelect, priceHit, priceMiss, priceOutput, savePriceOverrideBtn, resetPriceOverrideBtn, gotoAiTabBtn, toggleHistoryBtn, historyPanel, historyList, historyEmpty, historyCount, clearHistoryBtn } from './ui/dom.js';
import { interpretWithDeepSeek, followUpWithDeepSeek } from './ai/interpreter.js';
import { pillarsAndKongText, formatCastDataForAI } from './ai/formatter.js';
import { callDeepSeekRaw, resultUsageText, buildInterruptedResult } from './ai/client.js';
import { buildSystemPrompt, buildExportPromptText, buildExportFollowUpPromptText } from './ai/prompt-builder.js';
import { annotateShichen, annotateGanzhiDay, buildShichenRuleText, buildGanzhiDayRuleText, stripMarkdown } from './ai/text.js';
import { currentRoleInfo, currentOneShotExample, currentRoleLabel, currentRoleCustomSnapshot, effectivePriceTable, isBeijingPeakHour, currentEffortPreset, currentReplyStyle, currentReplyStyleLabel, currentStyleCustomSnapshot } from './ai/preferences.js';
import { LS_KEY_CAST_LOG, CAST_COOLDOWN_WINDOW_MS, CAST_COOLDOWN_MAX, loadCastLog, pruneCastLog, notifyQuota, configureQuotaNotifications, logCastEvent, castsRemainingInWindow } from './storage/cast-log.js';
import { LS_KEY_ACTIVE_CONVO, saveActiveConversation, loadActiveConversationFromStorage, clearActiveConversationStorage } from './storage/conversation.js';
import { LS_KEY_HISTORY, HISTORY_MAX, loadHistory, saveHistory, appendHistory, LS_KEY_LIFETIME_STATS, loadLifetimeStats, addLifetimeUsage, clearLifetimeStats, historyTurnsOf, buildHistoryCastSnapshot } from './storage/history.js';
import { LS_KEY_ROLE, LS_KEY_CUSTOM_ROLE, loadRoleChoice, saveRoleChoice, loadCustomRole, saveCustomRole, LS_KEY_MODEL, loadModelChoice, saveModelChoice, LS_KEY_PRICE_OVERRIDE, loadPriceOverride, savePriceOverride, clearPriceOverride, LS_KEY_API, LS_KEY_STYLE, LS_KEY_CUSTOM_STYLE, LS_KEY_EFFORT, loadApiKey, saveApiKey, clearApiKey, loadStyleChoice, saveStyleChoice, loadCustomStyle, saveCustomStyle, loadEffortChoice, saveEffortChoice } from './storage/settings.js';
import { notifyStorage, configureStorageNotifications, safeGetItem, safeSetItem, safeRemoveItem } from './storage/local.js';
import { state } from './app/state.js';
import { ROLE_PRESETS, ROLE_ONE_SHOT_EXAMPLES, ROLE_LABELS, ROLE_HINTS, REPLY_STYLE_PRESETS, EFFORT_PRESETS, SAFETY_BASELINE, DEEPSEEK_BASE_URL, PRICE_TABLES, REPLY_STYLE_LABELS, SHICHEN_HOUR_MAP, JIAZI60_LABELS_REGEX, EXPORT_SEARCH_HINT } from './ai/config.js';
import { calculateCast } from './core/casting.js';
import { createCoinWorld, advanceCoinWorld, lineFromSum } from './core/physics.js';
import { getTodayJiaziIndex, findNextDateForGanzhiIndex, julianDay, sunApparentLongitude, getSolarMonthBranch, getYearPillar, getMonthPillar, hourBranchOf, getHourPillar, buildYearMonthHourPillars, formatGregorianText, lunarDayCn, getLunarDateText, buildDateDisplayText } from './core/ganzhi.js';
import { sixRelative, computeJinTuiShen, getYuelingState, getDayRelation, getHuitouRelation, getShiYingRelation, getFeishenFushenRelation } from './core/relations.js';
import { BAGUA, WX, SHENG, KE, NAJIA, BRANCH_EL, SIX_SPIRITS, SPIRIT_CLASS, TRIGRAM_BY_KEY, PALACE_SEEDS, STEP_TYPES, STEP_WORLD, GUA_NAME_TABLE, EIGHT_PALACE_MAP, b2s, JIN_SHEN_PAIRS, TUI_SHEN_PAIRS, SEASON_BY_BRANCH, YUELING_TABLE, LIUHE_PAIR, LIUCHONG_PAIR, STEMS, STEM_SPIRIT_GROUP, BRANCHES12, KONG_PAIRS, JIAZI60, JIAZI60_INDEX_BY_LABEL, JIE_BRANCHES_FROM_LICHUN } from './core/constants.js';

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
document.querySelectorAll('section.block-collapse').forEach(sec=>{
  const h2 = sec.querySelector('h2');
  const hint = document.createElement('span');
  hint.className = 'collapse-hint';
  h2.appendChild(hint);
  h2.addEventListener('click', ()=> sec.classList.toggle('open'));
});
document.querySelectorAll('.settings-group.collapsible').forEach(group=>{
  const title = group.querySelector('.settings-group-title');
  title.addEventListener('click', ()=> group.classList.toggle('open'));
});

/* ---------------- tabs ----------------
   role="tablist"/"tab"/"tabpanel" 用的是标准 ARIA tabs 模式：每次切换要同步
   aria-selected（哪个tab被选中）和"roving tabindex"（tabindex在tab之间挪动，
   同一时刻只有当前激活的tab能被Tab键聚焦到，符合键盘用户对"标签页"控件的
   标准预期——Tab键只在tablist和当前面板之间跳两下，不会挨个把4个tab都走一遍）。
   鼠标点击的视觉效果和之前完全一样，这里只是把底层语义和键盘可达性补上。
   ---------------- */
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
// 供 AI 面板顶部状态条使用：有 window.lastCastData 就显示"当前排盘：卦名 · 日柱"，
// 没有（还没摇过卦，或者数据被清空）就隐藏整条，不占位置。挂在 window 上是因为
// 摇卦/复原历史卦等多处写 window.lastCastData 的代码分散在文件后面，
// 那几处会直接调用 window.updateCurrentCastStatus() 同步这条状态。
window.updateCurrentCastStatus = function(){
  const box = document.getElementById('currentCastStatus');
  if(!box) return;
  const d = window.lastCastData;
  if(d && d.guaName){
    const bianText = d.bianGuaName && d.bianGuaName !== d.guaName ? `（变 ${d.bianGuaName}）` : '';
    box.innerHTML = `当前排盘：<b>${d.guaName}</b>${bianText} · ${d.ganzhi || ''}日`;
    box.style.display = 'block';
  } else {
    box.style.display = 'none';
  }
};
function switchTab(tabName){
  tabButtons.forEach(b=>{
    const active = b.dataset.tab === tabName;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
    b.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.id === tabName));
  if(tabName === 'ai') window.updateCurrentCastStatus();
}
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
const cx=140, cy=140, R=95;
const pos = {};
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
function arcPath(a,b,cx,cy,bend,shrink){
  shrink = shrink||0.85;
  const ax = cx+(a.x-cx)*shrink, ay = cy+(a.y-cy)*shrink;
  const bx = cx+(b.x-cx)*shrink, by = cy+(b.y-cy)*shrink;
  const mx=(ax+bx)/2, my=(ay+by)/2;
  const dx=bx-ax, dy=by-ay, len=Math.hypot(dx,dy)||1;
  const nx=-dy/len, ny=dx/len;
  const ctrlx = mx+nx*bend, ctrly = my+ny*bend;
  return `M${ax},${ay} Q${ctrlx},${ctrly} ${bx},${by}`;
}
WX.forEach(w=>{
  const p=pos[w];
  state.svgHtml += `<g class="wx-node" data-el="${w}" tabindex="0" role="button" aria-label="查看${w}的生克关系" transform="translate(${p.x},${p.y})">
    <circle r="22"/><text x="0" y="6" text-anchor="middle">${w}</text></g>`;
});
svg.insertAdjacentHTML('beforeend', state.svgHtml);
function activateWxNode(node){
  const el = node.dataset.el;
  document.querySelectorAll('.wx-node').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.wx-arrow').forEach(a=>a.classList.remove('hl'));
  node.classList.add('active');
  document.querySelectorAll(`.wx-arrow[data-from="${el}"]`).forEach(a=>a.classList.add('hl'));
  document.querySelectorAll(`.wx-arrow[data-to="${el}"]`).forEach(a=>a.classList.add('hl'));
  const genTo = SHENG[el], genBy = Object.keys(SHENG).find(k=>SHENG[k]===el);
  const keTo = KE[el], keBy = Object.keys(KE).find(k=>KE[k]===el);
  document.getElementById('wxInfo').innerHTML =
    `<b>${el}</b> 生 ${genTo}　·　${genBy} 生 <b>${el}</b><br>
     <b>${el}</b> 克 ${keTo}　·　${keBy} 克 <b>${el}</b>`;
}
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
// Browser local civil time; day changes at 00:00. No true-solar-time correction.
function resolveCastCalendar(){
  const now=state.knownCastDate ? new Date(state.knownCastDate) : new Date();
  if(state.daySelectionMode==='auto')dayGanzhiSelect.value=String(getTodayJiaziIndex(now));
  const day=JIAZI60[Number(dayGanzhiSelect.value)];
  if(state.daySelectionMode==='manual')return {now,day,ymh:{yearLabel:'未指定',monthLabel:'未指定',hourLabel:'未指定'},dateText:'公历日期未指定（仅录入日柱）'};
  const ymh=buildYearMonthHourPillars(day.stem,now);
  if(state.knownCastDate&&!document.getElementById('dayLookupTime').value){
    ymh.hourLabel='未指定';
    const end=new Date(now);end.setHours(23,59,59,999);
    const last=buildYearMonthHourPillars(day.stem,end);
    if(last.yearLabel!==ymh.yearLabel)ymh.yearLabel='交节日待定';
    if(last.monthLabel!==ymh.monthLabel)ymh.monthLabel='交节日待定';
  }
  return {now,day,ymh,dateText:buildDateDisplayText(now)};
}

// ---- 卦象爻画图：把六爻的阴阳/动爻/世应画成"从下往上六道爻线"的直观图形，本卦一列，
// 若有动爻则右边并排再画一列变卦（动爻翻转阴阳后的新卦），中间一个箭头表示"变"——
// 比排盘表格里逐行去看"状态"和"变出"两列更直观，一眼能看出整卦长什么样、变在哪一爻。
// 起卦当下的实时排盘（renderPlate/renderPlateFromCastData）和历史记录回看（historyCastHtml）
// 三处共用同一份拼图逻辑，各自只需把六爻数据先整理成下面这个统一的入参形状。
// diagramLines：长度为6的数组，下标0=初爻(1爻)…下标5=上爻(6爻)，每项 {yang, moving, isWorld, isResponse}
function buildGuaDiagramHtml(diagramLines, guaName, bianGuaName){
  if(!Array.isArray(diagramLines) || diagramLines.length !== 6) return '';
  const hasMoving = diagramLines.some(l => l.moving);
  const renderCol = (arr, label, name) => {
    const rows = arr.slice().reverse().map(l => { // 6爻画最上、1爻画最下，跟传统卦画自下而上的顺序对应
      const bar = l.yang
        ? `<span class="gd-bar-full"></span>`
        : `<span class="gd-bar-half gd-bar-left"></span><span class="gd-bar-half gd-bar-right"></span>`;
      const mark = l.moving ? (l.yang ? '○' : '✕') : '';
      const tag = (l.isWorld ? '世' : '') + (l.isResponse ? '应' : '');
      return `<div class="gd-line${l.moving ? ' moving' : ''}">
        <span class="gd-bar">${bar}</span><span class="gd-mark">${mark}</span><span class="gd-tag">${tag}</span>
      </div>`;
    }).join('');
    const nameHtml = name ? `：<b>${escapeHtml(name)}</b>` : '';
    return `<div class="gua-diagram-col">
      <div class="gua-diagram-label">${label}${nameHtml}</div>
      <div class="gua-diagram-lines">${rows}</div>
    </div>`;
  };
  const benCol = renderCol(diagramLines, '本卦', guaName);
  if(!hasMoving) return `<div class="gua-diagram">${benCol}</div>`;
  const bianArr = diagramLines.map(l => ({ yang: l.moving ? !l.yang : l.yang, moving:false, isWorld:false, isResponse:false }));
  const bianCol = renderCol(bianArr, '变卦', bianGuaName);
  return `<div class="gua-diagram">${benCol}<div class="gua-diagram-arrow">→</div>${bianCol}</div>`;
}
// 把 renderPlate() 里的 structuredLines / 历史快照里的 cast.lines（字段都是"是否动爻/是否世爻/是否应爻/状态"
// 这套中文键名）统一换算成 buildGuaDiagramHtml 要的 {yang,moving,isWorld,isResponse} 形状，三处共用一份换算逻辑。
function structLineToDiagram(ln){
  return {
    yang: typeof ln.状态 === 'string' && (ln.状态.startsWith('少阳') || ln.状态.startsWith('老阳')),
    moving: !!ln.是否动爻,
    isWorld: !!ln.是否世爻,
    isResponse: !!ln.是否应爻,
  };
}

// ---- 排盘结果顶部的极简图例：解释"卦画/纳甲/状态/变出"这几列里为什么会有一整行
// 变成朱砂色（动爻所在行——卦画的爻线、纳甲干支、变出内容都会一起变红）。第一次看的人
// 不一定能马上反应过来这个颜色和上面五行轮盘里的"朱砂=当前选中"是不是一回事、具体代表
// 什么，而五行生克那个板块反而专门做了图例卡片，唯独这里没有。<table>版和.plate-cards
// 移动端卡片版共用同一份图例，插在两种布局最上面，不用为每种布局各写一遍。 ----
const PLATE_LEGEND_HTML = '<div class="plate-legend"><span class="plate-legend-swatch"></span>红色 = 动爻（老阳/老阴，这一爻会变，对照"变出"看它变成了什么）</div>';

// ---- 排盘表格的"移动端卡片"版本：renderPlate() / renderPlateFromCastData() 共用，
// 配合CSS里 .plate-cards 的媒体查询，专门解决窄屏下8列<table>被压缩到每列没几像素、
// 中文逐字换行变成单字竖排的问题（详见CSS里 .plate-cards 上面那条注释）。
// 做法直接照抄本文件"历史记录"展开态里逐爻摘要（.history-line-row）已经验证过的写法：
// 一爻一张卡片，卡片内部用grid横排"爻位/六亲六神/纳甲五行状态+标记"，宽度不够时
// 整段文字自然换行到下一行，而不会被塞进一个死宽的表格列里逐字拆开；伏神、变出这两项
// 内容较长、只有部分爻才有，改成卡片下方单独一行小字，不再挤进同一个网格列里。
// lines：结构化爻数据数组，顺序为初爻(1爻)→上爻(6爻)——renderPlate()里
// structuredLines.reverse()之后的顺序，或者castData.lines存下来的顺序，两处一致。
function buildPlateCardsHtml(lines){
  if(!Array.isArray(lines)) return '';
  return lines.slice().reverse().map(ln => { // 6爻卡片在上、1爻在下，跟<table>的显示顺序保持一致
    let tag = '';
    if(ln.是否世爻) tag += '世';
    if(ln.是否应爻) tag += '应';
    if(ln.是否动爻) tag += '动';
    if(ln.是否空亡) tag += '空';
    const tagHtml = tag ? `<span class="plate-card-tag">${tag}</span>` : '';
    const fushenHtml = ln.伏神六亲
      ? `<div class="plate-card-extra">伏神：${ln.伏神六亲} ${ln.伏神纳甲}(${ln.伏神五行})${ln.伏神与飞神关系 ? '　'+ln.伏神与飞神关系 : ''}</div>` : '';
    const bianHtml = (ln.是否动爻 && ln.变纳甲)
      ? `<div class="plate-card-extra">变出：${ln.变纳甲}(${ln.变五行})${ln.变六亲}${ln.进退神 ? '　'+ln.进退神 : ''}${ln.回头 ? '　'+ln.回头 : ''}</div>` : '';
    // 月令/日辰关系：老数据（这次更新前保存的历史记录/未刷新完的会话）没有这两个字段，
    // 都是空字符串，下面两个变量就是空的，不会多出一行"undefined"。
    const yuelingDayHtml = (ln.月令 || ln.日辰关系)
      ? `<div class="plate-card-extra">${ln.月令 ? '月令：'+ln.月令 : ''}${(ln.月令 && ln.日辰关系) ? '　' : ''}${ln.日辰关系 || ''}</div>` : '';
    return `<div class="plate-card${ln.是否动爻 ? ' moving' : ''}">
      <div class="plate-card-row">
        <span class="plate-card-pos">${ln.爻位}</span>
        <span>${ln.六亲}·${spiritDotHtml(ln.六神)}${ln.六神}</span>
        <span>${ln.纳甲}${ln.五行}·${ln.状态}${tagHtml}</span>
      </div>
      ${yuelingDayHtml}${fushenHtml}${bianHtml}
    </div>`;
  }).join('');
}

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
// 常驻显示"10分钟窗口内还能摇几次"，不用等点击被拦下才知道有这个限制。
// 用 getElementById 现查而不是顶层 const，是因为这个函数在DOM元素定义之前就已经声明，
// 调用时（页面初始化/每次摇卦后）DOM早就ready了，没有先后顺序问题。
function renderCastQuota(){
  const el = document.getElementById('castQuotaHint');
  if(!el) return;
  const remaining = castsRemainingInWindow();
  el.textContent = remaining > 0
    ? `本窗口（10 分钟）内还可摇 ${remaining} 次`
    : `已达上限：10 分钟内最多摇 3 次，稍等窗口过去再摇`;
  el.classList.toggle('cast-quota-warn', remaining <= 0);
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
  if(window.lastCastData){
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
    // （currentConversation 等），没碰 window.lastCastData / lastCastQuestion，
    // 导致用户就算把问题框里的字删光，这两个变量依然停在"上一卦"的值上，一摇卦立刻又撞上
    // 同一条拦截逻辑——不清掉这两个变量，这条老毛病换个壳还会再犯一次。
    if(state.castMode === 'manual' && !background) window.lastCastData = null;
    if(state.castMode === 'manual' && !background) window.lastCastQuestion = '';
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
function commitPhysicsCast(lines){
  renderPlate(lines,'physics');logCastEvent();
  coinLog.textContent=lines.map((l,i)=>`${['初','二','三','四','五','上'][i]}爻 ${l.coins.join('')} · ${l.sum}`).join(' ｜ ');
  return window.lastCastData;
}

// The initiating click's coordinates and timestamp supply initial conditions;
// no random result is selected. Simulation yields between fixed-step batches.
function castInputFromEvent(event){
  const t=(event?.timeStamp ?? performance.now())/1000;
  return {duration:t%10,distance:Math.hypot(event?.clientX||0,event?.clientY||0)%450,
    vx:((event?.clientX||0)%600)-300,vy:((event?.clientY||0)%600)-300};
}
async function performBackgroundCast(input, onProgress){
  const lines=[];
  for(let round=0;round<6;round++){
    onProgress?.(round,6);
    let line=null;
    for(let attempt=0;attempt<4&&!line;attempt++){
      const sim=createCoinWorld({...input,duration:input.duration+attempt*.413},round);
      let result=null;
      while(!result){
        for(let i=0;i<240&&!result;i++) result=advanceCoinWorld(sim);
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      line=result.line||null;
    }
    if(!line) throw new Error('铜钱未能稳定落下，本次未扣次数，请重新点击起卦');
    lines.push(line);
  }
  onProgress?.(6,6);
  return commitPhysicsCast(lines);
}

function physicsCoinSvg(id){
  // Vector relief and patina; reverse is a decorative seal design, not a tracing.
  const ring='M28 0a28 28 0 1 0-56 0a28 28 0 1 0 56 0M-6-6h12v12h-12z';
  const speckles=Array.from({length:62},(_,i)=>{const a=i*2.399963,r=9+(i*7.13)%16.7;return `<circle cx="${(Math.cos(a)*r).toFixed(2)}" cy="${(Math.sin(a)*r).toFixed(2)}" r="${(.12+(i%4)*.09).toFixed(2)}" fill="${i%3?'#443d24':'#54715a'}" opacity="${.13+(i%4)*.05}"/>`;}).join('');
  const lettering='<text y="-10">乾</text><text y="20">隆</text><text x="15.5" y="4">通</text><text x="-15.5" y="4">寶</text>';
  const reverse='<path d="M-14-18c-5 2-5 6-1 7 5 1 5-5 2-6m-1 5v24c0 4-3 6-6 7m6-22c-8-4-9 4-3 5l3-1m0 4c-8-2-8 5-2 5m2 1 5 3m-5 1-4 4M14-18c5 1 6 5 2 7-5 2-7-3-3-6m1 5v27c0 3-3 5-5 4m5-25c7-4 9 3 4 5l-4-1m0 4c7-2 9 5 3 6l-3-1m0 5 5 2"/>';
  return `<g class="physics-coin" data-coin="${id}"><title>字面记二，背面记三</title><defs><linearGradient id="coin-metal-${id}" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#f2dfa9"/><stop offset=".2" stop-color="#c6a15d"/><stop offset=".48" stop-color="#a48248"/><stop offset=".73" stop-color="#d9ba76"/><stop offset="1" stop-color="#8b6939"/></linearGradient><linearGradient id="coin-rim-${id}" x2=".7" y2="1"><stop stop-color="#ffedb7"/><stop offset=".4" stop-color="#d6bb80"/><stop offset="1" stop-color="#765028"/></linearGradient></defs>
  <g class="coin-edge"><path d="${ring}" fill="#624626" fill-rule="evenodd" stroke="#b28e50" stroke-width="1.2"/><path d="M-25 12A28 28 0 0 0 25 12" fill="none" stroke="#d0ad64" stroke-width=".8"/></g>
  <g class="coin-face"><path d="${ring}" fill="url(#coin-metal-${id})" fill-rule="evenodd" stroke="#785a30" stroke-width=".8"/>
  <circle r="26.5" fill="none" stroke="url(#coin-rim-${id})" stroke-width="2.2"/><circle r="24.9" fill="none" stroke="#6c502d" stroke-width=".65"/><circle r="24.1" fill="none" stroke="#f3d79a" stroke-opacity=".45" stroke-width=".6"/>
  ${speckles}<path d="M-21-12q5-8 12-10M11 22l4-2M-22 9l2 3M19-15l2 3" fill="none" stroke="#eed398" stroke-width=".5" opacity=".45"/>
  <path d="M-7.3-7.3h14.6v14.6h-14.6z" fill="none" stroke="#f0d69a" stroke-width="1.6"/><path d="M-6-6h12v12h-12z" fill="none" stroke="#614622" stroke-width="1.2"/>
  <g class="coin-inscription" font-family="KaiTi,STKaiti,'Noto Serif SC',serif" font-size="10.7" font-weight="700" text-anchor="middle"><g fill="#f8e2a9" transform="translate(.45 .7)">${lettering}</g><g fill="#715027" stroke="#543c21" stroke-width=".18">${lettering}</g></g>
  <g class="coin-reverse" style="display:none" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#f3d99c" stroke-width="1.8" transform="translate(.4 .65)">${reverse}</g><g stroke="#684921" stroke-width="1.5">${reverse}</g><circle cy="-16" r="1.3" fill="#78592e" stroke="none"/><circle cy="16" r="1.3" fill="#78592e" stroke="none"/></g></g></g>`;
}

function performCast(){
  return new Promise((resolve,reject)=>{
    const labels=['初爻','二爻','三爻','四爻','五爻','上爻'];
    const auto=document.getElementById('castPace').value==='all';
    const dialog=document.createElement('dialog');dialog.className='physics-dialog';
    dialog.setAttribute('aria-labelledby','physics-title');dialog.setAttribute('aria-describedby','physics-description');
    dialog.innerHTML=`<header class="physics-header"><div class="physics-heading"><span class="physics-seal" aria-hidden="true">六<br>爻</span><div><div class="physics-eyebrow">以钱为媒 · 静心起卦</div><h3 id="physics-title">一念起，六爻成</h3></div></div><button type="button" class="physics-close" aria-label="关闭摇卦窗口"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <div class="physics-body"><section class="physics-table"><div class="physics-table-top"><span><i></i> 三钱起卦</span><span>${auto?'连续六爻':'逐爻投掷'}</span></div>
    <svg class="physics-scene" viewBox="0 0 600 400" role="img" aria-label="铜钱投掷桌面，可拖动蓄势">
    <defs><radialGradient id="table-glow"><stop stop-color="#3b3222"/><stop offset="1" stop-color="#1b1914"/></radialGradient><linearGradient id="coin-gold" x2="1" y2="1"><stop stop-color="#f1d99c"/><stop offset=".46" stop-color="#c5a360"/><stop offset="1" stop-color="#92703c"/></linearGradient><radialGradient id="coin-shadow"><stop stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <rect width="600" height="400" fill="url(#table-glow)"/>
    <g class="physics-engraving" transform="translate(300 222) scale(1 .62)" fill="none" stroke="#b8944f"><circle r="219" opacity=".16"/><circle r="210" opacity=".2"/><circle r="166" opacity=".1"/><path d="M0-200v12M0 200v-12M-200 0h12M200 0h-12" opacity=".45"/><g opacity=".26">${Array.from({length:8},(_,i)=>`<g transform="rotate(${i*45}) translate(0 -183)"><path d="M-15 0h30M-15 5h${i%2?11:30}${i%2?'m8 0h11':''}M-15 10h${i%3?11:30}${i%3?'m8 0h11':''}" stroke-width="2"/></g>`).join('')}</g></g>
    <g class="physics-shadows">${[0,1,2].map(i=>`<ellipse data-shadow="${i}" cx="${220+i*80}" cy="250" rx="34" ry="12" fill="url(#coin-shadow)"/>`).join('')}</g><g class="physics-coins">${[0,1,2].map(physicsCoinSvg).join('')}</g>
    <g class="physics-drag-hint" fill="none" stroke="#b8944f" opacity=".5"><path d="M262 334h76m-69-5-7 5 7 5m62-10 7 5-7 5"/></g></svg>
    <div class="physics-table-caption"><span class="physics-stage-caption">轻摇铜钱，静候落定</span><span class="physics-gesture-meter" aria-hidden="true"><i></i></span></div></section>
    <aside class="physics-record"><div class="physics-record-title"><h4>六爻成象</h4><span class="physics-count">00 <small>/ 06</small></span></div><p class="physics-record-hint">自下而上，依次成爻</p><ol class="physics-results" aria-label="六爻投掷结果">${labels.map((name,i)=>`<li data-line="${i}" class="${i===0?'is-current':''}"><span class="physics-line-number">${name}</span><span class="physics-line-glyph"><i></i><i></i></span><span class="physics-line-name">${i===0?'待投':'—'}</span></li>`).reverse().join('')}</ol><div class="physics-record-foot"><span class="physics-moving-dot"></span>朱砂标记动爻</div></aside></div>
    <footer class="physics-footer"><div class="physics-guidance"><strong class="physics-status" role="status" aria-live="polite">${auto?'一掷启程，六爻依次落定':'从初爻开始'}</strong><p id="physics-description">在桌面拖动蓄势，或直接点击投掷。</p></div><button type="button" class="physics-throw"><span>${auto?'开始连续投掷':'投掷初爻'}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button></footer><div class="physics-bottom-note">三枚铜钱 · 六次成卦 <span>字面二 · 背面三</span></div>`;
    document.body.appendChild(dialog);
    const scene=dialog.querySelector('.physics-scene'),status=dialog.querySelector('.physics-status'),launch=dialog.querySelector('.physics-throw');
    const count=dialog.querySelector('.physics-count'),caption=dialog.querySelector('.physics-stage-caption'),meter=dialog.querySelector('.physics-gesture-meter i');
    const coinNodes=[...dialog.querySelectorAll('.physics-coin')],shadows=[...dialog.querySelectorAll('[data-shadow]')];
    const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow;
    let lines=[],sim=null,frame=0,nextTimer=0,running=false,closed=false,complete=false,previousTime=0,accumulator=0;
    let input={vx:0,vy:0,distance:0,duration:0},pointer=null,pressStart=0;
    function cleanup(){if(closed)return;closed=true;cancelAnimationFrame(frame);clearTimeout(nextTimer);dialog.close();dialog.remove();document.body.style.overflow=previousOverflow;previousFocus?.focus({preventScroll:true});}
    function cancel(){cleanup();if(!complete)reject(new Error('已取消本卦，未扣除摇卦次数'));}
    dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});dialog.querySelector('.physics-close').onclick=cancel;
    function project(p){return {x:300+p.x*53+p.y*13,y:220+p.y*31-p.z*49};}
    function draw(){
      coinNodes.forEach((node,i)=>{
        if(!sim){node.querySelector('.coin-edge').setAttribute('transform',`translate(${220+i*80} 222) scale(1 .72)`);node.querySelector('.coin-face').setAttribute('transform',`translate(${220+i*80} 218) scale(1 .72)`);return;}
        const b=sim.bodies[i],q=b.quaternion,center=project(b.position),u=project(b.position.vadd(q.vmult(new CANNON.Vec3(.5/28,0,0)))),v=project(b.position.vadd(q.vmult(new CANNON.Vec3(0,.5/28,0))));
        const matrix=(offset)=>`matrix(${u.x-center.x} ${u.y-center.y} ${v.x-center.x} ${v.y-center.y} ${center.x} ${center.y+offset})`;
        node.querySelector('.coin-edge').setAttribute('transform',matrix(3));node.querySelector('.coin-face').setAttribute('transform',matrix(0));
        const normal=q.vmult(new CANNON.Vec3(0,0,1));
        const front=(-637*normal.x+2597*normal.y+1643*normal.z)>0;
        // Flip the back's local x axis so its relief is not mirror-written.
        if(!front){const backMatrix=(offset)=>`matrix(${center.x-u.x} ${center.y-u.y} ${v.x-center.x} ${v.y-center.y} ${center.x} ${center.y+offset})`;node.querySelector('.coin-face').setAttribute('transform',backMatrix(0));}
        node.querySelector('.coin-inscription').style.display=front?'':'none';node.querySelector('.coin-reverse').style.display=front?'none':'';
        const floor=project({x:b.position.x,y:b.position.y,z:0});shadows[i].setAttribute('cx',floor.x);shadows[i].setAttribute('cy',floor.y+5);shadows[i].setAttribute('opacity',Math.max(.2,1-b.position.z*.15));
      });
      if(sim)[0,1,2].sort((a,b)=>{const depth=b=>b.position.z-b.position.y*.6;return depth(sim.bodies[a])-depth(sim.bodies[b]);}).forEach(i=>coinNodes[i].parentNode.appendChild(coinNodes[i]));
    }
    function record(line){
      const index=lines.length-1,row=dialog.querySelector(`[data-line="${index}"]`);
      row.className='is-done'+(line.moving?' is-moving':'')+(line.yang?' is-yang':'');
      row.querySelector('.physics-line-name').textContent={6:'老阴',7:'少阳',8:'少阴',9:'老阳'}[line.sum];
      row.title=line.coins.join(' · ')+`，合计 ${line.sum}`;
      if(lines.length<6){const next=dialog.querySelector(`[data-line="${lines.length}"]`);next.classList.add('is-current');next.querySelector('.physics-line-name').textContent='待投';}
      count.innerHTML=`${String(lines.length).padStart(2,'0')} <small>/ 06</small>`;
    }
    scene.onpointerdown=e=>{if(running||complete)return;scene.setPointerCapture(e.pointerId);pointer={x:e.clientX,y:e.clientY,t:e.timeStamp};input.distance=0;scene.classList.add('is-dragging');};
    scene.onpointermove=e=>{if(!pointer||running)return;const dt=Math.max(1,e.timeStamp-pointer.t),scale=600/scene.getBoundingClientRect().width,dx=(e.clientX-pointer.x)*scale,dy=(e.clientY-pointer.y)*scale;input.vx=Math.max(-800,Math.min(800,dx/dt*1000));input.vy=Math.max(-800,Math.min(800,dy/dt*1000));input.distance=Math.min(2000,input.distance+Math.hypot(dx,dy));pointer={x:e.clientX,y:e.clientY,t:e.timeStamp};meter.style.width=Math.min(100,input.distance/4)+'%';caption.textContent='势已起 · 松手后投掷';if(!sim)coinNodes.forEach((n,i)=>{n.setAttribute('transform',`translate(${Math.sin(input.distance*.025+i)*6} ${Math.cos(input.distance*.02+i)*4})`);});};
    scene.onpointerup=scene.onpointercancel=()=>{pointer=null;scene.classList.remove('is-dragging');};
    launch.onpointerdown=()=>{pressStart=performance.now();};launch.onkeydown=e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat)pressStart=performance.now();};
    function begin(){
      if(closed||running||complete)return;
      try{sim=createCoinWorld(input,lines.length);accumulator=0;previousTime=0;running=true;launch.disabled=true;dialog.classList.add('is-rolling');coinNodes.forEach(n=>n.removeAttribute('transform'));status.textContent=`${labels[lines.length]} · 静候铜钱落定`;caption.textContent='铜钱翻转，卦象渐成';launch.querySelector('span').textContent='铜钱落定中';frame=requestAnimationFrame(tick);}catch(e){cleanup();reject(e);}
    }
    function retry(){running=false;dialog.classList.remove('is-rolling');status.textContent='铜钱未平稳落定';caption.textContent='已成之爻保留，本爻请再投一次';launch.disabled=false;launch.querySelector('span').textContent='重投'+labels[lines.length];}
    function tick(time){
      if(closed)return;
      try{
        accumulator+=previousTime?Math.min(.05,(time-previousTime)/1000):1/60;previousTime=time;
        while(accumulator>=1/120&&running){
          const result=advanceCoinWorld(sim);accumulator-=1/120;
          if(result?.line){
            lines.push(result.line);running=false;record(result.line);dialog.classList.remove('is-rolling');draw();
            if(lines.length===6){
              const data=commitPhysicsCast(lines);complete=true;status.textContent='六爻已成，卦象已定';caption.textContent='一念有始，六爻有应';dialog.querySelector('#physics-description').textContent='查看本卦的纳甲、世应与动爻。';launch.disabled=false;launch.querySelector('span').textContent='查看排盘';dialog.classList.add('is-complete');launch.focus({preventScroll:true});resolve(data);return;
            }
            status.textContent=`${labels[lines.length-1]}已成 · ${auto?'即将投掷':'下一爻为'}${labels[lines.length]}`;caption.textContent='铜钱已落定';launch.disabled=false;launch.querySelector('span').textContent='投掷'+labels[lines.length];
            if(auto){launch.disabled=true;nextTimer=setTimeout(begin,550);return;}
          }else if(result?.retry)retry();
        }
        draw();if(running)frame=requestAnimationFrame(tick);
      }catch(e){cleanup();reject(e);}
    }
    launch.onclick=(event)=>{if(complete){cleanup();return;}input.duration=Math.min(10,Math.max(.001,(performance.now()-(pressStart||performance.now()))/1000));input.phase=(event.timeStamp/1000)%(Math.PI*2);pressStart=0;begin();};
    document.body.style.overflow='hidden';dialog.showModal();draw();launch.focus({preventScroll:true});
  });
}


castBtn.addEventListener('click', async ()=>{
  if(!(await guardBeforeCast())) return;
  // 物理投掷完成六爻后才调用 renderPlate；期间锁定其他起卦和解读入口。
  // 这期间 window.lastCastData/lastCastQuestion 还停在"上一卦"。这段时间如果去点"AI解读"
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

 // 'system' | 'manual'

const MANUAL_LINE_LABELS = ['初爻','二爻','三爻','四爻','五爻','上爻'];
const MANUAL_LINE_OPTIONS = [
  { value: '7', label: '少阳（阳，不变）' },
  { value: '8', label: '少阴（阴，不变）' },
  { value: '9', label: '老阳（阳，动 ○）' },
  { value: '6', label: '老阴（阴，动 ✕）' },
];

// 六个下拉框各自默认停在第一个选项（少阳），如果只看select.value，没碰过的下拉框
// 和"用户明确选了少阳"两种情况没法区分——会导致刚切到手动模式、什么都还没选，
// 右边预览就已经"看起来选满了六爻"，跟"选到第几爻就画到第几爻"的初衷矛盾。
// 这里额外拿一个数组单独记"这一爻有没有被手动碰过"，只在change事件里置true，
// 不随select本身的默认值联动，从而准确区分"没选"和"选了少阳"。
const manualLineTouched = [false, false, false, false, false, false];

// 生成六行手动选择器：三枚铜钱字面记2、背面记3，三枚之和 6/7/8/9
// 对应 老阴(6,动)/少阳(7)/少阴(8)/老阳(9,动)，跟现实摇钱结果一一对应，
// 用户只要照着自己现实摇出的老少阴阳选就行，不用换算铜钱正反数。
function buildManualLinesUI(){
  manualLinesWrap.innerHTML = MANUAL_LINE_LABELS.map((label, idx) => `
    <div class="manual-line-row">
      <label for="manualLine${idx}">${label}</label>
      <select id="manualLine${idx}">
        ${MANUAL_LINE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
      </select>
    </div>
  `).join('');
  // 接上change事件：每改一爻的阴阳老少，标记这一爻"已选"，并在当前正处于手动模式时
  // 实时重画右边的预览卦画（见 renderManualPreview）——不用等点了"生成排盘"才第一次
  // 看到卦长什么样。只在castMode==='manual'时才重画：这几个select本身在系统摇卦模式下
  // 是display:none隐藏的，正常用户点不到、也就不会触发change，这层判断只是双保险，
  // 防止将来别处万一用程序化方式（.value=...后手动dispatchEvent）改动它们时误触发。
  for(let idx = 0; idx < 6; idx++){
    document.getElementById(`manualLine${idx}`).addEventListener('change', ()=>{
      manualLineTouched[idx] = true;
      if(state.castMode === 'manual') renderManualPreview();
    });
  }
}
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

// ---- 手动填入面板的实时预览：只依赖manualLineTouched+六个select当前值，不碰
// window.lastCastData，跟"生成排盘"那条正式落盘的流程完全分开，纯展示、可以
// 随便重画，不会误触发摇卦次数配额或者覆盖掉AI解读要用的排盘数据。 ----
function renderManualPreview(){
  const touchedCount = manualLineTouched.filter(Boolean).length;
  const sums = [];
  for(let i = 0; i < 6; i++){
    sums.push(parseInt(document.getElementById(`manualLine${i}`).value, 10));
  }

  if(touchedCount === 6){
    // 六爻已经全部选过：换算成正式排盘同款的{yang,moving,isWorld,isResponse}，
    // 直接调用跟"生成排盘"共用的buildGuaDiagramHtml()——查宫位、世应爻位、变卦
    // 卦名这几步照抄renderPlate()里的算法，保证这里画出来的图跟点一下"生成排盘"
    // 之后看到的正式卦画一模一样，不是另一套简化画风。
    const lines = sums.map(lineFromSum);
    const lowerKey = lines.slice(0,3).map(l=>l.yang?'1':'0').join('');
    const upperKey = lines.slice(3,6).map(l=>l.yang?'1':'0').join('');
    const palaceInfo = EIGHT_PALACE_MAP[lowerKey+upperKey];
    const hasMoving = lines.some(l => l.moving);
    const bianLowerKey = lines.slice(0,3).map(l => (l.moving ? !l.yang : l.yang) ? '1':'0').join('');
    const bianUpperKey = lines.slice(3,6).map(l => (l.moving ? !l.yang : l.yang) ? '1':'0').join('');
    const bianInfo = hasMoving ? EIGHT_PALACE_MAP[bianLowerKey+bianUpperKey] : null;
    const diagramLines = lines.map((l, idx) => ({
      yang: l.yang,
      moving: l.moving,
      isWorld: (idx+1) === palaceInfo.world,
      isResponse: (idx+1) === palaceInfo.response,
    }));
    plateWrap.innerHTML = `<div class="manual-preview-complete">
      <div class="manual-preview-hint">六爻已选满，卦画预览如下（点"生成排盘"查看完整纳甲六亲）</div>
      ${buildGuaDiagramHtml(diagramLines, palaceInfo.name, bianInfo ? bianInfo.name : null)}
    </div>`;
    return;
  }

  // 还没选满：逐行画骨架，已选的爻正常画阴阳线，没选的爻画虚线占位——不去猜一个默认值，
  // 免得用户还没碰过的爻看着像"已经选好是少阳"。位置标签（初/二/三/四/五/上）先顶替正式
  // 结果里"世/应"那个位置，世应要等六爻齐了、查出宫位之后才有意义，选不全的时候强行算
  // 没有意义。
  const rows = [];
  for(let pos = 5; pos >= 0; pos--){ // 6爻画最上、1爻画最下，跟传统卦画自下而上的顺序一致
    const posLabel = MANUAL_LINE_LABELS[pos][0];
    if(manualLineTouched[pos]){
      const l = lineFromSum(sums[pos]);
      const bar = l.yang
        ? `<span class="gd-bar-full"></span>`
        : `<span class="gd-bar-half gd-bar-left"></span><span class="gd-bar-half gd-bar-right"></span>`;
      const mark = l.moving ? (l.yang ? '○' : '✕') : '';
      rows.push(`<div class="gd-line${l.moving ? ' moving' : ''}">
        <span class="gd-bar">${bar}</span><span class="gd-mark">${mark}</span><span class="gd-tag">${posLabel}</span>
      </div>`);
    }else{
      rows.push(`<div class="gd-line pending">
        <span class="gd-bar"><span class="gd-bar-pending"></span></span><span class="gd-mark">·</span><span class="gd-tag">${posLabel}</span>
      </div>`);
    }
  }
  const hint = touchedCount === 0
    ? '左边选好一爻的阴阳老少，这里就实时画出对应的爻线'
    : `已选 ${touchedCount}/6 爻，继续往下选，卦画会跟着往上长`;
  plateWrap.innerHTML = `<div class="manual-preview-partial">
    <div class="manual-preview-hint">${hint}</div>
    <div class="gua-diagram-lines">${rows.join('')}</div>
  </div>`;
}

function performManualCast(isCorrection){
  const lines = [];
  for(let i = 0; i < 6; i++){
    const sel = document.getElementById(`manualLine${i}`);
    lines.push(lineFromSum(parseInt(sel.value, 10)));
  }
  coinLog.innerHTML = ''; // 清掉上一次系统摇卦残留的铜钱记录，避免和手动排盘混淆
  renderPlate(lines, 'manual');
  showToast(isCorrection
    ? '已按修正后的录入重新排盘（修正录入仍占用一次摇卦次数）'
    : '已按你手动填入的结果排盘，AI 解读会知道这是你亲自摇的卦', 'success');
}

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
  const sameQuestion = window.lastCastData &&
    (currentQuestion === '' || isSameQuestion(currentQuestion, window.lastCastQuestion || ''));
  if(window.lastCastData && window.lastCastData.source === 'manual' && sameQuestion){
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

function renderPlate(lines, source='system'){
  const {cast,lineData} = calculateCast(lines,source,resolveCastCalendar(),state.daySelectionMode);
  const {lines:structuredLines,guaName,bianGuaName,palaceText,lowerUpperText,dateText,fourPillarsText,kongText,overallTrendText} = cast;
  let rowsHtml = '';
  for(let pos=5; pos>=0; pos--){ // display top(6) to bottom(1)
    const d = lineData[pos];
    const { l, lineNum, stem, branch, branchEl, spirit, liuqin, isWorld, isResponse, isKong, bianGanzhi, bianBranchEl, bianLiuqin, jinTuiShen, huitou, yueling, dayRelation, fushen } = d;
    const bar = l.yang ? '<span class="full"></span>' : '<span class="half left"></span><span class="half right"></span>';
    const mark = l.moving ? (l.yang?'○':'✕') : '';
    const graphic = `<span class="yao"><span class="yao-bar">${bar}</span><span class="yao-mark">${mark}</span></span>`;
    const posTag = (isWorld?' <b>世</b>':'') + (isResponse?' <b>应</b>':'') + (isKong?' <span style="color:var(--text-dim)">空</span>':'');
    const stateText = l.moving ? (l.yang?'老阳→变阴':'老阴→变阳') : (l.yang?'少阳':'少阴');
    // 窄屏下这一列宽度不够会自动换行，但中文换行默认逐字都能断，容易断在很难看的地方
    // （比如"丙戌(土)子孙"断成"丙戌"/"(土)"/"子孙"三行，括号被拆开）。
    // 拆成三个 white-space:nowrap 的最小语义单元（干支 / (五行) / 六亲），单元之间插入
    // 零宽空格(\u200B)——它不占视觉宽度、平时紧挨着显示还是"丙戌(土)子孙"这一整串，
    // 没有肉眼可见的空隙，只在真的宽度不够时才提供一个"这里可以断"的机会。
    // 比只拆两段（干支+五行 合成一段）更保守：现在每一段最多两三个字，
    // 需要的最小列宽比之前更小，不容易出现"这一段本身就塞不下、逼得整张表被撑宽去横向滚动"的情况；
    // 同时单元内部（尤其括号内）永远不会被拆开，跟下面 @media(max-width:640px) 里
    // 给这一列预留的两行高度刚好对上。
    const bianText = l.moving
      ? `<span class="bian-chunk">${bianGanzhi}</span>\u200B<span class="bian-chunk">(${bianBranchEl})</span>\u200B<span class="bian-chunk">${bianLiuqin}</span>`
      : '－';
    const fushenText = fushen ? `${fushen.liuqin} ${fushen.ganzhi}(${fushen.branchEl})` : '－';
    rowsHtml += `<tr class="${l.moving?'moving':''}">
      <td>${lineNum}爻</td>
      <td>${liuqin}</td>
      <td class="fushen-cell">${fushenText}</td>
      <td>${spiritDotHtml(spirit)}${spirit}</td>
      <td class="line-graphic">${graphic}</td>
      <td>${stem}${branch}${posTag}</td>
      <td>${branchEl}</td>
      <td>${stateText}</td>
      <td>${bianText}</td>
    </tr>`;
;
  }

  // 本卦/变卦的名字已经在卦画上方的分栏标签里各显示一次（buildGuaDiagramHtml 里的
  // gua-diagram-label），中间还有箭头表示"变成"的关系，不需要在下面这一行再合并重复一遍。
  // guaNameRowText 只在 diagramHtml 因某种原因没渲染出来时才当兜底文案用。
  const guaNameRowText = `本卦：<b>${guaName}</b>` + (bianGuaName ? `　→　变卦：<b>${bianGuaName}</b>` : '');
  const diagramHtml = buildGuaDiagramHtml(structuredLines.map(structLineToDiagram), guaName, bianGuaName);
  const plateCardsHtml = buildPlateCardsHtml(structuredLines);

  plateWrap.innerHTML = `
    ${PLATE_LEGEND_HTML}
    <table>
      <thead><tr><th>爻位</th><th>六亲</th><th>伏神</th><th>六神</th><th>卦画</th><th>纳甲</th><th>五行</th><th>状态</th><th>变出</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="plate-cards">${plateCardsHtml}</div>
    ${diagramHtml}
    <div class="gua-name-row">
      ${diagramHtml ? '' : `<div>${guaNameRowText}</div>`}
      <div>${palaceText}</div>
      <div>${lowerUpperText.replace('下卦：','下卦：<b>').replace('　上卦：','</b>　上卦：<b>')+'</b>'}</div>
      <div class="gua-date-row">${boldDateHtml(dateText)}</div>
      <div>${boldPillarsHtml(fourPillarsText)}</div>
      <div>${boldPillarsHtml(kongText)}</div>
      <div class="gua-trend-row">证据速览：${overallTrendText}</div>
    </div>`;
  replayFadeIn(plateWrap);

  // 存一份结构化数据供"AI解卦"区域使用（原有字段与之前完全一致，guaName/bianGuaName不参与AI输入，仅供页面展示；
  // yearGanzhi/monthGanzhi/hourGanzhi/fourPillarsText/kongText是新增的年月时柱信息，dayKongText原样保留不改，
  // 供还没升级过的老代码路径兜底读取；dateText是这次新加的公历/农历日期显示文本；
  // castAnchorY/M/D是"干支日→实际日期"换算要用的起卦锚点，跟上面算年月时柱用的是同一个now
  // （复盘历史卦时是knownCastDate反查到的那天，不是"今天"），只存Y/M/D三个数字、不存时分秒，
  // 应期换算只关心日历上的哪一天，跟起卦具体几点几分无关；overallTrendText是这次新增的
  // "证据速览"摘要，见上方注释，不判定吉凶，只给月令旺衰/回头生克/世应生克的收敛度参考）
  window.lastCastData = cast;
  if(window.updateCurrentCastStatus) window.updateCurrentCastStatus();
  // 同步记一下这次摇卦时输入框里的问题文字和摇卦时间，
  // 供下次摇卦时判断是不是换了新问题、以及空问题的卦能否被后写的问题"认领"
  const qEl = document.getElementById('questionInput');
  window.lastCastQuestion = qEl ? qEl.value.trim() : '';
  window.lastCastTime = Date.now();
  // 每次重新摇卦（不管是点"摇卦"/"生成排盘"直接起的新卦，还是经由"AI 解读"里自动重摇的），
  // 之前的AI解读结果和整个对话上下文都已经过期，必须一起清掉，否则会出现
  // "排盘表已经换成新卦，但点‘追问’却还在基于上一卦的对话上下文回答" 的错位。
  // resetConversation() 定义在本文件后面，但因为这里只在用户点击/摇卦完成后才会被调用
  // （不是在脚本首次执行时），届时 resetConversation 早已定义好，可以放心调用。
  if(typeof resetConversation === 'function'){ resetConversation(); }
  const oldResult = document.getElementById('aiResult');
  const oldMeta = document.getElementById('aiMeta');
  const oldCopyRow = document.getElementById('copyRow');
  if(oldResult){ oldResult.textContent=''; }
  if(oldMeta){ oldMeta.textContent=''; }
  if(oldCopyRow){ oldCopyRow.style.display='none'; }
  // 同样的道理，"输出提示词"那一套（主提示词/贴回矫正/追问提示词）也是绑定在"上一卦"上的，
  // 换了新卦这三个框和 lastExportCastText/lastExportQuestion 全部过期，必须一起清掉，
  // 否则会出现提示词框还停在旧卦、或者"生成追问提示词"悄悄拼进旧卦数据的错位。
  if(typeof hidePromptExportBoxes === 'function'){ hidePromptExportBoxes(); }
  if(typeof state.lastExportCastText !== 'undefined'){ state.lastExportCastText = null; }
  if(typeof state.lastExportQuestion !== 'undefined'){ state.lastExportQuestion = null; }
}

// ---- 从已保存的结构化排盘数据（不是原始摇出的六个铜钱结果）重建排盘表格 ----
// 用途：刷新页面后恢复"上次未结束的AI会话"时，把这次会话对应的卦重新画出来，
// 而不是让排盘区空着、对不上正在续接的问答。跟 renderPlate() 的区别是：
// 这里输入的已经是当时算好的结构化数据（爻位/六亲/六神/纳甲/五行/状态/世应/空亡等），
// 不需要重新按日柱推算一次，只负责按同样的表格样式渲染，并把 window.lastCastData /
// lastCastQuestion / lastCastTime 一并写回去，避免恢复对话后"卦是空的"。
function renderPlateFromCastData(castData, question, castTime){
  if(!castData || !Array.isArray(castData.lines)) return;
  // 日期显示：优先用当时存好的castData.dateText（跟那次年月时柱算的是同一个Date，最准）；
  // 老会话（改版前存的，没有dateText字段）就退回用castTime（那次起卦的时间戳）现算一个。
  const resumeDateText = castData.dateText || (castTime ? buildDateDisplayText(new Date(castTime)) : '');
  // 同样的兼容思路：castAnchorY/M/D（干支日应期换算要用的锚点）是这次改版新增的字段，
  // 更早存的会话没有——这里就地补一份，退回用castTime（没有就用现在）当锚点，
  // 尽量让老会话也能算，宁可稍微不准也别整个功能直接失效不标注。
  if(!castData.castAnchorY && !castData.rulesVersion){
    const fallback = castTime ? new Date(castTime) : new Date();
    castData.castAnchorY = fallback.getFullYear();
    castData.castAnchorM = fallback.getMonth() + 1;
    castData.castAnchorD = fallback.getDate();
  }
  const rowsHtml = castData.lines.slice().reverse().map(ln => {
    // 结构化数据里没有直接存 yang 布尔值，但"状态"文案是固定的四种之一
    // （少阳/少阴/老阳→变阴/老阴→变阳），从文案头两个字就能还原阴阳。
    const yang = ln.状态.startsWith('少阳') || ln.状态.startsWith('老阳');
    const bar = yang ? '<span class="full"></span>' : '<span class="half left"></span><span class="half right"></span>';
    const mark = ln.是否动爻 ? (yang ? '○' : '✕') : '';
    const graphic = `<span class="yao"><span class="yao-bar">${bar}</span><span class="yao-mark">${mark}</span></span>`;
    const posTag = (ln.是否世爻?' <b>世</b>':'') + (ln.是否应爻?' <b>应</b>':'') + (ln.是否空亡?' <span style="color:var(--text-dim)">空</span>':'');
    return `<tr class="${ln.是否动爻?'moving':''}">
      <td>${ln.爻位}</td>
      <td>${ln.六亲}</td>
      <td>${spiritDotHtml(ln.六神)}${ln.六神}</td>
      <td class="line-graphic">${graphic}</td>
      <td>${ln.纳甲}${posTag}</td>
      <td>${ln.五行}</td>
      <td>${ln.状态}</td>
    </tr>`;
  }).join('');

  // 同上：本卦/变卦名字已经在下面 diagramHtml 的分栏标签里出现过一次，guaNameRowText
  // 只在 diagramHtml 为空（比如老会话没存全 lines）时才当兜底文案显示，避免重复。
  const guaNameRowText = `本卦：<b>${castData.guaName||''}</b>` + (castData.bianGuaName ? `　→　变卦：<b>${castData.bianGuaName}</b>` : '');
  const lowerUpperText = (castData.lowerUpperText || '')
    .replace('下卦：','下卦：<b>').replace('　上卦：','</b>　上卦：<b>') + '</b>';
  // 优先用新版"年月日时+空亡"文本；这次改版前存的老会话（castData只有日柱+空亡）靠
  // pillarsAndKongText内部兜底自动退回旧文案，boldPillarsHtml两种文案格式都认得，照样能加粗。
  const dayKongHtml = boldPillarsHtml(pillarsAndKongText(castData));
  const diagramHtml = (Array.isArray(castData.lines) && castData.lines.length === 6)
    ? buildGuaDiagramHtml(castData.lines.map(structLineToDiagram), castData.guaName, castData.bianGuaName)
    : '';
  const plateCardsHtml = buildPlateCardsHtml(castData.lines);

  plateWrap.innerHTML = `
    ${PLATE_LEGEND_HTML}
    <table>
      <thead><tr><th>爻位</th><th>六亲</th><th>六神</th><th>卦画</th><th>纳甲</th><th>五行</th><th>状态</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="plate-cards">${plateCardsHtml}</div>
    ${diagramHtml}
    <div class="gua-name-row">
      ${diagramHtml ? '' : `<div>${guaNameRowText}</div>`}
      <div>${castData.palaceText || ''}</div>
      <div>${lowerUpperText}</div>
      ${resumeDateText ? `<div class="gua-date-row">${boldDateHtml(resumeDateText)}</div>` : ''}
      <div>${dayKongHtml}</div>
      ${castData.overallTrendText ? `<div class="gua-trend-row">证据速览：${castData.overallTrendText}</div>` : ''}
    </div>
    <div class="placeholder" style="padding:10px 0 0;font-size:var(--fs-2);">（以上是刷新前留存的排盘，对应下面正在续接的追问）</div>`;
  replayFadeIn(plateWrap);

  window.lastCastData = castData;
  window.lastCastQuestion = question || '';
  window.lastCastTime = castTime || Date.now();
  if(window.updateCurrentCastStatus) window.updateCurrentCastStatus();
}

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

// ---- 把排盘快照渲染成历史记录展开后排在最上面的一小块摘要，格式贴近网上解卦博主发帖时
// 惯常展示的样子：先是本卦/变卦/宫位/上下卦/日柱空亡，再是逐爻的六亲六神纳甲五行状态、
// 世应空亡动标记——有什么字段就显示什么，不硬凑。老记录（改版之前存的）没有cast这个字段，
// 这里直接返回空字符串，那条记录展开后就只看到问答，不强行补数据、不做迁移。
// ts：这条历史记录的起卦时间戳（r.ts），给老记录（还没存dateText那一批）兜底现算日期用——
// 新记录直接用存好的cast.dateText（跟当时年月时柱算的是同一个Date，更准），两者不会同时用。
function historyCastHtml(cast, ts){
  if(!cast) return '';
  const nameRow = `本卦：<b>${escapeHtml(cast.guaName||'')}</b>`
    + (cast.bianGuaName ? `　→　变卦：<b>${escapeHtml(cast.bianGuaName)}</b>` : '')
    + (cast.source === 'manual' ? '　（线下摇卦录入）' : cast.source === 'physics' ? '　（物理模拟投掷）' : '');
  const dateText = cast.dateText || (ts ? buildDateDisplayText(new Date(ts)) : '');
  const dateHtml = dateText ? boldDateHtml(escapeHtml(dateText)) : '';
  // 年月日时+空亡：新记录有fourPillarsText/kongText，走pillarsAndKongText统一拼接；
  // 老记录（改版前存的，只有dayKongText）自动退回旧文案，boldPillarsHtml两种格式都能加粗。
  const pillarsKongHtml = boldPillarsHtml(escapeHtml(pillarsAndKongText(cast) || ('日柱：'+(cast.ganzhi||''))));
  // 逐爻明细改成一爻一行的小网格（爻位/六亲六神/纳甲五行状态+标记三列对齐），
  // 比之前挤在一整行里用全角空格隔开、窄屏上换行错位要工整得多。
  const linesRows = (cast.lines||[]).slice().reverse().map(ln => {
    let tag = '';
    if(ln.是否世爻) tag += '世';
    if(ln.是否应爻) tag += '应';
    if(ln.是否动爻) tag += '动';
    if(ln.是否空亡) tag += '空';
    const tagHtml = tag ? `<span class="history-line-tag">${escapeHtml(tag)}</span>` : '';
    return `<div class="history-line-row">
      <span class="history-line-pos">${escapeHtml(ln.爻位||'')}</span>
      <span>${escapeHtml(ln.六亲||'')}·${spiritDotHtml(ln.六神)}${escapeHtml(ln.六神||'')}</span>
      <span>${escapeHtml(ln.纳甲||'')}${escapeHtml(ln.五行||'')}·${escapeHtml(ln.状态||'')}${tagHtml}</span>
    </div>`;
  }).join('');
  // 卦象爻画图：跟起卦当下的排盘区（renderPlate/renderPlateFromCastData）用同一份画法，
  // 只是外层套了 .history-cast 这个类名，CSS 里已经有对应的缩小版样式（见前面 .history-cast .gua-diagram 一节）。
  const diagramHtml = (Array.isArray(cast.lines) && cast.lines.length === 6)
    ? buildGuaDiagramHtml(cast.lines.map(structLineToDiagram), cast.guaName, cast.bianGuaName)
    : '';
  return `<div class="history-cast">
    <div class="history-cast-head">${nameRow}</div>
    ${diagramHtml}
    <div class="history-cast-head">${escapeHtml(cast.palaceText||'')}　${escapeHtml(cast.lowerUpperText||'')}</div>
    ${dateHtml ? `<div class="history-cast-head">${dateHtml}</div>` : ''}
    <div class="history-cast-head">${pillarsKongHtml}</div>
    <div class="history-cast-lines">${linesRows}</div>
    ${cast.overallTrendText ? `<div class="history-cast-head">证据速览：${escapeHtml(cast.overallTrendText)}</div>` : ''}
  </div>`;
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

function renderStats(){
  const list = loadHistory();
  if(!list.length){ aiStats.textContent = ''; return; }
  // tokens/费用改从终身计数器读（不受历史记录 HISTORY_MAX 裁剪影响，见 loadLifetimeStats 上方注释），
  // 卦数/问答轮数依然从当前历史列表现算——这两项本来就是"当前还留着的记录"的计数，
  // 语义上跟着列表走是对的，只有涉及真金白银的tokens/费用才必须是不会被裁没的终身总额。
  const lifetime = loadLifetimeStats();
  const totalRounds = list.reduce((s,r)=> s + historyTurnsOf(r).filter(t=>t.role==='assistant').length, 0);
  // "输出提示词"那条路径现在也会写历史，但它没调AI、不产生token/费用，混进"累计解读"的
  // 卦数里容易让人误以为都是AI解读；这里把"提示词导出"单独报个数，list.length依然是总条数。
  const promptCount = list.filter(r => r.type === 'prompt').length;
  const breakdown = promptCount ? `（AI解读${list.length-promptCount} · 提示词导出${promptCount}）` : '';
  aiStats.innerHTML = `累计 <b>${list.length}</b> 卦${breakdown} · 问答共 <b>${totalRounds}</b> 轮 · 共 <b>${lifetime.tokens.toLocaleString()}</b> tokens · 约 <b>¥${lifetime.cost.toFixed(4)}</b>`;
}

// 每条历史记录是一整次摇卦对应的会话（首次解读+若干次追问都在同一条里），不是每次AI调用一条平铺记录。
// 旧版本存的是扁平记录（question/text字段，没有turns），historyTurnsOf已经做了兼容读取，这里不用管新旧格式。
function renderHistory(){
  const list = loadHistory().slice().reverse(); // 最新的在最上面
  historyCount.textContent = list.length;
  historyEmpty.style.display = list.length ? 'none' : 'flex';
  historyList.innerHTML = list.map(r => {
    const turns = historyTurnsOf(r);
    const roundCount = turns.filter(t=>t.role==='assistant').length;
    // historyTurnsOf()两条分支里turns[0]永远是这一条记录最初的那个"问"（不管是prompt类型
    // 只有一轮，还是AI解读类型有问有答），这里单独摘出来放在展开正文最上面，
    // 剩下的turns（第一轮的"答"、以及后续追问的"问/答"）照旧排在卦象信息下面——
    // 呼应"问题要在上面"的要求：先看清问的是什么事，再看卦象数据和回复。
    const firstQuestion = turns[0]?.text || r.question || '';
    const restTurnsHtml = turns.slice(1).map(t =>
      `<div class="history-turn history-turn-${t.role}"><b>${t.role==='user'?'问':'答'}：</b>${escapeHtml(t.text)}</div>`
    ).join('');
    const isPrompt = r.type === 'prompt';
    const tagHtml = isPrompt
      ? `<span class="history-item-tag">提示词导出</span>`
      : (roundCount>1 ? `<span class="history-item-tag">共${roundCount}轮</span>` : '');
    // roleLabel/styleLabel 是后加的字段，早于这次改动生成的老记录里没有，
    // 这里做兼容：没有就不拼这一截，不显示"undefined · undefined"这种东西。
    const configLabel = r.roleLabel ? `${r.roleLabel}${r.styleLabel ? '·' + r.styleLabel : ''}` : '';
    const baseMetaText = isPrompt
      ? '未直接调用AI，仅生成提示词'
      : `token共${r.totalTokens||0} · 约¥${(r.costYuan||0).toFixed(4)}`;
    const metaText = configLabel ? `${baseMetaText} · ${configLabel}` : baseMetaText;
    const questionHtml = `<div class="history-turn history-turn-user history-q-top"><b>问：</b>${escapeHtml(firstQuestion)}</div>`;
    // roleCustomText/styleCustomText 是这次改动新加的字段，只有"当时选的正是自定义档"才会
    // 有内容——存的是那一刻"设置"里自定义人设/风格文本框的原文快照。之前只存了"自定义人设"
    // 这四个字的标签，用户后来改动或清空设置面板里的自定义文字后，旧记录就再也看不出当时
    // 具体写的是什么、没法准确复现那次到底按什么规则断的；现在把原文一并存进快照。
    // 老记录（这次改动之前生成的）没有这两个字段，下面兼容处理成空字符串，不额外显示。
    const customConfigParts = [];
    if(r.roleCustomText) customConfigParts.push(`<div class="history-turn history-custom-config"><b>当时的自定义人设：</b>${escapeHtml(r.roleCustomText)}</div>`);
    if(r.styleCustomText) customConfigParts.push(`<div class="history-turn history-custom-config"><b>当时的自定义风格：</b>${escapeHtml(r.styleCustomText)}</div>`);
    const customConfigHtml = customConfigParts.join('');
    return `
    <div class="history-item" data-id="${r.id}">
      <div class="history-item-head" data-action="toggle">
        <span class="history-item-q">${escapeHtml(firstQuestion)}</span>
        ${tagHtml}
        <span class="history-item-time">${formatTime(r.ts)}</span>
      </div>
      <div class="history-item-meta">${metaText}</div>
      <div class="history-item-body">${questionHtml}${customConfigHtml}${historyCastHtml(r.cast, r.ts)}${restTurnsHtml}</div>
      <button class="history-item-del" data-action="delete">删除这条</button>
    </div>
  `;
  }).join('');
  renderStats();
}

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
  // 也避免 window.lastCastData 空着导致下次点"AI 解读"时被误判成"没摇过卦"而悄悄重摇。
  if(saved.castData){
    renderPlateFromCastData(saved.castData, saved.castQuestion, saved.castTime);
  }
  renderConversation();
  aiMeta.textContent =
    `（已从上次未结束的会话恢复，累计约¥${(state.currentConversation.cumCost||0).toFixed(4)}，仅供参考，以DeepSeek账单为准）`;
  copyRow.style.display = 'flex';
  followUpBox.style.display = 'flex';
})();

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
promptExtraToggle.addEventListener('click', ()=> promptExtraTools.classList.toggle('open'));

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
  followUpExportOutput.value = buildExportFollowUpPromptText(state.lastExportQuestion, state.lastExportCastText, priorAnswerText, followUpText);
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
    if(window.lastCastData && !(window.lastCastQuestion || '').trim()
       && (Date.now() - (window.lastCastTime || 0)) <= ADOPT_WINDOW_MS){
      window.lastCastQuestion = question;
    }
    // 判断是否要重新起卦：要么根本没摇过卦，要么问题跟上次摇卦时不一样——
    // 但"字面不一样"不代表真的是另一件事（可能只是同一件事换个说法/继续追问），
    // 所以这里不再静默自动重摇，改成弹窗让用户自己确认。
    const questionChanged = !!window.lastCastData && !isSameQuestion(question, window.lastCastQuestion || '');
    let shouldRecast = !window.lastCastData; // 压根没摇过卦，必须起一卦，不用问

    if(window.lastCastData && questionChanged){
      const userSaysNewEvent = await showConfirm(
        `这次问题和上一卦提问的文字不完全一样：\n\n上一卦问的：${window.lastCastQuestion}\n这次写的：${question}\n\n是同一件事换个说法/继续追问，还是确实换了件不相关的新事？`,
        { title: '是同一件事，还是换新事了？', okText: '换新事了，重摇', cancelText: '同一件事，不重摇' }
      );
      if(userSaysNewEvent){
        shouldRecast = true;
      }else{
        // 用户确认还是同一件事：把这次的说法记成"这一卦对应的问题"，
        // 免得下次又换个说法问，还得再弹一次确认。
        window.lastCastQuestion = question;
        showToast('沿用上一卦解读', 'info');
      }
    }

    if(shouldRecast){

      // 这里如果 window.lastCastData 还在，说明能走到这一步是因为上面 questionChanged 分支里
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
    const castText = formatCastDataForAI(window.lastCastData);
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
      result = await interpretWithDeepSeek(question, castText, thinking.onDelta, controller.signal);
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
        cast: buildHistoryCastSnapshot(window.lastCastData),
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
// window.lastCastData / 摇卦次数配额；反过来 interpretBtn 点击时也会顺带锁住摇卦按钮，
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
    if(window.lastCastData && !(window.lastCastQuestion || '').trim()
       && (Date.now() - (window.lastCastTime || 0)) <= ADOPT_WINDOW_MS){
      window.lastCastQuestion = question;
    }
    const questionChanged = !!window.lastCastData && !isSameQuestion(question, window.lastCastQuestion || '');
    let shouldRecast = !window.lastCastData;

    if(window.lastCastData && questionChanged){
      const userSaysNewEvent = await showConfirm(
        `这次问题和上一卦提问的文字不完全一样：\n\n上一卦问的：${window.lastCastQuestion}\n这次写的：${question}\n\n是同一件事换个说法/继续追问，还是确实换了件不相关的新事？`,
        { title: '是同一件事，还是换新事了？', okText: '换新事了，重摇', cancelText: '同一件事，不重摇' }
      );
      if(userSaysNewEvent){
        shouldRecast = true;
      }else{
        window.lastCastQuestion = question;
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

    const castText = formatCastDataForAI(window.lastCastData);
    state.lastExportCastText = castText;
    state.lastExportQuestion = question;
    showPromptOutput(buildExportPromptText(question, castText));
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
        cast: buildHistoryCastSnapshot(window.lastCastData),
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

export {renderPlate,lineFromSum,formatCastDataForAI,buildExportPromptText,buildHistoryCastSnapshot};
export function setTestCalendar(date){state.knownCastDate=date;state.daySelectionMode="date";}

configureStorageNotifications(showToast);

configureQuotaNotifications(renderCastQuota);
