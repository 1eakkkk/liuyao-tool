import { SHENG, KE } from '../core/constants.js';


const cx=140, cy=140, R=95;

const pos = {};

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

export { cx, cy, R, pos, arcPath, activateWxNode };
