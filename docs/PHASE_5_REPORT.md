# Phase 5 完成报告：最小局部规则引擎

日期：2026-09-16。开发分支：`phase5/rule-engine`。
稳定起点：`e2d46b74109cc335cb77776f0ab31b87bb38e71e`（Phase 0～4 已合并 main，用户已生产人工验收）。本阶段没有修改 main，没有 push、部署或进入 Phase 6。

## 完成范围

- 25 条规则：18 条 Canonical 标注索引、5 条共享 Core 世应关系、2 条 Rule Result 月破／月合派生。
- 独立规则注册表、纯引擎、Rule Result Schema、字段证据与方向；缺失／非法／冲突有明确处理，不做最终吉凶或评分。
- 新增 Structured AI Input 1.1；保留 Phase 4 Structured 1.0 和默认 Legacy。
- 严格 Rules A/B 两组同为 1.1、同 Prompt，仅 E_rule_results.enabled / hits 不同。
- debug 下两份完整提示词导出、复制、追问导出；API 首次／追问／刷新恢复保持会话模式及输入版本。
- 离线六组实验准备、交错顺序计划、结果哈希及元数据记录器；不需要真实 API 才能使用人工 A/B。

规则逐条输入、触发条件、输出、来源和限制见 [RULE_SYSTEM.md](RULE_SYSTEM.md)。

## 版本与边界

| 层 | 版本 / 行为 |
| --- | --- |
| Canonical | 原 1.0，无修改 |
| Phase 4 Structured | 原 AI Input 1.0、A/B/C/D，无修改 |
| Phase 5 两组 | AI Input 1.1，Prompt structured-rules-p1 |
| Rule Result | Schema 1.0、engine 1.0.0、ruleset r1 |
| 单条规则 | rule_version 1.0.0 |

1.1 的 C 继续复用白名单投影，不发送 compatibility、display.overall_trend_text 或未知扩展。月破和月合只存在于 E 命中，不扩展 Canonical。所有 evidence 都能追溯到 C 内实际发送的字段值。

Prompt 明确：`origin=canonical_annotation` 的命中只是 Canonical 已有事实的标准化索引，不是第二份独立证据，不得重复加权。局部关系不能直接推出必成／必败；用神和综合判断仍属于 AI 推理，信息不足要说明不确定性。

off 组也在本地计算规则结果以保留相同 skipped、diagnostics 和版本元数据，但发送 enabled=false、hits=[]。这是“是否向 AI 提供命中”的实验，不是测引擎执行开销。禁止把 1.0 与 1.1 的差异当成严格 Rules A/B 效果。

## 改动位置

新增 `src/rules/registry.js`、`engine.js`、`schema.js`，`src/ai/rules-input.js`、`src/ui/rules-debug.js`；在 interpreter、events、ai-debug、ai-view 中加入显式可选入口及状态清理。新增规则 fixture、engine/AI 测试、Rules 浏览器脚本、离线 A/B 脚本和文档。

经 git diff 确认 `src/core/*`、原 formatter、prompt-builder、client、Structured 1.0 的 structured-input.js / schemas.js、index.html 均无改动。没有新增依赖、后端、知识库、评分字段或用神自动选择。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| npm test | 11 个文件，120/120 通过；原 82 项 + 本轮 38 项 |
| 25 条针对性 fixture | 每条正反触发断言通过 |
| 规则补充不变量 | 88 份 Canonical 深冻结不变、确定性与证据；144 月支组合、25 世应五行组合；缺失／冲突／不重算通过 |
| AI payload | 严格两组仅 enabled/hits 不同、白名单保真、会话锁定、导出、哈希、坏输入拒绝通过 |
| npm run build | 通过；51 modules；JS 138.55 kB（gzip 53.62 kB） |
| npm run test:browser | Legacy 开发版／dist、1280／390；每组 2 次 mock 请求、完整 Prompt／会话／恢复一致，页面错误 0 |
| npm run test:browser:structured | 1.0 开发版／dist，各 4 次 mock 请求；复制、追问、恢复及新开 Legacy 通过，错误 0 |
| npm run test:browser:rules | 开发版 1280／dist 390，各 5 次 mock 请求；同 Prompt、仅处理字段变化、复制／追问／恢复锁定通过，错误 0 |
| Rules 退出后重新导出 | 旧 Rules 面板及输入清除，回到 1.0 无 E 的导出通过 |
| 离线记录器 | 六组准备完成；另用独立合成响应验证哈希、版本和 usage=null，不混入真实实验记录 |
| git diff --check | 通过 |

保留原 Cannon 经典脚本构建提示；不是新增构建失败。Legacy 截图最大通道差异 0～2，沿用既有阈值。最后一次仅增加调试导出清理和 ES2020 字符串兼容调整，已重跑全部单测、build、Rules 及 Structured 浏览器；Legacy 完整回归先前已通过，默认链路未受此次调整影响。

验收证据：

- [Legacy 浏览器](acceptance/phase5/legacy-browser.json)
- [Structured 1.0 浏览器](acceptance/phase5/structured-browser.json)
- [Rules 浏览器及请求元数据](acceptance/phase5/rules-browser.json)

浏览器请求均为拦截后的合成 SSE；报告的 usage / latency 标记为 mock，不能用来估算真实模型成本或效果。本轮零真实 API 调用，没有新增生产部署或人工模型评测。没有宣称 Structured + Rules 更准确、更可靠或预测有效。

## 使用与人工 A/B

普通 URL 仍为 Legacy。实验入口：

- `?debug=1&ai_input=structured`：Phase 4 Structured 1.0。
- `?debug=1&ai_input=structured&ai_rules=off`：1.1 无命中对照。
- `?debug=1&ai_input=structured&ai_rules=on`：1.1 + Rules。

生成完整提示词后，两枚 Rules 按钮共用同一卦盘和问题快照、原复制按钮。切換导出按钮只改变导出内容；API 新解读由 URL 模式决定。已有会话追问遵循保存的模式，不能靠切换 URL 把同一对话变成另一实验组；另一组应新开解读或独立外部对话。

离线准备：`npm run ab:prepare:rules`，输出到忽略的 `test-results/phase5-manual/`。六组各含 off/on 完整提示词、输入 JSON、Canonical 和计划；相邻案例交错调用顺序，重复轮次交换先后。相同问题／卦例／模型／设置，独立新对话，追问也一致。

记录外部回答：

```text
node scripts/phase5-ab.js --record <case-directory> off|on <model-label> <response.txt> <latency-ms> [usage.json]
```

每条记录包括 case_id、order、input_mode、rules_mode、model、prompt_version、ai_input_schema_version、ruleset_version、rule_result_schema_version、rule_result_hash、payload_kind、payload_hash、response_hash、usage、latency。未知 usage 保持 null，人工用时注明 manual_wall_clock；不记录 API Key。实际模式顺序由 order 留痕，不要求批量调用。

人工评价只计事实错误（纳甲／六亲／世应／旬空／动变等）、擅改程序事实、矛盾、遗漏、追问一致性和成本。逐项保留原回答片段及对应 Canonical 路径／rule_id；语气差异不算失败，不评价预测准确率。尚无真实模型样本，因此这些评价目前未给出胜负结论。

## 风险与回滚

- 飞伏比和是显式合成契约 fixture，当前缺失六亲放置流程不会自然产生该类命中；不伪造真实案例。另补实际 Core 生成的第五爻申→酉化进用例。
- 命中更多不代表证据更多；Prompt 已禁止重复加权，模型是否遵守仍需人工评估。
- 注释继承 Core 的现有口径，不独立重算纠正；不声称覆盖所有门派、所有关系或所有输入矛盾。
- E 会增加输入体积；成本记录机制已具备，但 mock usage 不能用于真实成本结论。
- 通过关闭实验开关并新开会话即可恢复 Legacy 或 Structured 1.0。已有 Rules 会话仍按 1.1 追问，防止静默换组；操作回滚应先导出需保留内容。
- 代码级回滚可回退本阶段独立提交，稳定基点为 e2d46b74109cc335cb77776f0ab31b87bb38e71e；不修改既有 baseline tag，不需要数据迁移，不以 hard reset 清理用户数据。

## 停止点

Phase 5 请求范围已实现并通过本地自动化验收；保留用户人工复核。单独本地提交到 phase5/rule-engine；本轮不 push、不 merge main、不部署、不进入 Phase 6 或知识库阶段。
