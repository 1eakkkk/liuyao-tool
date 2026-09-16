import { safeGetItem, safeSetItem } from './local.js';



/* ==================================================================
   摇卦前置校验 —— 呼应传统六爻两条基本规矩：
   1)"一事不问二卦"：同一件事只起一次卦，反复摇卦骗自己的结果不算数
   2) 短时间内不宜连续摇很多卦（心诚则灵），做一个简单的频率限制
   ================================================================== */
const LS_KEY_CAST_LOG = 'liuyao_cast_log';

const CAST_COOLDOWN_WINDOW_MS = 10 * 60 * 1000;
 // 10 分钟窗口
const CAST_COOLDOWN_MAX = 3;
                    // 窗口内最多摇 3 次

function loadCastLog(){
  try{ const v=JSON.parse(safeGetItem(LS_KEY_CAST_LOG) || '[]'); return Array.isArray(v)?v.filter(t=>Number.isFinite(t)&&t<=Date.now()):[]; }
  catch(e){ return []; }
}

function pruneCastLog(log){
  const now = Date.now();
  return log.filter(ts => now - ts < CAST_COOLDOWN_WINDOW_MS);
}

let notifyQuota = () => {};

function configureQuotaNotifications(notify){ notifyQuota = notify; }

function logCastEvent(){
  const log = pruneCastLog(loadCastLog());
  log.push(Date.now());
  safeSetItem(LS_KEY_CAST_LOG, JSON.stringify(log));
  notifyQuota(); // 每次真正占用一次摇卦名额，顺手刷新一下常驻的"还剩几次"提示
}

function castsRemainingInWindow(){
  return Math.max(CAST_COOLDOWN_MAX - pruneCastLog(loadCastLog()).length, 0);
}

export { LS_KEY_CAST_LOG, CAST_COOLDOWN_WINDOW_MS, CAST_COOLDOWN_MAX, loadCastLog, pruneCastLog, notifyQuota, configureQuotaNotifications, logCastEvent, castsRemainingInWindow };
