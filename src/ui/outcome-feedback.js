import { feedbackSnapshot, loadFeedback, saveFeedback, feedbackExport, OUTCOMES } from '../storage/outcome-feedback.js';
import { loadHistory } from '../storage/history.js';
import { escapeHtml } from './helpers.js';

export function feedbackHtml(record, data = loadFeedback()) {
  const snapshot = feedbackSnapshot(record);
  if (!snapshot) return '';
  const saved = data.entries.find(e => e.historyId === String(record.id));
  const changed = saved && JSON.stringify(saved.snapshot) !== JSON.stringify(snapshot);
  return `<details class="history-feedback" data-view="feedback"><summary>${saved ? '查看／补记实际结果' : '记录实际结果'}</summary>
    <p class="hint">绑定首次回答，仅保存在此浏览器。事后反馈不代表预测准确率。删除历史不会删除已保存的反馈。</p>
    ${!data.writable ? '<p role="alert">反馈数据无法读取，已停止写入，避免覆盖原数据。</p>' : ''}
    ${changed ? '<p role="alert">首次回答已变化；以下反馈仍属于保存时的旧回答，不能改绑。</p>' : ''}
    <label>你的评价<select data-feedback="outcome">${Object.entries(OUTCOMES).map(([k,v]) => `<option value="${k}" ${saved?.outcome === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>结果发生日期（可选）<input type="date" data-feedback="date" value="${escapeHtml(saved?.observedOn || '')}"></label>
    <label>实际发生了什么<textarea data-feedback="note" maxlength="2000" rows="3" placeholder="记录可观察的结果；也可写暂未发生。">${escapeHtml(saved?.note || '')}</textarea></label>
    <div class="history-feedback-actions"><button type="button" class="ai-btn" data-action="feedback-save" ${!data.writable || changed ? 'disabled' : ''}>保存反馈</button>
    ${saved ? '<button type="button" class="ai-btn ghost" data-action="feedback-export">导出回答与反馈</button>' : ''}</div>
    <p class="hint" role="status" data-feedback="status">${saved ? '已保存；评价由你填写，不由 AI 判定。' : ''}</p>
  </details>`;
}

export function bindFeedback(list, render, toast) {
  function download(value) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = '六爻-回答与结果反馈.json';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.getElementById('exportFeedbackBtn')?.addEventListener('click', () => {
    const data = loadFeedback();
    if (!data.writable) { toast('反馈数据无法读取，未导出。', 'error'); return; }
    if (!data.entries.length) { toast('还没有保存的结果反馈。'); return; }
    download({ version: 1, records: data.entries.map(feedbackExport) });
  });
  list.addEventListener('click', async e => {
    const button = e.target.closest('[data-action]');
    if (!button?.dataset.action.startsWith('feedback-')) return;
    const item = button.closest('.history-item'), id = item?.dataset.id;
    if (button.dataset.action === 'feedback-export') {
      const entry = loadFeedback().entries.find(f => f.historyId === id);
      if (!entry) return;
      download(feedbackExport(entry)); return;
    }
    const record = loadHistory().find(r => String(r.id) === id);
    if (!record) { toast('原历史记录已不存在，未保存反馈。', 'error'); return; }
    button.disabled = true;
    try {
      const ok = await saveFeedback(record, { outcome: item.querySelector('[data-feedback="outcome"]').value,
        observedOn: item.querySelector('[data-feedback="date"]').value, note: item.querySelector('[data-feedback="note"]').value });
      if (ok) { render(); toast('实际结果已保存到本机。'); }
      else item.querySelector('[data-feedback="status"]').textContent = '未保存。请检查本地存储或首次回答是否变化；输入内容已保留。';
    } catch { item.querySelector('[data-feedback="status"]').textContent = '未保存，输入内容已保留，请稍后重试。'; }
    finally { if (button.isConnected) button.disabled = false; }
  });
}
