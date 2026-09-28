// Retain native select values/change events; provide one accessible visual menu.
const controls = new Map();
let active = null, search = '', searchTimer;
function closeMenu(focus = false) {
  if (!active) return;
  const {button, menu} = active; active = null;
  button.setAttribute('aria-expanded','false'); menu.remove();
  if (focus) button.focus();
}
function sync() {
  for (const [select, button] of controls) {
    if (!select.isConnected) {controls.delete(select);continue;}
    button.querySelector('span').textContent = select.selectedOptions[0]?.textContent || '请选择';
    button.disabled = select.disabled;
  }
  if (active?.select.disabled || (active && !active.button.getClientRects().length)) closeMenu();
}
function openMenu(select, button) {
  if (active?.select === select) { closeMenu(true); return; }
  closeMenu();
  const menu = document.createElement('div'); menu.className='select-menu'; menu.id=`${select.id}-menu`;
  menu.setAttribute('role','listbox'); menu.setAttribute('aria-label',button.getAttribute('aria-label'));
  const choices=[...select.options].filter(o=>!o.hidden);
  const items=choices.map(option=>{
    const item=document.createElement('button'); item.type='button'; item.className='select-option';
    item.setAttribute('role','option'); item.setAttribute('aria-selected',String(option.selected));
    item.disabled=option.disabled || option.parentElement?.disabled === true;
    item.tabIndex=-1; item.textContent=option.textContent;
    item.addEventListener('click',()=>{
      select.value=option.value; select.dispatchEvent(new Event('input',{bubbles:true}));
      select.dispatchEvent(new Event('change',{bubbles:true})); sync(); closeMenu(true);
    }); menu.append(item); return item;
  });
  (button.closest('dialog') || document.body).append(menu);
  const box=button.getBoundingClientRect(), spaceBelow=innerHeight-box.bottom-12, spaceAbove=box.top-12;
  const below=spaceBelow>=Math.min(320,items.length*44+12)||spaceBelow>=spaceAbove;
  const height=Math.max(44,Math.min(320,below?spaceBelow:spaceAbove,innerHeight-24));
  const width=Math.min(Math.max(box.width,200),innerWidth-24);
  Object.assign(menu.style,{position:'fixed',width:`${width}px`,maxHeight:`${height}px`,left:`${Math.max(12,Math.min(box.left,innerWidth-width-12))}px`,
    ...(below?{top:`${box.bottom+6}px`}:{bottom:`${innerHeight-box.top+6}px`})});
  active={select,button,menu,anchor:box}; button.setAttribute('aria-expanded','true');
  const available=items.filter(i=>!i.disabled);
  (available.find(i=>i.getAttribute('aria-selected')==='true') || available[0])?.focus({preventScroll:true});
  const selected = document.activeElement;
  if (selected && menu.contains(selected)) menu.scrollTop = Math.max(0, selected.offsetTop - menu.clientHeight + selected.offsetHeight);
  menu.addEventListener('keydown',e=>{
    let index=available.indexOf(document.activeElement);
    if(e.key==='Escape'){e.preventDefault();closeMenu(true);return;}
    if(e.key==='Tab'){closeMenu(true);return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
      e.preventDefault(); index=e.key==='Home'?0:e.key==='End'?available.length-1:(index+(e.key==='ArrowDown'?1:-1)+available.length)%available.length;
      available[index]?.focus();
    } else if(e.key.length===1 && !e.ctrlKey && !e.metaKey && e.key!==' ') {
      search+=e.key.toLowerCase(); clearTimeout(searchTimer); searchTimer=setTimeout(()=>search='',600);
      available.find(i=>i.textContent.toLowerCase().startsWith(search))?.focus();
    }
  });
}
export function enhanceSelect(select) {
    if(controls.has(select)||select.multiple)return;
    const shell=document.createElement('div'); shell.className='select-shell'; select.before(shell); shell.append(select);
    const button=document.createElement('button'); button.type='button'; button.className='select-trigger';
    button.id=`${select.id}-trigger`; button.setAttribute('aria-haspopup','listbox'); button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-controls',`${select.id}-menu`);
    const labels=[...select.labels];
    const labelText=labels.map(label=>{const copy=label.cloneNode(true);copy.querySelectorAll('select,button').forEach(n=>n.remove());return copy.textContent.trim();}).join(' ');
    button.setAttribute('aria-label',labelText||select.getAttribute('aria-label')||'选择');
    button.innerHTML='<span></span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5"/></svg>';
    select.tabIndex=-1; select.setAttribute('aria-hidden','true'); shell.append(button); controls.set(select,button);
    labels.forEach(label=>label.addEventListener('click',e=>{if(!shell.contains(e.target)){e.preventDefault();button.focus();}}));
    button.addEventListener('click',()=>openMenu(select,button));
    button.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();openMenu(select,button);}});
    new MutationObserver(sync).observe(select,{attributes:true,childList:true,subtree:true,characterData:true});
  sync();
}
export function initializeSelects() {
  document.querySelectorAll('select').forEach(enhanceSelect);
  document.addEventListener('change',sync);
  document.addEventListener('click',()=>queueMicrotask(sync));
  document.addEventListener('pointerdown',e=>{if(active&&!active.menu.contains(e.target)&&!active.button.contains(e.target))closeMenu();});
  window.addEventListener('resize',()=>closeMenu());
  document.addEventListener('scroll',e=>{
    if (!active || active.menu.contains(e.target)) return;
    const box=active.button.getBoundingClientRect();
    if (Math.abs(box.top-active.anchor.top)>1 || Math.abs(box.left-active.anchor.left)>1) closeMenu();
  },true);
  sync();
}
