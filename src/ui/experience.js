import { switchTab } from './navigation.js';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? true;

function entrance(element, frames, duration = 280, delay = 0) {
  (element?.getAnimations?.() || []).forEach(animation => animation.cancel());
  if (!element?.animate || reducedMotion()) return null;
  return element.animate(frames, {duration, delay, easing:'cubic-bezier(.22,1,.36,1)', fill:'backwards'});
}

// The six extruded strokes belong to the empty state. They never stand in for
// a generated cast: renderPlate replaces this node with the actual chart.
function createOracleArtwork(host) {
  if (!host) return;
  const face = (x, y, width) => `<polygon class="oracle-front" points="${x},${y} ${x+width},${y-35} ${x+width},${y-23} ${x},${y+12}"/>
    <polygon class="oracle-side" points="${x+width},${y-35} ${x+width+58},${y-8} ${x+width+58},${y+4} ${x+width},${y-23}"/>
    <polygon class="oracle-top" points="${x},${y} ${x+width},${y-35} ${x+width+58},${y-8} ${x+58},${y+27}"/>
    <polygon class="oracle-front" points="${x},${y} ${x+58},${y+27} ${x+width+58},${y-8} ${x+width+58},${y+4} ${x+58},${y+39} ${x},${y+12}"/>`;
  const strokes = [true,false,true,false,false,true].map((solid,index) => {
    const x=126-index*13, y=91+index*47;
    return `<g class="oracle-stroke">${solid ? face(x,y,250) : face(x,y,106)+face(x+144,y-20,106)}</g>`;
  }).join('');
  host.innerHTML = `<svg viewBox="0 0 500 430" xmlns="http://www.w3.org/2000/svg" focusable="false"><defs><linearGradient id="oracle-face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="var(--ui-surface)"/><stop offset=".45" stop-color="var(--sculpture-top)"/><stop offset="1" stop-color="var(--sculpture-edge)"/></linearGradient></defs>${strokes}</svg>`;
  host.querySelectorAll('.oracle-stroke').forEach((stroke,index) => {
    entrance(stroke,[{opacity:0,transform:'translateY(32px)'},{opacity:1,transform:'translateY(0)'}],700,index*65);
  });
  const pointer = window.matchMedia?.('(hover:hover) and (pointer:fine)') || {matches:false};
  host.addEventListener('pointermove',event=>{
    if (!pointer.matches || reducedMotion()) return;
    const bounds=host.getBoundingClientRect();
    host.style.setProperty('--oracle-x',`${((event.clientX-bounds.left)/bounds.width-.5)*9}deg`);
    host.style.setProperty('--oracle-y',`${((event.clientY-bounds.top)/bounds.height-.5)*-7}deg`);
  });
  host.addEventListener('pointerleave',()=>{
    host.style.setProperty('--oracle-x','0deg');host.style.setProperty('--oracle-y','0deg');
  });
}

export function initializeExperience() {
  const question=document.getElementById('questionInput');
  const castingQuestion=document.getElementById('castQuestionInput');
  // Keep a single question value for all existing guards, requests and exports.
  castingQuestion.value=question.value;
  castingQuestion.addEventListener('input',()=>{
    question.value=castingQuestion.value;
    question.dispatchEvent(new Event('input',{bubbles:true}));
  });
  question.addEventListener('input',()=>{castingQuestion.value=question.value;});

  const dialog=document.getElementById('journalDialog');
  const panel=document.getElementById('historyPanel');
  const toggle=document.getElementById('toggleHistoryBtn');
  const search=document.getElementById('aiHistorySearch');
  const openButton=document.getElementById('openJournalBtn');
  const closeButton=document.getElementById('closeJournalBtn');
  const journalBody=dialog.querySelector('.journal-body');
  let journalTrigger=openButton, closeRevision=0, journalScroll=0;
  const readingScroll=new Map();
  function captureJournalView(){
    journalScroll=journalBody.scrollTop;
    panel.querySelectorAll('.history-item[data-id]').forEach(item=>{
      const body=item.querySelector('.history-item-body');
      if(body)readingScroll.set(item.dataset.id,body.scrollTop);
    });
  }
  function restoreJournalView(){
    panel.querySelectorAll('.history-item[data-id]').forEach(item=>{
      const body=item.querySelector('.history-item-body');
      if(body&&readingScroll.has(item.dataset.id))body.scrollTop=readingScroll.get(item.dataset.id);
    });
    journalBody.scrollTop=journalScroll;
  }
  function showJournal(trigger) {
    journalTrigger=trigger || journalTrigger;
    closeRevision++;
    panel.classList.add('open');
    toggle.setAttribute('aria-expanded','true');
    if (!dialog.open) dialog.showModal();
    restoreJournalView();
    document.getElementById('journalFeedback').textContent='';
    entrance(dialog,[{opacity:.4,transform:'translateX(40px)'},{opacity:1,transform:'translateX(0)'}],340);
    search.focus({preventScroll:true});
  }
  async function closeJournal() {
    captureJournalView();
    const revision=++closeRevision;
    const animation=entrance(dialog,[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(28px)'}],180);
    await animation?.finished.catch(()=>{});
    if (revision===closeRevision && dialog.open) dialog.close();
  }
  toggle.addEventListener('click',()=>{
    if (panel.classList.contains('open')) showJournal(toggle);
    else if (dialog.open) {panel.classList.add('open');closeJournal();}
  });
  openButton.addEventListener('click',()=>{
    journalTrigger=openButton;
    if (!panel.classList.contains('open')) toggle.click();
    else showJournal(openButton);
    journalTrigger=openButton;
  });
  closeButton.addEventListener('click',closeJournal);
  dialog.addEventListener('keydown',event=>{
    // A search input consumes Escape before the dialog's native cancel action.
    // Handle it here, while leaving an open select menu's first Escape alone.
    const confirmation=document.getElementById('confirmOverlay');
    if(confirmation && confirmation.style.display!=='none') return;
    if(event.key==='Escape' && !event.defaultPrevented){event.preventDefault();closeJournal();}
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeJournal();});
  dialog.addEventListener('click',event=>{
    if (event.target!==dialog) return;
    const box=dialog.getBoundingClientRect();
    if (event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom) closeJournal();
  });
  dialog.addEventListener('close',()=>{
    panel.classList.remove('open');toggle.setAttribute('aria-expanded','false');
    if (journalTrigger.getClientRects().length) journalTrigger.focus({preventScroll:true});
  });
  const count=document.getElementById('historyCount'), badge=document.getElementById('journalBadge');
  function updateBadge() {
    const value=Number(count.textContent)||0;
    badge.textContent=value>99?'99+':String(value);badge.hidden=value===0;
    openButton.setAttribute('aria-label',value ? `卦簿，${value} 条问卦记录` : '卦簿');
  }
  new MutationObserver(updateBadge).observe(count,{childList:true,characterData:true,subtree:true});updateBadge();

  const menu=document.querySelector('.learning-menu');
  menu.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{
    menu.open=false;document.getElementById(button.dataset.tab).focus({preventScroll:true});
  }));
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){menu.open=false;menu.querySelector('summary').focus();}
  });
  document.getElementById('openHelpMenuBtn').addEventListener('click',()=>{
    menu.open=false;menu.querySelector('summary').focus({preventScroll:true});
    document.getElementById('helpFab').click();
  });
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))menu.open=false;});
  document.querySelector('.site-brand').addEventListener('click',event=>{
    event.preventDefault();switchTab('caster');window.scrollTo({top:0,behavior:reducedMotion()?'instant':'smooth'});
  });
  const themeColor=document.querySelector('meta[name="theme-color"]');
  const updateThemeColor=()=>{themeColor.content=getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim();};
  new MutationObserver(updateThemeColor).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});updateThemeColor();

  const labels={promptOutputText:'生成的提示词',cleanupInputText:'要整理的外部 AI 回复',cleanupOutputText:'整理后的回复',followUpExportInput:'要导出的追问',followUpExportOutput:'生成的追问提示词',followUpInput:'继续追问同一件事'};
  for (const [id,label] of Object.entries(labels)) document.getElementById(id)?.setAttribute('aria-label',label);
  const ensureArtwork=()=>{
    const host=document.getElementById('oracleArt');
    if(host && !host.firstElementChild) createOracleArtwork(host);
  };
  // Entry reset intentionally restores the pristine empty-state HTML on
  // pageshow and after a long absence. Reattach only this disposable artwork.
  new MutationObserver(ensureArtwork).observe(document.getElementById('plateWrap'),{childList:true});
  ensureArtwork();
}
