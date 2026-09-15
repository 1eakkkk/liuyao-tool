import { SHICHEN_HOUR_MAP, JIAZI60_LABELS_REGEX } from './config.js';
import { findNextDateForGanzhiIndex } from '../core/ganzhi.js';
import { JIAZI60_INDEX_BY_LABEL } from '../core/constants.js';


function annotateShichen(text){
  return text.replace(/([子丑寅卯辰巳午未申酉戌亥])时(?!（)/g, (matched, branch) => {
    const range = SHICHEN_HOUR_MAP[branch];
    return range ? `${matched}（${range}）` : matched;
  });
}

function annotateGanzhiDay(text){
  const castData = window.lastCastData;
  // 没有起卦锚点（还没摇过卦，或者老会话数据缺这个字段又没能在恢复时补上）就没法换算，原样返回，
  // 不强行拿"今天"瞎凑——那样算出来的日期跟这一卦的真实应期毫无关系，比不标更误导人。
  if(!castData || !castData.castAnchorY) return text;
  const anchorDate = new Date(castData.castAnchorY, castData.castAnchorM - 1, castData.castAnchorD);
  return text.replace(JIAZI60_LABELS_REGEX, (matched, label) => {
    const targetIndex = JIAZI60_INDEX_BY_LABEL[label];
    const hit = findNextDateForGanzhiIndex(anchorDate, targetIndex);
    if(!hit) return matched;
    const dateStr = (hit.getFullYear() === anchorDate.getFullYear())
      ? `${hit.getMonth()+1}月${hit.getDate()}日`
      : `${hit.getFullYear()}年${hit.getMonth()+1}月${hit.getDate()}日`;
    return `${matched}（${dateStr}）`;
  });
}


// ---- 把"时辰要带现代小时括注"这条规则从纯客户端后处理，上移一份到系统提示词里让AI自己输出。
// 背景：这条规则原来只活在 annotateShichen() 里，"AI 解读"路径靠这道后处理兜底还能看到括注，
// 但"输出提示词"路径（buildExportPromptText）没有任何后处理，AI 不知道这条规则的话，括注
// 就会直接消失。这里直接复用 SHICHEN_HOUR_MAP 生成对照表文本塞进规则里，两条路径都能覆盖，
// 且对照表只有这一份数据源，不会因为手动抄一遍而和 annotateShichen 的映射表逐渐抄漏、抄错。
function buildShichenRuleText(){
  const pairs = Object.entries(SHICHEN_HOUR_MAP).map(([branch, range]) => `${branch}时（${range}）`).join('、');
  return `文中每次出现十二时辰（子丑寅卯辰巳午未申酉戌亥+"时"），一律在其后用中文括号标注对应的现代24小时制时间区间，对照如下：${pairs}。`;
}


// ---- 干支日的规则跟时辰正好相反：时辰是个固定对照表，AI照抄基本不会错，所以上面
// buildShichenRuleText是"请你标注"；但干支日对应哪个具体公历日期，是从起卦日开始的
// 六十甲子模运算，AI心算极不可靠，间隔一长就容易错，还照样一本正经甩出一个日期——
// 所以这条规则反过来是"不要自己算、不要自己编"，把这件事完全留给本地代码
// （annotateGanzhiDay）去做。这条规则还有一个本地代码逻辑上必须依赖它的理由：
// annotateGanzhiDay判断"是否已经标注过"用的办法是看干支后面是不是已经跟着一个中文括号，
// 如果AI自己先编了一个（哪怕是错的）日期塞进括号里，本地代码会误以为"已经标注过了"而跳过、
// 不会去覆盖修正——这条禁止规则同时也是在保护本地换算不被AI自己的错误猜测顶替掉。
function buildGanzhiDayRuleText(){
  return `文中提到具体的干支日（如"丙戌日""甲子日"）时，只需要照常给出这个干支本身，` +
    `绝对不要自己换算、推测或编造它对应的具体公历日期，也不要在干支后面自行加中文括号标注日期——` +
    `干支到公历日期的换算需要精确的六十甲子模运算，你很容易算错却看不出来，这部分完全由系统的本地代码在你的回复之后自动算好并追加，不用你操心，也不许你抢先编一个。`;
}


// ---- 对应 ai_interpret.py: strip_markdown ----
function stripMarkdown(text){
  return text
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '· ')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export { annotateShichen, annotateGanzhiDay, buildShichenRuleText, buildGanzhiDayRuleText, stripMarkdown };
