import { state } from '../app/state.js';

// Only appears after explicit ?debug=1 opt-in. Both buttons use the same captured export pair.
export function showAiExportComparison(pair, initialMode) {
  if (new URLSearchParams(globalThis.location.search).get('debug') !== '1') return;
  state.lastExportPair = pair;
  let panel = document.getElementById('aiInputComparison');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'aiInputComparison';
    const label = document.createElement('p');
    label.textContent = '实验对照：同一卦盘和问题，分别复制到同一模型的独立新对话。';
    panel.append(label);
    for (const mode of ['legacy', 'structured']) {
      const button = document.createElement('button');
      button.type = 'button'; button.id = `export-${mode}`;
      button.textContent = `显示 ${mode === 'legacy' ? 'Legacy' : 'Structured'} 完整提示词`;
      button.addEventListener('click', () => selectExport(mode));
      panel.append(button);
    }
    document.getElementById('promptOutputBox').append(panel);
  }
  selectExport(initialMode);
}
function selectExport(mode) {
  const pair = state.lastExportPair;
  if (!pair || !state.lastExportQuestion) return;
  state.lastExportMode = mode;
  state.lastStructuredExportInput = mode === 'structured' ? pair.structuredInput : null;
  state.lastExportCastText = pair.legacyText;
  document.getElementById('promptOutputText').value = pair[mode];
  // A previously generated follow-up belongs to the previous mode.
  document.getElementById('followUpExportOutput').value = '';
  document.getElementById('followUpExportCopyRow').style.display = 'none';
  for (const candidate of ['legacy', 'structured']) document.getElementById(`export-${candidate}`).setAttribute('aria-pressed', String(candidate === mode));
}
