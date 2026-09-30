import fs from 'node:fs';
import { loadCorpus } from '../../src/knowledge/load.js';
import { literatureCards, buildLiteraturePacket } from '../../src/knowledge/packet.js';
import { RULES, RULESET_VERSION } from '../../src/rules/registry.js';
import { layeredOutputInstructions } from '../../experiments/reading-quality/layered-output.js';

const index = loadCorpus(undefined, { ruleIds: RULES.map(r => r.rule_id), rulesetVersion: RULESET_VERSION });
const cards = literatureCards(index);
const empty = buildLiteraturePacket(index, []);
const out = new URL('../../test-results/knowledge-reading/', import.meta.url);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(new URL('cards.json', out), JSON.stringify({ ...index, network_calls: 0, cards }, null, 2) + '\n');
fs.writeFileSync(new URL('empty-packet.json', out), JSON.stringify(empty, null, 2) + '\n');
fs.writeFileSync(new URL('output-instructions.txt', out), layeredOutputInstructions() + '\n');
const conditions = value => value.status === 'none_stated' ? '原文片段未陈述；不代表不存在。' : value.statements.join('；');
const lines = ['# 离线文献阅读卡', '',
  '由已纳入检索的文献生成；编辑复核不等于独立验收或预测验证。此文件不是线上提示词。', '',
  `底本版本：${index.corpus_version}；完整语料哈希：${index.corpus_hash}`, '',
  '使用顺序：核对问题与程序事实 → 阅读适用／禁用条件 → 明确记录适用理由 → 按预算选取资料 → 分开检查事实、解释和现实建议。', '',
  '不确定是否适用时选择 uncertain；未选择时生成空资料包。不得因命中关键词或规则 ID 自动判断适用。', ''];
for (const c of cards) {
  lines.push(`## ${c.knowledge_id}`, '', c.editorial_summary, '',
    `原文：${c.original_text}`, '',
    `适用条件：${conditions(c.applicable_conditions)}`, '',
    `禁用边界：${conditions(c.exclusions)}`, '',
    `例外记录：${conditions(c.exceptions)}`, '',
    `出处：[${c.citation.title}](${c.citation.source_url})；扫描第 ${c.citation.locator.image_page} 页；片段 ${c.citation.segment_ref.segment_id}@${c.citation.segment_ref.revision}。`, '',
    `原文片段哈希：${c.citation.text_hash}；文献类型：${c.source_type}。`, '',
    '用途：文献解释背景；独立证据增量为零；现实预测表现未建立。', '');
  if (c.editorial_guidance) lines.push('### 编辑整理的使用对照（不是古籍原文或真实案例）', '',
    ...c.editorial_guidance.checks.map(q => `- ${q}`), '',
    `有边界的写法：${c.editorial_guidance.careful_example}`, '',
    `越界写法：${c.editorial_guidance.overreach_example}`, '');
}
fs.writeFileSync(new URL('reading-cards.md', out), lines.join('\n') + '\n');
console.log(`Prepared ${cards.length} admitted reading cards, empty opt-in packet and offline output instructions. Network/model calls: 0.`);
