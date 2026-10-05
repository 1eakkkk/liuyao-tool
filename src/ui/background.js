import {searchWithPublicExcerpt} from '../ai/background-search.js';
import {loadApiKey} from '../storage/settings.js';
import {addLifetimeUsage} from '../storage/history.js';
import {renderBackgroundSources} from '../ai/output/background-view.js';
const el=id=>document.getElementById(id);
let background=null,question='',controller=null,generation=0;
export function clearBackground(){generation++;controller?.abort();background=null;question='';
  el('backgroundSubject').value='';el('backgroundConfirm').checked=false;el('backgroundConfirmLabel').hidden=true;
  el('backgroundSources').replaceChildren();el('backgroundStatus').textContent='';el('backgroundStop').hidden=true;
}
export function selectedBackground(currentQuestion){
  if(!background||!el('backgroundConfirm').checked)return null;
  if(currentQuestion.trim()!==question)throw Error('问题已变化，请重新核对背景对象。');
  return background;
}
export function initializeBackground(){
  document.addEventListener('reading:reset',clearBackground);
  el('backgroundClear').addEventListener('click',clearBackground);
  el('backgroundStop').addEventListener('click',()=>controller?.abort());
  const invalidate=()=>{el('backgroundConfirm').checked=false;};
  el('questionInput').addEventListener('input',invalidate);
  el('backgroundSubject').addEventListener('input',()=>{background=null;invalidate();el('backgroundConfirmLabel').hidden=true;el('backgroundSources').replaceChildren();});
  el('backgroundConfirm').addEventListener('change',()=>{if(el('backgroundConfirm').checked)question=el('questionInput').value.trim();});
  el('readingMode').addEventListener('change',()=>{el('backgroundCheck').hidden=el('readingMode').value!=='structured';if(el('backgroundCheck').hidden)clearBackground();});
  clearBackground();
  el('backgroundSearchBtn').addEventListener('click',async()=>{
    if(controller)return;
    const term=el('backgroundSubject').value.trim(),key=loadApiKey();
    if(!term||term.length>40){el('backgroundStatus').textContent='请填写待核实的公开名称。';return;}
    if(!key){el('backgroundStatus').textContent='本站查询需要 DeepSeek Key；可以先导出提示词，向外部 AI 补充背景。';return;}
    background=null;invalidate();el('backgroundSources').replaceChildren();el('backgroundConfirmLabel').hidden=true;
    const token=++generation,active=new AbortController();controller=active;
    const timer=setTimeout(()=>active.abort(),60000);el('backgroundStop').hidden=false;el('backgroundSearchBtn').disabled=true;
    // Keep the original question in place and lock it while retrieval is in flight.
    const controls=['backgroundSubject','questionInput','interpretBtn','promptBtn'];const was=controls.map(id=>el(id).disabled);controls.forEach(id=>{el(id).disabled=true;});
    el('backgroundStatus').textContent='正在查询公开背景…';
    let usage=null;
    try{const result=await searchWithPublicExcerpt(`${term} 官方 规则`,term,{key,signal:active.signal});usage=result.usage;
      if(token!==generation)return;
      background=result.background;question=el('questionInput').value.trim();renderBackgroundSources(el('backgroundSources'),background);
      el('backgroundConfirmLabel').hidden=background.search_status!=='retrieved';
      el('backgroundStatus').textContent=background.search_status==='retrieved'?'已取得原文片段，请核对对象、模式及适用范围。':'没有找到可用来源；未添加背景。';
    }catch(error){usage=error.usage??null;if(token===generation)el('backgroundStatus').textContent=active.signal.aborted?'查询已停止；已发生的费用可能仍会扣除。':`${error.message} 未自动重试。`;}
    finally{clearTimeout(timer);if(usage)addLifetimeUsage(usage.cost_upper,usage.total);
      if(token===generation){el('backgroundStatus').textContent+=usage?` 搜索 ${usage.total} tokens · 费用保守上限约 ¥${usage.cost_upper.toFixed(4)}（与解读分开）。`:' 用量未收全时费用未知。';}
      if(controller===active){controls.forEach((id,i)=>{el(id).disabled=was[i];});el('backgroundSearchBtn').disabled=false;el('backgroundStop').hidden=true;controller=null;}
    }
  });
}
