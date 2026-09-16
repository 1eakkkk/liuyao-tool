import { safeGetItem, safeSetItem, safeRemoveItem } from './local.js';



// ---- 人设选择：存 localStorage，读取时优先用用户选的，没选过就用 classic 默认档 ----
const LS_KEY_ROLE = 'liuyao_role_choice';
       // 'classic' | 'sharp' | 'warm' | 'plain' | 'bluff' | 'cryptic' | 'custom'
const LS_KEY_CUSTOM_ROLE = 'liuyao_custom_role';

function loadRoleChoice(){ return safeGetItem(LS_KEY_ROLE) || 'classic'; }

function saveRoleChoice(v){ safeSetItem(LS_KEY_ROLE, v); }

function loadCustomRole(){ return safeGetItem(LS_KEY_CUSTOM_ROLE) || ''; }

function saveCustomRole(v){ safeSetItem(LS_KEY_CUSTOM_ROLE, v); }


// ---- 模型选择：'deepseek-flash' | 'deepseek-v4-pro'，存 localStorage，默认走 Flash ----
// V4-Pro 正式版（V4-Pro-0813）已于 2026-08-13 GA，但 Flash 依然便宜得多（约1/3价），
// 日常问卦精度够用，所以默认继续给 Flash；想要更准的解读可以在设置里手动切到 Pro。
const LS_KEY_MODEL = 'liuyao_deepseek_model';

function loadModelChoice(){const v=safeGetItem(LS_KEY_MODEL);return v==='deepseek-v4-pro'?v:'deepseek-flash';}

function saveModelChoice(v){ safeSetItem(LS_KEY_MODEL, v); }


// ---- 计价单价隐患兜底：DeepSeek 调价不会报错、只会让上面 PRICE_TABLES 悄悄算错账，
// 这里允许用户在"设置"里手动填入新单价覆盖内置默认值，存在 localStorage，读取时优先生效。
// 只覆盖用户真正填了的字段，没填的字段继续吃内置默认值，避免半填一半清零。
const LS_KEY_PRICE_OVERRIDE = 'liuyao_price_override';

function loadPriceOverride(){
  try{
    const raw = JSON.parse(safeGetItem(LS_KEY_PRICE_OVERRIDE) || 'null');
    return (raw && typeof raw === 'object') ? raw : null;
  }catch(e){ return null; }
}

function savePriceOverride(partial){
  safeSetItem(LS_KEY_PRICE_OVERRIDE, JSON.stringify(partial));
}

function clearPriceOverride(){
  safeRemoveItem(LS_KEY_PRICE_OVERRIDE);
}


// ---- 对应 settings.py（本地存储）----
const LS_KEY_API = 'liuyao_deepseek_api_key';

const LS_KEY_STYLE = 'liuyao_reply_style';
       // 'brief' | 'deep' | 'custom'
const LS_KEY_CUSTOM_STYLE = 'liuyao_custom_style';

const LS_KEY_EFFORT = 'liuyao_reply_effort';


function loadApiKey(){ return safeGetItem(LS_KEY_API) || ''; }

function saveApiKey(k){ safeSetItem(LS_KEY_API, k); }

function clearApiKey(){ safeRemoveItem(LS_KEY_API); }


function loadStyleChoice(){ return safeGetItem(LS_KEY_STYLE) || 'brief'; }

function saveStyleChoice(v){ safeSetItem(LS_KEY_STYLE, v); }

function loadCustomStyle(){ return safeGetItem(LS_KEY_CUSTOM_STYLE) || ''; }

function saveCustomStyle(v){ safeSetItem(LS_KEY_CUSTOM_STYLE, v); }

function loadEffortChoice(){ return safeGetItem(LS_KEY_EFFORT) || 'max'; }

function saveEffortChoice(v){ safeSetItem(LS_KEY_EFFORT, v); }

export { LS_KEY_ROLE, LS_KEY_CUSTOM_ROLE, loadRoleChoice, saveRoleChoice, loadCustomRole, saveCustomRole, LS_KEY_MODEL, loadModelChoice, saveModelChoice, LS_KEY_PRICE_OVERRIDE, loadPriceOverride, savePriceOverride, clearPriceOverride, LS_KEY_API, LS_KEY_STYLE, LS_KEY_CUSTOM_STYLE, LS_KEY_EFFORT, loadApiKey, saveApiKey, clearApiKey, loadStyleChoice, saveStyleChoice, loadCustomStyle, saveCustomStyle, loadEffortChoice, saveEffortChoice };
