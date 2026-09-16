# Phase 6 最终报告：Structured 1.1 Rules 离线受控 A/B

日期：2026-09-16。分支：`phase6/rules-ab`。
稳定基点：`1dbc63cae2aab042a64d7d9106128de71b9aa22f`（Phase 5 合并 main，用户已生产人工验收）。

## 最终状态

- **Phase 6A evaluation pipeline complete**：离线评测工具链完成，合成流程验证与真实数据分开。
- **Phase 6B external A/B complete**：真实外部回答已录入，盲评已锁定并解盲，状态为 `external_ab_completed`。
- 真实实验共 8 个定向案例、16 个独立对话，每个对话含首答和统一追问，共 32 段回答。
- 工具的 `effects_conclusion` 仍为 null；以下是已锁定评分的描述性总结，不是统计证明或预测准确率结论。

本次只更新本总结文档，不改变生产代码、评分、实验输入或规则，不提交本地原始实验资料。不 push、不 merge main、不部署，不进入 Phase 7。

## Phase 6B：真实外部 A/B 结果

### 实验身份与核对

| 项目 | 值 |
| --- | --- |
| experiment_id | phase6-external-01 |
| 可见模型 | ChatGPT Web / GPT-5.6 Sol |
| code_commit | ba94f8fee08d1c3d8f3fb708bc9b9c1c0031ded8 |
| 锁定状态 | blind review locked；已解盲 |
| lock_hash | b40f6c69c2c2559f170ee4d311a5019f072bc065ebeac076a16db7c5e3d6fd96 |
| 实验状态 | external_ab_completed |
| 后续基准 | Ruleset r1 / 25 rules；不增加或修改规则 |
| 输入与 Prompt | Structured 1.1 / structured-rules-p1；两组仅 E.enabled/hits 不同 |
| protocol deviation | 无记录偏离 |

本次只读校验锁定资料并重新汇总，结果与本地 `test-results/phase6-run-01/report.json` 完全一致；`report.md` 及用户提供的指标、案例比较也核对一致。此处仅发布汇总，不附原回答、匿名变体到组别的映射、种子、配置或其他本地实验文件。

### 总体指标

| 指标 | Rules OFF | Rules ON |
| --- | ---: | ---: |
| fact_errors | 0 | 0 |
| relation_errors | 0 | 1 |
| relevant_omissions | 7 | 0 |
| fact_overrides | 0 | 0 |
| contradictions | 0 | 1 |
| double_counting | 0 | 0 |
| uncertain | 0 | 0 |
| direction_errors | 0 | 0 |
| checklist_opportunities | 56 | 56 |

**工程观察：Rules ON 在本轮冻结 checklist 中的相关关系遗漏由 OFF 的 7 项降至 0 项，呈现明显减少。** 这是该案例集、该模型、该锁定评分下的计数观察，不代表统计显著性。ON 同时记录 1 项关系错误及 1 项矛盾，不能据遗漏单项下降推断所有维度全面改善；各错误类别也不相加当作互不重叠的独立错误总数。

| 遗漏拆分 | OFF | ON |
| --- | ---: | ---: |
| shi_ying | 2 | 0 |
| month_relation | 5 | 0 |
| 首答 relevant_omissions | 6 | 0 |
| follow-up relevant_omissions | 1 | 0 |

类别拆分与轮次拆分是同一批遗漏的两种视角，不再次累计。

### 案例比较

| 案例 | 已锁定比较 |
| --- | --- |
| case-01 | on_better |
| case-02 | on_better |
| case-03 | same |
| case-04 | unable_to_judge |
| case-05 | on_better |
| case-06 | same |
| case-07 | same |
| case-08 | on_better |

共 4 例 on_better、3 例 same、1 例 unable_to_judge。case-04 的 OFF 有 1 项遗漏，ON 无该遗漏但出现 1 项关系错误和 1 项矛盾，按预定的无权重比较规则保留无法判断，不事后改成某组获胜。方向错误两组均为 0。这些是冻结评判维度内的比较，不是最终预测胜负。

### 输入开销与解释限制

| Prompt 字符数 | 数值 |
| --- | ---: |
| OFF | 156,385 |
| ON | 230,193 |
| 增量 | +73,808 |
| 相对增量 | +47.196%（约 47.2%） |

字符数是完整 Prompt 的 Unicode 字符计数，不等同实际 token 或费用。需要同时保留以下限制：

- 仅 8 个定向案例、单一可见模型，非随机样本，不外推到所有卦例或模型。
- 16/16 对话均记录 `blinding_compromised`，评分者可能推断组别，不能当作完整盲评证据；没有 protocol deviation 不等于盲化成功。
- Prompt 增长约 47.2%，本轮不能分离结构化关系提示与额外上下文长度各自的作用。
- 首答和追问相关，部分案例本变卦相同；56 个核对机会不是 56 个独立随机样本。
- 客户端模型只按可见型号记录，精确后台版本未知，无法保证所有隐藏设置完全受控。
- 不作统计显著性声明，不评价预测准确率，不写成 Rules 已科学验证或已被证明有效。

Ruleset r1 / 25 rules 作为后续比较基准保持不变。本次不根据实验答案临时修订规则、Prompt、问题或遗漏清单，也不启动下一阶段。

## Phase 6A：工具链完成内容

### 冻结 8 个案例及评判依据

`experiments/phase6/cases.json` 保存 8 份 Canonical、来源、question、统一 follow-up、相关性 checklist 和判断理由。`manifest.json` 分别记录 Canonical、问题、追问、含理由 checklist 的 SHA-256，另记录整份数据的哈希。

案例集版本：`phase6-cases-v1`；盲评版本：`blind-review-v1`。
完整案例集哈希：`5619947b697a14303c06e82d803273309ec56781bc18562a7c79d4ee0d8d1845`。

这些内容在查看任何模型回答之前已冻结；准备实验时再次把案例、Prompt、配置、映射和关键源码哈希封存。后续任何已封存字段发生变化都会阻止继续操作。不能根据回复修改遗漏标准。

| 案例 | 冻结来源 | 主要关系 | 命中数 |
| --- | --- | --- | ---: |
| case-01 | Phase 5 既有化进配方，雷火丰→泽雷随 | 化进、回头克、应生世、日冲／日合 | 16 |
| case-02 | static bits=44，火山旅 | 飞生伏、伏克飞、世生应、月合 | 11 |
| case-03 | static bits=60，天山遁 | 伏生飞、飞克伏、世克应、日冲 | 13 |
| case-04 | baseline-14，乾为天→泽雷随 | 化退、世应比和、月破 | 14 |
| case-05 | static bits=5，地火明夷 | 应克世、飞克伏、月破 | 9 |
| case-06 | baseline-17，火水未济→乾为天 | 回头生、伏克飞、日合 | 14 |
| case-07 | baseline-21，火水未济→乾为天 | 动变、旬空、日冲日合及复杂组合 | 17 |
| case-08 | static bits=3，地泽临 | 相对低命中控制，无动变和飞伏 | 9 |

自然覆盖 24/25 条规则；未把飞伏比和的合成 Canonical 补丁混入实际案例。化进继续使用既有手工配方、明确时区与显式日柱，不依赖当天或随机起卦。case-06/07 有相同本变卦，报告不把它们视作完全独立样本。

共 28 个预先指定的相关性核对项，首答和追问分别评判，每组 56 个核对机会。核对项是固定问题明确要求关注的关系，不把未提及所有 hits 自动算作遗漏。没有用神选择或吉凶评分。

### 严格复用 Phase 5 输入

复用 `buildRulesPair()`、`assertRulesAiInput()`、`buildRulesAbRecord()`，没有另外写 formatter 或 Prompt。两组为 Structured 1.1，相同系统指令、外部导出包裹、A/B/C/D 及 E 其他字段，只改变 E.enabled/hits。

每轮保存完整 Prompt 和源码哈希，冻结角色／风格所形成的指令文本。每轮仅允许同一可见模型与设置；实际后台型号不透明时记录 null，不伪称实验条件完全受控。

### 匿名执行与独立评分包

- 执行文件仅命名 case-XX-A/B；schedule 只含 order、case_id、variant，映射及随机种子仅在 private 中。
- A/B 映射及执行顺序分别平衡，4 个 A=ON、4 个 A=OFF；4 个 A先、4 个 B先；4 个 ON先、4 个 OFF先。
- 评分目录必须在实验树外，包含且仅包含 `scoring-packet.json` 和 `reviews.json`。
- 评分包通过白名单构造：匿名原回答、问题、统一追问、中性事实卡、已冻结的 checklist／理由及待填写盲评记录。不带 Prompt、长度、输入、组别、映射、种子或可反查组别的路径。
- 中性资料对同案例两组完全相同；只保留核对事实所需的 Canonical 路径，不携带输入文件或实验目录路径。

**盲化边界：执行包中的原 Prompt 必须保留 enabled/hits，阅读 Prompt 的执行者可能推断组别。** 因此本报告只确认执行文件名及执行清单不泄露额外组别信息，不能宣称执行者完全盲化。隐藏或修改这些字段会破坏已确认的实验条件，本轮没有这样做。

评分者应与执行者分开，只收到独立评分目录。若回答本身提及 E_rule_results、规则层或其他足以推断组别的信息，原文保持不变，要求记录 `blinding_compromised=true` 和理由；报告列出案例及总数。自动检测是补充，间接泄露仍依赖人工判断。

### 原回答、评分及锁定

- 收集每个匿名 variant 的首答和追问原文，保存 UTF-8 内容、换行和哈希；拒绝空回答、重复顺序和覆盖已有归档。
- 收齐 16 个独立对话的 32 段回答后才能生成评分包；生成后关闭该轮回答收集。
- 盲评分 Schema 拒绝未知字段；不允许 confidence、评分权重或事后新增核对项。
- 每项错误关联原文引文与中性事实资料。引用按 UTF-16 索引核验；矛盾需要冲突双方的引文。
- 遗漏必须与冻结 checklist 的 omitted 判断一一对应，uncertain 不当作零错误；所有核对项必须完成。
- 评分完整后才能 lock；锁定绑定输入、回答、评分包和评分文件哈希；之后才允许显式 unblind、report。不存在静默替换旧回答或旧评分的正常命令。

### 汇总口径

报告按 OFF/ON、案例、首答／追问／跨轮、关系类别输出事实错误、关系错误、方向错误、相关遗漏、事实篡改、矛盾、重复加权和 uncertain，并给出核对机会数。

不用加权总分。一组所有指标不更差且至少一项更好，才在该案例列为较好；互有优劣、uncertain 或协议偏离列为无法判断。不同模型需要独立轮次；类别可以交叉，不相加冒充独立总错误数。

Prompt 字符开销在固定默认偏好下为：OFF 156,385；ON 230,193；增加 73,808（约 47.2%）。这是 8 个完整导出合计的 Unicode 字符数，包含缩进，不是 token、真实费用或准确率指标。

## Phase 6A 文件范围（工具链提交）

工具链提交时新增以下文件；本次 Phase 6B 收口仅修改本报告：

- `scripts/phase6-ab.js`：离线 CLI。
- `scripts/phase6/workflow.js`：冻结、导入、分包、锁定、解盲、汇总。
- `scripts/phase6/review-schema.js`：评分 Schema、证据／状态校验、盲化受损检测。
- `experiments/phase6/`：案例、manifest、公开 Schema、配置／导入示例及完整操作说明。
- `tests/phase6/workflow.test.js`：12 项聚合工具测试。
- 本报告及 `docs/acceptance/phase6/` 验收证据。

生产源码、Core、Canonical Schema、25 条规则、Legacy 默认、Structured 1.0／1.1、主页面、静态资源、package.json、依赖锁文件及构建配置均未修改。旧 Phase 5 脚本保持不变。

## Phase 6A 工程验收记录

| 检查 | 结果 |
| --- | --- |
| npm test（最终以 --maxWorkers=1 全量复核） | 12 文件，132/132 通过：原 120 项加 12 项离线工具测试 |
| npm run build | 通过，51 modules；产物命名与 Phase 5 一致 |
| JS / CSS | index-BUs3Mv5n.js 138.55 kB、index-63lbvoss.css 38.54 kB |
| Legacy 浏览器 | 开发版／dist、1280／390；每组 2 次 mock，Prompt／会话／恢复一致，页面错误 0 |
| Structured 1.0 浏览器 | 开发版／dist，各 4 次 mock；复制、追问、恢复锁定通过，错误 0 |
| Structured 1.1 Rules 浏览器 | 开发版 1280、dist 390，各 5 次 mock；同 Prompt、仅 enabled/hits 不同、复制／追问／恢复和旧导出清理通过，错误 0 |
| 完整 CLI synthetic smoke | prepare → 匿名执行包 → import → scoring → 合成 review → lock → unblind → report 全部通过 |
| 评分未完成／未锁定 | 单测确认拒绝解盲、拒绝汇总；pending 不等同零错误 |
| 包隔离 | 执行文件名和 schedule 白名单、种子不外泄；评分包白名单且输出目录必须独立 |
| 原文保护 | 拒绝静默覆盖；保留 CRLF；归档、评分包或锁定资料被改动后拒绝继续 |
| 盲化受损 | 合成原文含 E_rule_results，原文完整保留；必须标记，smoke 报告计为 1 个受损对话 |
| Git 边界检查 | 相对于稳定基点，生产目录及配置零差异；diff/check 通过 |

原 Cannon 经典脚本构建提示保持不变。Legacy 截图最大通道差异 0～2，沿用已有容差。

测试运行记录：前一轮默认并发 `npm test` 已 132/132 通过。提交前再跑默认并发时，旧版 frozen.test.js 触发既有 5 秒超时，其余 131 项通过；未改断言、超时或生产配置。最终以 `npm test -- --maxWorkers=1` 重新执行全量套件，避免并发资源争用，结果见本报告验证表。

验收证据：

- [Legacy 浏览器](acceptance/phase6/legacy-browser.json)
- [Structured 1.0 浏览器](acceptance/phase6/structured-browser.json)
- [Structured 1.1 浏览器](acceptance/phase6/rules-browser.json)
- [Synthetic CLI 完整流程](acceptance/phase6/toolchain-smoke.json)

Synthetic smoke 的回答与评分均为流程占位资料，明确标记 synthetic，位于忽略的 test-results 目录，不混入真实 A/B。其状态是 synthetic_pipeline_validation，effects_conclusion=null。案例冻结前没有查看任何真实模型回答。

## 使用与限制

操作命令、职责分离、完整字段解释见 [离线操作说明](../experiments/phase6/README.md)。无需新增 npm 脚本或 API key，直接调用 `node scripts/phase6-ab.js`。

工具可以验证文件一致性、状态流和证据位置，不能替代人工判断相关性，也不能独立认证客户端真实后台模型、回答来源或是否看过其他上下文。目录隔离不等同操作系统权限隔离；须按角色分别交付资料。

哈希不是签名或可信时间戳。准备时和锁定时应在独立审计位置保存相应哈希。代码更新后不能继续同一冻结轮次；需要用冻结源码完成或开新版本，不以实验答案为理由即时修改规则。

## Phase 6B 文档收口验证

- `npm test -- --maxWorkers=1`：12 个文件，132/132 通过（68.04 秒）。
- `npm run build`：通过，51 modules；JS/CSS 仍为 index-BUs3Mv5n.js / index-63lbvoss.css；既有 Cannon 经典脚本提示保持不变。
- `git diff --check`：通过；仅本报告发生变更，生产源码、规则、Prompt、实验工具及冻结案例均无修改。
- 本轮为文档收口，没有重跑浏览器或模型实验；上方浏览器记录属于 Phase 6A 历史验收。
- 仅暂存本报告；未跟踪的本地 my-config.json 原样保留，不纳入提交，也不改动其内容。

## 最终收口范围与停止点

**Phase 6A evaluation pipeline complete；Phase 6B external A/B complete。**

本次仅修改 `docs/PHASE_6_REPORT.md`，记录已锁定的真实实验汇总与限制。原始回答、private mapping、seed、my-config 及临时文件均不提交；此前 synthetic 验收文件保持其历史含义，不混入真实实验数据。

单独提交实验结果文档到 phase6/rules-ab，不 push、不 merge main，不修改生产代码或 Ruleset r1 / 25 rules。完成后停止，不进入 Phase 7。
