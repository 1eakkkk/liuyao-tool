import { SPIRIT_CLASS } from '../core/constants.js';


function spiritDotHtml(spirit){
  const cls = SPIRIT_CLASS[spirit];
  return cls ? `<span class="spirit-dot ${cls}" aria-hidden="true"></span>` : '';
}

// 跟 boldPillarsHtml 同一个思路，把"公历：X"“农历：X”里"："后面的值部分加粗。
function boldDateHtml(text){
  return String(text||'').replace(/(公历|农历)：([^\s　]+)/g, '$1：<b>$2</b>');
}

// 把"年柱：X"这类文本里，每个"XX柱：值"和"空亡：值"的"值"部分加粗，供排盘区、历史记录展示复用，
// 不用各处各写一遍加粗规则。用正则按"标签：值"的固定格式匹配，不依赖调用方传入的具体是哪几柱。
function boldPillarsHtml(text){
  return String(text||'')
    .replace(/(年柱|月柱|日柱|时柱)：([^\s　]+)/g, '$1：<b>$2</b>')
    .replace(/空亡：(.+)$/, '空亡：<b>$1</b>');
}


// 排盘表每次重新渲染（摇卦完成/手动生成/历史记录回看）都要重新播一遍跟标签切换
// 同款的淡入动效，而不是硬切出现。同一个元素反复扣同一个class浏览器不会重放
// CSS动画，这里先移除class、强制触发一次回流（读一下offsetWidth），再加回去，
// 让每次调用都能重新触发 .fade-in 对应的 fade 关键帧。
function replayFadeIn(el){
  el.classList.remove('fade-in');
  void el.offsetWidth;
  el.classList.add('fade-in');
}

function maskApiKey(k){
  if(!k) return '';
  if(k.length <= 8) return '•'.repeat(k.length);
  return k.slice(0,3) + '•'.repeat(Math.max(k.length - 7, 4)) + k.slice(-4);
}


// ---- 提问框/追问框字数计数：跟 textarea 上的 maxlength="500" 配套，输入过程中就能
// 看到还剩多少字，不用等真被浏览器硬截断才发现写多了；快到上限（剩余<=20字）时
// 变朱砂色提醒一下。程序化清空这两个输入框的几处（清空回复/重置会话/追问发送后）
// 都手动 dispatchEvent(new Event('input')) 了一次，所以这里只用管用户真实敲键盘的情况。
function bindCharCounter(textareaEl, counterEl, max){
  const update = () => {
    const len = textareaEl.value.length;
    counterEl.textContent = `${len} / ${max} 字`;
    counterEl.classList.toggle('near-limit', max - len <= 20);
  };
  textareaEl.addEventListener('input', update);
  update();
}


// ---- 历史记录 & 累计统计 ----
function formatTime(ts){
  const d = new Date(ts);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


function escapeHtml(s){
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}


// ---- 统一的"复制到剪贴板"封装：全站5个复制按钮共用这一个函数，不再各写一遍 ----
// 优先用 navigator.clipboard.writeText；但这个API不保证存在——部分受限WebView
// （比如某些App内嵌浏览器）里 navigator.clipboard 本身就是 undefined，直接调用
// 会同步抛TypeError，根本走不到后面的 .catch()，之前的写法在这类环境里连
// "复制没成功"的提示都弹不出来，用户只会看到点了没反应。这里做一层兜底：
// 不存在时退回旧式 document.execCommand('copy')（造一个临时textarea选中文字执行复制），
// 两条路都失败，调用方的 .catch() 才会被触发、走到"请长按手动复制"的提示。
function copyTextToClipboard(text){
  if(navigator.clipboard && typeof navigator.clipboard.writeText === 'function'){
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject)=>{
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('execCommand复制失败'));
    }catch(e){
      reject(e);
    }
  });
}

export { spiritDotHtml, boldDateHtml, boldPillarsHtml, replayFadeIn, maskApiKey, bindCharCounter, formatTime, escapeHtml, copyTextToClipboard };
