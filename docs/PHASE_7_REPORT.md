# Phase 7.0：Knowledge provenance/schema foundation

## 范围

**Phase 7.0 knowledge provenance/schema foundation complete**

基线：`fb08828ae32341f4c77aa98f9fa7755fdee323b1`。开发分支：`phase7/knowledge`。

本轮仅实现 SourceEdition、SourceSegment、KnowledgeUnit、Commentary、空 concept/catalog、出处/修订/审核约束、离线校验器、虚构 fixture 和测试文档。

正式 sources/classics/units/commentary 全部为空，未选择底本，未录入任何正式古籍知识单元。Case Schema 未实现，仅在 KNOWLEDGE_LAYER.md 记录未来边界。

## 实现

- 四类记录使用独立封闭 Schema，拒绝未知字段；无 confidence。
- 多角色署名与 attribution_basis/certainty 保留 unknown，不补全常见署名。
- 来源、版本、片段、Unicode span、转写哈希及完整记录哈希可校验。artifact_hash 另行标识底本文件哈希，当前不自动读取或认证外部底本。
- 规则引用只检查现有 Ruleset r1 的 25 个 ID，固定 association_only，不执行或修改规则，不作为文献证明。
- 结构有效与正式准入分离：非 reviewed、出处不完整、上游未准入、争议或待核条件均不准入。
- fixture/test_only 只能用于测试；正式检查命令拒绝混入。没有生产 corpus 加载器。
- 修订比较可显式接收 previous 快照；检查内容变动、文字转写修订、退役与 supersedes。无历史快照时不宣称历史完整性已认证。
- 校验函数不修改输入；catalog 仅提供受控概念/别名/分类/标签结构，无正式条目。

## 验证

- `npm test -- --maxWorkers=1`：13 个测试文件，**161/161 通过**（原 132 项 + 新增 29 项），耗时 65.94 秒。
- 新测试覆盖四类 Schema、嵌套未知字段、ID 唯一性、修订、审核状态、署名 unknown、出处必填、底本及片段版本引用、Unicode span、缓存原文、转写/记录哈希、底本哈希准入门槛、r1 关联、受控概念/标签、争议、现代注释引用、历史快照与 fixture 隔离。
- `node scripts/knowledge/validate-corpus.js`：退出码 0；sources/segments/units/commentary 均为 0，正式准入集合为空。
- `npm run build`：通过，51 个模块；JS `index-BUs3Mv5n.js`，CSS `index-63lbvoss.css`，与基线产物文件名一致。既有 Cannon 经典脚本构建提示仍在，无新增构建警告。
- `git diff --check` 和暂存差异检查通过。全部差异仅为本轮 12 个新增文件，没有修改现有生产文件、依赖或配置；生产代码未引用 Knowledge。
- 本轮不要求浏览器回归，未重复执行浏览器套件；现有全部自动回归通过，构建产物入口未变化。

## 生产边界与限制

Core、Canonical、src/rules、Legacy、Structured 1.0/1.1、Prompt、UI、生产入口、Cloudflare 配置均不修改。无新 npm 依赖，无生产模块引入 Knowledge。

不实现检索、去重、AI 注入、Structured 1.2、索引构建、成对导出或 Case Schema。没有任何知识效果实验；本报告不评价回答、经典有效性或预测准确率。

出处校验是结构、引用和完整性检查，不能证明底本真实、转写忠实、署名确凿或审核实际完成；这些必须在未来确定底本后核对。所有测试数据均为虚构测试资料，不进入正式 corpus。

完成后单独提交、不 push，停止于 Phase 7.0，不进入 7.1。
