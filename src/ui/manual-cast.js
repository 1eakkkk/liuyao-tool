import { renderPlate } from './casting-view.js';
import { buildGuaDiagramHtml } from './plate-markup.js';
import { showToast } from './dialogs.js';
import { plateWrap, coinLog, manualLinesWrap } from './dom.js';
import { state } from '../app/state.js';
import { lineFromSum } from '../core/physics.js';
import { EIGHT_PALACE_MAP } from '../core/constants.js';



 // 'system' | 'manual'

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
      if(state.castMode === 'manual') renderManualPreview();
    });
  }
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

export { MANUAL_LINE_LABELS, MANUAL_LINE_OPTIONS, manualLineTouched, buildManualLinesUI, renderManualPreview, performManualCast };
