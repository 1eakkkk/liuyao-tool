# 知识解读候选：明确引文属于哪里

日期：2026-09-30。针对独立回顾确认的“现代整理归成古籍原文”缺陷，新增离线出处连接候选。它不修改已上线结构化协议，也不直接替换此前未验证的新提示。

## 新的输出要求

每个解释保留事实、规则及文献引用，另增加 source_claims。每条声明必须包括文献 ID、具体字段、来源类型和逐字短引文。例如：

```json
{
  "literature_id": "literature:zsby-month-clash-001",
  "field": "/original_text",
  "origin": "source_transcription",
  "quote": "月建沖之爲月破"
}
```

原文只能引用 /original_text，来源是 source_transcription。现代整理可引用 /editorial_summary，或 applicable_conditions／exclusions／exceptions 的具体 statements 编号，来源必须为 modern_editorial。当前不允许引用教学指导、错误示例、任意字段或原型路径作为支持材料。字段来源由程序读取资料包，不能由模型重新定义。

每个文献引用至少要有一条有效声明；没有文献的对照组允许空数组，不强迫模型虚构引文。重复声明、未知资料、未关联本段的文献、错误字段、引用内容不在该字段内，以及原文／整理的归属错位均不能通过机械核对。规则仍必须保留完整来源事实，事实原值核对不被引文功能替代。

逐字连接只能确认引用来自某个字段。例如模型正确引用现代整理，但自由文字仍说“古籍明确规定”，机械连接仍可能通过。新增测试专门保留这个反例，free_text_attribution 与 semantic_support 仍为 unassessed，production_ready 始终为 false；不能把引文存在当作语义修复证明。资料包原文转录的外部真实性也不是本工具自动认证的内容。

## 准备 API 与外部提示词对照

```text
node scripts/prepare-sourced-reading.js test-results/new-sourced-candidate
node scripts/prepare-sourced-reading.js test-results/new-small-sourced-candidate one-pair
```

准备目录包含 plan.json、seal.json 和每个对照输入的完整提示词。API messages 与文本提示词来自相同内容，带文献／不带文献两侧的指令、问题、事实、规则完全一致，只改变文献包。沿用三个已曝光的窄问题：月破、月合、甲子旬空；不称为新独立样本。

候选版本是 layered-reading-sourced-dev-1，完整 JSON 示例同步加入 source_claims，避免新旧版本要求冲突。已有 layered-reading-dev-2、历史回复、旧输入计划及其机械结果保持原样。原型第一份准备资料留在忽略目录，新版本另用新目录生成，不覆盖旧准备记录。

脚本只有本地准备与导出，没有 API 执行功能、凭据加载、预算预留或自动重试。沿用输入额度上限并重新计算完整请求长度；旧付费执行脚本拒绝此新候选计划，不能靠修改协议名称绕过已冻结计划。后续实际调用需要适配新校验器、固定评价标准，并核对剩余授权预算。

## 验收范围

21 项开发检查覆盖三个正例、原文与整理错位、伪造引文、错误字段与路径、未知文献、缺少声明、错误示例、事实错值、真实规则依赖缺失、重复／多余／缺少字段、旧协议兼容，以及有效引文不代表自由文字正确。独立代理另检查了十个机械反例、本地准备无 API／预算动作、不修改输入及拒绝覆盖旧目录；最终相关测试 32 项通过。

这次交付的是可执行、可导出的离线候选及验收，不是知识增强上线。没有真实 API 调用，没有获得新提示更有效的结论；新样本对照与真实内容审查仍是下一步门槛。
