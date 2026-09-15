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
