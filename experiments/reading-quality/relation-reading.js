import {prepareCompactReadingTurn} from '../../src/ai/output/session.js';
import {buildElementReference} from '../../src/ai/output/relation-reference.js';
// Candidate shared request only; not selected by the production page.
export async function prepareRelationReadingTurn(session,question){
 const prepared=await prepareCompactReadingTurn(session,question);
 const payload=JSON.parse(prepared.messages[1].content);
 payload.element_reference=buildElementReference(prepared.context);
 prepared.messages[1].content=JSON.stringify(payload);
 prepared.messages[0].content+='\n基础五行核对：element_reference 由本轮程序事实推导，source_fact_ids 仍是原证据编号，不是额外独立支持。先区分基础相生相克与在当前卦中的有效作用；金生水不能写成金不生水。若认为相生在本卦无效或不利，应交代具体限制及对应依据，不能否认基础关系。factors 优先解释取用、作用和最终取舍，事实展示由程序引用列表负责，避免重复整串爻属性。需要重述属性时，本段每项属性均须有对应引用，不能借正文、其他段或前轮引用补齐。取象或一般建议不冒充程序事实。';
 return prepared;
}
