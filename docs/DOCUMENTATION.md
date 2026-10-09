# 文档导航

更新：2026-10-09。使用说明只维护根目录的 [README](../README.md)，当前功能以代码与下面的现状文档为准。

| 需要了解什么 | 文档 |
| --- | --- |
| 当前功能、范围和后续方向 | [项目状态](PROJECT_STATUS.md) |
| 本地运行、验证、Cloudflare 发布与回滚 | [部署维护](DEPLOYMENT.md) |
| 模块职责与调用链 | [架构](ARCHITECTURE.md) |
| 排盘数据与确定性关系 | [数据结构](DATA_SCHEMA.md)、[规则系统](RULE_SYSTEM.md) |
| 当前结构化 API、提示词、正文及引用处理 | [结构化解读](STRUCTURED_OUTPUT.md) |
| 最近一次完整发布与验收 | [发布记录](PRACTICAL_READING_RELEASE.md) |
| 测试文件用途、可清理范围 | [测试资料说明](TEST_DATA_GUIDE.md) |
| 离线知识研究及其复现约定 | [知识层](KNOWLEDGE_LAYER.md)、[冻结与复现](REPRODUCIBILITY.md) |
| 从旧单文件定位函数 | [迁移映射](MIGRATION_MAP.md) |

## 保留的历史材料

- [原始重构方案](../REFACTOR_PLAN.md)是历史设计参考，不是当前待执行任务清单。
- [验收资料](acceptance/)和实验目录的 README 解释原始证据、适用范围或冻结版本，不是重复的项目使用说明。
- `PHASE_8A_REPORT.md`、`PHASE_8B_DESIGN.md`、`PHASE_8B_2A_DESIGN.md`、`PHASE_8B_2C_CANDIDATE_REVISION.md` 被现有测试或冻结清单直接依赖，保留原路径与内容。它们的阶段状态不代表当前产品状态。

2026-10-09 整理时，`docs` 顶层从 107 份 Markdown 收敛为 16 份。91 份已被当前说明替代的过程报告移出当前工作树；没有复制到另一个归档目录继续堆积。完整旧文档可查阅[清理前的固定版本](https://github.com/1eakkkk/liuyao-tool/tree/b1e2d137bab8e39ab46a601578c4fab3476251aa/docs)，失败结论、原始数据与 Git 历史未被改写。

需要恢复某份旧文档时，可从该固定版本下载，或在仓库中执行：

```powershell
git show b1e2d137bab8e39ab46a601578c4fab3476251aa:docs/文件名.md
```

## 后续维护约定

功能使用方式写入 README；架构、部署、协议分别更新对应文档。发布结果追加到现有发布记录，普通小改动使用提交说明，不再每推进一次就新建一份 `*_RELEASE.md`、`*_PLAN.md` 或重复状态报告。需要独立保存的实验材料必须有可复现用途与明确入口。
