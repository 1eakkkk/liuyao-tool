# Knowledge Layer：Phase 7.0 结构与出处契约

## 状态与边界

当前仅提供离线结构、出处和准入校验。正式 sources、classics、units、commentary 均为空，catalog 也没有正式概念记录。底本尚未确认，没有录入任何经典知识。

不修改 Core、Canonical、Ruleset r1 的 25 条规则、Legacy、Structured 1.0/1.1、Prompt、UI 或部署配置。不实现检索、去重、AI 注入、Structured 1.2、案例 Schema 或实验效果评测。

## 目录与依赖

```text
knowledge/
  sources/                SourceEdition，每个 source_id 一个 JSON
  classics/               SourceSegment，原文与历史注释由 text_role 区分
  units/                  KnowledgeUnit，项目整理的命题与适用边界
  commentary/             Commentary，独立的现代注释
  catalog/catalog.json    受控概念、别名、分类、标签；当前为空
src/knowledge/
  schemas.js              独立的封闭 Schema
  validate.js             Node 离线结构、引用、哈希和准入校验
scripts/knowledge/
  validate-corpus.js       只读命令，读取上面的固定目录
tests/knowledge/
  fixtures.js             明确 test_only 的虚构数据
  contracts.test.js       契约及准入测试
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

related_rule_ids 仅供关联索引，校验只能通过当前注册表中存在的 r1 ID。它不会生成/修改规则，也不能说明经典证明了代码规则正确。关联本身不是另一份证据。未来 AI 注入必须保留 Canonical 确定事实 → Rule 标准化命中 → 文献解释的层级，同一事实不得重复计权。本阶段不实现 AI 注入或去重算法。

## Commentary

共同字段之外：`commentary_id`、`source_type:'modern_commentary'`、`contributors[]`、`statement`、`segment_refs[]`、`knowledge_refs[]`、`related_concepts[]`、`tags[]`。

至少引用一个片段或知识单元，引用锁定 revision；片段引用同样校验 span。作者角色同 SourceEdition，不允许无署名依据的自动生成解释成为 reviewed 资料。Commentary 是现代注释，不复用 KnowledgeUnit 的经典原文角色，也不默认进入未来 AI 输入。

## Catalog

`schema_version/revision/concepts/categories/tags`。

- concepts：`concept_id / label / aliases[] / definition`。
- categories：`category_id / label`。
- tags：`tag_id / label`。

ID 各集合唯一；label/alias 不能跨概念重复而产生歧义。繁简、异名只记录为别名，不改写原文。自由 tag 不得替代概念 ID。本阶段表为空，只建立结构；不实现关键词归一化、检索或索引构建。

## 哈希、历史和准入

record content_hash：对去掉顶层 content_hash 的完整记录递归按对象键排序，数组次序保留，以紧凑 JSON 的 UTF-8 字节计算 SHA-256。它覆盖出处、原文引用、状态和备注。它不同于 text_hash（转写文字）及 artifact_hash（原始文件）。哈希只提供完整性检查，不能认证古籍或审核者的真实性。

`validateCorpus(corpus,{ruleIds,rulesetVersion,mode,previous})` 返回 counts、admitted ID 集合与 excluded 原因；不改写传入数据。

- production 模式拒绝任何 test_only、fixture method、test_only rights；fixture 模式仅接受 test_only。
- 正式准入须 reviewed、出处完整、可复用依据明确、无未解决争议，且上游 SourceEdition → SourceSegment → KnowledgeUnit 全链条准入。Commentary 的所有引用同样须准入。
- 结构有效的 draft 可以留存，但不会自动升级为 reviewed 或准入。
- 传入 previous 时，已存在记录不能删除；内容变化要求 revision 恰好加一，片段文字变化还要求 transcription_revision 加一；catalog 变化要求独立 revision 加一。supersedes 必须能追溯到此快照。既有引用随 revision 明确更新，不自动改指向。
- 未提供 previous 时只能校验当前快照，不能验证完整编辑历史；命令当前不承担历史库管理。首次正式录入和更新流程留到 7.1 确认。

## 操作与测试

```sh
node scripts/knowledge/validate-corpus.js
node scripts/knowledge/validate-corpus.js path/to/corpus
npm test -- --maxWorkers=1
npm run build
git diff --check
```

命令只扫描 sources/classics/units/commentary 的 JSON 和固定 catalog/catalog.json，拒绝软链接与非 JSON 数据文件（空目录 .gitkeep 除外）。不扫描 tests/、本地实验或用户配置，不写入文件。退出码 0 表示结构通过且没有被排除的记录；格式错误、fixture 混入或存在不准入记录时为 1。空库通过只说明结构就绪，不能理解为已有可用知识。

测试数据位于 tests/knowledge，全部为虚构且标记 fixture/test_only，不能作为经典知识。准入测试会在内存中模拟 corpus/reviewed 状态验证门槛，不将模拟数据写入正式库。防护依赖显式标记与目录隔离，不能识别蓄意去掉所有标记后伪装的文献；真实入库必须审核原件。

## 未来案例边界（本阶段无 Case Schema）

- 案例必须独立于经典正文、结构化知识单元和现代注释。
- 古籍记载结果、现代用户报告、外部核验结果必须区分，不能都标作已证实结果。
- Phase 6 模型回答是评测材料，不是现实案例。
- 真正案例 Schema、检索、benchmark 和数据泄漏防护留到未来案例阶段单独设计。

## 停止点

本阶段完成结构和出处契约后停止。未确认底本，不录入正式知识，不进入 7.1，不实现 retrieve/dedupe/knowledge-input/Structured 1.2/build-index/export-pair，不进行效果或预测准确率声明。
