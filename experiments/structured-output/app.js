import canonical from '../phase7/fixtures/compat-1.json';
import { buildOutputContext } from '../../src/ai/output/context.js';
import { buildOutputExport } from '../../src/ai/output/prompt.js';
import { parseOutputAnswer } from '../../src/ai/output/parse.js';
import { renderOutputResult } from '../../src/ai/output/view.js';
import { syntheticOutput } from './example.js';

const get = id => document.getElementById(id);
const context = await buildOutputContext(canonical);
get('prompt').value = buildOutputExport(context);
function show(completed = true) {
  const result = parseOutputAnswer(get('response').value, context, { completed });
  renderOutputResult(get('result'), result, context);
  get('status').textContent = result.status === 'validated' ? '格式与引用核对通过。' :
    `已回退为原始文本：${result.issues.map(x => x.code).join('、')}`;
}
get('sample').onclick = () => { get('response').value = JSON.stringify(syntheticOutput(context), null, 2); show(); };
get('invalid').onclick = () => {
  const example = syntheticOutput(context); example.factors[0].evidence_ids = ['rule:invented'];
  get('response').value = JSON.stringify(example, null, 2); show();
};
get('partial').onclick = () => { get('response').value = JSON.stringify(syntheticOutput(context)).slice(0, 90); show(false); };
get('validate').onclick = () => show();
get('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(get('prompt').value); get('status').textContent = '提示词已复制。'; }
  catch { get('status').textContent = '无法自动复制，请在提示词框中全选复制。'; }
};
get('sample').click();
