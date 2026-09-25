import { createReadingSession, prepareReadingTurn, appendReadingTurn, serializeReadingSession, restoreReadingSession, readingExport } from '../ai/output/session.js';
import { callReading } from '../ai/output/client.js';
import { renderOutputResult } from '../ai/output/view.js';
import { castStore } from '../app/cast-store.js';
import { renderPlateFromCastData } from './casting-view.js';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../storage/local.js';
import { clearActiveConversationStorage } from '../storage/conversation.js';
import { copyTextToClipboard } from './helpers.js';
import { isLifespanQuestion } from '../app/question.js';
import { state } from '../app/state.js';

const KEY = 'liuyao_structured_reading_v1';
let session = null, pending = null, busy = false, epoch = 0;
const el = id => document.getElementById(id);
export const readingSelected = () => el('readingMode')?.value === 'structured';
function status(text) { el('readingStatus').textContent = text; }
function persist() {
  if (!session) return;
  if (!safeSetItem(KEY, serializeReadingSession(session, pending?.question ?? null))) status('回复已保留在页面，但本地保存失败；请复制对话留存。');
}
function render() {
  const root = el('readingPanel'); root.hidden = !session;
  if (!session) return;
  el('readingTurns').replaceChildren();
  for (const t of session.turns) {
    const block = document.createElement('article');
    const question = document.createElement('h3'); question.textContent = `问：${t.question}`;
    const result = document.createElement('div'); renderOutputResult(result, t.result, t.context);
    block.append(question, result);
    if (t.usage) {
      const usage = document.createElement('p'); usage.className = 'reading-note';
      usage.textContent = t.usage.total == null ? '用量未收全，费用未知；以 DeepSeek 账单为准。' : `本轮 ${t.usage.total} tokens · 约 ¥${t.usage.cost.toFixed(4)} · 以 DeepSeek 账单为准`;
      block.append(usage);
    }
    el('readingTurns').append(block);
  }
  el('readingExportArea').hidden = !pending;
  el('readingPrompt').value = pending ? readingExport(pending) : '';
  el('readingFollowArea').hidden = !session.turns.length || !!pending;
  el('readingPaste').value = '';
  el('readingComplete').checked = false;
}
export function clearReading() {
  epoch++; session = null; pending = null;
  safeRemoveItem(KEY);
  if (el('readingPanel')) { el('readingPanel').hidden = true; el('readingTurns').replaceChildren(); }
}
async function exclusive(work) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('button,input,select,textarea')].filter(n => n.id !== 'stopGenBtn');
  const previous = controls.map(n => n.disabled); controls.forEach(n => { n.disabled = true; });
  try { await work(); } catch (e) { el('readingPanel').hidden = false; status(e.message || '操作失败，请稍后重试。'); }
  finally { controls.forEach((n, i) => { n.disabled = previous[i]; }); busy = false; }
}
function checkQuestion(question) {
  if (isLifespanQuestion(question)) throw Error('这里不解读生死寿数问题；如有真实健康担忧，请寻求专业帮助。');
}
async function request(prepared) {
  const activeSession = session, requestEpoch = epoch;
  const controller = new AbortController(); state.activeAbortController = controller;
  const timer = setTimeout(() => controller.abort(), 180000);
  el('stopGenBtn').disabled = false; el('stopGenBtn').style.display = 'inline-flex';
  status('正在生成结构化解读，完成后展示结论与依据…');
  try {
    const result = await callReading(prepared, controller.signal);
    if (epoch !== requestEpoch || session !== activeSession) return;
    const turn = appendReadingTurn(session, prepared, result.raw, result.completed, 'api', result.usage);
    pending = null; render();
    status(turn.result.status === 'validated' ? '格式与引用核对通过；解释仍属于 AI 判断。' : '回复未完成或未通过检查，已保留原文；未自动重试。');
    persist();
  } finally {
    clearTimeout(timer); state.activeAbortController = null; el('stopGenBtn').style.display = 'none';
  }
}
export async function startReading(canonical, kind) {
  await exclusive(async () => {
    checkQuestion(canonical.question.text);
    clearReading();
    clearActiveConversationStorage(); state.currentConversation = null;
    for (const id of ['copyRow', 'followUpBox', 'promptOutputBox', 'promptExtraTools']) el(id).style.display = 'none';
    el('aiResult').textContent = ''; el('aiMeta').textContent = '';
    session = createReadingSession(canonical);
    const prepared = await prepareReadingTurn(session, canonical.question.text);
    render();
    if (kind === 'api') await request(prepared);
    else { pending = prepared; render(); status('复制提示词给外部 AI，再贴回完整回复。刷新页面可恢复本次提示词。'); persist(); }
    el('readingPanel').scrollIntoView({ block: 'nearest' });
  });
}
export function initializeReading() {
  document.addEventListener('reading:reset', clearReading);
  el('readingMode').addEventListener('change', () => {
    el('readingModeNote').hidden = !readingSelected();
    el('readingPanel').hidden = !readingSelected() || !session;
  });
  const copy = (id, getText) => el(id).addEventListener('click', async () => {
    try { await copyTextToClipboard(getText()); status('已复制。'); } catch { status('自动复制失败，请选中文字手动复制。'); }
  });
  copy('readingCopyPrompt', () => el('readingPrompt').value);
  copy('readingCopyAll', () => el('readingTurns').innerText);
  el('readingClear').addEventListener('click', () => { clearReading(); status('已清空本次结构化解读。'); });
  el('readingImport').addEventListener('click', () => exclusive(async () => {
    if (!pending || !session) throw Error('请先生成本轮提示词。');
    if (!el('readingPaste').value.trim()) throw Error('请先贴回外部 AI 的回复。');
    if (!el('readingComplete').checked) throw Error('请确认已复制完整回复；未完成的内容不能视为完整解读。');
    const t = appendReadingTurn(session, pending, el('readingPaste').value, true, 'external');
    pending = null; render();
    status(t.result.status === 'validated' ? '格式与引用核对通过。' : '未通过检查，已保留原文；可生成新的提示词继续。'); persist();
  }));
  el('readingCancelExport').addEventListener('click', () => { pending = null; render(); persist(); status('已取消等待外部回复。'); });
  for (const [id, kind] of [['readingFollowApi', 'api'], ['readingFollowExport', 'external']]) {
    el(id).addEventListener('click', () => exclusive(async () => {
      const q = el('readingFollow').value.trim(); checkQuestion(q);
      if (!session) throw Error('请先开始解读。');
      const prepared = await prepareReadingTurn(session, q);
      if (kind === 'api') await request(prepared);
      else { pending = prepared; render(); status('追问提示词已包含本卦与既有问答，请贴回本轮完整回复。'); persist(); }
      el('readingFollow').value = '';
    }));
  }
  // Restore from canonical + raw responses; never trust a stored validation badge.
  const raw = safeGetItem(KEY);
  if (raw && !state.currentConversation) {
    const restoreEpoch = epoch;
    void exclusive(async () => {
      const restored = await restoreReadingSession(raw);
      if (epoch !== restoreEpoch) return;
      session = restored.session; pending = restored.pending;
      renderPlateFromCastData(session.canonical, session.canonical.question.text,
        new Date(session.canonical.meta.created_at || Date.now()).getTime());
      el('questionInput').value = session.canonical.question.text;
      el('questionInput').dispatchEvent(new Event('input'));
      el('readingMode').value = 'structured'; el('readingModeNote').hidden = false;
      render(); status('已恢复上次结构化解读，并重新核对格式与引用。');
    });
  }
}
