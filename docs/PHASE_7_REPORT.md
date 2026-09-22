# Phase 7：Knowledge Layer

## Phase 7.2 当前结果

**knowledge-aware paired input pipeline ready**

基线：`beb0165623e7c7c6c4c0aa21077385355530a461`。分支：`phase7/knowledge`。范围为Structured 1.2知识白名单、关系引用、确定性预算与离线成对导出；没有生产调用或真实外部模型实验。

### 最终协议与冻结版本

| 层 | 内容 |
| --- | --- |
| A_user_question | 与Canonical问题一致 |
| B_program_facts | 继承事实边界，明确文献只是解释材料 |
| C_canonical_cast | 原有Structured白名单投影，字段值不改 |
| D_ai_task | 继承原推理任务边界 |
| E_rule_results.rule_result | 未修改的r1结果，保留hits/skipped/diagnostics |
| E_rule_results.relation_anchors | 对已有hit建立当前卦盘内引用身份，不增加hit |
| F_literature_context.items | OFF为空；ON为准入且预算内的完整文献条目 |

1.2的E包装不携带1.1的enabled；旧1.1协议及行为没有修改。模型可见层没有mode、treatment、variant、group、assignment等实验字段。两组共同指令相同，只有F.items允许不同；清空F后深度相等由机器断言执行。

F只投影knowledge_id/revision/source_role、原文、结构化整理、完整条件/排除/例外、可定位citation、concepts、文献身份和relation_links，以及明确的literature_context/independent_evidence:false。不注入provenance、审核notes、获取信息、内容哈希、自由tags、catalog或retrieval debug。

| 版本 | 值 |
| --- | --- |
| ai_input_schema_version | 1.2 |
| prompt_version | structured-literature-p1 |
| knowledge_projection_version | literature-whitelist-1.0 |
| corpus version | phase7.1-initial-1 |
| corpus hash | sha256:1b24872a9533ef5d94576c2f8df3489eb221c69f7dfbf0167cdc6e00ab868729 |
| retrieval policy | deterministic-literature-1.0 |
| corpus statuses | 7 reviewed / 3 source_checked，不变 |

每个anchor由r1 ID、target/component/line/related_line构成局部身份，并保留结构化方向、Canonical路径与历法路径。只用hit字段，不解析自然语言标签。F解释E/C时只link同一个anchor，不创建第二条证据；概念材料的literature identity不算程序事实。跨cast审计用private canonical_hash联合限定。

### 预算和离线隔离

最多4项、F序列化内容最多2400 Unicode code points、完整可见输入增量最多15%，三个条件同时满足。按固定检索顺序尝试完整单元，超出任一预算便记录budget_excluded，绝不截断原文或条件。允许零项。这些仅为Phase7.2实验初始值，不是最优参数；字符数不是token数。

默认检索已有r1关联，显式concept/category等需求可替代默认选择器。未知问题领域保持unknown，不修改Canonical.question.topic。三个待核单元不能靠本阶段需要样本而升状态；修改语料或状态会因冻结哈希不匹配而拒绝导出。

执行目录只含case-A/B.txt完整文本；private保存assignment/seed、共享模型设置、版本、共同基础/两组完整文本/F哈希、字符数/增量、实际query、选择与排除原因。common-base hash包含相同共同指令，不只是JSON。输出目录必须不存在，防止静默覆盖；包构造不使用时钟、随机数、网络或模型API。

共同指令要求不提输入协议、字段、section、实验状态或功能是否开启，只回答用户问题。F有无内容和答案中的引用仍可能被识别，**不宣称完全盲化**。目录分离不等于访问权限隔离，private记录不能复制给模型或评分者。

### Pipeline validation

3个compatibility fixture来自已观察的旧回归数据，仅验证结构、预算和关联，不是新的效果案例；model_settings.model为not-run。真实外部A/B未运行，无答案或评分。未来需新案例，Phase6的8个案例及这些开发fixture不能冒充未见测试集。

- `npm test -- --maxWorkers=1`：**15个测试文件，230/230通过**，52.93秒；原197项继续通过，新增33项。覆盖1.0/1.1兼容、封闭1.2结构、准入和冻结hash、投影/引用内容、证据锚点、F唯一差异、三重预算、零匹配、Unicode计数、重复导出、private隔离、不覆盖已有输出及受保护源码哈希。
- `npm run build`：**通过**，51模块；JS仍为`index-BUs3Mv5n.js`，CSS仍为`index-63lbvoss.css`。既有Cannon经典脚本提示仍在，没有新增构建提示。
- 实际CLI生成并核验 `test-results/phase7-pipeline-verified/`，包含6份中性文本及private审计包；目录已被Git忽略，不提交。CLI不调用模型；测试也断言构造过程没有fetch调用。
- `git diff --check`通过。受保护路径diff为空：Core、r1、正式corpus/原检索器、原AI模块、生产入口和配置无修改。正式库仍为1/9/10、7 reviewed / 3 source_checked，hash与7.1一致。

兼容性输出统计（Unicode code points，仅工具链验证）：

| Case | OFF完整文本 | ON完整文本 | 增量 | 选入项数 |
| --- | ---: | ---: | ---: | ---: |
| compat-01 | 20572 | 22501 | 9.377% | 2 |
| compat-02 | 20460 | 22534 | 10.137% | 2 |
| compat-03 | 20572 | 20572 | 0% | 0 |

每组common-base hash相同，ON/OFF仅F.items有差异。另有合成的小基础输入测试触发15%上限，确认比例预算并非只写在配置里；全库显式需求测试触发F字符上限，完整排除未放入项。没有删原文或例外来满足预算。

### 文件和边界

- 新增 `src/ai/knowledge-input.js`、`src/ai/knowledge-schema.js`，没有修改旧AI模块。
- 新增 `scripts/phase7-knowledge.js`、`experiments/phase7/README.md`、`config-schema.js`、`config.fixture.json`、3个compatibility Canonical fixture。
- 新增 `tests/phase7/pipeline.test.js`。
- 更新 `docs/KNOWLEDGE_LAYER.md`、本报告，保留7.0/7.1历史。
- Core/Canonical、25条规则/r1、Legacy、Structured1.0/1.1、生产入口/UI/API、Cloudflare、依赖以及整个正式corpus和检索策略不修改。

7.1的reviewed仅代表Codex影像核对与整理自审，不是独立学术复核；文献记录不证明预测有效性。本轮只完成工具链，不作回答改进或预测能力结论。

单独提交 `feat: add knowledge-aware structured input pipeline`，不push；停止，不进入Phase8。

---

## Phase 7.1 记录（冻结语料基线）

**Phase 7.1 single-edition traceable corpus and deterministic retrieval complete**

基线：`d3a2ead48a4c9da3a6928dbd58b23526de054eaf`。分支：`phase7/knowledge`。影像获取与本轮录入核对日期：2026-09-22。

| 项目 | 结果 |
| --- | --- |
| SourceEdition | 1，reviewed |
| SourceSegment | 9，reviewed（转写自审，不等于其关联知识命题通过整理审核） |
| KnowledgeUnit | 10：reviewed 7；source_checked 3；draft/disputed/retired 0 |
| 可检索单元 | 7，必须通过完整链条准入 |
| Commentary / Case | 0 / 0；无 Case Schema |
| Catalog | 14 concepts、6 categories、0 tags；revision 2 |
| Corpus version | `phase7.1-initial-1` |
| Corpus hash | `sha256:1b24872a9533ef5d94576c2f8df3489eb221c69f7dfbf0167cdc6e00ab868729` |
| Retrieval policy | `deterministic-literature-1.0` |

这是文献记录与离线检索的工程交付，未进行知识效果实验，也未向任何生产 AI 请求注入知识。

### 唯一底本最终登记

正式记录：`knowledge/sources/zsby-nlc-12jh005345.json`。共同字段为 schema_version 1.0、revision 1、data_kind corpus、verification_status reviewed、transcription_revision 1；content_hash 根据完整记录自动核算，不与底本文件哈希混同。

| 字段 | 记录值及依据 |
| --- | --- |
| title | 增刪卜易 |
| work_id | zeng-shan-bu-yi |
| edition_id | zsby-wenming-1925-11-nlc-12jh005345 |
| source_id | zsby-nlc-12jh005345 |
| edition.designation | 中華民國十四年十一月文明書局本 |
| publication | 文明書局；上海；中華民國十四年十一月 |
| manuscript | scribe/date_text 均 null，不推测抄本信息 |
| holding | 中国国家图书馆；12jh005345 / 45344；镜像所列 MG/B992.2 |
| 实际取得位置 | Wikimedia Commons 镜像及 upload.wikimedia.org PDF，未把镜像写成原馆 |
| acquisition_date | 2026-09-22 |
| 物理/数字范围 | 六卷、全三册、PDF 394 影像页，11,089,308 字节 |
| 元数据定位 | 影像21题署；339卷六题页；393刊记/全三册 |
| 出版/发行日期 | 刊记分别写“中華民國十四年十一月出版”“中華民國十四年十一月發行” |
| 印刷/发行机构 | 文明書局印刷、發行；上海南京路文明書局及上海棋盤街中華書局为發行所 |
| 原馆归属依据 | 镜像文件说明与文件名；未声称直接检验NLC馆藏原件 |
| 再利用依据 | Commons 文件页 Licensing 的 PD-scan / PD-China 声明，来源链接保存在 rights 与 image_witness 内 |
| 审核身份 | codex-visual-review，自本次影像查看核对；没有独立人类复核身份 |

署名均保留 name/role/attribution_basis/certainty，certainty 是 as_printed：

- 野鶴老人／著。
- 李坦我平／鉴定，题署“楚江李坦我平鑒定”，不自动拆分姓名字号。
- 李文輝覺子／增删，题署“湖南李文輝覺子增刪”。
- 陳文吉茂生／校；茹芝山秀／校，依据影像21的“壻…男…同校閱”；没有从旁证补姓。
- 秦愼安／校，依据影像393“校勘者 江甯秦愼安”；镜像书目使用“慎”，未反过来改写影像转写。

[底本镜像及声明](https://commons.wikimedia.org/wiki/File:NLC416-12jh005345-45344_%E5%A2%9E%E5%88%AA%E5%8D%9C%E6%98%93.pdf)。实际下载副本 SHA-256：

```text
caac111bc5c5b1c08fd27b3828e7cf6b5430503800f2427d8f2b28809022abaa
```

source 的 image_witness 保存全部页数、卷册数、元数据页、mirror、来源归属依据、声明链接、出版发行机构与转写约定。provenance.source_url 指向实际取得的 PDF；notes 解释署名/原馆依据限制。下载原件及所有渲染页位于仓库外临时目录，没有提交。

### 片段和候选的最终范围

所有定位均重新打开影像确认；image_page 是 PDF **从1开始**的实际页序，不以书签偏移代替页序。locator 的 page 保留书内印页；双页段另在 anchor 写明终点。只线性化手工转写所列片段，没有整章录入、自动 OCR 或从其他版本填字。

| 候选／knowledge_id | SourceSegment | 卷章；影像／印页 | 状态与边界 |
| --- | --- | --- | --- |
| K1 zsby-shiying-scope-001 | zsby-1925-s1 | 卷三增刪黃金策千金賦；146／四 | reviewed；彼此之事及帮助方向。historical_commentary 角色，不伪装成独立经典正文 |
| K2 zsby-month-clash-001 | zsby-1925-s2 | 卷二月破；104／三四 | reviewed；仅月建冲之的名称定义。动态、时效与吉凶不在命题范围 |
| K3 zsby-month-combine-001 | zsby-1925-s3 | 卷一月將；61／四一 | reviewed；月合名称与原文措辞角色，不把有用转成计算字段 |
| K4 zsby-day-clash-context-001 | zsby-1925-s4 | 卷一日辰；67／四七 | reviewed；只讨论旺静/衰静的条件，不自动判旺衰或暗动日破 |
| K5 zsby-day-combine-context-001 | zsby-1925-s5 | 卷二六合；74／四 | source_checked；日/月/动爻之合及后续有气/失陷条件还未整体整理 |
| K6 zsby-return-scope-001 | zsby-1925-s6 | 卷一動變生尅沖合；58／三八 | source_checked；59页日月作用于变爻的边界未纳入最小片段 |
| K7 zsby-advance-definition-001 | zsby-1925-s7 | 卷二進神退神；116–117／四六–四七 | reviewed；保留章首喜忌条件及全部进退列举，仅解释化进方向 |
| K8 zsby-retreat-definition-001 | 同S7 | 同上 | reviewed；独立的化退命题，不因共用原文而合并为化进 |
| K9 zsby-flying-hidden-context-001 | zsby-1925-s8 | 卷二飛伏神；110／四〇 | source_checked；仅六项条件，尚不足覆盖前面飞克占例及后面评论的边界 |
| K10 zsby-void-definition-001 | zsby-1925-s9 | 卷二旬空；93／二三 | reviewed；甲子旬例的历法名义，不推广实际效力 |

S5/S6/S8 的文字转写与定位可审核，不等于 K5/K6/K9 的整理命题可准入；三项 exceptions 保持 unreviewed，provenance 无 reviewed_by/date，检索明确返回 verification:source_checked、conditions_unreviewed。没有凑满10个 reviewed。

原文完整覆盖各自知识命题的范围；K2/K10 明确缩到名义定义，不声称整理了整章条件或例外。`none_stated` 仅指所引定义段未述及，不代表经典其他位置没有例外。待核候选不用于运行时解释。S7 的“出化”按影像保留，不猜改为“爻化”。

### 实现与事实边界

- SourceEdition/Segment 的封闭 Schema 增补 image_witness / transcription_uncertainties；旧字段含义不变，Canonical 与 AI Schema 未改。
- `load.js` 只读固定目录、拒绝软链接和非 JSON 文件；`createKnowledgeIndex` 严格校验及准入后创建内存索引。结构有效的待核记录有保留理由，不是可用知识。
- `retrieve.js` 支持 concept/category/r1 ID/edition、受控 aliases、verification_status、已知条件状态、limit；同查询+快照+策略的排序与结果稳定。没有自然语言条件判定、随机选择、经验评分或推理。
- 同命题只按相同来源命题及边界或明确 equivalent 合并，保留全部锁定引用；不能因为同 rule_id 就合并两种不同命题。
- 检索带 match/excluded 原因、固定 source/segment/span/hash、corpus version/hash、policy version。C/E/K 同一具体关系只能继承一个已有 evidence_identity；文献关联明确 independent_evidence:false。本轮不创造 Cast 身份、不接生产调用。
- 两个 CLI 仅校验/查询，不下载、不写文件、不生成知识。默认严格校验因三项待核返回1，显式 --allow-pending 返回0但不改变准入。
- 没有 Commentary 或 Case，没有 confidence/score/prediction_weight，没有自动选用神、自动造规则或效果实验。

### 验证与交付

- `npm test -- --maxWorkers=1`：**14 个测试文件、197/197 通过**，92.39 秒；原161项继续通过，新增36项。知识层合计65项，其中12组固定检索预期。
- 覆盖真实底本/片段 Schema、来源链/页号/字节哈希、缓存原文与span、r1 ID、待核/争议/出处不完整隔离、别名、精确与组合查询、条件元数据、稳定排序与limit、同命题/冲突、既有证据身份、CLI、fixture隔离、无Commentary/Case/统计字段，以及r1源码冻结哈希。
- `npm run build`：**通过**，51模块，1.98秒；JS `index-BUs3Mv5n.js`、CSS `index-63lbvoss.css` 与Phase7.0相同。既有 `vendor/cannon.js` 经典脚本构建提示仍在，没有新增警告。
- `node scripts/knowledge/validate-corpus.js --allow-pending`：通过；source/segment/unit准入为1/9/7，三个待核单元及原因如上。严格模式的退出码1由测试确认，不是隐瞒待核状态。
- 固定下载文件再次核验 SHA-256 与11,089,308字节长度；原件未进入仓库。查询重载及集合重排的corpus hash由冻结测试核对。
- `git diff --check` 通过；修改/新增文件均在下述范围。没有生产路径引入Knowledge；构建产物文件名未变。本轮未要求或执行浏览器/真实AI效果实验。

新增/修改文件：

- `knowledge/sources/zsby-nlc-12jh005345.json`；`knowledge/classics/zsby-1925-s1.json`至`s9.json`；`knowledge/units/`的上述10个候选JSON；`knowledge/catalog/catalog.json`。
- 新增 `src/knowledge/load.js`、`retrieve.js`、`dedupe.js`；更新 `schemas.js`、`validate.js`。
- 新增 `scripts/knowledge/retrieve.js`；更新 `scripts/knowledge/validate-corpus.js`，保留旧的readCorpus导出兼容测试。
- 新增 `tests/knowledge/retrieval-cases.json`、`retrieval.test.js`；更新 `contracts.test.js`，将“仓库永远为空”的历史断言换成空库契约测试并继续验证正式读取不含fixture。其他原回归断言未删。
- 更新 `docs/KNOWLEDGE_LAYER.md`、`docs/PHASE_7_REPORT.md`，保留7.0历史记录。

代码/数据差异仅允许在 `src/knowledge/`、`scripts/knowledge/`、`knowledge/`、`tests/knowledge/` 及这两份知识文档。不修改 Core、Canonical、src/rules、Legacy、Structured 1.0/1.1、Prompt、UI、生产入口、Cloudflare 或依赖配置。完整 PDF、渲染页、OCR dump、用户配置和实验临时文件不在提交集合。

完成后单独 commit、不 push，停止于 Phase 7.1，不进入 Phase 7.2。

---

## Phase 7.0 历史记录（下文空库状态仅指当时）

## 范围

**Phase 7.0 knowledge provenance/schema foundation complete**

基线：`fb08828ae32341f4c77aa98f9fa7755fdee323b1`。开发分支：`phase7/knowledge`。

本轮仅实现 SourceEdition、SourceSegment、KnowledgeUnit、Commentary、空 concept/catalog、出处/修订/审核约束、离线校验器、虚构 fixture 和测试文档。

正式 sources/classics/units/commentary 全部为空，未选择底本，未录入任何正式古籍知识单元。Case Schema 未实现，仅在 KNOWLEDGE_LAYER.md 记录未来边界。

## 实现

- 四类记录使用独立封闭 Schema，拒绝未知字段；无 confidence。
- 多角色署名与 attribution_basis/certainty 保留 unknown，不补全常见署名。
- 来源、版本、片段、Unicode span、转写哈希及完整记录哈希可校验。artifact_hash 另行标识底本文件哈希，当前不自动读取或认证外部底本。
- 规则引用只检查现有 Ruleset r1 的 25 个 ID，固定 association_only，不执行或修改规则，不作为文献证明。
- 结构有效与正式准入分离：非 reviewed、出处不完整、上游未准入、争议或待核条件均不准入。
- fixture/test_only 只能用于测试；正式检查命令拒绝混入。没有生产 corpus 加载器。
- 修订比较可显式接收 previous 快照；检查内容变动、文字转写修订、退役与 supersedes。无历史快照时不宣称历史完整性已认证。
- 校验函数不修改输入；catalog 仅提供受控概念/别名/分类/标签结构，无正式条目。

## 验证

- `npm test -- --maxWorkers=1`：13 个测试文件，**161/161 通过**（原 132 项 + 新增 29 项），耗时 65.94 秒。
- 新测试覆盖四类 Schema、嵌套未知字段、ID 唯一性、修订、审核状态、署名 unknown、出处必填、底本及片段版本引用、Unicode span、缓存原文、转写/记录哈希、底本哈希准入门槛、r1 关联、受控概念/标签、争议、现代注释引用、历史快照与 fixture 隔离。
- `node scripts/knowledge/validate-corpus.js`：退出码 0；sources/segments/units/commentary 均为 0，正式准入集合为空。
- `npm run build`：通过，51 个模块；JS `index-BUs3Mv5n.js`，CSS `index-63lbvoss.css`，与基线产物文件名一致。既有 Cannon 经典脚本构建提示仍在，无新增构建警告。
- `git diff --check` 和暂存差异检查通过。全部差异仅为本轮 12 个新增文件，没有修改现有生产文件、依赖或配置；生产代码未引用 Knowledge。
- 本轮不要求浏览器回归，未重复执行浏览器套件；现有全部自动回归通过，构建产物入口未变化。

## 生产边界与限制

Core、Canonical、src/rules、Legacy、Structured 1.0/1.1、Prompt、UI、生产入口、Cloudflare 配置均不修改。无新 npm 依赖，无生产模块引入 Knowledge。

不实现检索、去重、AI 注入、Structured 1.2、索引构建、成对导出或 Case Schema。没有任何知识效果实验；本报告不评价回答、经典有效性或预测准确率。

出处校验是结构、引用和完整性检查，不能证明底本真实、转写忠实、署名确凿或审核实际完成；这些必须在未来确定底本后核对。所有测试数据均为虚构测试资料，不进入正式 corpus。

完成后单独提交、不 push，停止于 Phase 7.0，不进入 7.1。
