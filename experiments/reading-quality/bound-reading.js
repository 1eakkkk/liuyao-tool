// Unreleased protocol revision. Resolve quotations from trusted input, not model text.
import {checkSourcedOutput,SOURCED_OUTPUT_VERSION} from './sourced-output.js';
import {buildSourceCatalog} from './source-bindings.js';
export const BOUND_OUTPUT_VERSION='layered-reading-sourced-dev-2';
const require=(ok,message)=>{if(!ok)throw Error(message);};
const exact=(value,keys)=>require(value && Object.getPrototypeOf(value)===Object.prototype &&
  Object.keys(value).sort().join(',')===[...keys].sort().join(','),'Invalid bound fields');
export function checkBoundOutput(answer,evidence,packet){
  exact(answer,['schema_version','source_catalog_hash','conclusion','facts','rules','interpretations','advice']);
  const catalog=buildSourceCatalog(packet),items=new Map(catalog.items.map(x=>[x.source_id,x]));
  require(answer.schema_version===BOUND_OUTPUT_VERSION && answer.source_catalog_hash===catalog.catalog_hash,'Bound version or source context mismatch');
  require(Array.isArray(answer.interpretations),'Missing interpretations');
  const base=structuredClone(answer);delete base.source_catalog_hash;base.schema_version=SOURCED_OUTPUT_VERSION;
  const bindings=base.interpretations.map((i,position)=>{
    exact(i,['text','fact_ids','rule_ids','literature_ids','applicability','uncertainties','source_ids']);
    require(Array.isArray(i.source_ids) && i.source_ids.length<=20 && new Set(i.source_ids).size===i.source_ids.length,'Invalid source IDs');
    const resolved=i.source_ids.map(id=>{const item=items.get(id);require(item && i.literature_ids.includes(item.literature_id),'Unknown or unlinked source field');return item;});
    exact(i.applicability,['program','editorial']);
    require(typeof i.applicability.program==='string' && i.applicability.program.trim() && Array.isArray(i.applicability.editorial) && i.applicability.editorial.length<=20,'Invalid applicability split');
    const used=new Set();
    const editorial=i.applicability.editorial.map(note=>{
      exact(note,['source_id','explanation']);const source=items.get(note.source_id);
      require(source?.origin==='modern_editorial' && i.source_ids.includes(note.source_id),'Editorial note needs a bound modern source');
      require(!used.has(note.source_id) && typeof note.explanation==='string' && note.explanation.trim() && [...note.explanation].length<=1000,'Duplicate or invalid editorial explanation');used.add(note.source_id);
      return {...source,explanation:note.explanation,semantic_support:'unassessed'};
    });
    // Actual declared modern references need their own note; background stays separate.
    require(resolved.filter(x=>x.origin==='modern_editorial').every(x=>used.has(x.source_id)),'Modern source lacks a bound note');
    const program=i.applicability.program;
    i.applicability=[program,...editorial.map(x=>`${x.label}：${x.explanation}`)].join('\n');
    i.source_claims=resolved.map(x=>({literature_id:x.literature_id,field:x.field,origin:x.origin,quote:x.text}));delete i.source_ids;
    return {position,program,editorial,sources:resolved.map(x=>({...x})),
      declared_sources_linked:true,undeclared_source_mentions:'unassessed',free_text_attribution:'unassessed',semantic_support:'unassessed'};
  });
  const result=checkSourcedOutput(base,evidence,packet);
  return {...result,version:BOUND_OUTPUT_VERSION,source_catalog_hash:catalog.catalog_hash,bindings,
    source_background:catalog,background_is_not_used_evidence:true,acceptance:'not_established',production_ready:false};
}
