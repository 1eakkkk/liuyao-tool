# Liuyao Tool 重构与“可计算、可追溯、可验证”六爻推理系统完整实施方案

> 项目：`1eakkkk/liuyao-tool`  
> 线上站点：`liuyao.1eak.cool`  
> 文档用途：直接交给 GPT-6 Astra / Coding Agent 执行  
> 文档目标：在**不破坏现有网站功能和使用方式**的前提下，把当前“单 HTML + AI 解卦”逐步重构为“结构化排盘 + 规则引擎 + 知识库 + Benchmark + 真实反馈验证”的六爻推理系统。  
> 核心目标不是商业化，而是：**让断卦过程更稳定、更一致、更有依据、更可验证，并逐步判断这些改动是否真的提高了参考价值与预测表现。**

---

# 0. 总原则

本项目后续所有改造必须遵循以下原则。

## 0.1 先保证“现有功能不坏”，再谈升级

当前版本已经可以正常：

- 起卦
- 手动录入
- 排盘
- 计算纳甲
- 计算六亲
- 计算六神
- 计算世应
- 计算空亡
- AI 解卦
- 导出提示词
- 保存本地历史
- 保存 API Key
- 调整回复风格与推理档位
- 网页 / Android / Windows 共用同一网页逻辑

因此第一阶段**不允许为了架构漂亮而重写业务逻辑**。

原则：

```text
先迁移
再验证
再重构
最后才新增能力
```

禁止：

```text
先推倒
再重写
再补功能
再试图恢复兼容
```

---

## 0.2 不允许一次性大改

整个项目必须采用分阶段迁移。

每个 Phase 完成后都必须满足：

1. 网站可以独立运行。
2. 已有功能仍然正常。
3. 已有页面行为不发生非预期变化。
4. 关键功能有测试或人工验收记录。
5. 可以随时回滚到上一个稳定版本。

---

## 0.3 不追求“把六爻全部硬编码”

本项目不试图写出一个“绝对正确的六爻大师”。

程序主要负责：

- 排盘事实
- 确定性规则
- 局部关系识别
- 结构化结果
- 规则来源
- 证据链

AI 主要负责：

- 理解用户问题
- 识别事项类别
- 选择或比较用神候选
- 综合多个规则之间的冲突
- 根据语义与上下文形成最终判断
- 解释判断过程
- 给出不确定性

必须严格区分：

```text
程序事实 ≠ 六爻解释 ≠ 最终判断
```

---

## 0.4 不做伪科学式“准确率包装”

六爻本身并没有被现代科学证明具有稳定预测未来的能力。

因此项目中的“更准”必须拆成可验证指标：

- 排盘是否正确
- 基础规则识别是否正确
- AI 是否前后矛盾
- AI 是否遗漏关键因素
- AI 是否错误重算程序事实
- 同类问题判断是否更一致
- 已知经典卦例上的拟合表现
- 真实前瞻案例上的结果表现

禁止直接使用：

```text
准确率 90%
预测必准
AI 六爻大师
```

这类无法验证的宣传。

---

# 1. 当前项目状态

当前项目主要特点：

```text
index.html
```

承担了绝大多数功能。

当前结构大致为：

```text
index.html
├─ CSS
├─ HTML
├─ 排盘逻辑
│  ├─ 纳甲
│  ├─ 八宫
│  ├─ 世应
│  ├─ 六亲
│  ├─ 六神
│  ├─ 空亡
│  └─ 起卦逻辑
│
├─ UI
│  ├─ 基础知识
│  ├─ 起卦排盘
│  ├─ 断卦入门
│  └─ AI 解卦
│
├─ localStorage
│  ├─ API Key
│  ├─ 回复风格
│  ├─ 模型
│  └─ 历史记录
│
├─ AI
│  ├─ buildSystemPrompt
│  ├─ formatCastDataForAI
│  ├─ buildExportPromptText
│  └─ interpretWithDeepSeek
│
└─ 各类事件监听
```

问题不在于“单 HTML 不能运行”，而在于：

- 排盘逻辑与 UI 耦合
- AI Prompt 与业务逻辑耦合
- 数据没有稳定 Schema
- 没有独立规则层
- 没有知识层
- 没有系统测试
- 很难比较两个版本谁更好
- 很难建立可验证 Benchmark
- 后续任何新增功能都会让单文件继续膨胀

---

# 2. 目标架构

最终目标：

```text
用户问题
    ↓
问题分类
    ↓
排盘引擎
    ↓
Canonical JSON
    ↓
事实提取
    ↓
规则引擎
    ↓
知识检索
    ↓
AI 综合判断
    ↓
结构化输出
    ↓
用户可读解读
    ↓
结果反馈 / Benchmark
```

推荐最终目录：

```text
liuyao-tool/
├─ index.html
├─ package.json
├─ vite.config.js
│
├─ src/
│  ├─ main.js
│  │
│  ├─ core/
│  │  ├─ constants.js
│  │  ├─ ganzhi.js
│  │  ├─ bagua.js
│  │  ├─ najia.js
│  │  ├─ eight-palace.js
│  │  ├─ shiying.js
│  │  ├─ liuqin.js
│  │  ├─ liushen.js
│  │  ├─ kongwang.js
│  │  ├─ casting.js
│  │  └─ normalize.js
│  │
│  ├─ rules/
│  │  ├─ engine.js
│  │  ├─ registry.js
│  │  ├─ strength/
│  │  ├─ kongwang/
│  │  ├─ yuepo/
│  │  ├─ moving/
│  │  ├─ relations/
│  │  ├─ shiying/
│  │  └─ transformation/
│  │
│  ├─ knowledge/
│  │  ├─ loader.js
│  │  ├─ rules/
│  │  ├─ classics/
│  │  └─ cases/
│  │
│  ├─ ai/
│  │  ├─ prompt-builder.js
│  │  ├─ formatter.js
│  │  ├─ interpreter.js
│  │  ├─ models.js
│  │  └─ schemas.js
│  │
│  ├─ benchmark/
│  │  ├─ runner.js
│  │  ├─ evaluator.js
│  │  └─ metrics.js
│  │
│  ├─ storage/
│  │  ├─ local.js
│  │  ├─ history.js
│  │  └─ versions.js
│  │
│  ├─ ui/
│  │  ├─ navigation.js
│  │  ├─ casting-view.js
│  │  ├─ ai-view.js
│  │  ├─ settings.js
│  │  └─ history-view.js
│  │
│  └─ styles/
│     └─ main.css
│
├─ knowledge/
│  ├─ rules/
│  ├─ classics/
│  └─ cases/
│
├─ benchmark/
│  ├─ fixtures/
│  ├─ classical/
│  └─ reports/
│
├─ tests/
│  ├─ core/
│  ├─ rules/
│  ├─ ai/
│  └─ regression/
│
├─ scripts/
│  ├─ validate-knowledge.js
│  ├─ import-cases.js
│  └─ benchmark.js
│
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ DATA_SCHEMA.md
│  ├─ RULE_SYSTEM.md
│  ├─ KNOWLEDGE_BASE.md
│  └─ BENCHMARK.md
│
└─ dist/
```

注意：

- `dist/` 为构建产物。
- 源码多文件。
- 部署仍然是纯静态站。
- 暂时不需要后端。
- 不使用 React / Vue / Next.js。
- 使用 Vite + 原生 JavaScript 即可。
- 后续如果有明确收益再迁移 TypeScript。

---

# 3. 技术栈要求

第一阶段建议：

```text
Vite
Vanilla JavaScript
ES Modules
Vitest
JSON
Cloudflare Pages
```

暂时不要引入：

- React
- Vue
- Redux
- Next.js
- SSR
- Node 服务端
- PostgreSQL
- Docker
- Redis
- 向量数据库
- 微服务

理由：

项目当前最大问题不是框架能力，而是：

- 数据结构
- 模块边界
- 规则体系
- 测试体系
- 验证体系

---

# 4. 版本体系

从 Phase 0 开始，所有影响解卦结果的东西必须版本化。

建议：

```json
{
  "app_version": "2.0.0",
  "engine_version": "2.0.0",
  "ruleset_version": "2026.09.15",
  "prompt_version": "p1",
  "knowledge_version": "k1",
  "benchmark_version": "b1"
}
```

AI 调用记录中建议同时保存：

```json
{
  "model_provider": "deepseek",
  "model_name": "deepseek-reasoner",
  "temperature": 0.2
}
```

目的：

以后出现判断差异时能够定位：

```text
排盘变了？
规则变了？
Prompt 变了？
模型变了？
知识库变了？
```

---

# 5. Canonical Hexagram JSON

这是整个新架构的核心。

所有模块统一读取同一种标准格式。

## 5.1 基础 Schema

示例：

```json
{
  "schema_version": "1.0",

  "meta": {
    "cast_id": "uuid",
    "created_at": "2026-09-15T12:00:00+08:00",
    "source": "web_auto"
  },

  "question": {
    "text": "这个月能不能找到新工作？",
    "topic": null
  },

  "calendar": {
    "year_ganzhi": "丙午",
    "month_ganzhi": "丁酉",
    "day_ganzhi": "甲子",
    "hour_ganzhi": null,
    "month_branch": "酉",
    "day_branch": "子",
    "kongwang": ["戌", "亥"]
  },

  "hexagram": {
    "primary": {
      "name": "火泽睽",
      "upper_trigram": "离",
      "lower_trigram": "兑",
      "palace": "艮宫"
    },
    "changed": {
      "name": "天泽履"
    },
    "shi_line": 4,
    "ying_line": 1
  },

  "lines": [
    {
      "position": 1,
      "yin_yang": "yang",
      "moving": false,
      "branch": "巳",
      "element": "火",
      "relative": "父母",
      "spirit": "青龙",
      "is_shi": false,
      "is_ying": true,
      "changed": null
    }
  ]
}
```

---

## 5.2 设计原则

必须满足：

1. UI 不再持有独立排盘数据。
2. AI 不再直接读取 DOM。
3. Prompt 不再自行重算排盘。
4. 规则引擎只接收标准 JSON。
5. Benchmark 只接收标准 JSON。
6. 导出提示词从标准 JSON 生成。
7. 历史记录保存标准 JSON。

---

# 6. AI 输入协议

AI 不应该再收到一大段无结构文本然后自己猜。

推荐输入分为五段：

```text
A. 用户问题
B. 标准卦盘 JSON
C. 程序已确认事实
D. 规则引擎输出
E. AI 任务说明
```

---

## 6.1 AI 系统指令原则

明确告诉 AI：

```text
1. 不重新计算程序已经确定的排盘事实。
2. 不修改纳甲、六亲、世应、旬空、动爻等基础数据。
3. 必须区分：
   - 程序事实
   - 六爻规则推论
   - AI 综合判断
4. 如果规则冲突，应说明冲突，而不是强行忽略。
5. 如果用神存在多个合理候选，应明确列出候选与理由。
6. 如果信息不足，不允许编造。
7. 最终判断必须引用关键规则或事实。
8. 应期只能作为候选范围，不允许伪装成确定事件。
```

---

## 6.2 AI 输出建议

推荐要求 AI 输出 JSON，再由前端渲染。

示例：

```json
{
  "topic": "career",

  "yongshen": {
    "primary": "官鬼",
    "alternatives": ["父母"],
    "reasoning": "求职以官鬼为主要用神，合同与录用通知可兼看父母"
  },

  "summary": {
    "direction": "偏有利",
    "confidence": "medium"
  },

  "key_factors": [
    {
      "type": "positive",
      "text": "官鬼得日生"
    },
    {
      "type": "negative",
      "text": "官鬼月休"
    }
  ],

  "timing": [
    {
      "candidate": "某时间范围",
      "reason": "出空 / 值日 / 逢冲"
    }
  ],

  "uncertainties": [
    "用神存在次级候选",
    "某动爻影响存在不同流派解释"
  ],

  "answer": "最终自然语言回答"
}
```

前端优先显示：

- 核心结论
- 关键依据
- 推理过程
- 应期候选
- 不确定性

---

# 7. 规则引擎设计

## 7.1 规则引擎负责什么

只处理相对确定或可程序识别的内容。

第一阶段：

- 旬空
- 月破
- 日冲
- 日合
- 月合
- 五行生克
- 六合
- 六冲
- 动爻
- 变爻
- 回头生
- 回头克
- 进神
- 退神
- 世应关系
- 用神与世爻之间关系
- 基础旺衰信息

暂不处理：

- 复杂取用神
- 多重用神优先级
- 特殊职业问题
- 婚恋流派差异
- 疾病复杂细断
- 高级应期体系
- 特殊卦象口诀的绝对化判断

---

## 7.2 规则不是“最终答案”

错误示例：

```javascript
if (isKong) {
  result = "事情不会成功"
}
```

正确思路：

```json
{
  "rule_id": "KONG-001",
  "target": "官鬼寅木",
  "fact": "旬空",
  "interpretation": "当前作用可能难以落实或存在延迟",
  "strength": "medium",
  "exceptions": [
    "旺而逢空",
    "动而逢空",
    "冲空",
    "填实"
  ]
}
```

---

## 7.3 禁止伪造数值权重

暂时不要：

```text
吉 +3
凶 -2
```

除非未来通过真实案例数据证明这种权重有统计意义。

第一阶段只用：

```text
strong
medium
weak
```

或者：

```text
support
oppose
neutral
conditional
```

---

# 8. 规则 Schema

推荐：

```json
{
  "id": "KONG-001",

  "name": "用神旬空",

  "category": "kongwang",

  "scope": ["general"],

  "conditions": [
    {
      "field": "target.is_kong",
      "operator": "eq",
      "value": true
    }
  ],

  "effect": {
    "type": "conditional",
    "description": "当前事情可能难落实、存在延迟或尚未成形"
  },

  "exceptions": [
    "旺空",
    "动空",
    "冲空",
    "填实"
  ],

  "source_refs": [
    "ZSBY-KONG-01"
  ],

  "confidence": "high",

  "status": "active"
}
```

每条规则必须有：

- 唯一 ID
- 名称
- 分类
- 使用范围
- 条件
- 局部含义
- 例外
- 来源
- 可信级别
- 状态

---

# 9. 知识库架构

知识库分三层。

```text
knowledge/
├─ classics/
├─ rules/
└─ cases/
```

---

## 9.1 Classics：原始文献

用途：

- 保留原文
- 提供规则来源
- 提供可追溯证据

Schema 示例：

```json
{
  "id": "ZSBY-KONG-01",
  "book": "增删卜易",
  "chapter": "旬空章",
  "original_text": "……",
  "modern_note": "……",
  "tags": ["旬空"],
  "source": "……"
}
```

要求：

- 原文和现代解释分开
- 不允许把 AI 改写文本冒充古籍原文
- 所有引用必须能追溯到来源

---

## 9.2 Rules：结构化规则

从古籍和稳定共识中提炼。

建议初期只做：

```text
20～50 条
```

而不是一次做 500 条。

优先：

1. 旬空
2. 月破
3. 日冲
4. 日合
5. 月合
6. 五行生克
7. 六合
8. 六冲
9. 动爻
10. 回头生
11. 回头克
12. 进神
13. 退神
14. 世应基础关系

---

## 9.3 Cases：案例库

分为：

```text
classical
modern
verified
```

案例 Schema：

```json
{
  "case_id": "ZSBY-CASE-0001",

  "source_type": "classical",

  "source": {
    "book": "增删卜易",
    "chapter": "……"
  },

  "question": "……",

  "casting": {
    "date": "……",
    "hexagram": {}
  },

  "original_judgement": "……",

  "outcome": {
    "known": true,
    "result": "success",
    "time": "……",
    "description": "……"
  },

  "interpretations": [
    {
      "author": "original",
      "reasoning": "……"
    }
  ],

  "quality": "A"
}
```

---

# 10. 案例质量分级

必须明确：

## A 级

必须同时具备：

- 问题明确
- 起卦日期明确
- 卦象完整
- 原断完整
- 后续现实结果明确

用途：

- Benchmark
- 真实验证

---

## B 级

具备：

- 问题
- 卦象
- 判断

但结果不完整。

用途：

- 学习
- 知识参考
- Prompt 辅助

---

## C 级

只有：

- 口诀
- 局部断语
- 二手转述

用途：

- 辅助知识

禁止进入 Benchmark。

---

# 11. 不同流派如何处理

不强迫所有断法统一。

规则需要保留：

```json
{
  "school": "增删体系"
}
```

或者：

```json
{
  "schools": [
    "增删",
    "卜筮正宗"
  ]
}
```

如果存在明显冲突：

```text
不能删掉其中一套。
```

应保存：

```json
{
  "conflict_group": "YONGSHEN-MARRIAGE-01"
}
```

由 AI 在综合判断时说明：

```text
此处存在两种常见取法。
```

---

# 12. Benchmark 体系

目标不是判断 AI 是否“像大师”。

而是分层测试。

---

## 12.1 Level 1：排盘正确性

测试：

- 本卦
- 变卦
- 纳甲
- 六亲
- 六神
- 世应
- 动爻
- 旬空
- 八宫

必须接近 100%。

---

## 12.2 Level 2：规则识别正确性

例如：

```text
用神是否旬空
是否月破
是否日冲
是否回头克
是否化进
```

目标：

```text
确定性规则 = 100%
```

---

## 12.3 Level 3：AI 一致性

同一个输入重复运行：

- 是否出现基础事实错误
- 是否前后矛盾
- 是否漏掉关键因素
- 是否把程序事实推翻

---

## 12.4 Level 4：经典案例结果拟合

只使用 A 级经典案例。

指标：

```text
方向：
成功 / 失败 / 延迟 / 不明

应期：
精确
近似
未命中

关键因素覆盖：
是否识别原案例核心依据
```

---

## 12.5 Level 5：真实前瞻案例

真正用于判断：

```text
项目是否越来越有参考价值
```

---

# 13. 预测锁定机制

这个功能应尽早做。

这是整个项目未来最有价值的数据来源。

用户起卦后保存：

```json
{
  "prediction_id": "uuid",

  "created_at": "2026-09-15T14:00:00+08:00",

  "question": "……",

  "cast_hash": "sha256",

  "prediction": {
    "direction": "偏有利",
    "confidence": "medium",
    "timing": ["……"]
  },

  "versions": {
    "engine": "2.1",
    "rules": "r3",
    "prompt": "p5",
    "knowledge": "k2",
    "model": "deepseek-reasoner"
  },

  "locked": true
}
```

预测生成后：

```text
不允许覆盖原预测
```

用户后续反馈：

```json
{
  "feedback": {
    "resolved": true,
    "result": "success",
    "resolved_at": "2026-09-30",
    "notes": "……"
  }
}
```

---

# 14. 真实反馈第一版不要依赖后端

初期使用 localStorage。

流程：

```text
用户起卦
↓
生成 prediction_id
↓
保存预测
↓
几天/几周后重新打开
↓
提醒：
“这个问题后来结果如何？”
↓
用户选择结果
```

选项：

```text
符合
部分符合
不符合
尚未发生
不方便反馈
```

并允许：

```text
备注
实际日期
```

优点：

- 不需要后端
- 不需要账号
- 不增加 Cloudflare 成本
- 可以先验证这个交互有没有价值

---

# 15. Cloudflare 部署方案

重构后仍保持：

```text
Cloudflare Pages
```

部署：

```text
GitHub
↓
Cloudflare Build
↓
npm install
↓
npm run build
↓
dist/
```

Build command：

```bash
npm run build
```

Output：

```text
dist
```

---

## 15.1 第一阶段禁止引入后端依赖

以下功能都可以纯前端：

- 排盘
- JSON
- 规则
- 古籍
- 案例
- Benchmark
- AI BYOK
- localStorage
- 历史
- 本地预测反馈

---

## 15.2 后端只在确实需要时加入

只有出现：

```text
跨设备历史
匿名真实反馈池
公开 Benchmark
用户账号
多人案例共享
服务端 API 代理
```

才考虑：

```text
Cloudflare Workers
D1
KV
R2
```

不提前引入。

---

# 16. 测试体系

这是本项目重构的硬性要求。

---

## 16.1 Core 测试

为排盘准备固定 fixture。

例如：

```json
{
  "input": {
    "date": "……",
    "coins": [7, 8, 9, 7, 6, 8]
  },

  "expected": {
    "primary": "……",
    "changed": "……",
    "shi": 4,
    "ying": 1,
    "kongwang": ["戌", "亥"]
  }
}
```

必须覆盖：

- 六十四卦
- 动爻
- 无动爻
- 多动爻
- 世应
- 六亲
- 六神
- 空亡
- 八宫

---

## 16.2 Regression 测试

重构前保存一批真实输入：

```text
输入
旧版本输出
```

重构后要求：

```text
旧核心结果 == 新核心结果
```

尤其：

- 排盘
- 历史
- 导出 Prompt
- API 配置
- localStorage

---

## 16.3 Rule 测试

每条规则至少一正一反：

```text
应命中
不应命中
```

---

## 16.4 AI 测试

不能测试自然语言逐字相同。

测试：

- 是否输出 JSON
- 必须字段是否存在
- 是否引用错误事实
- 是否遗漏高优先级规则
- 是否修改程序事实

---

# 17. Phase 实施计划

---

# Phase 0：冻结 Baseline

目标：

```text
保证以后可以判断有没有改坏
```

任务：

1. 创建 tag：
   `v1-baseline`
2. 记录当前线上行为。
3. 保存至少 20 个固定卦例。
4. 保存主要 UI 截图。
5. 保存 localStorage key。
6. 保存当前 AI Prompt。
7. 保存当前历史记录 Schema。
8. 记录现有核心函数列表。

输出：

```text
docs/BASELINE.md
tests/regression/
```

验收：

- 可以随时恢复旧版
- 固定卦可以重复得到同样排盘

---

# Phase 1：Vite 多文件迁移

目标：

```text
只改变工程结构
不改变业务行为
```

任务顺序：

### 1A

迁移 CSS：

```text
index.html
↓
src/styles/main.css
```

### 1B

迁移常量。

### 1C

迁移排盘算法。

### 1D

迁移 localStorage。

### 1E

迁移 AI。

### 1F

迁移 UI。

### 1G

迁移事件监听。

禁止：

- 修改 Prompt
- 修改排盘
- 修改 UI
- 修改字段
- 添加规则

验收：

```text
npm run dev
npm run build
npm test
```

且：

- 页面外观一致
- 排盘一致
- AI 一致
- 历史一致
- API Key 一致
- 手动起卦一致

---

# Phase 2：Canonical JSON

目标：

建立统一内部数据结构。

新增：

```text
src/core/normalize.js
```

实现：

```javascript
buildCanonicalCast()
```

所有下游开始读取它。

但暂时：

```text
旧 Prompt 继续使用
```

由：

```text
Canonical JSON
↓
旧文本 formatter
↓
现有 Prompt
```

保证 AI 行为尽量不变。

验收：

- JSON 字段稳定
- 所有旧功能仍正常
- 测试覆盖 Schema

---

# Phase 3：完善 Core Tests

任务：

- 50+ 固定排盘 fixture
- 六十四卦覆盖
- 空亡测试
- 世应测试
- 六亲测试
- 动变测试

验收：

```text
Core = 高覆盖
关键确定性结果 = 100% fixture 通过
```

---

# Phase 4：AI 读取结构化数据

目标：

AI 不再依赖旧大段自然语言。

输入：

```text
question
+
cast JSON
+
instructions
```

暂不加入规则库。

对比：

```text
Legacy AI
vs
JSON AI
```

观察：

- 基础事实错误率
- 前后矛盾率
- 输出稳定性

保留开关：

```text
legacy
structured
```

方便 A/B。

---

# Phase 5：最小规则引擎

只做 20～50 条最稳定规则。

优先：

- 旬空
- 月破
- 日冲
- 日合
- 六合
- 六冲
- 生克
- 动爻
- 回头生
- 回头克
- 进神
- 退神
- 世应基础关系

输出：

```json
{
  "facts": [],
  "rule_hits": []
}
```

不得直接输出：

```text
吉
凶
一定成
一定败
```

---

# Phase 6：规则 + AI A/B

同一批固定卦：

```text
A:
JSON + AI

B:
JSON + rules + AI
```

比较：

- 矛盾
- 遗漏
- 稳定性
- 解释完整度
- 错误事实

此阶段不宣称“更准”。

只判断：

```text
是否更稳定
是否更一致
```

---

# Phase 7：知识库

建立：

```text
knowledge/classics
knowledge/rules
knowledge/cases
```

第一批：

- 《增删卜易》
- 《卜筮正宗》
- 其他可靠可核对资料

重点：

```text
来源可追溯
```

不要急着做 RAG。

先用：

```text
tags
rule_id
topic
```

普通检索。

---

# Phase 8：经典案例 Benchmark

目标：

构建第一批：

```text
100～300 个 A 级案例
```

输出报告：

```text
benchmark/reports/
```

至少统计：

- 方向
- 关键规则覆盖
- 应期
- AI 错误事实
- 冲突率

---

# Phase 9：预测锁定与真实反馈

新增：

```text
prediction_id
cast_hash
result feedback
```

先 localStorage。

目标：

建立真实的前瞻数据。

---

# Phase 10：真实数据驱动优化

当真实完成案例 > 100：

开始比较：

```text
Prompt 版本
模型版本
规则版本
知识版本
```

当真实完成案例 > 500：

再考虑：

```text
规则权重
统计分析
模型选择
```

在没有足够数据之前：

```text
禁止凭感觉设计权重
```

---

# 18. UI 变化原则

Phase 1～5：

尽量保持当前 UI 不变。

以后可增加“推理详情”。

示例：

```text
核心判断

偏有利

关键依据

✓ 官鬼得日生
△ 官鬼月休
△ 用神旬空
✓ 动而化进

查看详细依据
```

详细：

```text
规则：KONG-001
事实：官鬼旬空
局部含义：当前事情不易立即落实
例外：动空、旺空、冲空、填实
来源：《增删卜易》……
```

---

# 19. 调试模式

增加：

```text
?debug=1
```

显示：

```text
Canonical JSON
Rule Hits
AI Payload
Version Info
```

方便：

- 开发
- Benchmark
- 排查错误

默认普通用户看不到。

---

# 20. 日志策略

禁止记录：

```text
API Key
敏感个人信息
```

可记录本地 debug：

```json
{
  "cast_id": "……",
  "engine_version": "……",
  "rules": ["KONG-001"],
  "duration_ms": 32
}
```

---

# 21. 数据兼容

必须兼容已有 localStorage。

不要直接换 key 导致：

```text
用户 API Key 丢失
历史记录丢失
配置丢失
```

实现 migration：

```javascript
migrateStorage()
```

例如：

```text
v1 history
↓
v2 history
```

迁移失败：

```text
保留旧数据
不要覆盖
```

---

# 22. Android / Windows 兼容

当前桌面 / Android 本质上加载网页。

因此：

```text
Vite 构建后 URL 不变
```

原则上无需重新设计客户端。

但 Astra 必须检查：

- 路径是否是相对路径
- 静态资源是否正常
- CSP 是否影响
- WebView 是否支持 ES Module
- Capacitor / Electron 当前封装是否受影响

如存在兼容风险：

```text
不得为了重构直接破坏三端
```

---

# 23. 安全

API Key：

```text
继续只保存在本地
```

禁止：

```text
上传到项目服务端
日志打印
发送给第三方统计
```

AI 请求只发送：

```text
必要的用户问题
必要的卦盘数据
```

---

# 24. Astra 执行规范

以下是给 Coding Agent 的强制要求。

---

## 24.1 修改前

必须先：

1. 阅读完整 `index.html`
2. 阅读 `README.md`
3. 阅读代码结构说明
4. 列出：
   - 排盘函数
   - AI 函数
   - localStorage keys
   - 事件监听
   - UI 页面
5. 输出迁移映射表

格式：

```text
旧函数
→
新文件
→
是否修改逻辑
```

---

## 24.2 禁止事项

不得：

```text
一次性重写整个项目
改变排盘算法
改变纳甲逻辑
改变世应逻辑
改变 UI
删除旧功能
修改用户数据格式但不迁移
擅自增加后端
擅自换框架
```

---

## 24.3 每个 Phase 必须独立 commit

示例：

```text
refactor: initialize vite project
refactor: extract styles
refactor: extract core casting
refactor: extract ai layer
test: add baseline fixtures
feat: add canonical cast schema
```

禁止：

```text
一个 commit 改几千行所有东西
```

---

## 24.4 每个 Phase 完成必须报告

格式：

```text
完成内容：
修改文件：
新增文件：
测试：
兼容性：
风险：
下一步：
```

---

# 25. Definition of Done

一个 Phase 只有满足全部条件才算完成：

```text
[ ] npm install 成功
[ ] npm run dev 成功
[ ] npm run build 成功
[ ] npm test 成功
[ ] Cloudflare Pages 可部署
[ ] 页面可正常访问
[ ] 排盘回归通过
[ ] localStorage 未损坏
[ ] AI 功能可用
[ ] Android / Windows 无明显破坏
[ ] 文档更新
```

---

# 26. 最终目标状态

最终网站不再只是：

```text
AI 六爻解卦网页
```

而是：

```text
Liuyao Engine
```

组成：

```text
排盘引擎
+
结构化数据
+
规则系统
+
古籍知识
+
案例库
+
AI 推理
+
Benchmark
+
真实反馈
```

最终每次解卦可以回答三个问题：

```text
1. 为什么这么断？

2. 这个判断依据是什么？

3. 过去类似判断到底表现怎么样？
```

---

# 27. 项目真正评价标准

最终不是：

```text
Star 数
用户数
是否收费
是否商业化
```

而是：

```text
排盘是否稳定正确

AI 是否减少胡说

规则是否可追溯

判断是否更一致

案例是否可验证

真实反馈是否积累

版本之间是否能够客观比较
```

真正有价值的成果是：

```text
我们知道哪些规则有帮助，
哪些 Prompt 有帮助，
哪些模型更稳定，
哪些方法没有提高表现。
```

即使最终发现：

```text
某些传统断法并没有明显提高真实预测表现
```

这仍然是一个有意义的结果。

---

# 28. Astra 第一轮实际任务

不要直接实施所有 Phase。

第一轮只执行：

```text
Phase 0
+
Phase 1
+
Phase 2
```

目标：

```text
完成安全重构
+
建立 Canonical JSON
```

此时禁止：

```text
规则引擎
知识库
RAG
Benchmark
后端
```

第一轮完成后：

```text
先人工检查
再进入 Phase 3
```

---

# 29. 第一轮推荐执行顺序

```text
Step 1
建立 baseline tag

Step 2
初始化 Vite

Step 3
保持原 index.html 可运行

Step 4
抽离 CSS

Step 5
抽离 constants

Step 6
抽离 core 排盘函数

Step 7
抽离 storage

Step 8
抽离 AI

Step 9
抽离 UI

Step 10
补基础 regression test

Step 11
建立 Canonical JSON

Step 12
让旧 formatter 从 Canonical JSON 生成原 AI 文本

Step 13
完整回归

Step 14
Cloudflare Preview 部署

Step 15
对比线上旧版
```

全部通过后再合并。

---

# 30. 一句话实施原则

> **先把现在这个能用的网站安全拆开，再把“卦盘”变成标准数据，再让程序识别确定事实，最后才逐步加入规则、知识和验证。不要先追求一个看起来很高级的架构，而是确保每一步都可运行、可验证、可回滚。**

---

# 31. Astra 开工提示词

可以直接把下面这段附在本文件前后交给 Astra：

```text
你现在负责重构 GitHub 项目 1eakkkk/liuyao-tool。

请完整阅读 REFACTOR_PLAN.md，并严格按其中的阶段和约束执行。

当前第一轮只允许执行：

Phase 0
Phase 1
Phase 2

不得提前实施规则引擎、知识库、RAG、后端或 UI 重设计。

首要目标不是“重写得漂亮”，而是：

1. 保持当前全部功能和行为不变；
2. 将单 index.html 安全迁移为 Vite + ES Modules 多文件结构；
3. 建立 Canonical Hexagram JSON；
4. 保证旧 AI Prompt 可以继续由新 JSON 数据生成；
5. 加入最基础的 regression tests；
6. 保证 Cloudflare Pages 仍能部署 dist；
7. 保证 localStorage、历史、API Key、手动起卦、AI 解卦都兼容。

修改前请先输出：

A. 当前代码结构分析；
B. 函数迁移映射表；
C. localStorage key 列表；
D. 第一轮计划修改的文件树；
E. 风险点；
F. 回滚方案。

得到确认后再开始修改。

每完成一个子阶段：
- 运行测试
- 运行 build
- 汇报改动
- 不得无说明继续跨阶段修改

如果发现现有代码行为与本文档假设不一致，以“保留现有行为”为最高优先级，并说明差异。
```

---

# 32. 最后原则

这个项目未来真正值得追求的不是：

```text
AI 写得越来越像大师
```

而是：

```text
排盘越来越可靠

推理越来越透明

规则越来越可追溯

模型越来越少胡说

判断越来越一致

真实反馈越来越多

每次升级到底有没有改善，都能用数据回答
```

这才是后续重构的核心方向。
