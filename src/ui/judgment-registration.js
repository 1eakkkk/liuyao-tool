import {canRegister,loadRegistrations,registerJudgment,recordObservation,registrationExport,verifyRegistration,previewRegistrationImport,importRegistrationBackup} from '../storage/judgment-registration.js';
import {OUTCOMES,feedbackSnapshot,loadFeedback} from '../storage/outcome-feedback.js';
import {escapeHtml as esc} from './helpers.js';

const reviewFilters={pending:'待复盘',overdue:'已逾期',reviewed:'已有结果',all:'全部'};
const recordedOutcomes=new Set(['matches','partial','differs']);
const libraryViews=new WeakMap();
const localCalendarDay=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

// An observation that is pending or cannot be judged is not a completed review.
// These are workflow counts, never scores of prediction accuracy.
export function registrationReviewList(entries,filter='pending',now=new Date()){
 const today=localCalendarDay(now),states=entries.map(entry=>{
  const hasResult=entry.observations.some(o=>recordedOutcomes.has(o.outcome));
  return {entry,hasResult,overdue:!hasResult&&entry.deadline<today};
 });
 const counts={pending:states.filter(s=>!s.hasResult).length,overdue:states.filter(s=>s.overdue).length,reviewed:states.filter(s=>s.hasResult).length,all:states.length};
 const selected=Object.hasOwn(reviewFilters,filter)?filter:'pending';
 return {today,filter:selected,counts,entries:states.filter(s=>selected==='all'||(selected==='reviewed'?s.hasResult:selected==='overdue'?s.overdue:!s.hasResult)).map(s=>s.entry)};
}

function libraryView(root){
 let view=libraryViews.get(root);if(view)return view;
 const filters=document.createElement('div');filters.className='registration-filters';filters.setAttribute('role','group');filters.setAttribute('aria-label','判断登记筛选');
 for(const [key,label]of Object.entries(reviewFilters)){
  const button=document.createElement('button');button.type='button';button.className='ai-btn ghost registration-filter';button.dataset.registrationFilter=key;button.setAttribute('aria-controls',root.id);button.textContent=label;filters.append(button);
 }
 const status=document.createElement('p');status.className='hint registration-filter-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
 const note=document.createElement('p');note.className='hint registration-filter-note';note.textContent='尚未发生或无法判断的登记会留在待复盘；已逾期是其中超过截止日期的登记。';
 root.before(filters,status,note);view={filter:'pending',drafts:new Map(),filters,status,note};libraryViews.set(root,view);
 filters.addEventListener('click',event=>{
  const button=event.target.closest('[data-registration-filter]');if(!button)return;
  view.filter=button.dataset.registrationFilter;renderRegistrationLibrary();button.focus({preventScroll:true});
 });
 const library=root.closest('#registrationLibrary');
 library?.addEventListener('toggle',()=>{if(library.open)renderRegistrationLibrary();});
 return view;
}

export function registrationHtml(record,data=loadRegistrations(),{standalone=false}={}){
 const entry=data.entries.find(e=>e.historyId===String(record.id));
 if(!entry&&!canRegister(record))return '';
 if(!entry&&loadFeedback().entries.some(e=>e.historyId===String(record.id)))return '<p class="hint">已保存事后反馈，不再补登事前判断。</p>';
 if(!data.writable)return '<p role="alert">判断登记数据无法读取，已停止写入，请先导出备份。</p>';
 const changed=!standalone&&entry&&JSON.stringify(entry.snapshot)!==JSON.stringify(feedbackSnapshot(record));
 return `<details data-view="registration"><summary>${entry?'查看已登记判断':'结果发生前登记判断'}</summary><p class="hint">本机保存，不是可信时间戳；登记不代表解读正确。</p>${entry?`
 ${changed?'<p role="alert">原回答已变化，登记仍绑定旧回答。</p>':''}
 <p><strong>核验判断：</strong>${esc(entry.claim)}</p><p><strong>判断标准：</strong>${esc(entry.criterion)}</p><p>截止日期：${esc(entry.deadline)} · 登记日期：${esc(entry.registeredOn)}</p>
 <p class="hint">判断、标准与截止日期已固定。实际结果追加记录，不覆盖旧记录。</p>
 <ol>${entry.observations.map(o=>`<li>${esc(o.observedOn)} · ${esc(OUTCOMES[o.outcome])}：${esc(o.note)}</li>`).join('')}</ol>
 <label>实际结果<select data-registration="outcome">${Object.entries(OUTCOMES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
 <label>结果发生日期<input type="date" data-registration="observedOn"></label><label>发生了什么<textarea data-registration="note" rows="3" maxlength="2000"></textarea></label>
 <div class="history-feedback-actions"><button type="button" class="ai-btn" data-action="registration-observe" data-registration-id="${esc(entry.id)}">追加结果记录</button><button type="button" class="ai-btn ghost" data-action="registration-export" data-registration-id="${esc(entry.id)}">导出登记与结果</button></div>`:`
 <label>要核验的具体判断<textarea data-registration="claim" maxlength="1000" rows="2" placeholder="从回答中选一条可观察、可判断的结论；不为模糊回答补造预测。"></textarea></label>
 <label>怎样算符合<textarea data-registration="criterion" maxlength="500" rows="2" placeholder="例如：截止日前是否完成既定目标；先写清，再登记。"></textarea></label>
 <label>结果核验截止日期（含当日）<input type="date" data-registration="deadline"></label>
 <label class="registration-confirm"><input type="checkbox" data-registration="notOccurred">我确认所登记结果尚未发生；保存后不改判断和标准。</label>
 <button type="button" class="ai-btn" data-action="registration-create">保存判断登记</button>`}<p class="hint" role="status" data-registration="status"></p></details>`;
}
export function bindRegistrations(list,loadHistory,render,toast,download){list.addEventListener('click',async event=>{
 const button=event.target.closest('[data-action]');if(!button?.dataset.action.startsWith('registration-'))return;
 const item=button.closest('.history-item,.registration-record'),get=k=>item.querySelector(`[data-registration="${k}"]`),message=t=>{get('status').textContent=t;};button.disabled=true;
 try{if(button.dataset.action==='registration-export'){const entry=loadRegistrations().entries.find(e=>e.id===button.dataset.registrationId);if(!entry||!await verifyRegistration(entry)){message('登记内容校验失败，未导出；请保留本地数据。');return;}download(registrationExport(entry));return;}
 let ok;if(button.dataset.action==='registration-create'){const record=loadHistory().find(r=>String(r.id)===item.dataset.id);ok=record&&await registerJudgment(record,{claim:get('claim').value,criterion:get('criterion').value,deadline:get('deadline').value,notOccurred:get('notOccurred').checked});}
 else ok=await recordObservation(button.dataset.registrationId,{outcome:get('outcome').value,note:get('note').value,observedOn:get('observedOn').value});
 if(ok){const note=get('note');if(note)note.value='';render();toast('已保存到本机。');}else message('未保存。请检查必填内容和日期；登记只能保存一次，草稿已保留。');
 }catch{message('未保存，草稿已保留。请检查本地存储。');}finally{if(button.isConnected)button.disabled=false;}
 });}

export function renderRegistrationLibrary(){
 const root=document.getElementById('registrationRecords');if(!root)return;
 const view=libraryView(root);
 for(const row of root.querySelectorAll('.registration-record'))view.drafts.set(row.dataset.id,{open:[...row.querySelectorAll('details[open]')].map(d=>d.dataset.view),values:[...row.querySelectorAll('[data-registration]')].filter(n=>'value' in n).map(n=>[n.dataset.registration,n.value,n.checked])});
 const active=root.contains(document.activeElement)?document.activeElement:null,focusId=active?.closest('.registration-record')?.dataset.id,focusField=active?.dataset.registration,focusAction=active?.dataset.action,focusView=active?.closest('details')?.dataset.view;
 const data=loadRegistrations(),review=registrationReviewList(data.entries,view.filter);view.filter=review.filter;root.dataset.reviewFilter=review.filter;
 const total=document.getElementById('registrationCount');if(total)total.textContent=data.writable?String(data.entries.length):'—';
 view.filters.hidden=view.note.hidden=!data.writable;
 for(const button of view.filters.querySelectorAll('[data-registration-filter]')){
  const key=button.dataset.registrationFilter;button.textContent=`${reviewFilters[key]} ${review.counts[key]}`;button.setAttribute('aria-pressed',String(key===review.filter));
 }
 view.status.textContent=data.writable?`${reviewFilters[review.filter]} · 显示 ${review.entries.length} 条，共 ${review.counts.all} 条登记`:'';
 const empty={pending:'当前没有待复盘的判断，可切换“已有结果”或“全部”查看。',overdue:'没有已逾期且待复盘的判断。截止日期含当日，次日才算逾期。',reviewed:'尚无已记录明确结果的判断。',all:'尚无判断登记，可从新的结构化解读历史中登记，或导入备份。'};
 root.innerHTML=!data.writable?'<p role="alert">登记数据无法读取，已停止写入，避免覆盖原数据。</p>':!data.entries.length?`<p class="hint">${empty.all}</p>`:!review.entries.length?`<p class="hint">${empty[review.filter]}</p>`:review.entries.slice().reverse().map(e=>{
 const cast=e.snapshot.cast,plate=cast?`${cast.guaName||''}${cast.bianGuaName?' → '+cast.bianGuaName:''}\n${cast.dateText||''}\n${(cast.lines||[]).map(l=>`${l.爻位||''}爻 ${l.六亲||''} ${l.纳甲||''} ${l.状态||''}${l.是否世爻?' 世':''}${l.是否应爻?' 应':''}`).join('\n')}`:'未保存完整卦盘。';
 const record={id:e.historyId,ts:e.snapshot.readingAt,question:e.snapshot.question,text:e.snapshot.answer,cast:e.snapshot.cast};
 const hasResult=e.observations.some(o=>recordedOutcomes.has(o.outcome)),state=hasResult?'已有结果':e.deadline<review.today?'已逾期':'待复盘';
 return `<article class="registration-record" data-id="${esc(e.historyId)}"><h3>${esc(e.snapshot.question||'已登记判断')}</h3><p class="hint registration-review-meta">${state} · ${e.deadline===review.today?'今天截止':`截止日期：${esc(e.deadline)}`}</p>${e.importedAt?'<p class="hint">从备份恢复；原登记时间由文件提供，未独立核实。</p>':''}${registrationHtml(record,data,{standalone:true})}<details data-view="original"><summary>查看登记时的原回答与卦盘</summary><pre>${esc(e.snapshot.answer)}</pre><pre>${esc(plate)}</pre></details></article>`;
 }).join('');
 let restored=false;
 for(const row of root.querySelectorAll('.registration-record')){const draft=view.drafts.get(row.dataset.id);if(draft){for(const d of row.querySelectorAll('details'))d.open=draft.open.includes(d.dataset.view);for(const [field,value,checked]of draft.values){const input=row.querySelector(`[data-registration="${field}"]`);if(input){input.value=value;if(typeof checked==='boolean')input.checked=checked;}}}
 if(row.dataset.id===focusId){const node=focusField?row.querySelector(`[data-registration="${focusField}"]`):focusAction?[...row.querySelectorAll('[data-action]')].find(n=>n.dataset.action===focusAction):[...row.querySelectorAll('details')].find(d=>d.dataset.view===focusView)?.querySelector('summary');if(node){node.focus({preventScroll:true});restored=true;}}}
 if(active&&!restored)view.filters.querySelector(`[data-registration-filter="${review.filter}"]`)?.focus({preventScroll:true});
}
export function bindRegistrationLibrary(loadHistory,render,toast,download){
 const root=document.getElementById('registrationRecords'),file=document.getElementById('registrationImportFile'),button=document.getElementById('registrationImportConfirm'),status=document.getElementById('registrationImportStatus');if(!root||!file||!button||!status||root.dataset.bound)return;root.dataset.bound='true';
 bindRegistrations(root,loadHistory,render,toast,download);let pending=null,generation=0;
 file.addEventListener('change',async()=>{const token=++generation;pending=null;button.hidden=true;button.disabled=false;const selected=file.files?.[0];if(!selected)return;status.textContent='正在检查备份…';
 try{if(selected.size>5000000)throw Error('备份文件超过5MB，未读取。');const raw=await selected.text(),preview=await previewRegistrationImport(raw);if(token!==generation)return;pending={raw,hash:preview.backupHash};status.textContent=`新增 ${preview.added} 条登记，追加 ${preview.appended} 条结果，${preview.duplicates} 条重复不变。确认后合并，不覆盖本机判断。`;button.hidden=!(preview.added||preview.appended);}catch(e){if(token===generation)status.textContent=e.message||'备份无法读取，未导入。';}});
 button.addEventListener('click',async()=>{if(!pending)return;const token=++generation,selected=pending;button.disabled=true;file.disabled=true;
 try{const result=await importRegistrationBackup(selected.raw,selected.hash);if(token!==generation)return;pending=null;file.value='';button.hidden=true;status.textContent=`已导入 ${result.added} 条登记，追加 ${result.appended} 条结果；原本机记录保留。`;render();}
 catch(e){status.textContent=e.message||'未导入，原数据保留。';}finally{button.disabled=false;file.disabled=false;}});
 renderRegistrationLibrary();
}
