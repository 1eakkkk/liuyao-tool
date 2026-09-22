import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { buildKnowledgePair } from '../../src/ai/knowledge-input.js';
import { readCorpus } from '../../src/knowledge/load.js';
import { loadCases, neutralMaterials, referencePack } from './evaluation-cases.js';
import { METRICS, TURNS, reviewTemplate, validateReviews } from './evaluation-review-schema.js';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const json = value => JSON.stringify(value, null, 2) + '\n';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const objectHash = value => hash(JSON.stringify(value));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : json(value), { flag: 'wx' }); };
const need = (ok, message) => { if (!ok) throw Error(message); };
const privateFile = (root, name) => path.join(root, 'private', name);
const keyOf = (id, variant) => `${id}-${variant}`;
const inside = (base, target) => { const rel = path.relative(path.resolve(base), path.resolve(target)); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
const strictKeys = (object, keys) => need(object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).every(k => keys.includes(k)), 'Unknown metadata field');
const timestamp = () => new Date().toISOString();
const walkSources = dir => fs.readdirSync(path.join(REPO,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?walkSources(dir+'/'+e.name):[dir+'/'+e.name]);
const TOOL_SOURCES = [...walkSources('src/core'),...walkSources('src/rules'),...walkSources('src/ai'),...walkSources('src/knowledge'),...walkSources('knowledge'),...walkSources('scripts/phase7'),...walkSources('experiments/phase7/evaluation'),'scripts/phase7-evaluation.js'];
const sourceHashes = () => Object.fromEntries(TOOL_SOURCES.map(file => [file, hash(fs.readFileSync(path.join(REPO, file)))]));
function validateCost(usage, latency) {
  if (usage != null) {
    strictKeys(usage, ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens']);
    need(Object.values(usage).every(v => v === null || (Number.isInteger(v) && v >= 0)), 'Usage values must be nonnegative integers or null');
  }
  if (latency != null) {
    strictKeys(latency, ['milliseconds','source']);
    need(Number.isFinite(latency.milliseconds) && latency.milliseconds >= 0 && latency.source === 'manual_wall_clock', 'Manual latency requires milliseconds and source=manual_wall_clock');
  }
}
function resolvedThroughParents(target) {
  let ancestor = path.resolve(target), suffix = [];
  while (!fs.existsSync(ancestor)) { suffix.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
  return path.join(fs.realpathSync(ancestor), ...suffix);
}

function shuffled(values, seed, label) {
  return values.map(v => ({ v, h: hash(`${seed}:${label}:${v}`) })).sort((a,b) => a.h.localeCompare(b.h)).map(x => x.v);
}
export function prepare(root, options) {
  strictKeys(options, ['experiment_id', 'data_kind', 'model', 'seed']);
  need(typeof options.experiment_id === 'string' && /^[a-zA-Z0-9_-]+$/.test(options.experiment_id), 'Invalid experiment id');
  need(['external', 'synthetic'].includes(options.data_kind), 'Declare external or synthetic data');
  need(options.data_kind !== 'external' || options.seed === undefined, 'External assignment uses a private random seed');
  strictKeys(options.model, ['client', 'label', 'version', 'settings']);
  need(typeof options.model.client === 'string' && options.model.client.trim() && typeof options.model.label === 'string' && options.model.label.trim(), 'Visible client/model required');
  need(options.model.version === null || typeof options.model.version === 'string', 'Unknown model version must be null');
  need(options.model.settings && typeof options.model.settings === 'object' && !Array.isArray(options.model.settings), 'Declare settings, with unknown values as null');
  need(!fs.existsSync(root), 'Experiment directory already exists; never overwrite a frozen round');
  const { data, manifest } = loadCases();
  const seed = options.seed ?? randomBytes(32).toString('hex'); need(typeof seed === 'string' && seed.length >= 8, 'Seed must be a string of at least 8 characters');
  const ids = data.cases.map(c => c.case_id), indices = shuffled(ids, seed, 'mapping');
  const aOn = new Set(indices.slice(0, 6));
  // Each assignment has three A-first and three B-first cases.
  const orderById = Object.fromEntries(indices.map((id, i) => [id, i % 2 ? ['B','A'] : ['A','B']]));
  const plan = { experiment_id: options.experiment_id, data_kind: options.data_kind, model: options.model, seed,
    base_commit: data.base_commit, code_commit: execFileSync('git', ['rev-parse','HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
    source_hashes: sourceHashes(), working_tree_dirty: Boolean(execFileSync('git', ['status','--porcelain'], {cwd:REPO,encoding:'utf8'}).trim()),
    prepared_at: timestamp(), case_version: data.version, rubric_version: data.rubric_version,
    assignments: Object.fromEntries(ids.map(id => [id, aOn.has(id) ? { A:'on',B:'off' } : { A:'off',B:'on' }])),
    schedule: ids.flatMap(case_id => orderById[case_id].map(variant => ({ case_id, variant }))), cases: {} };
  const files = [];
  const frozenWrite = (relative, value) => { write(path.join(root, relative), value); files.push(relative); };
  frozenWrite('private/review.schema.json', read(path.join(REPO,'experiments/phase7/evaluation/review.schema.json')));
  frozenWrite('private/reference-pack.json', referencePack());
  frozenWrite('private/cases.json', data); frozenWrite('private/manifest.json', manifest);
  for (const c of data.cases) {
    const pair = buildKnowledgePair({canonical:c.canonical,corpus:readCorpus(),case_id:c.case_id,query:c.query});
    const changed = structuredClone(pair.on.input);
    changed.F_literature_context.items = [];
    assert.deepEqual(changed, pair.off.input);
    plan.cases[c.case_id] = { materials: neutralMaterials(c, pair), category:c.category, case_type:c.case_type, archive:pair.archive, zero_match:c.expected.zero_match, variants: {} };
    frozenWrite(`execution/${c.case_id}-follow-up.txt`, c.follow_up);
    for (const variant of ['A','B']) {
      const mode = plan.assignments[c.case_id][variant], item = pair[mode], key = keyOf(c.case_id, variant);
      frozenWrite(`execution/${key}.txt`, item.text); frozenWrite(`private/${key}.input.json`, item.input);
      plan.cases[c.case_id].variants[variant] = { payload_hash: hash(item.text), input_hash: objectHash(item.input), chars: [...item.text].length };
    }
  }
  frozenWrite('execution/schedule.json', plan.schedule.map((item, i) => ({ order: i + 1, ...item })));
  frozenWrite('execution/INSTRUCTIONS.txt', '每份文件在同模型、同设置的独立新对话中执行；随后在各自对话发送同案例 follow-up 文件。不要阅读映射，不把另一组回答作上下文。执行者不要兼任盲评者；输入内容可能暴露组别。记录实际顺序和可见模型信息。');
  frozenWrite('private/plan.json', plan);
  const seal = Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(root, file)))]));
  write(privateFile(root, 'seal.json'), seal);
  write(path.join(root, 'FREEZE.sha256'), objectHash(seal));
  return { status: 'prepared_no_answers', experiment_id: options.experiment_id, cases: ids.length, freeze_hash: objectHash(seal) };
}
export function verify(root) {
  const seal = read(privateFile(root, 'seal.json'));
  need(objectHash(seal) === fs.readFileSync(path.join(root, 'FREEZE.sha256'), 'utf8'), 'Freeze seal changed');
  for (const [file, digest] of Object.entries(seal)) {
    need(inside(root, path.join(root, file)), 'Invalid sealed path');
    need(hash(fs.readFileSync(path.join(root, file))) === digest, `Frozen file changed: ${file}`);
  }
  const plan = read(privateFile(root, 'plan.json'));
  need(objectHash(plan.source_hashes) === objectHash(sourceHashes()), 'Tool or input-builder source changed; use the frozen code version for this round');
  return plan;
}
function records(root, plan) {
  return plan.schedule.flatMap(({case_id,variant}) => {
    const file = privateFile(root, `answers/${keyOf(case_id,variant)}/record.json`);
    if (!fs.existsSync(file)) return [];
    const r = read(file); need(r.case_id === case_id && r.variant === variant && r.model === plan.model.label && r.data_kind === plan.data_kind && objectHash(r.settings) === objectHash(plan.model.settings), 'Record identity changed');
    for (const turn of TURNS) need(hash(fs.readFileSync(privateFile(root, `answers/${keyOf(case_id,variant)}/${turn}.txt`))) === r.responses[turn].hash, 'Archived answer changed');
    return [r];
  });
}
export async function importAnswer(root, request) {
  const plan = verify(root);
  need(!fs.existsSync(privateFile(root, 'packet.json')) && !fs.existsSync(privateFile(root, 'lock.json')), 'Collection already closed');
  strictKeys(request, ['case_id','variant','initial_file','follow_up_file','actual_order','model','settings','deviations','usage','latency','data_kind']);
  need(request.data_kind === plan.data_kind, 'Synthetic/external data kind mismatch');
  need(plan.model.label !== 'MODEL_NOT_SELECTED', 'Select the real model in a new frozen round before importing');
  const c = plan.cases[request.case_id], mode = plan.assignments[request.case_id]?.[request.variant];
  need(c && mode, 'Unknown case or variant');
  need(request.model === plan.model.label && objectHash(request.settings) === objectHash(plan.model.settings), 'Model or settings changed: use a separate round');
  need(Number.isInteger(request.actual_order) && request.actual_order >= 1 && request.actual_order <= 24, 'Actual order must be 1..24');
  need(Array.isArray(request.deviations) && request.deviations.every(x => typeof x === 'string'), 'Declare deviations');
  validateCost(request.usage, request.latency);
  const prior = records(root, plan);
  need(!prior.some(r => r.actual_order === request.actual_order || (r.case_id === request.case_id && r.variant === request.variant)), 'Duplicate order or answer; create a new round for retries');
  const key = keyOf(request.case_id, request.variant), folder = privateFile(root, `answers/${key}`);
  need(!fs.existsSync(folder), 'Answer archive already exists');
  const responses = {}, raw = {};
  for (const turn of TURNS) {
    const bytes = fs.readFileSync(request[`${turn}_file`]);
    const text = new TextDecoder('utf-8', {fatal:true,ignoreBOM:true}).decode(bytes);
    need(text.trim(), 'Empty answer is missing data, not a zero-error response');
    need(plan.data_kind !== 'external' || !/\[SYNTHETIC\]/i.test(text), 'Synthetic answer cannot enter external round');
    raw[turn] = text; responses[turn] = { hash: hash(bytes), bytes: bytes.length };
  }
  const payload = fs.readFileSync(path.join(root, `execution/${key}.txt`), 'utf8');
  const input = read(privateFile(root, `${key}.input.json`));
  const base = {input_mode:mode,model:plan.model.label,case_id:request.case_id,prompt_version:'structured-literature-p1',ai_input_schema_version:'1.2',payload_hash:hash(payload),input_hash:objectHash(input),response_hash:hash(raw.initial),usage:request.usage??null,latency:request.latency??null};
  const scheduled = plan.schedule[request.actual_order - 1];
  const deviations = [...request.deviations];
  if (scheduled.case_id !== request.case_id || scheduled.variant !== request.variant) deviations.push('actual_order_differs_from_schedule');
  const record = { ...base, variant: request.variant, data_kind: plan.data_kind, actual_order: request.actual_order, responses,
    settings: request.settings, deviations, imported_at: timestamp(), follow_up_hash: hash(c.materials.follow_up) };
  for (const turn of TURNS) write(path.join(folder, `${turn}.txt`), raw[turn]);
  write(path.join(folder, 'record.json'), record);
  return { case_id: request.case_id, variant: request.variant, status: 'archived' };
}
export function exportScoring(root, out) {
  const plan = verify(root), imported = records(root, plan);
  need(imported.length === 24, 'Collect all 24 answer pairs before blind scoring');
  need(typeof out === 'string' && out.length, 'Scoring output directory required');
  const resolvedRoot = resolvedThroughParents(root), resolvedOut = resolvedThroughParents(out);
  need(!inside(resolvedRoot,resolvedOut) && !inside(resolvedOut,resolvedRoot), 'Scoring package must be outside the experiment/execution tree');
  need(!fs.existsSync(out) && !fs.existsSync(privateFile(root, 'packet.json')), 'Scoring package already frozen');
  // Explicit allowlist: no spreading private metadata, paths, inputs, lengths, seeds or assignments.
  const packet = { reference_pack:read(privateFile(root,'reference-pack.json')), cases: Object.entries(plan.cases).map(([case_id,c]) => ({
    case_id, question: c.materials.question, follow_up: c.materials.follow_up, facts: c.materials.facts, checklist: c.materials.checklist,
    answers: ['A','B'].map(variant => ({ variant, ...Object.fromEntries(TURNS.map(turn => [turn, fs.readFileSync(privateFile(root, `answers/${keyOf(case_id,variant)}/${turn}.txt`), 'utf8')])) })),
  })) };
  write(path.join(out,'scoring-packet.json'),packet); write(path.join(out,'reviews.json'),reviewTemplate(packet));
  write(privateFile(root,'packet.json'),packet);
  const collection = { packet_hash: objectHash(packet), records: Object.fromEntries(imported.map(r => [keyOf(r.case_id,r.variant),objectHash(r)])) };
  write(privateFile(root,'collection.json'),collection);
  return { status: 'blind_scoring_pending', anonymous_pairs: 24 };
}
function verifyCollection(root, plan) {
  const collection = read(privateFile(root,'collection.json')), packet = read(privateFile(root,'packet.json'));
  need(collection.packet_hash === objectHash(packet), 'Scoring packet changed');
  const imported = records(root,plan); need(imported.length === 24, 'Missing archived answers');
  for (const r of imported) need(collection.records[keyOf(r.case_id,r.variant)] === objectHash(r), 'Collected record changed');
  return { packet, imported, collection };
}
export function lockReviews(root, file) {
  const plan = verify(root), {packet,collection} = verifyCollection(root,plan);
  need(!fs.existsSync(privateFile(root,'lock.json')), 'Reviews already locked; amendments need a separate review round');
  const reviews = validateReviews(read(file),packet);
  write(privateFile(root,'reviews.json'),reviews);
  const lock = { rubric_hash:hash(fs.readFileSync(privateFile(root,'review.schema.json'))), review_hash: objectHash(reviews), collection_hash: objectHash(collection), seal_hash: fs.readFileSync(path.join(root,'FREEZE.sha256'),'utf8'), locked_at: timestamp() };
  write(privateFile(root,'lock.json'),lock);
  return { status:'blind_reviews_locked', lock_hash:objectHash(lock) };
}
function locked(root) {
  const plan = verify(root), { packet, imported, collection } = verifyCollection(root,plan);
  need(fs.existsSync(privateFile(root,'lock.json')), 'Blind reviews must be locked before unblinding');
  const lock = read(privateFile(root,'lock.json')), reviews = read(privateFile(root,'reviews.json'));
  need(lock.rubric_hash === hash(fs.readFileSync(privateFile(root,'review.schema.json'))) && lock.seal_hash === fs.readFileSync(path.join(root,'FREEZE.sha256'),'utf8') && lock.review_hash === objectHash(reviews) && lock.collection_hash === objectHash(collection), 'Locked material changed');
  validateReviews(reviews,packet);
  return {plan,packet,imported,reviews,lock};
}
export function unblind(root) {
  const {plan,reviews,lock} = locked(root);
  const result = { lock_hash:objectHash(lock), assignments:plan.assignments,
    reviews:reviews.reviews.map(r=>({...r,knowledge_mode:plan.assignments[r.case_id][r.variant]})) };
  const file = path.join(root,'unblinded.json');
  if(fs.existsSync(file)) assert.deepEqual(read(file),result); else write(file,result);
  return {status:'unblinded', data_kind:plan.data_kind};
}
export function status(root) {
  const plan=verify(root), count=records(root,plan).length;
  return {status:fs.existsSync(path.join(root,'unblinded.json'))?'unblinded':fs.existsSync(privateFile(root,'lock.json'))?'reviews_locked':fs.existsSync(privateFile(root,'packet.json'))?'blind_scoring_pending':'awaiting_external_answers',
    data_kind:plan.data_kind, collected_pairs:count, required_pairs:24, effects_conclusion:null};
}
export function summarize(root) {
  const {plan,packet,imported,reviews,lock}=locked(root);
  need(fs.existsSync(path.join(root,'unblinded.json')),'Explicit unblind step required');
  assert.deepEqual(read(path.join(root,'unblinded.json')), {lock_hash:objectHash(lock),assignments:plan.assignments,reviews:reviews.reviews.map(r=>({...r,knowledge_mode:plan.assignments[r.case_id][r.variant]}))});
  const empty=()=>({...Object.fromEntries([...METRICS,'uncertain','direction_errors'].map(k=>[k,0])),checklist_opportunities:0});
  const totals={off:empty(),on:empty()},byTurn=Object.fromEntries([...TURNS,'cross_turn'].map(t=>[t,{off:empty(),on:empty()}])),byCategory={},cases=[];
  for(const group of new Set(packet.cases.flatMap(c=>c.facts.map(f=>f.category))))byCategory[group]={off:empty(),on:empty()};
  const costs={off:0,on:0}, countsByCase={}; let compromised=0;
  for(const r of reviews.reviews){
    const mode=plan.assignments[r.case_id][r.variant],count=empty(), materials=packet.cases.find(c=>c.case_id===r.case_id);
    for(const metric of [...METRICS,'uncertain']){
      count[metric]=new Set(r[metric].map(f=>f.finding_id)).size;
      for(const f of r[metric]){
        byTurn[f.turn]??={off:empty(),on:empty()};byTurn[f.turn][mode][metric]++;
        const groups=new Set([plan.cases[r.case_id].category,...f.fact_ids.map(id=>materials.facts.find(x=>x.fact_id===id).category)]);
        if(f.checklist_id){groups.add(plan.cases[r.case_id].category);}
        if(!groups.size)groups.add('unclassified');
        for(const group of groups){byCategory[group]??={off:empty(),on:empty()};byCategory[group][mode][metric]++;}
      }
    }
    count.direction_errors=r.relation_errors.filter(f=>f.direction_error).length;
    count.checklist_opportunities=r.checklist_assessments.length;
    for(const a of r.checklist_assessments){
      byTurn[a.turn]??={off:empty(),on:empty()};byTurn[a.turn][mode].checklist_opportunities++;
      const group=plan.cases[r.case_id].category;
      byCategory[group]??={off:empty(),on:empty()};byCategory[group][mode].checklist_opportunities++;
    }
    for(const f of r.relation_errors.filter(f=>f.direction_error)){
      byTurn[f.turn][mode].direction_errors++;
      for(const group of new Set(f.fact_ids.map(id=>materials.facts.find(x=>x.fact_id===id).category)))byCategory[group][mode].direction_errors++;
    }
    for(const key of Object.keys(count))totals[mode][key]+=count[key];
    countsByCase[r.case_id]??={};countsByCase[r.case_id][mode]=count;
    costs[mode]+=plan.cases[r.case_id].variants[r.variant].chars;
    if(r.blinding_compromised)compromised++;
  }
  for(const [case_id,counts]of Object.entries(countsByCase)){
    const deviated=imported.some(r=>r.case_id===case_id&&r.deviations.length);
    const keys=[...METRICS,'direction_errors'];
    const onBetter=keys.every(k=>counts.on[k]<=counts.off[k])&&keys.some(k=>counts.on[k]<counts.off[k]);
    const offBetter=keys.every(k=>counts.off[k]<=counts.on[k])&&keys.some(k=>counts.off[k]<counts.on[k]);
    const same=keys.every(k=>counts.off[k]===counts.on[k]);
    const chars={};for(const [variant,value]of Object.entries(plan.cases[case_id].variants))chars[plan.assignments[case_id][variant]]=value.chars;
    cases.push({case_id,case_type:plan.cases[case_id].case_type,category:plan.cases[case_id].category,zero_match:plan.cases[case_id].zero_match,visible_identical:plan.cases[case_id].variants.A.payload_hash===plan.cases[case_id].variants.B.payload_hash,byte_identical:plan.cases[case_id].variants.A.payload_hash===plan.cases[case_id].variants.B.payload_hash,cost: {prompt_chars:plan.cases[case_id].archive.prompt_chars,f_chars:plan.cases[case_id].archive.f_chars,delta_chars:plan.cases[case_id].archive.delta_chars,delta_percent:plan.cases[case_id].archive.delta_percent,selected_unit_count:plan.cases[case_id].archive.selected_knowledge_ids.length},counts,prompt_characters:{...chars,delta:chars.on-chars.off},blinding_compromised:reviews.reviews.some(r=>r.case_id===case_id&&r.blinding_compromised),comparison:deviated||counts.off.uncertain||counts.on.uncertain?'unable_to_judge':onBetter?'on_better':offBetter?'off_better':same?'same':'mixed',protocol_deviation:deviated});
  }
  return {experiment_id:plan.experiment_id,experiment_status:plan.data_kind==='synthetic'?'synthetic_pipeline_validation':'external_ab_completed',
    data_kind:plan.data_kind,model:plan.model,code_commit:plan.code_commit,source_hashes:plan.source_hashes,working_tree_dirty_at_prepare:plan.working_tree_dirty,freeze_hash:objectHash(read(privateFile(root,'seal.json'))),lock_hash:objectHash(lock),
    affected_responses:Object.fromEntries(['off','on'].map(mode=>[mode,Object.fromEntries([...METRICS,'uncertain'].map(metric=>[metric,reviews.reviews.filter(r=>plan.assignments[r.case_id][r.variant]===mode&&r[metric].length).length]))])),
    totals,by_turn:byTurn,by_category:byCategory,cases,blinding_compromised_pairs:compromised,
    prompt_characters:{...costs,delta:costs.on-costs.off,increase_percent:(costs.on-costs.off)/costs.off*100,unit:'Unicode code points; not tokens'},
    records:imported,evidence_index:{locked_reviews:'private/reviews.json',neutral_facts:'private/packet.json',original_answers:'private/answers/<case_id>-<variant>/<turn>.txt'},effects_conclusion:null,
    limitations:['描述性统计；不是随机样本，不宣称显著性或预测准确率。','指标与类别可能交叉，不相加生成加权总分。','首答与追问、部分本变卦之间有关联，不视为独立样本。','回答可能暴露处理组；保留原文并报告 blinding_compromised。','工具只能验证记录与证据定位，不能代替人工判断，也不能独立证实外部回答来源。']};
}
export function report(root) {
  const result=summarize(root);
  const lines=['# Phase 7 Knowledge A/B report',`Status: ${result.experiment_status}`,`Model: ${result.model.client} / ${result.model.label}`,'',
    '| Metric | OFF | ON |','| --- | ---: | ---: |',...Object.keys(result.totals.off).map(k=>`| ${k} | ${result.totals.off[k]} | ${result.totals.on[k]} |`),'',
    ...result.cases.map(c=>`- ${c.case_id}: ${c.comparison}`),'',`Blinding compromised: ${result.blinding_compromised_pairs}/24`,
    `Prompt characters: ${JSON.stringify(result.prompt_characters)}`,'',...result.limitations.map(x=>`- ${x}`),'',
    result.data_kind==='synthetic'?'Synthetic fixture responses only. No external-model effect conclusion.':'External answers and locked human reviews recorded. Counts are descriptive; no proof of effectiveness.','',
    'Per-category, per-turn counts and traceable records are in report.json. Original evidence and locked reviews remain in the experiment archive.'];
  for(const [file,content]of [['report.json',json(result)],['report.md',lines.join('\n')+'\n']]){
    const target=path.join(root,file);if(fs.existsSync(target))need(fs.readFileSync(target,'utf8')===content,'Existing report differs');else write(target,content);
  }
  return {status:result.experiment_status,effects_conclusion:null};
}
