// New offline 1.2 contract. Existing 1.0/1.1 contracts and validators are untouched.
import { AI_INPUT_SCHEMA, validateAiValue } from './schemas.js';
import { RULE_RESULT_SCHEMA, assertRuleResult } from '../rules/schema.js';
import { readEvidencePath } from '../rules/engine.js';
const obj = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: 'string' };
const nullable = { type: ['string', 'null'] };
const arr = items => ({ type: 'array', items });
const actor = obj({ line: { type: 'integer', minimum: 1, maximum: 6 }, component: { enum: ['primary', 'changed', 'hidden'] } });
const condition = obj({ status: { enum: ['specified', 'none_stated'] }, statements: arr(str) });
const target = RULE_RESULT_SCHEMA.properties.hits.items.properties.target;
export const LITERATURE_ITEM_SCHEMA = obj({
  knowledge_id: str, revision: { type: 'integer', minimum: 1 },
  source_role: { enum: ['classical_body', 'historical_commentary'] },
  original_text: str, normalized_statement: str,
  applicable_conditions: condition, exclusions: condition, exceptions: condition,
  citation: obj({ title: str, edition_id: str, edition: str, segment_id: str,
    segment_revision: { type: 'integer', minimum: 1 },
    volume: nullable, chapter: nullable, page: nullable,
    image_page: { type: 'integer', minimum: 1 }, anchor: nullable,
    span: obj({ start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 }, unit: { const: 'unicode_code_point' } }) }),
  related_concepts: arr(str), literature_identity: str, relation_links: arr(str),
  role: { const: 'literature_context' }, independent_evidence: { const: false }
});
export const KNOWLEDGE_AI_SCHEMA = {
  ...AI_INPUT_SCHEMA,
  properties: { ...AI_INPUT_SCHEMA.properties, ai_input_schema_version: { const: '1.2' },
    E_rule_results: obj({ rule_result: RULE_RESULT_SCHEMA, relation_anchors: arr(obj({
      evidence_identity: str, scope: { const: 'current_cast' }, rule_id: str, target,
      relation_type: str, direction: obj({ from: { ...actor, type: ['object', 'null'] }, to: { ...actor, type: ['object', 'null'] } }),
      canonical_paths: arr(str), calendar_paths: arr(str)
    })) }),
    F_literature_context: obj({ items: { ...arr(LITERATURE_ITEM_SCHEMA), maxItems: 4 } }) },
  required: [...AI_INPUT_SCHEMA.required, 'E_rule_results', 'F_literature_context']
};
export function validateKnowledgeShape(input) {
  validateAiValue(input, KNOWLEDGE_AI_SCHEMA);
  assertRuleResult(input.E_rule_results.rule_result);
  for (const hit of input.E_rule_results.rule_result.hits) for (const e of hit.evidence) {
    if (readEvidencePath(input.C_canonical_cast, e.path) !== e.value) throw new Error('Knowledge input evidence differs from Canonical');
  }
  return input;
}
