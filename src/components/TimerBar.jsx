import React from 'react';
import { Btn } from './ui.jsx';
import { cx, fmtClock, useCountdown } from '../lib/utils.js';

const DURATIONS = [10, 15, 20, 30, 45, 60];

/** Kontrol countdown: start/pause/reset, durasi, +5 detik. */
export default function TimerBar({ draft, onCmd, compact = false }) {
  const t = draft.timer;
  const remaining = useCountdown(t);
  const danger = remaining <= 5000;
  const critical = remaining <= 3000;

  return (
    <div className={cx('flex flex-wrap items-center gap-2', compact && 'gap-1.5')}>
      <div
        className={cx(
          'relative flex min-w-[104px] items-center justify-center rounded border px-3 py-1.5 font-display tabular-nums',
          critical
            ? 'border-side-red bg-side-red/15 text-[#ff9db1] animate-pulse'
            : danger
              ? 'border-gold bg-gold/12 text-gold'
              : 'border-ink-600 bg-ink-900 text-slate-100'
        )}
        title={t.running ? 'Berjalan' : 'Dijeda'}
      >
        <span className={cx('text-[26px] leading-none', t.running && 'tracking-[0.06em]')}>
          {fmtClock(remaining, true)}
        </span>
      </div>

      <Btn size="sm" variant={t.running ? '' : 'primary'} data-testid="timer-toggle" onClick={() => onCmd('toggle')}>
        {t.running ? 'Jeda' : 'Mulai'}
      </Btn>
      <Btn size="sm" onClick={() => onCmd('reset')}>
        Reset waktu
      </Btn>
      <Btn size="sm" onClick={() => onCmd('add', 5)}>
        +5 dtk
      </Btn>

      {!compact && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Durasi</span>
          {DURATIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={cx(
                'chip',
                t.durationMs === s * 1000 && 'data-[active=true]'
              )}
              data-active={t.durationMs === s * 1000}
              onClick={() => onCmd('setDuration', s * 1000)}
            >
              {s}s
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
