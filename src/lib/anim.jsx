import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * src/lib/anim.jsx
 * ---------------------------------------------------------------------------
 * Gerbang animasi overlay.
 *
 * Overlay sering di-refresh oleh OBS / operator. Bila seluruh elemen "masuk"
 * (mount) setiap kali halaman dibuka, semua animasi reveal akan diputar ulang
 * dan terlihat berlebihan. Gerbang ini menahan animasi masuk sampai state dari
 * server sempat dirender, lalu mengaktifkannya — sehingga:
 *   - refresh / reconnect  -> state tampil tanpa animasi ulang
 *   - pick / ban berikutnya -> animasi reveal tetap berjalan
 * ---------------------------------------------------------------------------
 */
const AnimCtx = createContext(false);

export function useAnimReady() {
  return useContext(AnimCtx);
}

/**
 * @param {boolean} armed  true setelah state pertama dari server dirender
 * @param {number}  delay  jeda (ms) sebelum animasi masuk diaktifkan
 */
export function AnimGate({ armed, delay = 700, children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!armed || ready) return undefined;
    const t = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(t);
  }, [armed, ready, delay]);

  const value = useMemo(() => ready, [ready]);
  return <AnimCtx.Provider value={value}>{children}</AnimCtx.Provider>;
}

/** Variasi `initial` framer-motion: animasi hanya dijalankan bila gerbang terbuka. */
export function enter(ready, variant) {
  return ready ? variant : false;
}
