import { annotateShichen, annotateGanzhiDay, stripMarkdown } from './text.js';
import { effectivePriceTable, isBeijingPeakHour, currentEffortPreset } from './preferences.js';
import { addLifetimeUsage } from '../storage/history.js';
import { loadModelChoice, loadApiKey } from '../storage/settings.js';
import { DEEPSEEK_BASE_URL } from './config.js';



// ---- 对应 ai_interpret.py: interpret() 里真正打DeepSeek接口那一段，首次解读和追问共用 ----
// 用SSE流式输出：onDelta(deltaText, fullRawTextSoFar) 每收到一小段文字就回调一次，供UI实时刷新。
// 不传onDelta也能正常用（等价于非流式），返回值形状不变。
// signal: 可选的 AbortSignal，用户点"停止生成"或者页面要中断请求时传入——
// 无论是用户主动停止、还是网络中途断线导致 reader.read() 抛错，都不再把已经吃进来的部分文字
// 跟着错误一起丢掉，而是保留下来当作这次的最终答案（打上"未完成"标记），这两种情况处理逻辑是通用的。
async function callDeepSeekRaw(messages, onDelta, signal){
  const apiKey = loadApiKey();
  if(!apiKey){
    throw new Error('还没有配置 DeepSeek API Key，点右上角"设置"填一下。');
  }

  const startTime = Date.now();
  const requestIsPeak = isBeijingPeakHour();
  const requestPrice = {...(requestIsPeak ? effectivePriceTable().peak : effectivePriceTable().offpeak)};
  let response;
  try{
    response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: loadModelChoice(),
        max_tokens: currentEffortPreset().max_tokens,
        thinking: { type: 'enabled' },
        reasoning_effort: currentEffortPreset().reasoning_effort,
        messages,
        stream: true,
        stream_options: { include_usage: true }, // 让最后一个chunk带上usage，不然流式模式下拿不到token数
      }),
      signal,
    });
  }catch(e){
    if(e?.name === 'AbortError'){
      // 请求还没收到任何响应就被停止了（比如网速慢、刚点完就手动停止），没有任何文字可保留
      return buildInterruptedResult('', startTime, 'user');
    }
    throw new Error('连不上 DeepSeek 服务器，检查一下网络连接，或者稍后再试一次。');
  }

  if(!response.ok){
    if(response.status === 401){
      throw new Error('DeepSeek API Key 不对或者已经失效，去"设置"里重新填一下。');
    }
    if(response.status === 429){
      throw new Error('请求太频繁，或者 DeepSeek 账户余额不足，去 DeepSeek 后台查一下余额，或者稍等一下再试。');
    }
    let detail = '';
    try{ detail = (await response.json()).error?.message || ''; }catch(e){}
    throw new Error(`DeepSeek 接口返回了错误（状态码${response.status}）：${detail}`);
  }

  // ---- 读SSE流：每行"data: {...}"是一个chunk，收集delta.content，最后一个chunk带usage ----
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let rawText = '';
  let usage = null;
  let sawDone = false;
  let finishReason = null;
  let interruptReason = null; // null=正常读完 | 'user'=手动停止 | 'network'=读流中途出错(断线等)

  while(true){
    let chunk;
    try{
      chunk = await reader.read();
    }catch(e){
      // reader.read() 中途抛错：可能是手动abort，也可能是网络断线——
      // 不管哪种，已经吃进来的 rawText 都留着，不再跟着这个错误一起被丢弃。
      interruptReason = (signal && signal.aborted) ? 'user' : 'network';
      break;
    }
    const { done, value } = chunk;
    if(done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // 最后一段可能是不完整的一行，留到下一轮再拼

    for(const line of lines){
      const trimmed = line.trim();
      if(!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if(payload === '[DONE]'){sawDone=true;continue;}
      let json;
      try{ json = JSON.parse(payload); }catch(e){ continue; }
      if(json.choices?.[0]?.finish_reason) finishReason=json.choices[0].finish_reason;
      const delta = json.choices?.[0]?.delta?.content;
      if(delta){
        rawText += delta;
        if(onDelta) onDelta(delta, rawText);
      }
      if(json.usage) usage = json.usage;
    }
  }

  if(!sawDone || finishReason !== 'stop') interruptReason = interruptReason || (finishReason === 'length' ? 'limit' : 'network');
  if(interruptReason && !usage){
    return buildInterruptedResult(rawText, startTime, interruptReason);
  }

  const elapsedSeconds = (Date.now() - startTime) / 1000;
  const cleanText = annotateGanzhiDay(annotateShichen(stripMarkdown(rawText)));

  usage = usage || {};
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || (promptTokens + completionTokens);
  const cacheHitTokens = usage.prompt_cache_hit_tokens || 0;
  const cacheMissTokens = usage.prompt_cache_miss_tokens || Math.max(promptTokens - cacheHitTokens, 0);

  const isPeak = requestIsPeak;
  const price = requestPrice;
  const costYuan = (cacheHitTokens / 1e6) * price.hit
                  + (cacheMissTokens / 1e6) * price.miss
                  + (completionTokens / 1e6) * price.output;

  // 拿到完整token用量的成功请求才计入终身累计——这里是"AI解读"和"追问"两条路径唯一的共同出口，
  // 只在这一处累加就能同时覆盖两边，不用在各自的调用方各写一遍、也不会漏记或重复记。
  addLifetimeUsage(costYuan, totalTokens);

  const partial = interruptReason ? buildInterruptedResult(rawText,startTime,interruptReason) : {};
  return { ...partial, text:interruptReason?partial.text:cleanText, elapsedSeconds, promptTokens, completionTokens, totalTokens, costYuan, isPeak, interrupted:!!interruptReason, usageKnown:true };
}


// ---- 停止生成/网络中断的兜底结果：已流出的部分文字当作最终答案，token/费用统计不完整（没等到最后一个
// 带usage的chunk），所以这里费用按0算、并且标注清楚"未完成"，不能假装是完整解读的账单。 ----
function resultUsageText(result){
  const state=result.interrupted?({user:'已停止',limit:'达到长度上限',network:'网络中断'}[result.interruptReason]||'未完成'):'完成';
  const usage=result.interrupted&&!result.usageKnown?'用量未收全，费用未知（零值不代表免费）':`token共${result.totalTokens} · 约¥${result.costYuan.toFixed(4)}`;
  return `${state} · 耗时 ${result.elapsedSeconds.toFixed(1)}s · ${usage} · 以 DeepSeek 账单为准`;
}

function buildInterruptedResult(rawText, startTime, reason){
  const elapsedSeconds = (Date.now() - startTime) / 1000;
  const cleanText = annotateGanzhiDay(annotateShichen(stripMarkdown(rawText)));
  const suffix = reason === 'user'
    ? '\n\n【用户手动停止生成，以上为已输出的部分内容】'
    : reason === 'limit' ? '\n\n【达到输出长度上限，以上内容未完整生成】' : '\n\n【网络中断，以上为已生成的部分内容，后续内容未完成】';
  const text = cleanText ? (cleanText + suffix) : (reason === 'user' ? '（还没来得及生成内容就被停止了）' : reason === 'limit' ? '（达到输出长度上限，未收到正文）' : '（网络中断，还没收到任何内容）');
  return {
    text,
    elapsedSeconds,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    costYuan: 0,
    isPeak: isBeijingPeakHour(),
    interrupted: true,
    interruptReason: reason,
  };
}

export { callDeepSeekRaw, resultUsageText, buildInterruptedResult };
