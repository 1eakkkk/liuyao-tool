// Exposed development replay, not blind acceptance or a forecast accuracy test.
import {createHash} from 'node:crypto';
import {buildCanonicalCast} from '../../src/core/normalize.js';
import {lineFromSum} from '../../src/core/physics.js';
import {JIAZI60} from '../../src/core/constants.js';
import {createReadingSession,prepareReadingTurn,READING_PROMPT} from '../../src/ai/output/session.js';
import {readingRequestBody} from '../../src/ai/output/client.js';
import {stableOutputJson} from '../../src/ai/output/contract.js';
export const PRICE_CHECKED='2026-10-01';
export const planHash=value=>createHash('sha256').update(stableOutputJson(value)).digest('hex');
export const reviewCriteria=Object.freeze([
  {id:'facts',requirement:'具体爻位、动静、六亲、五行和关系方向与当前程序数据一致；引用须覆盖该段所述属性。'},
  {id:'scope',requirement:'回答当前目标，不把私人免费娱乐换成盈利、人气或商业成功，不假装了解未说明的游戏机制。'},
  {id:'support',requirement:'类象解释与现实事实分开；普通练习、心态、试用建议不当作盘面支持。生克影响须结合对象角色，不从关系名称直接判现实好坏。'},
  {id:'priority',requirement:'说明主要取用、备选角度和相关因素主次；若取法无法确定且影响方向，坦然保留不确定性。'},
  {id:'direction',requirement:'方向标签与正文及因素一致；mixed 须说明具体牵制和不能确定主次的理由，不因存在两面因素自动采用，不要求固定吉凶。'},
]);
const specs=[
  {id:'game-rank',sums:[8,9,7,9,9,8],question:'我的王者万象棋段位能打到王者段位吗？',names:['泽风大过','地山谦']},
  {id:'private-project',sums:[7,8,7,8,8,9],question:'我做了一个小的模拟双色球、大乐透等彩票摇奖机器的网站，用 Codex 写代码，部署在 GitHub 和 Cloudflare，免费，仅供自己和周围好友娱乐。作为这样一个小项目怎么样？',names:['山火贲','地火明夷']},
];
export async function prepareJudgmentPlan(){
  const cases=[];
  for(const spec of specs){
    const now=new Date('2026-10-01T22:00:00+08:00');
    const canonical=buildCanonicalCast({lines:spec.sums.map(lineFromSum),source:'manual',question:spec.question,
      createdAt:now.getTime(),castId:`judgment-development-${spec.id}`,calendar:{now,day:JIAZI60.find(d=>d.label==='戊申'),
        ymh:{yearLabel:'丙午',monthLabel:'丁酉',hourLabel:'癸亥'},dateText:'公历：2026年10月1日'}});
    if(canonical.hexagram.primary.name!==spec.names[0]||canonical.hexagram.changed.name!==spec.names[1])throw Error('Feedback recipe mismatch');
    const prepared=await prepareReadingTurn(createReadingSession(canonical,{style:'brief',custom:''}),spec.question);
    const body=readingRequestBody(prepared);
    // A byte per token plus envelope allowance is deliberately conservative.
    const inputAllowance=Buffer.byteLength(JSON.stringify(body.messages),'utf8')+4096;
    cases.push({id:spec.id,canonical,question:spec.question,context_id:prepared.context.context_id,body,input_allowance:inputAllowance,
      reserve_cny:(inputAllowance*2+body.max_tokens*8)/1e6});
  }
  return {version:'production-judgment-development-1',reading_prompt:READING_PROMPT,price_checked:PRICE_CHECKED,
    price_source:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',peak_cny_per_million:{input:2,output:8},
    provenance:'User-exposed questions and sums reconstructed with a fixed supplied calendar; manual replay, not a new physical toss. Short response preference; otherwise full production messages, SSE, model, schema and 8192-token cap.',
    review_criteria:reviewCriteria,review_values:['pass','fail','uncertain'],scope:'Two exposed development replies; no old-versus-new randomized comparison, no blind or forecast acceptance.',
    stop_policy:'At most two paid calls; stop after transport, usage, completion or mechanical failure. Preserve failures. No retries or automatic repairs.',
    reserve_cny:cases.reduce((n,c)=>n+c.reserve_cny,0),cases};
}
