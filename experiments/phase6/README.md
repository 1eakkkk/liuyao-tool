# Phase 6 离线受控 A/B 操作说明

## 范围与状态

只比较 Structured 1.1 Rules OFF/ON 的局部事实关系使用情况。不评价预测准确率，不修改 25 条规则、Core、Canonical、Prompt 或生产入口。不使用 API；本工具不会联网发送提示词。

案例集 `cases.json` 和 `manifest.json` 已冻结 8 份 Canonical、问题、追问、相关性 checklist 及理由。清单是定向诊断集，不是随机样本；case-06/07 的本变卦相同，不是独立重复。飞伏比和合成补丁不进入实验。

每案例两份提示词，16 个独立对话；每对话一次首答和一次统一追问，共 32 段回答。首答与追问在同一对话内连续进行，不把另一组答案传入。一次实验只用一个可见模型与设置；其他模型另建实验目录。

## 角色隔离

- 准备者保管整个实验目录，尤其 `private/`、映射、随机种子和 Prompt。
- 执行者只收到 `execution/`。输入的 enabled/hits 及长度会透露处理，不能保证执行者完全盲化。
- 评分者只收到单独生成的评分目录，不能接触整个实验目录、执行包、映射、长度记录或准备配置。
- 工具要求评分目录在实验树外（包括链接解析后的路径）。目录分离不是操作系统权限隔离：准备者仍须真正分开发送目录，最好由另一人评分。
- 即使不看映射，回答自身仍可能暴露规则层；保留原文，记录 `blinding_compromised=true` 并说明原因。自动标记检测只是补充，评分者仍需判断间接泄露。

## 1. 准备并冻结一轮

复制 `config.example.json` 到自己的工作目录，填入客户端、可见模型名及设置。未知版本、推理设置或温度用 null，不伪造控制精度；可见开关如搜索、记忆需按实际填写。示例里的 false 不是工具替你关闭客户端开关。

```text
node scripts/phase6-ab.js prepare test-results/phase6-run-01 my-config.json
```

输出：

```text
phase6-run-01/
  FREEZE.sha256
  execution/                 # 只交给执行者
    case-01-A.txt
    case-01-B.txt
    case-01-follow-up.txt
    schedule.json
    INSTRUCTIONS.txt
    ...
  private/                   # 评分前不给评分者
    cases.json
    manifest.json
    plan.json
    seal.json
    case-01-A.input.json
    ...
```

准备时自动复用 Phase 5 `buildRulesPair()`，检查两组仅 E.enabled/hits 不同。系统 Prompt、外部导出包裹、A/B/C/D 及其余 E 内容相同。CLI 使用无浏览器 localStorage 的默认角色／风格；完整 Prompt 文本和关键源码哈希一起冻结。

默认使用随机种子并只保存在 private；可由准备者提供 seed 复现映射，但不能把 seed 交给评分者。A/B 映射与执行顺序分别平衡：4 个 A=ON，4 个 A=OFF；4 个 A先、4 个 B先；4 个 ON先、4 个 OFF先。按 schedule 实际执行，不按文件系统排序执行。

**在查看任何模型回答之前保存 FREEZE.sha256 到单独的审计记录。** 每次后续操作都会校验冻结文件；已有目录不可覆盖。question、follow-up、checklist、理由或源码变动需要新案例版本／新实验，不能在同一轮更新后继续。

哈希能发现普通变更，不是数字签名或可信时间戳。拥有全部文件写权限的人可以整体重写哈希；外部保留冻结哈希和 Git 历史才有更好的审计价值。

## 2. 在客户端执行并导入原文

按 schedule 顺序复制对应 Prompt，保持同模型与设置，每份独立新对话。随后在各自原对话发送统一 follow-up。不要手工改 Prompt、重排规则、额外提醒其中一组或选择性重试。

保存首答和追问回答为 UTF-8 文本。工具保留文本原始内容（包括 CRLF/BOM），不删掉回答中泄露规则层的文字。不能用空文件代替缺失回答。

复制 `import.example.json`，填写案例、匿名 variant、首答／追问文件、实际执行顺序、可见型号、设置及偏离说明。usage 和 latency 可以为 null。usage 只接受非负整数或 null；手工用时格式为：

```json
{"milliseconds": 45000, "source": "manual_wall_clock"}
```

```text
node scripts/phase6-ab.js import test-results/phase6-run-01 my-import.json
node scripts/phase6-ab.js status test-results/phase6-run-01
```

实际顺序是客户端执行顺序，不是文件导入顺序。顺序偏离自动留痕；截断、额外上下文、重试等写入 deviations。型号或设置不一致会拒绝混入同轮。已有回答不可覆盖；需要重试时保留本轮并另开一轮，不能挑选满意答案替换。

归档保留两段原文和各自 SHA-256，以及 Phase 5 记录字段：input_mode、rules_mode、model、Prompt／AI Input／ruleset 版本、payload_hash、response_hash、rule_result_hash、usage、latency。对外部客户端的实际后台版本和来源只能依靠诚实记录，工具不声称能独立验证。

## 3. 生成独立评分包

收齐全部 16 份首答＋追问后：

```text
node scripts/phase6-ab.js scoring test-results/phase6-run-01 test-results/phase6-scoring-01
```

仅发送 `phase6-scoring-01/` 给评分者，内含：

- `scoring-packet.json`：匿名回答、问题、统一追问、中性事实核对资料、冻结 checklist 和理由。
- `reviews.json`：待填写的盲评记录。

包中不包含 OFF/ON、enabled/hits 元数据、Prompt、Prompt 长度、映射、种子、原始 fixture 路径或可反查组别的实验目录路径。中性事实卡对该案例两组完全相同，可含 Canonical 字段路径及局部关系方向，不能据此定位某组。原回答本身如出现敏感标记，按盲化受损处理，绝不删除。

生成评分包即关闭本轮回答收集，防止评分后换回答。

## 4. 盲评

规范见 `review.schema.json`；运行时还有证据、核对项、状态一致性校验。评分者填写 reviewer_id、review_status=complete 和必要的理由。所有 checklist 的首答、追问项目必须分别判断，不能留下 pending。

只评价：fact_errors、relation_errors、relevant_omissions、fact_overrides、contradictions、double_counting；不明确的放 uncertain。禁止评分权重、confidence 或综合吉凶分数。

### 核对规则

- 未提及所有局部关系不自动判遗漏。只能按已经冻结的 checklist 和理由判；不得读完答案后增补遗漏标准。
- checklist_assessments 每项填 used / omitted / uncertain 和判断理由。omitted 必须对应一条 relevant_omissions；uncertain 必须对应 uncertain 条目。遗漏没有对应原文片段，可以不填 quotes。
- 其他确定错误要引用原文；事实或关系错误须关联中性 fact_id。`expected` 值从事实卡查阅，写入 reason 说明冲突，不能自造另一套盘。
- quote 的 start/end 使用 JavaScript UTF-16 索引，end 不包含；text 必须与原文该区间严格一致。可用 `answer.indexOf(quote)` 查起点，再加 `quote.length`，不要按中文字符数或字节数猜位置。
- 矛盾需两处冲突引用；跨首答／追问矛盾设 turn=cross_turn，并分别引用两轮。明确纠正自身旧错与无说明地改写事实要区分；事实错误与合理改正可以分别留痕，不自动把所有修正当矛盾。
- direction_error=true 的发现须出现在 relation_errors 中。
- 同一事件跨类别使用同一 finding_id 和同一内容，各类别分别统计，但不相加为独立总错误。类内禁止重复 ID。重复措辞不是重复加权，须有将同一事实当两份独立依据累计的明确证据。
- blinding_compromised=true 需要 blinding_note；自动检测到明显规则层标记时不能改回 false。间接透露组别也应人工标记。

示例（仅结构；引文和 fact_id 要换成真实材料中存在的值）：

```json
{
  "finding_id": "finding-01",
  "turn": "initial",
  "quotes": [{"turn":"initial","start":0,"end":4,"text":"原文片段"}],
  "fact_ids": ["relation-3"],
  "checklist_id": null,
  "direction_error": true,
  "reason": "该表述与事实卡中的关系方向相反。"
}
```

事实卡属于冻结输入下的程序契约依据，不是传统预测有效性的独立证明。无法判定的问题不得强行判输赢。

## 5. 锁定后解盲和报告

```text
node scripts/phase6-ab.js lock test-results/phase6-run-01 test-results/phase6-scoring-01/reviews.json
node scripts/phase6-ab.js unblind test-results/phase6-run-01
node scripts/phase6-ab.js report test-results/phase6-run-01
```

lock 检查全部评分、原文证据、归档、输入与评分包，再保存不可覆盖的评分快照和锁定哈希。保存输出的 lock_hash 作为外部审计记录。未完成评分不能解盲；锁定后不能修改同轮评分，报告会拒绝被改动的资料。

报告包含：

- 各指标 OFF/ON 计数、方向错误子集、uncertain 与核对机会数。
- 首答／追问／跨轮、关系类别拆分；类别可以交叉，不合计成独立总数。
- 每案例计数、比较、协议偏离、盲化受损状态。
- 每案例和全体 Prompt Unicode 字符增量，不冒充 token 或费用。
- 原记录、哈希和原回答／锁定评分的证据索引。

案例比较不使用加权总分：所有指标不更差且至少一项更好，才列为该组较好；全同为 same；指标互有优劣、存在 uncertain 或协议偏离为 unable_to_judge。盲化受损另行标明，不把它变成吉凶或事实错误分数。

真实外部数据完成上述全流程才标记 external_ab_completed；合成回答永远标记 synthetic_pipeline_validation。效果结论字段默认 null；不做统计显著性、预测准确率或“Rules 已证明有效”的结论。

## 验证与停止点

`npm test` 自动包含 Phase 6 工具测试；原 build 和三套 browser 命令不变。资源紧张时可用 `npm test -- --maxWorkers=1` 串行执行全量套件，保留原断言与超时。单测用临时目录的合成回答验证工具，不计入真实样本。本阶段交付工具链后停止；没有外部回答时真实实验保持待执行，不进入 Phase 7。
