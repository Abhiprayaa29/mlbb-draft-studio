import React from 'react';
import { ScoreboardView } from '../pages/OverlayScore.jsx';

/**
 * src/components/ScorePreview.jsx
 * ---------------------------------------------------------------------------
 * Preview scoreboard 16:9 di halaman kontrol. Memakai komponen yang SAMA
 * dengan overlay siaran (ScoreboardView) lalu diskalakan 1920×1080 → lebar
 * kotak preview, sehingga preview selalu identik dengan hasil OBS.
 * Latar kotak memakai papan catur agar transparansi terlihat jelas.
 * ---------------------------------------------------------------------------
 */
export default function ScorePreview({ state, heroesById = {}, meta = null, width = 620 }) {
  const height = Math.round((width * 1080) / 1920);
  const scale = width / 1920;

  return (
    <div
      data-testid="score-preview"
      className="relative overflow-hidden rounded border border-ink-600"
      style={{
        width,
        height,
        boxSizing: 'content-box',
        backgroundImage: 'repeating-conic-gradient(#171b23 0% 25%, #1d222c 0% 50%)',
        backgroundSize: '18px 18px'
      }}
      title="Preview scoreboard (latar transparan)"
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1920,
          height: 1080,
          transform: `scale(${scale})`,
          transformOrigin: 'top left'
        }}
      >
        <ScoreboardView state={state} heroesById={heroesById} meta={meta} />
      </div>
      <span className="absolute bottom-1 right-1.5 text-[9px] uppercase tracking-widest text-ink-400">
        preview 1920×1080 · {Math.round(scale * 100)}%
      </span>
    </div>
  );
}

/** Badge status penyimpanan konfigurasi. */
export function SaveBadge({ status }) {
  const map = {
    clean: { text: 'Konfigurasi tersimpan', cls: 'border-mint/50 bg-mint/10 text-mint' },
    dirty: { text: 'Perubahan belum disimpan', cls: 'border-gold/60 bg-gold/10 text-gold' },
    saving: { text: 'Menyimpan…', cls: 'border-ink-500 bg-ink-800 text-ink-200' },
    error: { text: 'Gagal menyimpan', cls: 'border-side-red/60 bg-side-red/15 text-[#ff8fa5]' }
  };
  const s = map[status] || map.clean;
  return (
    <span data-testid="theme-save-status" className={`${s.cls} rounded border px-2 py-1 text-[11px] font-semibold`}>
      {s.text}
    </span>
  );
}
