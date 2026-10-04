/**
 * server/presets.js
 * ---------------------------------------------------------------------------
 * Preset urutan draft. Tiap preset hanyalah daftar aksi berurutan
 * { team: 'blue'|'red', type: 'ban'|'pick' }.
 *
 * CATATAN: preset di bawah adalah konfigurasi kerja untuk turnamen,
 * BUKAN klaim aturan resmi MPL/Moonton. Operator bebas mengedit,
 * menambah, menghapus, dan menyusun ulang urutan melalui control panel.
 * ---------------------------------------------------------------------------
 */

const seq = (pairs) => pairs.map(([team, type], i) => ({ i, team, type }));

/** Urutan 10 ban (5 per tim) + 10 pick (5 per tim) dengan giliran ular. */
const STANDARD_BANS = seq([
  ['blue', 'ban'], ['red', 'ban'],
  ['blue', 'ban'], ['red', 'ban'],
  ['blue', 'ban'], ['red', 'ban'],
  ['blue', 'ban'], ['red', 'ban'],
  ['blue', 'ban'], ['red', 'ban']
]);
const SNAKE_PICKS = seq([
  ['blue', 'pick'], ['red', 'pick'], ['red', 'pick'], ['blue', 'pick'], ['blue', 'pick'],
  ['red', 'pick'], ['red', 'pick'], ['blue', 'pick'], ['blue', 'pick'], ['red', 'pick']
]).map((a, i) => ({ ...a, i: 10 + i }));

const FAST_BANS = seq([
  ['blue', 'ban'], ['red', 'ban'],
  ['blue', 'ban'], ['red', 'ban'],
  ['blue', 'ban'], ['red', 'ban']
]);
const FAST_PICKS = SNAKE_PICKS.map((a, i) => ({ ...a, i: 6 + i }));

export const PRESETS = [
  {
    id: 'standard-5ban-5pick',
    name: 'Standar — 5 Ban + 5 Pick',
    description: '10 ban berurutan, lalu 10 pick pola ular. 5 hero per tim.',
    actions: [...STANDARD_BANS, ...SNAKE_PICKS]
  },
  {
    id: 'fast-3ban-5pick',
    name: 'Cepat — 3 Ban + 5 Pick',
    description: '6 ban berurutan, lalu 10 pick pola 3 + 5 per tim.',
    actions: [...FAST_BANS, ...FAST_PICKS]
  },
  {
    id: 'pick-only',
    name: 'Tanpa Ban — 5 Pick per Tim',
    description: 'Hanya 10 pick pola ular, tanpa fase ban.',
    actions: SNAKE_PICKS.map((a, i) => ({ ...a, i }))
  },
  {
    id: 'interleaved-2-2',
    name: 'Selang — 2 Ban + 2 Pick per Ronde',
    description: 'Ban dan pick berselang-seling per ronde.',
    actions: seq([
      ['blue', 'ban'], ['red', 'ban'], ['blue', 'pick'], ['red', 'pick'],
      ['blue', 'ban'], ['red', 'ban'], ['blue', 'pick'], ['red', 'pick'],
      ['blue', 'ban'], ['red', 'ban'], ['red', 'pick'], ['blue', 'pick'],
      ['red', 'pick'], ['blue', 'pick'], ['red', 'pick'], ['blue', 'pick'],
      ['red', 'pick'], ['blue', 'pick'], ['red', 'pick'], ['blue', 'pick']
    ])
  }
];

export const MAX_PICKS_PER_TEAM = 5;

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || PRESETS[0];
}

/**
 * Validasi preset kustom.
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validatePreset(actions) {
  const errors = [];
  if (!Array.isArray(actions) || actions.length === 0) {
    return { valid: false, errors: ['Daftar aksi kosong.'] };
  }
  if (actions.length > 60) errors.push('Terlalu banyak aksi (maksimal 60).');
  const counts = { blue: { ban: 0, pick: 0 }, red: { ban: 0, pick: 0 } };
  actions.forEach((a, idx) => {
    if (!['blue', 'red'].includes(a.team)) errors.push(`Aksi #${idx + 1}: sisi tim tidak valid.`);
    if (!['ban', 'pick'].includes(a.type)) errors.push(`Aksi #${idx + 1}: jenis aksi tidak valid.`);
    if (counts[a.team] && counts[a.team][a.type] !== undefined) counts[a.team][a.type] += 1;
  });
  Object.entries(counts).forEach(([team, c]) => {
    if (c.pick > MAX_PICKS_PER_TEAM) {
      errors.push(`Tim ${team} memiliki ${c.pick} pick, maksimal ${MAX_PICKS_PER_TEAM}.`);
    }
    if (c.pick === 0) errors.push(`Tim ${team} tidak memiliki pick sama sekali.`);
  });
  return { valid: errors.length === 0, errors };
}
