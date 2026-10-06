# 个人计划取法准入 · 第二轮固定小样本（2026-10-07）

## 本轮结论

**计划内 2 次调用全部用尽，未重试。两条回复都通过校验，零问题。**

| 用例 | 依据 | 方向 | 因素 | 结果 |
| --- | --- | --- | --- | --- |
| plan-recheck | `plan-shi-return-control`（回頭克） | `unclear` | 1 项，`conditional` | `validated` |
| plan-advance | `plan-shi-advance`（化進）＋`plan-shi-day-clash`（日冲旺衰） | `unclear` | 2 项，均 `conditional` | `validated` |

两条传输均为 `strict_tool`、`finishReason=tool_calls`、`bodyComplete=true`、`envelopeValid=true`。

## 本轮相对第一轮的改动

第一轮唯一回复被 `program_attribute_in_explanation` 拦下，原因是模型在 `factors[].interpretation` 里复述了程序已展示的卦盘方向。本轮在 `factors[].interpretation` 的字段说明里写明「程序已在上方展示本依据的原文方向；此处不要再复述爻位、六亲、动静、生克或月令等盘面属性」。**`plan-recheck` 与第一轮同盘同题，只差这一行说明**，本轮通过——这是一次 A/B，不是新题。

同一轮还修正了一处真实缺陷：机制查找原先按 `entry.target.line` 绑定，而目录里的规则条目 `target` 为 `null`、目标爻位只写在证据 id 里，导致**化进／化退、月合／月破、日冲三条机制从未生效**，只有走 `t{line}` 的回头机制能命中。修正后 `plan-advance` 首次真正走到了「化進」机制。

## 逐项判断

### 1. 事实正确

程序事实由程序另行展示，两轮回复均未改写：`plan-recheck` 的世爻为第 4 爻父母亥水（动、月令相）、变爻妻财丑土、`t4` 方向为变爻克本爻；`plan-advance` 的世爻为第 1 爻妻财寅木（动、化卯木）、`k7` 为化进、`k6` 为受日冲。未见数值或属性错误。**通过。**

### 2. 取法适用

两条回复的 `application.goal_link` 都把机制的局部方向与「能否继续推进」相连，并自述为「模型提出的关联假设，关系现实成立与否仍需核实」；`perspective` 均为 `self`，`mapping_id` 均在准入集合内；`effect_scope` 均为 `requires_conditions`，未把关联当作已成立。未引入用神、父母爻或其他未准入依据。**通过。**

`plan-advance` 的第二项（日冲）把「暗动／日破」两种相反读法都摊开，并明确说明「两种解读都只是模型假设，指向相反，故不构成任一方向的依据」——这正是该机制的适用条件所要求的处理。**通过。**

### 3. 解释未越界

两轮回复的全部 `interpretation` 均未出现爻位、六亲、动静、生克或月令原文，程序亦未报 `program_attribute_in_explanation`。`plan-recheck` 写「只说明一个假设角度，不能判断现实中整理是否真的会受阻」；`plan-advance` 写「并不说明项目会成功、资源会到位或你确有持续投入的意愿与时间」。`uncertainties` 明确列出未核实的现实条件。**通过。**

### 4. 取舍是否成立

两轮 `direction` 均为 `unclear`，`assessment` 均为 `conditional`，`judgment.basis_ids` 与本轮所列因素一致，`judgment.reason` 明确写出「现实前提均未核实，既不足以支撑推进，也不足以判为阻碍」。

值得注意的是：本轮**没有**给出「偏有利」或「偏不利」。`plan-advance` 明明列有化进（方向向前）与日冲两项，合理的做法本可以是给一个倾向；模型仍取 `unclear`，理由是现实前提未确认。这与「对应条件未确认时不得作为确定支持或阻碍」的限定一致，属于守界而非失效。**通过，但须说明：本轮证明的是「有依据、有主次、不越界、不能判断时说清缺口」，不是「能给出吉凶倾向」。**

## 三次缺口期望

| 用例 | 判定 | 是否调用 |
| --- | --- | --- |
| plan-chart-gap | `chart_basis_missing` | 未调用，已拦截 |
| plan-method-gap | `method_not_covered` | 未调用，已拦截 |

`chart_basis_missing` 本轮换用了真正没有可用依据的盘（世爻静、月旺、无合无冲）。第一轮所用的盘其世爻实为**月破**，属于月將章第十六已覆盖的机制，第一轮把它记为「卦盘依据缺失」是错的——那是机制绑定缺陷造成的假象，已在第一轮记录中更正。

## 费用

两次调用发生在北京时间约 21:30（空闲时段，2026-10-06 周二）。按空闲单价（缓存命中输入 ¥0.02、未命中输入 ¥1、输出 ¥4 每百万）计算：

- `plan-recheck`：`2048×0.02 + 4350×1 + 775×4` → 约 **¥0.0075**
- `plan-advance`：`1792×0.02 + 5004×1 + 1233×4` → 约 **¥0.0100**

合计约 **¥0.0175**。计划内 `conservativePeakCostCny`（¥0.018996 与 ¥0.023456，按高峰价、未区分缓存）保留不改，仅作按封盘价计算的值。预留 ¥0.4，未释放。

## 本轮不能声称的事

- 不能声称预测准确率得到验证。两轮均为单盘单题，样本 2，且方向全部落在 `unclear`。
- 不能声称这一类已能产出吉凶倾向。本轮只证明有限观察可以完整、守界地给出。
- 每次调用都是同一张盘、同一题目的一次性结果，不是重复抽样，也没有做盲测。
- 未扩古籍数量、未加服务商、未改界面结构；未接入任何未通过的三层候选。

## 归档

`plan.json`/`plan.sha256`、`execution.json`、`budget.json`、`run.mjs`；每个用例的 `-attempt.json`、`-archive.json`、`-provider.json`、`-response.txt`、`-check.json`。凭据不入档；无 `*-failure.json`。
