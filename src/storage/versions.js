import { normalizeLegacyCast, toLegacyCast } from '../core/normalize.js';

export function migrateCastSnapshot(snapshot, context = {}) {
  if (!snapshot) return snapshot;
  const canonical = normalizeLegacyCast(snapshot, context);
  // Additive disk envelope: old clients still read the original fields after rollback.
  return { ...toLegacyCast(canonical), canonical };
}
export function migrateHistoryRecord(record) {
  if (!record?.cast) return record;
  try {
    return { ...record, cast: migrateCastSnapshot(record.cast, { question: record.question || '', createdAt: record.ts ?? null }) };
  } catch { return record; } // Preserve unsupported/incomplete records verbatim.
}
export function migrateActiveConversation(record) {
  if (!record?.castData) return record;
  return { ...record, castData: migrateCastSnapshot(record.castData, { question: record.castQuestion || '', createdAt: record.castTime ?? null }) };
}

// Lazy, read-only migration. Loading never overwrites the original bytes or adds keys.
// A successful later user operation persists the additive compatible representation.
export function migrateStorage(storage) {
  const result = { history: [], active: null, errors: [] };
  try { storage ??= globalThis.localStorage; }
  catch {
    result.errors.push('liuyao_interpret_history', 'liuyao_active_conversation');
    return result;
  }
  for (const [key, field] of [['liuyao_interpret_history', 'history'], ['liuyao_active_conversation', 'active']]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (field === 'history') {
        if (!Array.isArray(parsed)) throw new Error('shape');
        result.history = parsed.filter(record => record && typeof record === 'object').map(migrateHistoryRecord);
      } else {
        if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('shape');
        result.active = migrateActiveConversation(parsed);
      }
    } catch { result.errors.push(key); }
  }
  return result;
}

export function canWriteStoredJson(key, storage) {
  return !migrateStorage(storage).errors.includes(key);
}
