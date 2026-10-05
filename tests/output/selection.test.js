// @vitest-environment node
import {test,expect} from 'vitest';
import {createReadingSession,prepareSelectedReadingTurn,appendReadingTurn,serializeReadingSession,restoreReadingSession,readingExport} from '../../src/ai/output/session.js';
import {selectionCatalog,SELECTION_VERSION} from '../../src/ai/output/selection.js';
import {parseOutputAnswer} from '../../src/ai/output/parse.js';
import {prepareJudgmentPlan} from '../../experiments/judgment-review/plan.js';
import {parseSearchResponse} from '../../src/ai/background-search.js';
const spec=(await prepareJudgmentPlan()).cases[0];
export const selectedAnswer=context=>({schema_version:SELECTION_VERSION,context_id:context.context_id,answer:'目前依据不足以断定能否达成目标。一般建议：先核对现实条件。',direction:'unclear',main_choice:{basis_id:'l4',reason:'先观察自身承受目标的条件，不等于已知能力。'},factors:[{basis_id:'e3',assessment:'conditional',interpretation:'这一基础支持不等于实际晋升，需要结合自身承受条件。'},{basis_id:'t4',assessment:'oppose',interpretation:'从自身这一角度观察限制，但不证明真实投入或状态。'}],background_usage:[],timing_candidates:[],uncertainties:['未提供实际能力与投入信息。']});
test('program generates facts and direct source references; malformed selectors and property prose rejected',async()=>{
 const p=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),spec.question),raw=selectedAnswer(p.context);
 const r=parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true});expect(r.status).toBe('validated');
 expect(r.answer.factors[0].interpretation).toContain('金）生第4爻本爻（水');
 expect(r.answer.factors[1].evidence_ids).toContain('fact:/lines/3/element');
 for(const change of [a=>a.factors[0].basis_id='web:1',a=>a.factors[0].interpretation='第3爻金不生水',a=>a.factors.push({...a.factors[0]})]){
  const bad=structuredClone(raw);change(bad);expect(parseOutputAnswer(JSON.stringify(bad),p.context,{completed:true}).status).toBe('fallback');
 }
 const legacy=structuredClone(r.answer);expect(parseOutputAnswer(JSON.stringify(legacy),p.context,{completed:true}).issues[0].code).toBe('version_mismatch');
});
test('limited background is separate, requires review and cannot be applied to a main-game question',async()=>{
 const bg=parseSearchResponse({stop_reason:'end_turn',content:[{type:'web_search_tool_result',content:[{type:'web_search_result',title:'限时迷你战',url:'https://example.org/mini'}]},{type:'text',citations:[{url:'https://example.org/mini',cited_text:'限时迷你模式奖励，不代表主游戏。'}]}]},'王者万象棋');
 const p=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),spec.question,{backgroundSearch:bg}),raw=selectedAnswer(p.context);
 expect(selectionCatalog(p.context).sources[0].scope_gate).toBe('limited_unconfirmed');
 const result=parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true});expect(result.status).toBe('validated');
 expect(result.answer.uncertainties.join('')).toContain('程序排除背景资料');
 expect(JSON.parse(p.messages[1].content).sources).toEqual([]);
 raw.background_usage=[{source_id:'s1',state:'context_only',note:'作为游戏规则。'}];
 expect(parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true}).issues[0].code).toBe('invalid_enum');
});
test('new export/restoration keeps context and format, interrupted reply stays unvalidated',async()=>{
 const session=createReadingSession(spec.canonical),p=await prepareSelectedReadingTurn(session,spec.question);
 const pending=await restoreReadingSession(serializeReadingSession(session,p.question));
 expect(readingExport(pending.pending)).toBe(readingExport(p));
 const raw=JSON.stringify(selectedAnswer(p.context));appendReadingTurn(session,p,raw,true,'external');
 const restored=await restoreReadingSession(serializeReadingSession(session));expect(restored.session.turns[0].result.status).toBe('validated');
 expect(parseOutputAnswer(raw,p.context).status).toBe('fallback');
});

test('pure fact question narrows fields; prose slots and source bypass remain rejected',async()=>{
 const p=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),'只核对第三爻和第五爻六亲，不预测。');
 const catalog=selectionCatalog(p.context);expect(catalog.entries.map(e=>e.id)).toEqual(['l3','l5']);
 expect(catalog.entries.every(e=>e.ids.length===1&&e.ids[0].endsWith('/relative'))).toBe(true);
 const raw=selectedAnswer(p.context);raw.main_choice={basis_id:'none',reason:'仅回应当前请求，不作趋势取用。'};raw.answer='所问事实由程序逐项展示，不作预测。';raw.uncertainties=['仅核对程序记录，不验证现实结果。'];raw.factors=[];
 expect(parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true}).status).toBe('validated');
 raw.factors=[{basis_id:'l3',assessment:'support',interpretation:'无关趋势。'}];expect(parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true}).issues[0].code).toBe('invalid_count');
 const normal=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),spec.question),answer=selectedAnswer(normal.context);
 answer.timing_candidates=[{candidate:'明天',basis_id:'t4',reason:'仅供参考。'}];expect(parseOutputAnswer(JSON.stringify(answer),normal.context,{completed:true}).issues[0].code).toBe('unexpected_timing');
 answer.timing_candidates[0].candidate='三爻提示明天';expect(parseOutputAnswer(JSON.stringify(answer),normal.context,{completed:true}).issues[0].code).toBe('model_fact_restatement');
});

test('initial and top line aliases restrict selectable facts',async()=>{
 for(const [question,id] of [['只核对初爻是否为应爻，不预测','l1'],['只核对上爻六亲，不预测','l6']]){
  const p=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),question);expect(selectionCatalog(p.context).entries.map(e=>e.id)).toEqual([id]);
 }
});

test('general advice can omit decorative evidence while trend cannot',async()=>{
 const p=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),'请给两项建议');
 const raw=selectedAnswer(p.context);raw.main_choice={basis_id:'none',reason:'仅回应当前请求，不作趋势取用。'};raw.factors=[];
 expect(parseOutputAnswer(JSON.stringify(raw),p.context,{completed:true}).status).toBe('validated');
 const trend=await prepareSelectedReadingTurn(createReadingSession(spec.canonical),spec.question);raw.context_id=trend.context.context_id;raw.main_choice={basis_id:'l4',reason:'自身角度。'};
 expect(parseOutputAnswer(JSON.stringify(raw),trend.context,{completed:true}).issues[0].code).toBe('missing_field');
});
