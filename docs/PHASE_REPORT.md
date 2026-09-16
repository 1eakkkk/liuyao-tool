# 第一轮实施记录

范围：仅 Phase 0、1、2，工作分支 `refactor/v2`。权威源为父文件夹 490213 字节 HTML；GitHub 旧 HTML 不是比较标准。

## Phase 0

- 完成内容：权威文件原样导入、冻结可运行副本、24 个卦例、提示词、145 个函数与 13 个存储 key 清单、双尺寸截图。
- 文件：`tests/regression/baseline`、`fixtures`、`docs/BASELINE.md`。
- 测试：冻结页重现固定输出。首次迁移比较发现采集器跨 eval 日期设置失效，已修正采集器并从原文件重采，详见 BASELINE。
- 兼容性：原始页面保持可运行；`1964881` 是正确回滚点，`v1-baseline` 保留为旧 GitHub 基线。
- 风险：线上旧站无法代表用户最新桌面源。

## Phase 1

- 完成内容：Vite、Vitest、CSS、常量、历法／排盘／物理、存储、AI、UI、显式事件初始化逐步拆分。分阶段提交见 Git 日志。
- 文件：`src/core`、`storage`、`ai`、`ui`、`app`、`styles`，`public/vendor/cannon.js`、构建配置与浏览器验证脚本。
- 测试：25 项通过；24 个迁移卦例逐项比较完整字段、排盘 HTML、AI 文本、完整导出 Prompt、历史快照。`npm install`、构建成功。
- 浏览器：Edge 无头浏览器实际启动开发服务器与 dist 预览；1280／390 两个宽度，各 5 个页面状态，与冻结原页比较。手动选六爻、生成排盘、导出 Prompt 通过，页面错误为零。
- 截图条件：固定时钟、本地字体回退、禁用截图期间 CSS 动画，先清除焦点并滚到顶部。最初的阶段截图采用了不同捕获流程，已统一重拍。桌面合成有至多 2／255 的色彩通道差异（未压缩开发页重复捕获也可见）；移动尺寸逐像素一致。脚本不容忍更大差异或尺寸变化。
- 兼容性：13 个 key 不变；Cannon 以原始经典脚本加载，保留 MIT 声明。Vite 的“不能打包无 type=module 脚本”提示是对静态 vendor 的提示，文件实际复制至 dist 并在浏览器验证可用。
- 待验收：真实 DeepSeek、Android／Windows 封装、Cloudflare Preview 与人工检查。缺少客户端源码和部署配置，不能以浏览器模拟代替这些结论。
- 下一步：接入 Canonical 数据及兼容迁移，继续全量回归；不进入 Phase 3。

## Phase 2 — 本地实现与验证

- 完成内容：`buildCanonicalCast`、Schema 1.0、无损旧字段映射、唯一当前卦盘、旧 formatter 兼容、历史／会话加法快照、只读惰性迁移、损坏／未来版本数据保护。
- 新增文件：`src/core/normalize.js`、`src/app/cast-store.js`、`src/storage/versions.js`、Canonical／存储／AI／核心组合／物理回归测试；架构、Schema、145 函数迁移映射、部署回滚文档。
- 修改文件：排盘视图、formatter、历史／会话适配、事件调用和日期后处理接入 Canonical，README 更新为当前 Vite 开发方式。没有新规则、知识库、RAG、Benchmark、后端或 UI 重设计。
- 测试：71 项单元／回归测试（含 24 固定卦例、448 静卦／单动爻组合、六轮物理落地结果／步数、日期边界／仅日柱、角色与风格 Prompt、SSE／API 错误／停止、历史／会话／配额失败）。`npm run build` 通过。
- 浏览器：开发版和 dist 在 1280／390 两个尺寸与原页对比；模拟 API 首次解读、追问、刷新恢复的请求正文、对话 HTML、恢复卦盘 HTML 完全一致，页面错误为零。截图尺寸一致、最大色彩通道差异不超过 2／255（含移动尺寸重复捕获中的合成波动）。
- 兼容性：13 个原 key 保留，旧记录不在启动时覆盖；新磁盘快照保留旧字段供回滚，内存仅 Canonical。ES2020 构建，相对资源路径，保留原 Cannon 经典脚本；不支持 randomUUID 的环境有仅用于卦盘标识的回退。
- 线上源比较：直接 HTTP 读取成功；当次线上文件与权威原文件仅相差 Cloudflare Insights beacon 注入。GitHub 旧版本仍不是本轮基线。
- 风险：加法兼容快照增加本地存储占用，已验证超限时保留原值；真实 API、真实 Android／Windows 壳尚未测试。Preview 未部署；不能将本地测试称作全部 DoD 完成。
- 用户后续确认：Wrangler 已重新登录，但 Dashboard 的 `liuyao`（`gua.1eak.cool`）不在 Pages 项目列表中。部署类型未知；按用户要求暂时跳过 Preview，不执行 Pages 部署或覆盖生产。此前对 `liuyao.1eak.cool` 的读取只代表方案中的旧地址源比较。
- 下一步：先人工检查本地重构；后续确认 Cloudflare 部署类型，再决定独立 Preview 方式，完成真实三端与 API 验收。完成这些门槛前不合并、不进入 Phase 3。

2026-09-15：用户完成人工 Preview 验收。
自动起卦、手动录入、排盘、Prompt 导出、真实 DeepSeek 解卦、追问、刷新恢复、设置、移动端、旧版结果对照均通过。
Phase 0～2 正式验收完成。
## Phase 3 — 核心测试补齐并关闭（2026-09-16）

- 审计：完整对照原计划 Phase 3 与既有 71 项测试，详见 `docs/PHASE_3_AUDIT.md`；保留上方用户的 Phase 0～2 人工 Preview 验收记录。
- 完成内容：将原矩阵中的 64 个静卦期望冻结为 fixture，固定 fixture 总数达到 88；增加八宫／世应不变量，补六旬空亡／六神、25 种六亲关系、两种本卦的全部动爻组合及非法输入／确定性／输入不变断言。
- 文件：`tests/regression/core-matrix.test.js`、`core-invariants.test.js`、`fixtures/static-casts.json`、`scripts/capture-core-fixtures.cjs`、本报告与审计文档。未修改生产代码或权威旧版 HTML。
- 验证：`npm test` 通过，8 个测试文件、75/75 项通过；`npm run build` 通过。64 个冻结静卦、384 个单动爻及原有 24 个完整 fixture 全部通过。新增测试用例只有 4 项，不为数量重复执行静卦场景。
- 构建提示：原 Cannon 经典脚本提示保持不变，已确认 `dist/vendor/cannon.js` 存在（132201 字节）。本轮未重新部署或执行人工 Preview。
- 结论：Phase 3 关闭。场景与不变量覆盖满足本阶段要求；没有测量代码覆盖率，不将 fixture 全通过等同于所有代码分支覆盖。
- 停止点：不进入 Phase 4，不新增规则引擎、知识库或后端，不合并 main。本阶段单独本地提交；本轮不自动 push 或部署。

## Phase 4 — Structured AI Input（2026-09-16）

- 完成内容：保留默认 Legacy，新增 Canonical 白名单投影、独立 AI Input Schema 1.0、Structured 指令、会话模式锁定与版本校验、两份完整提示词及 Structured 追问导出、人工 A/B 离线准备与哈希记录。
- 修改文件：`src/ai/interpreter.js`、`src/app/events.js`、`src/ui/ai-view.js`、package scripts、架构／Schema 文档。`src/core`、Canonical 字段语义、原 formatter、原 prompt-builder、原 client、主页面 HTML／CSS 保持不变。
- 新增文件：`src/ai/schemas.js`、`structured-input.js`、`exports.js`、`src/ui/ai-debug.js`、`tests/regression/structured-ai.test.js`、两份 Phase 4 脚本、`docs/PHASE_4_REPORT.md` 与本阶段浏览器验收记录。
- 自动测试：`npm test` 82/82 通过（9 文件）；原 75 项不变，新增 7 项聚合测试。覆盖 88 个固定卦例的白名单事实保真、未知扩展／派生摘要排除、稳定输入、双模式请求、刷新追问、导出和哈希。
- 构建：`npm run build` 通过；保持原 Cannon 经典脚本静态资源提示，无新构建失败。
- Legacy 浏览器：开发版／dist、1280／390 两尺寸，完整提示词、mock API 首次／追问请求、回复和刷新恢复与冻结旧版一致，页面错误零；截图最大通道差异 0～2，沿用既有阈值。
- Structured 浏览器：开发版／dist 各 4 次 mock 请求（首次、追问、URL 改为 Legacy 后刷新追问、新开 Legacy），白名单 payload、模式锁定、成对完整提示词、剪贴板复制、Structured 追问导出全部通过，页面错误零。记录包含模式、模型、Prompt／输入版本、请求／回复哈希、模拟 usage 和 latency，明确标为 mock。
- 调试记录：最初并行运行两套浏览器与单测时，两个旧测试触发 5 秒超时；单独重跑 82/82 通过，未放宽断言或超时。新脚本修正 Windows 剪贴板 CRLF 规范化，以及刷新后新开解读前填写问题的测试步骤。
- 人工 A/B：离线准备六组成对提示词；记录工具以独立合成响应校验通过。尚未收集真实模型回答，不将导出成功或 mock 成功当作事实可靠性提升的证据。
- 验收调整：按用户最新要求，真实批量 DeepSeek A/B 为可选项；本轮未调用真实 API，没有消耗 API 额度。只评价事实可靠性、一致性、遗漏、矛盾和成本，不评价预测准确率。
- 兼容性：普通用户仍走 Legacy；现有存储 key 不变，Structured 会话仅加模式／版本元数据；未引入规则引擎、知识库、RAG 或后端。详细风险、使用方式与回滚见 `PHASE_4_REPORT.md`。
- 结论：按调整后的验收条件完成 Phase 4。独立提交到 refactor/v2 后停止；不自动 push／部署，不合并 main，不进入 Phase 5。


## Phase 5 — 最小确定性规则引擎（2026-09-16）

- 基于用户已验收的 Phase 0～4 main 稳定点 e2d46b74109cc335cb77776f0ab31b87bb38e71e，在 phase5/rule-engine 实施。
- 完成 25 条局部规则、独立 Rule Result、证据及方向；18 条索引已有事实、5 条复用 Core 函数、2 条月破／月合只在派生层输出。不修改 Core、Canonical、Legacy 默认或 Structured 1.0。
- 新增 AI Input 1.1：严格 Rules A/B 的两组同 Prompt，只通过 E.enabled/hits 区分；明确已有标注不是第二份证据，不得重复加权。保留完整提示词复制、追问、离线 A/B 与哈希记录。
- 120/120 单测通过，build 通过；Legacy、Structured 1.0、Rules 浏览器 mock 均通过。补测 25 正反 fixture、88 快照不变、144 月支组合、25 世应五行组合及真实化进用例。飞伏比和明确为合成契约样例。
- 无真实 API 调用，无预测准确率／模型优胜结论。新实验仅 debug 开启，不改变普通用户主流程。
- 详情及证据见 [PHASE_5_REPORT.md](PHASE_5_REPORT.md) 与 [RULE_SYSTEM.md](RULE_SYSTEM.md)。本阶段单独本地提交，不自动 push／部署或 merge main；完成后停止，不进入 Phase 6 或知识库阶段。
