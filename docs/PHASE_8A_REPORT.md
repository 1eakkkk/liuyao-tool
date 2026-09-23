# Phase 8A：Knowledge Hardening 最终报告

## Phase 8A.1：同底本上下文只读审计

Phase 7.3B 的单模型、12 个定向案例中，month-combine 的 `literature_overreach` 为 OFF 1 / ON 2。ON 的两次事件来自同一个 case-04 会话的 initial 和 follow-up，OFF 在 case-04 也出现同类倾向；1 → 2 是事件数变化，不是两个独立案例恶化。这个观察只是调查起点，不能据此断言 Knowledge 导致错误或整体无效。

Phase 8A.1 重新取得 Phase 7.1 指定的**同一** 1925 年 11 月文明书局本影像，镜像标识 `NLC416-12jh005345-45344`。文件 394 页、11,089,308 字节；SHA-256 为 `caac111bc5c5b1c08fd27b3828e7cf6b5430503800f2427d8f2b28809022abaa`，与 SourceEdition 一致。影像第 60 页／书内“四〇”起《月將章第十六》标题，第 61–66 页／书内“四一”至“四六”为正文。第 61 页影像可独立确认以下转录差异：

| 位置 | Phase 7.1 记录 | 同底本影像 |
| --- | --- | --- |
| `zsby-1925-s3` 末句 | `月沖之爻則爲月破無用之爻也。` | `月沖之爻。卽爲月破無用之爻也。` |

“爻”后的小圈句读与“卽”均按版面转录；原有大圈 `○` 保留。底本的圈点与项目整理句读须区分，原记录存在“則→卽”和句读漏录问题。同版影像表明，现有片段对“月合”命名基本足够，但不足以完整呈现同章紧邻文字对“有用”的作用语境。8A.1 仅做只读审计，没有修改影像、语料或历史实验。

## Phase 8A.2：月合底本转录与解释边界

Phase 8A.2 基于上述独立的文本及知识层级理由修正语料，不以已见模型回答作为唯一依据。本轮刻意**不扩段**，避免同时引入更多正文、Prompt 字符和解释变量。可供未来独立评估的唯一扩段候选是影像第 61 页／书内“四一”，从“用神伏藏被飛神壓住者”至“不入卦者緩之。”；这段文字当前未录入正式 SourceSegment。

### 语料修订

- `zsby-1925-s3`：记录 revision 1 → 2，transcription revision 1 → 2；修正“則→卽”并恢复原版圈点。片段范围仍是同一短段。
- `zsby-month-combine-001`：revision 1 → 2，引用 segment revision 2，Unicode span `0..46` → `0..47`，`original_text` 与修正片段完全一致。`normalized_statement` 只概括命名与作者“有用／无用”的评价措辞；个案实际效力与最终结果的边界写在项目整理的 `applicable_conditions`／`exclusions`，不冒充古籍原文。`exceptions: none_stated` 保持原语义，不制造古籍例外。
- 两条记录保留 reviewed 状态；related concepts、r1 rule ID、`association_only` 不变。其余 SourceSegment、KnowledgeUnit 和 catalog 不变；仍为 7 reviewed / 3 source_checked，Ruleset r1 仍为 25 条。

| 版本 | Corpus SHA-256 | 用途 |
| --- | --- | --- |
| `phase7.1-initial-1` | `sha256:1b24872a9533ef5d94576c2f8df3489eb221c69f7dfbf0167cdc6e00ab868729` | Phase 7.3B 历史实验；原内容存于 `knowledge/versions/phase7.1-initial-1/`，未改写历史输入 |
| `phase8a-month-combine-hardening-1` | `sha256:aa3522aebb7e4ad18b54e144ea26499323e55838f79856fdd59f2c53baadcda3` | 后续实验的候选默认语料 |

上述哈希由完整记录与 catalog 的稳定序列化**重新计算**；离线 loader 对命名版本另做哈希一致性检查，不能用最新文件静默替换旧版本。版本选择可以显式传入 `readCorpus({ version })` 或 `loadCorpus({ version }, registryOptions)`；loader 在内存中保留选定版本身份，不向封闭的 Corpus Schema 增字段。旧 Phase 7 CLI 的回归测试显式设置 `LIUYAO_KNOWLEDGE_CORPUS_VERSION=phase7.1-initial-1`。检索过滤、排序、去重和 `deterministic-literature-1.0` 策略均未修改。Structured 1.2 仍锁定 Phase 7.1 语料及其 hash；当前不能把新语料冒充为其冻结实验输入。离线投影兼容性检查只确认新字段可完整装入现有 F 白名单结构，不代表已运行新的模型实验。

### 验证边界

本次验证涵盖逐字片段、记录与转录修订、哈希与旧快照、原文 span、审核状态、r1 关联、确定性检索、F 字段完整性及历史 Structured 1.2 隔离。Phase 7.3B 的 FREEZE、LOCK、Prompt、原始回答、盲评与报告均不修改。实验当时使用的仍是 `phase7.1-initial-1`，不能改称新语料。

**本轮只能确认 corpus fidelity 与 KnowledgeUnit 使用边界得到修正。** 不宣称 `literature_overreach` 已被修复，也不宣称模型今后不会过度泛化；模型行为改善需要新的独立 external evaluation，不能复用已见的 case-04 作为独立效果证明。

### Reproducibility infrastructure note

旧评测冻结使用工作树原始字节作为源文件 hash。8A.2 当时检查 65 项：24 项原字节匹配，38 项将工作树 CRLF 规范为 LF 后匹配，另外 3 个 Phase 7 评测脚本仍不能仅由简单换行规范化复现；相关 Git 内容无差异，不能在缺少当时工作树字节副本时断言这 3 项的唯一原因。该发现促成下述独立的 8A.3 工作；8A.2 未修改 `.gitattributes`、冻结算法或旧 FREEZE。

### 完成检查

- `npm test -- --maxWorkers=1`：17 个测试文件，268/268 通过（原 260 项 + 8 项针对性测试）。
- `npm run build`：通过，51 个模块；产物 `index-BUs3Mv5n.js` 与 `index-63lbvoss.css` 文件名保持原样。现有 Cannon 非 module 脚本提示仍在。
- `git diff --check`：退出码 0。Windows 工作树的 LF／CRLF 提示不构成空白错误，也不修改本轮冻结策略。
- 未改 Core、Canonical、Rules、Structured 1.2、Prompt、生产 UI/API 或历史实验文件；没有扩充 SourceSegment，也没有进行新的外部 A/B。

## Phase 8A.3：独立的可复现性基础设施

Phase 8A.3 不再调整月合语料或解释边界。新增的 [REPRODUCIBILITY.md](REPRODUCIBILITY.md) 单独定义未来实验的 commit + Git blob tracked source identity、生成／外部文件的 raw-byte SHA-256、脏工作树拒绝策略和 v1 只读兼容状态。`prepare` 默认拒绝有实际内容变更的 tracked source；untracked／ignored 的实验产物不影响该 source cleanliness 检查。旧 FREEZE 不重算，也不修改 `.gitattributes`；本节不对 Phase 7.3B 的 month-combine 效果作新结论。

Phase 8A.3 的 synthetic freeze-v2 fixture 不调用外部模型。LF 与 CRLF 工作树表示改变后，同一 Git blob 仍通过验证；真实源内容、暂存内容、回答或 PDF 的字节改变均使相应验证失败。历史 v1 的只读兼容器分别返回 `exact_match`、`content_equivalent_git` 或 `unverifiable`，不把 Git 内容相同伪装为旧工作树字节精确相同。当前 Phase 8A.2 checkout 下读取本地 Phase 7 外部轮次：旧封存文件的原始字节检查通过，源码状态为 `unverifiable`（41 项工作树字节不符、4 项 Git 源 blob 后续改变）。这不修改或重新解释旧 FREEZE。

`npm test -- --maxWorkers=1`：18 个文件、277/277 通过（原 268 项 + 新增 9 项）；`npm run build`：通过、51 模块、JS/CSS 产物名未变；`git diff --check`：通过。两版 corpus hash 保持上表数值，生产入口及历史实验文件无差异。

## Phase 8A 最终结论

Phase 8A improved corpus fidelity, clarified the literature interpretation boundary for month-combine, and hardened future experiment source identity across checkouts. 这些修改具有独立的文本、结构和可复现性理由。

是否降低模型 `literature_overreach` 尚未经过新的独立 external evaluation；本阶段没有运行新的外部 A/B，也不对预测准确率或模型质量作效果判断。
