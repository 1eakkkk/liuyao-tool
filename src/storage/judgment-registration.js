import {safeSetItem} from './local.js';
import {feedbackSnapshot,feedbackExport,loadFeedback,OUTCOMES} from './outcome-feedback.js';
import {hashOutput} from '../ai/output/context.js';
export const REGISTRATION_KEY='liuyao_judgment_registrations_v1';
const dateOk=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const isoOk=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const textOk=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
const versionOf=r=>r.firstReading?Object.fromEntries(['status','contextId','prompt','outputFormat','taskPolicyVersion','judgmentPolicyVersion','groundingPolicyVersion'].filter(k=>r.firstReading[k]===null||['string','number'].includes(typeof r.firstReading[k])).map(k=>[k,r.firstReading[k]])):null;
export function canRegister(record){return record.type==='structured'&&record.firstReading?.status==='validated'&&!!feedbackSnapshot(record);}
export function loadRegistrations(){
 try{const raw=localStorage.getItem(REGISTRATION_KEY);if(!raw)return {entries:[],writable:true};if(raw.length>5000000)throw Error('Oversize registrations');const d=JSON.parse(raw);
 if(d.version!==1||!Array.isArray(d.entries)||d.entries.length>500)throw Error('Invalid registrations');
 const ids=new Set(),histories=new Set();
 for(const e of d.entries){if(!e||e.kind!=='local_judgment_registration'||typeof e.id!=='string'||ids.has(e.id)||histories.has(e.historyId)||typeof e.historyId!=='string'||typeof e.snapshotHash!=='string'||typeof e.registrationHash!=='string'||!e.snapshot||!textOk(e.snapshot.answer,200000)||!textOk(e.claim,1000)||!textOk(e.criterion,500)||!dateOk(e.deadline)||!dateOk(e.registeredOn)||!isoOk(e.registeredAt)||!e.versions||!Array.isArray(e.observations))throw Error('Invalid registration');ids.add(e.id);histories.add(e.historyId);
 for(const o of e.observations)if(!o||!Object.hasOwn(OUTCOMES,o.outcome)||!textOk(o.note,2000)||!dateOk(o.observedOn)||!isoOk(o.recordedAt))throw Error('Invalid observation');}
 return {entries:d.entries,writable:true};}catch{return {entries:[],writable:false};}
}
function store(entries){const text=JSON.stringify({version:1,entries});return text.length<=5000000&&safeSetItem(REGISTRATION_KEY,text);}
function payload(e){return {id:e.id,kind:e.kind,historyId:e.historyId,snapshot:e.snapshot,snapshotHash:e.snapshotHash,versions:e.versions,claim:e.claim,criterion:e.criterion,deadline:e.deadline,registeredAt:e.registeredAt,registeredOn:e.registeredOn};}
export async function verifyRegistration(e){try{return await hashOutput(e.snapshot)===e.snapshotHash&&await hashOutput(payload(e))===e.registrationHash;}catch{return false;}}
export async function registerJudgment(record,{claim,criterion,deadline,notOccurred}){
 if(!canRegister(record)||notOccurred!==true||!textOk(claim,1000)||!textOk(criterion,500)||!dateOk(deadline)||deadline<today())return false;
 const feedback=loadFeedback();if(!feedback.writable||feedback.entries.some(e=>e.historyId===String(record.id)))return false;
 const snapshot=feedbackSnapshot(record),e={id:'judgment-'+crypto.randomUUID(),kind:'local_judgment_registration',historyId:String(record.id),snapshot,snapshotHash:await hashOutput(snapshot),versions:versionOf(record),claim:claim.trim(),criterion:criterion.trim(),deadline,registeredAt:new Date().toISOString(),registeredOn:today(),observations:[]};e.registrationHash=await hashOutput(payload(e));
 const data=loadRegistrations();if(!data.writable||data.entries.length>=500||data.entries.some(x=>x.historyId===e.historyId))return false;
 return store([...data.entries,e]);
}
export async function recordObservation(id,{outcome,note,observedOn}){
 if(!Object.hasOwn(OUTCOMES,outcome)||!textOk(note,2000)||!dateOk(observedOn)||observedOn>today())return false;
 const before=loadRegistrations(),entry=before.entries.find(e=>e.id===id);if(!before.writable||!entry||entry.observations.length>=100||!await verifyRegistration(entry)||observedOn<entry.registeredOn)return false;
 // Re-read after async hashing to retain observations written while verification awaited.
 const data=loadRegistrations(),current=data.entries.find(e=>e.id===id);if(!data.writable||!current||JSON.stringify(payload(current))!==JSON.stringify(payload(entry))||current.registrationHash!==entry.registrationHash||current.observations.length>=100)return false;
 current.observations.push({outcome,note:note.trim(),observedOn,recordedAt:new Date().toISOString()});
 return store(data.entries);
}
export function registrationExport(entry){return {version:1,kind:'local_judgment_registration',warning:'本机登记及用户结果记录；本地时间与哈希不是可信时间戳，也不能防止本地修改。不自动计算预测准确率。',registration:{...payload(entry),snapshot:feedbackExport({snapshot:entry.snapshot}).snapshot,versions:versionOf({firstReading:entry.versions}),registrationHash:entry.registrationHash},observations:entry.observations.map(o=>({outcome:o.outcome,note:o.note,observedOn:o.observedOn,recordedAt:o.recordedAt}))};}

const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
export async function parseRegistrationBackup(raw){
 if(typeof raw!=='string'||raw.length>5000000)throw Error('备份过大或格式不正确。');
 let d;try{d=JSON.parse(raw);}catch{throw Error('无法读取JSON备份。');}
 const list=d?.version===1&&d?.kind==='local_judgment_registration'?[d]:d?.version===1&&Array.isArray(d?.registrations)?d.registrations:null;
 if(!list||!list.length||list.length>500)throw Error('文件中没有可导入的判断登记，或数量超出上限。');
 const entries=[],ids=new Set(),histories=new Set();
 for(const item of list){
  const r=item?.registration,o=item?.observations;
  if(item?.version!==1||item?.kind!=='local_judgment_registration'||!exactKeys(r,['id','kind','historyId','snapshot','snapshotHash','versions','claim','criterion','deadline','registeredAt','registeredOn','registrationHash'])||r.kind!=='local_judgment_registration'||!textOk(r.id,200)||!textOk(r.historyId,200)||ids.has(r.id)||histories.has(r.historyId)||!exactKeys(r.snapshot,['historyId','readingAt','question','answer','cast'])||r.snapshot.historyId!==r.historyId||!(r.snapshot.readingAt===null||(typeof r.snapshot.readingAt==='number'&&Number.isFinite(r.snapshot.readingAt)&&r.snapshot.readingAt>=0))||typeof r.snapshot.question!=='string'||r.snapshot.question.length>500||!textOk(r.snapshot.answer,200000)||!textOk(r.claim,1000)||!textOk(r.criterion,500)||!dateOk(r.deadline)||!dateOk(r.registeredOn)||r.deadline<r.registeredOn||!isoOk(r.registeredAt)||r.versions?.status!=='validated'||Object.keys(r.versions).some(k=>!Object.hasOwn(versionOf({firstReading:r.versions}),k))||!Array.isArray(o)||o.length>100)throw Error('备份登记字段不完整、重复或不兼容，未导入。');
  for(const row of o)if(!exactKeys(row,['outcome','note','observedOn','recordedAt'])||!Object.hasOwn(OUTCOMES,row.outcome)||!textOk(row.note,2000)||!dateOk(row.observedOn)||row.observedOn<r.registeredOn||!isoOk(row.recordedAt))throw Error('备份结果记录不完整，未导入。');
  const e={...r,observations:o.map(row=>({...row}))};
  const exported=registrationExport(e);
  if(!await verifyRegistration(e)||await hashOutput(exported.registration.snapshot)!==r.snapshotHash)throw Error('备份哈希不匹配，原回答或标准可能已变化，未导入。');
  ids.add(e.id);histories.add(e.historyId);entries.push(e);
 }
 return entries;
}
function mergeBackup(existing,incoming){
 const entries=structuredClone(existing);let added=0,appended=0,duplicates=0;
 for(const e of incoming){const byId=entries.find(x=>x.id===e.id),byHistory=entries.find(x=>x.historyId===e.historyId);
  if((byId&&byId.historyId!==e.historyId)||(byHistory&&byHistory.id!==e.id)||(byId&&byId.registrationHash!==e.registrationHash))throw Error('本机已有同编号但内容不同的登记，未覆盖；请先分别备份核对。');
  if(!byId){entries.push({...e,importedAt:new Date().toISOString()});added++;continue;}
  const seen=new Set(byId.observations.map(row=>JSON.stringify([row.outcome,row.note,row.observedOn,row.recordedAt])));let count=0;
  for(const row of e.observations){const key=JSON.stringify([row.outcome,row.note,row.observedOn,row.recordedAt]);if(!seen.has(key)){byId.observations.push(row);seen.add(key);count++;}}
  if(byId.observations.length>100)throw Error('合并后的结果条数超过上限，未导入。');
  appended+=count;if(!count)duplicates++;
 }
 if(entries.length>500||JSON.stringify({version:1,entries}).length>5000000)throw Error('合并后超出本机登记容量，未导入。');
 return {entries,added,appended,duplicates};
}
export async function previewRegistrationImport(raw){
 const incoming=await parseRegistrationBackup(raw),data=loadRegistrations();if(!data.writable)throw Error('本机登记无法读取，未导入，避免覆盖原数据。');
 for(const e of data.entries)if(!await verifyRegistration(e))throw Error('本机登记哈希无法核对，未导入。');
 return {...mergeBackup(data.entries,incoming),backupHash:await hashOutput(raw)};
}
export async function importRegistrationBackup(raw,expectedHash){
 const incoming=await parseRegistrationBackup(raw);if(await hashOutput(raw)!==expectedHash)throw Error('所选备份已经变化，请重新预览。');
 const before=loadRegistrations();if(!before.writable)throw Error('本机登记无法读取，未导入。');const fingerprint=JSON.stringify(before.entries);
 for(const e of before.entries)if(!await verifyRegistration(e))throw Error('本机登记哈希无法核对，未导入。');
 const current=loadRegistrations();if(!current.writable||JSON.stringify(current.entries)!==fingerprint)throw Error('本机登记刚发生变化，请重新预览后导入。');
 const result=mergeBackup(current.entries,incoming);if((result.added||result.appended)&&!store(result.entries))throw Error('备份未保存，原数据保留；请检查本地存储。');return {added:result.added,appended:result.appended,duplicates:result.duplicates};
}
