import { loadRoleChoice, loadCustomRole, loadModelChoice, loadPriceOverride, loadStyleChoice, loadCustomStyle, loadEffortChoice } from '../storage/settings.js';
import { ROLE_PRESETS, ROLE_ONE_SHOT_EXAMPLES, ROLE_LABELS, REPLY_STYLE_PRESETS, EFFORT_PRESETS, PRICE_TABLES, REPLY_STYLE_LABELS } from './config.js';


function currentRoleInfo(){
  const choice = loadRoleChoice();
  if(choice === 'custom') return loadCustomRole().trim() || ROLE_PRESETS.classic;
  return ROLE_PRESETS[choice] || ROLE_PRESETS.classic;
}

function currentOneShotExample(){
  const choice = loadRoleChoice();
  if(choice === 'custom') return '';
  return ROLE_ONE_SHOT_EXAMPLES[choice] || '';
}

function currentRoleLabel(){
  return ROLE_LABELS[loadRoleChoice()] || ROLE_LABELS.classic;
}

// 历史记录只存了 roleLabel 这四个字（"自定义人设"），没存当时具体填的文字——如果之后
// 用户把"设置"里的自定义人设文字改了或清空了，回头翻旧记录就完全看不出当时到底是按
// 什么规则断的。appendHistory时额外调这个函数存一份快照：只有当前正是custom档才有内容，
// 内置六档不需要（它们的文字是代码里固定的，不会变，标签本身就够用）。
function currentRoleCustomSnapshot(){
  return loadRoleChoice() === 'custom' ? loadCustomRole().trim() : '';
}

function effectivePriceTable(){
  const base = PRICE_TABLES[loadModelChoice()] || PRICE_TABLES['deepseek-flash'];
  const o = loadPriceOverride();
  if(!o) return base;
  return {
    offpeak: { ...base.offpeak, ...(o.offpeak || {}) },
    peak:    { ...base.peak,    ...(o.peak    || {}) },
  };
}


function isBeijingPeakHour(date){
  date = date || new Date();
  // 直接在UTC时间戳上加8小时再取"UTC字段"，等价于读出北京时间的年月日时——
  // 这样跨零点/跨周末换算星期几时不会出错（单纯 (getUTCHours()+8)%24 只能算出小时，算不出星期）。
  const beijingShifted = new Date(date.getTime() + 8 * 3600 * 1000);
  const beijingDay = beijingShifted.getUTCDay(); // 0=周日 … 6=周六
  const beijingHour = beijingShifted.getUTCHours();
  if(beijingDay === 0 || beijingDay === 6) return false; // 周末全天按闲时算：2026-08-23起生效的规则（见上方PRICE_TABLES注释），不是从最初的峰谷定价就有
  return (beijingHour >= 9 && beijingHour < 12) || (beijingHour >= 14 && beijingHour < 18);
}

function currentEffortPreset(){ return EFFORT_PRESETS[loadEffortChoice()] || EFFORT_PRESETS.max; }


function currentReplyStyle(){
  const choice = loadStyleChoice();
  if(choice === 'custom') return loadCustomStyle().trim();
  return REPLY_STYLE_PRESETS[choice] || REPLY_STYLE_PRESETS.brief;
}

function currentReplyStyleLabel(){
  return REPLY_STYLE_LABELS[loadStyleChoice()] || REPLY_STYLE_LABELS.brief;
}

// 同 currentRoleCustomSnapshot()，只有当前正是custom档才有内容。
function currentStyleCustomSnapshot(){
  return loadStyleChoice() === 'custom' ? loadCustomStyle().trim() : '';
}

export { currentRoleInfo, currentOneShotExample, currentRoleLabel, currentRoleCustomSnapshot, effectivePriceTable, isBeijingPeakHour, currentEffortPreset, currentReplyStyle, currentReplyStyleLabel, currentStyleCustomSnapshot };
