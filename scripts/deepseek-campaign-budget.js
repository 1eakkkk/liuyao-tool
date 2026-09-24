import fs from 'node:fs';

// Keep reservations even after successful calls: an interrupted request never frees funds.
// One campaign owns this ledger; a lock collision stops work rather than racing another runner.
export function reserveCampaign(file, { run, amount, planHash }) {
  if (!Number.isFinite(amount) || amount <= 0) throw Error('Invalid reservation');
  const lock = `${file}.lock`;
  const fd = fs.openSync(lock, 'wx');
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Number.isFinite(state.limit_cny) || state.limit_cny <= 0 || !Array.isArray(state.reservations)) throw Error('Invalid budget ledger');
    if (state.reservations.some(r => r.run === run)) throw Error('Run already reserved; retries are not automatic');
    if (state.reservations.some(r => !Number.isFinite(r.amount) || r.amount < 0)) throw Error('Invalid previous reservation');
    const total = state.reservations.reduce((s, r) => s + r.amount, 0) + amount;
    if (total > state.limit_cny) throw Error('Cumulative campaign budget exceeded');
    state.reservations.push({ run, amount, planHash, reserved_at: new Date().toISOString() });
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
    return { reserved_cny: total, remaining_unreserved_cny: state.limit_cny - total };
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
