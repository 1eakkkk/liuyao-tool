import { maskApiKey } from './helpers.js';
import { interpretBtn, promptBtn, apiKeyInput, apiKeyStatus, priceHit, priceMiss, priceOutput } from './dom.js';
import { loadModelChoice, loadPriceOverride, loadApiKey } from '../storage/settings.js';
import { PRICE_TABLES } from '../ai/config.js';



// ---- Key 状态徽标：不用点开输入框，一眼就知道当前有没有存过 Key ----
// 同时联动"AI 解读"按钮的显隐：填了Key才出现"AI解读"（调本站配置的API直接解卦），
// 没填Key时只保留"输出提示词"（导出文本去别的AI软件问）；这里统一改这一处，
// saveKeyBtn/clearKeyBtn/页面初始化三处都会调用到本函数，不用在三处分别加显隐判断。
function updateApiKeyStatus(){
  const has = !!loadApiKey();
  apiKeyStatus.textContent = has ? '● 已设置' : '○ 未设置';
  apiKeyStatus.classList.toggle('has-key', has);
  apiKeyStatus.classList.toggle('no-key', !has);
  interpretBtn.style.display = has ? '' : 'none';
  // 没填Key时"AI 解读"整个隐藏，"输出提示词"是这个状态下唯一走得通的路径，
  // 不该继续顶着描边的次要按钮样式（那样这一屏就没有一个实心主按钮，找不到"从哪下手"）。
  // 这里让它跟着有没有Key切换：没Key时摘掉.ghost、升级成实心主按钮；填了Key后
  // "AI 解读"重新出现当主按钮，"输出提示词"退回描边样式，避免两个同权重主按钮并排。
  promptBtn.classList.toggle('ghost', has);
}


// ---- 价格覆盖输入框的占位数字（灰字提示"不填的话会用这个默认值"）要跟着当前选中的模型走，
// 不然切换模型后这里还显示旧模型的单价，容易让人误以为默认值没变。 ----
function refreshPriceOverridePlaceholders(){
  const base = PRICE_TABLES[loadModelChoice()] || PRICE_TABLES['deepseek-flash'];
  priceHit.placeholder = base.offpeak.hit;
  priceMiss.placeholder = base.offpeak.miss;
  priceOutput.placeholder = base.offpeak.output;
}

function fillPriceOverrideInputs(){
  const o = loadPriceOverride() || {};
  // 输入框回显的是"闲时"单价那一份；peak是保存时按×2自动换算出来的，不用单独读回显
  priceHit.value = (o.offpeak && o.offpeak.hit != null) ? o.offpeak.hit : '';
  priceMiss.value = (o.offpeak && o.offpeak.miss != null) ? o.offpeak.miss : '';
  priceOutput.value = (o.offpeak && o.offpeak.output != null) ? o.offpeak.output : '';
  refreshPriceOverridePlaceholders();
}


// ---- Key 输入框：保存后只显示打码值，防止在框内复制出明文 ----
function lockApiKeyInput(rawKey){
  apiKeyInput.value = maskApiKey(rawKey);
  apiKeyInput.readOnly = true;
  apiKeyInput.classList.add('masked');
}

function unlockApiKeyInput(){
  apiKeyInput.value = '';
  apiKeyInput.readOnly = false;
  apiKeyInput.classList.remove('masked');
}

export { updateApiKeyStatus, refreshPriceOverridePlaceholders, fillPriceOverrideInputs, lockApiKeyInput, unlockApiKeyInput };
