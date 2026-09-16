import { validateAiValue } from '../ai/schemas.js';
import { RULES, RULESET_VERSION, RULE_ENGINE_VERSION, RULE_RESULT_SCHEMA_VERSION } from './registry.js';
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const array = items => ({ type: 'array', items });
const str = { type: 'string' };
const line = { type: 'integer', minimum: 1, maximum: 6 };
const nullableLine = { type: ['integer', 'null'], minimum: 1, maximum: 6 };
const actor = obj({ line, component: { enum: ['primary', 'changed', 'hidden'] } });
const target = obj({ line, component: { enum: ['primary', 'hidden'] }, related_line: line }, ['line', 'component']);
const skippedTarget = obj({ line: nullableLine, component: { enum: ['primary', 'hidden'] }, related_line: nullableLine }, ['line', 'component']);
const ruleId = { enum: RULES.map(rule => rule.rule_id) };
const skipped = obj({ rule_id: ruleId, target: skippedTarget,
  reason: { enum: ['insufficient_data', 'invalid_data', 'not_applicable', 'conflicting_input'] }, paths: array(str) });
export const RULE_RESULT_SCHEMA = obj({
  schema_version: { const: RULE_RESULT_SCHEMA_VERSION }, engine_version: { const: RULE_ENGINE_VERSION },
  ruleset_version: { const: RULESET_VERSION }, input_schema_version: { const: '1.0' },
  hits: array(obj({ rule_id: ruleId, rule_version: { const: '1.0.0' },
    origin: { enum: ['canonical_annotation', 'shared_core_function', 'derived_relation'] }, target,
    evidence: array(obj({ path: str, value: { type: ['string', 'number', 'boolean', 'null'] } })),
    result: obj({ code: str, label: str, from: actor, to: actor }, ['code', 'label']),
  })), skipped: array(skipped), diagnostics: array(skipped),
});
export function assertRuleResult(result) {
  validateAiValue(result, RULE_RESULT_SCHEMA);
  const seen = new Set();
  for (const hit of result.hits) {
    const rule = RULES.find(rule => rule.rule_id === hit.rule_id);
    const key = `${hit.rule_id}:${JSON.stringify(hit.target)}`;
    if (seen.has(key) || hit.origin !== rule.origin || hit.result.code !== rule.code || hit.result.label !== rule.label || !hit.evidence.length) throw new Error('Rule result identity invalid');
    seen.add(key);
  }
  return result;
}
