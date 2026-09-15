# 代码结构导览

本分支已按用户确认的 REFACTOR_PLAN 迁移为 Vite + ES Modules。旧“单文件、零构建”的贡献约束已由该方案取代。

- `src/core`：原排盘、历法、物理计算、Canonical。
- `src/ai`：原 Prompt、formatter、DeepSeek SSE 与追问。
- `src/storage`：13 个原 key、历史、会话、兼容迁移。
- `src/ui`：页面渲染、设置、导航与交互。
- `src/app`：初始化事件、问题与对话控制、唯一卦盘状态。
- `src/styles/main.css`：原样式。
- `public/vendor/cannon.js`：原物理库。

完整 [迁移表](docs/MIGRATION_MAP.md)、[架构](docs/ARCHITECTURE.md)、[Schema](docs/DATA_SCHEMA.md)、[验证与部署](docs/DEPLOYMENT.md)。

本轮仅 Phase 0～2。不得提前增加规则引擎、知识库、RAG、Benchmark、后端或重设计 UI。
