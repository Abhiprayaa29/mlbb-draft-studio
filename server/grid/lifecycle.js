/**
 * server/grid/lifecycle.js
 * ---------------------------------------------------------------------------
 * Pemetaan lifecycle provider → lifecycle internal.
 *
 * ATURAN PENTING: transisi tidak pernah ditentukan oleh satu event samar.
 * Hanya event pembawa status eksplisit (`series.state.status`,
 * `match.finished`) yang boleh mengubah lifecycle.
 * ---------------------------------------------------------------------------
 */

/** Status yang dikenal dari provider (kontrak fixture/adapter). */
export const PROVIDER_STATUS = ['draft', 'live', 'finished'];

/** Lifecycle internal. */
export const INTERNAL_LIFECYCLE = ['idle', 'draft', 'in_game', 'finished', 'result', 'next_game'];

const FROM_PROVIDER = { draft: 'draft', live: 'in_game', finished: 'finished' };

const ALLOWED = {
  idle: ['draft', 'in_game', 'finished'],
  draft: ['draft', 'in_game', 'finished'],
  in_game: ['in_game', 'finished'],
  finished: ['result'],
  result: ['next_game'],
  next_game: ['draft', 'in_game', 'idle']
};

export function mapProviderStatus(status) {
  return FROM_PROVIDER[status] || null;
}

export function canTransition(from, to) {
  if (!INTERNAL_LIFECYCLE.includes(from) || !INTERNAL_LIFECYCLE.includes(to)) return false;
  if (from === to) return true;
  return (ALLOWED[from] || []).includes(to);
}

/** Lifecycle default untuk game baru. */
export function initialLifecycle() {
  return 'idle';
}
