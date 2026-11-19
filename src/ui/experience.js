import { switchTab } from './navigation.js';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? true;

function entrance(element, frames, duration = 280, delay = 0) {
  (element?.getAnimations?.() || []).forEach(animation => animation.cancel());
  if (!element?.animate || reducedMotion()) return null;
  return element.animate(frames, {duration, delay, easing:'cubic-bezier(.22,1,.36,1)', fill:'backwards'});
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
  // Keep the completed chart first in both reading and keyboard order.
  const plate = document.getElementById('plateWrap');
  const result = plate.closest('.cast-result');
  const controls = document.querySelector('.caster-controls');
  function positionChart() {
    if (plate.querySelector('table')) {
      if (result.nextElementSibling !== controls) controls.before(result);
    } else if (controls.nextElementSibling !== result) {
      controls.after(result);
    }
  }
  new MutationObserver(positionChart).observe(plate, {childList:true});
  positionChart();
}
