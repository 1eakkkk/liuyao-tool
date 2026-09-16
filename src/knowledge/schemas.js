// Independent, closed data contracts. No production importer or AI dependency.
export const KNOWLEDGE_SCHEMA_VERSION = '1.0';
export const VERIFICATION_STATUSES = ['draft', 'source_checked', 'reviewed', 'disputed', 'retired'];
const str = { type: 'string', minLength: 1 };
const nullable = { type: ['string', 'null'], minLength: 1 };
const id = { ...str, pattern: '^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$' };
const hash = { ...str, pattern: '^sha256:[a-f0-9]{64}$' };
const date = { ...str, format: 'date' };
const list = items => ({ type: 'array', items, uniqueItems: true });
const obj = (properties, optional = []) => ({ type: 'object', properties,
  required: Object.keys(properties).filter(k => !optional.includes(k)), additionalProperties: false });
const enumeration = values => ({ type: 'string', enum: values });
const attribution = obj({ name: nullable, role: enumeration(['著', '辑', '增删', '校', '注', '译', '鉴定', '抄', '其他', 'unknown']),
  attribution_basis: str, certainty: enumeration(['as_printed', 'catalog_attributed', 'verified', 'disputed', 'unknown']) });
const provenance = obj({ acquisition_date: date, source_url: nullable, identifier: nullable,
  artifact_hash: { ...hash, type: ['string', 'null'] },
  method: enumeration(['manual_transcription', 'import', 'editorial', 'fixture']), agent: str,
  reviewed_by: nullable, reviewed_at: { type: ['string', 'null'], format: 'date' },
  rights: obj({ status: enumeration(['unknown', 'public_domain', 'permission', 'licensed', 'test_only']), basis: str }) });
const common = { schema_version: { const: KNOWLEDGE_SCHEMA_VERSION }, revision: { type: 'integer', minimum: 1 },
  data_kind: enumeration(['corpus', 'test_only']), verification_status: enumeration(VERIFICATION_STATUSES),
  provenance, content_hash: hash, notes: nullable };
const locator = obj({ volume: nullable, chapter: nullable, section: nullable, page: nullable, leaf: nullable,
  image_page: { type: ['integer', 'null'], minimum: 1 }, anchor: nullable });
const sourceRef = obj({ source_id: id, revision: { type: 'integer', minimum: 1 } });
const unitRef = obj({ knowledge_id: id, revision: { type: 'integer', minimum: 1 } });
const segmentRef = obj({ segment_id: id, revision: { type: 'integer', minimum: 1 },
  span: obj({ start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 },
    unit: { const: 'unicode_code_point' } }) });
const conditionSet = obj({ status: enumeration(['unreviewed', 'specified', 'none_stated']), statements: list(str) });

export const SOURCE_EDITION_SCHEMA = obj({ ...common, source_id: id, work_id: id, edition_id: id, title: str,
  contributors: list(attribution), edition: obj({ designation: nullable, publication: obj({ publisher: nullable,
    place: nullable, date_text: nullable }), manuscript: obj({ scribe: nullable, date_text: nullable }), digital_version: nullable }),
  holding: obj({ repository: nullable, identifier: nullable }),
  transcription_revision: { type: 'integer', minimum: 1 }, locator });
export const SOURCE_SEGMENT_SCHEMA = obj({ ...common, segment_id: id, source_ref: sourceRef, work_id: id, edition_id: id,
  title: str, text_role: enumeration(['original_body', 'historical_commentary']), locator, text: str,
  transcription_revision: { type: 'integer', minimum: 1 }, text_hash: hash });
export const KNOWLEDGE_UNIT_SCHEMA = obj({ ...common, knowledge_id: id,
  source_type: enumeration(['classical_body', 'historical_commentary']), segment_ref: segmentRef, original_text: str,
  normalized_statement: str, category: id, applicable_conditions: conditionSet, exclusions: conditionSet, exceptions: conditionSet,
  related_concepts: list(id), related_rule_ids: list({ ...str, pattern: '^[A-Z][A-Z0-9-]+$' }), ruleset_version: { const: 'r1' },
  rule_link_semantics: { const: 'association_only' }, tags: list(id), supersedes: list(unitRef),
  related_units: list(obj({ target: unitRef, relationship: enumeration(['related', 'equivalent', 'qualifies']) })),
  disputes: list(obj({ target: unitRef, reason: str })) }, ['original_text']);
export const COMMENTARY_SCHEMA = obj({ ...common, commentary_id: id, source_type: { const: 'modern_commentary' },
  contributors: { ...list(attribution), minItems: 1 }, statement: str, segment_refs: list(segmentRef), knowledge_refs: list(unitRef),
  related_concepts: list(id), tags: list(id) });
export const CATALOG_SCHEMA = obj({ schema_version: { const: KNOWLEDGE_SCHEMA_VERSION }, revision: { type: 'integer', minimum: 1 },
  concepts: list(obj({ concept_id: id, label: str, aliases: list(str), definition: str })),
  categories: list(obj({ category_id: id, label: str })), tags: list(obj({ tag_id: id, label: str })) });
export const CORPUS_SCHEMA = obj({ sources: list(SOURCE_EDITION_SCHEMA), segments: list(SOURCE_SEGMENT_SCHEMA),
  units: list(KNOWLEDGE_UNIT_SCHEMA), commentary: list(COMMENTARY_SCHEMA), catalog: CATALOG_SCHEMA });
