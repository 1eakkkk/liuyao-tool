import {test,expect} from 'vitest';
import {isUnavailableHistoryReply} from '../../src/ui/history-scope.js';
test('only the exact structured program limitation is disclosed, without modifying saved text',()=>{
 const text='当前依据不足，不能据此判断目标能否达成。\n\n当前取法覆盖不足，不能据此判断目标能否达成。未核对的象意假设不参与主判断。\n\n一般建议：原文<img src=x>';
 const record={readingMode:'structured'},turn={role:'assistant',text},saved=JSON.stringify(turn);
 expect(isUnavailableHistoryReply(record,turn)).toBe(true);expect(JSON.stringify(turn)).toBe(saved);
 expect(isUnavailableHistoryReply({readingMode:'legacy'},turn)).toBe(false);
 expect(isUnavailableHistoryReply(record,{role:'user',text})).toBe(false);
 expect(isUnavailableHistoryReply(record,{role:'assistant',text:'当前依据不足，不过也有支持因素。'})).toBe(false);
});
