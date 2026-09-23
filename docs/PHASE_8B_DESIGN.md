# Phase 8B.0A：Query Planner contract 与 benchmark candidate

状态：**Phase 8B.0C 修订候选，等待人工终审；尚未冻结，也未实现 Query Planner。** 基线为 `93497094f70687d9329d3a55ba12980525e013ce` / `phase8/query-planning`。本阶段只涉及离线契约、r1 映射、候选题、校验和测试。不接检索编排、Structured 1.2 或生产入口。

## 三层主题与职责

| 层 | 含义 | 不能代替 |
| --- | --- | --- |
| `requested_concepts` | 问题明确涉及的受控术语；包含被显式否定的提及，并标出 `explicit_exclusion` | 当前卦是否真有此关系 |
| `available_concepts` | 当前 Rule hits 经版本化映射得到的主题、Rule ID 与爻位；内部主题也可记录以供审计 | 用户想问的内容 |
| `selected_concepts` | 有正向意图、合法 scope／当前锚点、未排除且有 reviewed 文献关联的主题 | 吉凶或预测判断 |

Rule hit 是当前卦的可用主题，不是用户意图；语料准入是另一步。Planner 不选用神、不评分、不修改 Canonical／Rules／KnowledgeUnit，不判断预测结果、不比较古籍权威。`question.topic` 继续为 null。

闭合 Schema 见 [query-plan-schema.js](../src/knowledge/query-plan-schema.js)。`question_scope` 为 `case_specific | theory | mixed | unknown`；这里的 scope 描述**文献查询的范围**，因此只要求卦名、爻位或历法字段的请求可记为 `unknown`，尽管用户提到了“本卦”。`requested_concepts[].question_span` 采用 **JavaScript UTF-16 code-unit** offset，校验 `question.slice(start,end) === matched_text`；不能与知识片段的 Unicode code-point span 混用。`selection_reasons[].uses` 分开记录 `theory_context` 与 `case_relation`，后者携带真实 Rule 锚点。`input_identity` 记录问题、Canonical、Rule Result 哈希及 r1、mapping、catalog、corpus 版本。没有 numeric confidence。

`status` 为 `ready | zero_knowledge | needs_narrowing | ambiguous | invalid`。只有 `ready` 允许 `retrieval_query`；其他状态均要求 `selected_concepts=[]` 和 `retrieval_query=null`，后续编排须**跳过 `retrieve()`**。`ready` 可以保留局部 `unresolved_mentions`，前提是已选主题本身安全；`ambiguous` 表示歧义阻止任何安全检索；`zero_knowledge` 表示此请求不需要可准入的文献，不拿它代替消歧。`unresolved_mentions` 记录原词、UTF-16 span、封闭原因及 catalog 内候选概念，不等于 requested，也不允许 Rule hit 反推 intent。没有 numeric confidence。`limit:0` 不是意图表达。窄请求用 `constraints.knowledge_allowed=false/narrow_request=true`，而“不要判断吉凶”只限制输出，不等于不准引用知识。明确否定主题写入 `exclude_concepts`，不得被选。正向请求超过两个主题则 `needs_narrowing`，不静默挑两个、不做 numeric rank；两个主题按问题首次出现位置及 concept ID 稳定排序。

理论问题可不依赖当前 Rule hit，但只选 reviewed 文献，且无当前卦 relation anchor。当前卦问题必须有对应真实命中和同一 Rule ID 所关联的 reviewed 单元；只有术语没有命中时记录 `case_relation_not_present`。术语被识别但语料仅 `source_checked` 时记录 `knowledge_not_admitted`。内部辅助主题不得成为顶层 selected concept。

## r1 映射与准入

[rule-concept-map.json](../knowledge/catalog/rule-concept-map.json) 是独立于正式 corpus 的**侧车映射**，不修改 `catalog.json` 或 10 个 KnowledgeUnit，也不参与 corpus hash。25 条 r1 Rule ID 恰好覆盖一次，所有 concept 必须在现有 catalog 中。它只说明主题可用性，不生成规则或文献。

| 映射族 | Rule 数 | 用户可问 | 当前文献状态 |
| --- | ---: | --- | --- |
| 旬空、日冲、化进、化退、月破、月合 | 各 1 | 是 | 各有 reviewed 单元 |
| 世应方向 | 5 | 是 | 仅世生应／应生世与 reviewed 单元直接关联；其余 3 种方向不能借“世应”总称冒充文献覆盖 |
| 日合 | 1 | 是 | 仅 source_checked |
| 回头生／克 | 2 | 是 | 仅 source_checked |
| 飞伏五种方向／比和 | 5 | 是 | 仅 source_checked，且现有单元仅关联其中两种 Rule ID |
| 动爻 | 1 | 作为内部 `moving-static` | 不单独触发知识 |
| 月令旺相休囚死 | 5 | 作为内部 `temporal-scope` | 不单独触发知识 |

`relation-direction`、`interpretation-boundary` 也留作解释和检索辅助元数据，不作为当前顶层用户意图。现有检索器仅做确定性过滤；它的别名匹配不是自然语言分类。新增的疑似错字与口语表达只存在于候选 benchmark 标注中，**没有改 catalog alias**。

## 候选评测集

[benchmark.json](../experiments/phase8/query-planning/benchmark.json) 是 72 条人工撰写的问题：development 48、holdout 24；24 个 `family_id` 各三条，并有独立 `semantic_families` manifest。原 0A 标签已按 0B 人工语义审计及四条疑难题裁决修订。每条现在使用完整的 `primary_expected_plan` 与成组的 `acceptable_plans`；评测不得跨方案拼接字段。`question_fact_references` 将显式爻位断言绑定真实 Rule hit target；对自然语言的其他事实仍需人工核对。候选**尚未冻结**。

0C 自审统计：62 条带卦例、10 条无卦例；scope 为 case-specific 44、theory 14、mixed 2、unknown 12；status 为 ready 46、zero knowledge 23、needs narrowing 2、ambiguous 1。另有 `qp-072` 是带局部未消歧词的 ready 计划。23 个题目事实引用均与冻结卦例的 Rule target 相符。11 条保留 source_checked 的识别成功但未准入情形。开发集与保留集的显式近义模板已改写；人工终审仍须检查隐性语义泄漏和无显式爻位题目的指代是否足够明确。

0B 标注修订覆盖 `qp-010/012/013/015/029/030/032/033/039/042/046/047/048/061/062/066/071/072`；题干修订覆盖 `qp-021/031/049/050/051/052/053/056/057/064/065/067/068/069`。此外少量题目改用自然描述来减轻单纯词表匹配：主方案中 catalog 原词 33 次、已登记 alias 15 次、描述性短语 20 次；明确排除及比较各 8 次。统计单位为主题提及次数，不是互斥案例数。两条有意保留的标注歧义是 `qp-012` 与 `qp-072`，它们都保留完整替代方案。

覆盖显式主题、catalog 别名、口语、错字／简称、否定与显式排除、狭窄事实、双主题／超过两主题、泛问、理论／当前卦／混合、无关问题、当前 Rule 有但用户未问、用户问不存在的关系、reviewed 与 source_checked 准入、比较／“一定”、仅看某主题及补充平面 Unicode 的 UTF-16 span。每条保留问题、上下文引用和哈希、完整 Rule ID 集、版本、期望三层结果相关标签、限制、理由及合理替代答案。Phase 7.3B 12 个原问题未进入 holdout；语义家族是否仍有泄漏需人工复核。

今后评测分别衡量 requested 层与 selected 层的 exact set／precision／recall，并独立报告误注入、漏检、零知识、排除、缩窄、scope、当前锚点及确定性重放。不要合成加权总分。现阶段没有任何 planner 预测或效果比较。

## Phase 8B.0C 标注边界与人工终审

1. **世应覆盖口径**：是否保持目前严格的“当前 Rule ID 必须与 reviewed 单元的 `related_rule_ids` 直接相交”，使世克应／应克世／比和先不注入世应文献？
2. **疑似错字与简称**：`qp-012` 的保守主方案为 ambiguous，允许完整 advance 替代；`qp-072` 主方案只选 retreat，并保留 “近神” unresolved，允许完整 advance+retreat 替代；`qp-066` 因明确出现 “旬空” 而作为 theory/ready。`qp-053` 已写明“旬空”。不增补 catalog alias。
3. **两主题上限**：三个明确主题一律 `needs_narrowing`，不自动挑两个；是否接受此保守策略？
4. **混合问题**：同一知识单元可同时作为理论解释和当前关系语境，但须保留不同 uses 与 Rule 锚点，不得重复加权。
5. **候选分组**：manifest 与机械验证只能保证 family ID 不跨 split；开发集与保留集的语义独立性仍须人工终审。修订减少了既有的事实冲突与明显同义改写，终审前不 freeze。

本阶段未实施 deterministic／AI planner、检索编排或外部模型实验。Phase 8B.1 的算法须等待人工审计后另行开始。
