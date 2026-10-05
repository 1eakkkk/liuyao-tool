import {test,expect,beforeEach,vi} from 'vitest';import {webcrypto} from 'node:crypto';
import {REGISTRATION_KEY,registerJudgment,loadRegistrations,registrationExport,recordObservation,previewRegistrationImport,importRegistrationBackup} from '../../src/storage/judgment-registration.js';
import {hashOutput} from '../../src/ai/output/context.js';
Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
const record={id:'example',type:'structured',question:'计划结果如何？',text:'这是条件性的参考。',firstReading:{status:'validated',contextId:'sha256:test',prompt:'reading-production-4',outputFormat:'selection-2',groundingPolicyVersion:1},apiKey:'secret'};
const details={claim:'是否完成三项任务',criterion:'以实际完成记录为准',deadline:'2026-10-12',notOccurred:true};
beforeEach(()=>{localStorage.clear();vi.restoreAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-05T10:00:00+08:00'));});
async function backup(){await registerJudgment(record,details);const e=loadRegistrations().entries[0];await recordObservation(e.id,{outcome:'pending',note:'尚未完成',observedOn:'2026-10-05'});return JSON.stringify(registrationExport(loadRegistrations().entries[0]));}

test('restore original fixed snapshot and time from single or aggregate export; duplicate import is inert',async()=>{
 const raw=await backup(),original=loadRegistrations().entries[0];localStorage.clear();const plan=await previewRegistrationImport(raw);expect(plan.added).toBe(1);expect(loadRegistrations().entries).toHaveLength(0);
 expect(await importRegistrationBackup(raw,plan.backupHash)).toEqual({added:1,appended:0,duplicates:0});const restored=loadRegistrations().entries[0];expect(restored.registrationHash).toBe(original.registrationHash);expect(restored.registeredAt).toBe(original.registeredAt);expect(restored.importedAt).toBeDefined();
 const bundle=JSON.stringify({version:1,records:[{apiKey:'ignored-feedback-secret'}],registrations:[JSON.parse(raw)]});const b=await previewRegistrationImport(bundle);expect(await importRegistrationBackup(bundle,b.backupHash)).toEqual({added:0,appended:0,duplicates:1});expect(JSON.stringify(loadRegistrations())).not.toContain('secret');
});

test('new observations union without overwriting local observations; property order does not duplicate an event',async()=>{
 const raw=await backup(),d=JSON.parse(raw),entry=loadRegistrations().entries[0];await recordObservation(entry.id,{outcome:'partial',note:'本机后补一项',observedOn:'2026-10-05'});
 const o=d.observations[0];d.observations[0]={recordedAt:o.recordedAt,observedOn:o.observedOn,note:o.note,outcome:o.outcome};d.observations.push({...o,note:'另一设备后补'});
 const incoming=JSON.stringify(d),p=await previewRegistrationImport(incoming);expect(p.appended).toBe(1);await importRegistrationBackup(incoming,p.backupHash);expect(loadRegistrations().entries[0].observations.map(o=>o.note)).toEqual(['尚未完成','本机后补一项','另一设备后补']);
});

test('corrupt hash, invalid results and a mixed valid/invalid batch never partially write',async()=>{
 const raw=await backup(),before=localStorage.getItem(REGISTRATION_KEY),a=JSON.parse(raw);a.registration.criterion='篡改标准';await expect(previewRegistrationImport(JSON.stringify(a))).rejects.toThrow('哈希');
 const bad=JSON.parse(raw);bad.observations[0].observedOn='2026-02-30';await expect(previewRegistrationImport(JSON.stringify({version:1,registrations:[JSON.parse(raw),bad]}))).rejects.toThrow();expect(localStorage.getItem(REGISTRATION_KEY)).toBe(before);
});

test('legitimately hashed conflicting criteria cannot overwrite local record; changed preview input is rejected',async()=>{
 const raw=await backup(),a=JSON.parse(raw);a.registration.criterion='不同核验标准';const {registrationHash,...payload}=a.registration;a.registration.registrationHash=await hashOutput(payload);const before=localStorage.getItem(REGISTRATION_KEY);await expect(previewRegistrationImport(JSON.stringify(a))).rejects.toThrow('未覆盖');await expect(importRegistrationBackup(raw,'wrong-hash')).rejects.toThrow('变化');expect(localStorage.getItem(REGISTRATION_KEY)).toBe(before);
});

test('damaged local store or quota failure stays untouched and refuses import',async()=>{
 const raw=await backup();localStorage.setItem(REGISTRATION_KEY,'{bad');await expect(previewRegistrationImport(raw)).rejects.toThrow('无法读取');expect(localStorage.getItem(REGISTRATION_KEY)).toBe('{bad');localStorage.clear();const p=await previewRegistrationImport(raw);const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});await expect(importRegistrationBackup(raw,p.backupHash)).rejects.toThrow('未保存');spy.mockRestore();expect(localStorage.getItem(REGISTRATION_KEY)).toBeNull();
});
