import { MAX_RESPONSE_CHARS, OUTPUT_SCHEMA, OutputError, validateOutputShape } from './contract.js';
import { isOutputContext } from './context.js';
import {SELECTION_VERSION,decodeSelection} from './selection.js';

function references(answer) {
  return [...answer.factors, ...answer.yongshen_candidates, ...answer.timing_candidates];
}
// A deliberately narrow consistency check, not a natural-language truth checker.
// Only literal numbered-line claims and quantified cited motion facts are checked.
// Questions, conditions, negations and quotations are left for human review.
function checkMotionClaims(answer, context) {
  if(!['reading-production-3','reading-production-4'].includes(context.conversation?.version)) return;
  const numbers={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'两':2};
  const number=s=>numbers[s] || Number(s);
  const registry=new Map(context.evidence.map(e=>[e.id,e]));
  const passages=[{text:answer.answer,path:'$.answer'},
    ...answer.factors.map((f,i)=>({text:f.interpretation,ids:f.evidence_ids,path:`$.factors[${i}].interpretation`})),
    ...answer.yongshen_candidates.map((c,i)=>({text:c.reason,ids:c.evidence_ids,path:`$.yongshen_candidates[${i}].reason`})),
    ...answer.timing_candidates.map((c,i)=>({text:c.reason,ids:c.evidence_ids,path:`$.timing_candidates[${i}].reason`})),
    ...answer.uncertainties.map((text,i)=>({text,path:`$.uncertainties[${i}]`}))];
  for(const passage of passages) for(const clause of passage.text.match(/[^。；;！？!?\n]+[。；;！？!?\n]?/g) || []) {
    // Keep sentence endings: removing '?' turns a question into a false assertion.
    if (/[？?]|请(?:问|确认|核对)|能否/.test(clause) || /[吗么呢][。！!]?\s*$/.test(clause)) continue;
    if(/[“”"‘’]|如果|假设|假如|若|并非|不是|并不|不一定|不能说|是否|未必|变卦|变爻|伏神/.test(clause)) continue;
    for(const match of clause.matchAll(/第([一二三四五六1-6])爻(?:（[^）]{0,8}）)?(?:父母|兄弟|子孙|妻财|官鬼)?(?:为|是|属于|属)(动|静)爻/g)) {
      const line=context.input.C_canonical_cast.lines[number(match[1])-1];
      if(line.moving !== (match[2]==='动')) throw new OutputError('motion_fact_conflict',passage.path);
    }
    // "两爻均为静爻" can only be resolved when exactly two direct motion facts
    // are cited in this item. Do not guess which lines an unbound pronoun denotes.
    const motion=[...new Set(passage.ids || [])].map(id=>registry.get(id)).filter(e=>e?.kind==='program_fact' && /^\/lines\/[0-5]\/moving$/.test(e.path));
    for(const match of clause.matchAll(/([一二三四五六两1-6])爻(?:全部|均|都)(?:为|是|属|属于)(动|静)爻/g)) {
      if(motion.length===number(match[1]) && motion.some(e=>e.value !== (match[2]==='动'))) throw new OutputError('motion_fact_conflict',passage.path);
    }
  }
}
export function validateOutputAnswer(answer, context) {
  if (!isOutputContext(context)) throw new OutputError('untrusted_context');
  const practical=context.conversation?.judgment_policy===7;
  const schema=context.conversation?.output_format==='selection-2'
    ? {...OUTPUT_SCHEMA,properties:{...OUTPUT_SCHEMA.properties,...(practical?{uncertainties:{...OUTPUT_SCHEMA.properties.uncertainties,minItems:0,maxItems:15}}:{}),factors:{...OUTPUT_SCHEMA.properties.factors,minItems:0,
      ...(practical?{items:{...OUTPUT_SCHEMA.properties.factors.items,properties:{...OUTPUT_SCHEMA.properties.factors.items.properties,
        interpretation:{...OUTPUT_SCHEMA.properties.factors.items.properties.interpretation,maxLength:MAX_RESPONSE_CHARS},
        evidence_ids:{...OUTPUT_SCHEMA.properties.factors.items.properties.evidence_ids,minItems:0,maxItems:context.evidence.length}}}}:{})}}}
    : OUTPUT_SCHEMA;
  if(practical&&context.conversation?.output_format==='selection-2'){
    schema.properties.timing_candidates={...OUTPUT_SCHEMA.properties.timing_candidates,items:{...OUTPUT_SCHEMA.properties.timing_candidates.items,properties:{...OUTPUT_SCHEMA.properties.timing_candidates.items.properties,evidence_ids:{...OUTPUT_SCHEMA.properties.timing_candidates.items.properties.evidence_ids,maxItems:context.evidence.length}}}};
  }
  validateOutputShape(answer,schema);
  if (answer.context_id !== context.context_id) throw new OutputError('context_mismatch', '$.context_id');
  const registry = new Map(context.evidence.map(e => [e.id, e]));
  for (const item of references(answer)) for (const id of item.evidence_ids)
    if (!registry.has(id)) throw new OutputError('unknown_evidence', '$.evidence_ids');
  for (const candidate of answer.yongshen_candidates) for (const target of candidate.targets) {
    const line = context.input.C_canonical_cast.lines[target.line - 1];
    const record = target.component === 'primary' ? line : line[target.component];
    if (!record || record.relative !== candidate.relative) throw new OutputError('target_relative_mismatch', '$.yongshen_candidates');
    const pointer = `/lines/${target.line - 1}/${target.component === 'primary' ? '' : target.component + '/'}relative`;
    if (!candidate.evidence_ids.includes(`fact:${pointer}`)) throw new OutputError('missing_target_evidence', '$.yongshen_candidates');
  }
  if(!practical)checkMotionClaims(answer,context);
  return answer;
}

// Never extract an embedded fragment, repair fields, or retry a paid call.
// JSON.parse silently accepts repeated keys. Reject ambiguous objects, including
// escaped spellings of the same key, before treating any response as validated.
function hasDuplicateKeys(raw) {
  const stack = [];
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '{') stack.push({ keys: new Set(), keyExpected: true });
    else if (char === '[') stack.push(null);
    else if (char === '}' || char === ']') stack.pop();
    else if (char === ',' && stack.at(-1)) stack.at(-1).keyExpected = true;
    else if (char === '"') {
      const start = i;
      for (i++; i < raw.length; i++) { if (raw[i] === '\\') i++; else if (raw[i] === '"') break; }
      const frame = stack.at(-1);
      if (frame?.keyExpected) {
        const key = JSON.parse(raw.slice(start, i + 1));
        if (frame.keys.has(key)) return true;
        frame.keys.add(key); frame.keyExpected = false;
      }
    }
  }
  return false;
}
// Some providers finish a tool call with valid leading prose but malformed
// later fields (for example unescaped quotes inside an explanation). Read only
// three complete leading JSON strings; never repair or trust the broken tail.
function completeProsePrefix(raw,context){
  if(context.conversation?.judgment_policy!==7||!raw.trimEnd().endsWith('}'))return null;
  const token='"(?:[^"\\\\\u0000-\u001f]|\\\\(?:["\\\\/bfnrt]|u[0-9a-fA-F]{4}))*"';
  const pair=new RegExp('^\\s*('+token+')\\s*:\\s*('+token+')\\s*([,}])');
  let rest=raw.trimStart();if(!rest.startsWith('{'))return null;rest=rest.slice(1);
  const fields={};
  for(let n=0;n<3;n++){
    const m=pair.exec(rest);if(!m)return null;
    const key=JSON.parse(m[1]);if(!['schema_version','context_id','answer'].includes(key)||Object.hasOwn(fields,key))return null;
    fields[key]=JSON.parse(m[2]);rest=rest.slice(m[0].length);
    if(m[3]!==',')return null;
  }
  if(fields.schema_version!==SELECTION_VERSION||fields.context_id!==context.context_id||!fields.answer?.trim())return null;
  // Conservatively reject another spelling of an identity/prose key anywhere
  // in the damaged remainder, even if it may merely occur in quoted content.
  for(const m of rest.matchAll(new RegExp('('+token+')\\s*:','g'))){
    if(['schema_version','context_id','answer'].includes(JSON.parse(m[1])))return null;
  }
  return fields.answer;
}
export function parseOutputAnswer(rawText, context, { completed = false, allowEnvelope = false } = {}) {
  if (!isOutputContext(context)) throw new OutputError('untrusted_context');
  if (typeof rawText !== 'string') throw new OutputError('invalid_response_type');
  let readableAnswer=null;
  const plain = (code, path = '$') => ({ status: 'fallback', validation: 'not_validated',
    answer: null, display_text: rawText.slice(0, MAX_RESPONSE_CHARS),
    ...(readableAnswer?{readable_answer:readableAnswer}:{}),
    truncated: rawText.length > MAX_RESPONSE_CHARS, issues: [{ code, path }],
    notice: '本次回复未通过结构与引用校验，以下仅保留原始文本。' });
  if (rawText.length > MAX_RESPONSE_CHARS) return plain('response_too_large');
  if (!completed) return plain('incomplete_response');
  let answer, jsonText=rawText, inputNormalization=null;
  // Opt-in for newly pasted external replies only. Preserve the original bytes
  // and accept exactly one complete wrapper, never prose plus an embedded JSON.
  if(allowEnvelope||context.conversation?.judgment_policy===7){
    if(jsonText.startsWith('\uFEFF')){jsonText=jsonText.slice(1);inputNormalization='leading_bom';}
    const fence=/^```(?:json)?[ \t]*\r?\n([\s\S]*)\r?\n```$/i.exec(jsonText.trim());
    if(fence){jsonText=fence[1];inputNormalization='outer_json_fence';}
  }
  try { answer = JSON.parse(jsonText); } catch {
    readableAnswer=completeProsePrefix(jsonText,context);
    return plain('invalid_json');
  }
  if (hasDuplicateKeys(jsonText)) return plain('duplicate_field');
  // Preserve complete prose when optional structure fails. It remains unverified;
  // a truncated, ambiguous or different-round reply never enters this path.
  if(context.conversation?.judgment_policy===7&&answer?.schema_version===SELECTION_VERSION&&
    answer.context_id===context.context_id&&typeof answer.answer==='string'&&answer.answer.trim()&&
    answer.answer.length<=MAX_RESPONSE_CHARS)readableAnswer=answer.answer;
  try {
    if(context.conversation?.output_format==='selection-2'&&answer?.schema_version!==SELECTION_VERSION)throw new OutputError('version_mismatch');
    if(answer?.schema_version===SELECTION_VERSION){
      if(context.conversation?.output_format!=='selection-2')throw new OutputError('version_mismatch');
      answer=decodeSelection(answer,context);
    }
    validateOutputAnswer(answer, context);
    return { status: 'validated', validation: 'structure_and_references_only',
      answer, display_text: answer.answer, truncated: false, issues: [],
      ...(inputNormalization?{inputNormalization}:{}),
      notice: `${inputNormalization?'已识别完整 JSON 的外层包装；':''}格式与引用已核对；AI 的解释和预测尚未经事实效果验证。` };
  } catch (error) {
    if (!(error instanceof OutputError)) throw error;
    return plain(error.code, error.path);
  }
}

export function createOutputCollector(context) {
  if (!isOutputContext(context)) throw new OutputError('untrusted_context');
  let text = '', closed = false, exceeded = false;
  return {
    get rawText() { return text; },
    append(delta) {
      if (closed) throw new OutputError('collector_closed');
      if (typeof delta !== 'string') throw new OutputError('invalid_response_type');
      if (text.length + delta.length > MAX_RESPONSE_CHARS) exceeded = true;
      text += delta.slice(0, Math.max(0, MAX_RESPONSE_CHARS + 1 - text.length));
      return { status: 'pending', characters: text.length }; // Never expose half a validated card.
    },
    finish({ finishReason = null, sawDone = false, interrupted = false } = {}) {
      if (closed) throw new OutputError('collector_closed');
      closed = true;
      const result = parseOutputAnswer(text, context, { completed: sawDone && finishReason === 'stop' && !interrupted });
      if (exceeded && !result.truncated) throw new OutputError('collector_limit_invariant');
      return result;
    },
  };
}
