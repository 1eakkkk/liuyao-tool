# 个人计划取法准入 · 发布记录（2026-10-07）

## 发布内容

结构化模式新增「个人计划／项目能否推进」取法准入，并把三种覆盖缺口分开呈现。

- `plan-admission.js`：以世爻为观察位置，六项机制全部来自库内已转录段落（進神退神章第二十九、動變生尅沖合章第十五、月將章第十六、日辰章第十七）。不选用神，不新增古籍，无机制可单独定成败。
- `availability.js`：区分「取法未覆盖」「卦盘依据缺失」「现实条件未确认」，第三种不拦截生成，改为列出待确认事项。
- `selection.js`：这一类允许给出有主次的有限方向；协助类仍只作条件性观察。
- `reading.js` / `view.js`：三种缺口分别显示，第三种在生成后仍保留提示。

## 上线

- 源码提交 `ad408d0d302a3443f63920989b53cc5e1f04d96a`，已推送 `origin/main`（`0036692..ad408d0`，快进）。
- Cloudflare Worker `liuyao`，版本 `002cf05a-0a99-4660-a537-87ce4b0cf016`。
- 线上资产 `assets/index-x5UV9oX4.js`、`assets/index-DHxyeb1k.css`；`index.html` 已更新。
- **线上 JS 的 SHA-256 与本地 `dist` 完全一致**：`6a91702b511fbd39961ec3ce5bb50b0eb05302083f59b1096fdc39f0c3cb0eee`。
- 线上 bundle 含 `plan-shi-return-control`、`plan-shi-advance`、`plan-shi-day-clash`、`plan-shi-month-clash` 及三种缺口文案。

## 发布前本地验证

- 全量工程检查 **94 文件 / 1123 项通过**（干净提交树）。
- `npm run release:check` 通过，`workingTreeDirty: false`，5 个资产入清单。
- CI 同款浏览器脚本全部 EXIT=0：`test:browser`、`structured`、`rules`、`output`、`facts`、`reading`、`interface`、`background`、`entry`、`editorial`、`usability`、`theme`、`controls`、`mapping-admission`。

## 发布后线上验证

- `https://gua.1eak.cool/` HTTP 200，HTML 引用新资产。
- 线上 Chromium 1280／390／320 三宽度：`mapping-admission` 6 项通过；`reading` 三宽度各 6 项通过，无页面错误。
- 线上验收一律使用拦截后的模拟回复与测试用 Key，**未产生付费调用**。

## GitHub 自动检查

| 提交 | 内容 | 结果 |
| --- | --- | --- |
| `ad408d0` | 本次发布的源码 | [37473801565](https://github.com/1eakkkk/liuyao-tool/actions/runs/37473801565) **success** |

发布记录本身的提交只改文档，另行触发一次检查；其结论不改变上述发布源码的验证状态。

## 本轮真实调用与费用

真实调用共 3 次，均未重试，全部发生在发布之前：

| 批次 | 调用 | 结果 |
| --- | --- | --- |
| 第一轮 | 1 | `fallback`（解释复述卦盘属性，被正确拦下） |
| 第二轮 | 2 | `validated`，零问题 |

费用按空闲时段单价与 token 计算，合计约 **¥0.026**（第一轮约 ¥0.008，第二轮约 ¥0.0175）。封盘计划内的 `conservativePeakCostCny` 按高峰价、未区分缓存，仅作按封盘价计算的值，不代表实际扣费。

## 回滚

线上为 Cloudflare Worker `liuyao`，回滚使用**版本 ID**，不是源码提交号：

```sh
npx wrangler versions list          # 取目标版本 ID
npx wrangler rollback <版本ID>
```

本次发布前的生产版本为 `fcc39afd-b669-43bf-bff2-232bd2c3dc85`（2026-10-06T12:16:18Z，即 `READING_AVAILABILITY_RELEASE.md` 记录的那一版），可作为回滚目标。`0036692` 是源码提交号，**不能**用于回滚 Worker。

本次发布期间本机出现两个相邻版本：`a7df0107-…`（13:49:24Z）与当前生效的 `002cf05a-…`（13:49:55Z）。已核对当前生效版本的线上资产与本地构建逐字节一致，回滚与验收均以 `002cf05a` 为准；`a7df0107` 未被使用，其来源未确认，不作为验收依据。

回滚不清空 localStorage。

注意：本机 git 配置的代理 `127.0.0.1:16849` 已不可用，推送／拉取需 `-c http.proxy= -c https.proxy=` 绕过；`gh` 与 `wrangler` 不受影响。

## 未做的事

未扩古籍数量、未增加 API 服务商、未改界面结构、未接入任何未通过的三层候选。旧会话与旧历史按原策略读取，不自动升级。
