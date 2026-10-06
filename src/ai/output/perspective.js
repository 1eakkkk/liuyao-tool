// Program positions identify an observation angle, never a real-world person or result.
export const PERSPECTIVE_LABELS={self:'自身观察角度',counterpart:'对应方观察角度',symbolic:'象意分析角度',none:'未选取观察角度'};
export const DIRECTION_OPENINGS={
 favorable:'象意判断偏有利，不代表结果已经确定。',
 unfavorable:'象意判断偏不利，不代表结果已经确定。',
 mixed:'本次解释同时列有支持与阻碍，整体取舍仍需结合条件。',
 unclear:'当前依据不足，不能据此判断目标能否达成。',
};
export function availablePerspectives(entry,context){
 if(!entry?.target)return [];
 const line=context.input.C_canonical_cast.lines[entry.target.line-1];
 return [...(entry.target.component==='primary'&&line.is_shi?['self']:[]),
  ...(entry.target.component==='primary'&&line.is_ying?['counterpart']:[]),'symbolic'];
}
export function perspectiveMatches(choice,entries,context){
 return choice.basis_id==='none'?choice.perspective==='none':availablePerspectives(entries.get(choice.basis_id),context).includes(choice.perspective);
}
