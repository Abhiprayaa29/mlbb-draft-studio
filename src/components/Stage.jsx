import React, { useEffect, useState } from 'react';

/**
 * Panggung tetap 1920×1080 yang diskalakan sesuai viewport.
 * Menjaga tata letak overlay identik berapa pun ukuran Browser Source OBS.
 */
export default function Stage({ children, debug = false }) {
  const [view, setView] = useState({ w: 1920, h: 1080 });

  useEffect(() => {
    const fit = () => setView({ w: window.innerWidth, h: window.innerHeight });
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const scale = Math.min(view.w / 1920, view.h / 1080);
  const left = Math.max(0, (view.w - 1920 * scale) / 2);
  const top = Math.max(0, (view.h - 1080 * scale) / 2);

  return (
    <div className="overlay-root fixed inset-0 overflow-hidden">
      <div
        style={{
          position: 'absolute',
          width: 1920,
          height: 1080,
          left,
          top,
          transform: `scale(${scale})`,
          transformOrigin: 'top left'
        }}
      >
        {children}
      </div>
      {debug ? (
        <div
          style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            fontSize: 11,
            color: '#7f8fbd',
            background: 'rgba(0,0,0,.5)',
            padding: '2px 6px',
            borderRadius: 4
          }}
        >
          1920×1080 · skala {(scale * 100).toFixed(0)}%
        </div>
      ) : null}
    </div>
  );
}
