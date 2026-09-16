import { normalizeLegacyCast, toLegacyCast } from '../core/normalize.js';

// Canonical is the only live cast. Legacy-shaped values are disposable projections.
let canonical = null;
let emptyQuestion = '';
let emptyTime = null;
export const castStore = {
  get canonical() { return canonical; },
  set canonical(value) { canonical = value == null ? null : normalizeLegacyCast(value); },
  get legacy() { return toLegacyCast(canonical); },
  set legacy(value) { canonical = value == null ? null : normalizeLegacyCast(value); },
  get question() { return canonical?.question.text ?? emptyQuestion; },
  set question(value) { if (canonical) canonical.question.text = value; else emptyQuestion = value; },
  get time() { return canonical?.meta.created_at ? new Date(canonical.meta.created_at).getTime() : emptyTime; },
  set time(value) { if (canonical) canonical.meta.created_at = value == null ? null : new Date(value).toISOString(); else emptyTime = value; },
};
