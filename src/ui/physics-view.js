import { castStore } from '../app/cast-store.js';
import { renderPlate } from './casting-view.js';
import { coinLog } from './dom.js';
import { logCastEvent } from '../storage/cast-log.js';
import { createCoinWorld, advanceCoinWorld } from '../core/physics.js';


function commitPhysicsCast(lines, { clearQuestionOnCommit = false } = {}){
  if (clearQuestionOnCommit) {
    const question = document.getElementById('questionInput');
    question.value = ''; question.dispatchEvent(new Event('input'));
  }
  renderPlate(lines,'physics');logCastEvent();
  coinLog.textContent=lines.map((l,i)=>`${['初','二','三','四','五','上'][i]}爻 ${l.coins.join('')} · ${l.sum}`).join(' ｜ ');
  return castStore.legacy;
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
        const deadline = performance.now() + 8;
        do { result=advanceCoinWorld(sim); } while (!result && performance.now() < deadline);
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
  const ring='M28 0a28 28 0 1 0-56 0a28 28 0 1 0 56 0M-6-6h12v12h-12z';
  return `<g class="physics-coin" data-coin="${id}"><title>字面记二，背面记三</title>
  <defs><linearGradient id="coin-metal-${id}" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#f7faf8"/><stop offset=".28" stop-color="#c9d8d1"/><stop offset=".52" stop-color="#eff4f0"/><stop offset="1" stop-color="#8caaa0"/></linearGradient></defs>
  <g class="coin-edge"><path d="${ring}" fill="#637e73" fill-rule="evenodd" stroke="#49645b" stroke-width="1.5"/></g>
  <g class="coin-face"><path d="${ring}" fill="url(#coin-metal-${id})" fill-rule="evenodd" stroke="#587b6b"/>
  <circle r="25.5" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.3"/><circle r="23.7" fill="none" stroke="#678c79" stroke-opacity=".55" stroke-width=".6"/>
  <path d="M-7-7h14v14h-14z" fill="none" stroke="#fafffc" stroke-width="1.3"/>
  <g class="coin-inscription" fill="#365e4f" font-family="KaiTi,STKaiti,serif" font-size="10.5" font-weight="600" text-anchor="middle"><text y="-11">乾</text><text y="21">隆</text><text x="16" y="4">通</text><text x="-16" y="4">寶</text></g>
  <g class="coin-reverse" style="display:none" fill="none" stroke="#456e5d" stroke-width="1.3" stroke-linecap="round"><path d="M-18-10v20m4-17v14M18-10v20m-4-17v14M-5-18H5M-5 18H5"/><circle r="20.5" stroke-width=".5"/></g></g></g>`;
}


function performCast(options = {}){
  return new Promise((resolve,reject)=>{
    const labels=['初爻','二爻','三爻','四爻','五爻','上爻'];
    const auto=document.getElementById('castPace').value==='all';
    const dialog=document.createElement('dialog');dialog.className='physics-dialog';
    dialog.setAttribute('aria-labelledby','physics-title');dialog.setAttribute('aria-describedby','physics-description');
    dialog.innerHTML=`<header class="physics-header"><h3 id="physics-title">三钱起卦</h3><button type="button" class="physics-close" aria-label="关闭摇卦窗口"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
    <div class="physics-body"><section class="physics-table"><div class="physics-table-top"><span><i></i> 三钱起卦</span><span>${auto?'连续六爻':'逐爻投掷'}</span></div>
    <svg class="physics-scene" viewBox="0 0 600 400" role="img" aria-label="铜钱物理投掷桌面">
    <defs><radialGradient id="table-glow"><stop stop-color="var(--stage-center)"/><stop offset="1" stop-color="var(--stage-edge)"/></radialGradient><linearGradient id="coin-gold" x2="1" y2="1"><stop stop-color="#f1d99c"/><stop offset=".46" stop-color="#c5a360"/><stop offset="1" stop-color="#92703c"/></linearGradient><radialGradient id="coin-shadow"><stop stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
    <rect width="600" height="400" fill="url(#table-glow)"/>
    <ellipse cx="300" cy="238" rx="236" ry="136" fill="none" stroke="var(--ui-accent)" stroke-opacity=".1"/>
    <g class="physics-shadows">${[0,1,2].map(i=>`<ellipse data-shadow="${i}" cx="${220+i*80}" cy="250" rx="34" ry="12" fill="url(#coin-shadow)"/>`).join('')}</g><g class="physics-coins">${[0,1,2].map(physicsCoinSvg).join('')}</g>
    </svg><div class="physics-table-caption"><span class="physics-stage-caption">字面记二 · 背面记三</span></div></section>
    <aside class="physics-record"><div class="physics-record-title"><h4>投掷结果</h4><span class="physics-count">00 <small>/ 06</small></span></div><ol class="physics-results" aria-label="六爻投掷结果">${labels.map((name,i)=>`<li data-line="${i}" class="${i===0?'is-current':''}"><span class="physics-line-number">${name}</span><span class="physics-line-glyph"><i></i><i></i></span><span class="physics-line-name">${i===0?'待投':'—'}</span></li>`).reverse().join('')}</ol></aside></div>
    <footer class="physics-footer"><div class="physics-guidance"><strong class="physics-status" role="status" aria-live="polite">${auto?'点击一次，完成六爻':'点击投掷初爻'}</strong><p id="physics-description">字面记二 · 背面记三</p></div><button type="button" class="physics-throw"><span>${auto?'开始连续投掷':'投掷初爻'}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></button></footer>`;
    document.body.appendChild(dialog);
    const scene=dialog.querySelector('.physics-scene'),status=dialog.querySelector('.physics-status'),launch=dialog.querySelector('.physics-throw');
    const count=dialog.querySelector('.physics-count'),caption=dialog.querySelector('.physics-stage-caption');
    const coinNodes=[...dialog.querySelectorAll('.physics-coin')],shadows=[...dialog.querySelectorAll('[data-shadow]')];
    const previousFocus=document.activeElement,previousOverflow=document.body.style.overflow;
    let lines=[],sim=null,frame=0,nextTimer=0,running=false,closed=false,complete=false,previousTime=0,accumulator=0;
    let input={vx:0,vy:0,distance:0,duration:0},retries=0;
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
    launch.oncontextmenu=e=>e.preventDefault();
    function begin(){
      if(closed||running||complete)return;
      try{sim=createCoinWorld(input,lines.length);accumulator=0;previousTime=0;running=true;launch.disabled=true;dialog.classList.add('is-rolling');coinNodes.forEach(n=>n.removeAttribute('transform'));status.textContent=`${labels[lines.length]} · 静候铜钱落定`;caption.textContent='铜钱翻转，卦象渐成';launch.querySelector('span').textContent='铜钱落定中';frame=requestAnimationFrame(tick);}catch(e){cleanup();reject(e);}
    }
    function retry(){
      running=false;dialog.classList.remove('is-rolling');
      if (retries < 3) {
        retries++; input = {...input, phase: (input.phase || 0) + .731, duration: input.duration + .413};
        status.textContent=`${labels[lines.length]}未平放，自动重投（${retries}/3）`;
        caption.textContent='保留已完成的爻，不计为另起一卦';
        nextTimer=setTimeout(begin,350); return;
      }
      status.textContent='铜钱未平稳落定';caption.textContent='已成之爻保留，本爻请再投一次';launch.disabled=false;launch.querySelector('span').textContent='重投'+labels[lines.length];
    }
    function tick(time){
      if(closed)return;
      try{
        accumulator+=previousTime?Math.min(.05,(time-previousTime)/1000):1/60;previousTime=time;
        const frameDeadline=performance.now()+8;
        while(accumulator>=1/120&&running&&performance.now()<frameDeadline){
          const result=advanceCoinWorld(sim);accumulator-=1/120;
          if(result?.line){
            lines.push(result.line);retries=0;running=false;record(result.line);dialog.classList.remove('is-rolling');draw();
            if(lines.length===6){
              const data=commitPhysicsCast(lines,options);complete=true;status.textContent='六爻已成，卦象已定';caption.textContent='一念有始，六爻有应';dialog.querySelector('#physics-description').textContent='查看本卦的纳甲、世应与动爻。';launch.disabled=false;launch.querySelector('span').textContent='查看排盘';dialog.classList.add('is-complete');launch.focus({preventScroll:true});resolve(data);return;
            }
            status.textContent=`${labels[lines.length-1]}已成 · ${auto?'即将投掷':'下一爻为'}${labels[lines.length]}`;caption.textContent='铜钱已落定';launch.disabled=false;launch.querySelector('span').textContent='投掷'+labels[lines.length];
            if(auto){launch.disabled=true;nextTimer=setTimeout(begin,550);return;}
          }else if(result?.retry)retry();
        }
        draw();if(running)frame=requestAnimationFrame(tick);
      }catch(e){cleanup();reject(e);}
    }
    launch.onclick=(event)=>{if(complete){cleanup();return;}retries=0;input={...castInputFromEvent(event),phase:(event.timeStamp/1000)%(Math.PI*2)};begin();};
    document.body.style.overflow='hidden';dialog.showModal();draw();launch.focus({preventScroll:true});
  });
}

export { commitPhysicsCast, castInputFromEvent, performBackgroundCast, physicsCoinSvg, performCast };
