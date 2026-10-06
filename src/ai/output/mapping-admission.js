// A separate applicability review, never an upgrade of association_only corpus units.
// Initial coverage is intentionally narrow. Unknown targets receive no admitted mapping.
export const MAPPING_REGISTRY_VERSION='mapping-admission-1';
export const REVIEWED_MAPPING=Object.freeze({
 id:'peer-help-direction-1',revision:1,review_scope:'source_scope_and_observation_direction_only',
 source:{work:'增删卜易',chapter:'增删黄金策千金赋章第三十四',image_page:146,
  url:'https://upload.wikimedia.org/wikipedia/commons/4/42/NLC416-12jh005345-45344_%E5%A2%9E%E5%88%AA%E5%8D%9C%E6%98%93.pdf',
  segment_id:'zsby-1925-s1',revision:1,text_hash:'sha256:14f0d54f3cd9b9d49c3df3769e2e01d9017d1f0ce834da33239335ec080b54a6',
  quote:'欲他扶助我者喜應爻生合世爻。我欲代他而謀事者。宜世爻而生應也。非占彼此而不用也。'},
 limits:['只用于明确问彼此帮助方向','不证明对方愿意或实际参与','不以相生方向单独判断成败','不映射能力、兴趣、收益、平台稳定性或维护成本'],
 assessments:['conditional','neutral'],
});
export const hasMappingAdmission=context=>context.conversation?.basis_policy===4;
export function reviewedGoal(question){
 // First-card scope is a single short assistance question. Compound requests,
 // quotations and alternative directions are deliberately left uncovered.
 const q=question.trim();
 if(/[“”「」『』"\n，,。；;：:]|不要|并非|不是|只核对|只要|仅核对|不给/.test(q))return null;
 const toSelf=/^(?:这次|这件事|这件事情)?(?:他|朋友|同事|家人|对方)(?:能否|能不能|是否能|会不会)(?:帮我|帮助我|协助我)([^！？!?]{0,60})[？?]?$/.exec(q);
 const toOther=/^(?:这次|这件事|这件事情)?(?:我|我的帮助)(?:能否|能不能|是否能)(?:帮到|帮助|协助)(?:他|朋友|同事|家人|对方)([^！？!?]{0,60})[？?]?$/.exec(q);
 const tail=(toSelf||toOther)?.[1];
 if(tail===undefined||/我|他|对方|朋友|同事|家人|帮|协助|扶助|支持|还是|或者|或是|同时|互相|彼此|双方|相互|反过来/.test(tail))return null;
 return toSelf?'counterpart_helps_self':'self_helps_counterpart';
}
export function admittedMappings(context,entries){
 const goal=reviewedGoal(context.input.A_user_question);
 if(!goal)return [];
 const ruleId=goal==='counterpart_helps_self'?'YING-GENERATE-SHI-001':'SHI-GENERATE-YING-001';
 const role=goal==='counterpart_helps_self'?'counterpart':'self';
 const lines=context.input.C_canonical_cast.lines;
 const basisIds=entries.filter(entry=>entry.ids.some(id=>context.evidence.some(e=>e.id===id&&e.kind==='rule_result'&&e.rule_id===ruleId))).map(e=>e.id);
 const roleIds=entries.filter(e=>e.target?.component==='primary'&&(role==='self'?lines[e.target.line-1].is_shi:lines[e.target.line-1].is_ying)).map(e=>e.id);
 return basisIds.length?[{...REVIEWED_MAPPING,goal,rule_id:ruleId,basis_ids:basisIds,role_ids:roleIds,perspective:role}]:[];
}
export function mappingAdmissionIssue(factor,mappings){
 const mapping=mappings.find(m=>m.id===factor.application.mapping_id);
 if(!mapping)return 'unreviewed_mapping';
 if(!mapping.basis_ids.includes(factor.basis_id)||!mapping.role_ids.includes(factor.role.basis_id)||mapping.perspective!==factor.role.perspective)return 'mapping_scope_mismatch';
 if(!mapping.assessments.includes(factor.assessment))return 'mapping_effect_overreach';
 return null;
}
