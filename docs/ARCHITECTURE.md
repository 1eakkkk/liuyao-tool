# Phase 0～2 架构

本轮以父文件夹的 490213 字节 HTML 为准，算法、样式、提示词均以冻结原页作回归比较。`main` 和线上站点未修改。

## 数据流

```text
手动六爻 / Cannon 物理投掷 + 日期输入
  → buildCanonicalCast → 原 calculateCast 算法 → Canonical JSON
  → castStore.canonical（唯一当前卦盘）
  → UI 临时投影 / 旧 formatter / AI 请求 / 历史与会话快照
```

## 模块职责

| 目录 | 职责 |
| --- | --- |
| `index.html` | 原静态页面结构、首屏滚动恢复脚本、资源入口 |
| `src/main.js` | 调用显式初始化 |
| `src/app/events.js` | 按原顺序注册事件、初始化 UI、恢复会话；保留原交互流程 |
| `src/app/state.js` | 日期选择、投币模式、对话、取消控制器等会话状态 |
| `src/app/cast-store.js` | Canonical 当前卦盘；旧字段 getter 仅返回临时投影 |
| `src/core/constants.js` | 八卦、八宫、納甲、干支、空亡、五行查表及原生成循环 |
| `src/core/ganzhi.js` | 原日柱、太阳黄经、年月时柱、公历／农历格式化 |
| `src/core/relations.js` | 原有六亲、月令、合冲、进退、回头、飞伏、世应关系；未新增规则 |
| `src/core/casting.js` | 原排盘计算，显式传入日期结果，不读取 DOM |
| `src/core/physics.js` | 原刚体世界、固定步长、落地判定、六爻值转换 |
| `src/core/normalize.js` | Schema、双向字段映射、Canonical 构建、UI 投影 |
| `src/storage` | 原 13 个 key 的读取／写入、惰性兼容迁移、历史、累计统计、会话 |
| `src/ai` | 原预设、Prompt、formatter、DeepSeek SSE 请求、追问、输出清洗；无 DOM 读取 |
| `src/ui` | 导航、手动／物理交互、表格／卡片、历史、设置、弹层及 DOM 引用 |
| `src/styles/main.css` | 原 CSS 原样迁移 |
| `public/vendor/cannon.js` | 原 Cannon 0.6.2 及 MIT 许可，经典脚本 |

`calculateCast` 保留原有数学运算和摘要文案；Canonical 负责规范表达，不重新推算、修正或增加断卦结论。手动输入尚未提交时仍保留原预览逻辑，预览不成为正式卦盘、不消耗额外次数。

## 初始化与依赖

模块在文档解析完成后执行。DOM 引用统一在 `ui/dom.js` 获取；初始化函数保留原事件顺序。存储失败提示及配额变化通过启动时注入的回调通知 UI。AI 层不读取输入控件。

Vite 输出相对资源路径（`base: './'`），JS 目标为 ES2020，接近原页面已使用的可选链／空值合并要求。保留 Cannon 独立脚本以维持原全局加载顺序。没有新增服务端、框架、规则引擎或知识检索。

## 验证

`npm test`：固定卦例、448 个核心组合、Canonical 往返、存储失败／旧记录、完整 Prompt 与 SSE 合约。

`npm run build` 后运行 `npm run test:browser`：实际 Edge 对比冻结原页、开发版、dist。双尺寸截图、手动录入、导出、模拟 API 首次解读／追问／刷新恢复。

日常浏览器测试输出到忽略的 `test-results/browser`，不改写已提交的验收文件。显式执行 `node scripts/verify-browser.js --record` 才更新 `docs/acceptance`；比较来源始终是冻结原 HTML。

真实 API、实际 App 壳及 Cloudflare Preview 单独验收。浏览器模拟不替代这些项目。

## Phase 4：双模式 AI 输入

排盘与 Canonical 继续沿用 Phase 0～3。默认 Legacy 链路保持原 formatter、Prompt 和客户端；Structured 经 `src/ai/structured-input.js`／`schemas.js` 白名单投影后发送，独立于 Canonical Schema，排除兼容扩展与整体趋势摘要。

Structured 会话自带模式及协议版本，追问与刷新恢复保持同一输入协议。debug 导出区域可以从同一个快照切换两份完整提示词，使用原复制按钮进行外部人工 A/B。普通用户主流程不增加实验步骤。

新增验证：`npm run test:browser:structured`；离线成对导出：`npm run ab:prepare`。具体协议、人工评估和回滚见 [PHASE_4_REPORT.md](PHASE_4_REPORT.md)。
