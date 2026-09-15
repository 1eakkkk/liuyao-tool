import { buildGuaDiagramHtml, structLineToDiagram } from './plate-markup.js';
import { spiritDotHtml, boldDateHtml, boldPillarsHtml, formatTime, escapeHtml } from './helpers.js';
import { aiStats, historyList, historyEmpty, historyCount } from './dom.js';
import { pillarsAndKongText } from '../ai/formatter.js';
import { loadHistory, loadLifetimeStats, historyTurnsOf } from '../storage/history.js';
import { buildDateDisplayText } from '../core/ganzhi.js';



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

export { historyCastHtml, renderStats, renderHistory };
