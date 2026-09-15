



/* ---------------- tabs ----------------
   role="tablist"/"tab"/"tabpanel" 用的是标准 ARIA tabs 模式：每次切换要同步
   aria-selected（哪个tab被选中）和"roving tabindex"（tabindex在tab之间挪动，
   同一时刻只有当前激活的tab能被Tab键聚焦到，符合键盘用户对"标签页"控件的
   标准预期——Tab键只在tablist和当前面板之间跳两下，不会挨个把4个tab都走一遍）。
   鼠标点击的视觉效果和之前完全一样，这里只是把底层语义和键盘可达性补上。
   ---------------- */
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));

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

export { tabButtons, switchTab };
