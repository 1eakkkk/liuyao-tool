# Canonical Hexagram JSON 1.0

入口：`src/core/normalize.js` 的 `buildCanonicalCast({lines, source, calendar, daySelectionMode, question, createdAt, castId})`。

| 字段 | 含义 |
| --- | --- |
| `schema_version` | 固定 `1.0`，未知版本明确拒绝 |
| `meta.cast_id` | 新卦标识；旧快照使用稳定导入标识，不作为安全哈希 |
| `meta.created_at` | ISO 时间；旧记录未知时为 null，不猜测起卦时间 |
| `meta.source` | 保留 `manual`／`physics`／旧 `system`，不改变来源语义 |
| `meta.coin_convention` | 原 `coinConvention` |
| `question.text/topic` | 问题原文；topic 保持 null，本轮不分类 |
| `versions` | app、engine、prompt 及原 `rulesVersion`，未伪造知识库／Benchmark 版本 |
| `calendar` | 年月日时干支、日月地支、空亡、原始年月日锚点；未知字段保留缺失或原“未指定”文本 |
| `hexagram.primary` | 原卦名、上下卦、宫位 |
| `hexagram.changed` | 原变卦名，静卦为 null |
| `hexagram.shi_line/ying_line` | 世／应爻位，1～6 |
| `lines` | 严格初爻→上爻六个对象；UI 倒序只改变展示 |
| `lines[].yin_yang/moving` | 阴阳及动静 |
| `lines[].ganzhi/branch/element/relative/spirit` | 纳甲、地支、五行、六亲、六神 |
| `lines[].is_shi/is_ying/is_kongwang` | 原世／应／空亡标记 |
| `lines[].changed/hidden` | 原变爻／伏神字段，无值时 null；没有重新推算 |
| `lines[].relations` | 原月令、日辰、回头、进退、飞伏关系 |
| `display` | 冻结版展示摘要文字，保证表格与 Prompt 文案完全一致 |
| `compatibility` | 原字段存在列表及未知扩展；区分缺失、空字符串与 null，实现无损往返 |

`assertCanonicalCast` 在输入边界验证版本、基础结构、六爻顺序、阴阳动静、字段映射。`toLegacyCast` 是兼容投影；`formatCastDataForAI` 从投影生成原 AI 文本，不增加 JSON 到旧 Prompt，不重算排盘。

## 单一数据源与存储

内存只保留 `castStore.canonical`。`castStore.legacy` 每次产生短期旧格式对象，不另存卦盘。

磁盘为回滚采用加法兼容：原 `cast`／`castData` 的旧字段保留，并增加 `canonical`。老页面忽略这个新增字段，新页面优先读取它。磁盘中有意保留旧投影，避免回滚后旧客户端读不懂历史；它不成为第二份运行时真值。

这种方式会增大快照体积；达到 localStorage 配额时保存失败并保留原值，自动会话保存仍按旧行为静默失败。

## 迁移策略

`migrateStorage()` 只读取两个已有 key：历史与当前会话；读取时转换内存对象，**不在启动时重写 localStorage**。其余 API Key、偏好、计数等 key 不变。

下次成功的正常保存写入加法兼容格式。历史按原上限保留 200 条，旧扁平记录及 prompt／多轮记录均可读。转换失败的历史条目原样保留；JSON 损坏或未知的活动会话不被后台保存／清理覆盖。不记录或导出真实 API Key。

原最早历史没有日期锚点的恢复兜底仍然保留；现代记录中“仅日柱”的 null 锚点不会被补成今天。

Schema 示例见 `canonical-example.json`。回归样例来自原 HTML，不是独立历法正确性证明。

## Phase 4 的独立 AI Input Schema

Canonical 1.0 的字段与语义保持不变。`buildStructuredAiInput(canonical)` 只读地选择 AI 所需白名单字段，生成独立的 AI Input Schema 1.0。排除 `compatibility`、未知扩展以及 `display.overall_trend_text`，不将投影写回 Canonical。字段清单、缺失值语义和实验协议见 [PHASE_4_REPORT.md](PHASE_4_REPORT.md)。
