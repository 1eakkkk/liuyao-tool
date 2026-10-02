// Compact alternative instructions for offline study only; not used by the website.
import {prepareJudgmentPlan,planHash} from './plan.js';
import {buildOutputMessages} from '../../src/ai/output/prompt.js';
import {createReadingSession,prepareReadingTurn} from '../../src/ai/output/session.js';
export const CANDIDATE_GUIDANCE=`本实验只调整论证写法，不能改动输入事实、引用或输出协议。
先固定当前问题的实际目标与所选主要取用；若只能列备选且无法确定主取，明确说明这个限制，不默认mixed。父母或官鬼等六亲的角色是解释假设，不是现实确认。
每段先选本段实际需要的引用，再写最小必要事实。六亲引用不能代替地支、五行、动静或变爻六亲；规则只提供其标注与已列来源属性，不覆盖其他属性。没有本段引用支持的属性直接省略，不补齐整串纳甲名称。
每组关系采用一个明确的作用对象和取象角色。若官鬼被当作障碍，其受制为何有利或不利必须与正文和因素保持一致；不要正文说未必不利、因素却把同一关系直接标作阻碍。不同作用或取法须说明条件，不能同时套用两套角色而不协调。
主要因素与次要因素的取舍用当前依据解释；一般练习、复盘或产品建议仅放正文的独立一般建议，不列为盘面conditional因素。没有真实盘面支持时不造一个支持因素来平衡。
不知道游戏机制就不给机制相关建议，不声称英雄池、队友、晋升方式或长期累积规则已知。不要从生克推出现实竞争强、投入被消耗、项目已在原型期；这些未提供现实不得写成确定状态，免责声明不能抵消正文断言。
最后核对direction与已说明的主次：mixed必须有具体牵制且解释为何不能比较主次；资料或取法不足用unclear。可偏有利或偏不利，不预设两条问题的方向。`;
export async function prepareJudgmentCandidate(){
  const base=await prepareJudgmentPlan(),plan=structuredClone(base);
  plan.version='compact-judgment-offline-candidate-1';plan.base_plan_hash=planHash(base);
  plan.source_reading_prompt=base.reading_prompt;plan.reading_prompt='compact-judgment-candidate-1';
  plan.provenance='Alternative compact system instructions; exact full production4 user input is retained only to compare the instruction hypothesis. This is not the production4 request or a deployed session.';
  plan.stop_policy='Preparation only: zero network calls, no credentials, no reservation and no paid executor. Any future live plan must be separately frozen and reviewed.';
  plan.production=false;plan.live_execution_available=false;plan.budget_reserved=false;plan.network_calls=0;
  plan.scope='Offline compact alternative after two exposed production4 failures; no model replies, paid executor, promotion or quality claim.';
  for(const c of plan.cases){
    const p=await prepareReadingTurn(createReadingSession(c.canonical,{style:'brief',custom:''}),c.question);
    const common=buildOutputMessages(p.context)[0].content;
    c.body.messages[0].content=common+'\n一般解读answer目标300–400字，事实核对仍保持简短，不凑字。\n'+CANDIDATE_GUIDANCE;
    c.input_allowance=Buffer.byteLength(JSON.stringify(c.body.messages))+4096;
    c.reserve_cny=(c.input_allowance*2+c.body.max_tokens*8)/1e6;
  }
  plan.reserve_cny=plan.cases.reduce((n,c)=>n+c.reserve_cny,0);
  return plan;
}
