import { createReadingSession, prepareSelectedReadingTurn as prepareReadingTurn, appendReadingTurn, serializeReadingSession, readingExport } from '../ai/output/session.js';
import { callReading } from '../ai/output/client.js';
import { renderOutputResult } from '../ai/output/view.js';
import { castStore } from '../app/cast-store.js';
import { safeSetItem, safeRemoveItem } from '../storage/local.js';
import { clearActiveConversationStorage } from '../storage/conversation.js';
import { copyTextToClipboard } from './helpers.js';
import { state } from '../app/state.js';
import { loadStyleChoice, loadCustomStyle } from '../storage/settings.js';
import { archiveReading, readingHistoryText } from '../storage/reading-history.js';
import { renderHistory } from './history-view.js';
import {initializeBackground,selectedBackground,clearBackground} from './background.js';
import {readingAvailability} from '../ai/output/availability.js';

const KEY = 'liuyao_structured_reading_v1';
let session = null, pending = null, busy = false, epoch = 0;
let renderedSession = null;
let availabilityNotice = null;
const el = id => document.getElementById(id);
export const readingSelected = () => el('readingMode')?.value === 'structured';
function status(text) { el('readingStatus').textContent = text; }
function persist() {
  if (!session) return;
  if (!safeSetItem(KEY, serializeReadingSession(session, pending?.question ?? null))) status('回复已保留在页面，但本地保存失败；请复制对话留存。');
  if (!archiveReading(session, pending)) status('历史记录保存失败，请复制对话留存。');
  renderHistory();
}
function render() {
  const root = el('readingPanel'); root.hidden = !session;
  if (!session) return;
  const turnsRoot = el('readingTurns');
  if (renderedSession !== session) { turnsRoot.replaceChildren(); renderedSession = session; }
  // A limited observation that depends on unconfirmed real conditions keeps its notice
  // visible next to the generated answer, so the gap is never silently dropped.
  if(availabilityNotice?.kind==='conditions_unconfirmed'&&!el('readingAvailability')){
    el('readingPanel').hidden=false;
    el('readingStatus').after(availabilityNotice.element);
  }
  // Completed turns are immutable. Keep their nodes, disclosure states and focus during followups.
  for (const t of session.turns.slice(turnsRoot.childElementCount)) {
    const block = document.createElement('article');
    const question = document.createElement('h3'); question.textContent = `问：${t.question}`;
    const result = document.createElement('div'); renderOutputResult(result, t.result, t.context, { collapseFallback: true });
    block.append(question, result);
    if(t.result.status !== 'validated') {
      const copy=document.createElement('button'); copy.type='button'; copy.className='ai-btn ghost'; copy.textContent='复制原始回复';
      copy.addEventListener('click',async()=>{try{await copyTextToClipboard(t.raw);status('已复制原始回复。');}catch{status('复制失败，请展开原文手动复制。');}});
      block.append(copy);
    }
    if (t.result.answer?.answer && session.preferences) {
      const size = document.createElement('p'); size.className = 'reading-note';
      const count = [...t.result.answer.answer.replace(/\s/g,'')].length;
      const goal = {brief:'300–400 字',deep:'700–800 字',custom:'自定义篇幅'}[session.preferences.style];
      size.textContent = `正文约 ${count} 字 · 本次目标：${goal}（纯事实核对可简短；不含折叠依据）`;
      block.append(size);
    }
    if (t.usage) {
      const usage = document.createElement('p'); usage.className = 'reading-note';
      usage.textContent = t.usage.total == null ? '用量未收全，费用未知；以 DeepSeek 账单为准。' : `解读调用 ${t.usage.total} tokens · 约 ¥${t.usage.cost.toFixed(4)} · 以 DeepSeek 账单为准${t.context.input.background_search?' · 背景查询费用另计':''}`;
      block.append(usage);
    }
    turnsRoot.append(block);
  }
  el('readingExportArea').hidden = !pending;
  el('readingPrompt').value = pending ? readingExport(pending) : '';
  el('readingFollowArea').hidden = !session.turns.length || !!pending;
  el('readingPaste').value = '';
  el('readingComplete').checked = false;
  el('readingCopyAll').hidden=!session.turns.length;
  el('readingStorageNote').hidden=!session.turns.length&&!pending;
}
export function clearReading() {
  epoch++; session = null; pending = null; renderedSession = null;
  availabilityNotice = null;
  el('readingAvailability')?.remove();
  safeRemoveItem(KEY);
  if (el('readingPanel')) { el('readingPanel').hidden = true; el('readingTurns').replaceChildren(); }
}
function buildAvailabilityNotice(capability,prepared){
  const root=el('readingPanel');root.hidden=false;
  const notice=document.createElement('section');notice.id='readingAvailability';notice.className='reading-availability';
  const heading=document.createElement('h2');heading.textContent=capability.title;
  const body=document.createElement('p');body.textContent=capability.message;
  const question=document.createElement('p');question.textContent=`你问的是：${prepared.question}`;
  const actions=document.createElement('div');actions.className='reading-availability-actions';
  const facts=document.createElement('details');facts.id='readingLocalFacts';
  const summary=document.createElement('summary');summary.textContent='查看已摇卦盘（无需 AI）';facts.append(summary);
  const list=document.createElement('ol');
  for(const line of prepared.context.input.C_canonical_cast.lines){
    const row=document.createElement('li');row.textContent=`第${line.position}爻：${line.relative} · ${line.branch}${line.element} · ${line.moving?'动爻':'静爻'}${line.is_shi?' · 世爻':''}${line.is_ying?' · 应爻':''}`;list.append(row);
  }
  facts.append(list);
  return {notice,heading,body,question,actions,facts};
}
function checkAvailability(prepared){
  el('readingAvailability')?.remove(); availabilityNotice=null;
  const capability=readingAvailability(prepared.context);
  if(!capability.blocked&&capability.kind!=='conditions_unconfirmed')return true;
  const parts=buildAvailabilityNotice(capability,prepared);
  // The third gap states what still has to be confirmed instead of asking for a verdict.
  if(capability.items?.length){
    const pending=document.createElement('ul');pending.id='readingAvailabilityItems';
    for(const item of capability.items){const row=document.createElement('li');row.textContent=item;pending.append(row);}
    parts.notice.append(parts.heading,parts.question,parts.body,pending);
  }else parts.notice.append(parts.heading,parts.question,parts.body);
  parts.notice.append(parts.facts,parts.actions);
  if(capability.blocked){
    const legacy=document.createElement('button');legacy.id='readingSwitchLegacy';legacy.type='button';legacy.className='ai-btn ghost';legacy.textContent='切换普通解读';
    legacy.addEventListener('click',()=>{el('readingMode').value='legacy';el('readingMode').dispatchEvent(new Event('change'));el('aiStatus').textContent='已切换普通解读。此模式不具备同等取法准入核对，内容仅供参考；点击 AI 解读或输出提示词后才会生成。';el('readingMode').focus();});
    parts.actions.append(legacy);
    const note=document.createElement('p');note.className='reading-note';note.textContent='普通解读不具备同等取法准入核对；切换不会自动生成回复。';
    parts.notice.append(note);
  }else{
    const note=document.createElement('p');note.className='reading-note';note.textContent='本轮仍会生成有限观察；带“待核实”的作用条件不作为确定的支持或阻碍。';
    parts.notice.append(note);
  }
  availabilityNotice=capability.blocked?capability:{...capability,element:parts.notice};
  el('readingStatus').after(parts.notice);
  if(capability.blocked){
    el('readingExportArea').hidden=true;el('readingPrompt').value='';pending=null;
    el('readingCopyAll').hidden=!session.turns.length;
    el('readingStorageNote').hidden=!session.turns.length;
    status('本次未调用 AI，也未生成外部 AI 提示词；不产生解读调用费用。已有背景查询费用另计。');
    el('readingPanel').scrollIntoView({block:'nearest'});
    return false;
  }
  return true;
}
async function exclusive(work) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('button,input,select,textarea')].filter(n => n.id !== 'stopGenBtn');
  const previous = controls.map(n => n.disabled); controls.forEach(n => { n.disabled = true; });
  try { await work(); } catch (e) { el('readingPanel').hidden = false; status(e.message || '操作失败，请稍后重试。'); }
  finally { controls.forEach((n, i) => { n.disabled = previous[i]; }); busy = false; el('readingMode').dispatchEvent(new Event('change')); }
}
async function request(prepared) {
  const activeSession = session, requestEpoch = epoch;
  const controller = new AbortController(); state.activeAbortController = controller;
  const timer = setTimeout(() => controller.abort('reading_timeout'), 180000);
  el('stopGenBtn').disabled = false; el('stopGenBtn').style.display = 'inline-flex';
  status('正在生成结构化解读，完成后展示结论与依据…');
  try {
    const result = await callReading(prepared, controller.signal);
    if (epoch !== requestEpoch || session !== activeSession) return;
    const turn = appendReadingTurn(session, prepared, result.raw, result.completed, 'api', result.usage,{completion:result.completion});
    pending = null; render();
    status(turn.result.status === 'validated' ? '解读已完成，格式与引用已核对。' : turn.result.readable_answer?'正文已显示；附带格式或引用尚未完整核对。':'回复未完整接收或无法读取，已保留原文；未自动重试。');
    persist();
  } finally {
    clearTimeout(timer); state.activeAbortController = null; el('stopGenBtn').style.display = 'none';
  }
}
export async function startReading(canonical, kind, options={}) {
  await exclusive(async () => {
    const backgroundSearch=Object.hasOwn(options,'backgroundSearch')?options.backgroundSearch:selectedBackground(canonical.question.text);
    clearReading();
    clearActiveConversationStorage(); state.currentConversation = null;
    for (const id of ['copyRow', 'followUpBox', 'promptOutputBox', 'promptExtraTools']) el(id).style.display = 'none';
    el('aiResult').textContent = ''; el('aiMeta').textContent = '';
    session = createReadingSession(canonical, {style: loadStyleChoice(), custom: loadCustomStyle().slice(0,2000)});
    const prepared = await prepareReadingTurn(session, canonical.question.text,{backgroundSearch});
    render();
    if(!checkAvailability(prepared))return;
    if (kind === 'api') await request(prepared);
    else { pending = prepared; render(); status('复制提示词给外部 AI，再贴回完整回复。刷新前请复制提示词；历史记录中保留本次导出。'); persist(); }
    el('readingPanel').scrollIntoView({ block: 'nearest' });
  });
}
export function initializeReading() {
  initializeBackground();
  document.addEventListener('history:deleted', ({detail}) => {
    if (session && (detail.all || detail.id === session.historyId)) {
      session.historySuppressed = true; persist();
    }
  });
  const syncSettings = () => {
    const structured = readingSelected();
    for (const id of ['roleSelect','customRoleInput','effortSelect']) el(id).disabled = structured;
    el('roleSelect').closest('.settings-group').hidden = structured;
    el('customRoleWrap').hidden = structured;
    el('effortSelect').closest('.settings-group').hidden = structured;
    el('styleSelect').closest('.settings-group').querySelector('.settings-group-title').textContent = '回复风格';
    el('structuredSettingsNote').hidden = !structured;
  };
  document.addEventListener('reading:reset', clearReading);
  el('readingMode').addEventListener('change', () => {
    syncSettings();
    el('readingModeNote').hidden = !readingSelected();
    el('readingPanel').hidden = !readingSelected() || (!session && !availabilityNotice);
  });
  const copy = (id, getText) => el(id).addEventListener('click', async () => {
    try { await copyTextToClipboard(getText()); status('已复制。'); } catch { status('自动复制失败，请选中文字手动复制。'); }
  });
  copy('readingCopyPrompt', () => el('readingPrompt').value);
  copy('readingCopyAll', () => session?.turns.map(t=>`问：${t.question}\n\n${readingHistoryText(t)}`).join('\n\n────────\n\n') || '');
  el('readingClear').addEventListener('click', () => { clearReading(); clearBackground(); status('已清空本次结构化解读。'); });
  el('readingImport').addEventListener('click', () => exclusive(async () => {
    if (!pending || !session) throw Error('请先生成本轮提示词。');
    if (!el('readingPaste').value.trim()) throw Error('请先贴回外部 AI 的回复。');
    if (!el('readingComplete').checked) throw Error('请确认已复制完整回复；未完成的内容不能视为完整解读。');
    const t = appendReadingTurn(session, pending, el('readingPaste').value, true, 'external',null,{allowEnvelope:true});
    pending = null; render();
    status(t.result.status === 'validated' ? '格式与引用核对通过。' : t.result.readable_answer?'正文已显示；附带格式或引用尚未完整核对。':'回复未完整接收或无法读取，已保留原文。'); persist();
  }));
  el('readingCancelExport').addEventListener('click', () => { pending = null; render(); persist(); status('已取消等待外部回复。'); });
  for (const [id, kind] of [['readingFollowApi', 'api'], ['readingFollowExport', 'external']]) {
    el(id).addEventListener('click', () => exclusive(async () => {
      const q = el('readingFollow').value.trim();
      if (!session) throw Error('请先开始解读。');
      const prepared = await prepareReadingTurn(session, q);
      if(!checkAvailability(prepared))return;
      if (kind === 'api') await request(prepared);
      else { pending = prepared; render(); status('追问提示词已包含本卦与既有问答，请贴回本轮完整回复。'); persist(); }
      el('readingFollow').value = '';
    }));
  }
  syncSettings();
}
