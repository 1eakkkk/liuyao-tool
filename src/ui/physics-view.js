import { renderPlate } from './casting-view.js';
import { coinLog } from './dom.js';
import { logCastEvent } from '../storage/cast-log.js';
import { createCoinWorld, advanceCoinWorld } from '../core/physics.js';


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

export { commitPhysicsCast, castInputFromEvent, performBackgroundCast, physicsCoinSvg, performCast };
