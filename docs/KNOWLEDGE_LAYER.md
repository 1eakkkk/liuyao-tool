# Knowledge Layer：出处契约与 Phase 7.1 离线检索

## 状态与边界

Phase 7.0 建立结构契约；Phase 7.1 使用已确认的单一底本，提供离线加载、准入与检索。现有 1 个 SourceEdition、9 个 SourceSegment、10 个 KnowledgeUnit（7 reviewed / 3 source_checked）、0 Commentary、0 Case。catalog 为 14 个概念、6 个分类、0 个自由标签。仅 7 个准入单元可检索。

不修改 Core、Canonical、Ruleset r1 的 25 条规则、Legacy、Structured 1.0/1.1、Prompt、UI 或部署配置。不实现 AI 注入、Structured 1.2、案例 Schema 或实验效果评测。

## 目录与依赖

```text
knowledge/
  sources/                SourceEdition，每个 source_id 一个 JSON
  classics/               SourceSegment，原文与历史注释由 text_role 区分
  units/                  KnowledgeUnit，项目整理的命题与适用边界
  commentary/             Commentary，独立的现代注释
  catalog/catalog.json    受控概念、别名、分类、标签
src/knowledge/
  schemas.js              独立的封闭 Schema
  validate.js             Node 离线结构、引用、哈希和准入校验
  load.js                 显式只读加载，不自动加载 corpus
  retrieve.js             准入后内存索引与确定性过滤
  dedupe.js               同命题分组与已有证据身份关联
scripts/knowledge/
  validate-corpus.js       只读校验命令
  retrieve.js              只读查询命令，输出 JSON
tests/knowledge/
  fixtures.js             明确 test_only 的虚构数据
  contracts.test.js       契约及准入测试
  retrieval-cases.json    冻结的 test_only 查询及预期，不属于 corpus
  retrieval.test.js       真实记录完整性与离线检索测试
```

只有离线脚本读取 `src/rules/registry.js` 并传入现有 r1 ID 清单；Knowledge 校验器不调用规则引擎，不计算任何卦盘关系。Core、Rules、AI 和生产入口均不反向依赖 Knowledge。校验器使用 Node 内置 crypto，无新依赖，不属于浏览器运行时。

Schema 使用 `schemas.js` 中的可读对象描述。所有对象拒绝未知字段，所有字符串拒绝空白，所有集合拒绝重复项。独立校验器仅实现本文件使用的关键词（type、const、enum、required、additionalProperties:false、properties、items、uniqueItems、minItems、minLength、pattern、minimum、date），不宣称为通用 JSON Schema 引擎。

## 四类记录共同字段

| 字段 | 契约 |
| --- | --- |
| schema_version | 固定 `1.0`，是知识数据契约版本，独立于 AI/Canonical |
| revision | 正整数；身份 ID 稳定，内容变更通过 revision 表达 |
| data_kind | `corpus` 或 `test_only`，不是来源类型 |
| verification_status | `draft / source_checked / reviewed / disputed / retired` |
| provenance | 必填，详见下节 |
| content_hash | `sha256:` 加 64 位小写十六进制 |
| notes | 必填、可 null；整理备注，未来默认不得进入 AI 输入 |

不设 confidence、预测置信度、权重、吉凶分值。`reviewed` 只表示文本/整理审核状态，不表示知识正确性、规则证明或预测能力。

- `draft`：待整理/核对。
- `source_checked`：已作出处核对，整理审核未完成，不准入。
- `reviewed`：具有审核者与日期，仍须通过出处、引用链、条件等准入检查。
- `disputed`：明确有争议，不准入。
- `retired`：保留历史，不准入。不得以删除记录代替退役。

### provenance

`acquisition_date`、`source_url`、`identifier`、`artifact_hash`、`method`、`agent`、`reviewed_by`、`reviewed_at`、`rights` 全部显式存在。

- source_url 或 identifier 至少一个非 null；URL 仅允许 HTTP(S)。不自动访问或下载。
- acquisition_date、reviewed_at 使用真实日历日期 `YYYY-MM-DD`；审核不早于获取日期；审核者与日期必须成对，reviewed 时不可缺。
- method 为 `manual_transcription / import / editorial / fixture`。它是记录过程，不授予可信度。
- artifact_hash 可 null（待核），正式 SourceEdition 准入时不可 null；保存原始底本文件字节的 SHA-256。当前校验器检查格式与准入要求，**不读取外部底本文件，不能验证填写的哈希确实来自该底本**。未来录入必须人工/工具核对实际文件字节及定位。
- rights 为 `{status, basis}`；status 为 unknown/public_domain/permission/licensed/test_only。这里只记录可复用依据；unknown/test_only 不准入，不自动判断版权。

## SourceEdition

共同字段之外：

- `source_id / work_id / edition_id / title`：各自区分资料记录、作品、底本版本和题名。当前一个 edition_id 对应一个资料记录；多个载体如需分别建档须未来显式设计，不能混合底本。
- `contributors[]`：`{name, role, attribution_basis, certainty}`。
- `edition`：designation；publication 的 publisher/place/date_text；manuscript 的 scribe/date_text；digital_version。年代保留来源文字，不能猜成精确公历日期。
- `holding`：repository、identifier。
- `transcription_revision`：正整数，标记该资料登记的转写版本。
- `locator`：volume/chapter/section/page/leaf/image_page/anchor，未知项显式 null。

作者不能使用单一字符串。role 支持著、辑、增删、校、注、译、鉴定、抄、其他、unknown。certainty 为 as_printed/catalog_attributed/verified/disputed/unknown，是**署名依据状态**，不是数值置信度。unknown 必须 name:null，并写明 attribution_basis；不会补全网络常见署名。其他 certainty 必须有 name。

审核者可以确认“作者仍未知”而将文本记录标为 reviewed；这不把署名 certainty 升为 verified。disputed 署名不准入。正式 SourceEdition 还须有底本 designation、馆藏/保存机构及编号、至少一项明确署名或 unknown 声明和 artifact_hash。

## SourceSegment

共同字段之外：`segment_id`、`source_ref:{source_id,revision}`、`work_id`、`edition_id`、`title`、`text_role`、`locator`、`text`、`transcription_revision`、`text_hash`。

source_ref 必须存在且锁定 revision；work_id/edition_id 与 SourceEdition 一致。text_role 为 original_body 或 historical_commentary；历史注释不得伪装正文。

正式准入至少具备 page/leaf/image_page/anchor 中的一项精确定位，只有卷章名称不够。锚点和页号必须由人工核对，结构校验不能证明其真实存在。text_hash 是 text 原样 UTF-8 字节哈希，不换行转换，不繁简转换，不去空白。

## KnowledgeUnit

共同字段之外：

| 字段 | 契约 |
| --- | --- |
| knowledge_id | 全局稳定 ID |
| source_type | classical_body / historical_commentary，与片段角色一致 |
| segment_ref | segment_id、revision、span |
| original_text | 可选缓存，存在时必须逐字等于指定 span |
| normalized_statement | 项目整理的解释，不能冒充古籍原文 |
| category | catalog 已定义分类 |
| applicable_conditions / exclusions / exceptions | 各为 `{status, statements[]}` |
| related_concepts | 受控 concept ID 数组 |
| related_rule_ids | 现有 r1 rule_id 数组，可为空 |
| ruleset_version / rule_link_semantics | 固定 r1 / association_only |
| tags | catalog 已定义标签数组，可为空 |
| supersedes | 指向传入 previous 快照的 knowledge_id/revision |
| related_units | target 引用及 related/equivalent/qualifies 类型 |
| disputes | target 引用及 reason；争议双方均不准入 |

span 为 `{start,end,unit:'unicode_code_point'}`：从零开始、左闭右开，按 Unicode code point（JavaScript `[...text]`）计数，不按 UTF-16 字节单元或视觉字符计数。范围必须非空且不越界。原文含组合字符、异体字、换行时均原样保存。允许仅存 segment_ref + span，不要求重复缓存。

条件 status 为 unreviewed/specified/none_stated；specified 必须有 statements，其他状态必须空数组。none_stated 只表示所引用文本未述及，不表示现实中不存在例外；unreviewed 不准入。条件仅为可追溯文字，不执行匹配或自然语言推理。

related_rule_ids 仅供关联索引，校验只能通过当前注册表中存在的 r1 ID。它不会生成/修改规则，也不能说明经典证明了代码规则正确。关联本身不是另一份证据。未来 AI 注入必须保留 Canonical 确定事实 → Rule 标准化命中 → 文献解释的层级，同一事实不得重复计权。本阶段仅实现离线同命题分组与关联，不实现 AI 注入。

## Commentary

共同字段之外：`commentary_id`、`source_type:'modern_commentary'`、`contributors[]`、`statement`、`segment_refs[]`、`knowledge_refs[]`、`related_concepts[]`、`tags[]`。

至少引用一个片段或知识单元，引用锁定 revision；片段引用同样校验 span。作者角色同 SourceEdition，不允许无署名依据的自动生成解释成为 reviewed 资料。Commentary 是现代注释，不复用 KnowledgeUnit 的经典原文角色，也不默认进入未来 AI 输入。

## Catalog

`schema_version/revision/concepts/categories/tags`。

- concepts：`concept_id / label / aliases[] / definition`。
- categories：`category_id / label`。
- tags：`tag_id / label`。

ID 各集合唯一；label/alias 不能跨概念重复而产生歧义。繁简、异名只记录为别名，不改写原文。自由 tag 不得替代概念 ID。Phase 7.1 只添加本批所需概念；ID、label、alias 不得相互歧义，别名仅用于精确检索映射。

## 哈希、历史和准入

record content_hash：对去掉顶层 content_hash 的完整记录递归按对象键排序，数组次序保留，以紧凑 JSON 的 UTF-8 字节计算 SHA-256。它覆盖出处、原文引用、状态和备注。它不同于 text_hash（转写文字）及 artifact_hash（原始文件）。哈希只提供完整性检查，不能认证古籍或审核者的真实性。

`validateCorpus(corpus,{ruleIds,rulesetVersion,mode,previous})` 返回 counts、admitted ID 集合与 excluded 原因；不改写传入数据。

- production 模式拒绝任何 test_only、fixture method、test_only rights；fixture 模式仅接受 test_only。
- 正式准入须 reviewed、出处完整、可复用依据明确、无未解决争议，且上游 SourceEdition → SourceSegment → KnowledgeUnit 全链条准入。Commentary 的所有引用同样须准入。
- 结构有效的 draft 可以留存，但不会自动升级为 reviewed 或准入。
- 传入 previous 时，已存在记录不能删除；内容变化要求 revision 恰好加一，片段文字变化还要求 transcription_revision 加一；catalog 变化要求独立 revision 加一。supersedes 必须能追溯到此快照。既有引用随 revision 明确更新，不自动改指向。
- 未提供 previous 时只能校验当前快照，不能验证完整编辑历史；命令当前不承担历史库管理。Phase 7.1 首次录入使用记录 revision 1、catalog revision 2；后续仍须提交 previous 快照核验修订。

## 操作与测试

```sh
node scripts/knowledge/validate-corpus.js
node scripts/knowledge/validate-corpus.js path/to/corpus
npm test -- --maxWorkers=1
npm run build
git diff --check
```

命令只扫描 sources/classics/units/commentary 的 JSON 和固定 catalog/catalog.json，拒绝软链接与非 JSON 数据文件（空目录 .gitkeep 除外）。不扫描 tests/、本地实验或用户配置，不写入文件。默认退出码 0 表示结构通过且没有被排除的记录；存在不准入记录时为 1。显式 --allow-pending 允许结构有效的待核记录留存并返回 0，但不改变准入结果；格式错误或 fixture 混入始终返回 1。空库通过只说明结构就绪，不能理解为已有可用知识。

测试数据位于 tests/knowledge，全部为虚构且标记 fixture/test_only，不能作为经典知识。准入测试会在内存中模拟 corpus/reviewed 状态验证门槛，不将模拟数据写入正式库。防护依赖显式标记与目录隔离，不能识别蓄意去掉所有标记后伪装的文献；真实入库必须审核原件。

## 未来案例边界（本阶段无 Case Schema）

- 案例必须独立于经典正文、结构化知识单元和现代注释。
- 古籍记载结果、现代用户报告、外部核验结果必须区分，不能都标作已证实结果。
- Phase 6 模型回答是评测材料，不是现实案例。
- 真正案例 Schema、检索、benchmark 和数据泄漏防护留到未来案例阶段单独设计。

## 停止点

停止于 Phase 7.1 离线语料与检索。未实现 knowledge-input、Structured 1.2、AI 注入、build-index 持久化命令、export-pair 或效果实验；不进入 Phase 7.2。

## Phase 7.1：单一影像见证与转写

唯一底本：`zeng-shan-bu-yi / zsby-wenming-1925-11-nlc-12jh005345`。原来源为中国国家图书馆，标识 `12jh005345 / 45344`；Commons 说明所列馆藏信息 `MG/B992.2`。

- [实际取得副本的 Commons 镜像及再利用声明](https://commons.wikimedia.org/wiki/File:NLC416-12jh005345-45344_%E5%A2%9E%E5%88%AA%E5%8D%9C%E6%98%93.pdf)：获取日期 2026-09-22，394 个 PDF 影像页，11,089,308 字节。
- 实际副本 SHA-256：`caac111bc5c5b1c08fd27b3828e7cf6b5430503800f2427d8f2b28809022abaa`。完整 PDF 和渲染页仅在仓库外临时目录，不提交。
- 影像 21 题署、339 卷六题页、393 刊记已重新查看。六卷、全三册；刊记出版和发行均为民国十四年十一月。文明书局发行、印刷；发行所为上海南京路文明书局与上海棋盘街中华书局。
- 原馆归属与 `MG/B992.2` 来自镜像书目说明，文件标识来自固定文件名；不声称本轮直接核验了 NLC 馆藏原件。题署及刊记采用影像依据，没有把 CiNii 责任者旁证转成 `as_printed`。
- 重用依据记录 Commons 的 PD-scan / PD-China 声明及链接；这是声明的追溯，不是独立法律认证。刊记中的历史翻印限制没有被删除或隐瞒。

SourceEdition 新增可选封闭 `image_witness` 对象：page_count / volume_count / booklet_count / metadata_image_pages、mirror（repository/identifier/url）、source_identity_basis、rights_statement_url、publication_date_text、distribution_date_text、publication_roles、transcription_policy。保持知识数据 `schema_version:1.0`，是新增可选字段，不改变旧字段语义；与 AI Input 版本无关。旧契约校验仍可不提供它，但本阶段离线准入明确使用 `requireImageWitness:true`，缺少见证或 image_page 的链条不能被检索。

SourceSegment 可选 `transcription_uncertainties[]`；非空时即使标记 reviewed 也不准入。已提供 image_witness 时，片段页号必须不超出页数，片段与单元 artifact_hash 必须与来源链一致。元数据页同样检查范围。工具不联网、不重新下载或认证 PDF；本轮实际下载字节哈希另行核过。

转写规则记录在底本和片段内：按右至左、列内上至下线性化；句读小圈记 `。`、分段大圈记 `○`，表格加行分隔，换列不加空格。保留可辨繁体及异体，未用 OCR/Ctext/Wikisource 补字。S7 的“出化”按影像保留，没有改成推测的“爻化”。这是可定位的文字转写，不是原字模或版面几何的复刻。

`codex-visual-review` 表示本轮代理直接查看影像并核对转写/整理，**不是独立人工复核**；未虚构人类审核者。reviewed 不认证古籍命题正确。疑字应进入 uncertainties；可辨文字但整理边界未完成的单元仍为 source_checked。

九段范围及逐个单元状态见 PHASE_7_REPORT.md。特别是日合、回头、飞伏三项仅保存可定位片段，跨段边界尚未整理，不能因片段文字已审核就自动升级知识单元。

## Phase 7.1：加载与检索契约

```js
import { RULES, RULESET_VERSION } from './src/rules/registry.js';
import { loadCorpus } from './src/knowledge/load.js';
import { retrieve } from './src/knowledge/retrieve.js';
const index = loadCorpus(undefined, {
  ruleIds: RULES.map(r => r.rule_id), rulesetVersion: RULESET_VERSION
});
const result = retrieve(index, { concepts: ['shi-ying'], limit: 2 });
```

上述为项目根目录的 Node 离线调用。模块导入本身不读库；知识代码只接收 r1 注册表参数，不调用规则引擎。`readCorpus` 返回未准入的原始数据，不是可用知识集合；`loadCorpus/createKnowledgeIndex` 做严格校验、克隆并保存私有内存索引。非法结构直接报错；合法待核记录留存排除原因。调用方不能修改索引内部快照。

查询字段（拒绝未知字段）：

| 字段 | 行为 |
| --- | --- |
| concepts[] | 受控 ID 精确匹配，未知 ID 报错 |
| categories[] | 分类精确匹配，未知分类报错 |
| related_rule_ids[] | r1 关联精确匹配，未知 r1 ID 报错；合法但未关联的 ID 返回空 |
| allowed_editions[] | 已加载底本白名单，未知 edition 报错 |
| terms[] | 可选：ID/label/alias 精确映射；未知词返回无匹配，不分词、不模糊或语义扩展 |
| verification_status | 默认 reviewed；请求其他合法状态仍不允许绕过 reviewed 准入，返回空 |
| condition_statuses | 可选：只按 applicable_conditions/exclusions/exceptions 的指定 status 过滤 |
| limit | 默认 10；整数 0–100，0 返回空并记录 limit 原因 |

每个选择器内部为 OR，选择器之间为 AND；concepts 与 terms 的概念合并成同一个 OR 选择器。省略/空数组表示该项不限制。大小写、空格、繁简均不自动修改，只有 catalog 中明确列出的别名参与映射。

处理顺序：先准入；精确 ID/分类/规则索引，随后为 terms 做受控别名补充；过滤版本与已声明的条件状态；同命题分组；按 knowledge_id 的 JavaScript 字符序稳定排序；最后 limit。没有 score、权重、随机性、locale 排序或系统时间依赖。条件状态只说明文献整理状态，**不判断“此爻旺相”“此问属于彼此之事”等自然语言条件是否成立**。

返回 selected（完整离线单元、match_reasons、固定 citation、same_proposition_ids/citations、association）、excluded（过滤/准入/重复/limit 原因）、admission_excluded、normalized_terms、corpus_version/hash、retrieval_policy_version。每个未入选单元都可追溯排除理由。输出含整理审计字段及 notes，供离线审查；它不是可直接发给 AI 的输入。

语料版本 `phase7.1-initial-1`，策略 `deterministic-literature-1.0`。corpus_hash 覆盖全部记录（包括待核记录、provenance、notes）、catalog 和各记录哈希。顶层记录集合和 catalog 条目按 ID 排序，记录内部数组保留语义次序，随后 stableJson + SHA-256。文件枚举和顶层集合次序变化不影响结果。调整语料须记录新版本及哈希；改变检索语义必须升级 policy，而非继续沿用旧实验标识。

### 同命题与证据身份

- 只合并：同一 segment revision/span、source_type、normalized_statement、三类条件完全相同，或双方均准入且明确标记 equivalent 的命题。equivalent 是整理者需审核的声明，工具不证明其语义等价。
- 相同规则 ID、相同原文片段或类似措辞都不足以自动合并。S7 支撑进神与退神两个不同命题，它们保留为两项。
- 先过滤再分组，代表项为最小 ID；保留组内全部 knowledge_id、锁定出处和关联 ID。未解决 disputes 阻止双方准入，不偷偷挑选更有利的一方。
- `association` 明确 `semantics:association_only`、`knowledge_role:literature_context`、`independent_evidence:false`、`evidence_identity:null`、`requires_cast_binding:true`。没有 Cast 时，不凭 rule_id 伪造具体爻位证据。
- `associateEvidence(units, [{ruleset_version:'r1',rule_id,evidence_identity}])` 是最小离线关联函数，输入应来自已准入检索结果；它继承调用方现有的 cast/target/direction 身份，合并文献引用，绝不创造新身份、计算命中或增加证据份数。它额外拒绝非 reviewed/test_only 引用，但不替代上游准入校验。不同 Cast/爻位必须由调用方提供不同身份；Phase 7.2 才设计实际 AI 映射。
- C 是程序事实，E 是确定性关系/索引，K 是文献解释/术语/条件。MONTH-CLASH 的 K 只解释名称，不宣告具体某爻月破；不能称作对 r1 正确性的独立验证。

### 离线操作

```sh
node scripts/knowledge/validate-corpus.js --allow-pending
node scripts/knowledge/retrieve.js
node scripts/knowledge/retrieve.js '{"concepts":["shi-ying"],"limit":2}'
npm test -- --maxWorkers=1
npm run build
git diff --check
```

当前默认严格校验命令（没有 --allow-pending）会因三个待核单元返回 1，这是预期行为；显式允许留存待核并不会让它们可检索。查询及校验命令不写文件、不自动建立持久索引、不访问网络。
