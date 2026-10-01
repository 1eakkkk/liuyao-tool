# agent-b 内容与遗漏审查说明

这是单条已曝光开发样本的 retrospective_nonblind 审查。四维为 facts/pass、scope/pass、support/pass、attribution/pass；不是盲测、总体改进、生产可用或预测准确性证明。

## 输入范围

仅使用 review-packet.json、plan.json、review-template.json 和既有 validateReview。没有查看另一审查结论。提示版本：sourced-instructions-dev-3；包哈希：sha256:8979f6d7176293ea4bd39fddb46812f01bd40389e575ee1111750849bec1b359；实际来源目录哈希：sha256:70e765bd3db03ad2a043c1dff2a484ef7270f49f00cb8c8816fee20a73667dac。原文偏移按 raw 的 UTF-16 start（含）/end（不含）记录。

## 实际字段使用

| 字段 | 本条实际使用 | 声明情况 |
| --- | --- | --- |
| /original_text | 月合命名、乃有用之爻也、有用/無用及月破对举 | 已列 source_id |
| /editorial_summary | 文献评价措辞的现代概括 | 已列 source_id，并有独立 editorial 说明 |
| /applicable_conditions/statements/0 | 解释命名及作者评价，不当作本盘已发生的事实 | 已列 source_id，并有独立 editorial 说明 |
| /exclusions/statements/0 | 不单独确认实际作用或个案效力 | 已列 source_id，并有独立 editorial 说明 |
| /exclusions/statements/1 | 不直接推有利、成功或最终吉凶 | 已列 source_id，并有独立 editorial 说明 |
| exceptions 的 none_stated 状态 | 材料未说明例外不等于不存在例外 | 来自 catalog.statuses；没有 statements，不要求虚造条目 |

人工逐段对照 conclusion、text、applicability.program、四项 editorial.explanation、uncertainties、advice.text 后，未发现实际使用字段未声明，也未发现说明中混入另一条未声明的条件。这里“未发现”不是自动检测已覆盖任意遗漏的声明。

## 原文评价与个案效力

正文明确引用“月建合爻則爲月合乃有用之爻也”，说明月合/月破对举的有用/無用措辞，并说明这不是本盘初爻实际效力的确认。未把现代排除当成古籍要求，也未从月合推出实际有用或必成。结论单看“月合只是六合关系的名称”略显简化；判 pass 依赖全文后续明确保留作者评价，不能将这句脱离上下文概括成古籍只有命名。

第二条排除的后半句“不以相邻无用句取代月破章的条件”没有复述；回复没有用相邻无用句判断月破，因此它是未使用的分句，不能据此记作已使用依据漏报。不要求本窄题逐句解释所有背景。

## 原始证据位置

- 原文评价：[590, 641)，《增刪卜易》原文转录写作“月建合爻則爲月合乃有用之爻也”，并把月合与月破对举，用“有用／無用”来表述。
- 现代适用条件：[1619, 1665)，现代整理限定：仅解释该段月合的命名及作者评价措辞，不将文献评价当作当前卦盘已发生的程序事实。
- 第二条排除：[1900, 1928)，现代整理排除：不能据此直接推出事情有利、成功或最终吉凶。
- 例外状态：[1983, 2007)，材料未说明月合相关例外；未说明不等于不存在例外。

## 局限

- 全部五个可选择字段都被声明，并不证明模型会正确选择最小依据集合，也不能把五字段算成五份独立证据。
- 对自由文字的同义改写、暗含条件、隐藏来源和遗漏只能人工判断；绑定器仍把这些语义标为 unassessed。
- catalog_hash 绑定来源资料包，不单独绑定完整问题、全部事实或问答轮次。
- 未访问外部扫描页，未核验古籍转录真实性；没有现实结果证据，也不评价完整古法体系。
- 本次没有调用 API、读取凭据/账本/用户文件或修改原始记录。validateReview 只验证审查格式和原文引用，不证明审查判断必然正确。
