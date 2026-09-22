// Offline export configuration only. Never transmitted to a model.
const str = { type: 'string' }, list = { type: 'array', items: str };
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const condition = { enum: ['specified', 'none_stated', 'unreviewed'] };
export const EXPORT_CONFIG_SCHEMA = obj({
  data_kind: { const: 'compatibility_fixture' }, experiment_id: str, assignment_seed: str,
  model_settings: obj({ model: str, settings: obj({ temperature: { type: ['number', 'null'] },
    top_p: { type: ['number', 'null'] }, visible_version: { type: ['string', 'null'] } }, []) }),
  cases: { type: 'array', minItems: 1, items: obj({ case_id: str, canonical_file: str,
    query: obj({ concepts: list, categories: list, related_rule_ids: list, allowed_editions: list, terms: list,
      verification_status: { enum: ['reviewed'] }, limit: { type: 'integer', minimum: 0, maximum: 100 },
      condition_statuses: obj({ applicable_conditions: condition, exclusions: condition, exceptions: condition }, []) }, []) }, ['case_id', 'canonical_file']) }
});
