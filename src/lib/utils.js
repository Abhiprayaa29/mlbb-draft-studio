import { useEffect, useState } from 'react';
import { store } from './store.js';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function fmtDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Format gold mentah (integer) → tampilan Indonesia: `k` + koma desimal.
 *   9579 → "9,6k"    10000 → "10k"    10500 → "10,5k"
 *   19000 → "19k"    19500 → "19,5k"   31400 → "31,4k"
 * Nilai < 1000 ditampilkan apa adanya. Null/invalid → "–".
 * Tidak memutasi input.
 */
export function fmtGold(n) {
  if (n == null || n === '') return '–';
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '–';
  if (v < 1000) return String(Math.round(v));
  const k = v / 1000;
  // satu digit desimal, koma sebagai pemisah; .0 → tanpa desimal
  const s = k.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  return `${s}k`;
}

export function fmtDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '-';
  }
}

/** Hook ringan untuk membaca store. */
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force((n) => n + 1)), []);
  return store.getSnapshot();
}

export function sideLabel(side) {
  return side === 'blue' ? 'Blue' : 'Red';
}

export function sideColor(side) {
  return side === 'blue' ? '#2f80ff' : '#ff2d55';
}
