// Entirely invented test text and identities. NOT classical knowledge or a formal corpus.
import { recordHash, textHash } from '../../src/knowledge/validate.js';
export function seal(corpus) {
  for (const s of corpus.segments) s.text_hash = textHash(s.text);
  for (const records of [corpus.sources, corpus.segments, corpus.units, corpus.commentary]) {
    for (const r of records) r.content_hash = recordHash(r);
  }
  return corpus;
}
export function fixture() {
  const common = () => ({ schema_version: '1.0', revision: 1, data_kind: 'test_only', verification_status: 'draft',
    provenance: { acquisition_date: '2026-09-16', source_url: null, identifier: 'fixture:test-only', method: 'fixture',
      artifact_hash: textHash('fixture artifact; not a historical source'),
      agent: 'fixture-editor', reviewed_by: null, reviewed_at: null, rights: { status: 'test_only', basis: 'Invented testing material only' } },
    content_hash: '', notes: 'fixture/test_only; never inject into AI' });
  const locator = () => ({ volume: null, chapter: null, section: null, page: 'test-1', leaf: null, image_page: null, anchor: null });
  const contributor = () => ({ name: null, role: 'unknown', attribution_basis: 'Invented fixture; no historical author', certainty: 'unknown' });
  const segment_ref = { segment_id: 'fixture-segment', revision: 1, span: { start: 0, end: 3, unit: 'unicode_code_point' } };
  const conditions = () => ({ status: 'none_stated', statements: [] });
  return seal({
    sources: [{ ...common(), source_id: 'fixture-source', work_id: 'fixture-work', edition_id: 'fixture-edition', title: '虚构测试底本',
      contributors: [contributor()], edition: { designation: 'fixture edition', publication: { publisher: null, place: null, date_text: null },
        manuscript: { scribe: null, date_text: null }, digital_version: null }, holding: { repository: 'fixture', identifier: 'test-only' },
      transcription_revision: 1, locator: locator() }],
    segments: [{ ...common(), segment_id: 'fixture-segment', source_ref: { source_id: 'fixture-source', revision: 1 },
      work_id: 'fixture-work', edition_id: 'fixture-edition', title: '虚构测试片段', text_role: 'original_body', locator: locator(),
      text: '甲😀乙\n测试文本，非古籍。', transcription_revision: 1, text_hash: '' }],
    units: [{ ...common(), knowledge_id: 'fixture-unit', source_type: 'classical_body', segment_ref, original_text: '甲😀乙',
      normalized_statement: '这是虚构的结构测试说明，不是六爻知识。', category: 'fixture-category', applicable_conditions: conditions(),
      exclusions: conditions(), exceptions: conditions(), related_concepts: ['fixture-concept'], related_rule_ids: ['LINE-VOID-001'],
      ruleset_version: 'r1', rule_link_semantics: 'association_only', tags: ['fixture-tag'], supersedes: [], related_units: [], disputes: [] }],
    commentary: [{ ...common(), commentary_id: 'fixture-commentary', source_type: 'modern_commentary', contributors: [contributor()],
      statement: '测试注释，非正式知识。', segment_refs: [], knowledge_refs: [{ knowledge_id: 'fixture-unit', revision: 1 }],
      related_concepts: ['fixture-concept'], tags: [] }],
    catalog: { schema_version: '1.0', revision: 1, concepts: [{ concept_id: 'fixture-concept', label: '测试概念', aliases: ['測試概念'],
      definition: '仅用于校验测试的虚构概念' }], categories: [{ category_id: 'fixture-category', label: '测试分类' }], tags: [{ tag_id: 'fixture-tag', label: '测试标签' }] },
  });
}
