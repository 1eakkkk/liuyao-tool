// Unreleased candidate. Exact source linkage is not semantic or predictive validation.
import {checkLayeredOutput,layeredOutputInstructions,LAYERED_OUTPUT_VERSION} from './layered-output.js';
import {literatureSourceViews} from '../../src/knowledge/source-view.js';
export const SOURCED_OUTPUT_VERSION='layered-reading-sourced-dev-1';
const fields=['original_text','editorial_summary','applicable_conditions','exclusions','exceptions'];
const require=(ok,message)=>{if(!ok) throw Error(message);};
export function sourceText(card,field) {
  if(field==='/original_text' || field==='/editorial_summary') return card[field.slice(1)];
  const match=/^\/(applicable_conditions|exclusions|exceptions)\/statements\/(0|[1-9]\d*)$/.exec(field);
  return match ? card[match[1]]?.statements?.[Number(match[2])] : undefined;
}
export function checkSourcedOutput(answer,registry,packet) {
  require(answer?.schema_version===SOURCED_OUTPUT_VERSION && Array.isArray(answer.interpretations),'Unknown sourced output');
  // Validate the packet independently; the model cannot redefine field origins.
  literatureSourceViews(packet,packet.cards.map(c=>c.literature_id));
  const base=structuredClone(answer);base.schema_version=LAYERED_OUTPUT_VERSION;
  const claims=base.interpretations.map(i=>{
    require(Array.isArray(i.source_claims) && i.source_claims.length<=20,'Source claims are required and bounded');
    const items=i.source_claims;delete i.source_claims;return items;
  });
  const result=checkLayeredOutput(base,registry,packet);
  const sources=claims.map((items,position)=>{
    const seen=new Set(),covered=new Set();
    const checked=items.map(claim=>{
      require(claim && Object.getPrototypeOf(claim)===Object.prototype &&
        Object.keys(claim).sort().join(',')==='field,literature_id,origin,quote','Invalid source claim fields');
      require(typeof claim.literature_id==='string' && typeof claim.field==='string' &&
        ['source_transcription','modern_editorial'].includes(claim.origin) &&
        typeof claim.quote==='string' && claim.quote.trim() && [...claim.quote].length<=1000,'Invalid source claim');
      const key=JSON.stringify([claim.literature_id,claim.field,claim.quote]);
      require(!seen.has(key),'Duplicate source claim');seen.add(key);
      const card=packet.cards.find(c=>c.literature_id===claim.literature_id);
      const root=claim.field.split('/')[1];
      const expectedOrigin=root==='original_text'?'source_transcription':'modern_editorial';
      const text=card && sourceText(card,claim.field);
      let status='consistent';
      if(!card || !answer.interpretations[position].literature_ids.includes(claim.literature_id)) status='unlinked_literature';
      else if(!fields.includes(root) || typeof text!=='string') status='invalid_source_field';
      else if(claim.origin!==expectedOrigin || card.field_origins[root]!==expectedOrigin) status='origin_mismatch';
      else if(!text.includes(claim.quote)) status='quote_not_in_field';
      if(status==='consistent') covered.add(claim.literature_id);
      return {...claim,status};
    });
    const missing=answer.interpretations[position].literature_ids.filter(id=>!covered.has(id));
    return {position,claims:checked,missing_literature_claims:missing,
      mechanical_ok:!missing.length && checked.every(c=>c.status==='consistent'),
      free_text_attribution:'unassessed',semantic_support:'unassessed'};
  });
  return {...result,version:SOURCED_OUTPUT_VERSION,sources,
    mechanical_ok:result.mechanical_ok && sources.every(s=>s.mechanical_ok),
    acceptance:'not_established',production_ready:false};
}
export function sourcedOutputInstructions() {
  const example='"uncertainties":["尚无法确认之处"],"source_claims":[{"literature_id":"资料包中的 literature ID","field":"/original_text","origin":"source_transcription","quote":"对应 original_text 内逐字引文"}]';
  return layeredOutputInstructions().replaceAll(LAYERED_OUTPUT_VERSION,SOURCED_OUTPUT_VERSION)
    .replace('"uncertainties":["尚无法确认之处"]',example)+`\n候选提示版本 sourced-instructions-dev-1：schema_version 必须为 ${SOURCED_OUTPUT_VERSION}（仅离线）。
每个 interpretations 条目增加 source_claims 数组，其他字段沿用上述协议。
每个 literature_ids 引用至少关联一条 source_claims：
{"literature_id":"该条 literature ID","field":"/original_text","origin":"source_transcription","quote":"从对应字段逐字复制的短引文"}。
原文只能使用 /original_text、origin=source_transcription；现代整理使用 /editorial_summary 或 /applicable_conditions/statements/0、/exclusions/statements/0、/exceptions/statements/0 等实际存在的编号，origin=modern_editorial。
禁止把现代整理引文标为原文。没有文献时 literature_ids 与 source_claims 都为空；不得虚构引文、引用未提供资料，或将错误示例作为支持来源。
引文必须与该解释有关；逐字匹配只证明字段连接，不证明解释正确。解释自由文字也必须明确区分原文与现代整理，不能用正确引文掩盖错误归属。`;
}
