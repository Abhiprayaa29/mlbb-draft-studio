/**
 * src/lib/broadcast.js
 * ---------------------------------------------------------------------------
 * Design tokens visual broadcast — diselaraskan dengan karakter scoreboard
 * existing (shared/theme.js preset `navy-tournament`):
 *   panel navy · aksen teal · emas terbatas · teks cream · sudut geometris.
 * Dipakai overlay & komponen bersama agar identitas visual seragam tanpa
 * menduplikasi hex di banyak berkas.
 * ---------------------------------------------------------------------------
 */
import { PALETTE, defaultTheme, withAlpha } from '../../shared/theme.js';

/** Pasangan warna sisi (sama seperti scoreboard: teamA = blue, teamB = red). */
export function themeOf(state) {
  return state?.overlay?.theme || defaultTheme();
}

export function colorsOf(theme) {
  const t = theme.colors || defaultTheme().colors;
  return { ...defaultTheme().colors, ...t };
}

/** Token visual tetap (di luar tema operator) — karakter broadcast. */
export const BC = {
  /** Latar panel utama (navy transparan, menyerupai scoreboard). */
  panel: withAlpha(PALETTE.primaryNavy, 0.92),
  panelDeep: 'rgba(16, 28, 44, 0.94)',
  /** Slot kosong / garis tipis netral (cream redup). */
  slot: 'rgba(243, 239, 224, 0.12)',
  slotStrong: 'rgba(243, 239, 224, 0.22)',
  /** Merah tua untuk ban/peringatan — bukan neon. */
  red: '#c4484e',
  /** Biru navy-friendly untuk fallback sisi biru di luar tema. */
  blue: '#3a7cb8',
  /** Status selesai / positif (sejajar mint timer scoreboard). */
  ok: '#3d9b7a',
  gold: PALETTE.gold,
  teal: PALETTE.teal,
  cream: PALETTE.cream,
  navy: PALETTE.primaryNavy,
  /** Ketebalan garis aksen (seragam dengan --sc-border-px default ~4px, dipakai 2–3). */
  border: 2,
  /** Bayangan lembut (bukan glow neon). */
  shadow: '0 10px 34px rgba(0, 0, 0, 0.38)',
  /** Klip geometris sudut kanan-bawah (meniru kartu lineup scoreboard). */
  clipCard: 'polygon(0 0, 100% 0, 100% 88%, 93% 100%, 0 100%)',
  clipChip: 'polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%)'
};
