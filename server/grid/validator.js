/**
 * server/grid/validator.js
 * ---------------------------------------------------------------------------
 * Validator canonical event SEBELUM menyentuh state pertandingan.
 *
 * Prinsip:
 *   - Fail-safe: satu field rusak → seluruh event ditolak (tidak ada tulis
 *     sebagian yang bisa membuat state setengah benar).
 *   - Hero wajib ada di dataset resmi (133 hero) — tanpa fuzzy-match diam-diam.
 *   - Angka wajib finite, non-negatif, dan berada di rentang wajar.
 *   - unknown != zero: field yang tidak ada tidak divalidasi dan tidak dibuat.
 * ---------------------------------------------------------------------------
 */
import { canTransition } from './lifecycle.js';

/** Rentang wajar (guard antar-payload, bukan aturan game). */
export const RANGES = {
  kills: [0, 999],
  gold: [0, 10_000_000],
  turrets: [0, 100],
  lord: [0, 100],
  turtle: [0, 100],
  durationMs: [0, 6 * 3600 * 1000]
};

const INT_KEYS = ['kills', 'turrets', 'lord', 'turtle'];

/**
 * @param {object} event canonical event dari mapper
 * @param {object} ctx   { heroIds:Set<string>, draft, currentLifecycle }
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateEvent(event, ctx = {}) {
  const errors = [];
  const push = (m) => errors.push(m);
  if (!event || !event.kind) return { ok: false, errors: ['event kanonik tidak valid'] };
  if (!Number.isInteger(event.seq) || event.seq < 1) push('seq tidak sah');
  if (!Number.isFinite(event.providerTs)) push('timestamp provider tidak sah');

  switch (event.kind) {
    case 'series':
      validateSeries(event, ctx, push);
      break;
    case 'draft':
      validateDraft(event, ctx, push);
      break;
    case 'score':
      validateScore(event, ctx, push);
      break;
    case 'finished':
      validateFinished(event, ctx, push);
      break;
    default:
      push(`kind tidak dikenal: ${event.kind}`);
  }
  return { ok: errors.length === 0, errors };
}

function validateSeries(event, ctx, push) {
  if (event.status !== undefined && event.status !== null) {
    const from = ctx.currentLifecycle || 'idle';
    if (!canTransition(from, event.status)) {
      push(`transisi lifecycle tidak sah: ${from} → ${event.status}`);
    }
  }
  if (event.teams) {
    for (const side of ['blue', 'red']) {
      const t = event.teams[side];
      if (!t) continue;
      if (t.name !== undefined && !String(t.name).trim()) push(`nama tim ${side} kosong`);
      if (t.seriesScore !== undefined && (!Number.isInteger(t.seriesScore) || t.seriesScore < 0)) {
        push(`skor seri ${side} tidak sah`);
      }
    }
  }
}

function validateDraft(event, ctx, push) {
  if (!['blue', 'red'].includes(event.team)) push('sisi tim tidak sah');
  if (!['ban', 'pick'].includes(event.type)) push('tipe aksi tidak sah');
  if (!event.heroId) push('heroId kosong');
  else if (ctx.heroIds && !ctx.heroIds.has(event.heroId)) push(`hero tidak ada di dataset: ${event.heroId}`);

  const draft = ctx.draft;
  // Pencocokan urutan terhadap cursor internal HANYA bila event akan
  // diterapkan ke state sekarang (mode auto aktif / saat approve semi).
  // Mode monitor tidak menggerakkan cursor — memaksakan urutan di sana akan
  // menolak feed yang valid hanya karena state sengaja tidak ikut bergerak.
  const enforceOrder = ctx.enforceOrder !== false;
  if (draft && enforceOrder) {
    const act = draft.cursor < draft.actions.length ? draft.actions[draft.cursor] : null;
    if (!act) push('draft sudah selesai — aksi provider tidak bisa diterapkan');
    else {
      if (act.team !== event.team || act.type !== event.type) {
        push(`urutan draft tidak cocok (butuh ${act.team}/${act.type}, provider ${event.team}/${event.type})`);
      }
      if (event.heroId && !draft.allowDuplicates && draft.used[event.heroId]) {
        push(`hero duplikat: ${event.heroId}`);
      }
      const picks = draft.entries.filter((e) => e.team === event.team && e.type === 'pick').length;
      if (event.type === 'pick' && picks >= 5) push(`slot pick ${event.team} penuh`);
    }
  } else if (draft && !enforceOrder && event.heroId && !draft.allowDuplicates && draft.used[event.heroId]) {
    // hero yang sudah terpakai di state tetap ditolak walau hanya observasi
    push(`hero duplikat: ${event.heroId}`);
  }
}

function validateScore(event, ctx, push) {
  for (const side of ['blue', 'red']) {
    const s = event.sides?.[side];
    if (!s) continue;
    for (const [k, v] of Object.entries(s)) {
      const range = RANGES[k];
      if (!range) {
        push(`field skor tidak dikenal: ${side}.${k}`);
        continue;
      }
      if (!Number.isFinite(v)) push(`${side}.${k} bukan angka`);
      else if (v < range[0] || v > range[1]) push(`${side}.${k} di luar rentang wajar (${range[0]}-${range[1]})`);
      else if (INT_KEYS.includes(k) && !Number.isInteger(v)) push(`${side}.${k} harus bilangan bulat`);
    }
  }
  if (event.durationMs !== undefined) {
    const [lo, hi] = RANGES.durationMs;
    if (!Number.isFinite(event.durationMs) || event.durationMs < lo || event.durationMs > hi) {
      push('durationMs di luar rentang wajar');
    }
  }
  // deteksi perubahan ekstrem terhadap state terakhir (hati-hati, bukan blokir keras)
  const prev = ctx.score;
  if (prev && !event.noop) {
    for (const side of ['blue', 'red']) {
      const s = event.sides?.[side];
      if (!s || !Number.isFinite(s.kills)) continue;
      const before = Number(prev[side]?.kills);
      if (Number.isFinite(before) && s.kills < before) push(`skor kill ${side} menurun (${before} → ${s.kills})`);
    }
  }
}

function validateFinished(event, ctx, push) {
  if (event.winner !== null && event.winner !== undefined && !['blue', 'red'].includes(event.winner)) {
    push('pemenang tidak sah');
  }
  if (event.durationMs !== undefined) {
    const [lo, hi] = RANGES.durationMs;
    if (!Number.isFinite(event.durationMs) || event.durationMs < lo || event.durationMs > hi) {
      push('durationMs di luar rentang wajar');
    }
  }
  if (event.seriesScore) {
    for (const side of ['blue', 'red']) {
      const v = event.seriesScore[side];
      if (v === undefined) continue;
      if (!Number.isInteger(v) || v < 0 || v > 99) push(`seriesScore.${side} tidak sah`);
    }
  }
}
