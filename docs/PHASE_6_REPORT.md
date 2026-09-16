# Phase 6 报告：Structured 1.1 Rules 离线受控 A/B 工具链

日期：2026-09-16。分支：`phase6/rules-ab`。
稳定基点：`1dbc63cae2aab042a64d7d9106128de71b9aa22f`（Phase 5 合并 main，用户已生产人工验收）。

## 结论与真实实验状态

**evaluation pipeline ready：评测工具链完成。真实外部 A/B 实验尚未执行。**

- 真实外部模型回答：0。
- 真实 API 调用：0。
- 本轮只用明确标记为 synthetic 的回答与合成评分验证完整流程。
- 没有真实盲评、锁定、解盲后的模型效果数据，不宣称 Rules ON/OFF 已完成效果实验，不给出优劣结论。
- 工具输出区分 `synthetic_pipeline_validation` 与 `external_ab_completed`；`effects_conclusion` 保持 null。

本阶段已按要求停止。不进入 Phase 7，不 push、不 merge main、不部署。

## 完成内容

### 冻结 8 个案例及评判依据

`experiments/phase6/cases.json` 保存 8 份 Canonical、来源、question、统一 follow-up、相关性 checklist 和判断理由。`manifest.json` 分别记录 Canonical、问题、追问、含理由 checklist 的 SHA-256，另记录整份数据的哈希。

案例集版本：`phase6-cases-v1`；盲评版本：`blind-review-v1`。
完整案例集哈希：`5619947b697a14303c06e82d803273309ec56781bc18562a7c79d4ee0d8d1845`。

这些内容在查看任何模型回答之前已冻结。本轮没有真实回答；准备实验时再次把案例、Prompt、配置、映射和关键源码哈希封存。后续任何已封存字段发生变化都会阻止继续操作。不能根据回复修改遗漏标准。

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

## 文件范围

全部为新增文件：

- `scripts/phase6-ab.js`：离线 CLI。
- `scripts/phase6/workflow.js`：冻结、导入、分包、锁定、解盲、汇总。
- `scripts/phase6/review-schema.js`：评分 Schema、证据／状态校验、盲化受损检测。
- `experiments/phase6/`：案例、manifest、公开 Schema、配置／导入示例及完整操作说明。
- `tests/phase6/workflow.test.js`：12 项聚合工具测试。
- 本报告及 `docs/acceptance/phase6/` 验收证据。

生产源码、Core、Canonical Schema、25 条规则、Legacy 默认、Structured 1.0／1.1、主页面、静态资源、package.json、依赖锁文件及构建配置均未修改。旧 Phase 5 脚本保持不变。

## 验证结果

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

## 停止点

**本轮交付的是 evaluation pipeline ready。真实外部 A/B 未开始，尚无 Rules OFF/ON 效果结论。**

单独提交到 phase6/rules-ab；不 push、不 merge main，不进入 Phase 7。真实实验需要之后按操作说明收集外部回答并完成独立盲评，本轮不自动执行。
