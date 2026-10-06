// Strict data return only: no function execution or automatic follow-up calls.
import {selectionSchema} from './selection.js';
import {parseOutputAnswer} from './parse.js';
export const READING_TOOL='submit_reading';

// Provider strict mode supports a subset. Site validation remains authoritative,
// including string lengths, array limits, IDs and semantic consistency checks.
export function providerSchema(schema){
 if(schema.type==='object')return {type:'object',properties:Object.fromEntries(Object.entries(schema.properties).map(([k,s])=>[k,providerSchema(s)])),required:[...schema.required],additionalProperties:false};
 if(schema.type==='array')return {type:'array',items:providerSchema(schema.items),description:[schema.description,
  `本站仍校验条目数量 ${schema.minItems??0}–${schema.maxItems??'不限'}、唯一性及所有实际编号。`].filter(Boolean).join(' ')};
 if(Object.hasOwn(schema,'const'))return {type:typeof schema.const,enum:[schema.const]};
 if(schema.enum){
  // Empty enums cannot be represented as a usable provider field. Never invent an ID.
  // The local original schema still rejects every value if a caller fills this field.
  return schema.enum.length?{type:'string',enum:[...schema.enum]}:{type:'string',description:'没有可用编号，包含该字段的数组必须为空；本站拒绝任何填充值。'};
 }
 return {type:schema.type??'string',...(schema.description?{description:schema.description}:{}),
  ...(schema.type==='string'&&Number.isSafeInteger(schema.minLength)&&Number.isSafeInteger(schema.maxLength)?
   {pattern:`^[\\s\\S]{${schema.minLength},${schema.maxLength}}$`}:{})};
}
export function strictReadingRequest(prepared,model='deepseek-flash'){
 return {endpoint:'https://api.deepseek.com/beta/chat/completions',body:{model,thinking:{type:'disabled'},max_tokens:8192,stream:false,
  messages:prepared.messages.map((m,i)=>i===0?{...m,content:m.content+'\n请仅通过 submit_reading 返回本轮结构化解读数据，不另写正文。本工具只是数据返回，不执行任何动作。完整本站schema仍须遵守；编号、篇幅、条目数量、来源和论证检查不能由接口格式保证替代。'}:m),
  tools:[{type:'function',function:{name:READING_TOOL,description:'返回本站核对的结构化解读数据，不执行工具动作。',strict:true,parameters:{...providerSchema(selectionSchema(prepared.context)),properties:{...providerSchema(selectionSchema(prepared.context)).properties,context_id:{type:'string',enum:[prepared.context.context_id]}}}}}],
  tool_choice:{type:'function',function:{name:READING_TOOL}}}};
}
export function parseStrictReadingResponse(packet,context){
 const fail=code=>({status:'transport_rejected',code,raw:JSON.stringify(packet)??'',result:null});
 if(!packet||typeof packet!=='object'||Array.isArray(packet)||!Array.isArray(packet.choices)||packet.choices.length!==1)return fail('invalid_response_envelope');
 const choice=packet.choices[0],message=choice?.message;
 if(choice.finish_reason!=='tool_calls')return fail('unexpected_finish_reason');
 if(!message||message.role!=='assistant'||(message.content!=null&&message.content!==''))return fail('unexpected_text_content');
 if(!Array.isArray(message.tool_calls)||message.tool_calls.length!==1)return fail('unexpected_tool_count');
 const tool=message.tool_calls[0];
 if(tool?.type!=='function'||tool.function?.name!==READING_TOOL||typeof tool.id!=='string'||!tool.id)return fail('unexpected_tool_identity');
 if(typeof tool.function.arguments!=='string')return fail('invalid_tool_arguments');
 const raw=tool.function.arguments;
 return {status:'complete_tool_reply',raw,provider_finish_reason:choice.finish_reason,tool_id:tool.id,
  result:parseOutputAnswer(raw,context,{completed:true})};
}

const toolErrors={invalid_response_envelope:'strict_invalid_envelope',unexpected_text_content:'strict_unexpected_text',
 unexpected_tool_count:'strict_tool_count',unexpected_tool_identity:'strict_tool_identity',invalid_tool_arguments:'strict_invalid_arguments'};
export async function receiveStrictReading(response,context,signal,{maxBytes=8*1024*1024}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw Error('Invalid response limit');
 const reader=response.body?.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
 let rawText='',bytes=0,bodyComplete=false,error=null,packet=null,abort;
 const aborted=signal?new Promise((_,reject)=>{abort=()=>reject(Error('aborted'));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}):null;
 try{
  if(!reader)throw Error('strict_read_error');
  while(true){const {value,done}=await (aborted?Promise.race([reader.read(),aborted]):reader.read());if(done)break;
   if(!(value instanceof Uint8Array))throw Error('strict_read_error');bytes+=value.byteLength;if(bytes>maxBytes)throw Error('strict_response_too_large');
   rawText+=decoder.decode(value,{stream:true});
  }
  rawText+=decoder.decode();bodyComplete=true;
  try{packet=JSON.parse(rawText);}catch{error='strict_invalid_json';}
 }catch(e){error=signal?.aborted?(signal.reason==='reading_timeout'?'request_timeout':'aborted'):e.message==='strict_response_too_large'?e.message:'strict_read_error';}
 finally{if(abort)signal.removeEventListener('abort',abort);if(error){try{Promise.resolve(reader?.cancel()).catch(()=>{});}catch{}}try{reader?.releaseLock();}catch{}}
 const parsed=packet&&!error?parseStrictReadingResponse(packet,context):null;
 if(parsed?.status==='transport_rejected')error=toolErrors[parsed.code]??null;
 const finish=packet?.choices?.[0]?.finish_reason;
 const completion={transport:'strict_tool',error,finishReason:['stop','length','content_filter','tool_calls','insufficient_system_resource'].includes(finish)?finish:finish==null?null:'other',
  bodyComplete,envelopeValid:parsed?.status==='complete_tool_reply'};
 return {rawText:parsed?.raw??rawText,usage:packet?.usage??null,completion,
  completed:bodyComplete&&!error&&completion.envelopeValid&&finish==='tool_calls'};
}
