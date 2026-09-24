# 第一轮部署与验收

> 本文下方保留第一轮历史记录。2026-09-24 的稳定版范围、验收及部署流程以 [生产收尾方案](PRODUCTION_PLAN.md) 和 [发布记录](PRODUCTION_RELEASE.md) 为准；历史“暂不部署／不进入下一阶段”描述不代表本轮状态。

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

## Worker 静态构建设置

- 构建命令：`npm run build`
- 输出目录：`dist`
- Node 版本：24.18.0
- 开发分支：`refactor/v2`
- 生产设置保持不变。

## Cloudflare 当前状态（用户确认）

- Wrangler 已由用户重新登录，账号正常。
- Dashboard 项目名：`liuyao`，绑定域名：`gua.1eak.cool`。
- 该项目不在 `wrangler pages project list` 中；用户以前通过 Dashboard 拖动文件部署。
- 用户现已确认部署类型为 Cloudflare Worker，名称为 `liuyao`，不是 Pages。
- 用户明确要求本轮跳过 Cloudflare Preview。没有执行 `wrangler pages deploy`，没有覆盖生产环境。

根目录 `wrangler.jsonc` 仅配置 Worker 名称、兼容日期和 `assets.directory: "./dist"`，没有 Worker 后端入口、路由或域名变更。静态资产配置依据 [Cloudflare 官方文档](https://developers.cloudflare.com/workers/static-assets/binding/)。

本轮仅验证，不执行实际部署：

```sh
npm run build
npx wrangler deploy --dry-run
```

dry-run 通过不代表线上部署或 Preview 验收完成。实际部署仍待单独授权，不直接覆盖现有生产资源。

## 发布前人工验收

- Preview 上实际摇卦、逐次／连续投币、取消、手动修正、日期／时辰选择。
- 真实 DeepSeek Key 的首次解读、追问、停止、刷新恢复、费用显示。
- 当前 Android／Windows App 壳加载 Preview，确认资源路径、CSP、ES Module 和联网行为。仓库没有这两个壳的源码，本轮不能据网页测试推断其版本兼容。
- 与冻结的权威主文件对比；旧 GitHub HTML 不是基线。本轮曾读取方案中的 `liuyao.1eak.cool`，该次源比较不代表新确认的 `gua.1eak.cool` 的生产验收。
- 用户人工确认后方可考虑后续阶段／合并；本轮不进入 Phase 3。

## 回滚

权威单文件回滚提交为 `1964881`。原 `v1-baseline` 指向更早 GitHub 页面，不应作为此次功能回退目标。也可逐个 revert 阶段提交。原文件永久保留于 `tests/regression/baseline/index.html`。

回滚时不清空 localStorage。新快照保留旧字段，老页面可以继续读取；回到新版本时缺失的 Canonical 会在读取时重新转换。
