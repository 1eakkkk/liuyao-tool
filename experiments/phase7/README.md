# Phase 7.2：Structured 1.2 离线成对输入

**knowledge-aware paired input pipeline ready**

本目录用于 pipeline validation。没有模型回答、评分、真实外部 A/B 或效果结论；不接生产 UI/API。`data_kind:compatibility_fixture` 是离线配置标记，不进入模型输入。

## 固定输入及用途

- `config.fixture.json`：3 组公开兼容性验证配置；model 是 `not-run`，不是已调用模型。
- `fixtures/compat-1.json` 至 `compat-3.json`：由已有 `tests/regression/fixtures/casts.json` 的第0/1/2项 expected.cast 经现有 normalizeLegacyCast 生成，createdAt固定0，问题改为兼容性说明。
- 这些数据在开发中已经反复观察，**不是未见效果测试集**；Phase 6 的8个案例也不能充当未来未见测试集。
- 本阶段只接收兼容性配置。将来真实 Knowledge A/B 需另行确认新案例、审核规范及模型条件，不能直接把本目录数据重新标成效果实验。
- public-fixture-seed 仅为了可重复验证文件映射；不能用它宣称盲化。真实实验映射种子应只保留在私有记录中。

## 运行

在仓库根目录运行，输出路径必须尚不存在：

```sh
node scripts/phase7-knowledge.js experiments/phase7/config.fixture.json test-results/phase7-example
```

输出：

```text
test-results/phase7-example/
  execution/
    compat-01-A.txt
    compat-01-B.txt
    compat-02-A.txt
    compat-02-B.txt
    compat-03-A.txt
    compat-03-B.txt
  private/
    manifest.json
    compat-01.json
    compat-02.json
    compat-03.json
```

execution 仅含完整模型可见文本，中性文件名；没有长度清单、映射表或模式标签。private 保存映射、种子、模型设置、各版本/哈希、字符数、实际检索查询、检索/准入/预算排除理由及完整离线审计记录。private **不应复制给模型或评分者**。目录分离是操作边界，不是文件系统权限隔离。

CLI 先构造并校验所有 pair，才开始写文件；所有输出使用排他创建。已有输出目录直接报错，不覆盖、不续写。磁盘写入失败可能留下不完整包，应人工检查并选择新的输出目录，不能当完整实验记录使用。没有自动网络请求、模型调用或环境密钥读取。`test-results/` 已被 Git 忽略。

同 config、Canonical、corpus、代码和策略会输出完全相同字节；不加入运行时日期，不调用随机数。A/B 映射由 seed+case_id 哈希的奇偶确定，映射只在 private。这个机制不是新的统计随机化方案；有限样本可能顺序不平衡。

## 1.2 的模型可见结构

```text
ai_input_schema_version = 1.2
A_user_question
B_program_facts
C_canonical_cast
D_ai_task
E_rule_results
  rule_result        原 r1 RuleResult，不修改任何 hit/evidence
  relation_anchors   仅为已有 hit 建立引用身份
F_literature_context
  items             空数组或预算内的文献单元
```

复用1.1的事实语义和r1原始结果；为避免带入1.1的实验开关，1.2将原始RuleResult放进E.rule_result，在同级放relation_anchors，没有enabled。旧1.1文件、Schema及行为完全不变。

同一 pair 的两组都为1.2，共同指令完全相同。`assertKnowledgePair` 检查清空F.items后深度一致；common-base hash覆盖清空F后的**完整渲染文本（含共同指令）**，不只哈希JSON。两组不允许有不同角色偏好、模型设置或Prompt版本。模型设置只保存在共享archive/config，本工具没有发起调用或宣称控制了外部客户端设置。

完整prompt及common-base哈希对实际文本UTF-8字节计算；F、Canonical、RuleResult和config哈希使用项目stableJson（对象键排序，数组次序保留）后计算SHA-256。字符预算另按Unicode code points计算，不混用字节长度。

共同指令不提示组别，要求回答不提协议、字段、section、实验条件、上下文是否为空或功能是否开启。但F空与非空、文献引用及答案内容仍可能泄露处理条件，**不能宣称完全盲化**。

## 白名单与证据身份

F item只含：knowledge_id、revision、source_role、original_text、normalized_statement、applicable_conditions、exclusions、exceptions、citation、related_concepts、literature_identity、relation_links、role、independent_evidence。

原文来自固定单元span，条件和例外完整保留。citation包括题名、edition_id/版本说明、segment_id/revision、卷章、印页、影像页、定位锚点和span。没有provenance、acquisition metadata、审核者/notes、content hash、catalog、自由tags或检索调试信息。来源原文、项目整理、历史注释的角色明确区分。

关系身份为 `r1/<rule_id>/<component>/<line>/<related_line或self>`，scope固定current_cast；附结构化target、direction、canonical_paths、calendar_paths。方向直接取hit.result.from/to，不解析中文label。它是**本次输入内**的关系引用，不是跨卦全局ID；跨case审计使用archive canonical_hash + evidence_identity联合限定。

每个E命中只有一个anchor。F.relation_links引用该anchor，不生成新hit。未关联当前命中的概念解释只有literature/knowledge_id@revision身份，independent_evidence永远false，不能冒充事实。相同C路径、E命中和F解释不算三份证据。这里不存在权重或吉凶分值。

`assertKnowledgeInput` 检查封闭结构、C/E路径值、anchor、引用ID及F预算；`assertKnowledgeLiterature` 进一步对冻结语料的准入白名单投影逐项核验，拒绝改写原文、删改条件、错引页位或缺失/错配关联。pair builder自动执行两者。

## 检索和预算

- 使用Phase7.1原检索器，不改策略与语料。默认用本次已有hit的r1 IDs查询；没有hit且无显式需求时选0项，不误变成全库检索。
- 可在case.query显式提供concept/category/terms等受控需求；显式query替代默认规则关联筛选。question_domain保持unknown，不猜领域、不写回Canonical.question.topic。
- 三个source_checked候选始终排除；corpus版本/哈希与policy固定，不允许通过手动升状态绕过。
- **实验初始上限**：最多4项；`JSON.stringify(F_literature_context)`最多2400 Unicode code points（包括JSON键、标点和转义）；ON完整文本相对OFF的增量不超过15%。这不是token数，也不是最优参数。
- 按确定性检索顺序逐项尝试。三个条件必须同时满足；不满足即完整排除并记budget_excluded及触发约束，继续尝试后续项。绝不截原文、删条件或删例外。允许0项，此时两份文本和哈希完全相同。
- 完整文本采用固定共同指令及紧凑JSON；没有为了扩大15%分母添加填充文字。common anchors在两组中完全相同。

冻结版本：

| 项目 | 值 |
| --- | --- |
| AI input | 1.2 |
| Prompt | structured-literature-p1 |
| Projection | literature-whitelist-1.0 |
| Corpus | phase7.1-initial-1 |
| Corpus hash | sha256:1b24872a9533ef5d94576c2f8df3489eb221c69f7dfbf0167cdc6e00ab868729 |
| Retrieval | deterministic-literature-1.0 |

## 结论边界

Phase7.1文本只经过Codex影像核对与整理自审；reviewed不是独立学术复核，不代表预测有效性。Phase7.2只验证投影、关联、预算和离线导出，不评价答案或预测效果。未来不能拿1.1对比1.2来声称Knowledge效果；必须同1.2、同指令、同问题/Canonical/r1结果/模型设置，仅F.items不同。
