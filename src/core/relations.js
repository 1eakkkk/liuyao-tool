import { SHENG, KE, JIN_SHEN_PAIRS, TUI_SHEN_PAIRS, SEASON_BY_BRANCH, YUELING_TABLE, LIUHE_PAIR, LIUCHONG_PAIR } from './constants.js';



/* ---------------- six relatives ---------------- */
function sixRelative(lineEl, palaceEl){
  if(lineEl===palaceEl) return '兄弟';
  if(SHENG[lineEl]===palaceEl) return '父母';
  if(SHENG[palaceEl]===lineEl) return '子孙';
  if(KE[lineEl]===palaceEl) return '官鬼';
  if(KE[palaceEl]===lineEl) return '妻财';
  return '－';
}

function computeJinTuiShen(fromBranch, toBranch){
  if(!fromBranch || !toBranch || fromBranch === toBranch) return '';
  if(JIN_SHEN_PAIRS[fromBranch] === toBranch) return '进神';
  if(TUI_SHEN_PAIRS[fromBranch] === toBranch) return '退神';
  return ''; // 未命中本版采用的进退神对，不预判
}

// 月令旺衰：只看"月建地支属于哪个季节"+"这一爻的五行"两个输入，跟断卦参考表里
// 给人/给AI看的那份旺相休囚死表是同一套数据，这里做成可以直接查表返回的函数。
function getYuelingState(monthBranch, element){
  const season = SEASON_BY_BRANCH[monthBranch];
  return (season && YUELING_TABLE[season][element]) || '';
}

function getDayRelation(lineBranch, dayBranch){
  if(!lineBranch || !dayBranch) return '';
  if(LIUHE_PAIR[lineBranch] === dayBranch) return '日辰合';
  if(LIUCHONG_PAIR[lineBranch] === dayBranch) return '日辰冲';
  return '';
}

// 回头生/回头克：动爻变出的五行反过来生或克本爻原来的五行，双方都是排盘里现成的
// 五行字段，直接套五行生克表比对，跟旺衰/合冲那种需要额外语境判断的东西不是一回事。
function getHuitouRelation(lineEl, bianEl){
  if(!lineEl || !bianEl || lineEl === bianEl) return '';
  if(SHENG[bianEl] === lineEl) return '回头生';
  if(KE[bianEl] === lineEl) return '回头克';
  return '';
}

// 世应生克：世爻代表求测人自己，应爻代表对方/所测之事，两者五行间的生克关系，
// 是判断"这件事/这段关系"走向的通用维度，不依赖具体问题选的是哪个用神。
function getShiYingRelation(shiEl, yingEl){
  if(!shiEl || !yingEl) return '';
  if(shiEl === yingEl) return '世应比和';
  if(SHENG[shiEl] === yingEl) return '世生应';
  if(SHENG[yingEl] === shiEl) return '应生世';
  if(KE[shiEl] === yingEl) return '世克应';
  if(KE[yingEl] === shiEl) return '应克世';
  return '';
}

// 飞神对伏神的生克：伏神能不能"出伏"发挥作用，历代说法还涉及月破/空亡/逢冲等更复杂
// 且各家不完全一致的条件（跟进退神在辰戌丑未组合时留空是同一道理），这里只判定
// "飞神生/克伏神"这一层纯五行关系，不越界替AI判定"是否出伏"这类有分歧的结论。
function getFeishenFushenRelation(feishenEl, fushenEl){
  if(!feishenEl || !fushenEl) return '';
  if(feishenEl === fushenEl) return '飞伏比和';
  if(SHENG[feishenEl] === fushenEl) return '飞神生伏神';
  if(SHENG[fushenEl] === feishenEl) return '伏神生飞神';
  if(KE[feishenEl] === fushenEl) return '飞神克伏神';
  if(KE[fushenEl] === feishenEl) return '伏神克飞神';
  return '';
}

export { sixRelative, computeJinTuiShen, getYuelingState, getDayRelation, getHuitouRelation, getShiYingRelation, getFeishenFushenRelation };
