// Optional public-page reader. No question, API key or private page is sent here.
const READER_ORIGIN = 'https://r.jina.ai/';
const BODY_LIMIT = 128000;
export function publicReaderUrl(value) {
  const url = new URL(value);
  const host=url.hostname.toLowerCase();
  if (url.protocol!=='https:' || url.username || url.password || !host.includes('.') || host.endsWith('.') || /^[\d.]+$/.test(host) || host.includes(':') || /\.(local|internal|localhost|test|invalid)$/.test(host) || url.href.length>2048) throw Error('只读取公开 HTTPS 来源。');
  url.hash='';
  return READER_ORIGIN+url.href;
}

export function pageExcerpt(payload, sourceUrl, term) {
  if(typeof term!=='string'||!term.trim()||term.length>40)throw Error('请提供明确的待核实名称。');
  const source = new URL(sourceUrl);source.hash='';
  if(payload?.code!==200 || typeof payload.data?.url!=='string' || typeof payload.data.content!=='string' || payload.data.content.length>100000)throw Error('网页读取结果无效。');
  const returned=new URL(payload.data.url);returned.hash='';
  if(returned.href!==source.href)throw Error('读取页面与搜索来源不一致。');
  const text=payload.data.content;
  let at=text.indexOf(term.trim());if(at<0)throw Error('页面未找到待核实名称；不补造背景。');
  const heading=[...text.matchAll(/(?:^|\n)#{1,6} [^\n]+/g)].find(h=>h[0].includes(term.trim()));
  if(heading)at=heading.index+(heading[0].startsWith('\n')?1:0);
  // Preserve a contiguous piece of converted page text, including nearby qualifications.
  const before=text.lastIndexOf('\n\n',at);
  const previous=before<0?-1:text.lastIndexOf('\n\n',before-1);
  const start=previous<0?0:previous+2;
  let end=text.indexOf('\n## ',at);if(end<0)end=text.length;
  const excerpt=text.slice(start,end).trim();
  if(excerpt.length>1200)throw Error('相关段落过长；不截掉限定条件后继续使用。');
  if(!excerpt.includes(term.trim()))throw Error('未取得可用相关段落。');
  return excerpt;
}

export async function readPublicSource(sourceUrl, term, {signal,fetchImpl=globalThis.fetch}={}) {
  const endpoint=publicReaderUrl(sourceUrl);signal?.throwIfAborted();
  const response=await fetchImpl(endpoint,{method:'GET',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',headers:{Accept:'application/json'},signal});
  if(!response.ok)throw Error(`公开网页读取失败（${response.status}），未重试。`);
  const reader=response.body.getReader(),decoder=new TextDecoder();let raw='';
  try{for(;;){const {value,done}=await reader.read();if(done)break;raw+=decoder.decode(value,{stream:true});if(raw.length>BODY_LIMIT){await reader.cancel();throw Error('网页结果过长，未使用。');}}raw+=decoder.decode();}
  finally{reader.releaseLock();}
  return {excerpt:pageExcerpt(JSON.parse(raw),sourceUrl,term),excerpt_origin:'public_reader',reader_provider:'jina-reader'};
}
