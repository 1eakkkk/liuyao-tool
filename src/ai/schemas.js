// AI transport schema is independent of Canonical 1.0. Only listed keys may leave this boundary.
export const AI_INPUT_SCHEMA_VERSION = '1.0';
export const STRUCTURED_PROMPT_VERSION = 'structured-p1';
const text = { type: ['string', 'null'] };
const bool = { type: 'boolean' };
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const optionalObject = properties => ({ ...object(properties), type: ['object', 'null'] });
const transformed = optionalObject({ ganzhi: text, branch: text, element: text, relative: text });
export const AI_CAST_SCHEMA = object({
  schema_version: { const: '1.0' },
  meta: object({ source: text, coin_convention: text }),
  versions: object({ app: text, engine: text, legacy_rules: text }),
  calendar: object({ year_ganzhi: text, month_ganzhi: text, day_ganzhi: text, hour_ganzhi: text,
    day_branch: text, month_branch: text, kongwang: { type: 'array', items: { type: 'string' } },
    anchor: optionalObject({ year: { type: ['number', 'null'] }, month: { type: ['number', 'null'] }, day: { type: ['number', 'null'] } }) }),
  hexagram: object({ primary: object({ name: text, palace: text, lower_trigram: text, upper_trigram: text }),
    changed: optionalObject({ name: text }), shi_line: { type: ['number', 'null'] }, ying_line: { type: ['number', 'null'] } }, ['primary', 'changed', 'shi_line', 'ying_line']),
  lines: { type: 'array', minItems: 6, maxItems: 6, items: object({
    position: { type: 'integer', minimum: 1, maximum: 6 }, yin_yang: { enum: ['yin', 'yang'] }, moving: bool,
    ganzhi: text, branch: text, element: text, relative: text, spirit: text, state_text: text,
    is_shi: bool, is_ying: bool, is_kongwang: bool, changed: transformed, hidden: transformed,
    relations: object({ month_strength: text, day_relation: text, return_relation: text, advance_retreat: text, hidden_relation: text }),
  }, ['position', 'yin_yang', 'moving', 'changed', 'hidden', 'relations']) },
  // Palace stage and calendar display have no equivalent complete structured fields in Canonical 1.0.
  display: object({ palace_text: text, date_text: text }),
}, ['schema_version', 'meta', 'versions', 'calendar', 'hexagram', 'lines', 'display']);
export const AI_INPUT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  ...object({ ai_input_schema_version: { const: AI_INPUT_SCHEMA_VERSION },
    A_user_question: { type: 'string' }, B_program_facts: { type: 'array', items: { type: 'string' } },
    C_canonical_cast: AI_CAST_SCHEMA, D_ai_task: { type: 'array', items: { type: 'string' } },
  }, ['ai_input_schema_version', 'A_user_question', 'B_program_facts', 'C_canonical_cast', 'D_ai_task']),
};

// Implements only the keywords used by the above local schema; not a general JSON Schema engine.
export function validateAiValue(value, schema, path = '$') {
  const fail = () => { throw new Error(`Structured AI input invalid at ${path}`); };
  if ('const' in schema && value !== schema.const) fail();
  if (schema.enum && !schema.enum.includes(value)) fail();
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && ![].concat(schema.type).some(t => t === type || (t === 'integer' && Number.isInteger(value)))) fail();
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) fail();
  if (type === 'object') {
    for (const key of schema.required || []) if (!Object.prototype.hasOwnProperty.call(value, key)) fail();
    for (const [key, item] of Object.entries(value)) {
      if (!Object.prototype.hasOwnProperty.call(schema.properties || {}, key)) fail();
      validateAiValue(item, schema.properties[key], `${path}.${key}`);
    }
  }
  if (type === 'array') {
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) fail();
    value.forEach((item, i) => validateAiValue(item, schema.items, `${path}[${i}]`));
  }
  return value;
}
export function projectAiValue(value, schema) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => projectAiValue(item, schema.items));
  const result = {};
  for (const [key, child] of Object.entries(schema.properties || {})) {
    if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined) result[key] = projectAiValue(value[key], child);
  }
  return result;
}
