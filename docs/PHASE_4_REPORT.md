# Phase 4 — Structured AI Input

## 结论与范围

本阶段在 Phase 0～3 稳定提交 `9eb7cb4afc347c3394b956a01c377407fad17e53` 上新增实验输入路径。Legacy 默认路径保留；排盘核心、Canonical 1.0 字段语义、Legacy formatter、Legacy Prompt 与 DeepSeek 客户端均不修改。

按用户最后确认，真实 API 批量 A/B 是可选项，不是关闭条件。本轮不调用真实 API、不消耗 API 额度，也不宣称 Structured 优于 Legacy。不评价六爻最终预测准确率。

## 使用方式

### 原有路径

正常打开页面，AI 解读、导出、追问全部保持 Legacy。旧会话没有模式字段时视为 Legacy。

### 人工 A/B 完整提示词导出

1. 在站点 URL 后添加 `?debug=1`（已有 query 时追加 `&debug=1`）。
2. 填写问题并起卦，点击原有“输出提示词”。
3. 导出框下出现“显示 Legacy 完整提示词”和“显示 Structured 完整提示词”。两者取自这次生成时捕获的同一个问题与卦盘。
4. 分别选择、使用原有复制按钮，将全文粘贴到同一模型的两个独立新对话。ChatGPT、Claude、DeepSeek 等能够接收文本的网页／客户端均可手动使用；本轮没有逐个外部平台验收。
5. 当前选择的模式也用于“生成追问提示词”。外部 Structured 导出包含完整指令、白名单 JSON、原回答和追问，不依赖本站 API 或本地后处理。

切换导出按钮只影响导出，不切换 API 会话。重新起卦后需重新生成导出，避免沿用旧快照。

### Structured API 实验开关

`?debug=1&ai_input=structured` 启用下一次首次解读的 Structured 路径。仅有 `ai_input=structured` 不生效。模式随会话保存，改变 URL 或刷新不改变既有会话模式；新点“AI 解读”才按当前开关重新建立会话。

## 实现与数据流

```text
唯一事实源：castStore.canonical
  ├─ Legacy → 原 formatter → 原 Prompt → 原 API 客户端
  └─ Structured → buildStructuredAiInput → 独立 AI Input Schema → 原 API 客户端

同一 Canonical 快照 → buildPairedPromptExports → 两份完整可复制提示词
```

- `src/ai/schemas.js`：独立 AI Input Schema 1.0、白名单投影及边界校验。校验器只实现该本地 Schema 使用的关键词，不是通用 JSON Schema 引擎。
- `src/ai/structured-input.js`：A/B/C/D 输入、Structured 系统指令、显式 debug 选择。
- `src/ai/exports.js`：成对导出、Structured 追问导出、SHA-256 与实验记录。
- `src/ai/interpreter.js`：追加可选 Canonical 参数与 Structured 会话版本标记；原四参数 Legacy 调用不变。
- `src/app/events.js`：首次请求／导出边界分发。
- `src/ui/ai-debug.js`：只在 debug 导出区域出现的两种模式按钮。
- `src/ui/ai-view.js`：收起导出时清除实验导出状态。

### 输入 Schema

外层必需字段：

| 字段 | 类型及含义 |
| --- | --- |
| `ai_input_schema_version` | 固定 `1.0`，与 Canonical 版本独立 |
| `A_user_question` | 当前问题原文，不加入分类结果 |
| `B_program_facts` | 权威字段边界、爻序和缺失值说明；不生成第二套事实数据 |
| `C_canonical_cast` | Canonical 白名单投影，保持值和六爻顺序 |
| `D_ai_task` | AI 推理职责与不确定性要求 |

C 的白名单：

- `schema_version`；`meta.source/coin_convention`；`versions.app/engine/legacy_rules`。
- `calendar` 的四柱、日月地支、`kongwang`、日期 `anchor.year/month/day`。
- `hexagram` 的本卦名称、宫位、上下卦、变卦名称、世应位置。
- 六爻 `position/yin_yang/moving/ganzhi/branch/element/relative/spirit/state_text/is_shi/is_ying/is_kongwang`。
- `changed/hidden` 的 `ganzhi/branch/element/relative`。
- `relations.month_strength/day_relation/return_relation/advance_retreat/hidden_relation`。
- `display.palace_text/date_text`：前者补充现有结构字段未独立表达的宫内阶段，后者保留日期说明。

默认排除所有层级的未知字段、`compatibility`、`display.overall_trend_text` 和其余展示摘要。不传 cast ID、创建时间或 Canonical 旧 Prompt 版本；本次 Prompt 版本独立记录为 `structured-p1`。Legacy 记录为 `p1`，其 AI 输入 Schema 版本为 null（文本协议）。

缺失字段保持缺失，null 和空字符串原样保留；投影不补值、不修改 Canonical。已给出的纳甲、六亲、六神、世应、八宫、空亡、动变等不可重新计算；已有局部关系不是新规则引擎输出，月令标注不等同综合强弱。

输入边界遇到问题与 Canonical 问题不一致、非法字段类型或不支持版本时明确失败，不悄悄降级或重算。Structured 追问保持初始 JSON，更新当前风格；协议版本变化时要求新开解读，不混用协议。

## A/B 方法与记录

### 人工步骤

同一卦例、同一问题、同一模型及可控制的相同设置、独立新对话。第一次 Legacy→Structured，下一例 Structured→Legacy；重复同例时交换顺序。外部客户端未公开的系统提示词或模型路由记为未知，不能声称与 API 条件相同。

每对回答分别标注：

- 纳甲、六亲、六神、世应、空亡、动爻／变爻事实错误；记录爻位、原句、正确字段。
- 擅自重新排盘、改变确定字段。
- 同一回答内部矛盾；同一模式追问前后事实矛盾。
- 请求遗漏：程序自动检查白名单字段完整性。
- 回答遗漏：只评价与问题或明确追问有关的关键依据，不要求短回复机械复述全部卦盘。未提及不能计为事实正确，也不一律计为遗漏。
- 推论改变与事实改变分开。明确承认推理错误、说明依据的修正不自动算前后矛盾。
- 不比较文风优劣，不评价最终预测准确率。无法判定标“待复核”。

建议追问两种模式都使用同一句，例如：“请指出你依据的世应、动爻与空亡字段；哪些是程序事实，哪些是你的判断？”也可在各自对话中测试同一条质疑，检查是否为迎合而改变字段。

### 离线准备与记录工具

```powershell
node scripts/phase4-ab.js --prepare
```

在 `test-results/phase4-manual/` 生成六个固定案例的 `legacy.txt`、`structured.txt`、Canonical 参照及交错顺序计划。仅生成文本，不调用 API，不把准备工作记作已完成实验。已有实验记录的目录拒绝覆盖。

外部回复保存为 UTF-8 文件后记录（模型标签由操作者按实际使用填写）：

```powershell
node scripts/phase4-ab.js --record test-results/phase4-manual/baseline-01 structured "实际模型名称及版本" response.txt 12345
```

最后一个必需参数是人工测量的耗时毫秒；可追加 usage JSON 文件。缺少用量时记 null，不能填 0 冒充免费。每次生成一条 `runs.jsonl`，包含：

`input_mode / model / prompt_version / ai_input_schema_version / payload_hash / response_hash / usage / latency`，以及 case、轮次和实际记录顺序。

- 手工导出实验的 `payload_hash` 是导出文本文件的 SHA-256，`payload_kind=export_text`；不是无法观测的外部网站隐藏请求。Windows 剪贴板可能把 LF 转为 CRLF，保存证据时应同时记录这一传输差异。
- `response_hash` 是操作者提供的回复文本文件哈希。
- 浏览器 mock 记录的 `payload_hash` 来自实际请求正文，`payload_kind=api_body`；用量和延迟明确标为 mock，不计入真实模型评估。
- 这些是显式运行的本地实验工具，不给所有普通请求增加自动日志。禁止记录 API Key 或 Authorization header。

本阶段没有实现通用 Benchmark 平台、事实自动语义裁判或六爻规则引擎。

## 验证与验收

- 原有 75 项回归保留；新增测试覆盖 88 个卦例的白名单字段、深层扩展排除、空值、稳定序列化、输入不变、Legacy messages、Structured messages、模式恢复、导出和哈希。
- 原浏览器脚本仍将开发版与 dist 对照冻结旧页：双尺寸页面、完整导出、API 请求、追问和刷新恢复。
- 新浏览器脚本 `node scripts/verify-structured-browser.js` 在开发版和 dist 上验证成对导出、真实剪贴板复制、Structured 追问导出、API 请求投影、追问、刷新后的模式锁定和新会话切回 Legacy。
- `npm test`、`npm run build` 及两套浏览器结果见 PHASE_REPORT.md 与 `docs/acceptance/phase4/`。
- 用户已将真实批量 API A/B 调整为可选。本轮未执行真实 API 调用、外部网页模型回答评测或人工事实优劣打分，因此没有“Structured 更可靠”的实测结论。

## 风险与回滚

JSON 和新指令可能改变用量与回答；排除旧摘要、采用不同事实约束也意味着 A/B 比较的是两种完整输入方案，不能把差异全部归因于 JSON 格式。模型仍可能不服从指令，需要后续人工比较。

完整输出记录可能包含用户问题，示例只用合成问题。真实人工记录保留在忽略的 test-results 下，不默认提交。

关闭 debug／Structured 开关可使下一次新解读回到 Legacy；既有 Structured 会话仍保留其模式，需点击新解读开始 Legacy 会话。代码级回滚使用 Phase 4 独立提交的 revert，或部署已保留的 `9eb7cb4`。旧版本续接实验会话可能替换为旧系统指令，故回滚后应新开 Legacy 解读，保留原历史用于查阅。

无需重算卦盘或迁移 Canonical。完成本阶段后停止，不进入 Phase 5。
