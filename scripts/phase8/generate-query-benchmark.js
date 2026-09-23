// Authoring helper for 72 hand-written candidate labels. This is not a query planner.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityHash } from '../../src/knowledge/query-plan-schema.js';
import { evaluateRules } from '../../src/rules/engine.js';

const root = new URL('../../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const source = { p6: 'experiments/phase6/cases.json', p7: 'experiments/phase7/evaluation/cases.json' };
const request = (concept_id, text, basis = 'exact_term', additional = []) => ({ concept_id, text, basis, additional });
const row = (user_question, expected_question_scope, requests, expected_selected_concepts, coverage_tags, rationale, extra = {}) => ({
  user_question, expected_question_scope, requests, expected_selected_concepts, coverage_tags, rationale, ...extra
});
const family = (number, split, fixture, rows) => ({ number, split, fixture, rows });
const r = request, c = row, f = family;

// Families 01-16 are development. Families 17-24 are compositional holdout,
// using Phase 6 casts only; no historical Phase 7.3B question is copied.
const families = [
  f(1, 'development', 'p7:case-03', [
    c('这一爻月破，古书说的“破”究竟指哪种关系？', 'case_specific', [r('month-break', '月破')], ['month-break'], ['explicit_single_topic', 'case_specific'], '明确问当前月破关系的文献含义。'),
    c('这里被月建冲到，能查一下月破的说法吗？', 'case_specific', [r('month-break', '月破')], ['month-break'], ['explicit_single_topic', 'colloquial_chinese'], '口语描述伴随明确术语，只选被问及的月破。', { facts: [['MONTH-CLASH-001', 1, '被月建冲到']] }),
    c('本卦还有旬空，但我只看月破的文献边界。', 'case_specific', [r('xunkong', '旬空', 'explicit_exclusion'), r('month-break', '月破')], ['month-break'], ['explicit_exclusion', 'topic_only'], '明确只看月破，旬空虽出现也被排除。', { exclude: ['xunkong'], output: ['topic_only'] })
  ]),
  f(2, 'development', 'p7:case-04', [
    c('这个月合在原书中怎么命名？', 'case_specific', [r('month-combine', '月合')], ['month-combine'], ['explicit_single_topic'], '当前存在月合且问题明确要求文献命名。'),
    c('我只想了解此爻与月建相合的文献语境，不要判断吉凶。', 'case_specific', [r('month-combine', '与月建相合', 'deterministic_phrase')], ['month-combine'], ['colloquial_chinese', 'output_constraint'], '相合指向月合；不论吉凶不排除文献解释。', { output: ['no_prediction'], facts: [['MONTH-COMBINE-001', 6, '与月建相合']] }),
    c('别从月合直接推成功；请说明“有用”这句话的边界。', 'case_specific', [r('month-combine', '月合')], ['month-combine'], ['absolute_wording', 'interpretation_boundary'], '问原文评价词边界，不请求成功断语。')
  ]),
  f(3, 'development', 'p7:case-05', [
    c('这个静爻的日冲在文献里怎样理解？', 'case_specific', [r('day-clash', '日冲')], ['day-clash'], ['explicit_single_topic'], '明确询问当前日冲。', { facts: [['DAY-CLASH-001', 6, '静爻的日冲']] }),
    c('日辰冲了这爻，我想看冲的适用条件。', 'case_specific', [r('day-clash', '日辰冲', 'deterministic_phrase')], ['day-clash'], ['colloquial_chinese'], '日辰冲是受控日冲主题的确定表达。'),
    c('只解释日沖的术语，不替我断成败。', 'case_specific', [r('day-clash', '日沖', 'catalog_alias')], ['day-clash'], ['catalog_alias', 'output_constraint'], '繁体别名与不得断成败的限制可以并存。', { output: ['no_prediction', 'topic_only'] })
  ]),
  f(4, 'development', 'p7:case-06', [
    c('这一动爻化进，进神指什么？', 'case_specific', [r('advance', '化进', 'catalog_alias')], ['advance'], ['explicit_single_topic'], '当前化进命中且明确提问。', { facts: [['MOVE-ADVANCE-001', 5, '动爻化进']] }),
    c('这里的進神能不能只作局部关系解释？', 'case_specific', [r('advance', '進神', 'catalog_alias')], ['advance'], ['catalog_alias'], '繁体术语仍指向同一受控概念。'),
    c('动爻往前进那种标注，文献有怎么界定吗？', 'case_specific', [], [], ['colloquial_chinese', 'ambiguous_query'], '标注未明；不能由 Rule hit 反推意图。', { status: 'ambiguous', ambiguity: 'multiple_plausible', unresolved: [['往前进那种标注', 'insufficient_context', ['advance']]], alternatives: [{ requests: [r('advance', '往前进那种标注', 'deterministic_phrase')], selected: ['advance'], status: 'ready', unresolved: [] }] })
  ]),
  f(5, 'development', 'p7:case-07', [
    c('这爻化退，退神是否一定代表坏结果？', 'case_specific', [r('retreat', '化退', 'catalog_alias')], ['retreat'], ['absolute_wording'], '绝对化措辞请求退神解释边界。', { facts: [['MOVE-RETREAT-001', 2, '这爻化退']] }),
    c('我问退神这个名称的意思，别直接断凶。', 'case_specific', [r('retreat', '退神')], ['retreat'], ['explicit_single_topic', 'output_constraint'], '不得断凶不等于拒绝知识。', { output: ['no_prediction'] }),
    c('化退这一条先单独讲，别顺带讲月合。', 'case_specific', [r('retreat', '化退', 'catalog_alias'), r('month-combine', '月合', 'explicit_exclusion')], ['retreat'], ['explicit_exclusion', 'topic_only'], '排除月合；当前卦虽也有月合，不应注入。', { exclude: ['month-combine'], output: ['topic_only'] })
  ]),
  f(6, 'development', 'p7:case-08', [
    c('这个爻旬空，空亡在文献里指什么？', 'case_specific', [r('xunkong', '旬空')], ['xunkong'], ['explicit_single_topic'], '当前旬空已有 reviewed 单元。', { facts: [['LINE-VOID-001', 6, '这个爻旬空']] }),
    c('这一爻落在日旬缺的地支里，就等于它完全不存在吗？', 'case_specific', [r('xunkong', '落在日旬缺的地支里', 'deterministic_phrase')], ['xunkong'], ['colloquial_chinese', 'absolute_wording'], '以日旬所缺地支描述旬空，不把标注等同爻不存在。', { facts: [['LINE-VOID-001', 6, '落在日旬缺的地支里']] }),
    c('我只要旬空的定义，不要推断应期。', 'case_specific', [r('xunkong', '旬空')], ['xunkong'], ['topic_only', 'output_constraint'], '输出范围受限但文献定义仍相关。', { output: ['topic_only', 'no_prediction'] })
  ]),
  f(7, 'development', 'p7:case-01', [
    c('世应谁生谁，请解释这条方向。', 'case_specific', [r('shi-ying', '世应')], ['shi-ying'], ['explicit_single_topic'], '当前应生世命中且 reviewed 单元直接关联。'),
    c('世應关系可不可以直接当合作承诺？', 'case_specific', [r('shi-ying', '世應', 'catalog_alias')], ['shi-ying'], ['catalog_alias', 'absolute_wording'], '繁体别名及结果边界共同出现。'),
    c('只列出本卦世爻、应爻分别在第几爻，以及谁生谁；不要解释，也不要引用文献。', 'unknown', [r('shi-ying', '世爻', 'deterministic_phrase')], [], ['narrow_factual_request', 'zero_knowledge_request'], '只要程序位置和关系，不要文献。', { narrow: true, exclusions: [['shi-ying', 'narrow_request']], output: ['no_explanation'] })
  ]),
  f(8, 'development', null, [
    c('六爻术语里的月合一般是什么意思？', 'theory', [r('month-combine', '月合')], ['month-combine'], ['theory_question', 'no_case'], '纯理论问题无卦盘也允许 reviewed 概念。'),
    c('不针对任何卦，日旬里缺的两支在六爻中叫什么？', 'theory', [r('xunkong', '日旬里缺的两支', 'deterministic_phrase')], ['xunkong'], ['theory_question', 'colloquial_chinese'], '无卦例的旬空命名询问。'),
    c('我先学术语：世應在六爻里是什么意思？', 'theory', [r('shi-ying', '世應', 'catalog_alias')], ['shi-ying'], ['theory_question', 'catalog_alias'], '理论问题不伪造当前世应锚点。')
  ]),
  f(9, 'development', 'p7:case-09', [
    c('请只报本卦和变卦名称。', 'unknown', [], [], ['narrow_factual_request', 'zero_knowledge_request', 'rule_present_but_unasked'], '窄事实请求不需要文献，即使卦里有旬空。', { narrow: true, output: ['names_only'] }),
    c('只列动爻位置，别解释。', 'unknown', [], [], ['narrow_factual_request', 'zero_knowledge_request'], '动爻位置来自 Canonical，不需要知识。', { narrow: true, output: ['line_positions_only', 'no_explanation'] }),
    c('不用引用古书，告诉我卦名就行。', 'unknown', [], [], ['narrow_factual_request', 'zero_knowledge_request'], '明确拒绝引文与狭窄卦名请求。', { narrow: true, output: ['names_only', 'no_explanation'] })
  ]),
  f(10, 'development', 'p7:case-10', [
    c('这个卦怎么看？', 'unknown', [], [], ['broad_question', 'zero_knowledge_request'], '泛问不授权注入所有当前 Rule hits。'),
    c('帮我全面聊一聊。', 'unknown', [], [], ['broad_question', 'zero_knowledge_request'], '没有受控文献主题。'),
    c('我想看一下整体情况，先别引用文献。', 'unknown', [], [], ['broad_question', 'zero_knowledge_request'], '泛问并明确拒绝引文。', { knowledgeAllowed: false })
  ]),
  f(11, 'development', 'p7:case-03', [
    c('初爻月破、五爻旬空；两个标注分别是什么意思？', 'case_specific', [r('month-break', '月破'), r('xunkong', '旬空')], ['month-break', 'xunkong'], ['multi_topic_two', 'case_specific'], '不同爻位，关系均有 reviewed 文献。', { facts: [['MONTH-CLASH-001', 1, '初爻月破'], ['LINE-VOID-001', 5, '五爻旬空']] }),
    c('先解释旬空，再解释月破，别合成吉凶结论。', 'theory', [r('xunkong', '旬空'), r('month-break', '月破')], ['xunkong', 'month-break'], ['multi_topic_two', 'theory_question'], '只问术语定义，没有当前卦断言。', { output: ['no_prediction'] }),
    c('月破和空亡可以同时讨论吗？', 'theory', [r('month-break', '月破', 'explicit_comparison'), r('xunkong', '空亡', 'explicit_comparison')], ['month-break', 'xunkong'], ['multi_topic_two', 'theory_question'], '概念比较，不声称同一爻双命中。')
  ]),
  f(12, 'development', 'p7:case-05', [
    c('不是问月破，我问的是日冲。', 'case_specific', [r('month-break', '月破', 'explicit_exclusion'), r('day-clash', '日冲')], ['day-clash'], ['negation', 'explicit_exclusion'], '月破被明确排除，日冲当前命中。', { exclude: ['month-break'] }),
    c('先别说月破，日辰冲的原文有什么限制？', 'case_specific', [r('month-break', '月破', 'explicit_exclusion'), r('day-clash', '日辰冲', 'deterministic_phrase')], ['day-clash'], ['negative_exclusion', 'explicit_exclusion'], '否定月破、肯定日冲的复合句。', { exclude: ['month-break'] }),
    c('除了月破之外，只看这一爻日沖。', 'case_specific', [r('month-break', '月破', 'explicit_exclusion'), r('day-clash', '日沖', 'catalog_alias')], ['day-clash'], ['explicit_exclusion', 'catalog_alias'], '繁体日冲与排除范围应同时遵守。', { exclude: ['month-break'], output: ['topic_only'] })
  ]),
  f(13, 'development', 'p7:case-04', [
    c('本卦日合在古书里怎么解释？', 'case_specific', [r('day-combine', '日合')], [], ['source_checked_only', 'case_specific'], '日合命中但对应知识仍 source_checked。', { exclusions: [['day-combine', 'knowledge_not_admitted']] }),
    c('先别管月合，我要查日辰合的文献。', 'case_specific', [r('month-combine', '月合', 'explicit_exclusion'), r('day-combine', '日辰合', 'deterministic_phrase')], [], ['source_checked_only', 'explicit_exclusion'], '月合排除且日合文献未准入。', { exclude: ['month-combine'], exclusions: [['day-combine', 'knowledge_not_admitted']] }),
    c('没有当前卦也想知道日合的文献定义。', 'theory', [r('day-combine', '日合')], [], ['source_checked_only', 'theory_question', 'no_case'], '理论主题可识别，但未 reviewed。', { exclusions: [['day-combine', 'knowledge_not_admitted']], fixture: null })
  ]),
  f(14, 'development', 'p7:case-11', [
    c('动爻变化后反过来生原爻，文献如何称呼这种关系？', 'case_specific', [r('return-relation', '反过来生原爻', 'deterministic_phrase')], [], ['source_checked_only', 'colloquial_chinese'], '描述回头生方向；文献尚未 reviewed。', { exclusions: [['return-relation', 'knowledge_not_admitted']], facts: [['MOVE-RETURN-GENERATE-001', 6, '反过来生原爻']] }),
    c('回頭克在六爻理论中怎么讲？', 'theory', [r('return-relation', '回頭克', 'deterministic_phrase')], [], ['source_checked_only', 'theory_question'], '理论识别不需要当前命中；未 reviewed。', { exclusions: [['return-relation', 'knowledge_not_admitted']] }),
    c('把五爻回头克的来去方向说清楚，不引未审文献。', 'case_specific', [r('return-relation', '回头克', 'deterministic_phrase')], [], ['source_checked_only', 'output_constraint'], '五爻命中回头克，文献未准入。', { exclusions: [['return-relation', 'knowledge_not_admitted']], facts: [['MOVE-RETURN-CONTROL-001', 5, '五爻回头克']] })
  ]),
  f(15, 'development', 'p7:case-12', [
    c('飞神压制下方的伏神，古籍是否说明这种关系？', 'case_specific', [r('flying-hidden', '飞神压制下方的伏神', 'deterministic_phrase')], [], ['source_checked_only', 'colloquial_chinese'], '描述飞神克伏神，知识仍未 reviewed。', { exclusions: [['flying-hidden', 'knowledge_not_admitted']], facts: [['HIDDEN-FLY-CONTROL-001', 1, '飞神压制下方的伏神']] }),
    c('一般说的飛伏是什么，不看具体卦？', 'theory', [r('flying-hidden', '飛伏', 'catalog_alias')], [], ['source_checked_only', 'theory_question'], '纯理论识别可成功，检索仍为零。', { exclusions: [['flying-hidden', 'knowledge_not_admitted']] }),
    c('只说伏神与飞神的方向，不要塞古籍。', 'case_specific', [r('flying-hidden', '伏神与飞神', 'deterministic_phrase')], [], ['source_checked_only', 'narrow_factual_request'], '明确不用古籍，当前关系仍可由 Rules 解释。', { narrow: true, exclusions: [['flying-hidden', 'narrow_request']] })
  ]),
  f(16, 'development', 'p7:case-07', [
    c('一般化退是什么意思；这卦的化退又该怎么引用？', 'mixed', [r('retreat', '一般化退', 'deterministic_phrase', ['这卦的化退'])], ['retreat'], ['mixed_question', 'case_specific'], '一般概念和当前卦两次提及均记录。'),
    c('先讲月合的通常含义，再看本卦月合。', 'mixed', [r('month-combine', '月合的通常含义', 'deterministic_phrase', ['本卦月合'])], ['month-combine'], ['mixed_question', 'theory_question'], '一般含义与当前卦两次提及，检索一次。'),
    c('退神概念我知道了，这次只查本卦化退的适用边界。', 'case_specific', [r('retreat', '化退', 'catalog_alias')], ['retreat'], ['case_specific', 'topic_only'], '只锚定本卦化退。', { output: ['topic_only'] })
  ]),
  f(17, 'holdout', 'p6:case-01', [
    c('初爻受月建冲，四爻受日辰冲；请分别核对各自的文献边界。', 'case_specific', [r('month-break', '月建冲', 'deterministic_phrase'), r('day-clash', '日辰冲', 'deterministic_phrase')], ['month-break', 'day-clash'], ['multi_topic_two', 'comparison_wording'], '两个不同爻位及时间来源。', { facts: [['MONTH-CLASH-001', 1, '初爻受月建冲'], ['DAY-CLASH-001', 4, '四爻受日辰冲']] }),
    c('四爻日冲、初爻月破；古籍各自的适用范围是什么？', 'case_specific', [r('day-clash', '日冲'), r('month-break', '月破')], ['day-clash', 'month-break'], ['multi_topic_two', 'comparison_wording'], '不同爻位的文献边界，非同一爻双命中。', { facts: [['DAY-CLASH-001', 4, '四爻日冲'], ['MONTH-CLASH-001', 1, '初爻月破']] }),
    c('四爻受日辰冲是程序标注；请给相关古籍出处，并区分程序事实与文献解释。', 'case_specific', [r('day-clash', '日辰冲', 'deterministic_phrase')], ['day-clash'], ['case_specific', 'interpretation_boundary'], '以日冲问出处，同时明确程序事实和文献解释的层级。', { facts: [['DAY-CLASH-001', 4, '四爻受日辰冲']] })
  ]),
  f(18, 'holdout', 'p6:case-04', [
    c('🧭上爻化退与三爻旬空同时出现时，能把两条文献合成一个必然判断吗？', 'case_specific', [r('retreat', '化退', 'catalog_alias'), r('xunkong', '旬空')], ['retreat', 'xunkong'], ['multi_topic_two', 'utf16_supplementary', 'interpretation_boundary'], '核对证据层级，不把不同关系合为必然结论。', { facts: [['MOVE-RETREAT-001', 6, '上爻化退'], ['LINE-VOID-001', 3, '三爻旬空']], output: ['no_prediction'] }),
    c('本卦只讨论退神与旬空，不讨论月破。', 'case_specific', [r('retreat', '退神'), r('xunkong', '旬空'), r('month-break', '月破', 'explicit_exclusion')], ['retreat', 'xunkong'], ['multi_topic_two', 'explicit_exclusion'], '退神和旬空有不同爻位的真实锚点；月破显式排除。', { exclude: ['month-break'] }),
    c('这卦化退和旬空谁更严重？不要给两者打分。', 'case_specific', [r('retreat', '化退', 'explicit_comparison'), r('xunkong', '旬空', 'explicit_comparison')], ['retreat', 'xunkong'], ['comparison_wording', 'output_constraint'], '比较请求可检索两个边界，但不得给预测权重。', { output: ['no_prediction'] })
  ]),
  f(19, 'holdout', 'p6:case-01', [
    c('我这个爻有月合吗？若有请查原书。', 'case_specific', [r('month-combine', '月合')], [], ['relation_absent_from_case', 'case_specific'], '当前无 MONTH-COMBINE，不能用原文暗示存在。', { exclusions: [['month-combine', 'case_relation_not_present']] }),
    c('请先核对本卦有没有月建合爻；如果没有，就不要引用月合文献。', 'case_specific', [r('month-combine', '月建合爻', 'deterministic_phrase')], [], ['relation_absent_from_case', 'colloquial_chinese'], '条件式请求，当前无月合；避免虚构引用。', { exclusions: [['month-combine', 'case_relation_not_present']] }),
    c('不参照此卦，只核对古书把“月建合爻”命名为什么；不要推断成败。', 'theory', [r('month-combine', '月建合爻', 'deterministic_phrase')], ['month-combine'], ['theory_question', 'interpretation_boundary'], '理论命名任务，与当前月合缺席无关。', { output: ['no_prediction'] })
  ]),
  f(20, 'holdout', null, [
    c('日合与月合在文献里有什么区别？', 'theory', [r('day-combine', '日合', 'explicit_comparison'), r('month-combine', '月合', 'explicit_comparison')], ['month-combine'], ['theory_question', 'source_checked_only', 'comparison_wording'], '两个术语可识别，但只有月合 reviewed。', { exclusions: [['day-combine', 'knowledge_not_admitted']] }),
    c('不看具体卦：回头克和进神的概念分别是什么？', 'theory', [r('return-relation', '回头克', 'deterministic_phrase'), r('advance', '进神')], ['advance'], ['theory_question', 'source_checked_only'], '回头关系未准入、进神已 reviewed。', { exclusions: [['return-relation', 'knowledge_not_admitted']] }),
    c('飞伏与旬空两种说法都想查出处。', 'theory', [r('flying-hidden', '飞伏'), r('xunkong', '旬空')], ['xunkong'], ['theory_question', 'source_checked_only'], '飞伏仍 source_checked，旬空可检索。', { exclusions: [['flying-hidden', 'knowledge_not_admitted']] })
  ]),
  f(21, 'holdout', 'p6:case-01', [
    c('请把月破、旬空、化进三项文献都列出来。', 'case_specific', [r('month-break', '月破'), r('xunkong', '旬空'), r('advance', '化进', 'catalog_alias')], [], ['multi_topic_over_two', 'needs_narrowing'], '三个独立主题超出上限。', { status: 'needs_narrowing', exclusions: [['month-break', 'too_many_requested_topics'], ['xunkong', 'too_many_requested_topics'], ['advance', 'too_many_requested_topics']] }),
    c('只讨论月破和化进；旬空先别说。', 'case_specific', [r('month-break', '月破'), r('advance', '化进', 'catalog_alias'), r('xunkong', '旬空', 'explicit_exclusion')], ['month-break', 'advance'], ['multi_topic_two', 'explicit_exclusion'], '两个正向主题，旬空显式排除。', { exclude: ['xunkong'], output: ['topic_only'] }),
    c('月破、旬空、化进哪个最要紧？三个都要文献。', 'case_specific', [r('month-break', '月破', 'explicit_comparison'), r('xunkong', '旬空', 'explicit_comparison'), r('advance', '化进', 'catalog_alias')], [], ['multi_topic_over_two', 'comparison_wording'], '三个明确主题，需要缩窄；不作权重判定。', { status: 'needs_narrowing', exclusions: [['month-break', 'too_many_requested_topics'], ['xunkong', 'too_many_requested_topics'], ['advance', 'too_many_requested_topics']] })
  ]),
  f(22, 'holdout', 'p6:case-07', [
    c('🔍请核对本卦三爻空亡的文献边界，只讨论术语是否涉及应期。', 'case_specific', [r('xunkong', '空亡', 'catalog_alias')], ['xunkong'], ['utf16_supplementary', 'interpretation_boundary'], '指定三爻，问文献是否覆盖应期。', { facts: [['LINE-VOID-001', 3, '三爻空亡']] }),
    c('三爻和五爻都旬空；同一段文献该引用一次，还是按两个爻位重复引用？', 'case_specific', [r('xunkong', '旬空')], ['xunkong'], ['case_specific', 'interpretation_boundary'], '两个真实命中共用一项知识，考查检索去重和事实分位。', { facts: [['LINE-VOID-001', 3, '三爻和五爻都旬空'], ['LINE-VOID-001', 5, '三爻和五爻都旬空']] }),
    c('六爻中“空”这个简称一定就是旬空吗？', 'theory', [r('xunkong', '旬空')], ['xunkong'], ['theory_question', 'typo_shorthand'], '明确旬空作为主题；单字空是否等同属于回答边界。')
  ]),
  f(23, 'holdout', 'p6:case-02', [
    c('请按原问题文字重述我的提问，不展开术数解释。', 'unknown', [], [], ['narrow_factual_request', 'zero_knowledge_request'], '窄转述请求，无文献主题。', { narrow: true, output: ['no_explanation'] }),
    c('世爻和应爻的位置编号相差多少？只给数字，不解释含义。', 'unknown', [r('shi-ying', '世爻和应爻', 'deterministic_phrase')], [], ['narrow_factual_request', 'zero_knowledge_request'], '要求对已知位置编号做简单计算，不检索文献。', { narrow: true, exclusions: [['shi-ying', 'narrow_request']] }),
    c('虽有日合标注，请把六爻阴阳从初爻到上爻拼成一个字符串，不解释。', 'unknown', [], [], ['narrow_factual_request', 'rule_present_but_unasked'], '日合仅作背景；对 Canonical 阴阳做格式转换。', { narrow: true, facts: [['DAY-COMBINE-001', 6, '日合标注']] })
  ]),
  f(24, 'holdout', null, [
    c('明天上海会下雨吗？', 'unknown', [], [], ['unrelated_question', 'zero_knowledge_request'], '无六爻知识检索意图。'),
    c('卦的知识是指算法还是古籍？', 'unknown', [], [], ['unrelated_question', 'zero_knowledge_request'], '未指向受控主题。'),
    c('“近神”可能是笔误；它和退神的定义有什么区别？', 'theory', [r('retreat', '退神')], ['retreat'], ['typo_shorthand', 'comparison_wording', 'theory_question'], '退神明确；近神只能作为待确认纠错候选。', { ambiguity: 'multiple_plausible', output: ['no_prediction'], unresolved: [['近神', 'possible_typo', ['advance']]], alternatives: [{ requests: [r('advance', '近神', 'deterministic_phrase'), r('retreat', '退神')], selected: ['advance', 'retreat'], unresolved: [] }] })
  ])
];

const familyIntents = ["current month-break literature boundary", "current month-combine naming and scope", "current day-clash literature", "current advance terminology", "current retreat terminology", "current xunkong interpretation", "shi-ying relation explanation or factual restriction", "no-case terminology definitions", "names and moving-line factual-only outputs", "broad non-topic requests", "month-break and xunkong independent definitions", "day-clash preference with month-break excluded", "day-combine source-checked admission", "return-relation source-checked admission", "flying-hidden source-checked admission", "mixed theory and current relation", "different-line month-break and day-clash boundary comparison", "different-line retreat and xunkong boundary comparison", "absent month-combine conditional query", "partial reviewed plus source-checked theory", "three-topic cap and explicit narrowing", "void timing, multi-hit dedupe and shorthand", "narrow canonical transcription, arithmetic and formatting", "unrelated topics and possible typo"];

function makeCase(group, item, n) {
  const split = group.split, fixture = Object.hasOwn(item, 'fixture') ? item.fixture : group.fixture;
  const ref = fixture ? (() => {
    const [key, id] = fixture.split(':');
    const canonical = read(source[key]).cases.find(c => c.case_id === id)?.canonical;
    if (!canonical) throw Error(`Missing authored case fixture: ${fixture}`);
    return { file: source[key], case_id: id, canonical_hash: identityHash(canonical), canonical };
  })() : null;
  const span = text => {
    const start = item.user_question.indexOf(text);
    if (start < 0 || item.user_question.indexOf(text, start + text.length) >= 0) throw Error(`Ambiguous authored phrase in ${n}: ${text}`);
    return { start, end: start + text.length, matched_text: text };
  };
  const requestsFor = requests => requests.map(x => {
    const start = item.user_question.indexOf(x.text);
    if (start < 0 || item.user_question.indexOf(x.text, start + x.text.length) >= 0) throw Error(`Ambiguous authored phrase in ${n}: ${x.text}`);
    return { concept_id: x.concept_id, basis: x.basis,
      question_span: span(x.text), additional_question_spans: x.additional.map(span) };
  });
  const planFor = (config, base = item) => {
    const requests = requestsFor(config.requests ?? base.requests);
    const selected = config.selected ?? base.expected_selected_concepts;
    const explicit = requests.filter(x => x.basis === 'explicit_exclusion').map(x => x.concept_id);
    const excluded = [...explicit.map(concept_id => ({ concept_id, reason: 'explicit_exclusion' })),
      ...(config.exclusions ?? base.exclusions ?? []).map(([concept_id, reason]) => ({ concept_id, reason }))];
    const unresolved = (config.unresolved ?? base.unresolved ?? []).map(([text, reason, candidate_concepts]) =>
      ({ text, reason, candidate_concepts, question_span: span(text) }));
    return { question_scope: config.scope ?? base.expected_question_scope,
      status: config.status ?? base.status ?? (selected.length ? 'ready' : 'zero_knowledge'),
      requested_concepts: requests, selected_concepts: selected, excluded_concepts: excluded,
      constraints: { exclude_concepts: explicit, knowledge_allowed: config.knowledgeAllowed ?? base.knowledgeAllowed ?? !(config.narrow ?? base.narrow ?? false),
        narrow_request: config.narrow ?? base.narrow ?? false, output_constraints: config.output ?? base.output ?? [] }, unresolved_mentions: unresolved };
  };
  const hits = ref ? evaluateRules(ref.canonical).hits : [];
  const question_fact_references = (item.facts ?? []).map(([rule_id, line, text]) => {
    const hit = hits.find(h => h.rule_id === rule_id && h.target.line === line);
    if (!hit) throw Error(`Authored fact absent in ${n}: ${rule_id} line ${line}`);
    return { rule_id, target: { line: hit.target.line, component: hit.target.component, related_line: hit.target.related_line ?? null }, question_span: span(text) };
  });
  return {
    case_id: `qp-${String(n).padStart(3, '0')}`, split, family_id: `family-${String(group.number).padStart(2, '0')}`,
    coverage_tags: item.coverage_tags, user_question: item.user_question, context_mode: ref ? 'case' : 'no_case',
    case_fixture: ref ? { file: ref.file, case_id: ref.case_id, canonical_hash: ref.canonical_hash } : null,
    available_rule_ids: [...new Set(hits.map(h => h.rule_id))].sort(),
    catalog_revision: 2, corpus_version: 'phase8a-month-combine-hardening-1',
    corpus_hash: 'sha256:aa3522aebb7e4ad18b54e144ea26499323e55838f79856fdd59f2c53baadcda3',
    primary_expected_plan: planFor(item), acceptable_plans: (item.alternatives ?? []).map(alt => planFor(alt)),
    question_fact_references,
    rationale: item.rationale, ambiguity_status: item.ambiguity ?? 'clear'
  };
}

export function buildBenchmarkCandidate() {
  if (families.length !== 24 || families.some(g => g.rows.length !== 3)) throw Error('Exactly 24 authored families of three required');
  const cases = families.flatMap((g, i) => g.rows.map((item, j) => makeCase(g, item, i * 3 + j + 1)));
  return { version: 'query-planning-candidate-1.1', candidate_status: 'candidate_not_frozen',
    baseline_commit: '93497094f70687d9329d3a55ba12980525e013ce',
    semantic_families: families.map(g => ({ family_id: `family-${String(g.number).padStart(2, '0')}`,
      split: g.split, intent_template: familyIntents[g.number - 1] })), cases };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = buildBenchmarkCandidate();
  const destination = new URL('../../experiments/phase8/query-planning/benchmark.json', import.meta.url);
  fs.writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${result.cases.length} benchmark candidates to ${destination.pathname}`);
}
