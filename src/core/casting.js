import { sixRelative, computeJinTuiShen, getYuelingState, getDayRelation, getHuitouRelation, getShiYingRelation, getFeishenFushenRelation } from './relations.js';
import { NAJIA, BRANCH_EL, SIX_SPIRITS, TRIGRAM_BY_KEY, EIGHT_PALACE_MAP, STEM_SPIRIT_GROUP, KONG_PAIRS } from './constants.js';



function calculateCast(lines, source, calendar, daySelectionMode){
  if(!Array.isArray(lines)||lines.length!==6||lines.some(l=>!l||![6,7,8,9].includes(l.sum)||l.yang!==[7,9].includes(l.sum)||l.moving!==[6,9].includes(l.sum)))throw new Error('六爻数据不完整或阴阳动静不一致');
  const lowerKey = lines.slice(0,3).map(l=>l.yang?'1':'0').join('');
  const upperKey = lines.slice(3,6).map(l=>l.yang?'1':'0').join('');
  const lower = TRIGRAM_BY_KEY[lowerKey];
  const upper = TRIGRAM_BY_KEY[upperKey];
  const palaceInfo = EIGHT_PALACE_MAP[lowerKey+upperKey];

  const {now,day,ymh,dateText}=calendar;
  const startSpirit = STEM_SPIRIT_GROUP[day.stem];
  const kongBranches = KONG_PAIRS[day.kongGroup];
  const fourPillarsText = `年柱：${ymh.yearLabel}　月柱：${ymh.monthLabel}　日柱：${day.label}　时柱：${ymh.hourLabel}`;
  const kongText = `空亡：${kongBranches.join('、')}`;

  // ---- 卦名 / 变卦：这里提到最前面统一算好（原来只在展示卦名那一步临时算，现在
  // "动爻变出的干支/六亲"这一列也要用同一份变卦上下卦信息，两处共用，不重复算一遍）----
  const guaName = palaceInfo.name;
  const hasMoving = lines.some(l => l.moving);
  const bianLowerKey = lines.slice(0,3).map(l => (l.moving ? !l.yang : l.yang) ? '1':'0').join('');
  const bianUpperKey = lines.slice(3,6).map(l => (l.moving ? !l.yang : l.yang) ? '1':'0').join('');
  const bianLowerTrig = TRIGRAM_BY_KEY[bianLowerKey];
  const bianUpperTrig = TRIGRAM_BY_KEY[bianUpperKey];
  const bianInfo = hasMoving ? EIGHT_PALACE_MAP[bianLowerKey+bianUpperKey] : null;
  const bianGuaName = bianInfo ? bianInfo.name : null;

  // ---- 伏神：本宫首卦（八纯卦，比如乾宫首卦就是"乾为天"）六个爻位各自对应的六亲，
  // 跟当前这一卦六爻实际排出来的六亲比对，父母/兄弟/子孙/妻财/官鬼里缺了哪个，就去首卦
  // 同一爻位借那个爻的干支叠在当前爻（飞神）下面，叫"伏神"——爻位跟首卦保持一致，
  // 因为伏神本来就是"寄居"在当前卦对应爻位下面，不是另找位置。----
  const seedName = palaceInfo.palace.slice(0, -1); // "乾宫"→"乾"
  const pureLiuqinByPos = [];
  for(let pos=0; pos<6; pos++){
    const isLower = pos < 3;
    const ganzhi = isLower ? NAJIA[seedName].inner[pos] : NAJIA[seedName].outer[pos-3];
    const branchEl = BRANCH_EL[ganzhi[1]];
    pureLiuqinByPos.push({ ganzhi, branchEl, liuqin: sixRelative(branchEl, palaceInfo.element) });
  }

  // ---- 先按初爻(0)→上爻(5)把每一爻的飞神数据都算好，再倒序拼表格：
  // 伏神要先知道"当前卦六爻实际六亲的完整集合"才能判断缺了哪个，所以不能再像原来那样
  // 边算边从上往下拼字符串，得先算完整卦六爻再统一比对。----
  const ALL_LIUQIN = ['父母','兄弟','子孙','妻财','官鬼'];
  // 月建、日辰的地支——月令旺衰只看季节（由月建地支决定），日辰合冲只看地支本身，
  // 两者都已经在上面算好的ymh/day里现成拿到，不需要另外反查。
  const monthBranch = ymh.monthLabel.slice(-1);
  const dayBranch = day.label.slice(-1);
  const lineData = [];
  for(let pos=0; pos<6; pos++){
    const l = lines[pos];
    const lineNum = pos+1;
    const isLower = pos < 3;
    const trig = isLower ? lower : upper;
    const ganzhi = isLower ? NAJIA[trig.name].inner[pos] : NAJIA[trig.name].outer[pos-3];
    const stem = ganzhi[0], branch = ganzhi[1];
    const branchEl = BRANCH_EL[branch];
    const spirit = SIX_SPIRITS[(startSpirit + pos) % 6];
    const liuqin = sixRelative(branchEl, palaceInfo.element);
    const isWorld = lineNum === palaceInfo.world;
    const isResponse = lineNum === palaceInfo.response;
    const isKong = kongBranches.includes(branch);
    // 月令旺衰/日辰合冲：见 getYuelingState/getDayRelation 上方注释，纯查表型计算，
    // 跟六亲、纳甲一样属于"有唯一答案、代码直接算好给AI"的部分。
    const yueling = getYuelingState(monthBranch, branchEl);
    const dayRelation = getDayRelation(branch, dayBranch);

    // 动爻变出的干支/六亲：只有动爻才有。这一爻变了之后，它所在的那组（上卦或下卦）
    // 三根线的阴阳组合变成了另一个八卦（bianLowerTrig/bianUpperTrig），要按新八卦
    // 同一爻位的纳甲表去查变出来的干支；但六亲判断的锚点仍是"本卦"的宫五行不换——
    // 变爻六亲说的是"这个位置的六亲变成了什么"，参照系还是本卦，不重新按变卦的宫论。
    let bianGanzhi = '', bianBranchEl = '', bianLiuqin = '', jinTuiShen = '', huitou = '';
    if(l.moving && bianInfo){
      const bianTrig = isLower ? bianLowerTrig : bianUpperTrig;
      bianGanzhi = isLower ? NAJIA[bianTrig.name].inner[pos] : NAJIA[bianTrig.name].outer[pos-3];
      bianBranchEl = BRANCH_EL[bianGanzhi[1]];
      bianLiuqin = sixRelative(bianBranchEl, palaceInfo.element);
      jinTuiShen = computeJinTuiShen(branch, bianGanzhi[1]); // 进退神预计算，见 computeJinTuiShen 上方注释
      huitou = getHuitouRelation(branchEl, bianBranchEl); // 回头生克预计算，见 getHuitouRelation 上方注释
    }

    lineData.push({ pos, lineNum, l, stem, branch, branchEl, spirit, liuqin, isWorld, isResponse, isKong, bianGanzhi, bianBranchEl, bianLiuqin, jinTuiShen, huitou, yueling, dayRelation });
  }

  const presentLiuqin = new Set(lineData.map(d => d.liuqin));
  const missingLiuqin = ALL_LIUQIN.filter(x => !presentLiuqin.has(x));
  lineData.forEach(d => {
    const pureAtPos = pureLiuqinByPos[d.pos];
    d.fushen = missingLiuqin.includes(pureAtPos.liuqin) ? pureAtPos : null;
    // 飞神（本爻）对伏神的生克关系，见 getFeishenFushenRelation 上方注释。
    if(d.fushen){
      d.fushen.feishenRelation = getFeishenFushenRelation(d.branchEl, d.fushen.branchEl);
    }
  });
  // 世应生克：世爻/应爻各自是哪一条，palaceInfo.world/response已经标出，这里直接找到
  // 对应的lineData取五行来比对，不依赖具体问的是哪件事、选的是哪个用神。
  const shiLineData = lineData.find(d => d.isWorld);
  const yingLineData = lineData.find(d => d.isResponse);
  const shiYingRelation = (shiLineData && yingLineData)
    ? getShiYingRelation(shiLineData.branchEl, yingLineData.branchEl) : '';

  const structuredLines = [];
  for(let pos=5; pos>=0; pos--){
    const d = lineData[pos];
    const { l, lineNum, stem, branch, branchEl, spirit, liuqin, isWorld, isResponse, isKong, bianGanzhi, bianBranchEl, bianLiuqin, jinTuiShen, huitou, yueling, dayRelation, fushen } = d;
    const stateText = l.moving ? (l.yang?'老阳→变阴':'老阴→变阳') : (l.yang?'少阳':'少阴');
    structuredLines.push({
      爻位: `${lineNum}爻`, 六亲: liuqin, 六神: spirit,
      纳甲: `${stem}${branch}`, 五行: branchEl, 状态: stateText,
      是否动爻: l.moving, 是否世爻: isWorld, 是否应爻: isResponse, 是否空亡: isKong,
      变纳甲: l.moving ? bianGanzhi : '', 变五行: l.moving ? bianBranchEl : '', 变六亲: l.moving ? bianLiuqin : '',
      伏神六亲: fushen ? fushen.liuqin : '', 伏神纳甲: fushen ? fushen.ganzhi : '', 伏神五行: fushen ? fushen.branchEl : '',
      月令: yueling || '', 日辰关系: dayRelation || '',
      回头: l.moving ? (huitou || '') : '',
      // 进退神：computeJinTuiShen 早就在上面算好存进了jinTuiShen变量，但此前一直漏了拼进
      // structuredLines——等于伏神/回头生克之前那次同样的疏漏又在进退神这里重演了一遍：
      // AI提示词明明告诉AI"进退神已经算好直接标注给你、不用自己重算"，实际数据里却根本
      // 没有这个字段，AI要么看不到、要么只能靠本爻变爻地支自己现猜，跟最初设计
      // computeJinTuiShen就是为了不让AI自己心算这道题的初衷正好相反。这里补上，跟回头字段
      // 同样只在动爻才有值。
      进退神: l.moving ? (jinTuiShen || '') : '',
      伏神与飞神关系: fushen ? (fushen.feishenRelation || '') : '',
    })
  }
  structuredLines.reverse();
  // ---- 整体旺衰气象摘要：不针对具体某个用神（用神选择依赖对问题文本的语义理解，
  // 是AI的判断题，代码不该越俎代庖去猜），只客观统计"当令得力(旺/相)"与"当令减力
  // (休/囚/死)"的爻数、动爻里"回头生"与"回头克"的个数——这两类是唯一、没有分歧的
  // 五行数学关系，用来给AI（以及用户）一个证据层面的收敛度参考：这一卦整体是偏旺、
  // 偏衰，还是旺衰参半、需要仔细看用神；不越界替AI下"吉凶"结论。
  const yuelingStrongCount = lineData.filter(d => d.yueling === '旺' || d.yueling === '相').length;
  const yuelingWeakCount = lineData.filter(d => d.yueling === '休' || d.yueling === '囚' || d.yueling === '死').length;
  const huitouShengCount = lineData.filter(d => d.huitou === '回头生').length;
  const huitouKeCount = lineData.filter(d => d.huitou === '回头克').length;
  let overallTrendText = `当令得力(旺/相)${yuelingStrongCount}爻、当令减力(休/囚/死)${yuelingWeakCount}爻`;
  if(huitouShengCount || huitouKeCount){
    overallTrendText += `；动爻回头生${huitouShengCount}个、回头克${huitouKeCount}个`;
  }
  if(shiYingRelation){
    overallTrendText += `；世应：${shiYingRelation}`;
  }
  const strongLean = yuelingStrongCount - yuelingWeakCount;
  if(Math.abs(strongLean) >= 3){
    overallTrendText += strongLean > 0 ? '——整体当令气象偏旺，迹象比较集中' : '——整体当令气象偏弱，迹象比较集中';
  } else {
    overallTrendText += '——当令得力与减力的爻数相当，旺衰不算悬殊，具体判断还要结合用神细看';
  }

  const palaceText = `${palaceInfo.palace} · ${palaceInfo.type}卦（本宫五行：${palaceInfo.element}）`;
  const lowerUpperText = `下卦：${lower.sym} ${lower.name}　上卦：${upper.sym} ${upper.name}`;
  const dayKongText = `日柱：${day.label}　空亡：${kongBranches.join('、')}`;
  const cast = {
    ganzhi: day.label,
    yearGanzhi: ymh.yearLabel, monthGanzhi: ymh.monthLabel, hourGanzhi: ymh.hourLabel,
    fourPillarsText, kongText, dateText,
    palaceText, lowerUpperText, dayKongText,
    lines: structuredLines,
    guaName, bianGuaName,
    source, // physics=物理模拟；system=旧版随机；manual=线下录入
    rulesVersion:'2026-09-15-2', coinConvention:source==='physics'?'字2背3':null,
    castAnchorY: daySelectionMode==='manual'?null:now.getFullYear(), castAnchorM: daySelectionMode==='manual'?null:now.getMonth()+1, castAnchorD: daySelectionMode==='manual'?null:now.getDate(),
    overallTrendText,
  };
  return {cast, lineData};
}

export { calculateCast };
