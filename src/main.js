
/* ==================================================================
  ③ 逻辑区目录（按出现顺序，各节都有同款横幅注释可搜索跳转）：

  【界面基础】
  tabs 标签切换（role="tablist"/"tab"/"tabpanel"，含左右方向键/Home/End 导航与
  roving tabindex）→ bagua grid 八卦卡片渲染 → wuxing wheel 五行轮盘交互

  【排盘核心（纯数据与算法，与界面无关，最值得测试的部分）】
  najia data 纳甲表/地支五行/六神 → eight-palace 八宫64卦生成（世应位）
  → six relatives 六亲判定 → 60 jiazi / kongwang 六十甲子与空亡
  → getTodayJiaziIndex 今日日柱推算

  【摇卦规则与流程】
  生死寿数问题过滤 → safeSetItem/safeRemoveItem 安全本地存储写入（localStorage
  失败时走 toast 提示，所有用户直接触发的设置写入都走这一层）
  → 摇卦前置校验（一事一挂 + 10分钟频率限制，normQuestion 问题归一化）
  → caster 系统摇卦 → 线下摇卦手动填入（含"修正录入不算重摇"特例）
  → renderPlate 排盘渲染与结构化数据（lastCastData/lastCastQuestion/lastCastTime）

  【通用UI】
  Toast 提示 → 弹层焦点管理工具（getFocusableIn/trapTabKey，Tab循环限制在弹层内，
  showConfirm 和新手教程弹层共用）→ 通用确认弹层 showConfirm（默认焦点在"取消"，
  关闭后焦点还原）→ 新手教程弹层（打开自动聚焦"知道了"，Esc/点击遮罩关闭）

  【AI 解卦】
  ROLE_PRESETS 角色设定 / REPLY_STYLE_PRESETS 回复风格 / PRICE_TABLES 计费单价（分模型）
  → localStorage 键管理（Key/风格/历史）→ stripMarkdown → buildSystemPrompt 系统提示词
  → formatCastDataForAI 排盘转文本 → buildExportPromptText 提示词导出文本（不经API Key）
  → interpretWithDeepSeek 调用API与计费估算
  → UI绑定：Key打码管理（含 interpretBtn 按需显隐）/ 历史记录与累计统计
  → interpretBtn 主流程（含：问题认领10分钟时效 → 判断是否重摇 → 调AI → 写历史）
  → promptBtn 提示词导出主流程（复用同一套问题认领/重摇判断，但不调API、不写历史）
================================================================== */
/* ---------------- 折叠区块：进阶/参考内容默认收起，点标题展开 ---------------- */
document.querySelectorAll('section.block-collapse').forEach(sec=>{
  const h2 = sec.querySelector('h2');
  const hint = document.createElement('span');
  hint.className = 'collapse-hint';
  h2.appendChild(hint);
  h2.addEventListener('click', ()=> sec.classList.toggle('open'));
});
document.querySelectorAll('.settings-group.collapsible').forEach(group=>{
  const title = group.querySelector('.settings-group-title');
  title.addEventListener('click', ()=> group.classList.toggle('open'));
});

/* ---------------- tabs ----------------
   role="tablist"/"tab"/"tabpanel" 用的是标准 ARIA tabs 模式：每次切换要同步
   aria-selected（哪个tab被选中）和"roving tabindex"（tabindex在tab之间挪动，
   同一时刻只有当前激活的tab能被Tab键聚焦到，符合键盘用户对"标签页"控件的
   标准预期——Tab键只在tablist和当前面板之间跳两下，不会挨个把4个tab都走一遍）。
   鼠标点击的视觉效果和之前完全一样，这里只是把底层语义和键盘可达性补上。
   ---------------- */
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
// 供 AI 面板顶部状态条使用：有 window.lastCastData 就显示"当前排盘：卦名 · 日柱"，
// 没有（还没摇过卦，或者数据被清空）就隐藏整条，不占位置。挂在 window 上是因为
// 摇卦/复原历史卦等多处写 window.lastCastData 的代码分散在文件后面，
// 那几处会直接调用 window.updateCurrentCastStatus() 同步这条状态。
window.updateCurrentCastStatus = function(){
  const box = document.getElementById('currentCastStatus');
  if(!box) return;
  const d = window.lastCastData;
  if(d && d.guaName){
    const bianText = d.bianGuaName && d.bianGuaName !== d.guaName ? `（变 ${d.bianGuaName}）` : '';
    box.innerHTML = `当前排盘：<b>${d.guaName}</b>${bianText} · ${d.ganzhi || ''}日`;
    box.style.display = 'block';
  } else {
    box.style.display = 'none';
  }
};
function switchTab(tabName){
  tabButtons.forEach(b=>{
    const active = b.dataset.tab === tabName;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
    b.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active', p.id === tabName));
  if(tabName === 'ai') window.updateCurrentCastStatus();
}
tabButtons.forEach((btn, i)=>{
  btn.addEventListener('click',()=> switchTab(btn.dataset.tab));
  // 左右方向键 / Home / End 在标签之间移动焦点并直接切换面板（标准tablist行为，
  // 不需要用户额外按Tab/Enter）；上下方向键留给页面自身滚动，不拦截。
  btn.addEventListener('keydown', (e)=>{
    let targetIndex = null;
    if(e.key === 'ArrowRight') targetIndex = (i + 1) % tabButtons.length;
    else if(e.key === 'ArrowLeft') targetIndex = (i - 1 + tabButtons.length) % tabButtons.length;
    else if(e.key === 'Home') targetIndex = 0;
    else if(e.key === 'End') targetIndex = tabButtons.length - 1;
    if(targetIndex === null) return;
    e.preventDefault();
    const target = tabButtons[targetIndex];
    switchTab(target.dataset.tab);
    target.focus();
  });
});

/* ---------------- bagua grid ---------------- */
const BAGUA = [
  {key:'111',name:'乾',sym:'☰',el:'金',meta:'三阳 · 天 · 父'},
  {key:'110',name:'兑',sym:'☱',el:'金',meta:'上阴 · 泽 · 少女'},
  {key:'101',name:'离',sym:'☲',el:'火',meta:'中虚 · 火 · 中女'},
  {key:'100',name:'震',sym:'☳',el:'木',meta:'下阳 · 雷 · 长男'},
  {key:'011',name:'巽',sym:'☴',el:'木',meta:'下阴 · 风 · 长女'},
  {key:'010',name:'坎',sym:'☵',el:'水',meta:'中满 · 水 · 中男'},
  {key:'001',name:'艮',sym:'☶',el:'土',meta:'上阳 · 山 · 少男'},
  {key:'000',name:'坤',sym:'☷',el:'土',meta:'三阴 · 地 · 母'},
];
document.getElementById('baguaGrid').innerHTML = BAGUA.map(g=>`
  <div class="gua-card">
    <div class="sym">${g.sym}</div>
    <div class="name">${g.name}　·　${g.el}</div>
    <div class="meta">${g.meta}</div>
  </div>`).join('');

/* ---------------- wuxing wheel ---------------- */
const WX = ['木','火','土','金','水'];
const SHENG = {'木':'火','火':'土','土':'金','金':'水','水':'木'};
const KE = {'木':'土','土':'水','水':'火','火':'金','金':'木'};
const svg = document.getElementById('wuxingSvg');
const cx=140, cy=140, R=95;
const pos = {};
WX.forEach((w,i)=>{
  const a = -Math.PI/2 + i*(2*Math.PI/5);
  pos[w] = {x:cx+R*Math.cos(a), y:cy+R*Math.sin(a)};
});
let svgHtml = '';
// sheng arrows (outer pentagon, i -> i+1)
WX.forEach((w,i)=>{
  const a=pos[w], b=pos[WX[(i+1)%5]];
  svgHtml += `<path class="wx-arrow sheng" data-from="${w}" data-to="${WX[(i+1)%5]}" d="${arcPath(a,b,cx,cy,26)}"/>`;
});
// ke arrows (inner star, i -> i+2)
WX.forEach((w,i)=>{
  const a=pos[w], b=pos[WX[(i+2)%5]];
  svgHtml += `<path class="wx-arrow ke" data-from="${w}" data-to="${WX[(i+2)%5]}" d="${arcPath(a,b,cx,cy,-14,0.72)}"/>`;
});
function arcPath(a,b,cx,cy,bend,shrink){
  shrink = shrink||0.85;
  const ax = cx+(a.x-cx)*shrink, ay = cy+(a.y-cy)*shrink;
  const bx = cx+(b.x-cx)*shrink, by = cy+(b.y-cy)*shrink;
  const mx=(ax+bx)/2, my=(ay+by)/2;
  const dx=bx-ax, dy=by-ay, len=Math.hypot(dx,dy)||1;
  const nx=-dy/len, ny=dx/len;
  const ctrlx = mx+nx*bend, ctrly = my+ny*bend;
  return `M${ax},${ay} Q${ctrlx},${ctrly} ${bx},${by}`;
}
WX.forEach(w=>{
  const p=pos[w];
  svgHtml += `<g class="wx-node" data-el="${w}" tabindex="0" role="button" aria-label="查看${w}的生克关系" transform="translate(${p.x},${p.y})">
    <circle r="22"/><text x="0" y="6" text-anchor="middle">${w}</text></g>`;
});
svg.insertAdjacentHTML('beforeend', svgHtml);
function activateWxNode(node){
  const el = node.dataset.el;
  document.querySelectorAll('.wx-node').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.wx-arrow').forEach(a=>a.classList.remove('hl'));
  node.classList.add('active');
  document.querySelectorAll(`.wx-arrow[data-from="${el}"]`).forEach(a=>a.classList.add('hl'));
  document.querySelectorAll(`.wx-arrow[data-to="${el}"]`).forEach(a=>a.classList.add('hl'));
  const genTo = SHENG[el], genBy = Object.keys(SHENG).find(k=>SHENG[k]===el);
  const keTo = KE[el], keBy = Object.keys(KE).find(k=>KE[k]===el);
  document.getElementById('wxInfo').innerHTML =
    `<b>${el}</b> 生 ${genTo}　·　${genBy} 生 <b>${el}</b><br>
     <b>${el}</b> 克 ${keTo}　·　${keBy} 克 <b>${el}</b>`;
}
svg.querySelectorAll('.wx-node').forEach(node=>{
  node.addEventListener('click',()=>activateWxNode(node));
  // 键盘用户（Tab 聚焦 + Enter/空格触发）之前完全摸不到这个交互，纯 click 监听
  // 覆盖不到键盘操作，这里补上 keydown 处理，跟鼠标/触屏走同一套 activateWxNode 逻辑。
  node.addEventListener('keydown',(e)=>{
    if(e.key==='Enter' || e.key===' ' || e.key==='Spacebar'){
      e.preventDefault();
      activateWxNode(node);
    }
  });
});

/* ---------------- najia data ---------------- */
const NAJIA = {
  '乾':{inner:['甲子','甲寅','甲辰'], outer:['壬午','壬申','壬戌']},
  '坤':{inner:['乙未','乙巳','乙卯'], outer:['癸丑','癸亥','癸酉']},
  '震':{inner:['庚子','庚寅','庚辰'], outer:['庚午','庚申','庚戌']},
  '巽':{inner:['辛丑','辛亥','辛酉'], outer:['辛未','辛巳','辛卯']},
  '坎':{inner:['戊寅','戊辰','戊午'], outer:['戊申','戊戌','戊子']},
  '离':{inner:['己卯','己丑','己亥'], outer:['己酉','己未','己巳']},
  '艮':{inner:['丙辰','丙午','丙申'], outer:['丙戌','丙子','丙寅']},
  '兑':{inner:['丁巳','丁卯','丁丑'], outer:['丁亥','丁酉','丁未']},
};
const BRANCH_EL = {'子':'水','丑':'土','寅':'木','卯':'木','辰':'土','巳':'火','午':'火','未':'土','申':'金','酉':'金','戌':'土','亥':'水'};
const SIX_SPIRITS = ['青龙','朱雀','勾陈','螣蛇','白虎','玄武'];
// 六神→CSS类名的映射，配合CSS里的 .spirit-dot 系列规则，给排盘表格/卡片里的六神名字
// 前面加一个小色块，方便扫读时快速定位（纯装饰，不影响任何判断逻辑）。四处渲染
// （renderPlate表格/buildPlateCardsHtml卡片/renderPlateFromCastData复原态/historyCastHtml历史记录）
// 共用这一份，spirit不在映射表里（理论上不会发生，六神固定六个）时返回空字符串，不出色块也不报错。
const SPIRIT_CLASS = {'青龙':'qinglong','朱雀':'zhuque','勾陈':'gouchen','螣蛇':'tengshe','白虎':'baihu','玄武':'xuanwu'};
function spiritDotHtml(spirit){
  const cls = SPIRIT_CLASS[spirit];
  return cls ? `<span class="spirit-dot ${cls}" aria-hidden="true"></span>` : '';
}
const TRIGRAM_BY_KEY = {};
BAGUA.forEach(g=>TRIGRAM_BY_KEY[g.key]=g);

/* ---------------- eight-palace (八宫) generation ---------------- */
const PALACE_SEEDS = [
  {name:'乾', bits:[1,1,1], el:'金'},
  {name:'兑', bits:[1,1,0], el:'金'},
  {name:'离', bits:[1,0,1], el:'火'},
  {name:'震', bits:[1,0,0], el:'木'},
  {name:'巽', bits:[0,1,1], el:'木'},
  {name:'坎', bits:[0,1,0], el:'水'},
  {name:'艮', bits:[0,0,1], el:'土'},
  {name:'坤', bits:[0,0,0], el:'土'},
];
const STEP_TYPES = ['八纯','一世','二世','三世','四世','五世','游魂','归魂'];
const STEP_WORLD = [6,1,2,3,4,5,4,3];
// 八宫64卦标准卦名，顺序与 STEP_TYPES 对齐（八纯→一世→...→游魂→归魂）
const GUA_NAME_TABLE = {
  '乾': ['乾为天','天风姤','天山遁','天地否','风地观','山地剥','火地晋','火天大有'],
  '兑': ['兑为泽','泽水困','泽地萃','泽山咸','水山蹇','地山谦','雷山小过','雷泽归妹'],
  '离': ['离为火','火山旅','火风鼎','火水未济','山水蒙','风水涣','天水讼','天火同人'],
  '震': ['震为雷','雷地豫','雷水解','雷风恒','地风升','水风井','泽风大过','泽雷随'],
  '巽': ['巽为风','风天小畜','风火家人','风雷益','天雷无妄','火雷噬嗑','山雷颐','山风蛊'],
  '坎': ['坎为水','水泽节','水雷屯','水火既济','泽火革','雷火丰','地火明夷','地水师'],
  '艮': ['艮为山','山火贲','山天大畜','山泽损','火泽睽','天泽履','风泽中孚','风山渐'],
  '坤': ['坤为地','地雷复','地泽临','地天泰','雷天大壮','泽天夬','水天需','水地比'],
};
const EIGHT_PALACE_MAP = {};
function b2s(arr){return arr.join('');}
PALACE_SEEDS.forEach(seed=>{
  const [p0,p1,p2] = seed.bits;
  const f = x=>1-x;
  const steps = [
    {lower:[p0,p1,p2], upper:[p0,p1,p2]},
    {lower:[f(p0),p1,p2], upper:[p0,p1,p2]},
    {lower:[f(p0),f(p1),p2], upper:[p0,p1,p2]},
    {lower:[f(p0),f(p1),f(p2)], upper:[p0,p1,p2]},
    {lower:[f(p0),f(p1),f(p2)], upper:[f(p0),p1,p2]},
    {lower:[f(p0),f(p1),f(p2)], upper:[f(p0),f(p1),p2]},
    {lower:[f(p0),f(p1),f(p2)], upper:[p0,f(p1),p2]},
    {lower:[p0,p1,p2], upper:[p0,f(p1),p2]},
  ];
  steps.forEach((s,i)=>{
    const key = b2s(s.lower)+b2s(s.upper);
    const world = STEP_WORLD[i];
    const response = ((world+3-1)%6)+1;
    EIGHT_PALACE_MAP[key] = {palace:seed.name+'宫', element:seed.el, type:STEP_TYPES[i], world, response, name:GUA_NAME_TABLE[seed.name][i]};
  });
});

/* ---------------- six relatives ---------------- */
function sixRelative(lineEl, palaceEl){
  if(lineEl===palaceEl) return '兄弟';
  if(SHENG[lineEl]===palaceEl) return '父母';
  if(SHENG[palaceEl]===lineEl) return '子孙';
  if(KE[lineEl]===palaceEl) return '官鬼';
  if(KE[palaceEl]===lineEl) return '妻财';
  return '－';
}

/* 进退神：采用《增删卜易·进神退神章》所列地支对。
   土爻补丑→辰、辰→未、未→戌；戌→丑的循环扩展本版不预判。 */
const JIN_SHEN_PAIRS = {'寅':'卯','巳':'午','申':'酉','亥':'子','丑':'辰','辰':'未','未':'戌'};
const TUI_SHEN_PAIRS = {'卯':'寅','午':'巳','酉':'申','子':'亥','辰':'丑','未':'辰','戌':'未'};
function computeJinTuiShen(fromBranch, toBranch){
  if(!fromBranch || !toBranch || fromBranch === toBranch) return '';
  if(JIN_SHEN_PAIRS[fromBranch] === toBranch) return '进神';
  if(TUI_SHEN_PAIRS[fromBranch] === toBranch) return '退神';
  return ''; // 未命中本版采用的进退神对，不预判
}

/* ---------------- 月令旺衰 / 日辰合冲 / 回头生克 / 世应生克 / 飞神伏神生克 ----------------
   这几项跟上面的进退神是同一类东西：给定"五行生克"这套纯数学关系，答案唯一、没有流派
   分歧，此前却一直是甩给AI在断卦时自己心算——AI凭训练时的零散记忆现算月令旺衰、
   现套六合六冲表，容易出现同一张排盘这次说"旺"、下次说"衰"的前后不一致，也没法排查
   到底是卦理判断错了还是纯粹算错了这道计算题。这里补上代码计算，AI只管拿现成结论用。

   刻意不算的两类，跟进退神在辰戌丑未组合时留空是同一个道理：
   1. 合/冲对旺衰到底是"利好"还是"利空"——合有牵绊安稳、也有绊住不动两种解读，
      冲有暗动、也有冲散两种解读，历代说法本身就不是单一方向，这属于需要结合语境
      判断的部分，这里只客观标出"有没有合/冲"这个事实，不越界替AI下结论。
   2. 用神该选哪个六亲——依赖对问题文本的语义理解，是判断题不是计算题，继续交给AI。
   ---------------------------------------------------------------------------------- */
const SEASON_BY_BRANCH = {
  '寅':'春','卯':'春','巳':'夏','午':'夏','申':'秋','酉':'秋','亥':'冬','子':'冬',
  '辰':'四季','戌':'四季','丑':'四季','未':'四季',
};
const YUELING_TABLE = {
  '春': {'木':'旺','火':'相','水':'休','金':'囚','土':'死'},
  '夏': {'火':'旺','土':'相','木':'休','水':'囚','金':'死'},
  '秋': {'金':'旺','水':'相','土':'休','火':'囚','木':'死'},
  '冬': {'水':'旺','木':'相','金':'休','土':'囚','火':'死'},
  '四季':{'土':'旺','金':'相','火':'休','木':'囚','水':'死'},
};
// 月令旺衰：只看"月建地支属于哪个季节"+"这一爻的五行"两个输入，跟断卦参考表里
// 给人/给AI看的那份旺相休囚死表是同一套数据，这里做成可以直接查表返回的函数。
function getYuelingState(monthBranch, element){
  const season = SEASON_BY_BRANCH[monthBranch];
  return (season && YUELING_TABLE[season][element]) || '';
}
const LIUHE_PAIR = {'子':'丑','丑':'子','寅':'亥','亥':'寅','卯':'戌','戌':'卯','辰':'酉','酉':'辰','巳':'申','申':'巳','午':'未','未':'午'};
const LIUCHONG_PAIR = {'子':'午','午':'子','丑':'未','未':'丑','寅':'申','申':'寅','卯':'酉','酉':'卯','辰':'戌','戌':'辰','巳':'亥','亥':'巳'};
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

/* ---------------- 60 jiazi / kongwang ---------------- */
const STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const STEM_SPIRIT_GROUP = {'甲':0,'乙':0,'丙':1,'丁':1,'戊':2,'己':3,'庚':4,'辛':4,'壬':5,'癸':5};
const BRANCHES12 = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const KONG_PAIRS = [['戌','亥'],['申','酉'],['午','未'],['辰','巳'],['寅','卯'],['子','丑']];
const JIAZI60 = [];
for(let i=0;i<60;i++){
  JIAZI60.push({label:STEMS[i%10]+BRANCHES12[i%12], stem:STEMS[i%10], kongGroup:Math.floor(i/10)});
}
const dayGanzhiSelect = document.getElementById('dayGanzhi');
dayGanzhiSelect.innerHTML = JIAZI60.map((d,i)=>`<option value="${i}">${d.label}</option>`).join('');

// ---- 自动选中今天的日柱（对应桌面版 ganzhi.py 的算法，用同一批日期校准过）----
function getTodayJiaziIndex(date = new Date()){
  const daysSinceEpoch = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const OFFSET = 17; // 校准过：2026-07-25→庚子(36)、07-26→辛丑(37)、07-27→壬寅(38)
  return ((daysSinceEpoch + OFFSET) % 60 + 60) % 60;
}
dayGanzhiSelect.value = String(getTodayJiaziIndex());

// ---- "干支日→实际公历日期"换算要用到的两个基础工具：
// 1) 干支文字（如"戊戌"）反查是第几个甲子（0-59），供下面annotateGanzhiDay按文本匹配到的干支
//    去查它的下标；跟dayGanzhiIndex用的是同一份JIAZI60数据源，不会出现两边表对不上的情况。
const JIAZI60_INDEX_BY_LABEL = {};
JIAZI60.forEach((d,i)=>{ JIAZI60_INDEX_BY_LABEL[d.label] = i; });
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

// ---- 年月时柱/日期显示要用哪个"时刻"算：默认是null，表示用renderPlate()里现取的
// "现在"（正常摇卦场景）；只有下面"按公历日期反查日柱"成功命中之后，才会把那个具体日期
// 存进来，让年月时柱和日期显示也对上那次反查的真实日期，而不是"现在"——
// 这样AI断卦时用到的月柱（月建定旺相休囚死）才是那个历史卦例真正的月柱，不是复盘当天的。
// 只要用户之后没有手动去改日柱下拉框，这个关联就一直有效；一旦手动改了下拉框
// （见下面dayGanzhiSelect的change监听），就清空退回"现在"——因为单选一个干支
// 本身是模糊的（六十天一轮回，没法反推唯一对应哪一天），没法再关联到具体日期。
let knownCastDate = null;
let daySelectionMode = 'auto';
dayGanzhiSelect.addEventListener('change', ()=>{knownCastDate=null;daySelectionMode='manual';document.getElementById('dayLookupDate').value='';document.getElementById('dayLookupTime').value='';});

// ---- 按公历日期反查日柱：想复盘某个历史案例（比如书上的老案例、以前手动摇的卦）
// 之前只能自己心算六十甲子再去下拉框里找，这里加个日期选择器，选完直接调用上面已有的
// getTodayJiaziIndex(date) 反推那天的日柱下标，自动帮下拉框选中，不用再手动数。
// 只负责"选中"，不自动触发摇卦/生成排盘——选完日柱后用户仍按原来的流程点"摇卦"或
// "生成排盘"，跟直接手动在下拉框里选一样，不额外改变其他状态。
const dayLookupDateInput = document.getElementById('dayLookupDate');
if(dayLookupDateInput){
  dayLookupDateInput.addEventListener('change', ()=>{
    const v = dayLookupDateInput.value; // "YYYY-MM-DD"
    if(!v){knownCastDate=null;daySelectionMode='auto';dayGanzhiSelect.value=String(getTodayJiaziIndex());return;}
    const [y,m,d] = v.split('-').map(Number);
    if(!y || !m || !d) return;
    const picked = new Date(y, m-1, d); // 按本地日历日期算，跟getTodayJiaziIndex(new Date())默认走同一套时区口径
    // 用JS赋值.value不会触发上面dayGanzhiSelect的'change'监听（那个监听只认用户手动在下拉框里
    // 选选项这种真实交互），所以这里设置knownCastDate不会被自己刚改的下拉框清空。
    dayGanzhiSelect.value = String(getTodayJiaziIndex(picked));
    knownCastDate = picked; daySelectionMode='date';
    const time=document.getElementById('dayLookupTime').value;if(time){const [h,min]=time.split(':').map(Number);knownCastDate.setHours(h,min);}
    showToast(`已按 ${v} 反查并选中日柱：${JIAZI60[getTodayJiaziIndex(picked)].label}`);
  });
}

document.getElementById('dayLookupTime').addEventListener('change',()=>{
  if(knownCastDate){const [h,m]=(document.getElementById('dayLookupTime').value||'00:00').split(':').map(Number);knownCastDate.setHours(h,m,0,0);}
});
// Browser local civil time; day changes at 00:00. No true-solar-time correction.
function resolveCastCalendar(){
  const now=knownCastDate ? new Date(knownCastDate) : new Date();
  if(daySelectionMode==='auto')dayGanzhiSelect.value=String(getTodayJiaziIndex(now));
  const day=JIAZI60[Number(dayGanzhiSelect.value)];
  if(daySelectionMode==='manual')return {now,day,ymh:{yearLabel:'未指定',monthLabel:'未指定',hourLabel:'未指定'},dateText:'公历日期未指定（仅录入日柱）'};
  const ymh=buildYearMonthHourPillars(day.stem,now);
  if(knownCastDate&&!document.getElementById('dayLookupTime').value){
    ymh.hourLabel='未指定';
    const end=new Date(now);end.setHours(23,59,59,999);
    const last=buildYearMonthHourPillars(day.stem,end);
    if(last.yearLabel!==ymh.yearLabel)ymh.yearLabel='交节日待定';
    if(last.monthLabel!==ymh.monthLabel)ymh.monthLabel='交节日待定';
  }
  return {now,day,ymh,dateText:buildDateDisplayText(now)};
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
// 十二"节"对应的地支，按太阳视黄经315°起排（315°=立春=寅月起点），此后每隔30°换一档，
// 顺序跟传统节气表完全一致（不掺"气"，"气"只影响中气/闰月判断，跟六爻月柱无关）。
const JIE_BRANCHES_FROM_LICHUN = ['寅','卯','辰','巳','午','未','申','酉','戌','亥','子','丑'];
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
// 跟 boldPillarsHtml 同一个思路，把"公历：X"“农历：X”里"："后面的值部分加粗。
function boldDateHtml(text){
  return String(text||'').replace(/(公历|农历)：([^\s　]+)/g, '$1：<b>$2</b>');
}
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
// 把"年柱：X"这类文本里，每个"XX柱：值"和"空亡：值"的"值"部分加粗，供排盘区、历史记录展示复用，
// 不用各处各写一遍加粗规则。用正则按"标签：值"的固定格式匹配，不依赖调用方传入的具体是哪几柱。
function boldPillarsHtml(text){
  return String(text||'')
    .replace(/(年柱|月柱|日柱|时柱)：([^\s　]+)/g, '$1：<b>$2</b>')
    .replace(/空亡：(.+)$/, '空亡：<b>$1</b>');
}

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

/* ==================================================================
   生死寿数类问题过滤 —— 呼应传统占卦规矩"不轻断生死寿数"：
   这类判断风险高、容易断错，也怕给提问的人带来不必要的心理暗示，
   命中关键词就不生成解读，而不是靠 AI 自己去把握分寸。
   ================================================================== */
const LIFESPAN_KEYWORDS = [
  '还能活多久', '还能活几年', '还能活几天', '还能活多长时间',
  '寿命还有', '寿命有多长', '阳寿', '大限',
  '什么时候死', '啥时候死', '哪天死', '几岁死', '死期',
  '还有多久死', '还能撑多久', '命还有多久',
];
// 纯子字符串匹配会误伤"这盆绿植还能活多久"这类问的根本不是人命的问题——
// 补一份"非人类主体"提示词，命中其一就不当成生死寿数问题拦截，只在没有这些词、
// 又命中上面关键词时才判定为真的在问人（含默认问自己）的寿数。这不是万能的语义理解，
// 但能挡掉审查报告里指出的这类典型误伤场景。
const LIFESPAN_NON_HUMAN_HINTS = [
  '植物','绿植','花','树','草','苗','盆栽','盆景','种子','多肉','花草',
  '宠物','猫','狗','鱼','乌龟','仓鼠','兔子','鸟','虫','昆虫',
  '手机','电脑','电池','轮胎','汽车','爱车','摩托','电动车','冰箱','空调','家电','机器','设备','硬盘','灯泡','充电宝',
  '西瓜','水果','蔬菜','菜','面包','食物',
];
function isLifespanQuestion(text){
  if(!LIFESPAN_KEYWORDS.some(kw => text.includes(kw))) return false;
  if(LIFESPAN_NON_HUMAN_HINTS.some(kw => text.includes(kw))) return false;
  return true;
}

/* ==================================================================
   安全本地存储写入 —— localStorage.setItem/removeItem 在隐私模式受限、
   存储被浏览器/企业策略/隐私扩展禁用、或容量超限等场景下会抛异常。这类
   异常发生在普通 addEventListener 回调里不会崩页面（只会打到控制台），
   但后果是用户以为设置保存了、实际上悄悄没保存——尤其是 API Key 这种
   "填一次以后不用再管"的场景，用户看到界面显示"已保存"，刷新后才发现
   丢了，会很困惑且毫无提示。这里统一包一层，失败时用已有的 toast 系统
   告诉用户，不再是"看起来保存了、其实没有"。
   下面所有用户直接触发的设置写入（摇卦频率日志、新手教程已读标记、人设/
   模型/回复风格/努力程度选择、单价覆盖、API Key、历史记录、终身统计）
   都改走这两个函数。
   例外：saveActiveConversation/clearActiveConversationStorage（当前会话
   自动存档，见对应小节）刻意不走这一层——那是刷新页面用的后台自动存档，
   原作者已经明确设计为"静默失败即可，不影响当前这次问答本身"，不需要用
   toast 打扰用户，这里保留原设计判断，没有改动那两个函数。
   ================================================================== */
function safeGetItem(key){try{return localStorage.getItem(key);}catch(e){return null;}}
function safeSetItem(key, val){
  try{
    localStorage.setItem(key, val);
    return true;
  }catch(e){
    showToast(`设置没能保存到本地（${(e && e.message) || '存储失败'}），可能是隐私模式或存储空间限制`, 'error');
    return false;
  }
}
function safeRemoveItem(key){
  try{
    localStorage.removeItem(key);
    return true;
  }catch(e){
    showToast(`清除本地设置失败（${(e && e.message) || '存储失败'}），可能是隐私模式限制`, 'error');
    return false;
  }
}

/* ==================================================================
   摇卦前置校验 —— 呼应传统六爻两条基本规矩：
   1)"一事不问二卦"：同一件事只起一次卦，反复摇卦骗自己的结果不算数
   2) 短时间内不宜连续摇很多卦（心诚则灵），做一个简单的频率限制
   ================================================================== */
const LS_KEY_CAST_LOG = 'liuyao_cast_log';
const CAST_COOLDOWN_WINDOW_MS = 10 * 60 * 1000; // 10 分钟窗口
const CAST_COOLDOWN_MAX = 3;                    // 窗口内最多摇 3 次

function loadCastLog(){
  try{ const v=JSON.parse(safeGetItem(LS_KEY_CAST_LOG) || '[]'); return Array.isArray(v)?v.filter(t=>Number.isFinite(t)&&t<=Date.now()):[]; }
  catch(e){ return []; }
}
function pruneCastLog(log){
  const now = Date.now();
  return log.filter(ts => now - ts < CAST_COOLDOWN_WINDOW_MS);
}
function logCastEvent(){
  const log = pruneCastLog(loadCastLog());
  log.push(Date.now());
  safeSetItem(LS_KEY_CAST_LOG, JSON.stringify(log));
  renderCastQuota(); // 每次真正占用一次摇卦名额，顺手刷新一下常驻的"还剩几次"提示
}
function castsRemainingInWindow(){
  return Math.max(CAST_COOLDOWN_MAX - pruneCastLog(loadCastLog()).length, 0);
}
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

// 问题文字归一化：只用于"是不是同一个问题"的判断，
// 忽略空白和末尾标点，避免用户补个问号、多敲个空格就被判成新问题而重摇重扣费。
function normQuestion(s){
  return String(s || '').replace(/\s+/g, '').replace(/[。．.!！?？~～、，,]+$/, '');
}
function isSameQuestion(a, b){
  return normQuestion(a) === normQuestion(b);
}

// 摇卦前统一走这个校验：频率限制 + 一事一挂规矩。
// 通过则记一次摇卦事件并返回 true；不通过则返回 false（各调用方自行决定要不要再给提示）。
//
// 规矩：同一件事不重复起卦。但"摇卦"按钮本身不像"AI 解读"/"输出提示词"那两条路径——
// 它不一定绑定问题文字（可以先摇卦、后写问题，甚至压根不写问题），所以这里不能照抄那两条
// 路径"比较新旧问题文字是否相同"的判断，只能用一个不依赖文字内容的信号：上一卦是否还在。
// 于是改成跟那两处一致的"确认式"体验——弹窗问用户是否要另起一卦，而不是像以前那样只要
// 输入框空着/文字没变就直接硬拦、不给走。
//
// opts.skipCastConfirm：供"AI 解读"/"输出提示词"这两个调用方使用——它们在调用这里之前，
// 已经自己弹过一次"是同一件事，还是换新事了？"的确认框，判断出确实要重新起卦了，
// 这里就不用再问第二遍，只需要跟着把状态清干净、正常走频率限制+记录这一次摇卦事件。
async function guardBeforeCast(opts = {}){
  const { skipCastConfirm = false, background = false } = opts;
  if(castsRemainingInWindow() <= 0){
    showToast('短时间内已经摇太多次了，心诚则灵，稍等一会再摇（10 分钟内最多 3 次）', 'error', 4500);
    return false;
  }
  if(window.lastCastData){
    if(!skipCastConfirm){
      const wantsNewCast = await showConfirm(
        '上一卦还在。按"一事不问二卦"的规矩，同一件事不重复起卦——你是否需要再次起卦？',
        { title: '再次起卦？', okText: '是，重新起卦', cancelText: '不用了' }
      );
      if(!wantsNewCast) return false;
    }
    // 不管是刚刚用户点了"是，重新起卦"，还是调用方自己那套"换新事了"确认框已经问过一遍、
    // 传 skipCastConfirm 跳过了这里的重复确认——只要确定要重新起卦，就要把跟"上一卦"绑定的
    // 状态一并清掉。这一步是专门补的：以前"清空"按钮只清了 AI 对话相关的状态
    // （currentConversation 等），没碰 window.lastCastData / lastCastQuestion，
    // 导致用户就算把问题框里的字删光，这两个变量依然停在"上一卦"的值上，一摇卦立刻又撞上
    // 同一条拦截逻辑——不清掉这两个变量，这条老毛病换个壳还会再犯一次。
    if(castMode === 'manual' && !background) window.lastCastData = null;
    if(castMode === 'manual' && !background) window.lastCastQuestion = '';
    if(!skipCastConfirm && castMode === 'manual' && !background){
      // 只有"摇卦"/"生成排盘"这种不一定跟问题绑定、可以直接重摇的场景，才顺手清空问题框
      // （呼应罗士程的建议：点另一卦的同时直接消去这里的文本）；"AI 解读"/"输出提示词"走
      // skipCastConfirm 这条分支时，输入框里的文字就是用户马上要问的新问题，不能跟着清掉。
      const qEl = document.getElementById('questionInput');
      if(qEl){
        qEl.value = '';
        qEl.dispatchEvent(new Event('input'));
      }
    }
  }
  if(castMode === 'manual' && !background) logCastEvent();
  return true;
}

/* ---------------- caster ---------------- */
const castBtn = document.getElementById('castBtn');
const plateWrap = document.getElementById('plateWrap');
const coinLog = document.getElementById('coinLog');

// 排盘表每次重新渲染（摇卦完成/手动生成/历史记录回看）都要重新播一遍跟标签切换
// 同款的淡入动效，而不是硬切出现。同一个元素反复扣同一个class浏览器不会重放
// CSS动画，这里先移除class、强制触发一次回流（读一下offsetWidth），再加回去，
// 让每次调用都能重新触发 .fade-in 对应的 fade 关键帧。
function replayFadeIn(el){
  el.classList.remove('fade-in');
  void el.offsetWidth;
  el.classList.add('fade-in');
}

// Physics simulation: fixed timestep, actual cylinder poses determine faces.
function createCoinWorld(input, round){
  const C = CANNON, world = new C.World();
  world.gravity.set(0,0,-9.82);
  world.allowSleep = true;
  world.solver.iterations = 20;
  world.defaultContactMaterial.friction = 0.42;
  world.defaultContactMaterial.restitution = 0.28;
  const floor = new C.Body({mass:0}); floor.addShape(new C.Plane()); world.addBody(floor);
  for(const [x,y,sx,sy] of [[-4.5,0,.15,4.5],[4.5,0,.15,4.5],[0,-4.5,4.5,.15],[0,4.5,4.5,.15]]){
    const wall = new C.Body({mass:0}); wall.addShape(new C.Box(new C.Vec3(sx,sy,2))); wall.position.set(x,y,1); world.addBody(wall);
  }
  const bodies=[];
  for(let i=0;i<3;i++){
    const body=new C.Body({mass:0.012,linearDamping:.22,angularDamping:.18,allowSleep:true,sleepSpeedLimit:.12,sleepTimeLimit:.7});
    body.addShape(new C.Cylinder(.5,.5,.07,24));
    body.position.set((i-1)*1.2,0,2+i*.23);
    const phase=(input.phase||0) + input.duration*3 + input.distance*.013 + round*.71 + i*1.91;
    body.quaternion.setFromEuler(phase,phase*.73,phase*.31);
    body.velocity.set(input.vx*.002+(i-1)*.3,input.vy*.002,2+Math.min(3,input.distance*.008));
    body.angularVelocity.set(9+input.vy*.012+i*2,7+input.vx*.012-i,phase%7);
    world.addBody(body); bodies.push(body);
  }
  return {world,bodies};
}

// Shared physical settlement criteria for visible and background casting.
function advanceCoinWorld(sim){
  sim.world.step(1/120);
  sim.steps=(sim.steps||0)+1;
  const quiet=sim.bodies.every(b=>b.velocity.length()<.035&&b.angularVelocity.length()<.08&&b.position.z<.5);
  sim.stable=quiet?(sim.stable||0)+1:0;
  if(sim.stable>=72){
    const normals=sim.bodies.map(b=>b.quaternion.vmult(new CANNON.Vec3(0,0,1)).z);
    if(normals.every(n=>Math.abs(n)>.97)){
      const coins=normals.map(n=>n>0?'字':'背'),sum=coins.reduce((s,c)=>s+(c==='字'?2:3),0);
      return {line:{...lineFromSum(sum),coins}};
    }
    return {retry:true};
  }
  return sim.steps>=2400?{retry:true}:null;
}
function commitPhysicsCast(lines){
  renderPlate(lines,'physics');logCastEvent();
  coinLog.textContent=lines.map((l,i)=>`${['初','二','三','四','五','上'][i]}爻 ${l.coins.join('')} · ${l.sum}`).join(' ｜ ');
  return window.lastCastData;
}

// The initiating click's coordinates and timestamp supply initial conditions;
// no random result is selected. Simulation yields between fixed-step batches.
function castInputFromEvent(event){
  const t=(event?.timeStamp ?? performance.now())/1000;
  return {duration:t%10,distance:Math.hypot(event?.clientX||0,event?.clientY||0)%450,
    vx:((event?.clientX||0)%600)-300,vy:((event?.clientY||0)%600)-300};
}
async function performBackgroundCast(input, onProgress){
  const lines=[];
  for(let round=0;round<6;round++){
    onProgress?.(round,6);
    let line=null;
    for(let attempt=0;attempt<4&&!line;attempt++){
      const sim=createCoinWorld({...input,duration:input.duration+attempt*.413},round);
      let result=null;
      while(!result){
        for(let i=0;i<240&&!result;i++) result=advanceCoinWorld(sim);
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      line=result.line||null;
    }
    if(!line) throw new Error('铜钱未能稳定落下，本次未扣次数，请重新点击起卦');
    lines.push(line);
  }
  onProgress?.(6,6);
  return commitPhysicsCast(lines);
}

function physicsCoinSvg(id){
  // Vector relief and patina; reverse is a decorative seal design, not a tracing.
  const ring='M28 0a28 28 0 1 0-56 0a28 28 0 1 0 56 0M-6-6h12v12h-12z';
  const speckles=Array.from({length:62},(_,i)=>{const a=i*2.399963,r=9+(i*7.13)%16.7;return `<circle cx="${(Math.cos(a)*r).toFixed(2)}" cy="${(Math.sin(a)*r).toFixed(2)}" r="${(.12+(i%4)*.09).toFixed(2)}" fill="${i%3?'#443d24':'#54715a'}" opacity="${.13+(i%4)*.05}"/>`;}).join('');
  const lettering='<text y="-10">乾</text><text y="20">隆</text><text x="15.5" y="4">通</text><text x="-15.5" y="4">寶</text>';
  const reverse='<path d="M-14-18c-5 2-5 6-1 7 5 1 5-5 2-6m-1 5v24c0 4-3 6-6 7m6-22c-8-4-9 4-3 5l3-1m0 4c-8-2-8 5-2 5m2 1 5 3m-5 1-4 4M14-18c5 1 6 5 2 7-5 2-7-3-3-6m1 5v27c0 3-3 5-5 4m5-25c7-4 9 3 4 5l-4-1m0 4c7-2 9 5 3 6l-3-1m0 5 5 2"/>';
  return `<g class="physics-coin" data-coin="${id}"><title>字面记二，背面记三</title><defs><linearGradient id="coin-metal-${id}" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#f2dfa9"/><stop offset=".2" stop-color="#c6a15d"/><stop offset=".48" stop-color="#a48248"/><stop offset=".73" stop-color="#d9ba76"/><stop offset="1" stop-color="#8b6939"/></linearGradient><linearGradient id="coin-rim-${id}" x2=".7" y2="1"><stop stop-color="#ffedb7"/><stop offset=".4" stop-color="#d6bb80"/><stop offset="1" stop-color="#765028"/></linearGradient></defs>
  <g class="coin-edge"><path d="${ring}" fill="#624626" fill-rule="evenodd" stroke="#b28e50" stroke-width="1.2"/><path d="M-25 12A28 28 0 0 0 25 12" fill="none" stroke="#d0ad64" stroke-width=".8"/></g>
  <g class="coin-face"><path d="${ring}" fill="url(#coin-metal-${id})" fill-rule="evenodd" stroke="#785a30" stroke-width=".8"/>
  <circle r="26.5" fill="none" stroke="url(#coin-rim-${id})" stroke-width="2.2"/><circle r="24.9" fill="none" stroke="#6c502d" stroke-width=".65"/><circle r="24.1" fill="none" stroke="#f3d79a" stroke-opacity=".45" stroke-width=".6"/>
  ${speckles}<path d="M-21-12q5-8 12-10M11 22l4-2M-22 9l2 3M19-15l2 3" fill="none" stroke="#eed398" stroke-width=".5" opacity=".45"/>
  <path d="M-7.3-7.3h14.6v14.6h-14.6z" fill="none" stroke="#f0d69a" stroke-width="1.6"/><path d="M-6-6h12v12h-12z" fill="none" stroke="#614622" stroke-width="1.2"/>
  <g class="coin-inscription" font-family="KaiTi,STKaiti,'Noto Serif SC',serif" font-size="10.7" font-weight="700" text-anchor="middle"><g fill="#f8e2a9" transform="translate(.45 .7)">${lettering}</g><g fill="#715027" stroke="#543c21" stroke-width=".18">${lettering}</g></g>
  <g class="coin-reverse" style="display:none" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#f3d99c" stroke-width="1.8" transform="translate(.4 .65)">${reverse}</g><g stroke="#684921" stroke-width="1.5">${reverse}</g><circle cy="-16" r="1.3" fill="#78592e" stroke="none"/><circle cy="16" r="1.3" fill="#78592e" stroke="none"/></g></g></g>`;
}

function performCast(){
  return new Promise((resolve,reject)=>{
    const labels=['初爻','二爻','三爻','四爻','五爻','上爻'];
    const auto=document.getElementById('castPace').value==='all';
    const dialog=document.createElement('dialog');dialog.className='physics-dialog';
    dialog.setAttribute('aria-labelledby','physics-title');dialog.setAttribute('aria-describedby','physics-description');
    dialog.innerHTML=`<header class="physics-header"><div class="physics-heading"><span class="physics-seal" aria-hidden="true">六<br>爻</span><div><div class="physics-eyebrow">以钱为媒 · 静心起卦</div><h3 id="physics-title">一念起，六爻成</h3></div></div><button type="button" class="physics-close" aria-label="关闭摇卦窗口"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <div class="physics-body"><section class="physics-table"><div class="physics-table-top"><span><i></i> 三钱起卦</span><span>${auto?'连续六爻':'逐爻投掷'}</span></div>
    <svg class="physics-scene" viewBox="0 0 600 400" role="img" aria-label="铜钱投掷桌面，可拖动蓄势">
    <defs><radialGradient id="table-glow"><stop stop-color="#3b3222"/><stop offset="1" stop-color="#1b1914"/></radialGradient><linearGradient id="coin-gold" x2="1" y2="1"><stop stop-color="#f1d99c"/><stop offset=".46" stop-color="#c5a360"/><stop offset="1" stop-color="#92703c"/></linearGradient><radialGradient id="coin-shadow"><stop stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <rect width="600" height="400" fill="url(#table-glow)"/>
    <g class="physics-engraving" transform="translate(300 222) scale(1 .62)" fill="none" stroke="#b8944f"><circle r="219" opacity=".16"/><circle r="210" opacity=".2"/><circle r="166" opacity=".1"/><path d="M0-200v12M0 200v-12M-200 0h12M200 0h-12" opacity=".45"/><g opacity=".26">${Array.from({length:8},(_,i)=>`<g transform="rotate(${i*45}) translate(0 -183)"><path d="M-15 0h30M-15 5h${i%2?11:30}${i%2?'m8 0h11':''}M-15 10h${i%3?11:30}${i%3?'m8 0h11':''}" stroke-width="2"/></g>`).join('')}</g></g>
    <g class="physics-shadows">${[0,1,2].map(i=>`<ellipse data-shadow="${i}" cx="${220+i*80}" cy="250" rx="34" ry="12" fill="url(#coin-shadow)"/>`).join('')}</g><g class="physics-coins">${[0,1,2].map(physicsCoinSvg).join('')}</g>
    <g class="physics-drag-hint" fill="none" stroke="#b8944f" opacity=".5"><path d="M262 334h76m-69-5-7 5 7 5m62-10 7 5-7 5"/></g></svg>
    <div class="physics-table-caption"><span class="physics-stage-caption">轻摇铜钱，静候落定</span><span class="physics-gesture-meter" aria-hidden="true"><i></i></span></div></section>
    <aside class="physics-record"><div class="physics-record-title"><h4>六爻成象</h4><span class="physics-count">00 <small>/ 06</small></span></div><p class="physics-record-hint">自下而上，依次成爻</p><ol class="physics-results" aria-label="六爻投掷结果">${labels.map((name,i)=>`<li data-line="${i}" class="${i===0?'is-current':''}"><span class="physics-line-number">${name}</span><span class="physics-line-glyph"><i></i><i></i></span><span class="physics-line-name">${i===0?'待投':'—'}</span></li>`).reverse().join('')}</ol><div class="physics-record-foot"><span class="physics-moving-dot"></span>朱砂标记动爻</div></aside></div>
    <footer class="physics-footer"><div class="physics-guidance"><strong class="physics-status" role="status" aria-live="polite">${auto?'一掷启程，六爻依次落定':'从初爻开始'}</strong><p id="physics-description">在桌面拖动蓄势，或直接点击投掷。</p></div><button type="button" class="physics-throw"><span>${auto?'开始连续投掷':'投掷初爻'}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button></footer><div class="physics-bottom-note">三枚铜钱 · 六次成卦 <span>字面二 · 背面三</span></div>`;
    document.body.appendChild(dialog);
    const scene=dialog.querySelector('.physics-scene'),status=dialog.querySelector('.physics-status'),launch=dialog.querySelector('.physics-throw');
    const count=dialog.querySelector('.physics-count'),caption=dialog.querySelector('.physics-stage-caption'),meter=dialog.querySelector('.physics-gesture-meter i');
    const coinNodes=[...dialog.querySelectorAll('.physics-coin')],shadows=[...dialog.querySelectorAll('[data-shadow]')];
    const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow;
    let lines=[],sim=null,frame=0,nextTimer=0,running=false,closed=false,complete=false,previousTime=0,accumulator=0;
    let input={vx:0,vy:0,distance:0,duration:0},pointer=null,pressStart=0;
    function cleanup(){if(closed)return;closed=true;cancelAnimationFrame(frame);clearTimeout(nextTimer);dialog.close();dialog.remove();document.body.style.overflow=previousOverflow;previousFocus?.focus({preventScroll:true});}
    function cancel(){cleanup();if(!complete)reject(new Error('已取消本卦，未扣除摇卦次数'));}
    dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});dialog.querySelector('.physics-close').onclick=cancel;
    function project(p){return {x:300+p.x*53+p.y*13,y:220+p.y*31-p.z*49};}
    function draw(){
      coinNodes.forEach((node,i)=>{
        if(!sim){node.querySelector('.coin-edge').setAttribute('transform',`translate(${220+i*80} 222) scale(1 .72)`);node.querySelector('.coin-face').setAttribute('transform',`translate(${220+i*80} 218) scale(1 .72)`);return;}
        const b=sim.bodies[i],q=b.quaternion,center=project(b.position),u=project(b.position.vadd(q.vmult(new CANNON.Vec3(.5/28,0,0)))),v=project(b.position.vadd(q.vmult(new CANNON.Vec3(0,.5/28,0))));
        const matrix=(offset)=>`matrix(${u.x-center.x} ${u.y-center.y} ${v.x-center.x} ${v.y-center.y} ${center.x} ${center.y+offset})`;
        node.querySelector('.coin-edge').setAttribute('transform',matrix(3));node.querySelector('.coin-face').setAttribute('transform',matrix(0));
        const normal=q.vmult(new CANNON.Vec3(0,0,1));
        const front=(-637*normal.x+2597*normal.y+1643*normal.z)>0;
        // Flip the back's local x axis so its relief is not mirror-written.
        if(!front){const backMatrix=(offset)=>`matrix(${center.x-u.x} ${center.y-u.y} ${v.x-center.x} ${v.y-center.y} ${center.x} ${center.y+offset})`;node.querySelector('.coin-face').setAttribute('transform',backMatrix(0));}
        node.querySelector('.coin-inscription').style.display=front?'':'none';node.querySelector('.coin-reverse').style.display=front?'none':'';
        const floor=project({x:b.position.x,y:b.position.y,z:0});shadows[i].setAttribute('cx',floor.x);shadows[i].setAttribute('cy',floor.y+5);shadows[i].setAttribute('opacity',Math.max(.2,1-b.position.z*.15));
      });
      if(sim)[0,1,2].sort((a,b)=>{const depth=b=>b.position.z-b.position.y*.6;return depth(sim.bodies[a])-depth(sim.bodies[b]);}).forEach(i=>coinNodes[i].parentNode.appendChild(coinNodes[i]));
    }
    function record(line){
      const index=lines.length-1,row=dialog.querySelector(`[data-line="${index}"]`);
      row.className='is-done'+(line.moving?' is-moving':'')+(line.yang?' is-yang':'');
      row.querySelector('.physics-line-name').textContent={6:'老阴',7:'少阳',8:'少阴',9:'老阳'}[line.sum];
      row.title=line.coins.join(' · ')+`，合计 ${line.sum}`;
      if(lines.length<6){const next=dialog.querySelector(`[data-line="${lines.length}"]`);next.classList.add('is-current');next.querySelector('.physics-line-name').textContent='待投';}
      count.innerHTML=`${String(lines.length).padStart(2,'0')} <small>/ 06</small>`;
    }
    scene.onpointerdown=e=>{if(running||complete)return;scene.setPointerCapture(e.pointerId);pointer={x:e.clientX,y:e.clientY,t:e.timeStamp};input.distance=0;scene.classList.add('is-dragging');};
    scene.onpointermove=e=>{if(!pointer||running)return;const dt=Math.max(1,e.timeStamp-pointer.t),scale=600/scene.getBoundingClientRect().width,dx=(e.clientX-pointer.x)*scale,dy=(e.clientY-pointer.y)*scale;input.vx=Math.max(-800,Math.min(800,dx/dt*1000));input.vy=Math.max(-800,Math.min(800,dy/dt*1000));input.distance=Math.min(2000,input.distance+Math.hypot(dx,dy));pointer={x:e.clientX,y:e.clientY,t:e.timeStamp};meter.style.width=Math.min(100,input.distance/4)+'%';caption.textContent='势已起 · 松手后投掷';if(!sim)coinNodes.forEach((n,i)=>{n.setAttribute('transform',`translate(${Math.sin(input.distance*.025+i)*6} ${Math.cos(input.distance*.02+i)*4})`);});};
    scene.onpointerup=scene.onpointercancel=()=>{pointer=null;scene.classList.remove('is-dragging');};
    launch.onpointerdown=()=>{pressStart=performance.now();};launch.onkeydown=e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat)pressStart=performance.now();};
    function begin(){
      if(closed||running||complete)return;
      try{sim=createCoinWorld(input,lines.length);accumulator=0;previousTime=0;running=true;launch.disabled=true;dialog.classList.add('is-rolling');coinNodes.forEach(n=>n.removeAttribute('transform'));status.textContent=`${labels[lines.length]} · 静候铜钱落定`;caption.textContent='铜钱翻转，卦象渐成';launch.querySelector('span').textContent='铜钱落定中';frame=requestAnimationFrame(tick);}catch(e){cleanup();reject(e);}
    }
    function retry(){running=false;dialog.classList.remove('is-rolling');status.textContent='铜钱未平稳落定';caption.textContent='已成之爻保留，本爻请再投一次';launch.disabled=false;launch.querySelector('span').textContent='重投'+labels[lines.length];}
    function tick(time){
      if(closed)return;
      try{
        accumulator+=previousTime?Math.min(.05,(time-previousTime)/1000):1/60;previousTime=time;
        while(accumulator>=1/120&&running){
          const result=advanceCoinWorld(sim);accumulator-=1/120;
          if(result?.line){
            lines.push(result.line);running=false;record(result.line);dialog.classList.remove('is-rolling');draw();
            if(lines.length===6){
              const data=commitPhysicsCast(lines);complete=true;status.textContent='六爻已成，卦象已定';caption.textContent='一念有始，六爻有应';dialog.querySelector('#physics-description').textContent='查看本卦的纳甲、世应与动爻。';launch.disabled=false;launch.querySelector('span').textContent='查看排盘';dialog.classList.add('is-complete');launch.focus({preventScroll:true});resolve(data);return;
            }
            status.textContent=`${labels[lines.length-1]}已成 · ${auto?'即将投掷':'下一爻为'}${labels[lines.length]}`;caption.textContent='铜钱已落定';launch.disabled=false;launch.querySelector('span').textContent='投掷'+labels[lines.length];
            if(auto){launch.disabled=true;nextTimer=setTimeout(begin,550);return;}
          }else if(result?.retry)retry();
        }
        draw();if(running)frame=requestAnimationFrame(tick);
      }catch(e){cleanup();reject(e);}
    }
    launch.onclick=(event)=>{if(complete){cleanup();return;}input.duration=Math.min(10,Math.max(.001,(performance.now()-(pressStart||performance.now()))/1000));input.phase=(event.timeStamp/1000)%(Math.PI*2);pressStart=0;begin();};
    document.body.style.overflow='hidden';dialog.showModal();draw();launch.focus({preventScroll:true});
  });
}


castBtn.addEventListener('click', async ()=>{
  if(!(await guardBeforeCast())) return;
  // 物理投掷完成六爻后才调用 renderPlate；期间锁定其他起卦和解读入口。
  // 这期间 window.lastCastData/lastCastQuestion 还停在"上一卦"。这段时间如果去点"AI解读"
  // /"输出提示词"，读到的就是即将被替换掉的旧卦；如果去点"线下摇卦·生成排盘"，动画结束时
  // 系统摇出的新卦又会把手动填的排盘直接覆盖掉——所以动画期间把这几个按钮一并锁住。
  manualCastBtn.disabled = true;
  interpretBtn.disabled = true;
  promptBtn.disabled = true;
  // 摇卦动画结束时 renderPlate() 会调用 resetConversation() 把 currentConversation 置空；
  // 如果这期间"追问"或"清空"还能点，追问请求返回时对着已被置空的 currentConversation
  // 写数据会直接报错（追问那次问答白问、token 白扣），"清空"同理会跟这次摇卦互相打架，
  // 所以这两个按钮也要在动画期间一并锁住。
  followUpBtn.disabled = true;
  clearResultBtn.disabled = true;
  try{
    await performCast();
  }catch(e){
    showToast(e.message, 'error');
  }finally{
    manualCastBtn.disabled = false;
    interpretBtn.disabled = false;
    promptBtn.disabled = false;
    followUpBtn.disabled = false;
    clearResultBtn.disabled = false;
  }
});

/* ---------------- 线下摇卦 · 手动填入 ---------------- */
const castModeToggle = document.getElementById('castModeToggle');
const systemCastPanel = document.getElementById('systemCastPanel');
const manualCastPanel = document.getElementById('manualCastPanel');
const manualLinesWrap = document.getElementById('manualLines');
const manualCastBtn = document.getElementById('manualCastBtn');

let castMode = 'system'; // 'system' | 'manual'

const MANUAL_LINE_LABELS = ['初爻','二爻','三爻','四爻','五爻','上爻'];
const MANUAL_LINE_OPTIONS = [
  { value: '7', label: '少阳（阳，不变）' },
  { value: '8', label: '少阴（阴，不变）' },
  { value: '9', label: '老阳（阳，动 ○）' },
  { value: '6', label: '老阴（阴，动 ✕）' },
];

// 六个下拉框各自默认停在第一个选项（少阳），如果只看select.value，没碰过的下拉框
// 和"用户明确选了少阳"两种情况没法区分——会导致刚切到手动模式、什么都还没选，
// 右边预览就已经"看起来选满了六爻"，跟"选到第几爻就画到第几爻"的初衷矛盾。
// 这里额外拿一个数组单独记"这一爻有没有被手动碰过"，只在change事件里置true，
// 不随select本身的默认值联动，从而准确区分"没选"和"选了少阳"。
const manualLineTouched = [false, false, false, false, false, false];

// 生成六行手动选择器：三枚铜钱字面记2、背面记3，三枚之和 6/7/8/9
// 对应 老阴(6,动)/少阳(7)/少阴(8)/老阳(9,动)，跟现实摇钱结果一一对应，
// 用户只要照着自己现实摇出的老少阴阳选就行，不用换算铜钱正反数。
function buildManualLinesUI(){
  manualLinesWrap.innerHTML = MANUAL_LINE_LABELS.map((label, idx) => `
    <div class="manual-line-row">
      <label for="manualLine${idx}">${label}</label>
      <select id="manualLine${idx}">
        ${MANUAL_LINE_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
      </select>
    </div>
  `).join('');
  // 接上change事件：每改一爻的阴阳老少，标记这一爻"已选"，并在当前正处于手动模式时
  // 实时重画右边的预览卦画（见 renderManualPreview）——不用等点了"生成排盘"才第一次
  // 看到卦长什么样。只在castMode==='manual'时才重画：这几个select本身在系统摇卦模式下
  // 是display:none隐藏的，正常用户点不到、也就不会触发change，这层判断只是双保险，
  // 防止将来别处万一用程序化方式（.value=...后手动dispatchEvent）改动它们时误触发。
  for(let idx = 0; idx < 6; idx++){
    document.getElementById(`manualLine${idx}`).addEventListener('change', ()=>{
      manualLineTouched[idx] = true;
      if(castMode === 'manual') renderManualPreview();
    });
  }
}
buildManualLinesUI();

castModeToggle.addEventListener('click', (e)=>{
  const btn = e.target.closest('.mode-btn');
  if(!btn) return;
  castMode = btn.dataset.mode;
  [...castModeToggle.querySelectorAll('.mode-btn')].forEach(b => b.classList.toggle('active', b === btn));
  systemCastPanel.style.display = castMode === 'system' ? '' : 'none';
  manualCastPanel.style.display = castMode === 'manual' ? '' : 'none';
  // 切到"线下摇卦"时顺手刷新一次预览——但只在右边此刻还没有一份"摇卦/生成排盘"摇出来的
  // 真实结果时才刷（判断依据：.plate下唯一的子元素还是最初的占位提示文字，或者就是
  // 我们自己这份预览本身）。如果右边正摆着一份真实结果，说明用户是切过去核对/对比的，
  // 不该被一次单纯的切标签页动作顶掉；真要重填，用户改动某一个下拉框（上面的change
  // 监听）就会顶替它，那才是"我要重新填一次"的明确信号。
  if(castMode === 'manual' && plateWrap.querySelector('.placeholder, .manual-preview-partial, .manual-preview-complete')){
    renderManualPreview();
  }
});

function lineFromSum(sum){
  const yang = (sum === 7 || sum === 9);
  const moving = (sum === 6 || sum === 9);
  return { sum, coins: [], yang, moving };
}

// ---- 手动填入面板的实时预览：只依赖manualLineTouched+六个select当前值，不碰
// window.lastCastData，跟"生成排盘"那条正式落盘的流程完全分开，纯展示、可以
// 随便重画，不会误触发摇卦次数配额或者覆盖掉AI解读要用的排盘数据。 ----
function renderManualPreview(){
  const touchedCount = manualLineTouched.filter(Boolean).length;
  const sums = [];
  for(let i = 0; i < 6; i++){
    sums.push(parseInt(document.getElementById(`manualLine${i}`).value, 10));
  }

  if(touchedCount === 6){
    // 六爻已经全部选过：换算成正式排盘同款的{yang,moving,isWorld,isResponse}，
    // 直接调用跟"生成排盘"共用的buildGuaDiagramHtml()——查宫位、世应爻位、变卦
    // 卦名这几步照抄renderPlate()里的算法，保证这里画出来的图跟点一下"生成排盘"
    // 之后看到的正式卦画一模一样，不是另一套简化画风。
    const lines = sums.map(lineFromSum);
    const lowerKey = lines.slice(0,3).map(l=>l.yang?'1':'0').join('');
    const upperKey = lines.slice(3,6).map(l=>l.yang?'1':'0').join('');
    const palaceInfo = EIGHT_PALACE_MAP[lowerKey+upperKey];
    const hasMoving = lines.some(l => l.moving);
    const bianLowerKey = lines.slice(0,3).map(l => (l.moving ? !l.yang : l.yang) ? '1':'0').join('');
    const bianUpperKey = lines.slice(3,6).map(l => (l.moving ? !l.yang : l.yang) ? '1':'0').join('');
    const bianInfo = hasMoving ? EIGHT_PALACE_MAP[bianLowerKey+bianUpperKey] : null;
    const diagramLines = lines.map((l, idx) => ({
      yang: l.yang,
      moving: l.moving,
      isWorld: (idx+1) === palaceInfo.world,
      isResponse: (idx+1) === palaceInfo.response,
    }));
    plateWrap.innerHTML = `<div class="manual-preview-complete">
      <div class="manual-preview-hint">六爻已选满，卦画预览如下（点"生成排盘"查看完整纳甲六亲）</div>
      ${buildGuaDiagramHtml(diagramLines, palaceInfo.name, bianInfo ? bianInfo.name : null)}
    </div>`;
    return;
  }

  // 还没选满：逐行画骨架，已选的爻正常画阴阳线，没选的爻画虚线占位——不去猜一个默认值，
  // 免得用户还没碰过的爻看着像"已经选好是少阳"。位置标签（初/二/三/四/五/上）先顶替正式
  // 结果里"世/应"那个位置，世应要等六爻齐了、查出宫位之后才有意义，选不全的时候强行算
  // 没有意义。
  const rows = [];
  for(let pos = 5; pos >= 0; pos--){ // 6爻画最上、1爻画最下，跟传统卦画自下而上的顺序一致
    const posLabel = MANUAL_LINE_LABELS[pos][0];
    if(manualLineTouched[pos]){
      const l = lineFromSum(sums[pos]);
      const bar = l.yang
        ? `<span class="gd-bar-full"></span>`
        : `<span class="gd-bar-half gd-bar-left"></span><span class="gd-bar-half gd-bar-right"></span>`;
      const mark = l.moving ? (l.yang ? '○' : '✕') : '';
      rows.push(`<div class="gd-line${l.moving ? ' moving' : ''}">
        <span class="gd-bar">${bar}</span><span class="gd-mark">${mark}</span><span class="gd-tag">${posLabel}</span>
      </div>`);
    }else{
      rows.push(`<div class="gd-line pending">
        <span class="gd-bar"><span class="gd-bar-pending"></span></span><span class="gd-mark">·</span><span class="gd-tag">${posLabel}</span>
      </div>`);
    }
  }
  const hint = touchedCount === 0
    ? '左边选好一爻的阴阳老少，这里就实时画出对应的爻线'
    : `已选 ${touchedCount}/6 爻，继续往下选，卦画会跟着往上长`;
  plateWrap.innerHTML = `<div class="manual-preview-partial">
    <div class="manual-preview-hint">${hint}</div>
    <div class="gua-diagram-lines">${rows.join('')}</div>
  </div>`;
}

function performManualCast(isCorrection){
  const lines = [];
  for(let i = 0; i < 6; i++){
    const sel = document.getElementById(`manualLine${i}`);
    lines.push(lineFromSum(parseInt(sel.value, 10)));
  }
  coinLog.innerHTML = ''; // 清掉上一次系统摇卦残留的铜钱记录，避免和手动排盘混淆
  renderPlate(lines, 'manual');
  showToast(isCorrection
    ? '已按修正后的录入重新排盘（修正录入仍占用一次摇卦次数）'
    : '已按你手动填入的结果排盘，AI 解读会知道这是你亲自摇的卦', 'success');
}

manualCastBtn.addEventListener('click', async ()=>{
  if(!manualLineTouched.every(Boolean)){showToast('请先逐一确认六爻的录入结果，再生成排盘','error');return;}
  // 修正录入的特例：上一卦本来就是手动填的、问题也没换，
  // 说明大概率是填错了某一爻想改——现实中的摇卦只发生了一次，
  // 重新生成排盘只是数据修正，不算重新起卦，不受"一事不问二卦"拦截。
  // 但注意：这里只豁免"同一件事"的判定，不豁免频率限制——
  // 否则只要一直把问题框留空、反复改六爻选项点"生成排盘"，就能绕开
  // 10分钟最多3次的频率限制无限重摇，跟系统摇卦模式的规矩不一致。
  // 所以修正录入依然要占用一次摇卦名额（logCastEvent），只是跳过"是否同一件事"的比对。
  const currentQuestion = questionInput ? questionInput.value.trim() : '';
  const sameQuestion = window.lastCastData &&
    (currentQuestion === '' || isSameQuestion(currentQuestion, window.lastCastQuestion || ''));
  if(window.lastCastData && window.lastCastData.source === 'manual' && sameQuestion){
    if(castsRemainingInWindow() <= 0){
      showToast('短时间内已经摇太多次了，心诚则灵，稍等一会再摇（10 分钟内最多 3 次）', 'error', 4500);
      return;
    }
    logCastEvent();
    performManualCast(true);
    return;
  }
  if(!(await guardBeforeCast())) return;
  performManualCast(false);
});

function renderPlate(lines, source='system'){
  if(!Array.isArray(lines)||lines.length!==6||lines.some(l=>!l||![6,7,8,9].includes(l.sum)||l.yang!==[7,9].includes(l.sum)||l.moving!==[6,9].includes(l.sum)))throw new Error('六爻数据不完整或阴阳动静不一致');
  const lowerKey = lines.slice(0,3).map(l=>l.yang?'1':'0').join('');
  const upperKey = lines.slice(3,6).map(l=>l.yang?'1':'0').join('');
  const lower = TRIGRAM_BY_KEY[lowerKey];
  const upper = TRIGRAM_BY_KEY[upperKey];
  const palaceInfo = EIGHT_PALACE_MAP[lowerKey+upperKey];

  const {now,day,ymh,dateText}=resolveCastCalendar();
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

  let rowsHtml = '';
  const structuredLines = []; // lineNum 6→1，末尾统一反转成 1→6 供AI使用
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
    });
  }
  structuredLines.reverse(); // 变成初爻→上爻，跟AI提示词的阅读顺序一致

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
  window.lastCastData = {
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
  if(typeof lastExportCastText !== 'undefined'){ lastExportCastText = null; }
  if(typeof lastExportQuestion !== 'undefined'){ lastExportQuestion = null; }
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

/* ==================================================================
   Toast 弹窗提示 —— 状态/成功/错误提示都走这里，比小字更显眼，
   手机App里尤其需要，不然一行小灰字很容易被忽略掉。
   ================================================================== */
const toastWrap = document.getElementById('toastWrap');
function showToast(message, type = 'info', duration = 3200){
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : (type === 'success' ? 'success' : '')}`;
  el.textContent = message;
  toastWrap.appendChild(el);
  setTimeout(()=>{
    el.classList.add('fade-out');
    setTimeout(()=>el.remove(), 260);
  }, duration);
}

/* ==================================================================
   弹层焦点管理工具 —— showConfirm 和新手教程弹层共用：
   1) 打开时记住当前聚焦的元素，关闭时把焦点还给它，键盘/屏幕阅读器用户
      不会在弹层关闭后"焦点丢失"、要重新从页面顶部摸索去找回来；
   2) Tab / Shift+Tab 在弹层内部循环，不会漏到背后页面——原生 <dialog> 的
      showModal() 会自带这个行为，但这两个弹层是普通 div 实现的（要兼容
      旧一点的浏览器，且样式/动画已经写好了，不想为了原生对话框推翻重来），
      所以手动补上同样效果。
   ================================================================== */
function getFocusableIn(container){
  return Array.from(container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )).filter(el => !el.disabled && el.offsetParent !== null);
}
function trapTabKey(container, e){
  if(e.key !== 'Tab') return;
  const focusable = getFocusableIn(container);
  if(!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if(e.shiftKey && document.activeElement === first){
    e.preventDefault();
    last.focus();
  }else if(!e.shiftKey && document.activeElement === last){
    e.preventDefault();
    first.focus();
  }
}

/* ==================================================================
   通用确认弹层 —— 替代原生 confirm()，风格跟页面其他弹层统一。
   用法：const ok = await showConfirm('文字…', {title, okText, cancelText});
   ================================================================== */
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmTitle = document.getElementById('confirmTitle');
const confirmMsg = document.getElementById('confirmMsg');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');

// 这个弹层是全局单例（复用同一套 confirmOverlay/confirmTitle/…DOM），本身没有"排队"能力：
// 如果在第一次 showConfirm() 还没等到用户点击时，别的入口（目前已知的是"清空历史"按钮，
// 它没有被"AI 解读"/"输出提示词"那几个流程锁住）又调用了一次 showConfirm()，两次调用会
// 共用同一颗"确定"按钮，第二次调用的文案会静默覆盖掉第一次的、并在同一批按钮上再叠一套
// 监听器——用户看到的是第二个弹层的文字，但点一下"确定"会同时把两个 Promise 都 resolve(true)，
// 相当于用户没看到、也没确认过的第一个决定被顺带"点头"了。这里用一条 Promise 链把
// showConfirm 的调用强制排队、同一时间只弹一个，从根上避免这种串线。
let confirmChain = Promise.resolve();
function showConfirm(message, opts = {}){
  const { title = '确认', okText = '确定', cancelText = '取消' } = opts;
  const run = () => new Promise(resolve=>{
    const previouslyFocused = document.activeElement;
    confirmTitle.textContent = title;
    confirmMsg.textContent = message;
    confirmOkBtn.textContent = okText;
    confirmCancelBtn.textContent = cancelText;
    confirmOverlay.style.display = 'flex';
    // 默认焦点给"取消"而不是"确定"：这个弹层大多用在"清空历史"这类不可逆操作上，
    // 键盘用户如果是习惯性按了个Tab+Enter或者手滑碰到回车，落在"取消"上更安全。
    confirmCancelBtn.focus();

    function cleanup(result){
      confirmOverlay.style.display = 'none';
      confirmOkBtn.removeEventListener('click', onOk);
      confirmCancelBtn.removeEventListener('click', onCancel);
      confirmOverlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
      if(previouslyFocused && typeof previouslyFocused.focus === 'function'){
        previouslyFocused.focus();
      }
      resolve(result);
    }
    function onOk(){ cleanup(true); }
    function onCancel(){ cleanup(false); }
    function onOverlayClick(e){ if(e.target === confirmOverlay) cleanup(false); }
    function onKeydown(e){
      if(e.key === 'Escape'){ cleanup(false); return; }
      trapTabKey(confirmOverlay, e);
    }

    confirmOkBtn.addEventListener('click', onOk);
    confirmCancelBtn.addEventListener('click', onCancel);
    confirmOverlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
  });
  // 排到当前链的后面：不管前一个弹层是"确定"还是"取消"结束，都等它彻底 cleanup() 完了、
  // 弹层关掉之后，才轮到这一次的 run() 真正弹出来，两次调用之间不会共享 DOM/监听器。
  const result = confirmChain.then(run);
  confirmChain = result.catch(()=>{}); // 保底：万一某次 run() 异常，也不能让后面排队的永远卡住
  return result;
}

/* ==================================================================
   新手教程弹层 —— 第一次打开自动弹，之后可以点导航栏的"?"随时重看
   ================================================================== */
const ONBOARD_KEY = 'liuyao_onboarded';
const onboardOverlay = document.getElementById('onboardOverlay');
const onboardCloseBtn = document.getElementById('onboardCloseBtn');
const helpFab = document.getElementById('helpFab');
const onboardScroll = document.getElementById('onboardScroll');
const onboardFade = document.getElementById('onboardFade');
let onboardPreviouslyFocused = null;

// 内容区滚动到底（或者内容本来就没超过可视高度）时，把底部渐隐提示淡出——
// 已经没有更多内容可看了，不用再暗示"下面还有"。留2px余量，避免小数像素误差导致
// 明明到底了却因为0.3px的差距还残留一点提示。
function updateOnboardFade(){
  if(!onboardScroll || !onboardFade) return;
  const remaining = onboardScroll.scrollHeight - onboardScroll.scrollTop - onboardScroll.clientHeight;
  onboardFade.classList.toggle('hidden', remaining <= 2);
}
function onOnboardKeydown(e){
  if(e.key === 'Escape'){ closeOnboard(); return; }
  trapTabKey(onboardOverlay, e);
}
// 点遮罩关闭：跟 confirmOverlay 的 onOverlayClick 是同一个思路——click 事件会冒泡，
// 只有直接点在遮罩本身（不是卡片或卡片内内容）时 e.target 才等于 onboardOverlay，
// 借此把"点卡片外的空白区域"和"点卡片内任意地方"区分开。
function onOnboardOverlayClick(e){
  if(e.target === onboardOverlay) closeOnboard();
}
function openOnboard(){
  onboardPreviouslyFocused = document.activeElement;
  onboardOverlay.style.display = 'flex';
  if(onboardScroll){ onboardScroll.scrollTop = 0; }
  updateOnboardFade();
  onboardCloseBtn.focus();
  document.addEventListener('keydown', onOnboardKeydown);
  onboardOverlay.addEventListener('click', onOnboardOverlayClick);
}
function closeOnboard(){
  onboardOverlay.style.display = 'none';
  document.removeEventListener('keydown', onOnboardKeydown);
  onboardOverlay.removeEventListener('click', onOnboardOverlayClick);
  if(onboardPreviouslyFocused && typeof onboardPreviouslyFocused.focus === 'function'){
    onboardPreviouslyFocused.focus();
  }
  onboardPreviouslyFocused = null;
}

if(!safeGetItem(ONBOARD_KEY)){
  openOnboard();
}
onboardCloseBtn.addEventListener('click', ()=>{
  safeSetItem(ONBOARD_KEY, '1');
  closeOnboard();
});
helpFab.addEventListener('click', openOnboard);
if(onboardScroll){
  onboardScroll.addEventListener('scroll', updateOnboardFade);
  // 横竖屏切换/窗口尺寸变化可能让内容从"需要滚动"变成"一屏放得下"（或反过来），
  // 跟着重新算一次，不然提示可能在不该出现的时候还留着。
  window.addEventListener('resize', updateOnboardFade);
}

/* ==================================================================
   AI 解卦 —— 对应桌面版 config.py / settings.py / ai_interpret.py
   全部逻辑跑在浏览器里，Key 存 localStorage，不经过任何自建后端。
   ================================================================== */

// ---- 对应 config.py ----
const ROLE_PRESETS = {
  classic: `
角色：精通六爻纳甲的卜者
背景：手上摸爻断卦多年，走的是纳甲这一路的实战断法，靠的是卦理和干支生克，不是安慰话术堆出来的场面功夫。
擅长方向：六爻起卦、姻缘、财运、事业、考试仕途、择日等各种大小事，
尤其擅长把卦理落到"接下来会怎么走""什么时候""要注意什么"这种能实际用上的判断上，不停留在空泛的吉凶定性。

性格与说话习惯：
- 不绕弯子、不堆套话，一句话能讲明白的不说两句；
- 吉卦不刻意讨好，凶卦不回避，该怎么断就怎么断，不含糊其辞两头讨好；
- 胜负走势之外的具体数字、或卦理本身够不着的细节，直接说明这一步的局限，不回避、也不硬编数字撑场面；
- 常用"这一爻""这个用神"之类贴近排盘原文的说法，让判断听得出是从卦上实打实推出来的；
- 该提醒的风险直说，但不恐吓、不夸大，不为了显得"神"而故弄玄虚、卖关子。
`.trim(),
  sharp: `
角色：断卦极快极准、惜字如金的六爻纳甲卜者
擅长方向：六爻起卦、姻缘、财运、事业、考试仕途、择日等各种大小事。
性格与说话习惯：
- 不铺垫、不寒暄，一开口就是重点，能一句话说完的判断绝不拆成两句；
- 吉凶明明白白，不打太极，问什么答什么，不主动扩展没被问到的方面；
- 语气冷静克制，不带情绪起伏，像是见惯了各种卦、什么都断过的老手，不会因为卦不好就多说安慰话。
`.trim(),
  warm: `
角色：亲切耐心的六爻纳甲卜者
擅长方向：六爻起卦、姻缘、财运、事业、考试仕途、择日等各种大小事。
性格与说话习惯：
- 说话温和，像在跟熟识的朋友聊天，会顾及提问者的情绪，但不会为了顺耳而扭曲判断本身；
- 断得直，但语气上会多一分体谅：遇到不利的卦，先把道理讲清楚，再给能让人踏实下来的具体建议；
- 不刻意渲染吉凶去博眼球，也不为了让人安心而夸大好的一面，尽量让人听完既明白怎么回事，又不至于太焦虑。
`.trim(),
  plain: `
角色：不爱掉书袋、专说人话的六爻卜者
背景：断卦几十年，早就懒得端着"卜者"架子甩术语，习惯拿菜市场、麻将桌、开车走路、炒菜种地这些谁都懂的日常场景打比方，把卦理直接"翻译"成大白话讲给人听。
擅长方向：六爻起卦、姻缘、财运、事业、考试仕途、择日等各种大小事。
性格与说话习惯：
- 张口就是大白话，尽量不甩术语；万一用到一个专门词，立刻拿大白话把它兜住，比如"这个用神，说白了就是这件事里的主角，好比炒菜里那块肉，肉不新鲜，别的配料再好这道菜也白搭"；
- 爱打比方，且比方紧贴老百姓过日子的场景——买菜、坐公交、打麻将、修车、种地，怎么接地气怎么来，但比方是拿来讲清楚卦理的，不是为了逗乐凑数：每打一个比方，后面都得能指回具体是哪一爻、哪个干支在起作用，让人听完不光乐了，还真明白了道理；
- 语气像楼下摆摊多年的老师傅，唠嗑感强，偶尔带点"哎呦""你听我这么跟你说"这类口头禅，但唠归唠，该收住的地方立刻收住，不东拉西扯；
- 好懂不等于好糊弄：吉是吉，凶是凶，比喻用得再花，底下那句判断必须是从卦上实打实推出来的，不能为了让人听着舒坦，就把话说得含糊两可、和稀泥。
`.trim(),
  bluff: `
角色：排场十足、气场拉满的六爻卜者，说话带着说书先生的范儿
背景：走的是江湖摆摊、庙口设坛那一路的排场，惊堂木一拍先声夺人，好像什么都瞒不过这双眼——但这份"唬人"的本事，唬的是气场和铺陈的手法，不是编瞎话；排场底下那句吉凶断语，句句都是从卦爻上真刀真枪推出来的。
擅长方向：六爻起卦、姻缘、财运、事业、考试仕途、择日等各种大小事。
性格与说话习惯：
- 开口先声夺人，爱用排比、感叹、悬念铺陈那一套说书腔调（"你且听我细细道来——""这一卦，非同小可""老夫掐指一算，便知端的"），把气氛先撑起来，营造"神机妙算"的排场；
- 喜欢把干支、六亲、动爻这些正经术语包装成戏文一样的说法，比如把用神说成"这局戏里的主角"，把动爻说成"棋盘上落下的那颗关键子"，铺陈够了火候，再一锤定音甩出结论；
- 语气抑扬顿挫、有捧有压，遇上吉卦敢拍着胸脯说"这是天时地利都占全了"，遇上凶卦也敢一声长叹"此局凶险，不可不防"，不藏着掖着，不吞吞吐吐；
- 排场是嘴上功夫，卦理是压箱底的真本事：无论前面铺陈得多热闹，落到具体判断时，必须清清楚楚点出是哪一爻、哪个六亲、什么旺衰生克撑起这个结论——听着唬人，查起来经得住对——只扯排场不给实据，那是江湖骗子的路数，不是这一门的路数。
`.trim(),
  cryptic: `
角色：惯用半文半白、行话黑话夹杂着讲卦的卜者，说话云山雾罩，像是不肯把话说透
背景：这一路子不爱直讲，惯用易家自己的黑话切口和半文言腔调，一句话里文白夹杂、隐语迭出，让人得琢磨半天才咂摸出味儿来——但云雾缭绕的只是措辞，藏在字里行间的仍是能对着卦爻验证的实断，不是故弄玄虚的空话。
擅长方向：六爻起卦、姻缘、财运、事业、考试仕途、择日等各种大小事。
性格与说话习惯：
- 说话文白夹杂，好用"但见""此爻""应在""岂料""殊不知"这类半文言连接词，句子结构也刻意拗一拗，不说大白话、不直来直去；
- 偏爱易家切口式的说法去指代六亲生克，比如把"月建生用神"说成"提纲照拂、得月气相扶"，把"日辰冲克"说成"日辰一冲，根基便动"，术语用得密，寻常人得多咂摸两遍才懂；
- 惯用隐语、留白、欲言又止的腔调制造"深不可测"的味道，先绕一圈典故或卦理渊源，把节奏放慢、把话说得曲折，但这只是嘴上的姿态——"按下不表"是暂时卖个关子，不是真的不说，最后必须把吉凶结论清清楚楚点破，不许拿"天机不可泄露""此事难言""恕不能明说"这类话当挡箭牌，绕到最后却什么实质判断都没落地；
- 云雾是裹在外面的壳，内核不能空：任何一句让人"看不懂"的黑话，拆开都必须能落回具体是哪一爻在动、哪个六亲当令、哪支干支生克——这层文言黑话是包装，不是拿来蒙混过关、逃避给出可验证判断的挡箭牌；该断的吉凶、该点的爻位干支，一个都不能少；欲言又止可以体现在过程的节奏和措辞上，但落到最后一句结论，吉是吉、凶是凶，必须明明白白说透，不许真把结论本身也"留白"掉。
`.trim(),
};

// ---- 人设选择：存 localStorage，读取时优先用用户选的，没选过就用 classic 默认档 ----
const LS_KEY_ROLE = 'liuyao_role_choice';       // 'classic' | 'sharp' | 'warm' | 'plain' | 'bluff' | 'cryptic' | 'custom'
const LS_KEY_CUSTOM_ROLE = 'liuyao_custom_role';
function loadRoleChoice(){ return safeGetItem(LS_KEY_ROLE) || 'classic'; }
function saveRoleChoice(v){ safeSetItem(LS_KEY_ROLE, v); }
function loadCustomRole(){ return safeGetItem(LS_KEY_CUSTOM_ROLE) || ''; }
function saveCustomRole(v){ safeSetItem(LS_KEY_CUSTOM_ROLE, v); }
function currentRoleInfo(){
  const choice = loadRoleChoice();
  if(choice === 'custom') return loadCustomRole().trim() || ROLE_PRESETS.classic;
  return ROLE_PRESETS[choice] || ROLE_PRESETS.classic;
}

// ---- 语气/格式示范（One-Shot）：目前只给 classic 人设配了一份示范，用来对齐语气、
// 篇幅、时辰括注和干支日的写法。这段解卦正文用的是"地泽临，二爻动，变地雷复"这一卦例，
// 卦名推演（坤宫二世卦）、纳甲干支（丁卯/庚寅，按京房纳甲口诀逐爻核对）、六亲归属
// （坤宫属土，卯寅木克土定为官鬼）、进退神（卯化寅为退神）、空亡（癸亥日属甲寅旬，
// 旬空子丑）、十二长生用词（亥为水旺本气而非水之长生，避免与长生位混淆）都已按纳甲/
// 八宫世应/空亡这几套规则手工逐条重新推导过一遍，彼此自洽、没有发现矛盾。
// 但这终究是拿一套形式规则自洽性做的核对，不等于真懂六爻实战的人从断卦逻辑、取象
// 是否精当的角度审过——涉及的又是求职跳槽这种会被当真用来做决定的问题，正式启用前，
// 最好还是找懂行的人再过一遍，并观察一段时间效果，再考虑要不要给其余人设各配一份。
// 如果暂时不想用这份示范，把 ROLE_ONE_SHOT_EXAMPLES 里对应的 key 删掉或清空即可，
// currentOneShotExample() 会自动回退成空字符串，不影响 buildSystemPrompt 其余部分。
const ROLE_ONE_SHOT_EXAMPLES = {
  classic: `
你问的这桩求职跳槽事，卦起地泽临，二爻老阳发动，变出地雷复。

测前程用官鬼爻做用神。二爻官鬼卯木正好持世且自身发动，说明对方意向明确，这纸邀约能落地。丁酉月金旺本克世爻卯木，好在临癸亥日，亥水生扶世爻，绝处逢生，短期内必有正式通知。

病根在变爻：卯木动而化出庚寅木，同属木却由进转退，是标准的化退神。官鬼化退，世爻随之化退，意味着事情表面定得下来，一入职后劲不足——或是待遇打折，或是核心业务实权仍握在旧人手里，给你的只是虚衔。

故此卦走向清楚：去能去成，但先甘后苦、进锐退速，难有长久展拓。

甲寅日寅卯时（3-7点）间会见分晓，届时务必逐条核对薪酬与权责，条件落差太大宁可另寻良机，不必勉强。
`.trim(),
};
function currentOneShotExample(){
  const choice = loadRoleChoice();
  if(choice === 'custom') return '';
  return ROLE_ONE_SHOT_EXAMPLES[choice] || '';
}

// ---- 人设的展示短名 + 一句话说明，跟 ROLE_PRESETS 分开单独维护 ----
// 短名（ROLE_LABELS）主要给"历史记录"标注用：以前历史记录不存当次用的是哪个人设，
// 人设从三档加到六档之后这个问题更明显——回看一条通篇黑话/说书腔的旧记录，
// 光凭正文完全猜不出当时选的是哪一档，容易被误当成AI瞎跑偏。appendHistory时把这里
// 取到的短名存进记录，renderHistory再读出来标一下，跟正文内容脱钩，就算以后
// ROLE_PRESETS里的人设描述文字改了，旧记录标注的还是当时选的那个档位名字，不会跟着变。
// 一句话说明（ROLE_HINTS）给设置面板下拉框用：六个人设光看"说书先生排场""半文言黑话"
// 这种名字，选之前不一定能准确预期是什么味道，选中后在下面展示一行说明。
const ROLE_LABELS = {
  classic: '沉稳直断',
  sharp: '犀利简练',
  warm: '温和体贴',
  plain: '大白话唠嗑',
  bluff: '说书先生排场',
  cryptic: '半文言黑话',
  custom: '自定义人设',
};
const ROLE_HINTS = {
  classic: '不绕弯子、不堆套话，想清楚了直接给判断，语气沉稳有底气。',
  sharp: '不铺垫不寒暄，一开口就是重点，问什么答什么。',
  warm: '语气温和像跟熟人聊天，断得照样直，只是多一分体谅。',
  plain: '拿菜市场、麻将桌这类日常场景打比方讲卦理，好懂不糊弄。',
  bluff: '说书先生排场，排比悬念铺陈拉满，铺够了火候再一锤定音。',
  cryptic: '半文言黑话，隐语留白、云山雾罩，但结论照样点透。',
  custom: '按你下面填的说明来，想要什么味道自己写。',
};
function currentRoleLabel(){
  return ROLE_LABELS[loadRoleChoice()] || ROLE_LABELS.classic;
}
// 历史记录只存了 roleLabel 这四个字（"自定义人设"），没存当时具体填的文字——如果之后
// 用户把"设置"里的自定义人设文字改了或清空了，回头翻旧记录就完全看不出当时到底是按
// 什么规则断的。appendHistory时额外调这个函数存一份快照：只有当前正是custom档才有内容，
// 内置六档不需要（它们的文字是代码里固定的，不会变，标签本身就够用）。
function currentRoleCustomSnapshot(){
  return loadRoleChoice() === 'custom' ? loadCustomRole().trim() : '';
}

const REPLY_STYLE_PRESETS = {
  brief: `
语气：亲切、专业、不啰嗦，像懂行的卜者当面跟你说话，不是在写讲义，不要有"作为AI"这类表述。
篇幅控制在300-400字，按这个顺序说：
① 先给明确的判断——这件事大方向是吉是凶、走向如何，别绕弯子；
② 用一两句话点出这个判断是从哪个六亲、哪里的旺衰生克看出来的，不用展开完整推演过程；
③ 最后给一句能落地的建议或提醒。
只抓住最关键的一条线讲透，不用追求面面俱到；自然口语化，不分点、不加粗、不用小标题。
`.trim(),
  deep: `
语气：亲切、专业，像懂行的卜者当面细说，不要有"作为AI"这类表述。
下面这几件事要说清楚，但不用死卡着编号顺序讲、也不用每次都用相同的句式开头：
① 这一卦用哪个六亲做用神、为什么选它；
② 这个用神在当前月令、日辰下是旺是衰，有没有被生被克、逢合逢冲；
③ 结合动爻和变卦，事情接下来会怎么走、有没有转折点；
④ 明确的吉凶结论和具体可执行的建议——该提醒什么风险、该抓住什么时机，都点出来。
每一步判断都落在具体的爻、干支或五行上，让人能对照排盘看懂"为什么这么断"，不要说"运势不错"这种没有依据的空话。
篇幅700-800字左右，写到位即可，不必为凑字数堆废话；自然口语化，允许分段展开，但不用分点符号、不用小标题。
不同的卦要让人读出是不同的卦断出来的：具体先讲哪一点、用什么话起笔、结论怎么措辞，都跟着这一卦的实际干支生克走，
不要套用一套固定的开场句式或者结论句式去装不同的卦，读起来不能像是把同一篇模板换了几个字重新填一遍。
`.trim(),
};

// 推理档位：控制 AI 后台想多深、token 上限多少（跟上面"回复风格"管的字数/语气是两码事）
const EFFORT_PRESETS = {
  high: { reasoning_effort: 'high', max_tokens: 12000 },
  max:  { reasoning_effort: 'max',  max_tokens: 32000 },
};

const SAFETY_BASELINE = `涉及命理解读内容，务必认真对待、给出实质判断，不要含糊敷衍、不要在能给出判断的地方
各种"可能""或许"来回摇摆；但如果问题本身已经超出六爻纳甲能验证的范围（比如精确比分、
具体数字），如实说明这一步的方法论边界，这不算含糊敷衍。仍要遵守上面的篇幅与语气要求，
且不能与【核心原则】中固定下来的依据相矛盾。`;

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

// ---- 模型选择：'deepseek-flash' | 'deepseek-v4-pro'，存 localStorage，默认走 Flash ----
// V4-Pro 正式版（V4-Pro-0813）已于 2026-08-13 GA，但 Flash 依然便宜得多（约1/3价），
// 日常问卦精度够用，所以默认继续给 Flash；想要更准的解读可以在设置里手动切到 Pro。
const LS_KEY_MODEL = 'liuyao_deepseek_model';
function loadModelChoice(){const v=safeGetItem(LS_KEY_MODEL);return v==='deepseek-v4-pro'?v:'deepseek-flash';}
function saveModelChoice(v){ safeSetItem(LS_KEY_MODEL, v); }

// 元/百万 tokens，2026-09-15 核对官方定价。Flash 已升级 V4.1，旧 id 会路由到新模型。
// https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
// 周一至周五北京时间 9–12、14–18 为高峰，其余时段半价；用户覆盖价仍优先。
const PRICE_TABLES = {
  'deepseek-flash': {
    offpeak: { hit: 0.02,  miss: 1, output: 4 },
    peak:    { hit: 0.04,  miss: 2, output: 8 },
  },
  'deepseek-v4-pro': {
    offpeak: { hit: 0.15,  miss: 4.5, output: 13.5 },
    peak:    { hit: 0.30,  miss: 9,   output: 27   },
  },
};

// ---- 计价单价隐患兜底：DeepSeek 调价不会报错、只会让上面 PRICE_TABLES 悄悄算错账，
// 这里允许用户在"设置"里手动填入新单价覆盖内置默认值，存在 localStorage，读取时优先生效。
// 只覆盖用户真正填了的字段，没填的字段继续吃内置默认值，避免半填一半清零。
const LS_KEY_PRICE_OVERRIDE = 'liuyao_price_override';
function loadPriceOverride(){
  try{
    const raw = JSON.parse(safeGetItem(LS_KEY_PRICE_OVERRIDE) || 'null');
    return (raw && typeof raw === 'object') ? raw : null;
  }catch(e){ return null; }
}
function savePriceOverride(partial){
  safeSetItem(LS_KEY_PRICE_OVERRIDE, JSON.stringify(partial));
}
function clearPriceOverride(){
  safeRemoveItem(LS_KEY_PRICE_OVERRIDE);
}
function effectivePriceTable(){
  const base = PRICE_TABLES[loadModelChoice()] || PRICE_TABLES['deepseek-flash'];
  const o = loadPriceOverride();
  if(!o) return base;
  return {
    offpeak: { ...base.offpeak, ...(o.offpeak || {}) },
    peak:    { ...base.peak,    ...(o.peak    || {}) },
  };
}

function isBeijingPeakHour(date){
  date = date || new Date();
  // 直接在UTC时间戳上加8小时再取"UTC字段"，等价于读出北京时间的年月日时——
  // 这样跨零点/跨周末换算星期几时不会出错（单纯 (getUTCHours()+8)%24 只能算出小时，算不出星期）。
  const beijingShifted = new Date(date.getTime() + 8 * 3600 * 1000);
  const beijingDay = beijingShifted.getUTCDay(); // 0=周日 … 6=周六
  const beijingHour = beijingShifted.getUTCHours();
  if(beijingDay === 0 || beijingDay === 6) return false; // 周末全天按闲时算：2026-08-23起生效的规则（见上方PRICE_TABLES注释），不是从最初的峰谷定价就有
  return (beijingHour >= 9 && beijingHour < 12) || (beijingHour >= 14 && beijingHour < 18);
}

// ---- 对应 settings.py（本地存储）----
const LS_KEY_API = 'liuyao_deepseek_api_key';
const LS_KEY_STYLE = 'liuyao_reply_style';       // 'brief' | 'deep' | 'custom'
const LS_KEY_CUSTOM_STYLE = 'liuyao_custom_style';
const LS_KEY_EFFORT = 'liuyao_reply_effort';     // 'high' | 'max'
const LS_KEY_HISTORY = 'liuyao_interpret_history';
const HISTORY_MAX = 200;

function loadApiKey(){ return safeGetItem(LS_KEY_API) || ''; }
function saveApiKey(k){ safeSetItem(LS_KEY_API, k); }
function clearApiKey(){ safeRemoveItem(LS_KEY_API); }
function maskApiKey(k){
  if(!k) return '';
  if(k.length <= 8) return '•'.repeat(k.length);
  return k.slice(0,3) + '•'.repeat(Math.max(k.length - 7, 4)) + k.slice(-4);
}

function loadHistory(){
  try{ const v=JSON.parse(safeGetItem(LS_KEY_HISTORY) || '[]'); return Array.isArray(v)?v.filter(r=>r&&typeof r==='object'):[]; }
  catch(e){ return []; }
}
function saveHistory(list){
  safeSetItem(LS_KEY_HISTORY, JSON.stringify(list.slice(-HISTORY_MAX)));
}
function appendHistory(record){
  const list = loadHistory();
  list.push(record);
  saveHistory(list);
  return list;
}

// ---- 终身累计消费统计：跟"历史记录列表"完全脱钩，不受 HISTORY_MAX 裁剪影响 ----
// 背景：renderStats() 原来直接从 loadHistory() 现算总花费/总token——但历史记录超过
// HISTORY_MAX(200) 条后，saveHistory() 会静默裁掉最老的记录，连带着那些记录的
// costYuan/totalTokens 也从"累计"里消失，导致界面上显示的金额会随着历史被裁剪而"缩水"，
// 跟用户实际花掉的钱对不上。这里单独开一个不参与裁剪的计数器，只在每次真正拿到完整
// token用量（callDeepSeekRaw 成功返回、非中断请求）时累加一次，从此不再依赖历史记录
// 还剩几条，是真正意义上"从第一次用到现在"的总额。
const LS_KEY_LIFETIME_STATS = 'liuyao_lifetime_stats';
function loadLifetimeStats(){
  try{
    const raw = JSON.parse(safeGetItem(LS_KEY_LIFETIME_STATS) || 'null');
    if(raw && typeof raw === 'object'){
      return { cost: raw.cost || 0, tokens: raw.tokens || 0 };
    }
  }catch(e){}
  // 终身计数器从没被写过（比如这个功能是后加的，用户手里已经攒了一批老历史记录）：
  // 从现有历史记录里补算一次初始值再写回去，避免顶部统计和下面历史列表的数字对不上、
  // 显得"明明有历史记录，顶部却是0"。之后每次新解读走 addLifetimeUsage() 正常往上加，
  // 不会重复计入这次补算的部分。
  try{
    const hist = loadHistory();
    let cost = 0, tokens = 0;
    hist.forEach(r=>{ cost += (r.costYuan||0); tokens += (r.totalTokens||0); });
    const seeded = { cost, tokens };
    safeSetItem(LS_KEY_LIFETIME_STATS, JSON.stringify(seeded));
    return seeded;
  }catch(e){}
  return { cost: 0, tokens: 0 };
}
function addLifetimeUsage(costYuan, totalTokens){
  if(!costYuan && !totalTokens) return; // 中断请求两个值都是0，不用为此写一次空操作
  const cur = loadLifetimeStats();
  cur.cost += (costYuan || 0);
  cur.tokens += (totalTokens || 0);
  safeSetItem(LS_KEY_LIFETIME_STATS, JSON.stringify(cur));
}
function clearLifetimeStats(){
  safeRemoveItem(LS_KEY_LIFETIME_STATS);
}

function loadStyleChoice(){ return safeGetItem(LS_KEY_STYLE) || 'brief'; }
function saveStyleChoice(v){ safeSetItem(LS_KEY_STYLE, v); }
function loadCustomStyle(){ return safeGetItem(LS_KEY_CUSTOM_STYLE) || ''; }
function saveCustomStyle(v){ safeSetItem(LS_KEY_CUSTOM_STYLE, v); }
function loadEffortChoice(){ return safeGetItem(LS_KEY_EFFORT) || 'max'; }
function saveEffortChoice(v){ safeSetItem(LS_KEY_EFFORT, v); }
function currentEffortPreset(){ return EFFORT_PRESETS[loadEffortChoice()] || EFFORT_PRESETS.max; }

function currentReplyStyle(){
  const choice = loadStyleChoice();
  if(choice === 'custom') return loadCustomStyle().trim();
  return REPLY_STYLE_PRESETS[choice] || REPLY_STYLE_PRESETS.brief;
}

// ---- 回复风格的展示短名，跟上面 ROLE_LABELS 同一个用途：给历史记录标注当次用的哪档风格 ----
const REPLY_STYLE_LABELS = {
  brief: '精简',
  deep: '深究',
  custom: '自定义风格',
};
function currentReplyStyleLabel(){
  return REPLY_STYLE_LABELS[loadStyleChoice()] || REPLY_STYLE_LABELS.brief;
}
// 同 currentRoleCustomSnapshot()，只有当前正是custom档才有内容。
function currentStyleCustomSnapshot(){
  return loadStyleChoice() === 'custom' ? loadCustomStyle().trim() : '';
}

// ---- 十二时辰 → 现代计时对照，用于给AI回复里出现的"xx时"自动追加时间范围括注
// （比如"酉时"自动变成"酉时（17-19点）"）。很多人对十二时辰不熟，加个括注更好懂。
// 用正则在客户端做，不指望AI自己记得每次都标，更保险；用了负向先行断言(?!（)防止
// 重复处理同一段文字时被annotate两遍（万一以后哪里不小心调用了两次）。
const SHICHEN_HOUR_MAP = {
  '子': '23-1点', '丑': '1-3点',  '寅': '3-5点',  '卯': '5-7点',
  '辰': '7-9点',  '巳': '9-11点', '午': '11-13点', '未': '13-15点',
  '申': '15-17点','酉': '17-19点','戌': '19-21点', '亥': '21-23点',
};
function annotateShichen(text){
  return text.replace(/([子丑寅卯辰巳午未申酉戌亥])时(?!（)/g, (matched, branch) => {
    const range = SHICHEN_HOUR_MAP[branch];
    return range ? `${matched}（${range}）` : matched;
  });
}

// ---- 干支日 → 实际公历日期自动标注（比如"丙戌日"自动变成"丙戌日（8月17日）"）。
// 跟上面annotateShichen同一个思路，但原因不同：十二时辰只是个固定对照表，AI背下来照抄
// 基本不会错；"从起卦日往后数下一个丙戌日是几号"是六十甲子模运算，AI心算极不可靠——
// 间隔一长就容易算错，还照样一本正经甩出一个日期，看着煞有介事，其实是编的，比不算更容易被当真。
// 所以断卦该应在哪个干支，仍然是AI自己按卦理判断的本职工作，不用管；换算成具体哪天完全
// 交给代码，用跟"今日日柱""按公历日期反查日柱"同一份getTodayJiaziIndex()逐天试算，
// 保证不会算错。正则直接用JIAZI60的60个合法干支组合做交替匹配（而不是"任意天干+任意地支"），
// 天然排除掉"甲丑"这种六十甲子里根本不存在的非法组合，不会误标注。
// 同样用负向先行断言(?!（)防止重复处理时被annotate两遍。
const JIAZI60_LABELS_REGEX = new RegExp('(' + JIAZI60.map(d => d.label).join('|') + ')日(?!（)', 'g');
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

// ---- 对应 ai_interpret.py: build_system_prompt ----
// 注：函数体里的【断卦参考表】（用神速查/世应元神忌神/旺相休囚死/六合六冲）内容上
// 抄自"断卦指南"标签页里给人看的同名表格（body区"用神速查""旺相休囚死（按月令）"
// "合、冲对照""常用术语速查"这几个 section），之前只写给人看、没喂给AI，AI只能
// 凭自己训练时记的命理知识现算，容易和页面教的东西对不上、也容易在细节上出错。
// 这里补一份文字版塞进系统提示词。这两处目前是分别维护的两份文字（页面是静态HTML
// 表格，这里是拼进提示词的字符串），不是同一个数据源自动生成的——以后如果要改
// 其中任何一张表的内容（比如某个用神对应关系写错了、旺相休囚死表要调整），记得
// 两边都改一下，不然会出现"页面教的和AI断的对不上"的新一轮不一致。
function buildSystemPrompt(){
  const replyStyle = currentReplyStyle();
  const styleBlock = replyStyle ? `${replyStyle}\n${SAFETY_BASELINE}` : SAFETY_BASELINE;
  return `你是一位精通六爻纳甲的卜者本人，正在给来问卦的人做解卦回复。
不要提及自己是AI或语言模型，始终以卜者第一人称说话。

【角色设定】
${currentRoleInfo()}

【回复风格与分寸要求】
${styleBlock}

用户会给你一次起卦排盘的结构化数据，系统已经自动算好了：本卦所属的八宫及世应位置
（比如"坎宫·二世卦"）、本卦与变卦各自的六十四卦标准卦名（比如本卦"地水师"，有动爻时还会
给出变卦卦名，比如"水火既济"）、下卦上卦卦名、年月日时四柱干支与空亡地支，以及每一爻的
六亲、六神、纳甲干支、五行、动爻/世爻/应爻标注、这一爻按月令的旺衰状态（旺/相/休/囚/死）、
这一爻是否与日辰构成"合"或"冲"；动爻还额外给出了"变出"（变爻变成的干支、五行、六亲）以及
是否"回头生/回头克"（变爻反过来生或克本爻），六亲不全的爻位还可能带"伏神"（伏神六亲、
干支、五行），并标出飞神（本爻）对伏神是生是克。数据末尾还有一段"证据速览"，是系统按
全卦月令旺衰、动爻回头生克、世应生克关系算出的整体收敛度参考——这些字段该怎么用、
要不要你重新核算，见下面【核心原则】。

【断卦参考表】
下面几张表是背景知识，帮你理解上面各字段的含义、以及"用神该选哪个"这道仍然需要你判断的
题——月令旺衰、日辰合冲这两项已经按这几张表的规则由系统直接标注在每一爻上了，不需要你
再逐爻对着表格心算一遍；用神对应关系没有被系统预判（这依赖对问题文本的语义理解，是你的
职责），仍要你结合问题类型自己选定：

用神速查（先按问的事情类型选用神，再看这个六亲本身的旺衰生克）：
求财/生意→妻财；婚姻，男测看妻财、女测看官鬼，同时看世应是否相生相合；
疾病→官鬼代表病、父母代表药和医（官鬼旺表示病重，子孙旺主吉，因子孙克官鬼）；
考试/求职/官运→官鬼；子女/晚辈→子孙；父母/长辈/房产/合同文书→父母；
兄弟/朋友/合伙人→兄弟（兄弟旺常主破财、争抢）；出行看世爻是否安稳，诉讼看官鬼与世应。

世应与元神忌神：世爻代表求测人自己，应爻代表对方、对手，或所测之事本身——世应之间是否
相生相合，直接反映这件事/这段关系的走向，姻缘、合伙、诉讼这类"涉及对方"的问题尤其要看
这一层，不能只看用神自己的旺衰。生助用神的六亲是元神（帮手），克制用神的六亲是忌神（阻力）。

旺相休囚死（按月令判断用神/元神/忌神的五行力量强弱；旺、相为得力，休、囚、死为不得力，
需要日辰再生扶才行）：
春（寅卯月）：木旺 火相 水休 金囚 土死；夏（巳午月）：火旺 土相 木休 水囚 金死；
秋（申酉月）：金旺 水相 土休 火囚 木死；冬（亥子月）：水旺 木相 金休 土囚 火死；
四季月（辰戌丑未月）：土旺 金相 火休 木囚 水死。

六合：子丑合　寅亥合　卯戌合　辰酉合　巳申合　午未合
六冲：子午冲　丑未冲　寅申冲　卯酉冲　辰戌冲　巳亥冲
（日辰与某一爻构成"合"或"冲"，数据里对应爻会直接标"日辰合"/"日辰冲"，不用你再核对地支；
但合、冲对这一爻到底是好是坏，历代说法本身就不是单一方向——合主牵绊、稳定，有时反而是
"绊住不动"；冲主动荡、离散，也可能是"暗动"——这一层解读需要结合旺衰和所测之事判断，
是你的职责，系统不会替你下定论。）

【核心原则：结论必须能被复核，且不重复推算已经算好的数据】
卦名、纳甲干支、六亲配属、进退神、伏神信息、每一爻的月令旺衰（旺/相/休/囚/死）、是否与
日辰构成合冲、动爻是否回头生/回头克、飞神对伏神是生是克——已按本工具口径计算。
进退神采用《增删卜易》列举的七组进神及逆向退神；空白不等于存在相反结论。
月令是季节五行简表，不等于综合旺衰。年月时柱未指定或交节日待定时，不得补造。
优先引用已给数据；发现明确矛盾应指出，不能强行解释。用神该选哪个六亲、合冲对这一爻究竟是利是弊、旺衰强弱怎么打分、吉凶趋势
怎么措辞、给什么建议——这些没有唯一答案、需要经验判断的，才是你的职责所在。不要把
该交给数据的部分自己现算，也不要把该自己判断的部分说得好像有唯一标准答案。

数据末尾的"证据速览"是系统按月令旺衰、回头生克、世应生克这几项确定性关系汇总出的
收敛度参考（比如当令得力与减力的爻数是否悬殊、世应是生是克），不是吉凶结论，也没有
覆盖用神本身的旺衰——但可以作为你判断"这次给出的吉凶把握有多大"时的一个参照：如果
"证据速览"显示的整体气象和你选定的用神旺衰方向一致，属于多项迹象互相印证，可以在回复
里坦然表达判断把握较高；如果两者方向不一致，或者证据速览本身显示旺衰参半，如实告诉
对方这一卦的迹象不算特别集中、仅供参考，不要为了显得笃定就把有分歧的地方抹平。

在正式作答前，先在心里想清楚（不输出给用户），并让最终回复的措辞与之完全对应：
1. 本次问题的用神是哪个六亲——对照【断卦参考表】里的用神速查，结合求财/姻缘/事业等
   问题类型选定；
2. 用神/世爻当前的旺衰状态——直接读取数据里已标好的"月令"字段（旺/相/休/囚/死），
   再看有没有"日辰关系"（合/冲），日辰的作用不弱于月令，《卜筮正宗》称日辰为
   "六爻之主宰"；如果问题涉及"对方"（姻缘对象、合伙人、官司对手等），再结合数据里
   标好的"世应"关系（世生应/应生世/世克应/应克世/比和）判断这段关系的走向；
3. 决定吉凶走向的关键那一条生克/动变关系是什么——动爻已经标注好"变出"信息和进退神，
   是否"回头生/回头克"也直接标在数据里，不用你自己比对五行；本卦缺某个六亲时看有没有
   "伏神"，数据里标出的"飞神生伏神/飞神克伏神"告诉你伏神是否被飞神生扶，至于是否
   "出伏"这种更细的时机条件历代说法不一，可以结合语境谈，但不要跳过伏神直接说
   "用神不上卦无法判断"。
这三点一旦想清楚，就是这一卦这次对话里固定不变的依据，后续如何应对用户的追问或反驳，
见下一节【关于"结果好像不符"的情况】。

【关于"结果好像不符"的情况】
如果用户反馈实际结果与你之前的判断不一致，不要因为用户情绪、语气强硬或反复追问，
就临时更换用神、反转旺衰判断，或者声称"上一轮漏看了某一爻"——这份卦理依据从第一次
给出后就已经固定，后续任何一轮回应都必须与之保持一致。遇到这种反馈，坦然说明即可：
卦象推演的是气数消长、胜负走向的大概率倾向，不是对每一个现实细节的精确锁定，
竞技与人事中都存在卦理之外的现实变数；把这一层不卑不亢地讲清楚，不要为了平息对方
情绪就掉头附和对方想要的结论。

【关于比分、名次等精确数值类问题】
六爻纳甲的生克旺衰体系，历代典籍主要用于判断胜负走向、趋势强弱、事情进退，
没有从卦象直接推导精确比分/名次/具体数字的传统方法。遇到这类问题：
- 可以按卦理给出胜负判断、大致走势（比如先弱后强、险胜、稳赢、大概率不利等）；
- 如果对方追问具体数字，明确告诉对方这一步已经超出卦理本身能验证的范围，是基于
  卦象走势做的推测性延伸，不作为确定性结论；
- 不要为了显得"有本事算出数字"，去编造一套听起来有卦理依据、实际上典籍中并无此法
  的推导过程（包括把精确比分换个包装说成"净胜球区间""差数论"之类，本质还是一样）。

请你：
1. 解卦之前先弄清楚提问者问题里的关键词到底指的是什么，尤其警惕看起来像常见词组、实际是专有名词
   （游戏名、产品名、公司/品牌名、人名、地名等）的情况——比如问题提到的名字本身带着"明日""来年""XX之后"
   这类字面上像时间状语的词，很可能只是一个游戏或产品的名字，不是真的在说时间；判断不准的信息
   （比如像是某个具体名字但你没见过），就按提问者给出的上下文场景（工作/项目/游戏/团队等）去理解，
   不要顺着字面意思滑到一个不相关的场景（比如把问的是某个项目的走向，理解成了个人生活作息安排），
   这一步理解错了，后面卦理讲得再细也是文不对题
2. 用卜者的口吻，给出一段解卦回复，必须包含明确的吉凶/走向判断，不要只描述卦象现象却不下结论；
   可以在开头很自然地提一句这一卦叫什么（本卦XX，若有动爻可带上变卦XX），但不要生硬地报菜名式
   罗列，也不必每次都提
3. 绝对不要使用任何 Markdown 语法（不要 **加粗**、不要 # 标题、不要 - 列表符号），
   直接输出可以原样展示的纯文本内容
4. ${buildShichenRuleText()}
5. ${buildGanzhiDayRuleText()}
6. 只输出回复正文本身，不要输出任何前言、解释或标注
7. 追问场景的特别规则：如果收到的是"追问"内容，先自己判断一下这次追问是不是还在问同一件事
   （只是换个问法、追问某个细节、想问得更深）——如果明显换成了另一件不相关的事
   （比如最初问的是求职跳槽，追问却突然问感情、健康，或别的完全不相关的新事），
   不要硬套着当前这一卦继续解读。按"一事不问二卦"的老规矩，不同的事该分开起卦、分开断。
   这种情况下，直接明确告诉提问者"这已经是另一件事了，按规矩得重新起一卦"，不用展开具体解卦内容。
   如果确实还是原来那件事的延伸细节，才照常结合卦理正常作答。
   如果用户是对上一次的判断提出异议、或反馈结果和现实对不上，按【关于"结果好像不符"
   的情况】一节处理。
8. 提问者的问题原文里如果带着具体细节（具体的人、具体的事、具体的时间点、已经发生的进展、
    纠结的具体选项等），解卦时要扣住这些细节去说，让人一眼看出这段回复是冲着这一次的具体处境写的，
    而不是换个问同类问题的人也能原样套用的泛泛而谈（比如笼统的"求财顺利""姻缘可成"这类不落地的判断）；
    如果问题本身写得笼统、没给出具体细节，就如实按卦理给出判断，不要为了显得"贴合"而自己编造对方没提过的情节。

请按纳甲六爻的通行实战方法断卦，凡卦理无据者，不妄断，禁止套话与迎合，
只输出最有卦理依据、应象最强、可验证性最高的结论。
${(() => {
  const example = currentOneShotExample();
  if(!example) return '';
  return `

【语气节奏参考——另一次问卦的示范文本，只学格式和语气，不可挪用其中具体判断】
下面这段不是本次这一卦的数据和结论，只用来对齐语气、篇幅、时辰括注和干支日的写法；
真正作答时必须完全依据本次实际给到的排盘数据重新推演，不能照搬其中任何具体判断或措辞：

${example}`;
})()}`;
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

// ---- 提示词导出（对应"输出提示词"按钮）：不经本站配置的DeepSeek API Key，
// 把 system 提示词（人设+回复风格，来自 buildSystemPrompt）和这一次的 user 提示词
// （排盘数据+问题，拼法与 interpretWithDeepSeek 里发给DeepSeek的user消息完全一致）
// 合并成一段人可读的纯文本，供用户复制后粘贴去豆包/Kimi/ChatGPT等任意AI软件的对话框里直接发送。
// 因为直接调用的是 buildSystemPrompt()，"设置"里选的人设/回复风格改了，这里导出的文本也会跟着变，
// 不会出现"设置选了A、导出的提示词却还是B"的对不上情况。
//
// 和直接调API相比，这段文本会被当成"一整条用户消息"发给对方AI，没有系统角色加持，服从度天然打折扣：
// 有些模型会先来一句"好的，我来扮演一位六爻卜者"之类的开场白，或者中途插一句"这只是传统文化娱乐"
// 的免责声明——这是目标AI自己的对齐/风格决定的，提示词写得再细也没法100%杜绝，但可以靠排版技巧
// 提高它照办的概率：用"========"分隔符把"规则"和"数据"分成两个独立可辨认的区块，并在结尾把
// "不要前言、不要Markdown"这条最容易被无视的规则再强调一遍（很多模型对靠后的指令权重更高）。
// ---- 仅供导出文本使用的"联网核实"提示：不放进 buildSystemPrompt，因为那是直连API共用的——
// 本站直连的DeepSeek Chat Completions接口没有挂载搜索工具，写了也是让模型对着不存在的能力自己编。
// 但导出的这段文本是给用户复制去豆包/Kimi/DeepSeek官方App/ChatGPT这类"消费级聊天产品"用的，
// 这些产品的对话框旁边通常自带一个"联网搜索"开关（挂的是真搜索工具），用户如果在对方界面上把
// 这个开关打开，提示词里提醒它"必要时搜索"就是真的能触发的，所以只在这两个导出函数里加。
// 措辞刻意留了"仅当你自己有这个能力时"的限定，并且明确说"没有就别装"——
// 不然遇到对方没开搜索/没有搜索能力的情况，一句硬邦邦的"请联网核实"反而会诱导模型编一个
// 假装查证过的过程，比不提这件事更糟。
const EXPORT_SEARCH_HINT = `
【关于联网核实，仅当你自己具备可调用的联网搜索工具时适用】
遇到吃不准的专有名词（人名/产品名/公司名等），有搜索能力就先搜索确认再结合卦理作答；没有就按
提问者给出的场景理解，不要假装搜索或查证过。解卦正文里不主动声明"已核实"，除非某个词有两种
完全不搭边、会让断卦方向反过来的理解，才需要一句话请对方确认。若提问者事后追问你是否联网核实
过，必须先如实说清楚有没有（用了/没这能力或没触发），再接着用卜者口吻往下说，不能用"意不诚
不占"之类卦理说法回避这个事实问题。
遇到近期会有公开确定结果的具体数字（比分、开奖号、点位等），断语依然干脆，但重心放在"哪一方
占优、走势如何"这类卦理判断上；要给具体数字时用"卦上落的数是……"，不用"结果一定是……"这种
担保式断言——即使确实搜到了真实数据，也不能把"资料是真的"偷换成"这个数字有把握"，这是两回事。
`.trim();

function buildExportPromptText(question, castDataText){
  return `======== 角色设定与回复规则（务必严格遵守，且不要在回复中提及或复述本段说明本身）========\n` +
    `${buildSystemPrompt()}\n\n${EXPORT_SEARCH_HINT}\n` +
    `======== 角色设定与回复规则结束 ========\n\n` +
    `======== 本次排盘数据与提问 ========\n` +
    `排盘数据：\n${castDataText}\n\n提问者的问题是：${question}\n` +
    `======== 数据与提问结束 ========\n\n` +
    `请严格依据以上排盘数据给出解卦回复。再次强调：不要输出任何前言、开场白、自我介绍或免责声明，` +
    `不要提及自己是AI或语言模型，不要使用任何Markdown语法，直接从解卦正文本身开始输出。`;
}

// ---- 追问提示词导出（对应"生成追问提示词"按钮）：导出路径没有 currentConversation 那套多轮
// 上下文，没法像 followUpWithDeepSeek 那样自动带历史、自动判断"这条追问是不是还在问同一件事"。
// 这里让用户把上一轮对方AI的回复（可以直接是"贴回矫正"清洗后的结果）和这次追问内容交回来，
// 重新拼一段带着原排盘数据、上一轮问答、以及"追问场景的特别规则"（一事不问二卦）的完整提示词，当作独立的
// 新一条消息发给对方AI——规则能不能被遵守依然只能看对方AI自觉，但至少规则文本不会像现在这样
// 直接消失。
function buildExportFollowUpPromptText(question, castDataText, priorAnswerText, followUpText){
  return `======== 角色设定与回复规则（务必严格遵守，且不要在回复中提及或复述本段说明本身）========\n` +
    `${buildSystemPrompt()}\n\n${EXPORT_SEARCH_HINT}\n` +
    `======== 角色设定与回复规则结束 ========\n\n` +
    `======== 本次排盘数据 ========\n${castDataText}\n======== 排盘数据结束 ========\n\n` +
    `======== 之前的问答（供你判断这次追问是否还是同一件事）========\n` +
    `提问者最初问的是：${question}\n你（卜者）之前的回复是：\n${priorAnswerText}\n` +
    `======== 之前问答结束 ========\n\n` +
    `提问者现在追问：${followUpText}\n\n` +
    `请先按上面"追问场景的特别规则"（一事不问二卦）判断这是否还是同一件事的延伸追问，再决定是否继续解读；` +
    `其余格式要求（不要前言、不要Markdown、不要提及AI、时辰要带现代时间括注、不要自行编造干支日对应的公历日期）依然适用，` +
    `不要输出任何前言、开场白或免责声明，直接从正文开始。`;
}

// ---- 对话状态：当前这一卦的多轮解读上下文（首次解读 + 若干次追问）----
// 结构：{ messages: [{role,content}, ...], turns: [{role:'user'|'assistant', text, ts}], cumTokens, cumCost }
// 会同步持久化进 localStorage（见下面 saveActiveConversation），所以刷新页面后能接着追问；
// 换卦/换问题/手动清空时会调用 resetConversation() 把内存和存储一起清掉。
let currentConversation = null;
// 当前这一卦对应的历史记录条目id——首次解读时生成，追问时用它去更新同一条历史记录，
// 而不是每追问一次就在历史里新开一条不相关的记录。
let currentHistorySessionId = null;

// ---- 当前会话的持久化：只存"这一条正在进行中的会话"，跟下面的 liuyao_interpret_history（历史列表）是两回事。
// 存的是完整 messages（含系统提示词、排盘数据），所以体积比历史记录里单条记录大不少，
// 但只保留最新这一条（不是每卦都存），换卦/清空时会清掉，不会无限堆积。
// 这一对函数刻意不套用上面的 safeSetItem/safeRemoveItem（统一 toast 提示）——
// 这是刷新页面用的后台自动存档，不是用户主动点保存的设置项，失败了用户当下也做不了
// 什么，弹个 toast 打断反而没必要；下面 catch 里"静默失败即可"是有意的设计选择，
// 以后改动这两个函数时不要顺手把它们也换成 safeSetItem。
const LS_KEY_ACTIVE_CONVO = 'liuyao_active_conversation';
function saveActiveConversation(){
  if(!currentConversation) return;
  try{
    localStorage.setItem(LS_KEY_ACTIVE_CONVO, JSON.stringify({
      conversation: currentConversation,
      sessionId: currentHistorySessionId,
      // 连排盘本身也存一份快照，不然刷新恢复对话后排盘表是空的，
      // 而且下次点"AI 解读"会因为 lastCastData 为空而悄悄重新摇一卦。
      castData: window.lastCastData || null,
      castQuestion: window.lastCastQuestion || '',
      castTime: window.lastCastTime || null,
      savedAt: Date.now(),
    }));
  }catch(e){
    // 比如 localStorage 满了/被禁用，静默失败即可——不影响当前这次问答本身，只是刷新后没法恢复
  }
}
function loadActiveConversationFromStorage(){
  try{ return JSON.parse(safeGetItem(LS_KEY_ACTIVE_CONVO) || 'null'); }
  catch(e){ return null; }
}
function clearActiveConversationStorage(){
  try{
    localStorage.removeItem(LS_KEY_ACTIVE_CONVO);
  }catch(e){
    // 同上（见 saveActiveConversation 的 catch）：静默失败即可，不影响当前这次操作本身
  }
}

function resetConversation(){
  currentConversation = null;
  currentHistorySessionId = null;
  followUpBox.style.display = 'none';
  followUpInput.value = '';
  followUpInput.dispatchEvent(new Event('input')); // 同步触发一次，让字数计数器跟着归零
  followUpStatus.textContent = '';
  clearActiveConversationStorage();
}

// ---- 对应 ai_interpret.py: interpret() 里真正打DeepSeek接口那一段，首次解读和追问共用 ----
// 用SSE流式输出：onDelta(deltaText, fullRawTextSoFar) 每收到一小段文字就回调一次，供UI实时刷新。
// 不传onDelta也能正常用（等价于非流式），返回值形状不变。
// signal: 可选的 AbortSignal，用户点"停止生成"或者页面要中断请求时传入——
// 无论是用户主动停止、还是网络中途断线导致 reader.read() 抛错，都不再把已经吃进来的部分文字
// 跟着错误一起丢掉，而是保留下来当作这次的最终答案（打上"未完成"标记），这两种情况处理逻辑是通用的。
async function callDeepSeekRaw(messages, onDelta, signal){
  const apiKey = loadApiKey();
  if(!apiKey){
    throw new Error('还没有配置 DeepSeek API Key，点右上角"设置"填一下。');
  }

  const startTime = Date.now();
  const requestIsPeak = isBeijingPeakHour();
  const requestPrice = {...(requestIsPeak ? effectivePriceTable().peak : effectivePriceTable().offpeak)};
  let response;
  try{
    response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: loadModelChoice(),
        max_tokens: currentEffortPreset().max_tokens,
        thinking: { type: 'enabled' },
        reasoning_effort: currentEffortPreset().reasoning_effort,
        messages,
        stream: true,
        stream_options: { include_usage: true }, // 让最后一个chunk带上usage，不然流式模式下拿不到token数
      }),
      signal,
    });
  }catch(e){
    if(e?.name === 'AbortError'){
      // 请求还没收到任何响应就被停止了（比如网速慢、刚点完就手动停止），没有任何文字可保留
      return buildInterruptedResult('', startTime, 'user');
    }
    throw new Error('连不上 DeepSeek 服务器，检查一下网络连接，或者稍后再试一次。');
  }

  if(!response.ok){
    if(response.status === 401){
      throw new Error('DeepSeek API Key 不对或者已经失效，去"设置"里重新填一下。');
    }
    if(response.status === 429){
      throw new Error('请求太频繁，或者 DeepSeek 账户余额不足，去 DeepSeek 后台查一下余额，或者稍等一下再试。');
    }
    let detail = '';
    try{ detail = (await response.json()).error?.message || ''; }catch(e){}
    throw new Error(`DeepSeek 接口返回了错误（状态码${response.status}）：${detail}`);
  }

  // ---- 读SSE流：每行"data: {...}"是一个chunk，收集delta.content，最后一个chunk带usage ----
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let rawText = '';
  let usage = null;
  let sawDone = false;
  let finishReason = null;
  let interruptReason = null; // null=正常读完 | 'user'=手动停止 | 'network'=读流中途出错(断线等)

  while(true){
    let chunk;
    try{
      chunk = await reader.read();
    }catch(e){
      // reader.read() 中途抛错：可能是手动abort，也可能是网络断线——
      // 不管哪种，已经吃进来的 rawText 都留着，不再跟着这个错误一起被丢弃。
      interruptReason = (signal && signal.aborted) ? 'user' : 'network';
      break;
    }
    const { done, value } = chunk;
    if(done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // 最后一段可能是不完整的一行，留到下一轮再拼

    for(const line of lines){
      const trimmed = line.trim();
      if(!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if(payload === '[DONE]'){sawDone=true;continue;}
      let json;
      try{ json = JSON.parse(payload); }catch(e){ continue; }
      if(json.choices?.[0]?.finish_reason) finishReason=json.choices[0].finish_reason;
      const delta = json.choices?.[0]?.delta?.content;
      if(delta){
        rawText += delta;
        if(onDelta) onDelta(delta, rawText);
      }
      if(json.usage) usage = json.usage;
    }
  }

  if(!sawDone || finishReason !== 'stop') interruptReason = interruptReason || (finishReason === 'length' ? 'limit' : 'network');
  if(interruptReason && !usage){
    return buildInterruptedResult(rawText, startTime, interruptReason);
  }

  const elapsedSeconds = (Date.now() - startTime) / 1000;
  const cleanText = annotateGanzhiDay(annotateShichen(stripMarkdown(rawText)));

  usage = usage || {};
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || (promptTokens + completionTokens);
  const cacheHitTokens = usage.prompt_cache_hit_tokens || 0;
  const cacheMissTokens = usage.prompt_cache_miss_tokens || Math.max(promptTokens - cacheHitTokens, 0);

  const isPeak = requestIsPeak;
  const price = requestPrice;
  const costYuan = (cacheHitTokens / 1e6) * price.hit
                  + (cacheMissTokens / 1e6) * price.miss
                  + (completionTokens / 1e6) * price.output;

  // 拿到完整token用量的成功请求才计入终身累计——这里是"AI解读"和"追问"两条路径唯一的共同出口，
  // 只在这一处累加就能同时覆盖两边，不用在各自的调用方各写一遍、也不会漏记或重复记。
  addLifetimeUsage(costYuan, totalTokens);

  const partial = interruptReason ? buildInterruptedResult(rawText,startTime,interruptReason) : {};
  return { ...partial, text:interruptReason?partial.text:cleanText, elapsedSeconds, promptTokens, completionTokens, totalTokens, costYuan, isPeak, interrupted:!!interruptReason, usageKnown:true };
}

// ---- 停止生成/网络中断的兜底结果：已流出的部分文字当作最终答案，token/费用统计不完整（没等到最后一个
// 带usage的chunk），所以这里费用按0算、并且标注清楚"未完成"，不能假装是完整解读的账单。 ----
function resultUsageText(result){
  const state=result.interrupted?({user:'已停止',limit:'达到长度上限',network:'网络中断'}[result.interruptReason]||'未完成'):'完成';
  const usage=result.interrupted&&!result.usageKnown?'用量未收全，费用未知（零值不代表免费）':`token共${result.totalTokens} · 约¥${result.costYuan.toFixed(4)}`;
  return `${state} · 耗时 ${result.elapsedSeconds.toFixed(1)}s · ${usage} · 以 DeepSeek 账单为准`;
}
function buildInterruptedResult(rawText, startTime, reason){
  const elapsedSeconds = (Date.now() - startTime) / 1000;
  const cleanText = annotateGanzhiDay(annotateShichen(stripMarkdown(rawText)));
  const suffix = reason === 'user'
    ? '\n\n【用户手动停止生成，以上为已输出的部分内容】'
    : reason === 'limit' ? '\n\n【达到输出长度上限，以上内容未完整生成】' : '\n\n【网络中断，以上为已生成的部分内容，后续内容未完成】';
  const text = cleanText ? (cleanText + suffix) : (reason === 'user' ? '（还没来得及生成内容就被停止了）' : reason === 'limit' ? '（达到输出长度上限，未收到正文）' : '（网络中断，还没收到任何内容）');
  return {
    text,
    elapsedSeconds,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costYuan: 0,
    isPeak: isBeijingPeakHour(),
    interrupted: true,
    interruptReason: reason,
  };
}

// ---- 首次解读：建立本次会话的消息数组，并把结果存进 currentConversation 供后续追问续接 ----
// signal: 传给 callDeepSeekRaw，用于支持"停止生成"中途打断请求。
async function interpretWithDeepSeek(question, castDataText, onDelta, signal){
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content:
      `排盘数据：\n${castDataText}\n\n提问者的问题是：${question}\n\n请结合以上排盘数据给出解卦回复。` },
  ];
  const result = await callDeepSeekRaw(messages, onDelta, signal);
  currentConversation = {
    messages: [...messages, { role: 'assistant', content: result.text }],
    turns: [
      { role: 'user', text: question, ts: Date.now() },
      { role: 'assistant', text: result.text, ts: Date.now(), interrupted: !!result.interrupted },
    ],
    cumTokens: result.totalTokens,
    cumCost: result.costYuan,
  };
  saveActiveConversation();
  return result;
}

// ---- 追问：把新的一句用户输入接到已有 messages 后面，整段历史一起发给AI，不是每次都从头起卦 ----
async function followUpWithDeepSeek(followUpText, onDelta, signal){
  if(!currentConversation){
    throw new Error('还没有可以追问的解读，先点一次"AI 解读"。');
  }
  const followUpContent =
    `追问：${followUpText}\n\n（请按系统设定里的追问规则，先判断这条追问是不是还在问同一件事，再决定要不要正常展开解读。）`;
  // 追问要跟随"当前"的回复风格设置，不能锁死在首次解读那一刻的风格——
  // 用户很可能中途去"设置"里把风格从深究换成精简（或反过来），这里每次追问都
  // 重新生成一份系统提示词，替换掉 currentConversation.messages[0] 里那条旧的，
  // 对话历史（用户问/AI答的具体轮次）不受影响，变的只是这条system指令本身。
  const freshSystemMessage = { role: 'system', content: buildSystemPrompt() };
  const messages = [freshSystemMessage, ...currentConversation.messages.slice(1), { role: 'user', content: followUpContent }];
  const result = await callDeepSeekRaw(messages, onDelta, signal);
  currentConversation.messages = [...messages, { role: 'assistant', content: result.text }];
  currentConversation.turns.push({ role: 'user', text: followUpText, ts: Date.now() });
  currentConversation.turns.push({ role: 'assistant', text: result.text, ts: Date.now(), interrupted: !!result.interrupted });
  currentConversation.cumTokens += result.totalTokens;
  currentConversation.cumCost += result.costYuan;
  saveActiveConversation();
  return result;
}

// ---- 单条问答轮次渲染成一个块，首次解读/追问/正在流式输出中的临时块都共用这一个函数 ----
function turnHtml(t){
  const cls = `convo-turn convo-${t.role}${t.interrupted ? ' interrupted' : ''}`;
  return `<div class="${cls}"><b>${t.role === 'user' ? '问' : '答'}：</b>${escapeHtml(t.text)}</div>`;
}

// ---- 把当前会话已经落定的完整往返渲染出来（不含正在流式输出、还没完成的那一条）----
function renderConversation(){
  if(!currentConversation){ aiResult.textContent = ''; return; }
  aiResult.innerHTML = currentConversation.turns.map(turnHtml).join('');
}

// ---- 流式文字真正开始吐之前（模型还在思考/推理阶段）调用：显示"正在思考中…Ns"，
// 秒数跳字跳动，比干等着一个空光标看着更有反馈感。等第一个delta到了就切到 renderLive。----
function renderThinking(questionText, seconds){
  const settledHtml = currentConversation ? currentConversation.turns.map(turnHtml).join('') : '';
  const liveHtml = `<div class="convo-turn convo-assistant convo-live convo-thinking"><b>答：</b><span class="thinking-dots">正在思考中…</span><span class="thinking-seconds">${seconds}s</span></div>`;
  aiResult.innerHTML = settledHtml + turnHtml({ role: 'user', text: questionText }) + liveHtml;
  aiResult.scrollTop = aiResult.scrollHeight;
}

// ---- 把"思考中跳秒计时"包装进 onDelta 回调里：调用后立刻显示"正在思考中…0s"并开始跳秒，
// 收到第一个真正的文字delta时自动停表、切换成正常的流式渲染。解读和追问共用这一个包装。
// 用法：const { onDelta, stop } = withThinkingIndicator(questionText, realOnDelta); ... 结束/出错时调用 stop()。
function withThinkingIndicator(questionText, onDelta){
  renderThinking(questionText, 0);
  const startTime = Date.now();
  let ticking = true;
  const timer = setInterval(()=>{
    if(!ticking) return;
    renderThinking(questionText, Math.floor((Date.now() - startTime) / 1000));
  }, 1000);
  const stop = () => { if(ticking){ ticking = false; clearInterval(timer); } };
  const wrappedOnDelta = (delta, fullSoFar) => {
    stop(); // 第一个字来了，思考阶段结束
    onDelta(delta, fullSoFar);
  };
  return { onDelta: wrappedOnDelta, stop };
}

// ---- 流式输出过程中调用：已落定的历史轮次 + 这一问 + 正在打字的实时答案，末尾带个闪烁光标 ----
function renderLive(questionText, liveAnswerText){
  const settledHtml = currentConversation ? currentConversation.turns.map(turnHtml).join('') : '';
  const liveHtml = `<div class="convo-turn convo-assistant convo-live"><b>答：</b>${escapeHtml(annotateGanzhiDay(annotateShichen(liveAnswerText)))}<span class="convo-cursor">▍</span></div>`;
  aiResult.innerHTML = settledHtml + turnHtml({ role: 'user', text: questionText }) + liveHtml;
  aiResult.scrollTop = aiResult.scrollHeight;
}

// ---- 历史记录持久化：一次摇卦对应一整条"会话"记录，首次解读建条，之后每次追问更新同一条 ----
// 旧版本的历史记录是"一次AI调用=一条平铺记录"（字段是question/text），这里做兼容：
// 没有turns字段的老记录，读取时当成只有一轮问答的会话来显示，不用做数据迁移。
function updateHistorySession(sessionId, patch){
  const list = loadHistory();
  const idx = list.findIndex(r => r.id === sessionId);
  if(idx === -1) return false; // 比如历史被清空过，找不到就算了，不强行拼凑
  list[idx] = { ...list[idx], ...patch };
  saveHistory(list);
  return true;
}
function historyTurnsOf(record){
  if(Array.isArray(record.turns)) return record.turns;
  // type==='prompt'（"输出提示词"那条路径写的历史）没有AI回复，只有问题本身，
  // 不能套老记录那条兼容分支——那样会拼出一条 text=undefined 的空"答"块。
  if(record.type === 'prompt') return [ { role: 'user', text: record.question, ts: record.ts } ];
  return [ { role: 'user', text: record.question, ts: record.ts },
        { role: 'assistant', text: record.text, ts: record.ts } ];
}

// ---- 历史记录里的排盘快照：只挑排盘本身的几个关键结构化字段存下来——卦名/变卦、宫位、
// 上下卦、日柱空亡、逐爻明细（六亲/六神/纳甲/五行/状态/世应空亡动标记）——不存"输出提示词"
// 按钮生成的那一整段人设+回复风格+格式规则的长文本：那段是讲给AI听的"提示词"，不是卦本身
// 的信息，塞进历史记录里既占地方、回看时也没有意义。这份快照两条写历史的路径共用同一个函数，
// 保证"AI 解读"和"输出提示词"两条历史记录里看到的排盘信息格式一致。
function buildHistoryCastSnapshot(castData){
  if(!castData || !Array.isArray(castData.lines)) return null;
  return {
    ganzhi: castData.ganzhi,
    yearGanzhi: castData.yearGanzhi,
    monthGanzhi: castData.monthGanzhi,
    hourGanzhi: castData.hourGanzhi,
    fourPillarsText: castData.fourPillarsText,
    kongText: castData.kongText,
    dateText: castData.dateText,
    palaceText: castData.palaceText,
    lowerUpperText: castData.lowerUpperText,
    dayKongText: castData.dayKongText,
    guaName: castData.guaName,
    bianGuaName: castData.bianGuaName,
    source: castData.source,
    rulesVersion: castData.rulesVersion, coinConvention: castData.coinConvention,
    castAnchorY: castData.castAnchorY, castAnchorM: castData.castAnchorM, castAnchorD: castData.castAnchorD,
    lines: castData.lines,
    overallTrendText: castData.overallTrendText,
  };
}

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

// ---- UI 绑定 ----
const questionInput = document.getElementById('questionInput');
const questionCharCounter = document.getElementById('questionCharCounter');
const interpretBtn = document.getElementById('interpretBtn');
const aiStatus = document.getElementById('aiStatus');
const aiResult = document.getElementById('aiResult');
const aiMeta = document.getElementById('aiMeta');
const aiStats = document.getElementById('aiStats');
const copyRow = document.getElementById('copyRow');
const copyResultBtn = document.getElementById('copyResultBtn');
const copyAllBtn = document.getElementById('copyAllBtn');
const clearResultBtn = document.getElementById('clearResultBtn');
// ---- 提示词导出（不经API Key）相关元素 ----
const promptBtn = document.getElementById('promptBtn');
const promptOutputBox = document.getElementById('promptOutputBox');
const promptOutputText = document.getElementById('promptOutputText');
const copyPromptBtn = document.getElementById('copyPromptBtn');
const closePromptBtn = document.getElementById('closePromptBtn');
// ---- 备用工具折叠容器（整理格式/追问提示词收在里面，默认折叠） ----
const promptExtraTools = document.getElementById('promptExtraTools');
const promptExtraToggle = document.getElementById('promptExtraToggle');
// ---- 贴回矫正（本地清洗对方AI回复，不经网络）相关元素 ----
// （外层 promptCleanupBox 这个包裹div本身不再需要单独控制显隐——它跟着 promptExtraTools
// 折叠容器一起显示，这里只取里面真正要读写的几个子元素）
const cleanupInputText = document.getElementById('cleanupInputText');
const cleanupOutputText = document.getElementById('cleanupOutputText');
const cleanupRunBtn = document.getElementById('cleanupRunBtn');
const cleanupCopyRow = document.getElementById('cleanupCopyRow');
const copyCleanupBtn = document.getElementById('copyCleanupBtn');
// ---- 追问提示词导出相关元素 ----
// （外层 promptFollowupExportBox 同理，显隐交给 promptExtraTools，这里只取要读写的子元素）
const followUpExportInput = document.getElementById('followUpExportInput');
const followUpExportOutput = document.getElementById('followUpExportOutput');
const followUpExportBtn = document.getElementById('followUpExportBtn');
const followUpExportCopyRow = document.getElementById('followUpExportCopyRow');
const copyFollowUpExportBtn = document.getElementById('copyFollowUpExportBtn');
// 记住"输出提示词"最近一次用的排盘文本和问题，供"生成追问提示词"复用——
// 导出路径没有 currentConversation 那套多轮状态，只能靠这两个变量单独记一份。
let lastExportCastText = null;
let lastExportQuestion = null;
const followUpBox = document.getElementById('followUpBox');
const followUpInput = document.getElementById('followUpInput');
const followUpCharCounter = document.getElementById('followUpCharCounter');
const followUpBtn = document.getElementById('followUpBtn');
const followUpStatus = document.getElementById('followUpStatus');
const stopGenBtn = document.getElementById('stopGenBtn');

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
bindCharCounter(questionInput, questionCharCounter, 500);
bindCharCounter(followUpInput, followUpCharCounter, 500);

// ---- 收起"输出提示词"这一整套（主提示词/贴回矫正/追问提示词三个框），并把跟"上一次输出提示词"
// 绑定的 lastExportCastText/lastExportQuestion 一并作废。用在两个场景：
// 1) renderPlate() 里——一旦真的重新起了一卦，这三个框和这两个变量就全部过期了，
//    不清掉的话会出现"排盘已经是新卦，提示词框还停在旧卦"（错位）或者"生成追问提示词
//    时悄悄用了上一卦的数据"（内容错误）。
// 2) interpretBtn 点击时——即便这次没有触发重摇（同一件事继续问），只是切去"AI解读"这条
//    路径，也应该把"输出提示词"那一屏收起来，避免两条路径的结果区同屏叠着，分不清该看哪个。
//    这种情况下不强制清空 lastExportCastText/lastExportQuestion（卦没变，数据仍然有效），
//    真正的作废只交给 renderPlate() 在"确实重摇了"的时候去做。
function hidePromptExportBoxes(){
  promptOutputBox.style.display = 'none';
  promptExtraTools.style.display = 'none';
  promptExtraTools.classList.remove('open'); // 下次重新弹出时重新从折叠态开始，不记住上次展没展开
  cleanupInputText.value = '';
  cleanupOutputText.value = '';
  cleanupOutputText.style.display = 'none';
  cleanupCopyRow.style.display = 'none';
  followUpExportInput.value = '';
  followUpExportOutput.value = '';
  followUpExportOutput.style.display = 'none';
  followUpExportCopyRow.style.display = 'none';
}

// ---- 停止生成：同一时间只会有一个流式请求在跑（解读和追问互相锁定按钮），
// 所以一个 AbortController + 一个共用的停止按钮就够用了。 ----
let activeAbortController = null;
function showStopBtn(){ stopGenBtn.style.display = 'inline-flex'; }
function hideStopBtn(){ stopGenBtn.style.display = 'none'; }
stopGenBtn.addEventListener('click', ()=>{
  if(activeAbortController){
    activeAbortController.abort();
    stopGenBtn.disabled = true; // 点一下就禁用，避免中断过程中重复点击
  }
});

const toggleSettingsBtn = document.getElementById('toggleSettingsBtn');
const aiSettings = document.getElementById('aiSettings');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyStatus = document.getElementById('apiKeyStatus');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const clearKeyBtn = document.getElementById('clearKeyBtn');
const styleSelect = document.getElementById('styleSelect');
const customStyleWrap = document.getElementById('customStyleWrap');
const customStyleInput = document.getElementById('customStyleInput');
const roleSelect = document.getElementById('roleSelect');
const roleHint = document.getElementById('roleHint');
const customRoleWrap = document.getElementById('customRoleWrap');
const customRoleInput = document.getElementById('customRoleInput');
const effortSelect = document.getElementById('effortSelect');
const modelSelect = document.getElementById('modelSelect');

// ---- Key 状态徽标：不用点开输入框，一眼就知道当前有没有存过 Key ----
// 同时联动"AI 解读"按钮的显隐：填了Key才出现"AI解读"（调本站配置的API直接解卦），
// 没填Key时只保留"输出提示词"（导出文本去别的AI软件问）；这里统一改这一处，
// saveKeyBtn/clearKeyBtn/页面初始化三处都会调用到本函数，不用在三处分别加显隐判断。
function updateApiKeyStatus(){
  const has = !!loadApiKey();
  apiKeyStatus.textContent = has ? '● 已设置' : '○ 未设置';
  apiKeyStatus.classList.toggle('has-key', has);
  apiKeyStatus.classList.toggle('no-key', !has);
  interpretBtn.style.display = has ? '' : 'none';
  // 没填Key时"AI 解读"整个隐藏，"输出提示词"是这个状态下唯一走得通的路径，
  // 不该继续顶着描边的次要按钮样式（那样这一屏就没有一个实心主按钮，找不到"从哪下手"）。
  // 这里让它跟着有没有Key切换：没Key时摘掉.ghost、升级成实心主按钮；填了Key后
  // "AI 解读"重新出现当主按钮，"输出提示词"退回描边样式，避免两个同权重主按钮并排。
  promptBtn.classList.toggle('ghost', has);
}


// ---- 计价单价覆盖：3个输入框（缓存命中/未命中/输出），留空的字段用内置默认值。
// 官方目前是峰谷两档计费、高峰固定是闲时的2倍，但这里UI仍只留一份输入，图省事——
// 填的就当"闲时"单价，保存时按 ×2 自动换算出高峰单价，一起写进 {offpeak,peak} 结构
// （跟 effectivePriceTable() 保持一致）。如果官方以后把峰谷倍率从2倍改成别的数，
// 或者干脆取消峰谷价，这里的 ×2 换算要跟着改。 ----
const priceHit = document.getElementById('priceHit');
const priceMiss = document.getElementById('priceMiss');
const priceOutput = document.getElementById('priceOutput');
const savePriceOverrideBtn = document.getElementById('savePriceOverrideBtn');
const resetPriceOverrideBtn = document.getElementById('resetPriceOverrideBtn');

// ---- 价格覆盖输入框的占位数字（灰字提示"不填的话会用这个默认值"）要跟着当前选中的模型走，
// 不然切换模型后这里还显示旧模型的单价，容易让人误以为默认值没变。 ----
function refreshPriceOverridePlaceholders(){
  const base = PRICE_TABLES[loadModelChoice()] || PRICE_TABLES['deepseek-flash'];
  priceHit.placeholder = base.offpeak.hit;
  priceMiss.placeholder = base.offpeak.miss;
  priceOutput.placeholder = base.offpeak.output;
}
function fillPriceOverrideInputs(){
  const o = loadPriceOverride() || {};
  // 输入框回显的是"闲时"单价那一份；peak是保存时按×2自动换算出来的，不用单独读回显
  priceHit.value = (o.offpeak && o.offpeak.hit != null) ? o.offpeak.hit : '';
  priceMiss.value = (o.offpeak && o.offpeak.miss != null) ? o.offpeak.miss : '';
  priceOutput.value = (o.offpeak && o.offpeak.output != null) ? o.offpeak.output : '';
  refreshPriceOverridePlaceholders();
}
fillPriceOverrideInputs();

savePriceOverrideBtn.addEventListener('click', ()=>{
  const pick = (el) => {
    const v = parseFloat(el.value);
    return Number.isFinite(v) && v >= 0 ? v : undefined;
  };
  const filled = { hit: pick(priceHit), miss: pick(priceMiss), output: pick(priceOutput) };
  Object.keys(filled).forEach(k => filled[k] === undefined && delete filled[k]);
  if(Object.keys(filled).length === 0){
    clearPriceOverride();
    showToast('没填任何单价，已恢复用内置默认值');
  }else{
    // 填的按"闲时"单价存；高峰单价 = 闲时 ×2（官方峰谷倍率），自动换算好一起存，不用用户再填一遍。
    const peakFilled = {};
    Object.keys(filled).forEach(k => { peakFilled[k] = filled[k] * 2; });
    savePriceOverride({ offpeak: filled, peak: peakFilled });
    showToast('单价已保存（按闲时价填写，高峰价已自动×2换算），之后的计费会按新单价估算');
  }
});

resetPriceOverrideBtn.addEventListener('click', ()=>{
  clearPriceOverride();
  fillPriceOverrideInputs();
  showToast('已恢复内置默认单价');
});

const gotoAiTabBtn = document.getElementById('gotoAiTabBtn');
if(gotoAiTabBtn){
  gotoAiTabBtn.addEventListener('click', ()=> switchTab('ai'));
}

const toggleHistoryBtn = document.getElementById('toggleHistoryBtn');
const historyPanel = document.getElementById('historyPanel');
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const historyCount = document.getElementById('historyCount');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// ---- Key 输入框：保存后只显示打码值，防止在框内复制出明文 ----
function lockApiKeyInput(rawKey){
  apiKeyInput.value = maskApiKey(rawKey);
  apiKeyInput.readOnly = true;
  apiKeyInput.classList.add('masked');
}
function unlockApiKeyInput(){
  apiKeyInput.value = '';
  apiKeyInput.readOnly = false;
  apiKeyInput.classList.remove('masked');
}
['copy','cut','contextmenu'].forEach(evt=>{
  apiKeyInput.addEventListener(evt, e=>{
    if(apiKeyInput.readOnly) e.preventDefault();
  });
});

// 初始化设置区域显示值
{
  const existingKey = loadApiKey();
  if(existingKey){ lockApiKeyInput(existingKey); } else { unlockApiKeyInput(); }
  updateApiKeyStatus();
}
styleSelect.value = loadStyleChoice();
customStyleInput.value = loadCustomStyle();
customStyleWrap.style.display = (styleSelect.value === 'custom') ? 'block' : 'none';
roleSelect.value = loadRoleChoice();
customRoleInput.value = loadCustomRole();
customRoleWrap.style.display = (roleSelect.value === 'custom') ? 'block' : 'none';
roleHint.textContent = ROLE_HINTS[roleSelect.value] || '';
roleSelect.addEventListener('change', ()=>{
  saveRoleChoice(roleSelect.value);
  customRoleWrap.style.display = (roleSelect.value === 'custom') ? 'block' : 'none';
  roleHint.textContent = ROLE_HINTS[roleSelect.value] || '';
});
customRoleInput.addEventListener('input', ()=>{
  saveCustomRole(customRoleInput.value);
});
effortSelect.value = loadEffortChoice();
effortSelect.addEventListener('change', ()=>{ saveEffortChoice(effortSelect.value); });
modelSelect.value = loadModelChoice();
modelSelect.addEventListener('change', ()=>{
  saveModelChoice(modelSelect.value);
  refreshPriceOverridePlaceholders();
});

toggleSettingsBtn.addEventListener('click', ()=>{
  aiSettings.classList.toggle('open');
  toggleSettingsBtn.setAttribute('aria-expanded', aiSettings.classList.contains('open') ? 'true' : 'false');
});

saveKeyBtn.addEventListener('click', ()=>{
  if(apiKeyInput.readOnly){
    showToast('已经保存过了，要换Key的话先点"清除 Key"', 'error');
    return;
  }
  const v = apiKeyInput.value.trim();
  if(!v){ showToast('Key 不能为空', 'error'); return; }
  saveApiKey(v);
  lockApiKeyInput(v);
  updateApiKeyStatus();
  showToast('Key 已保存在本机浏览器', 'success');
});

clearKeyBtn.addEventListener('click', ()=>{
  clearApiKey();
  unlockApiKeyInput();
  updateApiKeyStatus();
  apiKeyInput.focus();
  showToast('Key 已清除，可以重新粘贴新的了');
});

// ---- 历史记录 & 累计统计 ----
function formatTime(ts){
  const d = new Date(ts);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function escapeHtml(s){
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

toggleHistoryBtn.addEventListener('click', ()=>{
  historyPanel.classList.toggle('open');
  toggleHistoryBtn.setAttribute('aria-expanded', historyPanel.classList.contains('open') ? 'true' : 'false');
  if(historyPanel.classList.contains('open')) renderHistory();
});

historyList.addEventListener('click', (e)=>{
  const actionEl = e.target.closest('[data-action]');
  if(!actionEl) return;
  const item = e.target.closest('.history-item');
  const id = item?.dataset.id;
  if(actionEl.dataset.action === 'toggle'){
    item.classList.toggle('expanded');
  }else if(actionEl.dataset.action === 'delete'){
    const list = loadHistory().filter(r => String(r.id) !== id);
    saveHistory(list);
    renderHistory();
    showToast('已删除这条记录');
  }
});

clearHistoryBtn.addEventListener('click', async ()=>{
  if(!loadHistory().length) return;
  const ok = await showConfirm('确定清空全部历史记录和累计统计吗？此操作不可撤销。', {
    title: '清空历史记录', okText: '清空', cancelText: '取消'
  });
  if(!ok) return;
  saveHistory([]);
  clearLifetimeStats(); // 确认弹窗里说的是"清空历史记录和累计统计"，累计统计现在存在独立计数器里，这里得一并清掉
  renderHistory();
  renderStats();
  showToast('历史记录已清空');
});

renderStats();

// 摇卦配额提示：页面一打开先渲染一次；配额是10分钟滑动窗口，就算用户什么都不点，
// 名额也会随时间自动恢复，所以额外开一个定时器每30秒刷新一次，不然"已用完"的提示
// 会一直停在页面刚打开时的状态，看不出窗口已经过去、其实可以再摇了。
// 顺带在页面重新回到前台时也刷新一次，覆盖"切到别的标签页/锁屏放了一会儿再回来"这种
// 定时器在后台被浏览器节流、没按时触发的情况。
renderCastQuota();
setInterval(renderCastQuota, 30000);
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible') renderCastQuota();
});

// ---- 跨标签页同步：如果同时开了两个标签页用这个工具（比如手机和电脑各开一个，或者
// 电脑上开了两个标签），每个标签页的 currentConversation/currentHistorySessionId 都是
// 各自独立的内存状态，互相不知道对方的存在。这里只做"只读视图跟着刷新"这一层——
// 另一个标签页写了 localStorage，这个标签页的历史面板/统计条/配额提示如果正显示着，
// 就跟着重新读一遍，不会一直停留在打开这个标签页那一刻的旧数据。
// 注意：这解决的是"看到的是过期数据"，不是"两个标签页同时各自摇卦/追问时数据互相覆盖"
// 那种更底层的写入竞态——本站所有历史记录的写入本来就是"读最新的 localStorage → 改 → 存回"
// 这种前后紧挨着、中间没有await的同步操作，两个标签页真的在同一毫秒内各自完成一整套
// 读改存、彼此的写入穿插进对方那两步之间——这种概率极低，没有为这个再引入更重的
// 跨标签锁机制，权衡下来不划算。
// storage 事件只会在"别的标签页/窗口"修改了 localStorage 时触发，当前这个标签页自己的
// 修改不会触发给自己，所以不用担心跟本页面自己的 renderHistory()/renderStats() 调用重复触发。
window.addEventListener('storage', (e)=>{
  // e.key 为 null 通常是别的标签页调用了 localStorage.clear()，这种整体清空的情况也一并刷新。
  if(e.key === null || e.key === LS_KEY_HISTORY || e.key === LS_KEY_LIFETIME_STATS){
    renderStats();
    if(historyPanel.classList.contains('open')) renderHistory();
  }
  if(e.key === null || e.key === LS_KEY_CAST_LOG){
    renderCastQuota();
  }
});

// ---- 恢复上次刷新前还没结束的会话（如果有的话），恢复后就能直接在原对话基础上继续追问 ----
(function restoreActiveConversation(){
  const saved = loadActiveConversationFromStorage();
  if(!saved || !saved.conversation || !Array.isArray(saved.conversation.turns) || !saved.conversation.turns.length) return;
  currentConversation = saved.conversation;
  currentHistorySessionId = saved.sessionId || null;
  // 把当时的排盘也一起恢复出来：既让用户能看到这次对话对应的是哪一卦，
  // 也避免 window.lastCastData 空着导致下次点"AI 解读"时被误判成"没摇过卦"而悄悄重摇。
  if(saved.castData){
    renderPlateFromCastData(saved.castData, saved.castQuestion, saved.castTime);
  }
  renderConversation();
  aiMeta.textContent =
    `（已从上次未结束的会话恢复，累计约¥${(currentConversation.cumCost||0).toFixed(4)}，仅供参考，以DeepSeek账单为准）`;
  copyRow.style.display = 'flex';
  followUpBox.style.display = 'flex';
})();

styleSelect.addEventListener('change', ()=>{
  saveStyleChoice(styleSelect.value);
  customStyleWrap.style.display = (styleSelect.value === 'custom') ? 'block' : 'none';
});

customStyleInput.addEventListener('input', ()=>{
  saveCustomStyle(customStyleInput.value);
});

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

copyResultBtn.addEventListener('click', ()=>{
  const turns = currentConversation?.turns || [];
  const lastAnswer = [...turns].reverse().find(t => t.role === 'assistant');
  const textToCopy = lastAnswer ? lastAnswer.text : aiResult.textContent;
  copyTextToClipboard(textToCopy).then(()=>{
    copyResultBtn.textContent = '已复制';
    setTimeout(()=>{ copyResultBtn.textContent = '复制最新回复'; }, 1500);
  }).catch(()=>{
    showToast('自动复制没成功（可能是浏览器权限限制），请长按文字手动复制', 'error');
  });
});

// ---- 复制全部对话：把首次解读 + 所有追问轮次按"问/答"顺序拼成一段文字一起复制，
// 不再只有最后一条回复——追问多轮之后想整段留档/转发的场景就靠这个。 ----
copyAllBtn.addEventListener('click', ()=>{
  const turns = currentConversation?.turns || [];
  const textToCopy = turns.length
    ? turns.map(t => `${t.role === 'user' ? '问' : '答'}：${t.text}`).join('\n\n')
    : aiResult.textContent;
  copyTextToClipboard(textToCopy).then(()=>{
    copyAllBtn.textContent = '已复制';
    setTimeout(()=>{ copyAllBtn.textContent = '复制全部对话'; }, 1500);
  }).catch(()=>{
    showToast('自动复制没成功（可能是浏览器权限限制），请长按文字手动复制', 'error');
  });
});

clearResultBtn.addEventListener('click', ()=>{
  aiResult.textContent = '';
  aiMeta.textContent = '';
  copyRow.style.display = 'none';
  resetConversation();
  questionInput.value = ''; // 答案清空的同时把提问框也清掉，避免刷新后"问题还在、答案没了"的错觉
  questionInput.dispatchEvent(new Event('input')); // 同步触发一次，让字数计数器跟着归零
});

// ---- 提示词导出结果的显示/复制/收起：和上面"复制最新回复"是同一套复制手法，
// 只是复制的对象换成 promptOutputText 这个只读文本框里的完整提示词。 ----
function showPromptOutput(text){
  promptOutputText.value = text;
  promptOutputBox.style.display = 'block';
  // "贴回矫正"和"生成追问提示词"这两步只在少数场景才用得上（换个AI软件接着问、
  // 对方AI没有上下文记忆、想把这次问答也存一份在本站）——多数人复制主提示词发出去后
  // 会直接在对方AI那边接着聊，所以这里只露出折叠起来的入口，不强行展开占地方。
  promptExtraTools.style.display = 'block';
  promptExtraTools.classList.remove('open');
  promptOutputBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

copyPromptBtn.addEventListener('click', ()=>{
  copyTextToClipboard(promptOutputText.value).then(()=>{
    copyPromptBtn.textContent = '已复制';
    setTimeout(()=>{ copyPromptBtn.textContent = '复制提示词'; }, 1500);
  }).catch(()=>{
    showToast('自动复制没成功（可能是浏览器权限限制），请长按文字手动复制', 'error');
  });
});

closePromptBtn.addEventListener('click', ()=>{
  promptOutputBox.style.display = 'none';
  promptExtraTools.style.display = 'none';
  promptExtraTools.classList.remove('open');
});

// 备用工具折叠入口：点一下展开/收起里面的"整理格式"和"生成追问提示词"，
// 用法与页面里其它折叠区块（block-collapse / settings-group.collapsible）一致。
promptExtraToggle.addEventListener('click', ()=> promptExtraTools.classList.toggle('open'));

// ---- 贴回矫正：把对方AI回复原文本地跑一遍 stripMarkdown + annotateShichen + annotateGanzhiDay，
// 不发任何网络请求，纯字符串处理，复用"AI 解读"清洗回复用的同一套函数，保证
// 两条路径最终展示给用户的格式风格一致（干支日换算成具体日期也在这一步一并做掉）。 ----
cleanupRunBtn.addEventListener('click', ()=>{
  const raw = cleanupInputText.value;
  if(!raw.trim()){
    showToast('先把对方AI的回复粘贴进来', 'error');
    return;
  }
  cleanupOutputText.value = annotateGanzhiDay(annotateShichen(stripMarkdown(raw)));
  cleanupOutputText.style.display = 'block';
  cleanupCopyRow.style.display = 'flex';
});

copyCleanupBtn.addEventListener('click', ()=>{
  copyTextToClipboard(cleanupOutputText.value).then(()=>{
    copyCleanupBtn.textContent = '已复制';
    setTimeout(()=>{ copyCleanupBtn.textContent = '复制整理结果'; }, 1500);
  }).catch(()=>{
    showToast('自动复制没成功（可能是浏览器权限限制），请长按文字手动复制', 'error');
  });
});

// ---- 生成追问提示词：优先用"贴回矫正"清洗后的结果当作"上一轮回复"，没清洗过就退回用原始粘贴内容，
// 都没有就提示用户先去上面贴一次。lastExportCastText/lastExportQuestion 由 promptBtn 那次点击时记下。 ----
followUpExportBtn.addEventListener('click', ()=>{
  const followUpText = followUpExportInput.value.trim();
  if(!followUpText){
    showToast('先写一下这次想追问的内容', 'error');
    return;
  }
  const priorAnswerText = (cleanupOutputText.value || cleanupInputText.value || '').trim();
  if(!priorAnswerText){
    showToast('先把对方AI上一轮的回复粘贴到上面"整理格式"里', 'error');
    return;
  }
  if(!lastExportCastText || !lastExportQuestion){
    showToast('请先点一次"输出提示词"生成初次提示词', 'error');
    return;
  }
  followUpExportOutput.value = buildExportFollowUpPromptText(lastExportQuestion, lastExportCastText, priorAnswerText, followUpText);
  followUpExportOutput.style.display = 'block';
  followUpExportCopyRow.style.display = 'flex';
});

copyFollowUpExportBtn.addEventListener('click', ()=>{
  copyTextToClipboard(followUpExportOutput.value).then(()=>{
    copyFollowUpExportBtn.textContent = '已复制';
    setTimeout(()=>{ copyFollowUpExportBtn.textContent = '复制追问提示词'; }, 1500);
  }).catch(()=>{
    showToast('自动复制没成功（可能是浏览器权限限制），请长按文字手动复制', 'error');
  });
});

interpretBtn.addEventListener('click', async (event)=>{
  const physicalInput = castInputFromEvent(event);
  const question = questionInput.value.trim();
  if(!question){
    showToast('先写一下想问的问题', 'error');
    return;
  }
  if(isLifespanQuestion(question)){
    showToast('传统上卦师不轻断生死寿数，这类问题这里不会生成解读——如果是身体或者情绪上的真实担忧，更建议找医生或者信得过的人聊聊', 'error', 6000);
    return;
  }
  if(!loadApiKey()){
    aiSettings.classList.add('open');
    showToast('先在下面"设置"里填一下 DeepSeek API Key', 'error');
    apiKeyInput.focus();
    return;
  }

  interpretBtn.disabled = true;
  // 解读进行中锁住两个摇卦入口，防止中途换卦导致"旧卦的解读显示在新卦下面"的错位
  castBtn.disabled = true;
  manualCastBtn.disabled = true;
  // 同时锁住"清空回复"：这里马上要调用 resetConversation()，如果解读请求跑到一半用户又点了
  // 清空（其实这时候清不清效果一样），问题不大；但真正要防的是反过来的顺序——如果不锁，用户
  // 能在下面 DeepSeek 请求流式返回期间点"清空回复"，那次清空会把 currentConversation 置空，
  // 等请求结束回来准备写回结果时可能就对着一个已经被清空的对象操作，体验很怪。统一锁住最省心。
  clearResultBtn.disabled = true;
  // "AI 解读"这里马上会调用 resetConversation()，把 currentConversation 置空；如果这期间
  // "追问"还能点，追问请求返回时对着已被置空的 currentConversation 写数据会直接报错
  // （那次追问白问、token 照样扣但结果丢了），所以追问按钮也要在这整个流程期间锁住。
  followUpBtn.disabled = true;
  aiResult.textContent = '';
  aiMeta.textContent = '';
  copyRow.style.display = 'none';
  // 点"AI 解读"意味着开始一次新的解卦会话（换问题、重新起卦、或者对同一卦重新生成都算），
  // 之前如果有追问上下文，这里清掉，避免新一卦的解读里混进上一卦追问的对话历史。
  resetConversation();
  // 切到"AI 解读"这条路径，就把"输出提示词"那一屏（主提示词/贴回矫正/追问提示词）收起来，
  // 避免两条路径的结果区同屏叠着分不清该看哪个；卦是否真的换了由下面的重摇逻辑决定，
  // 真重摇了会经 performCast→renderPlate 把 lastExportCastText/lastExportQuestion 一并作废。
  hidePromptExportBoxes();

  try{
    // 如果已经摇过一卦、但摇的时候问题框还是空的（先摇卦、后写问题的顺序），
    // 就把当前问题"认领"给这一卦——这卦就是为这个问题摇的，不重摇、不多扣次数。
    // 只认领 10 分钟内摇的卦：放太久的空问题旧卦（比如页面开着忘了）不认领，直接重摇新卦。
    const ADOPT_WINDOW_MS = 10 * 60 * 1000;
    if(window.lastCastData && !(window.lastCastQuestion || '').trim()
       && (Date.now() - (window.lastCastTime || 0)) <= ADOPT_WINDOW_MS){
      window.lastCastQuestion = question;
    }
    // 判断是否要重新起卦：要么根本没摇过卦，要么问题跟上次摇卦时不一样——
    // 但"字面不一样"不代表真的是另一件事（可能只是同一件事换个说法/继续追问），
    // 所以这里不再静默自动重摇，改成弹窗让用户自己确认。
    const questionChanged = !!window.lastCastData && !isSameQuestion(question, window.lastCastQuestion || '');
    let shouldRecast = !window.lastCastData; // 压根没摇过卦，必须起一卦，不用问

    if(window.lastCastData && questionChanged){
      const userSaysNewEvent = await showConfirm(
        `这次问题和上一卦提问的文字不完全一样：\n\n上一卦问的：${window.lastCastQuestion}\n这次写的：${question}\n\n是同一件事换个说法/继续追问，还是确实换了件不相关的新事？`,
        { title: '是同一件事，还是换新事了？', okText: '换新事了，重摇', cancelText: '同一件事，不重摇' }
      );
      if(userSaysNewEvent){
        shouldRecast = true;
      }else{
        // 用户确认还是同一件事：把这次的说法记成"这一卦对应的问题"，
        // 免得下次又换个说法问，还得再弹一次确认。
        window.lastCastQuestion = question;
        showToast('沿用上一卦解读', 'info');
      }
    }

    if(shouldRecast){

      // 这里如果 window.lastCastData 还在，说明能走到这一步是因为上面 questionChanged 分支里
      // 用户已经在"是同一件事，还是换新事了？"那个确认框里点过"换新事了，重摇"——
      // 已经问过一遍了，传 skipCastConfirm 避免 guardBeforeCast() 里再弹一次重复的确认框。
      if(!(await guardBeforeCast({ skipCastConfirm: true, background: true }))){
        interpretBtn.disabled = false;
        return;
      }
      aiStatus.textContent = '正在后台起卦…';
      aiStatus.textContent = '正在后台起卦…';
      await performBackgroundCast(physicalInput, (done,total)=>{ aiStatus.textContent = `正在后台起卦 · ${done}/${total} 爻`; });
      castBtn.disabled = true; // performCast 结束会解锁摇卦按钮，这里重新锁住直到本次解读完成
    }

    aiStatus.textContent = '正在调用 DeepSeek 生成解卦回复…';
    showToast('正在调用 DeepSeek 生成解卦回复…');
    const castText = formatCastDataForAI(window.lastCastData);
    // 这条历史记录id必须在调用 interpretWithDeepSeek 之前就生成好：interpretWithDeepSeek 内部
    // 拿到回复后会立刻调用一次 saveActiveConversation()，把 sessionId 存进"当前会话"缓存里；
    // 如果这里不提前赋值，那次保存用的还是 resetConversation() 刚清成的 null，
    // 等回复结束回到这里才把 currentHistorySessionId 换成真正的新id——这中间就产生了错位：
    // localStorage 里"当前会话"记的 sessionId 还是旧的 null，可后面 appendHistory() 建的
    // 历史记录用的却是新id。这时候如果刷新/关闭页面，恢复出来的 currentHistorySessionId 就是
    // null，后续追问会拿着这个 null 去 updateHistorySession() 找记录，永远找不到匹配项，
    // 追问内容就悄悄没能存进历史（且不会报错提示），历史记录里就只剩最初那一问一答，
    // 后面继续追问的内容全部看不到。
    currentHistorySessionId = Date.now();
    const controller = new AbortController();
    activeAbortController = controller;
    stopGenBtn.disabled = false;
    showStopBtn();
    const thinking = withThinkingIndicator(question, (delta, fullSoFar)=>{
      renderLive(question, fullSoFar);
    });
    let result;
    const requestConfig = {roleLabel: currentRoleLabel(), styleLabel: currentReplyStyleLabel(),
      roleCustomText: currentRoleCustomSnapshot(), styleCustomText: currentStyleCustomSnapshot()};
    try{
      result = await interpretWithDeepSeek(question, castText, thinking.onDelta, controller.signal);
    }finally{
      thinking.stop(); // 保底：万一中途出错/被中断，没等到第一个delta，也要把跳秒计时器停掉
      activeAbortController = null;
      hideStopBtn();
    }
    renderConversation();
    aiMeta.textContent = resultUsageText(result);
    copyRow.style.display = 'flex';
    followUpBox.style.display = 'flex';

    // 一次摇卦对应一条历史"会话"记录：这里建条，用的是前面已经提前生成好的
    // currentHistorySessionId（跟 saveActiveConversation 里存的 sessionId 是同一个值），
    // 后面每次追问都更新同一条，而不是每问一句就在历史列表里新开一条互不相干的记录。
    // 这一步单独包一层try/catch：此时AI回复其实已经拿到、也已经渲染出来了，
    // 写历史记录失败（比如某些浏览器隐私模式禁用了localStorage、或者存储配额满了）
    // 不该把下面"完成"的状态和提示覆盖成报错，让用户误以为这次白问了、回去重新问一遍。
    try{
      appendHistory({
        id: currentHistorySessionId,
        ts: currentHistorySessionId,
        type: 'ai',
        question,
        cast: buildHistoryCastSnapshot(window.lastCastData),
        turns: currentConversation.turns.slice(),
        totalTokens: currentConversation.cumTokens,
        costYuan: currentConversation.cumCost,
        isPeak: result.isPeak,
        ...requestConfig,
      });
      renderStats();
      if(historyPanel.classList.contains('open')) renderHistory();
    }catch(histErr){
      showToast('回复已经生成，但这条没能存进历史记录（' + (histErr.message || '本地存储异常') + '）', 'error', 5000);
    }
    aiStatus.textContent = result.interrupted ? '解读未完整结束' : '完成';
    showToast(result.interrupted?'解读未完整结束，已保留收到的内容':'解读完成', result.interrupted?'info':'success');
  }catch(e){
    const msg = e.message || '出错了，再试一次';
    aiStatus.textContent = msg;
    showToast(msg, 'error', 5000);
  }finally{
    interpretBtn.disabled = false;
    castBtn.disabled = false;
    manualCastBtn.disabled = false;
    clearResultBtn.disabled = false;
    followUpBtn.disabled = false;
  }
});

// ---- "输出提示词"主流程：和"AI 解读"共用同一套"要不要重新起卦"的判断逻辑
// （问题认领10分钟时效 / 问题变了要不要重摇的确认弹窗 / 手动模式下的提示），
// 这几步特意按interpretBtn那边的写法原样再写一遍、不做抽取合并，避免为了复用而牵动
// 已经跑通的interpretBtn主流程。区别只在最后一步：不调用DeepSeek、不计费、不写历史，
// 而是把 buildSystemPrompt + 排盘数据 + 问题 拼成文本，直接显示出来给用户复制。
// 开头会顺手把 interpretBtn 也锁住，防止"AI解读"和"输出提示词"这两个入口同时抢同一个
// window.lastCastData / 摇卦次数配额；反过来 interpretBtn 点击时也会顺带锁住摇卦按钮，
// 这里额外检查 interpretBtn.disabled，防止"AI解读"正在跑的时候被"输出提示词"插队。
promptBtn.addEventListener('click', async (event)=>{
  const physicalInput = castInputFromEvent(event);
  if(interpretBtn.disabled){
    showToast('"AI 解读"正在进行中，请稍等它结束', 'error');
    return;
  }
  const question = questionInput.value.trim();
  if(!question){
    showToast('先写一下想问的问题', 'error');
    return;
  }
  if(isLifespanQuestion(question)){
    showToast('传统上卦师不轻断生死寿数，这类问题这里不会生成解读——如果是身体或者情绪上的真实担忧，更建议找医生或者信得过的人聊聊', 'error', 6000);
    return;
  }

  promptBtn.disabled = true;
  interpretBtn.disabled = true;
  castBtn.disabled = true;
  manualCastBtn.disabled = true;
  // 这条路径如果判断需要重新起卦，内部会走到跟"摇卦"按钮一样的 performCast()，
  // 同样会把 currentConversation 置空；"清空"按钮同理会跟这里的流程互相打架，
  // 所以追问和清空这两个按钮也要在这整个流程期间锁住，理由与"摇卦"按钮那边一致。
  followUpBtn.disabled = true;
  clearResultBtn.disabled = true;
  // 切到"输出提示词"这条路径，同样把"AI 解读"那边的结果区收起来（不清空 aiResult 文本本身，
  // 只收起复制/追问这两排按钮），避免两条路径的结果区同屏叠着。
  copyRow.style.display = 'none';
  followUpBox.style.display = 'none';

  try{
    const ADOPT_WINDOW_MS = 10 * 60 * 1000;
    if(window.lastCastData && !(window.lastCastQuestion || '').trim()
       && (Date.now() - (window.lastCastTime || 0)) <= ADOPT_WINDOW_MS){
      window.lastCastQuestion = question;
    }
    const questionChanged = !!window.lastCastData && !isSameQuestion(question, window.lastCastQuestion || '');
    let shouldRecast = !window.lastCastData;

    if(window.lastCastData && questionChanged){
      const userSaysNewEvent = await showConfirm(
        `这次问题和上一卦提问的文字不完全一样：\n\n上一卦问的：${window.lastCastQuestion}\n这次写的：${question}\n\n是同一件事换个说法/继续追问，还是确实换了件不相关的新事？`,
        { title: '是同一件事，还是换新事了？', okText: '换新事了，重摇', cancelText: '同一件事，不重摇' }
      );
      if(userSaysNewEvent){
        shouldRecast = true;
      }else{
        window.lastCastQuestion = question;
        showToast('沿用上一卦排盘生成提示词');
      }
    }

    if(shouldRecast){

      // 同上（interpretBtn 那边一致）：能走到这一步说明 questionChanged 分支里用户已经确认过
      // "换新事了，重摇"，这里跳过 guardBeforeCast() 里那次会重复的确认框。
      if(!(await guardBeforeCast({ skipCastConfirm: true, background: true }))){
        return;
      }
      aiStatus.textContent = '正在后台起卦…';
      await performBackgroundCast(physicalInput, (done,total)=>{ aiStatus.textContent = `正在后台起卦 · ${done}/${total} 爻`; });
    }

    const castText = formatCastDataForAI(window.lastCastData);
    lastExportCastText = castText;
    lastExportQuestion = question;
    showPromptOutput(buildExportPromptText(question, castText));
    aiStatus.textContent = '提示词已生成';
    showToast('提示词已生成，复制后可以粘贴去其他AI软件解卦', 'success');

    // "输出提示词"这条路径之前不写历史，导致这里生成过的卦在"历史记录"里完全找不到。
    // 这里补一条记录，但只存问题+这一卦的关键排盘信息（跟"AI 解读"共用同一个快照函数），
    // 不把 buildExportPromptText() 拼出来的那一整段人设/规则长文本存进去。
    // 同理单独包一层try/catch：提示词此时已经生成并展示给用户了，写历史失败不该
    // 被外层catch误报成"生成提示词时出错了"，那会让人误以为上面显示的提示词也不作数。
    try{
      appendHistory({
        id: Date.now(),
        ts: Date.now(),
        type: 'prompt',
        question,
        cast: buildHistoryCastSnapshot(window.lastCastData),
        roleLabel: currentRoleLabel(),
        styleLabel: currentReplyStyleLabel(),
        roleCustomText: currentRoleCustomSnapshot(),
        styleCustomText: currentStyleCustomSnapshot(),
      });
      renderStats();
      if(historyPanel.classList.contains('open')) renderHistory();
    }catch(histErr){
      showToast('提示词已生成，但这条没能存进历史记录（' + (histErr.message || '本地存储异常') + '）', 'error', 5000);
    }
  }catch(e){
    showToast(e.message || '生成提示词时出错了，再试一次', 'error', 5000);
  }finally{
    promptBtn.disabled = false;
    interpretBtn.disabled = false;
    castBtn.disabled = false;
    manualCastBtn.disabled = false;
    followUpBtn.disabled = false;
    clearResultBtn.disabled = false;
  }
});

followUpBtn.addEventListener('click', async ()=>{
  const followUpText = followUpInput.value.trim();
  if(!followUpText){
    showToast('先写一下想追问的内容', 'error');
    return;
  }
  if(isLifespanQuestion(followUpText)){
    showToast('传统上卦师不轻断生死寿数，这类问题这里不会生成解读——如果是身体或者情绪上的真实担忧，更建议找医生或者信得过的人聊聊', 'error', 6000);
    return;
  }
  if(!currentConversation){
    showToast('还没有可以追问的解读，先点一次"AI 解读"', 'error');
    return;
  }
  if(!loadApiKey()){
    aiSettings.classList.add('open');
    showToast('先在下面"设置"里填一下 DeepSeek API Key', 'error');
    return;
  }

  followUpBtn.disabled = true;
  interpretBtn.disabled = true; // 追问期间也锁住"AI 解读"，避免同时起两个请求把 currentConversation 弄乱
  // "输出提示词"内部会检查 interpretBtn.disabled 来判断能不能执行，锁住 interpretBtn 已经能
  // 功能上挡住它；这里再顺手把它也显式禁用，避免按钮看着能点、点了却只弹出一句
  // "AI 解读正在进行中"（其实是追问在进行中）这种文案对不上的体验。
  promptBtn.disabled = true;
  // 追问期间同样要锁住摇卦入口：这两个按钮之前一直没被追问锁住，用户能在追问的流式请求还没
  // 返回时就点"摇卦"，performCast→renderPlate 里的 resetConversation() 会把 currentConversation
  // 提前置空，等追问请求回来 followUpWithDeepSeek 里再往 currentConversation.messages 写东西时
  // 就是对着 null 操作，直接报错，这次回答也白白问了（token 照样扣，结果却丢了）。
  castBtn.disabled = true;
  manualCastBtn.disabled = true;
  // "清空回复"同理会调 resetConversation()，追问期间也先锁住，等这轮追问完整结束再放开。
  clearResultBtn.disabled = true;
  followUpStatus.textContent = '正在追问…';

  try{
    // 追问的实时预览要接在"已经落定的对话"后面，renderLive/renderThinking内部本来就会先铺settled turns，
    // 但此时followUpWithDeepSeek还没把这轮user文本push进turns，所以这里传的questionText就是followUpText本身。
    const controller = new AbortController();
    activeAbortController = controller;
    stopGenBtn.disabled = false;
    showStopBtn();
    const thinking = withThinkingIndicator(followUpText, (delta, fullSoFar)=>{
      renderLive(followUpText, fullSoFar);
    });
    let result;
    try{
      result = await followUpWithDeepSeek(followUpText, thinking.onDelta, controller.signal);
    }finally{
      thinking.stop();
      activeAbortController = null;
      hideStopBtn();
    }
    followUpInput.value = '';
    followUpInput.dispatchEvent(new Event('input')); // 同步触发一次，让字数计数器跟着归零
    renderConversation();
    aiMeta.textContent = resultUsageText(result);
    followUpStatus.textContent = result.interrupted ? (result.interruptReason === 'user' ? '已停止' : result.interruptReason === 'limit' ? '达到长度上限' : '网络中断') : '完成';

    // 更新同一条历史会话记录（用首次解读时记住的sessionId去找），把新的这两轮追加进turns里；
    // 找不到就说明历史被清空过，直接放弃写回，不强行拼一条新的。
    // 同上，单独包一层try/catch：追问的回复此时已经拿到并渲染出来、followUpStatus也已经
    // 设成"完成"了，写历史失败不该被外层catch覆盖成报错状态。
    try{
      const updated = updateHistorySession(currentHistorySessionId, {
        turns: currentConversation.turns.slice(),
        totalTokens: currentConversation.cumTokens,
        costYuan: currentConversation.cumCost,
        isPeak: result.isPeak,
      });
      if(updated){
        renderStats();
        if(historyPanel.classList.contains('open')) renderHistory();
      }
    }catch(histErr){
      showToast('追问回复已经生成，但这条没能存进历史记录（' + (histErr.message || '本地存储异常') + '）', 'error', 5000);
    }
  }catch(e){
    const msg = e.message || '出错了，再试一次';
    followUpStatus.textContent = msg;
    showToast(msg, 'error', 5000);
  }finally{
    followUpBtn.disabled = false;
    interpretBtn.disabled = false;
    castBtn.disabled = false;
    manualCastBtn.disabled = false;
    clearResultBtn.disabled = false;
    promptBtn.disabled = false;
  }
});

export {renderPlate,lineFromSum,formatCastDataForAI,buildExportPromptText,buildHistoryCastSnapshot};
export function setTestCalendar(date){knownCastDate=date;daySelectionMode="date";}
