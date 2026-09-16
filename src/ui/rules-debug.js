import { state } from '../app/state.js';
export function showRulesExportComparison(pair, initialMode) {
  state.lastRulesExportPair = pair;
  let panel = document.getElementById('rulesInputComparison');
  if (!panel) {
    panel = document.createElement('div'); panel.id = 'rulesInputComparison';
    const label = document.createElement('p');
    label.textContent = '严格 Rules A/B：两组均为 1.1，同一 Prompt，只切换规则命中。';
    panel.append(label);
    for (const mode of ['off', 'on']) {
      const button = document.createElement('button'); button.type = 'button'; button.id = `export-rules-${mode}`;
      button.textContent = mode === 'off' ? '显示 Structured 1.1 无规则' : '显示 Structured 1.1 + Rules';
      button.addEventListener('click', () => selectRulesExport(mode)); panel.append(button);
    }
    document.getElementById('promptOutputBox').append(panel);
  }
  panel.style.display = 'block';
  selectRulesExport(initialMode);
}
function selectRulesExport(mode) {
  const pair = state.lastRulesExportPair;
  if (!pair || !state.lastExportQuestion) return;
  state.lastExportMode = 'rules'; state.lastRulesExportInput = pair[mode].input;
  document.getElementById('promptOutputText').value = pair[mode].text;
  document.getElementById('followUpExportOutput').value = '';
  document.getElementById('followUpExportCopyRow').style.display = 'none';
  for (const candidate of ['off', 'on']) document.getElementById(`export-rules-${candidate}`).setAttribute('aria-pressed', String(candidate === mode));
  for (const candidate of ['legacy', 'structured']) document.getElementById(`export-${candidate}`)?.setAttribute('aria-pressed', 'false');
}
