# 知识增强：可复查的内容审查

日期：2026-09-30。阅读体验交付后，回到尚未解决的知识出处与回答范围问题。本轮实现离线人工／代理审查流程，复核已有真实回复，不接入生产知识注入，不执行付费调用。

## 审查标准

四个维度分别评价，不合成预测准确率或单一通过率：

| 维度 | 判断对象 | 注意事项 |
| --- | --- | --- |
| facts | 明确事实陈述是否与程序事实、规则结果一致 | 机械协议失败另列；不能从字段格式合格推断自然语言正确 |
| scope | 是否回答所问，是否扩展不需要的用神、应期、成败或事实枚举 | 范围窄不意味着所有传统知识都被证明错误 |
| support | 实际引用是否支持解释，是否加入没有所给依据支持的传统细则 | 引用 ID 存在不等于支持陈述 |
| attribution | 原文说法与现代整理是否分清 | 不得把编辑排除条件说成古籍原文明确规定 |

每项使用 pass、fail、uncertain。没有提供文献也不能自动跳过出处审查：审查者必须另行标注输出是否包含出处归属主张（attribution_claims=none／present／uncertain）；只有输入无文献且明确审查输出无归属主张时，attribution 才可使用 not_applicable。无文献却编造古籍说法时仍应记 fail 或 uncertain。所有判断必须给理由，并提供精确引用及其在原始回复中的 JavaScript UTF-16 起止位置。有文献的归属判断还必须关联包内文献 ID。工具能检查引用位置和 ID，不能判断理由是否正确；审查者拿不准应保留 uncertain。

## 可复现流程

```text
node scripts/knowledge-semantic-review.js prepare docs/acceptance/knowledge-reading-pilot-20260930.json test-results/new-review-directory
node scripts/knowledge-semantic-review.js summarize test-results/new-review-directory/packet.json test-results/new-review-directory/summary.json test-results/new-review-directory/reviewer-a.json test-results/new-review-directory/reviewer-b.json
```

prepare 复制既有原始输出、原始机械结果、问题、计划哈希、事实／规则和当次文献资料，不带入原作者的 self_review。使用批次与回复 ID 组合，避免不同批次相同题目覆盖。整个审查包有内容哈希；review 必须绑定该哈希。原始材料与机械失败不重写。

两个审查者分别依据同一份材料完成模板，汇总时必须分别保留每维的 pass／fail／uncertain／not_applicable 数量，以及每条回复的分歧。不能用多数投票删除不利意见。漏评、重复回复、重复审查者、空理由、错误引文、越界位置、未知事实或文献 ID、缺少文献归属引用都会拒绝汇总。所有新目录和结果使用不覆盖写入。

若审查者不能确认输出是否存在归属主张，attribution_claims=uncertain 不得同时评出处 pass 或 not_applicable。此项只保护审查记录的一致性，不自动识别模型是否编造来源。

这次是已曝光开发回复的回顾审查；另一个代理审查不等于盲测、外部专家认证或新样本验收。哈希是本地一致性检查，不是签名或可信时间戳。即使所有审查者都填写 pass，结果也始终标记 production_ready=false、model_improvement_established=false，不能据此上线知识增强。

## 与后续上线的关系

本流程先把已知失败和审查理由变成可复查记录。下一步真实对照应在调用前固定新问题、卦盘、评分标准、版本和预算，之后评价新提示是否减少范围与归属错误。三条旧回复不能充当新版本的效果证明。

现有累计授权仍是 20 元。账本的未预留额度约 0.019066 元，预留并非实际账单；必须先取得可核对的实际消费或追加预算，再安排新付费对照。本轮不读取 Key、不释放预留、不修改预算，不增加生产用户设置。

## 本轮独立回顾结果

两名内容审查代理独立读取相同归档材料，未读取原作者 self_review 或对方审查结果。工具另由第三名代理复审。发现无输入文献不能自动免除编造出处检查后，两位内容审查者分别追加归属主张检查，原初稿在忽略目录中保留，新记录不覆盖初稿。

| 既有回复 | 事实 | 范围 | 支持度 | 出处归属 |
| --- | --- | --- | --- | --- |
| pilot-01 无文献 | 两位均 fail | 两位均 pass | 两位均 fail | 两位均确认无出处主张，not_applicable |
| pilot-02 无文献 | 两位均 pass | 两位均 fail | 两位均 fail | 一位 uncertain，另一位 not_applicable，分歧保留 |
| pilot-02 有文献 | 两位均 pass | 两位均 pass | 两位均 fail | 两位均 fail |

第一条误称程序没有提供世应关系，而当次证据目录有“世克应”。第二条在术语命名核对中引入出月与合、生扶等缓解条件，所给引用不足以支持这些细则。第三条将现代编辑适用边界说成古籍该段明确表达的限制。这里评价的是当前问题与所给引用，不从“支持不足”推断这些传统细则必定错误。

唯一未消解分歧是第二条的“古法中有……”：审查者 A 认为属于宽泛来源主张但缺少具体出处，记 uncertain；审查者 B 认为未归给具体古籍，归属维度不适用，同时仍记支持度 fail。汇总保留两个判断，不改造成一致通过。

记录：[审查 A](acceptance/knowledge-semantic-review/reviewer-a.json)、[审查 B](acceptance/knowledge-semantic-review/reviewer-b.json)、[汇总](acceptance/knowledge-semantic-review/summary.json)。可由 prepare 重建审查包，再用这两份记录 summarize 复现同一汇总。原始回复来源是既有 [真实试测归档](acceptance/knowledge-reading-pilot-20260930.json)。

结论：已有回复的语义问题被两名审查者独立复现，知识增强仍不得上线；这不是修订后 dev-3 提示的真实效果评估。新范围输入和出处提示是否有效，仍需后续真实对照及未参与调参的新样例。

## 工程验收

11 项新增检查保护原始失败不被覆盖、包与引文绑定、漏评和重复拒绝、引用归属、缺少文献仍检查输出主张、未确认不能标通过，以及真实审查分歧的可复现性。第三名代理独立检查最终工具约束与 CLI 无覆盖行为，复验通过；这不证明人工判断本身正确。

源代码 `7625618eb61f748be3f16e630145312d621134b9` 的全量测试为 44 文件、498 项通过（4 workers）。发布边界检查通过；五个稳定构建资产与此前已上线的阅读体验版本哈希完全一致，见 [边界记录](acceptance/knowledge-semantic-review/stable-boundary.json)。本轮仅增加离线工具、测试和审查归档，不部署知识功能。
