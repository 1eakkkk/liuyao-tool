import {canRegister,loadRegistrations,registerJudgment,recordObservation,registrationExport,verifyRegistration,previewRegistrationImport,importRegistrationBackup} from '../storage/judgment-registration.js';
import {OUTCOMES,feedbackSnapshot,loadFeedback} from '../storage/outcome-feedback.js';
import {escapeHtml as esc} from './helpers.js';
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
 const drafts=new Map([...root.querySelectorAll('.registration-record')].map(row=>[row.dataset.id,{open:[...row.querySelectorAll('details[open]')].map(d=>d.dataset.view),values:[...row.querySelectorAll('[data-registration]')].filter(n=>'value' in n).map(n=>[n.dataset.registration,n.value])}]));
 const active=root.contains(document.activeElement)?document.activeElement:null,focusId=active?.closest('.registration-record')?.dataset.id,focusField=active?.dataset.registration,focusAction=active?.dataset.action;
 const data=loadRegistrations();document.getElementById('registrationCount').textContent=String(data.entries.length);
 root.innerHTML=!data.writable?'<p role="alert">登记数据无法读取，已停止写入，避免覆盖原数据。</p>':!data.entries.length?'<p class="hint">尚无判断登记，可从新的结构化解读历史中登记，或导入备份。</p>':data.entries.slice().reverse().map(e=>{
 const cast=e.snapshot.cast,plate=cast?`${cast.guaName||''}${cast.bianGuaName?' → '+cast.bianGuaName:''}\n${cast.dateText||''}\n${(cast.lines||[]).map(l=>`${l.爻位||''}爻 ${l.六亲||''} ${l.纳甲||''} ${l.状态||''}${l.是否世爻?' 世':''}${l.是否应爻?' 应':''}`).join('\n')}`:'未保存完整卦盘。';
 const record={id:e.historyId,ts:e.snapshot.readingAt,question:e.snapshot.question,text:e.snapshot.answer,cast:e.snapshot.cast};
 return `<article class="registration-record" data-id="${esc(e.historyId)}"><h3>${esc(e.snapshot.question||'已登记判断')}</h3>${e.importedAt?'<p class="hint">从备份恢复；原登记时间由文件提供，未独立核实。</p>':''}${registrationHtml(record,data,{standalone:true})}<details data-view="original"><summary>查看登记时的原回答与卦盘</summary><pre>${esc(e.snapshot.answer)}</pre><pre>${esc(plate)}</pre></details></article>`;
 }).join('');
 for(const row of root.querySelectorAll('.registration-record')){const draft=drafts.get(row.dataset.id);if(draft){for(const d of row.querySelectorAll('details'))d.open=draft.open.includes(d.dataset.view);for(const [field,value]of draft.values){const input=row.querySelector(`[data-registration="${field}"]`);if(input)input.value=value;}}
 if(row.dataset.id===focusId){const node=focusField?row.querySelector(`[data-registration="${focusField}"]`):[...row.querySelectorAll('[data-action]')].find(n=>n.dataset.action===focusAction);node?.focus({preventScroll:true});}}
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
