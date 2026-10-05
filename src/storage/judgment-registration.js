import {safeSetItem} from './local.js';
import {feedbackSnapshot,feedbackExport,loadFeedback,OUTCOMES} from './outcome-feedback.js';
import {hashOutput} from '../ai/output/context.js';
export const REGISTRATION_KEY='liuyao_judgment_registrations_v1';
const dateOk=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const textOk=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
const versionOf=r=>r.firstReading?Object.fromEntries(['status','contextId','prompt','outputFormat','taskPolicyVersion','judgmentPolicyVersion','groundingPolicyVersion'].filter(k=>r.firstReading[k]===null||['string','number'].includes(typeof r.firstReading[k])).map(k=>[k,r.firstReading[k]])):null;
export function canRegister(record){return record.type==='structured'&&record.firstReading?.status==='validated'&&!!feedbackSnapshot(record);}
export function loadRegistrations(){
 try{const raw=localStorage.getItem(REGISTRATION_KEY);if(!raw)return {entries:[],writable:true};if(raw.length>5000000)throw Error('Oversize registrations');const d=JSON.parse(raw);
 if(d.version!==1||!Array.isArray(d.entries)||d.entries.length>500)throw Error('Invalid registrations');
 const ids=new Set(),histories=new Set();
 for(const e of d.entries){if(!e||e.kind!=='local_judgment_registration'||typeof e.id!=='string'||ids.has(e.id)||histories.has(e.historyId)||typeof e.historyId!=='string'||typeof e.snapshotHash!=='string'||typeof e.registrationHash!=='string'||!e.snapshot||!textOk(e.snapshot.answer,200000)||!textOk(e.claim,1000)||!textOk(e.criterion,500)||!dateOk(e.deadline)||!dateOk(e.registeredOn)||!Number.isFinite(Date.parse(e.registeredAt))||!e.versions||!Array.isArray(e.observations))throw Error('Invalid registration');ids.add(e.id);histories.add(e.historyId);
 for(const o of e.observations)if(!o||!Object.hasOwn(OUTCOMES,o.outcome)||!textOk(o.note,2000)||!dateOk(o.observedOn)||!Number.isFinite(Date.parse(o.recordedAt)))throw Error('Invalid observation');}
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
