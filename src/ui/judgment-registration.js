import {canRegister,loadRegistrations,registerJudgment,recordObservation,registrationExport,verifyRegistration} from '../storage/judgment-registration.js';
import {OUTCOMES,feedbackSnapshot,loadFeedback} from '../storage/outcome-feedback.js';
import {escapeHtml as esc} from './helpers.js';
export function registrationHtml(record,data=loadRegistrations()){
 const entry=data.entries.find(e=>e.historyId===String(record.id));
 if(!entry&&!canRegister(record))return '';
 if(!entry&&loadFeedback().entries.some(e=>e.historyId===String(record.id)))return '<p class="hint">已保存事后反馈，不再补登事前判断。</p>';
 if(!data.writable)return '<p role="alert">判断登记数据无法读取，已停止写入，请先导出备份。</p>';
 const changed=entry&&JSON.stringify(entry.snapshot)!==JSON.stringify(feedbackSnapshot(record));
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
 const item=button.closest('.history-item'),get=k=>item.querySelector(`[data-registration="${k}"]`),message=t=>{get('status').textContent=t;};button.disabled=true;
 try{if(button.dataset.action==='registration-export'){const entry=loadRegistrations().entries.find(e=>e.id===button.dataset.registrationId);if(!entry||!await verifyRegistration(entry)){message('登记内容校验失败，未导出；请保留本地数据。');return;}download(registrationExport(entry));return;}
 let ok;if(button.dataset.action==='registration-create'){const record=loadHistory().find(r=>String(r.id)===item.dataset.id);ok=record&&await registerJudgment(record,{claim:get('claim').value,criterion:get('criterion').value,deadline:get('deadline').value,notOccurred:get('notOccurred').checked});}
 else ok=await recordObservation(button.dataset.registrationId,{outcome:get('outcome').value,note:get('note').value,observedOn:get('observedOn').value});
 if(ok){const note=get('note');if(note)note.value='';render();toast('已保存到本机。');}else message('未保存。请检查必填内容和日期；登记只能保存一次，草稿已保留。');
 }catch{message('未保存，草稿已保留。请检查本地存储。');}finally{if(button.isConnected)button.disabled=false;}
 });}
