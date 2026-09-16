# Phase 5 规则系统 r1

## 边界和事实来源

本引擎只回答“程序确定发现了什么局部关系”。不选择唯一用神，不评分，不输出最终吉凶，不引入知识库、RAG、后端或自然语言解析。

唯一排盘事实源仍是 Canonical。`evaluateRules(canonical)` 是纯函数，不修改输入，不读取问题、display、兼容字段、时钟、随机数、网络或存储。输出固定按规则注册顺序、初爻至上爻排列。世应关系每次只调用一次现有 Core 函数；月破和月合复用现有地支关系表，只存在于 Rule Result，绝不写回 Canonical。

来源有三类：

- `canonical_annotation`：18 条；已有布尔事实或 relations 的标准化索引，不是独立证据，不可重复加权。
- `shared_core_function`：5 条；合法世应位置和五行调用既有 `getShiYingRelation`。不解析 `display.overall_trend_text`。
- `derived_relation`：2 条；月建与本爻支的六冲、六合。只表示局部配对，不表示合化、解空、解破或最终利弊。

规则注册表中的 `source_ref` 是项目实现来源，不是已校勘的古籍出处。规则版本均为 1.0.0，规则集 r1，引擎 1.0.0，Rule Result Schema 1.0。

## 25 条规则

以下 i 是从 0 开始的数组索引；输出 target.line 为 1～6。每条正命中都输出规则 ID、版本、来源、目标、输入字段证据和结构化结果。

| 序号 | rule_id | 输入及触发条件 | result.label | 来源 |
| --- | --- | --- | --- | --- |
| 1 | `LINE-MOVING-001` | lines[i].moving = true | 动爻 | Canonical 标注 |
| 2 | `LINE-VOID-001` | lines[i].is_kongwang = true | 旬空 | Canonical 标注 |
| 3 | `DAY-CLASH-001` | lines[i].relations.day_relation = '日辰冲' | 受日冲 | Canonical 标注 |
| 4 | `DAY-COMBINE-001` | lines[i].relations.day_relation = '日辰合' | 与日辰六合 | Canonical 标注 |
| 5 | `MOVE-RETURN-GENERATE-001` | lines[i].relations.return_relation = '回头生' | 回头生 | Canonical 标注 |
| 6 | `MOVE-RETURN-CONTROL-001` | lines[i].relations.return_relation = '回头克' | 回头克 | Canonical 标注 |
| 7 | `MOVE-ADVANCE-001` | lines[i].relations.advance_retreat = '进神' | 化进 | Canonical 标注 |
| 8 | `MOVE-RETREAT-001` | lines[i].relations.advance_retreat = '退神' | 化退 | Canonical 标注 |
| 9 | `HIDDEN-FLY-GENERATE-001` | lines[i].relations.hidden_relation = '飞神生伏神' | 飞神生伏神 | Canonical 标注 |
| 10 | `HIDDEN-GENERATE-FLY-001` | lines[i].relations.hidden_relation = '伏神生飞神' | 伏神生飞神 | Canonical 标注 |
| 11 | `HIDDEN-FLY-CONTROL-001` | lines[i].relations.hidden_relation = '飞神克伏神' | 飞神克伏神 | Canonical 标注 |
| 12 | `HIDDEN-CONTROL-FLY-001` | lines[i].relations.hidden_relation = '伏神克飞神' | 伏神克飞神 | Canonical 标注 |
| 13 | `HIDDEN-SAME-ELEMENT-001` | lines[i].relations.hidden_relation = '飞伏比和' | 飞伏比和 | Canonical 标注 |
| 14 | `MONTH-STATE-WANG-001` | lines[i].relations.month_strength = '旺' | 月令旺 | Canonical 标注 |
| 15 | `MONTH-STATE-XIANG-001` | lines[i].relations.month_strength = '相' | 月令相 | Canonical 标注 |
| 16 | `MONTH-STATE-XIU-001` | lines[i].relations.month_strength = '休' | 月令休 | Canonical 标注 |
| 17 | `MONTH-STATE-QIU-001` | lines[i].relations.month_strength = '囚' | 月令囚 | Canonical 标注 |
| 18 | `MONTH-STATE-SI-001` | lines[i].relations.month_strength = '死' | 月令死 | Canonical 标注 |
| 19 | `SHI-GENERATE-YING-001` | 合法世应位置、标志及五行；getShiYingRelation 返回 '世生应' | 世生应 | 共享 Core 函数 |
| 20 | `YING-GENERATE-SHI-001` | 合法世应位置、标志及五行；getShiYingRelation 返回 '应生世' | 应生世 | 共享 Core 函数 |
| 21 | `SHI-CONTROL-YING-001` | 合法世应位置、标志及五行；getShiYingRelation 返回 '世克应' | 世克应 | 共享 Core 函数 |
| 22 | `YING-CONTROL-SHI-001` | 合法世应位置、标志及五行；getShiYingRelation 返回 '应克世' | 应克世 | 共享 Core 函数 |
| 23 | `SHI-YING-SAME-ELEMENT-001` | 合法世应位置、标志及五行；getShiYingRelation 返回 '世应比和' | 世应比和 | 共享 Core 函数 |
| 24 | `MONTH-CLASH-001` | calendar.month_branch 与 lines[i].branch 命中 LIUCHONG_PAIR | 月破（与月建六冲） | Rule Result 派生 |
| 25 | `MONTH-COMBINE-001` | calendar.month_branch 与 lines[i].branch 命中 LIUHE_PAIR | 与月建六合 | Rule Result 派生 |

### 适用前提与证据

- 动爻和旬空：读取对应布尔字段，不重新判断阴阳或旬空表。
- 日冲／日合：读取 day_relation 标注，并记录本爻支、日支；不根据日支再竞争性计算一次。
- 回头生克／进退：仅有变爻的动爻适用。记录标注、moving、本变五行或本变地支。回头关系方向明确为 changed → primary。
- 飞伏：必须存在 hidden，记录标注及飞伏五行；target.component=hidden，方向按标签明确。比和无单向箭头。
- 月令五态：读取 month_strength 并记录本爻五行、月支；这不是综合强弱。
- 世应：核对六爻 is_shi/is_ying 与 hexagram 的位置一致；记录位置、标志、世应五行；target.related_line 指向应爻，结果 from/to 明确生克方向。
- 月破／月合：只处理本卦六爻；证据为月支及本爻支。本阶段不扩展到变爻、伏神或其他关系。

### 缺失与冲突

Canonical 顶层契约不合法或版本不支持时拒绝处理。局部字段缺失/null 为 `insufficient_data`，未知枚举或类型为 `invalid_data`，无变爻或无伏神的正常不适用为 `not_applicable`。静爻却有非空回头/进退标注、无伏神却有飞伏标注、世应位置与标志冲突为 `conflicting_input`。跳过受影响的规则；invalid/conflicting 同时写入 diagnostics。

空字符串只表示没有可索引的正标注。未命中不代表相反关系成立。引擎不会重新计算来“修复”已有标注；即使标注与五行配对看似不一致，也不建立另一事实源来推翻它。当前冲突检查限于结构和适用前提，不宣称是完整排盘校验器。

## Rule Result Schema

规范由 `src/rules/schema.js` 定义；未知字段拒绝，ID、版本、origin、code、label 受注册表约束，同规则同目标不能重复命中，evidence 必须非空。

```json
{
  "schema_version": "1.0",
  "engine_version": "1.0.0",
  "ruleset_version": "r1",
  "input_schema_version": "1.0",
  "hits": [{
    "rule_id": "MOVE-RETURN-GENERATE-001",
    "rule_version": "1.0.0",
    "origin": "canonical_annotation",
    "target": {"line": 4, "component": "primary"},
    "evidence": [
      {"path": "/lines/3/relations/return_relation", "value": "回头生"},
      {"path": "/lines/3/moving", "value": true},
      {"path": "/lines/3/element", "value": "土"},
      {"path": "/lines/3/changed/element", "value": "火"}
    ],
    "result": {
      "code": "move_return_generate", "label": "回头生",
      "from": {"line": 4, "component": "changed"},
      "to": {"line": 4, "component": "primary"}
    }
  }],
  "skipped": [],
  "diagnostics": []
}
```

以上为结构示例，不是新采集的实际卦例。每项 evidence.path 从当前 Canonical 根开始寻址，value 是原始标量；AI 输入还会逐项验证证据与实际传输的 C 白名单字段一致。skipped/diagnostics 项记录 rule_id、target、reason、paths；目标不可确定时允许 null，不伪造爻位。

## Structured 1.1 注入和严格 A/B

保留 Phase 4 A/B/C/D Schema 1.0 与默认 Legacy。新增 `src/ai/rules-input.js`，从已有白名单投影构造 1.1；C 内容不变且继续排除 compatibility、display 和未知扩展。1.1 在 B 中说明规则边界，增加 E_rule_results。Prompt 版本为 `structured-rules-p1`。

严格 Rules A/B 两组均使用 1.1、相同系统 Prompt、相同 A/B/C/D 及相同 E 元数据、skipped、diagnostics，仅 enabled/hits 有差异：

- off：enabled=false，hits=[]。
- on：enabled=true，hits=完整命中。

为保证非处理因素一致，off 组也在本地执行引擎以生成相同元数据，但不向 AI 提供命中；因此它是“不给命中”的对照，不是引擎性能基准。Prompt 明确 off 不能解释成全部规则未命中，并明确 canonical_annotation 不得当作第二份证据重复加权。

使用相同卦例、问题、模型和设置，两个独立新对话，交错 off/on 顺序；追问使用同样文本。仅评估事实错误、擅改程序事实、矛盾、遗漏、追问一致性和成本，不评估最终预测准确率。Schema 1.0 与 1.1 的比较不能代替严格 Rules A/B。

## 测试口径及限制

25 条规则各有正反 fixture，且是针对输入契约的局部补丁；不把补丁冒充真实排盘产物。飞伏比和当前无法由缺失六亲的放置流程自然产生，显式使用合成契约样例。另有实际 Core 生成的化进卦例（7,8,9,7,6,8，第五爻申→酉）。

另测 88 份历史 Canonical 的确定性、深冻结输入不变、证据可追溯、未知扩展隔离；穷举 144 组月支／爻支及 25 组世应五行；测试缺失、未知、冲突和不重算已有标注。AI 测试覆盖两组仅处理字段差异、1.0 保留、版本／会话锁定、导出、哈希，以及损坏证据、重复命中、非法结果／评分字段的拒绝。

这些测试证明实现契约及兼容性；不证明传统规则的预测有效性，也不证明真实模型一定遵守指令。
