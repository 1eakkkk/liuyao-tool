import { resolveCastCalendar } from './calendar-input.js';
import { resetConversation } from '../app/conversation.js';
import { buildGuaDiagramHtml, structLineToDiagram, PLATE_LEGEND_HTML, buildPlateCardsHtml } from './plate-markup.js';
import { hidePromptExportBoxes } from './ai-view.js';
import { spiritDotHtml, boldDateHtml, boldPillarsHtml, replayFadeIn } from './helpers.js';
import { plateWrap } from './dom.js';
import { pillarsAndKongText } from '../ai/formatter.js';
import { castsRemainingInWindow } from '../storage/cast-log.js';
import { state } from '../app/state.js';
import { calculateCast } from '../core/casting.js';
import { buildDateDisplayText } from '../core/ganzhi.js';


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

export { renderCastQuota, renderPlate, renderPlateFromCastData };
