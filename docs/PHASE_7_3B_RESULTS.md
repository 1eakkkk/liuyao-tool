# Phase 7.3B：外部 Knowledge A/B 最终结果

## 实验身份与状态

- Status：`external_ab_completed`。
- 模型：ChatGPT Web / GPT-5.6 Sol。12 cases，24 sessions，每个会话含初答和统一追问。
- Code commit：`0d3af10bfd8e7cf48030bb1310d7f137de86f7a2`。
- FREEZE：`d8c98aa0515467908917885b1a175a4103c5f44a185267dae8ba938d4d64551e`。
- LOCK：`26254eb2e6af350eced60ac28384df580b6369d1cd40fb437376d58e3f47aa5c`。
- Corpus：`phase7.1-initial-1`；hash：`sha256:1b24872a9533ef5d94576c2f8df3489eb221c69f7dfbf0167cdc6e00ab868729`。
- Retrieval policy：`deterministic-literature-1.0`；Structured input：1.2；Ruleset r1：25 rules。
- Corpus 保持 7 reviewed / 3 source_checked；未修改状态。
- 24/24 external sessions 与 24/24 complete reviews 经验证后，按既有 CLI 依次 lock、unblind、report；引文采用 UTF-16 code-unit offsets。
- `effects_conclusion = null`，本文件不写回实验结果字段。

本报告只发布锁定结果的汇总。Phase 7.3A 冻结设计历史保持原样；raw answers、completed reviews、scoring package、private mapping、seed 和私有实验目录均不提交。

## 总体指标

受影响会话数按每组 12 个会话统计，初答与追问不视为独立样本。

| Metric | OFF events | ON events | 受影响会话 OFF | 受影响会话 ON |
| --- | ---: | ---: | ---: | ---: |
| fact_errors | 0 | 0 | 0 | 0 |
| relation_errors | 0 | 0 | 0 | 0 |
| relevant_omissions | 2 | 0 | 1 | 0 |
| fact_overrides | 0 | 0 | 0 | 0 |
| contradictions | 0 | 0 | 0 | 0 |
| duplicate_evidence | 0 | 0 | 0 | 0 |
| literature_misquotes | 0 | 0 | 0 | 0 |
| literature_overreach | 3 | 2 | 3 | 1 |
| irrelevant_literature | 0 | 0 | 0 | 0 |
| uncertain | 0 | 0 | 0 | 0 |

- relevant omissions / applicable checklist opportunities：OFF **2/70**，ON **0/70**。
- direction_errors：**0 / 0**（关系错误子类，不额外相加）。
- blinding_compromised：**2/24**。
- protocol_deviations：**24/24**，统一为 context/new-chat 状态无法独立确认。
- 这是可验证性限制，不是已确认上下文污染；不能忽略这些偏差。

## 按轮次

| 轮次 | 遗漏 OFF / ON | literature_overreach OFF / ON | checklist 机会 OFF / ON |
| --- | ---: | ---: | ---: |
| initial | 1 / 0 | 2 / 1 | 35 / 35 |
| follow-up | 1 / 0 | 1 / 1 | 35 / 35 |

其余错误指标、uncertain 与 direction_errors 在两轮均为 0；cross_turn 各项事件数为 0。

## 按主题

| 主题 | 遗漏 OFF / ON | literature_overreach OFF / ON |
| --- | ---: | ---: |
| shi-ying | 0 / 0 | 0 / 0 |
| month-break | 0 / 0 | 1 / 0 |
| month-combine | 0 / 0 | 1 / 2 |
| day-clash | 0 / 0 | 0 / 0 |
| advance | 0 / 0 | 0 / 0 |
| retreat | 0 / 0 | 0 / 0 |
| xunkong | 2 / 0 | 1 / 0 |
| return-relation（zero-match） | 0 / 0 | 0 / 0 |
| flying-hidden（zero-match） | 0 / 0 | 0 / 0 |

其余相关错误指标均为 0。**month-combine 在 ON 条件下仍发生 2 个 literature_overreach 事件，是后续需要重点审计的主题。**

## 按类型与 case comparison

| 类型 | Cases | 遗漏 OFF / ON | literature_overreach OFF / ON | checklist 机会（每组） |
| --- | ---: | ---: | ---: | ---: |
| explanation/boundary | 8 | 2 / 0 | 3 / 2 | 47 |
| low-gain controls | 2 | 0 / 0 | 0 / 0 | 11 |
| zero-match controls | 2 | 0 / 0 | 0 / 0 | 12 |

low-gain 与 zero-match controls 的全部错误指标为 0。

| Case | Comparison |
| --- | --- |
| case-01 | unable_to_judge |
| case-02 | unable_to_judge |
| case-03 | unable_to_judge |
| case-04 | unable_to_judge |
| case-05 | unable_to_judge |
| case-06 | unable_to_judge |
| case-07 | unable_to_judge |
| case-08 | unable_to_judge |
| case-09 | unable_to_judge |
| case-10 | unable_to_judge |
| case-11 | unable_to_judge |
| case-12 | unable_to_judge |

汇总：on_better 0、off_better 0、same 0、mixed 0、unable_to_judge 12。

这是因为现有比较逻辑将任何 protocol deviation 的 case 标记为 unable_to_judge。不能把原始计数较低改写成案例胜出；本轮不事后修改比较逻辑重新判胜负。

## Zero-match sanity check

case-11 / case-12 两组模型可见 Prompt 均 byte-identical / visible-identical，F.items 均为空，各项错误指标均为 0。输入完全相同，因此回答差异不能归因于 Knowledge；不要求自然语言回复逐字相同。

## Prompt 成本

字符数采用 Unicode code points，不等同于 token、费用或评分引文的 UTF-16 offsets。

| 项目 | OFF | ON |
| --- | ---: | ---: |
| Prompt total chars | 262004 | 272203 |
| F chars | 144 | 10343 |
| selected unit occurrences | 0 | 10 |

Prompt 增量 **10199**，增幅 **3.893%**（按未舍入值计算为 3.892688661%）。前十例每例选入一个单元，两个零命中例不选入；所有冻结预算保持通过。

## 描述性总结

在当前 12 个定向案例、人工冻结检索条件和单一模型下，Knowledge Context 从 70 个适用 checklist 机会中的 2 个遗漏降至 0，文献过度泛化事件从 3 降至 2，且未观察到事实错误、关系错误、误引、事实覆盖、重复证据计权或矛盾增加。Prompt 字符开销约 +3.893%。

结果支持保留 Knowledge Layer 作为可追溯的文献解释上下文机制，并支持继续研究其在解释边界和遗漏控制上的工程价值。这一工程方向不等于因果证明或预测能力结论；尤其不能忽略 month-combine 的局部反向变化和全体案例的偏差判定。

## 限制

- 12 个定向样本，是非随机样本。
- 单一模型；产品可见型号不保证所有隐藏参数可控。
- 人工冻结 concept query，不评价自动检索或问题分类。
- 不评价六爻预测准确率。
- reviewed 为项目内部审核，不是独立学术认证。
- 24/24 context/new-chat 状态无法独立验证，不等于确认存在上下文污染。
- 2/24 blinding compromised；其他可能的处理条件泄漏也不能完全排除。
- 模型生成存在随机波动。
- 指标可能重叠，不能简单相加成总分或加权分。
- case comparison 因当前 deviation policy 全部 unable_to_judge；不改判。

## 本次文档收口验证

- `npm test -- --maxWorkers=1`：16 个测试文件，260/260 通过，79.18 秒。
- `npm run build`：通过，51 个模块；产物仍为 `index-BUs3Mv5n.js` 和 `index-63lbvoss.css`。仅有既有 Cannon 经典脚本构建提示。
- `git diff --check`：通过。差异仅涉及本报告与 `docs/PHASE_7_REPORT.md`。
- 重新验证冻结封印与锁定报告，通过；`effects_conclusion` 仍为 null。
- 不提交私有实验数据，不修改生产代码、corpus 或实验评分。仅提交公开总结文档，不 push，不进入 Phase 8。
