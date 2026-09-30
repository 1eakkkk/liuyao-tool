// Program-owned source fields. A binding does not prove a model explanation.
import {literatureSourceViews} from '../../src/knowledge/source-view.js';
import {stableJson,textHash} from '../../src/knowledge/validate.js';
export const SOURCE_CATALOG_VERSION='source-field-catalog-dev-1';
const require=(ok,message)=>{if(!ok)throw Error(message);};
export function buildSourceCatalog(packet){
  const views=literatureSourceViews(packet,packet.cards.map(c=>c.literature_id));
  const citations=views.map(view=>({literature_id:view.literature_id,
    source_type:view.source.source_type,citation:structuredClone(view.source.citation)}));
  const items=[],statuses=[];
  for(const c of packet.cards){
    function add(field,text,origin){
      require(typeof text==='string' && text.trim() && [...text].length<=1000,'Source text missing or exceeds candidate bound');
      items.push({source_id:`${c.literature_id}#${field}`,literature_id:c.literature_id,field,origin,
        label:origin==='source_transcription'?'原文转录':'现代整理（不是古籍原文）',text});
    }
    add('/original_text',c.original_text,'source_transcription');
    add('/editorial_summary',c.editorial_summary,'modern_editorial');
    for(const field of ['applicable_conditions','exclusions','exceptions']){
      const set=c[field];
      require(set && ['specified','none_stated','unreviewed'].includes(set.status) && Array.isArray(set.statements), 'Invalid source condition state');
      require(set.status!=='none_stated' || set.statements.length===0,'Unstated conditions contain statements');
      require(set.status!=='specified' || set.statements.length>0,'Specified conditions have no statements');
      statuses.push({literature_id:c.literature_id,field,status:set.status,
        label:set.status==='none_stated'?'当前材料未说明':set.status==='unreviewed'?'尚未复核':'材料中有明确条目'});
      for(const [n,text] of set.statements.entries())add(`/${field}/statements/${n}`,text,'modern_editorial');
    }
  }
  require(items.length<=100 && new Set(items.map(x=>x.source_id)).size===items.length,'Duplicate or excessive source fields');
  const payload={version:SOURCE_CATALOG_VERSION,packet_hash:textHash(stableJson(packet)),citations,items,statuses};
  return {...payload,catalog_hash:textHash(stableJson(payload))};
}
