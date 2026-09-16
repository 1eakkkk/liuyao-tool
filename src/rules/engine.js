import { assertCanonicalCast } from '../core/normalize.js';
import { getShiYingRelation } from '../core/relations.js';
import { BRANCHES12, WX, LIUCHONG_PAIR, LIUHE_PAIR } from '../core/constants.js';
import { RULES, ANNOTATION_ENUMS, RULESET_VERSION, RULE_ENGINE_VERSION, RULE_RESULT_SCHEMA_VERSION } from './registry.js';

export const readEvidencePath = (cast, path) => path.slice(1).split('/').reduce((v, key) => v?.[key], cast);
const ref = (line, component = 'primary') => ({ line, component });
const issue = (reason, paths) => ({ reason, paths });
function fieldIssue(cast, path, accepts) {
  const value = readEvidencePath(cast, path);
  if (value === undefined || value === null) return issue('insufficient_data', [path]);
  return accepts(value) ? null : issue('invalid_data', [path]);
}
function requireFields(cast, fields) {
  for (const [path, accepts] of fields) { const bad = fieldIssue(cast, path, accepts); if (bad) return bad; }
  return null;
}
const branch = value => BRANCHES12.includes(value);
const element = value => WX.includes(value);
const boolean = value => typeof value === 'boolean';

function shiYing(cast) {
  const paths = ['/hexagram/shi_line', '/hexagram/ying_line'];
  const bad = requireFields(cast, paths.map(path => [path, v => Number.isInteger(v) && v >= 1 && v <= 6]));
  if (bad) return bad;
  const [s, y] = paths.map(path => readEvidencePath(cast, path));
  if (s === y) return issue('conflicting_input', paths);
  for (const [flag, position] of [['is_shi', s], ['is_ying', y]]) {
    for (let i = 0; i < 6; i++) {
      const path = `/lines/${i}/${flag}`;
      const invalid = fieldIssue(cast, path, boolean);
      if (invalid) return invalid;
      if (readEvidencePath(cast, path) !== (i + 1 === position)) return issue('conflicting_input', [path, ...paths]);
      paths.push(path);
    }
  }
  paths.push(`/lines/${s - 1}/element`, `/lines/${y - 1}/element`);
  const invalid = requireFields(cast, paths.slice(-2).map(path => [path, element]));
  if (invalid) return invalid;
  return { value: getShiYingRelation(cast.lines[s - 1].element, cast.lines[y - 1].element), paths, s, y };
}

function evaluate(cast, rule, i, pair) {
  if (rule.field === 'shi_ying') return pair;
  const prefix = `/lines/${i}`, line = cast.lines[i], field = rule.field;
  const path = `${prefix}/${['moving', 'is_kongwang'].includes(field) ? field : `relations/${field}`}`;
  if (field.startsWith('month_c')) {
    const paths = ['/calendar/month_branch', `${prefix}/branch`];
    const invalid = requireFields(cast, paths.map(p => [p, branch]));
    if (invalid) return invalid;
    const table = field === 'month_clash' ? LIUCHONG_PAIR : LIUHE_PAIR;
    return { value: table[cast.calendar.month_branch] === line.branch, paths };
  }
  const valid = ['moving', 'is_kongwang'].includes(field) ? boolean : v => ANNOTATION_ENUMS[field].includes(v);
  const invalid = fieldIssue(cast, path, valid);
  if (invalid) return invalid;
  const value = readEvidencePath(cast, path), paths = [path];
  if (field === 'return_relation' || field === 'advance_retreat') {
    if (!line.moving || !line.changed) {
      return issue(value ? 'conflicting_input' : 'not_applicable', [path, `${prefix}/moving`]);
    }
    const key = field === 'return_relation' ? 'element' : 'branch';
    const more = [`${prefix}/moving`, `${prefix}/${key}`, `${prefix}/changed/${key}`];
    const bad = requireFields(cast, more.slice(1).map(p => [p, key === 'element' ? element : branch]));
    if (bad) return bad;
    paths.push(...more);
  } else if (field === 'hidden_relation') {
    if (!line.hidden) return issue(value ? 'conflicting_input' : 'not_applicable', [path]);
    const more = [`${prefix}/element`, `${prefix}/hidden/element`];
    const bad = requireFields(cast, more.map(p => [p, element]));
    if (bad) return bad;
    paths.push(...more);
  } else if (field === 'day_relation' || field === 'month_strength') {
    const more = field === 'day_relation' ? [[`${prefix}/branch`, branch], ['/calendar/day_branch', branch]]
      : [[`${prefix}/element`, element], ['/calendar/month_branch', branch]];
    const bad = requireFields(cast, more);
    if (bad) return bad;
    paths.push(...more.map(([p]) => p));
  }
  return { value, paths };
}

function direction(rule, position, pair) {
  if (rule.field === 'return_relation') return { from: ref(position, 'changed'), to: ref(position) };
  if (rule.field === 'hidden_relation') {
    const reverse = rule.expected.startsWith('伏神');
    if (rule.expected === '飞伏比和') return {};
    return { from: ref(position, reverse ? 'hidden' : 'primary'), to: ref(position, reverse ? 'primary' : 'hidden') };
  }
  if (rule.field === 'shi_ying' && rule.expected !== '世应比和') {
    const reverse = rule.expected.startsWith('应');
    return { from: ref(reverse ? pair.y : pair.s), to: ref(reverse ? pair.s : pair.y) };
  }
  return {};
}

// Pure projection/derivation. No dates, RNG, storage, questions, display parsing or write-back.
export function evaluateRules(canonical) {
  const cast = assertCanonicalCast(canonical);
  const output = { schema_version: RULE_RESULT_SCHEMA_VERSION, engine_version: RULE_ENGINE_VERSION,
    ruleset_version: RULESET_VERSION, input_schema_version: cast.schema_version, hits: [], skipped: [], diagnostics: [] };
  const pair = shiYing(cast); // Shared Core implementation, evaluated once, not five competing calculations.
  for (const rule of RULES) {
    for (const i of rule.field === 'shi_ying' ? [null] : [0, 1, 2, 3, 4, 5]) {
      const position = i === null ? (pair.s ?? null) : i + 1;
      const target = { line: position, component: rule.field === 'hidden_relation' ? 'hidden' : 'primary',
        ...(i === null ? { related_line: pair.y ?? null } : {}) };
      const evaluated = evaluate(cast, rule, i, pair);
      if (evaluated.reason) {
        const entry = { rule_id: rule.rule_id, target, reason: evaluated.reason, paths: evaluated.paths };
        output.skipped.push(entry);
        if (['invalid_data', 'conflicting_input'].includes(entry.reason)) output.diagnostics.push(entry);
        continue;
      }
      if (evaluated.value !== rule.expected) continue;
      output.hits.push({ rule_id: rule.rule_id, rule_version: rule.rule_version, origin: rule.origin, target,
        evidence: evaluated.paths.map(path => ({ path, value: readEvidencePath(cast, path) })),
        result: { code: rule.code, label: rule.label, ...direction(rule, position, pair) } });
    }
  }
  return output;
}
