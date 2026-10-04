import React, { useEffect, useRef, useState } from 'react';
import { cx } from '../lib/utils.js';

export function Panel({ title, right, children, className, bodyClass }) {
  return (
    <section className={cx('panel', className)}>
      {title ? (
        <header className="panel-head">
          <span>{title}</span>
          {right}
        </header>
      ) : null}
      <div className={cx('p-3', bodyClass)}>{children}</div>
    </section>
  );
}

export function Btn({ variant = '', size = '', className, children, ...rest }) {
  return (
    <button
      type="button"
      className={cx('btn', variant && `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-300">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-0.5 block text-[10.5px] text-ink-400">{hint}</span> : null}
    </label>
  );
}

export function TextInput({ className, ...rest }) {
  return <input className={cx('inp', className)} {...rest} />;
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cx(
        'flex w-full items-center justify-between gap-3 rounded border px-2.5 py-2 text-left transition',
        checked
          ? 'border-side-blue/60 bg-side-blue/12'
          : 'border-ink-600 bg-ink-900 hover:border-ink-500'
      )}
    >
      <span>
        <span className="block text-[12px] font-semibold text-slate-100">{label}</span>
        {description ? <span className="block text-[10.5px] text-ink-400">{description}</span> : null}
      </span>
      <span
        className={cx(
          'relative h-4 w-8 shrink-0 rounded-full transition',
          checked ? 'bg-side-blue' : 'bg-ink-600'
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all',
            checked ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </span>
    </button>
  );
}

export function Tabs({ tabs, active, onChange, className }) {
  return (
    <div className={cx('flex flex-wrap gap-1 border-b border-ink-700 bg-ink-900/60 p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cx(
            'flex-1 rounded px-2 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.1em] transition',
            active === t.id
              ? 'bg-ink-700 text-white shadow-[inset_0_-2px_0_0_var(--color-gold)]'
              : 'text-ink-300 hover:bg-ink-800 hover:text-slate-200'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 'max-w-2xl' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={cx('panel w-full fade-in', width)}>
        <header className="panel-head">
          <span>{title}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose}>
            Tutup
          </button>
        </header>
        <div className="thin-scroll max-h-[80vh] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/** Tombol yang mewajibkan konfirmasi sebelum menjalankan aksi destruktif. */
export function ConfirmBtn({ children, confirmText = 'Yakin?', onConfirm, variant = 'danger', ...rest }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const click = () => {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 3000);
      return;
    }
    clearTimeout(timer.current);
    setArmed(false);
    onConfirm?.();
  };

  return (
    <Btn variant={armed ? variant : ''} onClick={click} {...rest}>
      {armed ? confirmText : children}
    </Btn>
  );
}

export function Notice({ notice }) {
  if (!notice) return null;
  const kind = notice.kind || 'info';
  const color =
    kind === 'warn'
      ? 'border-gold/60 bg-gold/15 text-gold'
      : kind === 'error'
        ? 'border-side-red/60 bg-side-red/15 text-[#ff8fa5]'
        : 'border-mint/50 bg-mint/12 text-mint';
  return (
    <div className={cx('pointer-events-none fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded border px-4 py-2 text-[13px] font-semibold shadow-lg fade-in', color)}>
      {notice.msg}
    </div>
  );
}
