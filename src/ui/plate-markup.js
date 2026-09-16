import { spiritDotHtml, escapeHtml } from './helpers.js';



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

export { buildGuaDiagramHtml, structLineToDiagram, PLATE_LEGEND_HTML, buildPlateCardsHtml };
