// Recognize only the exact published program-generated insufficient answer.
// Do not reclassify arbitrary AI prose or change saved history.
export function isUnavailableHistoryReply(record,turn){
 return record.readingMode==='structured'&&turn.role==='assistant'&&String(turn.text??'').startsWith('当前依据不足，不能据此判断目标能否达成。\n\n当前取法覆盖不足，不能据此判断目标能否达成。未核对的象意假设不参与主判断。');
}
