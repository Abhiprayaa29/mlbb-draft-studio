import React, { useEffect, useState } from 'react';

/**
 * src/components/TeamLogo.jsx
 * ---------------------------------------------------------------------------
 * Logo tim dengan fallback aman:
 *   - URL/data-URI ditolak bila tidak valid (bukan http/https/data:image).
 *   - Bila gambar gagal dimuat, kotak diganti monogram sisi — bukan ikon
 *     "gambar rusak" yang bisa merusak layout siaran.
 * Warna fallback sisi mengikuti design system broadcast (biru/merah navy-friendly).
 * ---------------------------------------------------------------------------
 */
export function isUsableLogo(src) {
  if (!src || typeof src !== 'string') return false;
  if (src.startsWith('data:image/')) return true;
  // logo yang diunggah operator (nama file dibuat server)
  if (src.startsWith('/assets/') && !src.includes('..') && !src.includes('\\')) return true;
  try {
    const u = new URL(src);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const SIDE_FALLBACK = { blue: '#3a7cb8', red: '#c4484e' };

export default function TeamLogo({ src, side = 'blue', label = '', className = '', style }) {
  const [failed, setFailed] = useState(false);
  const color = SIDE_FALLBACK[side] || SIDE_FALLBACK.blue;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const usable = isUsableLogo(src) && !failed;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'rgba(16,28,44,0.88)',
        border: `2px solid ${color}`,
        ...style
      }}
      title={label || 'Logo tim'}
    >
      {usable ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="font-display tracking-widest" style={{ color, fontSize: 'inherit' }}>
          {(label || (side === 'blue' ? 'BLUE' : 'RED')).slice(0, 4).toUpperCase()}
        </span>
      )}
    </div>
  );
}
