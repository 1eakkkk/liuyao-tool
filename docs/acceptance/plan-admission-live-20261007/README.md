# 个人计划取法准入 · 固定小样本验收（2026-10-07）

## 本轮结论

**计划内 1 次调用已用尽，未重试。协议层通过，内容层被程序正确拦下。**

原始回复：`plan-covered-response.txt`（未修改）。
判定：`fallback`，唯一问题 `program_attribute_in_explanation @ $.factors[0].interpretation`。
传输：`strict_tool`，`finishReason=tool_calls`，`bodyComplete=true`，`envelopeValid=true`。
用量：输入 6370（命中缓存 1792）、输出 858；上界费用 ¥0.019604（高峰价 2/8 每百万）。预留 ¥0.2，未释放。

## 三次「不调用」期望（均通过，费用 0）

| 用例 | 问题类型 | 程序判定 | 是否拦截 |
| --- | --- | --- | --- |
| plan-covered | 个人计划，本盘有依据 | `conditions_unconfirmed` | 不拦截，生成有限观察 |
| plan-chart-gap | 个人计划，本盘缺依据 | `chart_basis_missing` | 拦截 |
| plan-method-gap | 覆盖外目标 | `method_not_covered` | 拦截 |

三种缺口在同一批次内分别命中，互不混用。

## 真实调用逐项判断

### 1. 事实正确（程序侧）

可核对事实由程序另行展示，不依赖模型：世爻为第 4 爻父母亥水、动爻、月令相；变爻为妻财丑土；`t4` 方向为变爻克本爻。原始回复未改写这些事实，未出现数值错误。**通过。**

未纳入自动核对的属性本轮未被模型当作已知事实使用。**通过。**

### 2. 取法适用

准入取法为 `plan-shi-return-control`，其来源为《增删卜易·動變生尅沖合章第十五》已转录段（影像第 58 页），引文与定位由 `tests/output/plan-admission.test.js` 钉在转录上。

模型给出的 `application.goal_link` 把「自身推进环节的局部方向」与「能否持续推进整理」相连，并自述为「模型提出的关联假设，尚未落实为现实作用」；`effect_scope=requires_conditions`，唯一条件标为 `unconfirmed`。未把关联当作已成立，也未引入用神、父母爻或其他未准入依据。**通过。**

### 3. 解释未越界 —— 未通过（如实记录）

`$.factors[0].interpretation` 开头写「**变爻对其本位动爻呈现回克方向**」。这是程序已另行展示的卦盘属性（`t4` 的方向），按规定不得在解释里复述，程序判为 `program_attribute_in_explanation`。

这是**正确的拦截**，不是误判：解释字段的职责是解释所选依据能支持的目标相关含义，而不是重新陈述程序事实。该回复因此停留在 `fallback`，用户看到原文与失败原因，而不是一条被包装成通过的结论。

同一回复中未被拦下的部分经检查未越界：`main_choice.reason`、`role.meaning`、`judgment.reason`、`general_advice` 与 `uncertainties` 均未复述爻位、六亲、动静或生克原文，`uncertainties` 明确写出数量、时间、场地未记录。`general_advice` 是方法建议，未冒充盘面依据。

### 4. 取舍是否成立 —— 只在措辞层成立

`judgment.reason` 的推理是：唯一因素为条件性、关键现实前提未记录，故不构成明确支持或阻碍，方向取 `unclear`，并建议先记录数量与时间。主次关系与 `conditional` 限定一致，未把未确认条件当作已成立。

但它建立在被拦下的解释之上，因此本轮**没有产出一条通过校验的取舍**。这一点不计为通过。

## 本轮不能声称的事

- 不能声称个人计划这一类已经产出通过校验的解读。本批唯一真实回复被程序拦下，属于**解释越界被正确阻断**，不是解读能力已验证。
- 不能声称预测准确率得到验证。本轮不设吉凶比例，也不以格式通过代替内容通过。
- 没有重试、没有二次调用、没有改写原始回复；计划内调用数已用尽，追加调用需另行确认。

## 离线侧

全量工程检查 92 文件/1115 项通过（干净提交树上）。六种机制（进退、回头生克、月合月破、日冲旺衰）各自的条件与反例由 `tests/output/plan-admission.test.js` 覆盖，其中「每一个机制的引文都钉在转录段上」为独立断言。

## 下一步建议

被拦下的原因是措辞层，而非取法层：模型合理地想说明「这个机制在说什么」，却用到了程序属性的字面。可选做法是先明确取法展示层需要承载哪一句机制释义，再决定是否追加一次调用复测；是否追加由使用者决定。

## 归档

`plan.json`/`plan.sha256`（封盘计划）、`execution.json`、`plan-covered-attempt.json`、`plan-covered-provider.json`、`plan-covered-response.txt`、`plan-covered-check.json`、`budget.json`。凭据不入档。
