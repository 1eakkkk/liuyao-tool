// Browser-compatible, offline output protocol. No network, storage or UI imports.
export const OUTPUT_VERSION = 'structured-answer-1.0';
export const OUTPUT_PROMPT_VERSION = 'structured-answer-p1';
export const MAX_RESPONSE_CHARS = 64000;
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
const list = (items, maxItems, minItems = 0) => ({ type: 'array', items, minItems, maxItems, uniqueItems: true });
const refs = list(text(180), 12, 1);
const target = object({ line: { type: 'integer', minimum: 1, maximum: 6 },
  component: { enum: ['primary', 'changed', 'hidden'] } });
export const OUTPUT_SCHEMA = object({
  schema_version: { const: OUTPUT_VERSION }, context_id: text(80),
  answer: text(6000),
  direction: { enum: ['favorable', 'unfavorable', 'mixed', 'unclear'] },
  yongshen_candidates: list(object({ relative: { enum: ['父母', '兄弟', '子孙', '妻财', '官鬼'] },
    targets: list(target, 6, 1), reason: text(1200), evidence_ids: refs }), 5),
  factors: list(object({ assessment: { enum: ['support', 'oppose', 'neutral', 'conditional'] },
    interpretation: text(1200), evidence_ids: refs }), 12, 1),
  timing_candidates: list(object({ candidate: text(240), reason: text(1200), evidence_ids: refs }), 6),
  uncertainties: list(text(800), 10, 1),
});

export class OutputError extends Error {
  constructor(code, path = '$') { super(`${code} at ${path}`); this.code = code; this.path = path; }
}
export function stableOutputJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableOutputJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableOutputJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

// Only the schema keywords above are supported; never advertised as a general validator.
export function validateOutputShape(value, schema = OUTPUT_SCHEMA, path = '$') {
  const fail = code => { throw new OutputError(code, path); };
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if ('const' in schema && value !== schema.const) fail('version_mismatch');
  if (schema.enum && !schema.enum.includes(value)) fail('invalid_enum');
  if (schema.type && schema.type !== type && !(schema.type === 'integer' && Number.isInteger(value))) fail('invalid_type');
  if (type === 'string' && (!value.trim() || value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity))) fail('invalid_length');
  if (type === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) fail('invalid_number');
  if (type === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail('invalid_object');
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) throw new OutputError('missing_field', `${path}.${key}`);
    for (const [key, child] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties ?? {}, key)) throw new OutputError('unknown_field', `${path}.${key}`);
      validateOutputShape(child, schema.properties[key], `${path}.${key}`);
    }
  }
  if (type === 'array') {
    if (value.length < schema.minItems || value.length > schema.maxItems) fail('invalid_count');
    // Validate bounded children before recursively serializing them.
    value.forEach((child, i) => validateOutputShape(child, schema.items, `${path}[${i}]`));
    if (schema.uniqueItems && new Set(value.map(stableOutputJson)).size !== value.length) fail('duplicate_item');
  }
  return value;
}
