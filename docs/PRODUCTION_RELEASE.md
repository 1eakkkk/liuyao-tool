# 2026-09-24 稳定网站发布记录

## 发布范围

沿用 `gua.1eak.cool` 与 Cloudflare Worker `liuyao`，纯静态前端；默认 Legacy AI 输入，DeepSeek 用户自带 Key 与提示词导出。知识库自动注入不进入发布包。

## 本地验证

- `npm test`：24 文件，340/340 通过。
- `npm run release:check`：51 个模块，5 个发布文件；知识库模块边界与文件白名单通过。
- Legacy 浏览器：开发／生产构建、1280／390 宽度全部通过；提示词、模拟 API、恢复会话与基线一致；页面错误为 0。
- Structured 与 Rules 浏览器：开发／生产构建全部通过；复制、追问、模式恢复及成对输入检查通过。
- 修复旧浏览器测试随机端口触发 `ERR_UNSAFE_PORT` 的问题。
- 发布清单及浏览器详细结果在 `test-results/`，不提交包含运行状态的临时结果。

## 线上执行

发布前查到的生产版本：`60a48bfb-0ba4-4648-9b28-203855787048`（2026-09-23）。实际切换前再次核验。

候选版本：`a174bd0d-8d82-4345-965d-e36d7ef78a5f`，构建源码提交 `a7d77b593facdb051a6fec541d24b1e670c884a4`。后续检查脚本与文档修复不改变上传资产。

[预览地址](https://a174bd0d-liuyao.zhou17749984708.workers.dev/) 在 2026-09-24 02:27 UTC（北京时间 10:27）验收通过：全部运行资产 SHA-256 与本地清单一致，响应头正确，1280／390 宽度手动排盘和提示词导出通过，页面异常为零。本机直连 workers.dev 超时；使用操作系统已配置的网络代理后完成验证。

GitHub 首次自动检查失败，原因是浅克隆缺少冻结测试所需历史以及 Windows 换行转换；已配置完整历史及保留文件字节，未修改冻结记录或放宽断言。[重跑检查全部通过](https://github.com/1eakkkk/liuyao-tool/actions/runs/35947345842)，包括 340 项测试、生产包检查和三套浏览器验证；对应提交 `47bd81f`。

生产切换完成：候选版本 `a174bd0d-8d82-4345-965d-e36d7ef78a5f` 已接收 100% 流量。正式地址为 [gua.1eak.cool](https://gua.1eak.cool/)。

2026-09-24 02:30 UTC（北京时间 10:30）正式域名复查通过：全部运行资产 SHA-256 与预览使用的同一本地清单一致；响应头通过；1280／390 宽度手动排盘、提示词导出通过，页面异常为零。正式域名验证使用本机直连网络。

发布资产清单保存在 [acceptance/stable-20260924-manifest.json](acceptance/stable-20260924-manifest.json)。清单中 `workingTreeDirty: true` 是对当时未跟踪文件的如实记录；用户原有 `docs/PHASE_8B_2_HOLDOUT.md` 未修改、未上传到站点、未纳入本次提交。

GitHub 源码保存在 [release/stable-20260924 分支](https://github.com/1eakkkk/liuyao-tool/tree/release/stable-20260924)。该分支包含原工作分支已有的离线研究历史；本次没有将未验收研究合入 main，生产构建门槛已确认其不进入静态包。

本次稳定网站工程交付完成。后续知识库增强为独立里程碑，不作为本轮发布完成条件。

## 后续发布操作

在仓库根目录依次执行：

```sh
npm ci
npm test
npm run release:check
npm run test:browser
npm run test:browser:structured
npm run test:browser:rules
wrangler versions upload --dry-run
wrangler versions upload --tag <发布标签> --message <源码提交说明>
node scripts/verify-release-url.js https://<候选版本预览地址>
wrangler deployments list --name liuyao
wrangler versions deploy <已验证版本ID>@100 --yes
node scripts/verify-release-url.js https://gua.1eak.cool
```

如环境需要代理，给验证进程设置 `HTTPS_PROXY` 并使用 `node --use-env-proxy`，不将个人代理地址写进仓库。验证脚本从本地发布清单核对远端文件，不调用真实 API。

回滚命令：`wrangler rollback 60a48bfb-0ba4-4648-9b28-203855787048`。这是本轮切换前版本；以后发布必须重新记录当时的上一生产版本，不能永久复用该 ID。

## 验证限制

本轮没有调用真实付费 DeepSeek API。历史文档记录 2026-09-15 真实 API 人工验收通过；本轮 API 自动检查使用模拟响应。没有 Android／Windows 壳程序验收。GitHub CI 结果与线上检查分别记录，不能互相替代。
