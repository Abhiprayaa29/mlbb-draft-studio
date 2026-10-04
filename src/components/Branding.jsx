import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { isUsableLogo } from './TeamLogo.jsx';
import { enter, useAnimReady } from '../lib/anim.jsx';

/**
 * src/components/Branding.jsx
 * ---------------------------------------------------------------------------
 * Slot branding turnamen/sponsor untuk overlay. Dikendalikan dari panel
 * overlay (`showBranding`, `brandText`, `brandLogo`) sehingga bisa dimatikan
 * saat tidak dibutuhkan agar tampilan tidak padat.
 * ---------------------------------------------------------------------------
 */
export default function Branding({ overlay, style }) {
  const ready = useAnimReady();
  const [broken, setBroken] = useState(false);
  const text = String(overlay.brandText || '').trim();
  const logo = isUsableLogo(overlay.brandLogo) && !broken ? overlay.brandLogo : null;

  if (!overlay.showBranding || (!text && !logo)) return null;

  return (
    <motion.div
      className="absolute flex items-center gap-2.5 rounded-sm px-3 py-1.5"
      initial={enter(ready, { opacity: 0, y: 12 })}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      style={{
        background: 'rgba(7,11,20,0.86)',
        border: '1px solid rgba(245,196,81,0.45)',
        ...style
      }}
    >
      {logo ? (
        <img
          src={logo}
          alt=""
          className="max-h-[30px] max-w-[130px] object-contain"
          onError={() => setBroken(true)}
          referrerPolicy="no-referrer"
        />
      ) : null}
      {text ? (
        <span className="font-display text-[21px] leading-none tracking-[0.18em]" style={{ color: '#f5c451' }}>
          {text}
        </span>
      ) : null}
    </motion.div>
  );
}
