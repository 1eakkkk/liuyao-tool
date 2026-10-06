// Store only bounded transport diagnostics, never provider bodies or credentials.
const errors=new Set(['aborted','request_timeout','sse_invalid_utf8','sse_invalid_chunk','sse_malformed_event','sse_after_done',
 'sse_conflicting_finish_reason','sse_event_too_large','sse_stream_too_large','sse_stream_error',
 'strict_invalid_envelope','strict_unexpected_text','strict_tool_count','strict_tool_identity','strict_invalid_arguments','strict_invalid_json','strict_response_too_large','strict_read_error']);
const finishes=new Set(['stop','length','content_filter','tool_calls','insufficient_system_resource','other']);
export function normalizeCompletion(value){
 if(value==null)return null;
 if(value?.transport==='strict_tool'){
  if(typeof value.bodyComplete!=='boolean'||typeof value.envelopeValid!=='boolean'||
   !(value.error===null||errors.has(value.error))||!(value.finishReason===null||finishes.has(value.finishReason))||
   Object.keys(value).some(k=>!['transport','error','finishReason','bodyComplete','envelopeValid'].includes(k)))throw Error('传输完成记录不兼容');
  return {transport:'strict_tool',error:value.error,finishReason:value.finishReason,bodyComplete:value.bodyComplete,envelopeValid:value.envelopeValid};
 }
 if(typeof value!=='object'||Array.isArray(value)||typeof value.sawDone!=='boolean'||
  !(value.error===null||errors.has(value.error))||!(value.finishReason===null||finishes.has(value.finishReason))||
  Object.keys(value).some(k=>!['error','finishReason','sawDone'].includes(k)))throw Error('传输完成记录不兼容');
 return {error:value.error,finishReason:value.finishReason,sawDone:value.sawDone};
}
export function completionFromStream(parsed,signal){
 return normalizeCompletion({error:signal?.aborted&&signal.reason==='reading_timeout'?'request_timeout':parsed.error??null,
  finishReason:parsed.finishReason==null?null:finishes.has(parsed.finishReason)?parsed.finishReason:'other',sawDone:parsed.sawDone===true});
}
export function completionIssue(completion){
 if(!completion)return null;
 if(completion.error)return completion.error;
 if(completion.finishReason==='length')return 'response_token_limit';
 if(completion.finishReason==='content_filter')return 'response_filtered';
 if(completion.finishReason==='insufficient_system_resource')return 'provider_interrupted';
 if(completion.transport==='strict_tool'){
  if(!completion.bodyComplete)return 'strict_read_error';
  if(completion.finishReason!=='tool_calls')return 'unexpected_finish_reason';
  if(!completion.envelopeValid)return 'strict_invalid_envelope';
  return null;
 }
 if(!completion.sawDone)return 'stream_not_finished';
 if(completion.finishReason==null)return 'stream_missing_finish_reason';
 if(completion.finishReason!=='stop')return 'unexpected_finish_reason';
 return null;
}
