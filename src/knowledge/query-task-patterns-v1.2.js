// General linguistic cues for the offline task gate. Never keyed by fixture or case ID.
export const TASK_PATTERN_VERSION_12 = 'task-gate-patterns-1.0';

export const CONCEPT_PHRASES_12 = Object.freeze([
  { text: '变爻生回本爻', concept_id: 'return-relation', why: 'Changed line generating its original line.' },
  { text: '月建冲', concept_id: 'month-break', why: 'Explicit monthly branch clash.' },
  { text: '日辰冲', concept_id: 'day-clash', why: 'Explicit daily branch clash.' },
  { text: '月建来冲这个爻', concept_id: 'month-break', why: 'Monthly branch clashes with the line.' },
  { text: '月建和这个爻相合', concept_id: 'month-combine', why: 'Monthly branch combines with the line.' }
]);

export const UNRESOLVED_PHRASES_12 = Object.freeze([
  { text: '近神', reason: 'possible_typo', candidate_concepts: ['advance'], why: 'Unconfirmed spelling is not a catalog alias.' },
  { text: '旬孔', reason: 'possible_typo', candidate_concepts: ['xunkong'], why: 'Unconfirmed spelling is not a catalog alias.' }
]);

// These are task-language cues, not assertions about a cast or about literature.
export const LITERATURE_CUES_12 = Object.freeze([
  /(?:古籍|古书|典籍|经典文献|文献)(?:中如何表述|怎样描述|里解释|中指什么|是怎样定义|中的适用边界|含义|条件|边界|解释|说明|论述|原句|段落)/u,
  /(?:摘录|引用|附上|查|找|给出|解释|说明).{0,16}(?:古籍|古书|典籍|经典文献|文献|出处|原句)/u,
  /(?:出处|典籍句|文献定义|文献边界|文献含义|文献条件|古籍解释|古书论述)/u
]);

export const PROHIBITION_CUES_12 = Object.freeze([
  // A negated use/retrieval directive is an explicit gate, independent of concept detection.
  /(?:整条回答|全文|整段)?(?:不得|不要|不许|不查|先别查|先不要|先别)(?:使用|查询|引用|提供|查)?(?:任何)?(?:古籍|典籍|古书|文献)(?:内容)?/u,
  // Elliptical omission of the object is still a prohibition when the clause names literature.
  /(?:古籍|典籍|古书|文献)(?:部分|内容)?(?:先)?(?:不要|别)(?:引用|查|用)/u,
  /先不要引用/u,
  /不要查询或提供古籍内容/u
]);

export const OPERATION_CUES_12 = Object.freeze([
  /(?:读取|列出|转写|写|抄写|照抄|改写|压缩|确认|判断|指出|标了|标注|间隔值|检索词|符号)/u
]);
