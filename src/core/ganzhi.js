import { STEMS, BRANCHES12, JIE_BRANCHES_FROM_LICHUN } from './constants.js';



// ---- 自动选中今天的日柱（对应桌面版 ganzhi.py 的算法，用同一批日期校准过）----
function getTodayJiaziIndex(date = new Date()){
  const daysSinceEpoch = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const OFFSET = 17; // 校准过：2026-07-25→庚子(36)、07-26→辛丑(37)、07-27→壬寅(38)
  return ((daysSinceEpoch + OFFSET) % 60 + 60) % 60;
}

// 2) 从某个"起卦锚点日"（真实公历日期）开始，往后找第一个干支下标等于targetIndex的那天。
//    直接复用getTodayJiaziIndex()逐天试算，而不是自己另写一套模运算——干支和日期的对应关系
//    只有这一份代码在算，"今日日柱""按日期反查日柱""干支日应期换算"三处用的是同一个函数，
//    不会因为分别抄一遍公式而互相走漏、算出两个不一致的结果。60甲子每60天必然轮完一圈，
//    所以最多找60天一定能命中，理论上不会落空。
function findNextDateForGanzhiIndex(anchorDate, targetIndex){
  for(let offset = 0; offset < 60; offset++){
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate() + offset);
    if(getTodayJiaziIndex(d) === targetIndex) return d;
  }
  return null; // 防御性兜底，正常不会走到这里
}

/* ==================================================================
   年月时柱（干支）：配合上面的日柱下拉框，一起凑成"年月日时"四柱。
   日柱本来就有下拉框可以手动改成任意一天（用来复原线下摇卦发生的那天）；
   年柱、月柱、时柱这里改成完全按"起卦这一刻的系统时间"现算，不跟着日柱下拉框联动——
   一来年月柱变化很慢（一年一变 / 一个节气一变），二来如果日柱被手动改成了别的日子，
   非要联动着去反推那天对应的年月时柱，反而容易算错、也偏离了这三柱在这里的用途：
   六爻真正要用的只有日柱（起六神、算空亡），年月日时四柱只是给用户/AI看的一份
   "起卦时刻"参考信息，写法上贴近网上解卦博主发帖时惯常带的那行"公历/干支"。

   月柱、年柱的边界严格来说都不是按固定公历日期走的，是按"节气"走的（准确说是
   十二个"节"，不含"气"）——原来用固定日期近似表（比如立春按2/4）多数年份是准的，
   但节气本身每年在公历上会前后浮动一两天，边界年份就可能被近似表判错。比如
   2025年"立春"实际发生在2月3日22点多（北京时间），比常见的"2/4"早了一天多，
   2月3日晚上起卦就会被近似表误判成还在上一个月柱、上一个年柱。
   这里换成直接计算太阳视黄经（apparent ecliptic longitude）来判定节气边界，不再
   查近似表：太阳视黄经每年绕一圈360°，"节"（不算"气"）固定卡在315°/345°/15°/
   45°...每隔30°一个，谁跨过这些刻度线谁就换月柱；315°这个刻度（立春）额外兼任
   年柱的分界。算法用天文测算里通行的低精度太阳坐标公式（Meeus《Astronomical
   Algorithms》第25章的简化版本：平黄经+几项周期修正项，精度约0.01°，换算成时间
   误差通常在几分钟以内，不宜作为交节瞬间的精确判据），只是三角函数和多项式运算，
   不依赖外部天文库/网络请求/逐年数据表，符合本项目"零依赖单文件"的约束。
   ================================================================== */
// 儒略日（Julian Day）：date.getTime()本身就是UTC毫秒数，天然已经按时区换算好，
// 不需要再手动处理时区偏移。
function julianDay(date){
  return date.getTime() / 86400000 + 2440587.5;
}

// 太阳视黄经（0°~360°），Meeus低精度公式：平黄经 + 中心差修正 + 章动/光行差修正，
// T是从J2000.0起算的儒略世纪数。精度约0.01°（对应约几分钟的时间误差），
// 交节前后数分钟可能出现差异，应核对权威历书。
function sunApparentLongitude(date){
  const jd = julianDay(date);
  const T = (jd - 2451545.0) / 36525;
  const rad = Math.PI / 180;
  const L0 = 280.46646 + 36000.76983*T + 0.0003032*T*T;      // 太阳平黄经
  const M  = 357.52911 + 35999.05029*T - 0.0001537*T*T;      // 平近点角
  const Mr = M * rad;
  const C = (1.914602 - 0.004817*T - 0.000014*T*T) * Math.sin(Mr)
          + (0.019993 - 0.000101*T) * Math.sin(2*Mr)
          + 0.000289 * Math.sin(3*Mr);                       // 中心差
  const trueLong = L0 + C;
  const Omega = 125.04 - 1934.136*T;
  const apparentLong = trueLong - 0.00569 - 0.00478*Math.sin(Omega*rad); // 章动+光行差修正
  return ((apparentLong % 360) + 360) % 360;
}

function getSolarMonthBranch(date){
  const lon = sunApparentLongitude(date);
  const idx = Math.floor((((lon - 315) % 360) + 360) % 360 / 30);
  return JIE_BRANCHES_FROM_LICHUN[idx];
}

// 年柱以立春换年：公历年初的子月和丑月均需沿用上一年。
function getYearPillar(date){
  const lon = sunApparentLongitude(date);
  const idx = Math.floor((((lon - 315) % 360) + 360) % 360 / 30);
  const beforeLichun = date.getMonth() < 2 && (idx === 10 || idx === 11);
  const y = date.getFullYear() - (beforeLichun ? 1 : 0);
  const gzIdx = ((y-4)%60+60)%60;
  return { stemIdx: gzIdx%10, label: STEMS[gzIdx%10]+BRANCHES12[gzIdx%12] };
}

// 五虎遁：由年干推月干（寅月起）。口诀"甲己丙寅头/乙庚戊寅头/丙辛庚寅头/丁壬壬寅头/戊癸甲寅头"，
// 换算成STEMS数组下标就是 (年干下标%5)*2+2 = 寅月天干下标，其余月依次顺推。
function getMonthPillar(date, yearStemIdx){
  const branch = getSolarMonthBranch(date);
  const offsetFromYin = (BRANCHES12.indexOf(branch) - 2 + 12) % 12; // 寅=0，往后顺数
  const startStemIdx = ((yearStemIdx % 5) * 2 + 2) % 10;
  return { label: STEMS[(startStemIdx + offsetFromYin) % 10] + branch };
}

function hourBranchOf(hour){
  if(hour===23 || hour===0) return '子';
  if(hour>=1  && hour<3)  return '丑';
  if(hour>=3  && hour<5)  return '寅';
  if(hour>=5  && hour<7)  return '卯';
  if(hour>=7  && hour<9)  return '辰';
  if(hour>=9  && hour<11) return '巳';
  if(hour>=11 && hour<13) return '午';
  if(hour>=13 && hour<15) return '未';
  if(hour>=15 && hour<17) return '申';
  if(hour>=17 && hour<19) return '酉';
  if(hour>=19 && hour<21) return '戌';
  return '亥'; // 21-23点
}

// 五鼠遁：由日干推时干（子时起）。口诀"甲己还加甲/乙庚丙作初/丙辛从戊起/丁壬庚子居/戊癸壬子是真途"，
// 换算成STEMS数组下标就是 (日干下标%5)*2 = 子时天干下标，其余时辰依次顺推。
function getHourPillar(date, dayStemIdx){
  const branch = hourBranchOf(date.getHours());
  const startStemIdx = ((dayStemIdx % 5) * 2) % 10;
  return { label: STEMS[(startStemIdx + BRANCHES12.indexOf(branch)) % 10] + branch };
}

// 拼出这次起卦要用的"年柱/月柱/时柱"（日柱沿用调用方已经选好的日柱，这里不重复算）。
// now 可选传入：调用方（renderPlate）如果同一时刻还要用这个 Date 对象去生成"公历/农历"日期显示，
// 就传进来共用同一个 Date，避免这里再 new 一次跟外面差几毫秒（虽然基本不影响年月日，但没必要）。
function buildYearMonthHourPillars(dayStem, now = new Date()){
  const year = getYearPillar(now);
  const month = getMonthPillar(now, year.stemIdx);
  const hour = getHourPillar(now, STEMS.indexOf(dayStem));
  return { yearLabel: year.label, monthLabel: month.label, hourLabel: hour.label };
}

/* ==================================================================
   公历/农历日期显示：跟上面的年月日时干支是两码事——干支是给六爻/八字用的，
   这里是给人看的"今天到底是哪年哪月哪日"，公历、农历都要写到"年"这一级，
   避免年底年初跨农历新年那几天，只写"腊月廿三"分不清是去年还是今年。
   农历换算不自己维护一份"每年月份天数+闰月"的老黄历表（那类表格手抄极易抄错、
   错了还不容易发现），改用浏览器自带的 Intl 农历（Chinese calendar，ICU 提供）现算，
   数据来源和公历一样准。少数很老的浏览器可能不认"chinese"这个日历，
   那种情况下 getLunarDateText 会捕获异常返回空字符串，只显示公历、不硬凑农历。
   ================================================================== */
function formatGregorianText(date){
  return `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日`;
}

// 农历初一到三十的传统写法：初一~初十、十一~十九、二十、廿一~廿九、三十。
function lunarDayCn(d){
  const digit = ['','一','二','三','四','五','六','七','八','九','十'];
  if(d===10) return '初十';
  if(d===20) return '二十';
  if(d===30) return '三十';
  if(d<10) return '初'+digit[d];
  if(d<20) return '十'+digit[d-10];
  return '廿'+digit[d-20];
}

function getLunarDateText(date){
  try{
    // 用 formatToParts 而不是拼好的字符串，是因为要拿到 relatedYear（这个农历年"挂"在
    // 哪个公历年上）和月份原始代码（比如"Mo7"、闰月是"Mo11bis"），自己拼中文，
    // 不依赖某个语言环境刚好把格式拼成我们想要的样子。
    // era:'short' 这个选项必须带上——不带的话月份只会给"7"这种纯数字，看不出是不是闰月；
    // 带上之后才会给"Mo7"/闰月"Mo11bis"这种带闰月标记的代码，下面靠这个代码判断是否闰月。
    const parts = new Intl.DateTimeFormat('en-u-ca-chinese', {year:'numeric', month:'numeric', day:'numeric', era:'short'}).formatToParts(date);
    const monthRaw = parts.find(p=>p.type==='month')?.value || '';
    const dayRaw = parts.find(p=>p.type==='day')?.value || '';
    const relatedYearRaw = parts.find(p=>p.type==='relatedYear')?.value || parts.find(p=>p.type==='year')?.value || '';
    const m = monthRaw.match(/^Mo(\d+)(bis)?$/i);
    const monthNum = m ? parseInt(m[1],10) : NaN;
    const isLeap = !!(m && m[2]);
    const dayNum = parseInt(dayRaw,10);
    const relatedYear = parseInt(relatedYearRaw,10);
    if(!monthNum || !dayNum || !relatedYear) return '';
    // 农历年份的干支纪年在这里按"农历新年"换年（跟公历年不是同一天切换），
    // 用的还是 STEMS/BRANCHES12 那套六十甲子，只是换年时间点不同于八字用的"立春"（getYearPillar）。
    const yearIdx = ((relatedYear-4)%60+60)%60;
    const yearGanzhi = STEMS[yearIdx%10] + BRANCHES12[yearIdx%12];
    const monthNames = ['','正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
    const monthText = (isLeap?'闰':'') + (monthNames[monthNum] || `${monthNum}月`);
    return `农历：${yearGanzhi}年${monthText}${lunarDayCn(dayNum)}`;
  }catch(e){
    return ''; // 极少数不支持"chinese"日历的浏览器，就只显示公历，不强行拼农历
  }
}

// 拼出"公历：X年X月X日　农历：干支年X月X日"这一整行，起卦当下排盘区、历史记录回看两处共用。
function buildDateDisplayText(date){
  const solarText = `公历：${formatGregorianText(date)}`;
  const lunarText = getLunarDateText(date);
  return lunarText ? `${solarText}　${lunarText}` : solarText;
}

export { getTodayJiaziIndex, findNextDateForGanzhiIndex, julianDay, sunApparentLongitude, getSolarMonthBranch, getYearPillar, getMonthPillar, hourBranchOf, getHourPillar, buildYearMonthHourPillars, formatGregorianText, lunarDayCn, getLunarDateText, buildDateDisplayText };
