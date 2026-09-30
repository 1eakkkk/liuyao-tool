import fs from 'node:fs';
import {textHash,stableJson} from '../src/knowledge/validate.js';

export function accountedCampaignAmount(state) {
  if (!Number.isFinite(state.limit_cny) || state.limit_cny <= 0 || !Array.isArray(state.reservations)) throw Error('Invalid budget ledger');
  const settlements = state.settlements ?? [];
  if (!Array.isArray(settlements)) throw Error('Invalid settlements');
  const seen = new Set();
  for (const s of settlements) {
    const r = state.reservations.find(r => r.run === s.run);
    const {evidence_hash,settled_at,...audit}=s;
    if (!r || seen.has(s.run) || s.planHash !== r.planHash || s.original_amount !== r.amount ||
        !Number.isFinite(s.accounted_cny) || s.accounted_cny < 0 || s.accounted_cny > r.amount ||
        typeof evidence_hash !== 'string' || evidence_hash!==textHash(stableJson(audit)) ||
        !Number.isFinite(s.usage_upper_cny) || s.usage_upper_cny<0 || s.rounding_pad_cny!==0.01 ||
        s.accounted_cny!==Number((s.usage_upper_cny+s.rounding_pad_cny).toFixed(6))) throw Error('Invalid audited settlement');
    seen.add(s.run);
  }
  const runs = new Set();
  return state.reservations.reduce((total, r) => {
    if (!Number.isFinite(r.amount) || r.amount < 0 || runs.has(r.run)) throw Error('Invalid previous reservation');
    runs.add(r.run);
    return total + (settlements.find(s => s.run === r.run)?.accounted_cny ?? r.amount);
  }, 0);
}

// Keep reservations even after successful calls: an interrupted request never frees funds.
// One campaign owns this ledger; a lock collision stops work rather than racing another runner.
export function reserveCampaign(file, { run, amount, planHash }) {
  if (!Number.isFinite(amount) || amount <= 0) throw Error('Invalid reservation');
  const lock = `${file}.lock`;
  const fd = fs.openSync(lock, 'wx');
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    const previous = accountedCampaignAmount(state);
    if (state.reservations.some(r => r.run === run)) throw Error('Run already reserved; retries are not automatic');
    const total = previous + amount;
    if (total > state.limit_cny) throw Error('Cumulative campaign budget exceeded');
    state.reservations.push({ run, amount, planHash, reserved_at: new Date().toISOString() });
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
    return { reserved_cny: total, remaining_unreserved_cny: state.limit_cny - total };
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
