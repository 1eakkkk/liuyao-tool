import {beforeEach,afterEach,test,expect,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {registrationReviewList,renderRegistrationLibrary,bindRegistrationLibrary} from '../../src/ui/judgment-registration.js';
import {REGISTRATION_KEY,registerJudgment,loadRegistrations,recordObservation} from '../../src/storage/judgment-registration.js';

Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
const entry=(id,deadline,outcomes=[])=>({id,deadline,observations:outcomes.map(outcome=>({outcome}))});
const record=id=>({id,type:'structured',question:`计划 ${id}`,text:'这是一项需要现实结果核对的判断。',firstReading:{status:'validated',contextId:`context:${id}`,prompt:'reading-production-4',outputFormat:'selection-2',judgmentPolicyVersion:7}});

beforeEach(()=>{
 localStorage.clear();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-01T10:00:00+08:00'));
 document.body.innerHTML='<details id="registrationLibrary"><summary>判断登记 <span id="registrationCount"></span></summary><input type="file" id="registrationImportFile"><p id="registrationImportStatus"></p><button id="registrationImportConfirm" hidden>确认合并导入</button><div id="registrationRecords"></div></details>';
});
afterEach(()=>{vi.useRealTimers();document.body.replaceChildren();});

async function seed(){
 for(const [id,deadline,outcome]of [['old','2026-10-04'],['today','2026-10-05','unclear'],['future','2026-10-06','pending'],['done','2026-10-04','partial']]){
  await registerJudgment(record(id),{claim:'完成计划',criterion:'检查实际任务记录',deadline,notOccurred:true});
  if(outcome){const saved=loadRegistrations().entries.find(e=>e.historyId===id);await recordObservation(saved.id,{outcome,note:'首次记录',observedOn:'2026-10-01'});}
 }
 vi.setSystemTime(new Date('2026-10-05T10:00:00+08:00'));
}
const filter=key=>document.querySelector(`[data-registration-filter="${key}"]`);
const visibleIds=()=>[...document.querySelectorAll('.registration-record')].map(row=>row.dataset.id);

test('the inclusive deadline changes to overdue at local midnight, independently of the UTC date',()=>{
 // The application test timezone is Asia/Shanghai: these UTC instants straddle local midnight.
 const records=[entry('one','2026-10-05')];
 const before=registrationReviewList(records,'overdue',new Date('2026-10-05T15:59:59.999Z'));
 const after=registrationReviewList(records,'overdue',new Date('2026-10-05T16:00:00.000Z'));
 expect(before.today).toBe('2026-10-05');expect(before.entries).toHaveLength(0);expect(before.counts.pending).toBe(1);
 expect(after.today).toBe('2026-10-06');expect(after.entries).toEqual(records);
});

test('pending and unclear observations remain reviewable; recorded results are independent of import order',()=>{
 const records=[entry('pending','2026-10-04',['pending']),entry('unclear','2026-10-06',['unclear']),entry('matches','2026-10-04',['matches']),entry('partial','2026-10-04',['partial','pending']),entry('differs','2026-10-04',['unclear','differs'])];
 const now=new Date(2026,9,5,12);
 expect(registrationReviewList(records,'pending',now).counts).toEqual({pending:2,overdue:1,reviewed:3,all:5});
 expect(registrationReviewList(records,'pending',now).entries.map(e=>e.id)).toEqual(['pending','unclear']);
 expect(registrationReviewList(records,'reviewed',now).entries.map(e=>e.id)).toEqual(['matches','partial','differs']);
 const reversed=records.map(e=>({...e,observations:e.observations.slice().reverse()}));
 expect(registrationReviewList(reversed,'all',now).counts).toEqual(registrationReviewList(records,'all',now).counts);
});

test('filters show workflow counts, retain native keyboard controls and leave storage untouched',async()=>{
 await seed();const before=localStorage.getItem(REGISTRATION_KEY);renderRegistrationLibrary();
 expect(filter('pending').textContent).toBe('待复盘 3');expect(filter('overdue').textContent).toBe('已逾期 1');expect(filter('reviewed').textContent).toBe('已有结果 1');expect(filter('all').textContent).toBe('全部 4');
 expect(filter('pending').getAttribute('aria-pressed')).toBe('true');expect(filter('pending').getAttribute('aria-controls')).toBe('registrationRecords');
 expect(visibleIds()).toEqual(['future','today','old']);
 filter('overdue').click();expect(visibleIds()).toEqual(['old']);expect(document.activeElement).toBe(filter('overdue'));
 expect(document.querySelector('[role="status"].registration-filter-status').textContent).toContain('显示 1 条');
 filter('reviewed').click();expect(visibleIds()).toEqual(['done']);
 filter('all').click();expect(visibleIds()).toHaveLength(4);expect(localStorage.getItem(REGISTRATION_KEY)).toBe(before);
});

test('switching filters preserves unsaved result drafts and open sections',async()=>{
 await seed();renderRegistrationLibrary();
 const row=document.querySelector('[data-id="today"]');row.querySelector('details[data-view="registration"]').open=true;
 row.querySelector('[data-registration="note"]').value='切换筛选后仍需保留的草稿';
 row.querySelector('[data-registration="outcome"]').value='differs';row.querySelector('[data-registration="observedOn"]').value='2026-10-05';
 filter('reviewed').click();filter('pending').click();
 const restored=document.querySelector('[data-id="today"]');
 expect(restored.querySelector('[data-registration="note"]').value).toBe('切换筛选后仍需保留的草稿');
 expect(restored.querySelector('[data-registration="outcome"]').value).toBe('differs');expect(restored.querySelector('[data-registration="observedOn"]').value).toBe('2026-10-05');
 expect(restored.querySelector('details[data-view="registration"]').open).toBe(true);
});

test('recording a real result updates counts and returns focus when the item leaves the active filter',async()=>{
 await seed();bindRegistrationLibrary(()=>[],renderRegistrationLibrary,vi.fn(),vi.fn());
 const row=document.querySelector('[data-id="old"]');row.querySelector('details[data-view="registration"]').open=true;
 row.querySelector('[data-registration="outcome"]').value='differs';row.querySelector('[data-registration="note"]').value='结果没有发生';row.querySelector('[data-registration="observedOn"]').value='2026-10-05';
 const save=row.querySelector('[data-action="registration-observe"]');save.focus();save.click();
 await vi.waitFor(()=>expect(filter('reviewed').textContent).toBe('已有结果 2'));
 expect(visibleIds()).not.toContain('old');expect(document.activeElement).toBe(filter('pending'));expect(filter('overdue').textContent).toBe('已逾期 0');
 filter('overdue').click();expect(document.getElementById('registrationRecords').textContent).toContain('没有已逾期');
 expect(document.getElementById('registrationImportFile')).not.toBeNull();
 filter('reviewed').click();expect(document.querySelector('[data-id="old"] [data-action="registration-export"]')).not.toBeNull();
});

test('empty and damaged storage keep import available and do not imply successful reviews',()=>{
 renderRegistrationLibrary();expect(document.getElementById('registrationRecords').textContent).toContain('尚无判断登记');
 localStorage.setItem(REGISTRATION_KEY,'{bad');renderRegistrationLibrary();
 expect(document.querySelector('#registrationRecords [role="alert"]').textContent).toContain('停止写入');expect(document.querySelector('.registration-filters').hidden).toBe(true);expect(document.getElementById('registrationCount').textContent).toBe('—');expect(localStorage.getItem(REGISTRATION_KEY)).toBe('{bad');
 expect(document.getElementById('registrationImportFile')).not.toBeNull();
});
