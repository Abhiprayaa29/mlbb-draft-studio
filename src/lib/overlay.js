import { useEffect } from 'react';
import { startSocket } from './socket.js';

/**
 * Menyiapkan halaman overlay: koneksi sebagai 'overlay' dan latar bening
 * agar Browser Source OBS menghasilkan transparansi.
 */
export function useOverlayMode() {
  useEffect(() => {
    startSocket('overlay');
    const prevHtml = document.documentElement.style.background;
    const prevBody = document.body.style.background;
    const prevBodyClass = document.body.className;
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.body.className = `${prevBodyClass} overlay-root`.trim();
    document.body.style.margin = '0';
    return () => {
      document.documentElement.style.background = prevHtml;
      document.body.style.background = prevBody;
      document.body.className = prevBodyClass;
    };
  }, []);
}
