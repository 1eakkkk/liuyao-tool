import { test, expect, beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { FEEDBACK_KEY, feedbackSnapshot, loadFeedback, saveFeedback, feedbackExport } from '../../src/storage/outcome-feedback.js';
import { feedbackHtml, bindFeedback } from '../../src/ui/outcome-feedback.js';
import { saveHistory } from '../../src/storage/history.js';
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const record = { id: 'one', ts: 100, question: '整理旧书', text: '先整理目录。', apiKey: 'never-export', settings: { key: 'secret' } };
const note = { outcome: 'partial', note: '<img src=x onerror=alert(1)> 实际完成一半', observedOn: '2026-10-04' };
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

test('feedback binds first answer; followups and history deletion do not overwrite its snapshot', async () => {
  expect(await saveFeedback(record, note)).toBe(true);
  const first = loadFeedback().entries[0];
  const followup = { ...record, turns: [{ role: 'user', text: record.question }, { role: 'assistant', text: record.text }, { role: 'user', text: '追问' }, { role: 'assistant', text: '追问答复' }] };
  expect(feedbackSnapshot(followup)).toEqual(first.snapshot);
  expect(await saveFeedback(followup, { ...note, note: '已完成' })).toBe(true);
  expect(loadFeedback().entries[0].snapshotHash).toBe(first.snapshotHash);
  saveHistory([]);
  expect(loadFeedback().entries[0].snapshot.answer).toBe(record.text);
  expect(JSON.stringify(feedbackExport(loadFeedback().entries[0]))).not.toMatch(/never-export|secret|apiKey|settings/);
});

test('changed original answer cannot rebind feedback; malformed storage is preserved', async () => {
  await saveFeedback(record, note);
  const original = localStorage.getItem(FEEDBACK_KEY);
  expect(await saveFeedback({ ...record, text: '完全不同的判断' }, note)).toBe(false);
  expect(localStorage.getItem(FEEDBACK_KEY)).toBe(original);
  localStorage.setItem(FEEDBACK_KEY, '{bad-json');
  expect(loadFeedback().writable).toBe(false);
  expect(await saveFeedback(record, note)).toBe(false);
  expect(localStorage.getItem(FEEDBACK_KEY)).toBe('{bad-json');
});

test('prompt exports have no feedback; incomplete old plates remain usable; notes render as text', async () => {
  expect(feedbackHtml({ ...record, type: 'prompt' })).toBe('');
  expect(feedbackSnapshot({ ...record, cast: { lines: [] } }).cast).toBeNull();
  await saveFeedback(record, note);
  const container = document.createElement('div'); container.innerHTML = feedbackHtml(record);
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('textarea').value).toBe(note.note);
});

test('storage quota failure leaves unsaved input in place and never reports success', async () => {
  saveHistory([record]);
  const container = document.createElement('div');
  container.innerHTML = `<div class="history-item" data-id="one">${feedbackHtml(record)}</div>`;
  container.querySelector('textarea').value = '保留草稿';
  const render = vi.fn(), toast = vi.fn(); bindFeedback(container, render, toast);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); });
  container.querySelector('[data-action="feedback-save"]').click();
  await vi.waitFor(() => expect(container.querySelector('[data-feedback="status"]').textContent).toContain('未保存'));
  expect(render).not.toHaveBeenCalled(); expect(toast).not.toHaveBeenCalled();
  expect(container.querySelector('textarea').value).toBe('保留草稿');
});
