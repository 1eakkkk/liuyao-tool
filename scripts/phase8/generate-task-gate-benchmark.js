// Authored Phase 8B.2A candidate labels. This materializes UTF-16 spans and
// frozen cast identities; it never classifies arbitrary user questions.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityHash } from '../../src/knowledge/query-plan-schema.js';
import { evaluateRules } from '../../src/rules/engine.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'knowledge/catalog/catalog.json'), 'utf8'));
const concept = new Map(catalog.concepts.map(x => [x.concept_id, x]));
const fixtureFiles = { p6: 'experiments/phase6/cases.json', p7: 'experiments/phase7/evaluation/cases.json' };
const fixtures = Object.fromEntries(Object.entries(fixtureFiles).map(([key, file]) =>
  [key, new Map(JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')).cases.map(x => [x.case_id, x.canonical]))]));
const C = (id, text, knowledge_use, context_use, additional = [], occurrence = 0) => ({ id, text, knowledge_use, context_use, additional, occurrence });
const E = (kind, text, concept_id = null) => ({ kind, text, concept_id });
const X = (term, candidate_concepts, reason = 'possible_typo') => ({ term, candidate_concepts, reason });
const family = (name, split, intent, fixture, cases) => ({ name, split, intent, fixture, cases });
// Only questions that explicitly name a present current-case relation receive a
// line/target reference. General concept questions intentionally remain empty.
const factReferences = {
  'tg-006': [{ rule_id: 'LINE-VOID-001', text: '本卦旬空' }],
  'tg-014': [{ rule_id: 'MONTH-COMBINE-001', text: '此卦月合' }],
  'tg-030': [{ rule_id: 'MOVE-RETREAT-001', text: '本卦退神' }],
  'tg-037': [{ rule_id: 'MONTH-COMBINE-001', text: '本卦月合' }],
  'tg-050': [{ rule_id: 'MOVE-RETREAT-001', text: '退神' }],
  'tg-054': [{ rule_id: 'MONTH-CLASH-001', text: '月建冲爻' }],
  'tg-059': [{ rule_id: 'YING-GENERATE-SHI-001', text: '本卦世爻和应爻的相生方向' }],
  'tg-038': [{ rule_id: 'HIDDEN-FLY-GENERATE-001', text: '飞神生伏神' }]
};

// Every user question and label below is authored. Helpers only fill mechanical
// facts (spans, fixture hashes, Rule IDs) and serialize a candidate JSON file.
const families = [
  family('task-number-vs-source', 'development', 'Current-cast numeric relation output contrasted with an explicit literary explanation.', 'p7:case-04', [
    { q: '从盘面读取世应所在爻位，输出“世位/应位”两个数字。', scope: 'case_specific', task: 'non_knowledge', req: [C('shi-ying','世应','not_required','case_specific')], ev: [E('operation','读取世应所在爻位'),E('exclusive_output','输出“世位/应位”两个数字')], out: ['string_only'], directives: [['format','“世位/应位”']], why: 'Read two cast positions; no literary explanation or distance computation.' },
    { q: '本卦世应的关系在古籍中如何表述？请给出处。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('shi-ying','世应','required','case_specific')], sel: ['shi-ying'], ev: [E('knowledge_request','古籍中如何表述'),E('knowledge_request','给出处')], why: 'Explicit current-case literature request with a reviewed r1 anchor.' },
    { q: '先列出盘中世应爻位，再说明古书怎样描述两者的关系。', scope: 'case_specific', task: 'mixed', req: [C('shi-ying','世应','required','case_specific')], sel: ['shi-ying'], ev: [E('operation','先列出盘中世应爻位'),E('knowledge_request','古书怎样描述两者的关系')], why: 'Compatible cast lookup and source interpretation.' },
    { q: '请只输出本卦世应的间隔值，古籍部分先不要引用。', scope: 'case_specific', task: 'non_knowledge', req: [C('shi-ying','世应','not_required','case_specific')], ev: [E('exclusive_output','只输出'),E('knowledge_prohibition','先不要引用')], out: ['number_only'], why: 'Explicit source refusal and exclusive numeric output.' }
  ]),
  family('cast-serialization', 'development', 'Cast serialization paired with a separately requested void-line explanation.', 'p7:case-03', [
    { q: '依爻位由下往上把本卦阴阳记作六个符号，连写成一行。', scope: 'case_specific', task: 'non_knowledge', ev: [E('operation','记作六个符号')], out: ['string_only'], directives: [['format','连写成一行']], why: 'The user asks for a cast serialization only.' },
    { q: '先写六位阴阳串，然后解释本卦旬空的文献含义。', scope: 'case_specific', task: 'mixed', req: [C('xunkong','旬空','required','case_specific')], sel: ['xunkong'], ev: [E('operation','先写六位阴阳串'),E('knowledge_request','解释本卦旬空的文献含义','xunkong')], why: 'Only the void-line clause needs Knowledge.' },
    { q: '请把本卦六爻依次转写成阴阳符号表，不要附术语释义。', scope: 'case_specific', task: 'non_knowledge', ev: [E('operation','转写成阴阳符号表'),E('exclusive_output','不要附术语释义')], out: ['string_only'], why: 'A transformation does not request literature.' },
    { q: '先转写本卦阴阳符号，再引用古籍里解释旬空这个术语的原句。', scope: 'mixed', task: 'mixed', req: [C('xunkong','旬空','required','theory')], sel: ['xunkong'], ev: [E('operation','先转写本卦阴阳符号'),E('knowledge_request','古籍里解释旬空这个术语的原句','xunkong')], why: 'Cast transformation and general term quotation occupy distinct scopes.' }
  ]),
  family('rewording-background', 'development', 'Restatement is distinguished from a separately requested interpretation and incidental labels.', 'p6:case-02', [
    { q: '请原样抄写这句待处理文字：“月合在盘上标在哪里？”不要回答引号里的问题。', scope: 'unknown', task: 'non_knowledge', ev: [E('operation','原样抄写'),E('exclusive_output','不要回答引号里的问题')], out: ['verbatim_only'], directives: [['verbatim','原样抄写']], why: 'Quoted concept is the object of transcription, not a requested topic.' },
    { q: '先照抄“月合在盘上标在哪里？”，然后另答：本卦月合的古籍条件是什么？', scope: 'case_specific', task: 'mixed', req: [C('month-combine','月合','required','case_specific',[],1)], sel: ['month-combine'], ev: [E('operation','先照抄'),E('knowledge_request','本卦月合的古籍条件是什么','month-combine')], why: 'The second clause independently requests literature; the quoted first clause is only copied.' },
    { q: '请把“日合见于旁注”改写成不超过十字的短句，不要解读它。', scope: 'unknown', task: 'non_knowledge', ev: [E('operation','改写成不超过十字的短句'),E('exclusive_output','不要解读它')], directives: [['brevity','不超过十字']], why: 'A quoted background label is only being edited.' },
    { q: '把“月合是一个标注”压缩成一句话；不要引用古籍，也不要回答术语问题。', scope: 'unknown', task: 'non_knowledge', ev: [E('operation','压缩成一句话'),E('knowledge_prohibition','不要引用古籍')], directives: [['brevity','一句话']], why: 'Standalone editing request with explicit no-literature constraint.' }
  ]),
  family('quotation-boundaries', 'development', 'Quote-only output and prediction bans remain separate from source retrieval.', 'p7:case-04', [
    { q: '请摘录古籍对月合的原句，不要展开解释。', no_case: true, scope: 'theory', task: 'knowledge_seeking', req: [C('month-combine','月合','required','theory')], sel: ['month-combine'], ev: [E('knowledge_request','摘录古籍对月合的原句','month-combine'),E('output_restriction','不要展开解释')], out: ['quote_only','no_explanation'], why: 'A source quotation needs Knowledge even without prose explanation.' },
    { q: '说明此卦月合的文献边界，但别推断吉凶。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('month-combine','月合','required','case_specific')], sel: ['month-combine'], ev: [E('knowledge_request','文献边界','month-combine'),E('output_restriction','别推断吉凶')], out: ['no_prediction'], why: 'Prediction prohibition does not bar reviewed literature.' },
    { q: '把此卦月合对应的典籍句和白话说明一起给我。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('month-combine','月合','required','case_specific')], sel: ['month-combine'], ev: [E('knowledge_request','典籍句和白话说明','month-combine')], why: 'Both source text and explanation seek Knowledge.' },
    { q: '不查典籍，判断盘里是否标了月合，只回是或否。', scope: 'case_specific', task: 'non_knowledge', req: [C('month-combine','月合','not_required','case_specific')], ev: [E('knowledge_prohibition','不查典籍'),E('operation','是否标了月合','month-combine'),E('exclusive_output','只回是或否')], out: ['boolean_only'], why: 'A yes/no cast fact is not literature retrieval.' }
  ]),
  family('bounded-topic-exclusions', 'development', 'Local exclusions and the two-topic cap on a cast with multiple reviewed relations.', 'p7:case-05', [
    { q: '分别说明这卦月破和日冲的出处，旬空暂且搁置。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('month-break','月破','required','case_specific'),C('day-clash','日冲','required','case_specific'),C('xunkong','旬空','excluded','case_specific')], sel: ['month-break','day-clash'], ev: [E('knowledge_request','说明'),E('concept_exclusion','旬空暂且搁置','xunkong')], why: 'A postposed exclusion leaves two positive topics; no comparison is requested.' },
    { q: '暂不谈月破，请给出本卦日冲与化进的典籍说明。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('month-break','月破','excluded','case_specific'),C('day-clash','日冲','required','case_specific'),C('advance','化进','required','case_specific')], sel: ['day-clash','advance'], ev: [E('concept_exclusion','暂不谈月破','month-break'),E('knowledge_request','典籍说明')], why: 'Prefixed exclusion must not count toward the positive topic cap.' },
    { q: '这次查日冲的文献；化进的话题留待下次。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('day-clash','日冲','required','case_specific'),C('advance','化进','excluded','case_specific')], sel: ['day-clash'], ev: [E('knowledge_request','查日冲的文献','day-clash'),E('concept_exclusion','化进的话题留待下次','advance')], why: 'A later topic is mentioned but explicitly deferred.' },
    { q: '本卦月破、化进、旬空的古籍解释请全部列出。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('month-break','月破','required','case_specific'),C('advance','化进','required','case_specific'),C('xunkong','旬空','required','case_specific')], status: 'needs_narrowing', excluded: { 'month-break':'too_many_requested_topics', advance:'too_many_requested_topics', xunkong:'too_many_requested_topics' }, ev: [E('knowledge_request','古籍解释')], why: 'Three positive topics exceed the fixed two-topic cap.' }
  ]),
  family('scope-vs-anchor', 'development', 'A missing current relation does not block an independently scoped theory question.', 'p7:case-01', [
    { q: '这卦若有月破，怎样根据文献解释该处？', scope: 'case_specific', task: 'knowledge_seeking', req: [C('month-break','月破','required','case_specific')], excluded: { 'month-break':'case_relation_not_present' }, ev: [E('knowledge_request','根据文献解释','month-break')], why: 'No month-break anchor exists in the chosen cast.' },
    { q: '先不分析这卦，月破作为术语在典籍中指什么？', scope: 'theory', task: 'knowledge_seeking', req: [C('month-break','月破','required','theory')], sel: ['month-break'], ev: [E('scope_cue','先不分析这卦'),E('knowledge_request','典籍中指什么','month-break')], why: 'Theory literature need not claim a current-case relation.' },
    { q: '请仅确认此卦有没有月破，只答是或否。', scope: 'case_specific', task: 'non_knowledge', req: [C('month-break','月破','not_required','case_specific')], ev: [E('operation','有没有月破','month-break'),E('exclusive_output','只答是或否')], out: ['boolean_only'], why: 'Presence is a program fact, even without a case anchor.' },
    { q: '我想知道这卦日冲在古籍中的适用边界。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('day-clash','日冲','required','case_specific')], sel: ['day-clash'], ev: [E('knowledge_request','古籍中的适用边界','day-clash')], why: 'A distinct present r1 hit has reviewed literature.' }
  ]),
  family('reviewed-admission', 'development', 'Named but source-checked concepts remain requestable and unselectable.', 'p7:case-01', [
    { q: '请为盘中变爻生回本爻的关系找可核对的古籍段落。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('return-relation','变爻生回本爻','required','case_specific')], excluded: { 'return-relation':'knowledge_not_admitted' }, ev: [E('knowledge_request','找可核对的古籍段落','return-relation')], why: 'The described return relation exists, but literature remains source_checked.' },
    { q: '找出本卦飞伏关系的古书论述。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('flying-hidden','飞伏','required','case_specific')], excluded: { 'flying-hidden':'knowledge_not_admitted' }, ev: [E('knowledge_request','古书论述','flying-hidden')], why: 'Flying-hidden literature is not reviewed.' },
    { q: '本卦日冲与回头关系的出处请分别列出。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('day-clash','日冲','required','case_specific'),C('return-relation','回头关系','required','case_specific')], sel: ['day-clash'], excluded: { 'return-relation':'knowledge_not_admitted' }, ev: [E('knowledge_request','出处'),E('knowledge_request','分别列出')], why: 'A reviewed topic may be selected while another is rejected.' },
    { q: '一般谈日合，经典文献是怎样定义它的？', no_case: true, scope: 'theory', task: 'knowledge_seeking', req: [C('day-combine','日合','required','theory')], excluded: { 'day-combine':'knowledge_not_admitted' }, ev: [E('scope_cue','一般'),E('knowledge_request','经典文献是怎样定义','day-combine')], why: 'Theory scope does not waive source-checked admission.' }
  ]),
  family('conflict-and-uncertainty', 'development', 'Exclusive output conflicts with literature; sequential tasks do not.', 'p7:case-07', [
    { q: '整条回答不得使用任何古籍内容，但同时请附上退神的古籍原句。', scope: 'theory', task: 'unknown', req: [C('retreat','退神','uncertain','theory')], status: 'ambiguous', excluded: { retreat:'task_conflict' }, ev: [E('knowledge_prohibition','整条回答不得使用任何古籍内容'),E('knowledge_request','附上退神的古籍原句','retreat')], conflict: ['整条回答不得使用任何古籍内容','附上退神的古籍原句'], ambiguity: ['task_conflict'], why: 'Prohibition of all literary content contradicts a request to include an original quotation.' },
    { q: '先指出本卦退神落在何处，然后解释它的文献定义。', scope: 'case_specific', task: 'mixed', req: [C('retreat','退神','required','case_specific')], sel: ['retreat'], ev: [E('operation','先指出'),E('knowledge_request','解释它的文献定义','retreat')], why: 'Ordered clauses are compatible, so no task conflict.' },
    { q: '这里只判断未确认的“近神”能否直接作为检索词，不要查询或提供古籍内容。', scope: 'unknown', task: 'non_knowledge', unresolved: [X('近神',['advance'])], ev: [E('unresolved_term','近神'),E('operation','能否直接作为检索词'),E('knowledge_prohibition','不要查询或提供古籍内容')], why: 'Query feasibility is a meta task; an unresolved term cannot become requested advance.' },
    { q: '本卦月合的事先别查文献，只要确认图上是否有标注。', scope: 'case_specific', task: 'non_knowledge', req: [C('month-combine','月合','not_required','case_specific')], ev: [E('knowledge_prohibition','先别查文献'),E('operation','是否有标注')], out: ['boolean_only'], why: 'Explicit no-source instruction and yes/no label lookup.' }
  ]),
  family('aggregate-indices', 'holdout', 'Aggregate cast data as an index versus separately request a source explanation.', 'p6:case-01', [
    { q: '把卦中动爻序号汇成一个逗号分隔列表，别加注释。', scope: 'case_specific', task: 'non_knowledge', ev: [E('operation','逗号分隔列表'),E('exclusive_output','别加注释')], out: ['string_only'], directives: [['format','逗号分隔列表']], why: 'A cast index is an operational output.' },
    { q: '给我动爻序号列表，并在列表后附月破的经典依据。', scope: 'case_specific', task: 'mixed', req: [C('month-break','月破','required','case_specific')], sel: ['month-break'], ev: [E('operation','动爻序号列表'),E('knowledge_request','月破的经典依据','month-break')], why: 'Literature is needed only for the independently requested relation.' },
    { q: '这卦旬空的爻一共有几条？结果只写数量。', scope: 'case_specific', task: 'non_knowledge', req: [C('xunkong','旬空','not_required','case_specific')], ev: [E('operation','一共有几条'),E('exclusive_output','只写数量')], out: ['number_only'], why: 'The arithmetic task does not call for a classical explanation.' },
    { q: '先数这卦的旬空爻数，再说明旬空一词在典籍中的定义。', scope: 'mixed', task: 'mixed', req: [C('xunkong','旬空','required','theory')], sel: ['xunkong'], ev: [E('operation','先数'),E('knowledge_request','典籍中的定义','xunkong')], why: 'The cast count and the general term definition occupy different scopes.' }
  ]),
  family('citation-metadata', 'holdout', 'Source citation or quotation contrasted with a present/absent label lookup.', 'p6:case-02', [
    { q: '为本卦月合做一张出处索引卡：抄原句，注明卷章页位；不要加自己的解释。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('month-combine','月合','required','case_specific')], sel: ['month-combine'], ev: [E('knowledge_request','出处索引卡'),E('output_restriction','不要加自己的解释')], out: ['no_explanation'], directives: [['format','抄原句，注明卷章页位']], why: 'The user requests traceable source text plus locator, not an answer limited to a quotation alone.' },
    { q: '查看本卦飞神生伏神的标记是否存在，只答有或没有。', scope: 'case_specific', task: 'non_knowledge', req: [C('flying-hidden','飞神生伏神','not_required','case_specific')], ev: [E('operation','标记是否存在','flying-hidden'),E('exclusive_output','只答有或没有')], out: ['boolean_only'], directives: [['format','有或没有']], why: 'A present Rule relation is checked as a program fact, without using literature.' },
    { q: '先确认本卦月建合爻的标记，再为这项关系补上文献所在的卷章。', scope: 'case_specific', task: 'mixed', req: [C('month-combine','月建合爻','required','case_specific')], sel: ['month-combine'], ev: [E('operation','确认本卦月建合爻的标记','month-combine'),E('knowledge_request','文献所在的卷章','month-combine')], why: 'The cast check and the source-locator request are compatible, independently executable tasks.' },
    { q: '不讨论本卦，月合相关原典的卷章出处是什么？', no_case: true, scope: 'theory', task: 'knowledge_seeking', req: [C('month-combine','月合','required','theory')], sel: ['month-combine'], ev: [E('scope_cue','不讨论本卦'),E('knowledge_request','原典的卷章出处','month-combine')], why: 'Theory citation need not use the present case anchor.' }
  ]),
  family('roman-index-output', 'holdout', 'Roman-numeral line indexing exposes exclusive versus sequential source requests.', 'p6:case-01', [
    { q: '整条回答只能包含一个罗马数字爻号，但还须附上本卦日冲的古籍解说。', scope: 'case_specific', task: 'unknown', req: [C('day-clash','日冲','uncertain','case_specific')], status: 'ambiguous', excluded: { 'day-clash':'task_conflict' }, ev: [E('exclusive_output','整条回答只能包含一个罗马数字爻号'),E('knowledge_request','本卦日冲的古籍解说','day-clash')], conflict: ['整条回答只能包含一个罗马数字爻号','本卦日冲的古籍解说'], ambiguity: ['task_conflict'], directives: [['format','罗马数字爻号']], why: 'Global single-token output clashes with a literary explanation.' },
    { q: '日冲爻先写罗马数字序号，随后说明文献中这项关系的含义。', scope: 'case_specific', task: 'mixed', req: [C('day-clash','日冲','required','case_specific')], sel: ['day-clash'], ev: [E('operation','先写罗马数字序号'),E('knowledge_request','说明文献中这项关系的含义','day-clash')], why: 'The sequential wording permits two outputs.' },
    { q: '仅将日冲爻位换算成罗马数字，不附说明。', scope: 'case_specific', task: 'non_knowledge', req: [C('day-clash','日冲','not_required','case_specific')], ev: [E('operation','换算成罗马数字','day-clash'),E('exclusive_output','仅将'),E('output_restriction','不附说明')], out: ['no_explanation'], directives: [['format','罗马数字']], why: 'A representation conversion does not use literature; the explanation ban is an output policy.' },
    { q: '从传统文献看，日沖一词的用法是什么？不需要代入卦盘。', scope: 'theory', task: 'knowledge_seeking', req: [C('day-clash','日沖','required','theory')], sel: ['day-clash'], ev: [E('knowledge_request','传统文献'),E('scope_cue','不需要代入卦盘')], why: 'A theoretical alias request does not need a cast anchor.' }
  ]),
  family('background-citation', 'holdout', 'Incidental source-checked annotation contrasted with an explicit request about it.', 'p6:case-02', [
    { q: '飞伏写在旁注里；请解释本卦月合所用的古籍文字。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('month-combine','月合','required','case_specific')], sel: ['month-combine'], ev: [E('knowledge_request','月合所用的古籍文字','month-combine')], why: 'The flying-hidden annotation is background, not requested.' },
    { q: '旁边虽标飞伏，现在请把卦名按字数归类输出。', scope: 'case_specific', task: 'non_knowledge', ev: [E('operation','按字数归类输出')], why: 'A background label cannot create requested intent.' },
    { q: '请给飞伏标注找文献来历；月合只是版面上的另一个标签。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('flying-hidden','飞伏','required','case_specific')], excluded: { 'flying-hidden':'knowledge_not_admitted' }, ev: [E('knowledge_request','飞伏标注找文献来历','flying-hidden')], why: 'Explicit source-checked request remains unadmitted; month-combine is incidental.' },
    { q: '并列引用飞伏与月合的典籍句，但不要据此论吉凶。', no_case: true, scope: 'theory', task: 'knowledge_seeking', req: [C('flying-hidden','飞伏','required','theory'),C('month-combine','月合','required','theory')], sel: ['month-combine'], excluded: { 'flying-hidden':'knowledge_not_admitted' }, ev: [E('knowledge_request','并列引用'),E('output_restriction','不要据此论吉凶')], out: ['no_prediction'], why: 'Two general quotations need no current cast; source-checked admission still blocks flying-hidden.' }
  ]),
  family('context-alternation', 'holdout', 'A concept may be requested in theory, in the cast, or in both contexts.', 'p6:case-04', [
    { q: '退神在术语书中通常是什么意思？', no_case: true, scope: 'theory', task: 'knowledge_seeking', req: [C('retreat','退神','required','theory')], sel: ['retreat'], ev: [E('scope_cue','术语书中'),E('knowledge_request','通常是什么意思','retreat')], why: 'A general definition needs reviewed literature but no case anchor.' },
    { q: '在这卦里，退神的文献条件能否对应到当前爻？', scope: 'case_specific', task: 'knowledge_seeking', req: [C('retreat','退神','required','case_specific')], sel: ['retreat'], ev: [E('scope_cue','在这卦里'),E('knowledge_request','文献条件','retreat')], why: 'Case-specific selection requires the present retreat Rule.' },
    { q: '一般化退如何定义？本卦退神又该怎样引用该定义？', scope: 'mixed', task: 'knowledge_seeking', req: [C('retreat','化退','required','mixed',['退神'])], sel: ['retreat'], ev: [E('scope_cue','一般'),E('scope_cue','本卦'),E('knowledge_request','如何定义','retreat'),E('knowledge_request','怎样引用该定义','retreat')], why: 'A catalog alias and canonical term jointly ask for theory and current-case contexts.' },
    { q: '这卦退神位于哪一爻？只写爻号。', scope: 'case_specific', task: 'non_knowledge', req: [C('retreat','退神','not_required','case_specific')], ev: [E('operation','位于哪一爻','retreat'),E('exclusive_output','只写爻号')], out: ['number_only'], why: 'Line-location output is a program fact.' }
  ]),
  family('deferred-clauses', 'holdout', 'Postposed and prefixed exclusions remain local to their named concepts.', 'p6:case-07', [
    { q: '为本卦做一个出处清单：日沖列入；月破只列为待办，不提供文献。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('day-clash','日沖','required','case_specific'),C('month-break','月破','excluded','case_specific')], sel: ['day-clash'], ev: [E('knowledge_request','出处清单'),E('concept_exclusion','月破只列为待办，不提供文献','month-break')], why: 'Checklist includes day-clash source only; month-break is explicitly deferred.' },
    { q: '请填这份本卦文献清单的两栏：月建冲爻的关系、盘中空亡标注；日冲只写“未处理”。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('month-break','月建冲爻','required','case_specific'),C('xunkong','空亡','required','case_specific'),C('day-clash','日冲','excluded','case_specific')], sel: ['month-break','xunkong'], ev: [E('knowledge_request','请填这份本卦文献清单'),E('concept_exclusion','日冲只写“未处理”','day-clash')], why: 'Two independently grounded relation descriptions are included without asserting the same line; day-clash is excluded.' },
    { q: '请在本卦的关系备忘里解释月建冲爻的文献条件；空亡这一栏留白。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('month-break','月建冲爻','required','case_specific'),C('xunkong','空亡','excluded','case_specific')], sel: ['month-break'], ev: [E('knowledge_request','文献条件'),E('concept_exclusion','空亡这一栏留白','xunkong')], why: 'A relation phrase is requested, while the alias topic is explicitly withheld.' },
    { q: '请制作本卦的三条出处卡片，分别对应日沖、月建冲爻、空亡，三条都要原典依据。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('day-clash','日沖','required','case_specific'),C('month-break','月建冲爻','required','case_specific'),C('xunkong','空亡','required','case_specific')], status: 'needs_narrowing', excluded: { 'day-clash':'too_many_requested_topics', 'month-break':'too_many_requested_topics', xunkong:'too_many_requested_topics' }, ev: [E('knowledge_request','三条都要原典依据')], why: 'Three positive relation topics exceed the two-topic cap.' }
  ]),
  family('absent-vs-source-checked', 'holdout', 'Missing current anchor and source-checked literature are distinct rejection reasons.', 'p6:case-08', [
    { q: '有份本卦注释写着“月建与爻相合”；请为这项说法找古籍出处。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('month-combine','月建与爻相合','required','case_specific')], excluded: { 'month-combine':'case_relation_not_present' }, ev: [E('knowledge_request','找古籍出处','month-combine')], why: 'A quoted annotation asserts a current month-combine relation, but the cast lacks its r1 anchor.' },
    { q: '术语卡片只介绍月建与爻相合的古籍定义，不判断任何具体卦。', no_case: true, scope: 'theory', task: 'knowledge_seeking', req: [C('month-combine','月建与爻相合','required','theory')], sel: ['month-combine'], ev: [E('knowledge_request','古籍定义','month-combine'),E('scope_cue','不判断任何具体卦')], why: 'A general relation definition needs no current-case anchor.' },
    { q: '本卦世爻和应爻的相生方向已标出；请给这类方向关系配一条古籍出处。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('shi-ying','世爻和应爻的相生方向','required','case_specific')], sel: ['shi-ying'], ev: [E('knowledge_request','古籍出处','shi-ying')], why: 'The fixture has a shi-ying generation anchor and reviewed source.' },
    { q: '有人说这卦还有日辰与爻相合的标注；请给这项关系配原典。', scope: 'case_specific', task: 'knowledge_seeking', req: [C('day-combine','日辰与爻相合','required','case_specific')], excluded: { 'day-combine':'case_relation_not_present' }, ev: [E('knowledge_request','配原典','day-combine')], why: 'Absent day-combine anchor blocks selection before source admission.' }
  ]),
  family('uncertain-terms-and-comparison', 'holdout', 'Typos and theory/case ambiguity are separate from a safe two-topic comparison.', 'p6:case-03', [
    { q: '我在一份术语草稿里看到“月建和”，可能写错了；只标记待核对的词，不要查出处。', scope: 'unknown', task: 'non_knowledge', unresolved: [X('月建和',['month-combine'])], ev: [E('unresolved_term','月建和'),E('operation','标记待核对的词'),E('knowledge_prohibition','不要查出处')], why: 'The draft term remains unresolved and no literature is requested.' },
    { q: '不结合当前卦，只比较月建与爻相合、日辰冲爻在古籍条件上的不同。', no_case: true, scope: 'theory', task: 'knowledge_seeking', req: [C('month-combine','月建与爻相合','required','theory'),C('day-clash','日辰冲爻','required','theory')], sel: ['month-combine','day-clash'], ev: [E('scope_cue','不结合当前卦'),E('knowledge_request','古籍条件')], relation: 'comparison', why: 'Explicitly general comparison of two grounded relation descriptions.' },
    { q: '将此卦的月合、日冲标注原样抄出，不作解读。', scope: 'case_specific', task: 'non_knowledge', req: [C('month-combine','月合','not_required','case_specific'),C('day-clash','日冲','not_required','case_specific')], ev: [E('operation','原样抄出'),E('exclusive_output','不作解读')], out: ['verbatim_only'], why: 'Two named cast labels are needed for a transformation, not for literature.' },
    { q: '词表审核：拼写待核的“旬孔”能否直接进入检索索引？只给审核结论，不引用古籍。', scope: 'unknown', task: 'non_knowledge', unresolved: [X('旬孔',['xunkong'])], ev: [E('unresolved_term','旬孔'),E('operation','能否直接进入检索索引'),E('knowledge_prohibition','不引用古籍')], directives: [['brevity','只给审核结论']], why: 'Index eligibility is a meta operation; the spelling remains unresolved and no literature content is requested.' }
  ])
];

function findSpan(question, text, occurrence = 0) {
  let start = -1;
  for (let i = 0; i <= occurrence; i++) start = question.indexOf(text, start + 1);
  if (start < 0) throw new Error(`Authored span not found: ${JSON.stringify(text)} in ${question}`);
  return { start, end: start + text.length, matched_text: text };
}
function label(question, spec) {
  const requests = (spec.req ?? []).map(x => {
    const term = concept.get(x.id);
    if (!term) throw new Error(`Unknown authored concept: ${x.id}`);
    const basis = x.knowledge_use === 'excluded' ? 'explicit_exclusion' : x.text === term.label ? 'exact_term' :
      term.aliases.includes(x.text) ? 'catalog_alias' : 'deterministic_phrase';
    return { concept_id: x.id, basis, question_span: findSpan(question, x.text, x.occurrence),
      additional_question_spans: x.additional.map(t => findSpan(question, t, t === x.text ? 1 : 0)),
      knowledge_use: x.knowledge_use, context_use: x.context_use };
  });
  const evidence = (spec.ev ?? []).map(x => ({ kind: x.kind, question_span: findSpan(question, x.text), concept_id: x.concept_id }));
  const conflict = spec.conflict ?? [];
  const conflictSpans = conflict.map(x => findSpan(question, x));
  const prohibited = evidence.some(x => x.kind === 'knowledge_prohibition');
  const selected = spec.sel ?? [];
  const knowledgeAllowed = !prohibited && !conflict.length &&
    ['knowledge_seeking','mixed'].includes(spec.task) && requests.some(x => x.knowledge_use === 'required');
  const status = spec.status ?? (selected.length ? 'ready' : spec.task === 'unknown' ? 'ambiguous' : 'zero_knowledge');
  const excluded = requests.filter(x => !selected.includes(x.concept_id)).map(x => ({ concept_id: x.concept_id,
    reason: spec.excluded?.[x.concept_id] ?? ({ excluded:'explicit_exclusion', not_required:'task_not_required', uncertain:'uncertain_use' })[x.knowledge_use] }));
  if (excluded.some(x => !x.reason)) throw new Error(`Missing authored exclusion reason: ${question}`);
  return { question_scope: spec.scope, knowledge_task: spec.task, status, requested_concepts: requests,
    selected_concepts: selected, excluded_concepts: excluded,
    constraints: { exclude_concepts: requests.filter(x => x.knowledge_use === 'excluded').map(x => x.concept_id),
      knowledge_allowed: knowledgeAllowed, knowledge_prohibited: prohibited,
      narrow_request: spec.task === 'non_knowledge', output_constraints: spec.out ?? [] },
    unresolved_mentions: (spec.unresolved ?? []).map(x => ({ text: x.term, question_span: findSpan(question, x.term),
      reason: x.reason, candidate_concepts: x.candidate_concepts })),
    task_evidence: evidence, task_conflict: { present: Boolean(conflict.length), evidence_spans: conflictSpans },
    ambiguity_reasons: spec.ambiguity ?? [], request_relation: spec.relation ?? 'none',
    output_directives: (spec.directives ?? []).map(([kind, text]) => ({ kind, text, question_span: findSpan(question, text) })),
    retrieval_query: status === 'ready' ? { concepts: selected, limit: 4, verification_status: 'reviewed' } : null };
}

export function buildTaskGateCandidate() {
  const semantic_families = [], cases = [];
  for (let f = 0; f < families.length; f++) {
    const group = families[f], family_id = `tgf-${String(f + 1).padStart(2,'0')}`;
    semantic_families.push({ family_id, split: group.split, intent_template: group.intent });
    for (let n = 0; n < group.cases.length; n++) {
      const spec = group.cases[n], case_id = `tg-${String(f * 4 + n + 1).padStart(3,'0')}`;
      const [source, fixtureId] = group.fixture.split(':');
      const canonical = spec.no_case ? null : fixtures[source].get(fixtureId);
      if (!spec.no_case && !canonical) throw new Error(`Missing authored fixture: ${group.fixture}`);
      const hits = canonical ? evaluateRules(canonical).hits : [];
      const primary = label(spec.q, spec);
      const alternatives = (spec.alternatives ?? []).map(override => label(spec.q, { ...spec, ...override, alternatives: [] }));
      const question_fact_references = (factReferences[case_id] ?? []).map(reference => {
        const matching = hits.filter(hit => hit.rule_id === reference.rule_id);
        if (matching.length !== 1) throw new Error(`Fact reference must have one Rule hit: ${case_id}`);
        const hit = matching[0];
        return { rule_id: hit.rule_id, target: { line: hit.target.line, component: hit.target.component,
          related_line: hit.target.related_line ?? null }, question_span: findSpan(spec.q, reference.text) };
      });
      cases.push({ case_id, split: group.split, family_id,
        coverage_tags: [...new Set([group.name, spec.task, spec.scope, ...(spec.req ?? []).map(x => x.knowledge_use),
          ...(spec.ambiguity ?? []), ...(spec.out ?? [])])],
        user_question: spec.q, context_mode: spec.no_case ? 'no_case' : 'case',
        case_fixture: canonical ? { file: fixtureFiles[source], case_id: fixtureId, canonical_hash: identityHash(canonical) } : null,
        available_rule_ids: [...new Set(hits.map(x => x.rule_id))].sort(),
        catalog_revision: catalog.revision, corpus_version: 'phase8a-month-combine-hardening-1',
        corpus_hash: 'sha256:aa3522aebb7e4ad18b54e144ea26499323e55838f79856fdd59f2c53baadcda3',
        primary_expected_plan: primary, acceptable_plans: alternatives, question_fact_references,
        ambiguity_status: alternatives.length ? 'genuinely_ambiguous' : 'clear', rationale: spec.why });
    }
  }
  return { version: 'query-planning-task-gate-candidate-1.2', candidate_status: 'candidate_not_frozen',
    baseline_commit: '6e894077386d98dc1f38fab72ab095297055e3db', semantic_families, cases };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.length !== 3 || process.argv[2] !== '--write') throw new Error('Usage: generate-task-gate-benchmark.js --write');
  const target = path.join(root, 'experiments/phase8/query-planning-task-gate/benchmark.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(buildTaskGateCandidate(), null, 2)}\n`);
  console.log(target);
}
