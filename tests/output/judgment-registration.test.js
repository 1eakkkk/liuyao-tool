import {test,expect,beforeEach,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {REGISTRATION_KEY,canRegister,loadRegistrations,registerJudgment,recordObservation,registrationExport,verifyRegistration} from '../../src/storage/judgment-registration.js';
import {registrationHtml,bindRegistrations} from '../../src/ui/judgment-registration.js';
import {saveFeedback} from '../../src/storage/outcome-feedback.js';
import {saveHistory} from '../../src/storage/history.js';
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
const r={id:'first',ts:100,type:'structured',question:'能完成计划吗？',text:'结果尚不能确定。',firstReading:{status:'validated',contextId:'sha256:test',prompt:'reading-production-4',outputFormat:'selection-2',groundingPolicyVersion:1,apiKey:'secret'},apiKey:'do-not-export'};
const p={claim:'在截止日期前完成计划。',criterion:'以记录完成全部三项任务为准。',deadline:'2026-10-12',notOccurred:true};
beforeEach(()=>{localStorage.clear();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-05T10:00:00+08:00'));});

test('fixed snapshot and standard survive followups, changed answer and deleted history; observations append',async()=>{
 expect(await registerJudgment(r,p)).toBe(true);const original=loadRegistrations().entries[0];expect(await verifyRegistration(original)).toBe(true);
 expect(await registerJudgment({...r,text:'改写结论'},p)).toBe(false);expect(await registerJudgment({...r,turns:[{role:'assistant',text:r.text},{role:'assistant',text:'追问答复'}]},p)).toBe(false);
 expect(await recordObservation(original.id,{outcome:'pending',note:'记录开始时尚未完成',observedOn:'2026-10-05'})).toBe(true);
 expect(await recordObservation(original.id,{outcome:'partial',note:'完成一项',observedOn:'2026-10-05'})).toBe(true);
 const saved=loadRegistrations().entries[0];expect(saved.registrationHash).toBe(original.registrationHash);expect(saved.observations).toHaveLength(2);saveHistory([]);expect(loadRegistrations().entries[0].snapshot.answer).toBe(r.text);
 expect(JSON.stringify(registrationExport(saved))).not.toMatch(/secret|do-not-export|apiKey/);
});

test('unvalidated/old records, retrospective confirmation, impossible or past deadlines are not registered',async()=>{
 for(const record of [{...r,type:'prompt'},{...r,firstReading:null},{...r,firstReading:{status:'fallback'}}])expect(canRegister(record)).toBe(false);
 for(const patch of [{notOccurred:false},{deadline:'2026-02-30'},{deadline:'2026-10-04'},{criterion:' '},{claim:' '}])expect(await registerJudgment(r,{...p,...patch})).toBe(false);
 expect(loadRegistrations().entries).toHaveLength(0);
});

test('damaged storage or altered registered standards are preserved and cannot append or pass verification',async()=>{
 localStorage.setItem(REGISTRATION_KEY,'{bad');expect(loadRegistrations().writable).toBe(false);expect(await registerJudgment(r,p)).toBe(false);expect(localStorage.getItem(REGISTRATION_KEY)).toBe('{bad');localStorage.clear();await registerJudgment(r,p);
 const d=JSON.parse(localStorage.getItem(REGISTRATION_KEY));d.entries[0].criterion='改了标准';localStorage.setItem(REGISTRATION_KEY,JSON.stringify(d));expect(await verifyRegistration(d.entries[0])).toBe(false);expect(await recordObservation(d.entries[0].id,{outcome:'matches',note:'发生',observedOn:'2026-10-05'})).toBe(false);
});

test('future and pre-registration results are rejected and failed storage preserves data',async()=>{
 await registerJudgment(r,p);const e=loadRegistrations().entries[0],before=localStorage.getItem(REGISTRATION_KEY);
 for(const observedOn of ['2026-10-04','2026-10-06','2026-02-30'])expect(await recordObservation(e.id,{outcome:'matches',note:'发生了',observedOn})).toBe(false);
 const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});expect(await recordObservation(e.id,{outcome:'partial',note:'发生了',observedOn:'2026-10-05'})).toBe(false);spy.mockRestore();expect(localStorage.getItem(REGISTRATION_KEY)).toBe(before);
});

test('rendered text is escaped and saved criteria have no edit controls',async()=>{
 await registerJudgment(r,{...p,criterion:'<img src=x onerror=alert(1)>'});const root=document.createElement('div');root.innerHTML=registrationHtml(r);expect(root.querySelector('img')).toBeNull();expect(root.querySelector('[data-registration="criterion"]')).toBeNull();expect(root.querySelector('[data-action="registration-observe"]')).not.toBeNull();
 vi.useRealTimers();
});

test('existing retrospective feedback cannot be relabeled as an advance registration',async()=>{await saveFeedback(r,{outcome:'partial',note:'已经发生部分结果',observedOn:'2026-10-05'});expect(await registerJudgment(r,p)).toBe(false);});
