import React, { useState } from 'react';

/** SVG placeholder yang dipakai bila file aset hero tidak ditemukan. */
function fallbackSvg(label = '?', color = '#1b2440') {
  const text = String(label)
    .slice(0, 2)
    .toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect width="240" height="240" fill="${color}"/>
  <rect x="6" y="6" width="228" height="228" fill="none" stroke="#31406b" stroke-width="3"/>
  <text x="120" y="136" fill="#7f8fbd" font-family="Arial, sans-serif" font-size="76"
        font-weight="700" text-anchor="middle">${text}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Gambar hero dengan fallback otomatis.
 * @param {'portrait'|'avatar'|'splash'} kind
 */
export default function HeroImage({ hero, kind = 'portrait', alt, className, style, loading = 'lazy' }) {
  const [errored, setErrored] = useState(false);
  const name = hero?.name || alt || '';
  const src = errored ? fallbackSvg(name) : hero?.assets?.[kind] || fallbackSvg(name);
  return (
    <img
      src={src}
      alt={alt || name}
      className={className}
      style={style}
      loading={loading}
      draggable={false}
      onError={() => setErrored(true)}
    />
  );
}

export { fallbackSvg };
