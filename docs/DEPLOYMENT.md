# 部署与维护

更新：2026-10-09。源码仓库为 `1eakkkk/liuyao-tool`；Cloudflare Worker `liuyao` 仅托管 `dist/` 静态资源，正式域名 https://gua.1eak.cool/ 。配置以 `wrangler.jsonc` 为准。

## 本地开发

要求 Node 24.15+；CI 当前固定 24.18.0。Windows 优先使用 **PowerShell 7（pwsh）**，除非用户指定或兼容任务确实需要 5.1。

```powershell
npm ci
npm run dev
```

日常修复先运行受影响的测试；发布代码时运行必要的回归与构建检查：

```powershell
npm test -- --maxWorkers=1
npm run release:check
npm run test:browser:reading
```

整站检查步骤见 [GitHub 工作流](../.github/workflows/verify.yml)。浏览器脚本使用模拟 Key 和请求拦截，不能当作真实模型内容验收。运行 WebKit 检查前需安装相应 Playwright 浏览器；真实付费调用必须另有预算和固定次数，不自动重试。

只有文档变化时核对链接、引用和受影响的冻结测试即可，不需要为此调用模型或重新发布 Cloudflare。

## 发布

确认工作区、Git 提交与准备发布的代码一致。在本机需要登录时使用 `npx wrangler login`，不将令牌写入仓库。

```powershell
npm run release:check
npx wrangler deploy
```

构建命令会生成 `test-results/release-manifest.json`，记录源码提交、工作区状态与资源 SHA-256。部署只使用这次检查生成的 `dist/`；不要在检查后换分支、混入实验构建或重建不同配置再直接发布。

部署成功后记录 Worker 版本，检查正式域名、资源哈希、响应头和关键流程。首页应重新验证缓存；已打开的旧页面仍需刷新。最新实际发布证据统一维护在 [PRACTICAL_READING_RELEASE](PRACTICAL_READING_RELEASE.md)。

## 回滚

发布前保存上一个已验证的 Worker 版本。必要时通过 Wrangler／Cloudflare 恢复该版本，或从对应 Git 提交重新构建检查后发布。不要把远古的单文件测试基线直接当作最新稳定回滚点，也不要清空用户本地历史。

## 凭据与资料

密钥、`.env`、真实请求响应及预算账本保存在忽略的本机路径，不上传到静态资源或 GitHub。`tests`、`docs/acceptance` 和冻结资料有复现用途，清理前见 [测试资料说明](TEST_DATA_GUIDE.md)。

本机可能有多个 Git 工作区；先核对 `git status`、当前分支和 `origin/main`，不要把同仓库的另一版本误当重复文件夹清空。网站工程通过不等于 Android／Windows 外壳程序或模型预测准确性通过。
