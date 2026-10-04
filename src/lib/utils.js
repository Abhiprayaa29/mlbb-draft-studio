import { useEffect, useState } from 'react';
import { serverTime, store } from './store.js';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function fmtClock(ms, withTenths = false) {
  const v = Math.max(0, Math.floor(ms));
  const totalSec = Math.floor(v / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (withTenths) {
    const tenth = Math.floor((v % 1000) / 100);
    return `${m}:${String(s).padStart(2, '0')}.${tenth}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
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

export function fmtGold(n) {
  const v = Number(n) || 0;
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
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

/** Hitung mundur berbasis jam server agar tidak drift antar client. */
export function useCountdown(timer) {
  const [remaining, setRemaining] = useState(() =>
    timer ? (timer.running ? Math.max(0, timer.deadlineAt - serverTime()) : timer.remainingMs) : 0
  );

  useEffect(() => {
    if (!timer) return undefined;
    if (!timer.running) {
      setRemaining(timer.remainingMs);
      return undefined;
    }
    let raf = 0;
    const loop = () => {
      setRemaining(Math.max(0, timer.deadlineAt - serverTime()));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [timer?.running, timer?.deadlineAt, timer?.remainingMs]);

  return remaining;
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
