import {validateSearchBackground} from '../background-search.js';
export function backgroundText(value){
  if(!value)return '';
  const b=validateSearchBackground(value);
  return ['公开背景资料（外部原文，不是卦盘事实或预测证明）',`查询：${b.search_request.query}`,
    ...b.web_sources.filter(s=>s.excerpt).map(s=>`${s.title}\n${s.url}\n检索时间：${s.retrieved_at}\n${s.excerpt}`)].join('\n\n');
}
export function renderBackgroundSources(container,value){
  const b=validateSearchBackground(value),doc=container.ownerDocument,fragment=doc.createDocumentFragment();
  const node=(tag,text)=>{const n=doc.createElement(tag);n.textContent=text;return n;};
  fragment.append(node('p','以下是外部原文片段。核对对象、版本与模式；资料存在不代表预测正确。'));
  for(const s of b.web_sources.filter(s=>s.excerpt)){
    const details=doc.createElement('details');details.append(node('summary',s.title));
    const a=node('a','打开原始来源');a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';
    const p=node('p',s.excerpt);p.className='background-excerpt';
    details.append(a,node('p',`检索于 ${s.retrieved_at} · ${s.excerpt_origin==='public_reader'?'Jina 读取公开原文':'搜索接口引用'}`),p);fragment.append(details);
  }
  container.replaceChildren(fragment);
}
