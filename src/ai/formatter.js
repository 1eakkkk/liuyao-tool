


// ---- 拼出"年柱 月柱 日柱 时柱 + 空亡"这一整行展示/喂给AI用的文本：排盘区展示、AI提示词拼接、
// 历史记录快照三处共用同一份拼接逻辑，避免各处各写一套顺序或文案，越改越不一致。
// 兼容老数据：这次改版之前存的历史记录、或刷新页面后从localStorage续接的castData，
// 只有 dayKongText（日柱+空亡两项），没有年月时三柱，这里直接返回 dayKongText 原样，不强行拼凑。
function pillarsAndKongText(castData){
  if(!castData) return '';
  if(castData.fourPillarsText){
    return castData.kongText ? `${castData.fourPillarsText}　${castData.kongText}` : castData.fourPillarsText;
  }
  return castData.dayKongText || '';
}


// ---- 对应 cast_and_extract.py: format_for_ai ----
// 注：伏神（伏神六亲/伏神纳甲/伏神五行）和动爻变出的干支/六亲（变纳甲/变五行/变六亲）
// 早就算好、存在 castData.lines 每一条里、排盘表里也已经显示，但这里之前漏了拼进发给AI的
// 文本——AI拿到的排盘数据里完全没有这两块信息，等于伏神、化进退神、回头生克这些依赖它们的
// 判断AI根本无从分析。这里补上，动爻额外带上"变出"，六亲不全时额外带上"伏神"。
//
// 后续追加：月令旺衰（月令）、日辰合冲（日辰关系）、回头生克（回头）、飞神对伏神的生克
// （伏神与飞神关系）——这几项此前AI要自己套着【断卦参考表】里的旺相休囚死表/六合六冲表
// 现算，现在改成代码直接算好标注，AI不用再心算这道计算题，只管拿来判断吉凶措辞。
// 再后续追加：进退神（进退神）——computeJinTuiShen早就算好了，但一直漏了拼进这里，导致
// 提示词里说"进退神已经算好标注给你"其实是句空话，AI要么看不到、要么只能自己心算，
// 跟当初做computeJinTuiShen就是为了不让AI心算这道题的初衷正好相反，这次一并补上。
// 老数据（这次更新前保存的历史记录/未刷新完的会话）没有这几个字段，`ln.月令`等取到的是
// undefined，下面用 `|| ''` 兜底成空字符串，不会输出"undefined"，只是那几项标注缺失。
// castData.overallTrendText同理：新算的卦才有，没有就不拼这一段，不强行补数据。
function formatCastDataForAI(castData){
  const linesText = castData.lines.map(ln => {
    let tag = '';
    if(ln.是否动爻) tag += '【动爻】';
    if(ln.是否世爻) tag += '【世爻】';
    if(ln.是否应爻) tag += '【应爻】';
    if(ln.是否空亡) tag += '【空亡】';
    let extra = '';
    if(ln.月令) extra += `, 月令=${ln.月令}`;
    if(ln.日辰关系) extra += `, 日辰=${ln.日辰关系}`;
    if(ln.是否动爻 && ln.变纳甲) extra += `, 变出=${ln.变纳甲}(${ln.变五行})${ln.变六亲}`;
    if(ln.是否动爻 && ln.进退神) extra += `, ${ln.进退神}`;
    if(ln.是否动爻 && ln.回头) extra += `, ${ln.回头}`;
    if(ln.伏神六亲) extra += `, 伏神=${ln.伏神六亲} ${ln.伏神纳甲}(${ln.伏神五行})`;
    if(ln.伏神与飞神关系) extra += `(${ln.伏神与飞神关系})`;
    return `${ln.爻位}: 六亲=${ln.六亲}, 六神=${ln.六神}, 纳甲=${ln.纳甲}, 五行=${ln.五行}, 状态=${ln.状态}${tag}${extra}`;
  }).join('\n');
  const sourceText = castData.source === 'manual'
    ? '起卦方式：提问者本人现实中线下摇卦（铜钱或其他方式），结果由本人手动录入系统，六爻老少阴阳均为真实所得，并非网页随机生成。'
    : castData.source === 'physics' ? '起卦方式：由用户操作驱动的网页刚体物理模拟，读取铜钱落地姿态，连续投掷六次；并非现实铜钱或随机数取值。' : '起卦方式：旧版网页随机摇卦生成。';
  // 卦名（本卦/变卦的六十四卦标准卦名，如"地水师""水火既济"）：之前只在页面上展示、
  // 没有拼进发给AI的文本里，AI拿到的只有"坎宫·二世卦"这类宫位信息和拆开的上下卦（坎/坤），
  // 从没见过合起来的完整卦名。六爻断卦的主要依据确实是六亲/世应/纳甲/动变而不是卦名本身，
  // 但卦名是解卦回复里"这一卦是什么卦"的常规交代，古籍（比如"地水师"卦辞、大象）也常按卦名
  // 整体取象，缺了这行AI就只能回避不提、或者自己瞎编一个卦名，都不合适，这里补上。
  const guaNameText = `本卦：${castData.guaName || ''}` + (castData.bianGuaName ? `　变卦：${castData.bianGuaName}` : '');
  const trendText = castData.overallTrendText ? `\n\n证据速览（月令旺衰/回头生克/世应生克的收敛度参考，不是吉凶结论）：${castData.overallTrendText}` : '';
  return `${sourceText}\n${guaNameText}\n${castData.palaceText}\n${castData.lowerUpperText}\n${pillarsAndKongText(castData)}\n\n` +
    `各爻明细（从初爻到上爻，六亲/世应/空亡已由系统自动标注）：\n${linesText}${trendText}`;
}

export { pillarsAndKongText, formatCastDataForAI };
