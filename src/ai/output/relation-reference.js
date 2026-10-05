import {SHENG,KE} from '../../core/constants.js';
import {isOutputContext} from './context.js';

// Pure elemental direction, not effective strength, role selection or prediction.
export function elementalDirection(from,to){
 if(!Object.hasOwn(SHENG,from)||!Object.hasOwn(SHENG,to))throw Error('Unknown element');
 if(from===to)return 'same';
 if(SHENG[from]===to)return 'generates';
 if(KE[from]===to)return 'controls';
 if(SHENG[to]===from)return 'generated_by';
 return 'controlled_by';
}
const labels={same:'与',generates:'生',controls:'克',generated_by:'受生于',controlled_by:'受克于'};
export function buildElementReference(context){
 if(!isOutputContext(context))throw Error('Trusted output context required');
 const lines=context.input.C_canonical_cast.lines,shi=lines.findIndex(l=>l.is_shi);
 if(shi<0||lines.filter(l=>l.is_shi).length!==1)throw Error('Unique shi line required');
 const registry=new Map(context.evidence.map(e=>[e.id,e]));
 const fact=(index,field)=>{
  const id=`fact:/lines/${index}/${field}`,e=registry.get(id);
  if(e?.kind!=='program_fact')throw Error('Source fact missing');
  return {id,value:e.value};
 };
 const row=(index,component,targetIndex,targetComponent,roleId=null)=>{
  const source=fact(index,`${component==='primary'?'':component+'/'}element`);
  const target=fact(targetIndex,`${targetComponent==='primary'?'':targetComponent+'/'}element`);
  const direction=elementalDirection(source.value,target.value);
  const name=(i,c)=>`第${i+1}爻${c==='primary'?'本爻':'变爻'}`;
  const text=`${name(index,component)}（${source.value}）${labels[direction]}${name(targetIndex,targetComponent)}（${target.value}）${direction==='same'?'比和':''}`;
  return {from:{line:index+1,component,element:source.value},to:{line:targetIndex+1,component:targetComponent,element:target.value},direction,text,
   source_fact_ids:[...new Set([source.id,target.id,...(roleId?[roleId]:[])])]};
 };
 return {version:'element-reference-1',scope:'基础五行方向；不判有效生扶、喜忌、用神或吉凶',shi_line:shi+1,
  to_shi:lines.map((_,i)=>row(i,'primary',shi,'primary',fact(shi,'is_shi').id)),
  returning:lines.flatMap((l,i)=>{if(!l.moving||!l.changed)return [];const relation=row(i,'changed',i,'primary');return [{...relation,source_fact_ids:[...new Set([...relation.source_fact_ids,fact(i,'moving').id])]}];})};
}
