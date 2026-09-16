


const svg = document.getElementById('wuxingSvg');

const dayGanzhiSelect = document.getElementById('dayGanzhi');


// ---- 按公历日期反查日柱：想复盘某个历史案例（比如书上的老案例、以前手动摇的卦）
// 之前只能自己心算六十甲子再去下拉框里找，这里加个日期选择器，选完直接调用上面已有的
// getTodayJiaziIndex(date) 反推那天的日柱下标，自动帮下拉框选中，不用再手动数。
// 只负责"选中"，不自动触发摇卦/生成排盘——选完日柱后用户仍按原来的流程点"摇卦"或
// "生成排盘"，跟直接手动在下拉框里选一样，不额外改变其他状态。
const dayLookupDateInput = document.getElementById('dayLookupDate');


/* ---------------- caster ---------------- */
const castBtn = document.getElementById('castBtn');

const plateWrap = document.getElementById('plateWrap');

const coinLog = document.getElementById('coinLog');


/* ---------------- 线下摇卦 · 手动填入 ---------------- */
const castModeToggle = document.getElementById('castModeToggle');

const systemCastPanel = document.getElementById('systemCastPanel');

const manualCastPanel = document.getElementById('manualCastPanel');

const manualLinesWrap = document.getElementById('manualLines');

const manualCastBtn = document.getElementById('manualCastBtn');


/* ==================================================================
   Toast 弹窗提示 —— 状态/成功/错误提示都走这里，比小字更显眼，
   手机App里尤其需要，不然一行小灰字很容易被忽略掉。
   ================================================================== */
const toastWrap = document.getElementById('toastWrap');


/* ==================================================================
   通用确认弹层 —— 替代原生 confirm()，风格跟页面其他弹层统一。
   用法：const ok = await showConfirm('文字…', {title, okText, cancelText});
   ================================================================== */
const confirmOverlay = document.getElementById('confirmOverlay');

const confirmTitle = document.getElementById('confirmTitle');

const confirmMsg = document.getElementById('confirmMsg');

const confirmOkBtn = document.getElementById('confirmOkBtn');

const confirmCancelBtn = document.getElementById('confirmCancelBtn');

const onboardOverlay = document.getElementById('onboardOverlay');

const onboardCloseBtn = document.getElementById('onboardCloseBtn');

const helpFab = document.getElementById('helpFab');

const onboardScroll = document.getElementById('onboardScroll');

const onboardFade = document.getElementById('onboardFade');


// ---- UI 绑定 ----
const questionInput = document.getElementById('questionInput');

const questionCharCounter = document.getElementById('questionCharCounter');

const interpretBtn = document.getElementById('interpretBtn');

const aiStatus = document.getElementById('aiStatus');

const aiResult = document.getElementById('aiResult');

const aiMeta = document.getElementById('aiMeta');

const aiStats = document.getElementById('aiStats');

const copyRow = document.getElementById('copyRow');

const copyResultBtn = document.getElementById('copyResultBtn');

const copyAllBtn = document.getElementById('copyAllBtn');

const clearResultBtn = document.getElementById('clearResultBtn');

// ---- 提示词导出（不经API Key）相关元素 ----
const promptBtn = document.getElementById('promptBtn');

const promptOutputBox = document.getElementById('promptOutputBox');

const promptOutputText = document.getElementById('promptOutputText');

const copyPromptBtn = document.getElementById('copyPromptBtn');

const closePromptBtn = document.getElementById('closePromptBtn');

// ---- 备用工具折叠容器（整理格式/追问提示词收在里面，默认折叠） ----
const promptExtraTools = document.getElementById('promptExtraTools');

const promptExtraToggle = document.getElementById('promptExtraToggle');

// ---- 贴回矫正（本地清洗对方AI回复，不经网络）相关元素 ----
// （外层 promptCleanupBox 这个包裹div本身不再需要单独控制显隐——它跟着 promptExtraTools
// 折叠容器一起显示，这里只取里面真正要读写的几个子元素）
const cleanupInputText = document.getElementById('cleanupInputText');

const cleanupOutputText = document.getElementById('cleanupOutputText');

const cleanupRunBtn = document.getElementById('cleanupRunBtn');

const cleanupCopyRow = document.getElementById('cleanupCopyRow');

const copyCleanupBtn = document.getElementById('copyCleanupBtn');

// ---- 追问提示词导出相关元素 ----
// （外层 promptFollowupExportBox 同理，显隐交给 promptExtraTools，这里只取要读写的子元素）
const followUpExportInput = document.getElementById('followUpExportInput');

const followUpExportOutput = document.getElementById('followUpExportOutput');

const followUpExportBtn = document.getElementById('followUpExportBtn');

const followUpExportCopyRow = document.getElementById('followUpExportCopyRow');

const copyFollowUpExportBtn = document.getElementById('copyFollowUpExportBtn');

// 记住"输出提示词"最近一次用的排盘文本和问题，供"生成追问提示词"复用——
// 导出路径没有 currentConversation 那套多轮状态，只能靠这两个变量单独记一份。


const followUpBox = document.getElementById('followUpBox');

const followUpInput = document.getElementById('followUpInput');

const followUpCharCounter = document.getElementById('followUpCharCounter');

const followUpBtn = document.getElementById('followUpBtn');

const followUpStatus = document.getElementById('followUpStatus');

const stopGenBtn = document.getElementById('stopGenBtn');


const toggleSettingsBtn = document.getElementById('toggleSettingsBtn');

const aiSettings = document.getElementById('aiSettings');

const apiKeyInput = document.getElementById('apiKeyInput');

const apiKeyStatus = document.getElementById('apiKeyStatus');

const saveKeyBtn = document.getElementById('saveKeyBtn');

const clearKeyBtn = document.getElementById('clearKeyBtn');

const styleSelect = document.getElementById('styleSelect');

const customStyleWrap = document.getElementById('customStyleWrap');

const customStyleInput = document.getElementById('customStyleInput');

const roleSelect = document.getElementById('roleSelect');

const roleHint = document.getElementById('roleHint');

const customRoleWrap = document.getElementById('customRoleWrap');

const customRoleInput = document.getElementById('customRoleInput');

const effortSelect = document.getElementById('effortSelect');

const modelSelect = document.getElementById('modelSelect');



// ---- 计价单价覆盖：3个输入框（缓存命中/未命中/输出），留空的字段用内置默认值。
// 官方目前是峰谷两档计费、高峰固定是闲时的2倍，但这里UI仍只留一份输入，图省事——
// 填的就当"闲时"单价，保存时按 ×2 自动换算出高峰单价，一起写进 {offpeak,peak} 结构
// （跟 effectivePriceTable() 保持一致）。如果官方以后把峰谷倍率从2倍改成别的数，
// 或者干脆取消峰谷价，这里的 ×2 换算要跟着改。 ----
const priceHit = document.getElementById('priceHit');

const priceMiss = document.getElementById('priceMiss');

const priceOutput = document.getElementById('priceOutput');

const savePriceOverrideBtn = document.getElementById('savePriceOverrideBtn');

const resetPriceOverrideBtn = document.getElementById('resetPriceOverrideBtn');


const gotoAiTabBtn = document.getElementById('gotoAiTabBtn');


const toggleHistoryBtn = document.getElementById('toggleHistoryBtn');

const historyPanel = document.getElementById('historyPanel');

const historyList = document.getElementById('historyList');

const historyEmpty = document.getElementById('historyEmpty');

const historyCount = document.getElementById('historyCount');

const clearHistoryBtn = document.getElementById('clearHistoryBtn');

export { svg, dayGanzhiSelect, dayLookupDateInput, castBtn, plateWrap, coinLog, castModeToggle, systemCastPanel, manualCastPanel, manualLinesWrap, manualCastBtn, toastWrap, confirmOverlay, confirmTitle, confirmMsg, confirmOkBtn, confirmCancelBtn, onboardOverlay, onboardCloseBtn, helpFab, onboardScroll, onboardFade, questionInput, questionCharCounter, interpretBtn, aiStatus, aiResult, aiMeta, aiStats, copyRow, copyResultBtn, copyAllBtn, clearResultBtn, promptBtn, promptOutputBox, promptOutputText, copyPromptBtn, closePromptBtn, promptExtraTools, promptExtraToggle, cleanupInputText, cleanupOutputText, cleanupRunBtn, cleanupCopyRow, copyCleanupBtn, followUpExportInput, followUpExportOutput, followUpExportBtn, followUpExportCopyRow, copyFollowUpExportBtn, followUpBox, followUpInput, followUpCharCounter, followUpBtn, followUpStatus, stopGenBtn, toggleSettingsBtn, aiSettings, apiKeyInput, apiKeyStatus, saveKeyBtn, clearKeyBtn, styleSelect, customStyleWrap, customStyleInput, roleSelect, roleHint, customRoleWrap, customRoleInput, effortSelect, modelSelect, priceHit, priceMiss, priceOutput, savePriceOverrideBtn, resetPriceOverrideBtn, gotoAiTabBtn, toggleHistoryBtn, historyPanel, historyList, historyEmpty, historyCount, clearHistoryBtn };
