import {admittedMappings} from './mapping-admission.js';
import {declaresUnresolvedLink} from './basis-scope.js';
import {elementalDirection} from './relation-reference.js';

// Reviewed applicability for self-directed plans, kept separate from peer-help direction.
// Every mechanism below is a *local* direction from an already-transcribed segment.
// None of them is a verdict on whether the plan will succeed.
export const PLAN_MAPPING_REGISTRY_VERSION='plan-admission-1';
const ZSBY={work:'增删卜易',url:'https://upload.wikimedia.org/wikipedia/commons/4/42/NLC416-12jh005345-45344_%E5%A2%9E%E5%88%AA%E5%8D%9C%E6%98%93.pdf'};

// A single affirmative self-directed plan question. Negated, quoted, compound and
// third-party variants are deliberately left uncovered so no direction is guessed.
// A negation attached to the advance itself (不打算继续…, 停止推进…, 不再投入…).
const NEGATED_ADVANCE=/(?:不|没|未|无)(?:再|会|要|打算|准备|计划|想|能|可以|应该|该|值得|愿|继续|推进|投入|坚持)|(?:放弃|停止|中止)/;
export function planGoal(question){
 const q=question.trim();
 if(/[“”「」『』"\n；;：:]|不要|并非|不是|是否(?:不适合|不该|不宜)|还是|或者|或是|同时|另外|以及|帮我|替我|只核对|只要|仅核对/.test(q))return null;
 // Only a third party asked *as the capable actor* is out of scope; merely mentioning
 // one (e.g. "只供自己与朋友娱乐") does not turn a self-directed plan into a peer question.
 if(/(?:^|[，,。])我?(?:的)?(?:他|她|朋友|同事|家人|对方|别人|他人)(?:能否|能不能|是否能|会不会|是不是|是否|可以|该不该)/.test(q))return null;
 // The intent marker may follow a preamble, but the purpose question must come after
 // it and no question may be asked in between.
 const intent=/我(?:想|打算|计划|准备|要|希望|正在考虑)[^？?]{0,200}?(?:是否(?:适合)?(?:继续)?推进|能否(?:继续)?推进|是否适合继续|要不要继续|是否值得继续|能否继续做下去|是否可以继续)/.exec(q);
 if(!intent)return null;
 // The question must be about sustaining something: either an explicit 继续/持续, or an
 // already-in-place premise (已经/正在/目前…) carried into a 推进 question. A bare
 // 是否适合推进 with neither is a different question than the one reviewed here.
 if(!/(?:继续|持续)/.test(intent[0])&&!/(?:已经|已|正在|目前|现在|一向|一直)[^？?]{0,120}推进/.test(intent[0]))return null;
 // A negation attached to the advance itself inverts the question, so it is not the
 // reviewed direction even though the affirmative wording is still present. This runs
 // on the matched intent text only, so unrelated clauses such as 不出售／不组织交换活动
 // cannot veto an otherwise affirmative plan question.
 if(NEGATED_ADVANCE.test(intent[0]))return null;
 const tail=q.slice(intent.index+intent[0].length);
 // A single "？" that only terminates the goal question is expected; a question mark
 // closing some other clause, or an added request, makes this a compound goal.
 if(/[？?]/.test(q.slice(0,intent.index))||/[^？?]\s*[？?]/.test(tail)||/(?:还是|或者|或是|同时|另外|以及|再问|还想|也能不能)/.test(tail))return null;
 return 'self_plan_advance';
}

// 旺相為強、休囚死為弱 is the vigour split the 日辰章原文 itself uses to read 日冲.
const vigour=state=>({旺:'strength',相:'strength',休:'weakness',囚:'weakness',死:'weakness'})[state]||null;
// Local direction only. No mechanism here is treated as decisive on its own.
export const PLAN_MECHANISMS=Object.freeze([
 Object.freeze({id:'plan-shi-advance',rule_id:'MOVE-ADVANCE-001',kind:'direct',assessment:'support',
  quote:'進神者。出化而前進也。如春木之榮。有源之水。久遠長進之象。',chapter:'進神退神章第二十九',
  condition:'适用于所问为「继续推进」这一方向，只说明该世爻动而化进、方向向前，不说明事情成败。'}),
 Object.freeze({id:'plan-shi-retreat',rule_id:'MOVE-RETREAT-001',kind:'direct',assessment:'oppose',
  quote:'退神者。由此而漸退也如秋天花木。漸漸凋零也。',chapter:'進神退神章第二十九',
  condition:'适用于所问为「继续推进」这一方向，只说明该世爻动而化退、方向渐退，不说明事情成败。'}),
 Object.freeze({id:'plan-shi-return',rule_id:'MOVE-RETURN-001',kind:'return_direction',assessment:null,
  quote:'夫變出之爻能生尅沖合本位之動爻不能生尅他爻。',chapter:'動變生尅沖合章第十五',
  condition:'只按变爻与其本位动爻的五行方向说明回生或回克，不推广到其他爻，也不说明事情成败，并不确认现实条件。'}),
 Object.freeze({id:'plan-shi-month-combine',rule_id:'MONTH-COMBINE-001',kind:'useful_state',assessment:'support',
  quote:'月建合爻則爲月合乃有用之爻也。',chapter:'月將章第十六',
  condition:'原文称爻逢月合为有用之爻；这是该爻有无作用的判断，不是吉凶或成败判断。'}),
 Object.freeze({id:'plan-shi-month-clash',rule_id:'MONTH-CLASH-001',kind:'useful_state',assessment:'oppose',
  quote:'月沖之爻。卽爲月破無用之爻也。',chapter:'月將章第十六',
  condition:'原文称爻逢月破为无功之爻；这是该爻有无作用的判断，不是对计划成败的结论。'}),
 Object.freeze({id:'plan-shi-day-clash',rule_id:'DAY-CLASH-001',kind:'clash_by_vigour',assessment:null,
  quote:'沖旺相之靜爻卽爲暗動。沖衰弱之靜爻則爲日破。',chapter:'日辰章第十七',
  condition:'原文按旺相／衰弱区分日冲静爻为暗动或日破；只在世爻为静爻且旺衰可判时成立。'})]);

const hitFor=(entries,rule_id,line)=>entries.find(entry=>entry.ids.some(id=>id.startsWith(`rule:${rule_id}:`))&&entry.target?.line===line);
const lineEntry=(entries,line)=>entries.find(entry=>entry.target?.component==='primary'&&entry.target.line===line);
const returnEntry=(entries,line)=>entries.find(entry=>entry.id===`t${line}`);
const shiLine=context=>{
 const lines=context.input.C_canonical_cast.lines;
 if(lines.filter(line=>line.is_shi).length!==1)throw Error('Unique shi line required');
 return lines.findIndex(line=>line.is_shi)+1;
};
// The 世爻 is the observed position for a self-directed plan; 应爻 is not a counterpart
// here, so no shi_ying direction is admitted for this goal.
export function admittedPlanMappings(context,entries){
 if(!planGoal(context.input.A_user_question))return [];
 const line=shiLine(context),self=lineEntry(entries,line),record=context.input.C_canonical_cast.lines[line-1];
 if(!self)return [];
 const verdicts=[];
 for(const mechanism of PLAN_MECHANISMS){
  if(mechanism.kind==='clash_by_vigour'){
   const strength=vigour(record.relations?.month_strength);
   const hit=hitFor(entries,mechanism.rule_id,line);
   if(!hit||!strength)continue;
   const activated=strength==='strength';
   verdicts.push({mechanism,assessment:activated?'support':'oppose',basis_ids:[hit.id],
    unconfirmed:[`原文按${activated?'旺相':'衰弱'}把这次日冲读作${activated?'暗动':'日破'}；世爻在所问时段内的旺衰与实际情况是否相符，仍需你确认。`]});
   continue;
  }
  if(mechanism.kind==='return_direction'){
   // The catalog represents 回头生/克 through the t{line} reference, which carries the
   // changed-element facts; MOVE-RETURN-* rule hits are deliberately not catalog entries.
   const reference=returnEntry(entries,line);
   if(!record.changed||!reference)continue;
   // The catalog carries this reference as element facts, so the direction is derived
   // from those facts rather than from its prose.
   const direction=elementalDirection(record.changed.element,record.element);
   const controlled=direction==='controls',generated=direction==='generates';
   if(!generated&&!controlled)continue;
   verdicts.push({mechanism,assessment:controlled?'oppose':'support',basis_ids:[reference.id],
    mappingId:controlled?'plan-shi-return-control':'plan-shi-return-generate',
    unconfirmed:['变爻对本位动爻的方向是盘面内关系，现实中对应的条件仍未核实。']});
   continue;
  }
  const hit=hitFor(entries,mechanism.rule_id,line);
  if(!hit)continue;
  verdicts.push({mechanism,assessment:mechanism.assessment,basis_ids:[hit.id],
   unconfirmed:[mechanism.kind==='useful_state'
    ?'该爻的有用性判断能否对应到现实，仍取决于尚未核实的实际条件。'
    :'盘面只给出这个动爻自身的局部方向，现实前提尚未核实。']});
 }
 // One factor per basis id: the first reviewed mechanism wins, and the rest are
 // reported as not offered rather than merged into a single impression.
 const seen=new Set(),mappings=[];
 for(const verdict of verdicts){
  const key=verdict.basis_ids[0];
  if(seen.has(key))continue;
  seen.add(key);
  mappings.push({id:verdict.mappingId||verdict.mechanism.id,revision:1,goal:'self_plan_advance',
   review_scope:'local_direction_of_the_shi_line_only',
   mechanism:{id:verdict.mappingId||verdict.mechanism.id,rule_id:verdict.mechanism.rule_id},
   source:{...ZSBY,chapter:verdict.mechanism.chapter,quote:verdict.mechanism.quote},
   limits:['不选择用神，不以本机制单独判断计划成败','只说明该世爻自身或其变爻的局部方向','不确认现实意愿、能力、时间投入或外部条件'],
   condition:verdict.mechanism.condition,assessments:['conditional','neutral'],decisive:false,
   basis_ids:verdict.basis_ids,role_ids:[self.id],perspective:'self',unconfirmed:verdict.unconfirmed});
 }
 return mappings;
}
// Reuses the peer-help admission plus the reviewed plan applicability above.
export function admittedMappingsFor(context,entries){
 const peer=admittedMappings(context,entries);
 return peer.length?peer:admittedPlanMappings(context,entries);
}
export function planMappingIssue(factor,mappings){
 const mapping=mappings.find(m=>m.id===factor.application.mapping_id);
 if(!mapping)return 'unreviewed_mapping';
 if(!mapping.basis_ids.includes(factor.basis_id)||!mapping.role_ids.includes(factor.role.basis_id)||mapping.perspective!==factor.role.perspective)return 'mapping_scope_mismatch';
 if(!mapping.assessments.includes(factor.assessment))return 'mapping_effect_overreach';
 if(declaresUnresolvedLink(factor.application.goal_link))return 'unresolved_factor_application';
 return null;
}
// Shown before generation when a reviewed mechanism applies but its real premise is open.
export const pendingConfirmation=mappings=>[...new Set(mappings.flatMap(mapping=>mapping.unconfirmed))];