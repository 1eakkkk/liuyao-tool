# 结构化解读：长正文与历史回看

日期：2026-09-30。先独立验收此前的依据去重，再推进现有结构化解读的阅读体验。范围是页面与历史回看，不增加知识注入或真实 API 调用。

## 前一阶段的独立验收

代码审查：6 个相关测试文件、43 项通过；额外检查 3 个排盘样例的 30 条规则，确认共享来源去重、局部编号、复制一致、方向与旧会话兼容。

独立浏览器审查：Chromium、WebKit × 320／390／1280px，以约 697 字模拟结论检查键盘、引用列表和窄屏。未发现依据展示阻断问题，但六种组合均复现“生成追问提示词后，已有依据自动收起”。长结论多轮累积也会拉长页面。这两项成为本轮改动的依据。

## 本轮行为

| Before | After | Why |
| --- | --- | --- |
| 长结论始终全量展开 | 超过 400 个字符时先显示 240 字符预览，可展开完整结论 | 减少多轮回看滚动，明确提醒预览并非全文 |
| 生成追问重建旧轮次节点 | 保留已完成轮次节点、结论和依据的展开状态 | 继续提问时不打断用户阅读 |
| 历史先展示完整卦盘再显示回答 | 问答在前，卦盘通过“查看当时卦盘”独立展开 | 回看时先找到当时结论 |
| 历史标题只能鼠标点击 | 原生按钮支持 Enter／Space，提供展开状态与目标关系 | 手机、键盘和辅助技术入口一致 |
| 历史刷新重置正在查看的记录 | 当前页面刷新列表时保留记录、长答、卦盘的展开及滚动位置 | 追问归档时不丢失阅读位置 |

结论预览按 Unicode 字符截取，不截断代理对。正文由 textContent 展示，完整结论按钮没有额外嵌套卡片。短答直接完整呈现；未通过检查的回复沿用原始回复入口。复制和历史归档始终使用完整模型内容，页面收起不修改保存内容。刷新网页后仍从保存会话重新核对，并使用默认收起状态；阅读展开状态只在当前页面操作间保留。

## 验证边界

验证包含约 760 字模拟正文、API 与提示词贴回两条路径、完整复制、Enter／Space 展开收起、追问时保留依据、历史先答后盘、历史滚动与展开保留、刷新恢复、错误引用、停止和历史删除。

无真实 API 调用或费用。浏览器 WebKit 模拟不代表所有真实 iPhone 已验收；展示验收不证明模型事实、出处归属或预测准确。离线知识增强仍未达到上线标准，原研究计划没有因此被标记整体完成。

## 验收记录

源代码提交：`4148c068f34018dc001f71f9a1af105a7ccda533`。发布边界检查通过，未引入知识模块或未准入实验。

- 全量测试：43 文件、487 项通过（4 个并行 worker）。首次默认并行运行时，冻结基线和研究流程测试各出现 5 秒超时；限制并发后的完整复测通过，没有放宽断言或更改超时。
- 独立冻结基线：24 个既有排盘输出全部一致。
- Chromium／WebKit 本地完整流程：各覆盖 1280／390／320px，包含约 760 字正文，全部通过。
- 子代理代码复审：24 项相关测试以及长文本 Unicode 边界、旧记录兼容、HTML 安全、存储不改写、刷新列表后的焦点保持通过。
- 子代理浏览器复验：668 字正文、六组浏览器／宽度组合通过；追问保留结论与依据展开，历史重绘 scrollTop 120→120。整页刷新后展开状态不持久化。

可复查报告：[本地 Chromium](acceptance/reading-review/preview-chromium.json)、[本地 WebKit](acceptance/reading-review/preview-webkit.json)、[前阶段独立审查](acceptance/reading-review/prior-independent-ux.json)、[本阶段独立复验](acceptance/reading-review/next-independent-ux.json)、[构建清单](acceptance/reading-review/preview-manifest.json)。清单中的 workingTreeDirty 为 true 来自用户自有的未跟踪保留文件；构建时跟踪代码已提交。

## 上线复验

已推送上述源代码至 main，线上 `https://gua.1eak.cool/` 已提供本轮应用文件：`index-CCql43zm.js` 与 `index-Cv__8OY9.css`。两个文件与本地验收构建逐字节一致。HTML 去除唯一观察到的 Cloudflare Insights 注入脚本并统一 CR 换行后完全一致；Cannon 文件统一 CR 换行后一致，不声称这两类文件原始哈希相同。详情见 [线上资源比较](acceptance/reading-review/production-assets.json)。

线上 [Chromium](acceptance/reading-review/production-chromium.json) 与 [WebKit](acceptance/reading-review/production-webkit.json) 各在 1280／390／320px 完成同一完整阅读流程，全部通过，API 请求全部拦截为模拟数据。额外通用浏览器回归中，开发与生产构建的普通提示词、对话、排盘恢复及既有页面截图一致，无页面错误。

回退源码可使用已验证的 `release/2026-09-30-reading-evidence` 标签。本轮不改变存储格式，无数据迁移。

源代码对应的 [GitHub 完整验证](https://github.com/1eakkkk/liuyao-tool/actions/runs/36717172478) 已全部通过，结果另存 [source-ci.json](acceptance/reading-review/source-ci.json)。验证包含全量测试、发布边界、通用页面、结构化流程、窄屏、设置、主题与物理投掷等既有检查。后续仅归档本说明及验收 JSON，不改变已验收应用资源。
