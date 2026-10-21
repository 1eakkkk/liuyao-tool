import { maskApiKey } from './helpers.js';
import { interpretBtn, promptBtn, apiKeyInput, apiKeyStatus, priceHit, priceMiss, priceOutput } from './dom.js';
import { loadModelChoice, loadPriceOverride, loadApiKey } from '../storage/settings.js';
import { PRICE_TABLES } from '../ai/config.js';



// 两种入口始终可见；未配置 Key 时，AI 解读入口直接打开设置。
function updateApiKeyStatus(){
  const has = !!loadApiKey();
  apiKeyStatus.textContent = has ? '● 已设置' : '○ 未设置';
  apiKeyStatus.classList.toggle('has-key', has);
  apiKeyStatus.classList.toggle('no-key', !has);
  interpretBtn.setAttribute('aria-haspopup', has ? 'false' : 'dialog');
  promptBtn.classList.add('ghost');
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
