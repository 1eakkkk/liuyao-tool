# 第一轮部署与验收

## 本地

要求 Node 24.15+（本次使用 24.18）。

```sh
npm ci
npm test
npm run dev
npm run build
npm run preview
npm run test:browser
```

浏览器测试默认使用本机 Edge；可设置 `BROWSER_CHANNEL` 使用其他已安装的 Playwright channel。测试只用合成 API Key 与拦截响应，不调用付费接口。

## Cloudflare Pages

- 构建命令：`npm run build`
- 输出目录：`dist`
- Node 版本：24.18.0
- Preview 分支：`refactor/v2`
- 生产分支保持原有配置，不指向重构分支。

本轮检查发现本机 Wrangler 已安装，但登录令牌过期且无法刷新。需用户在本机 `wrangler login` 后确认现有 Pages 项目名称，方能针对正确项目部署 Preview。

登录后先用 `wrangler pages project list` 核实项目及生产分支，再部署：

```sh
wrangler pages deploy dist --project-name <已核实的项目名> --branch refactor/v2
```

部署前须确认该项目生产分支不是 `refactor/v2`。不能把本地 `vite preview` 当作 Cloudflare Preview 完成。

## 发布前人工验收

- Preview 上实际摇卦、逐次／连续投币、取消、手动修正、日期／时辰选择。
- 真实 DeepSeek Key 的首次解读、追问、停止、刷新恢复、费用显示。
- 当前 Android／Windows App 壳加载 Preview，确认资源路径、CSP、ES Module 和联网行为。仓库没有这两个壳的源码，本轮不能据网页测试推断其版本兼容。
- 与冻结的权威主文件对比；线上站点可能仍是用户指出的落后版本，差异须注明来源，不以旧线上覆盖权威文件。
- 用户人工确认后方可考虑后续阶段／合并；本轮不进入 Phase 3。

## 回滚

权威单文件回滚提交为 `1964881`。原 `v1-baseline` 指向更早 GitHub 页面，不应作为此次功能回退目标。也可逐个 revert 阶段提交。原文件永久保留于 `tests/regression/baseline/index.html`。

回滚时不清空 localStorage。新快照保留旧字段，老页面可以继续读取；回到新版本时缺失的 Canonical 会在读取时重新转换。
