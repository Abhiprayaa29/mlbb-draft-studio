import React, { useMemo, useState } from 'react';
import HeroImage from './HeroImage.jsx';
import { TierBadge } from './slots.jsx';
import { cx, sideLabel } from '../lib/utils.js';
import { tierOf } from '../lib/data.js';
import { TextInput, Btn } from './ui.jsx';

/**
 * Pencarian & pemilihan hero untuk control panel.
 * - filter nama, role, lane
 * - hero terpakai ditandai dan tidak bisa dipilih
 * - lencana tier meta (bila tersedia)
 */
export default function HeroPicker({ heroes, meta, draft, selectedId, onSelect, onDetail, compact = false }) {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [lane, setLane] = useState('');
  const [onlyFree, setOnlyFree] = useState(false);

  const facets = useMemo(() => {
    const roles = new Map();
    const lanes = new Map();
    heroes.forEach((h) => {
      (h.roles || []).forEach((r) => roles.set(r, (roles.get(r) || 0) + 1));
      (h.lanes || []).forEach((l) => lanes.set(l, (lanes.get(l) || 0) + 1));
    });
    return {
      roles: [...roles.entries()].sort((a, b) => b[1] - a[1]),
      lanes: [...lanes.entries()].sort((a, b) => b[1] - a[1])
    };
  }, [heroes]);

  const used = draft?.used || {};
  const act = draft?.actions?.[draft.cursor] || null;

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return heroes.filter((h) => {
      if (ql && !h.name.toLowerCase().includes(ql)) return false;
      if (role && !(h.roles || []).includes(role)) return false;
      if (lane && !(h.lanes || []).includes(lane)) return false;
      if (onlyFree && used[h.id]) return false;
      return true;
    });
  }, [heroes, q, role, lane, onlyFree, used]);

  const toggle = (setter, value) => setter((cur) => (cur === value ? '' : value));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          className="max-w-[240px] flex-1"
          placeholder="Cari hero (mis. Fanny, Arlott)…"
          value={q}
          data-testid="hero-search"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQ('');
          }}
        />
        <Btn size="sm" variant={onlyFree ? 'primary' : ''} onClick={() => setOnlyFree((v) => !v)}>
          {onlyFree ? 'Menyaring: hero bebas' : 'Tampilkan hero bebas saja'}
        </Btn>
        {(q || role || lane || onlyFree) && (
          <Btn size="sm" variant="ghost" onClick={() => { setQ(''); setRole(''); setLane(''); setOnlyFree(false); }}>
            Bersihkan
          </Btn>
        )}
        <span className="ml-auto text-[11px] text-ink-400">
          {list.length} / {heroes.length} hero
        </span>
      </div>

      <div className="thin-scroll mt-2 flex flex-wrap gap-1.5">
        <span className="mr-1 self-center text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Role</span>
        {facets.roles.map(([r, n]) => (
          <button key={r} type="button" className="chip" data-active={role === r} onClick={() => toggle(setRole, r)}>
            {r} <span className="opacity-60">{n}</span>
          </button>
        ))}
      </div>
      <div className="thin-scroll mt-1.5 flex flex-wrap gap-1.5">
        <span className="mr-1 self-center text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Lane</span>
        {facets.lanes.map(([l, n]) => (
          <button key={l} type="button" className="chip" data-active={lane === l} onClick={() => toggle(setLane, l)}>
            {l} <span className="opacity-60">{n}</span>
          </button>
        ))}
      </div>

      {act ? (
        <div className="mt-2 flex items-center gap-2 rounded border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-[12px] text-gold">
          <span className="font-black uppercase tracking-[0.16em]">{act.type === 'ban' ? 'Ban' : 'Pick'}</span>
          <span className="font-semibold text-[#ffe1a3]">{sideLabel(act.team)} Side</span>
          <span className="text-ink-300">— pilih hero untuk aksi #{draft.cursor + 1}</span>
        </div>
      ) : (
        <div className="mt-2 rounded border border-ink-600 bg-ink-900 px-2.5 py-1.5 text-[12px] text-ink-300">
          Draft selesai. Tekan Reset Draft untuk memulai ronde baru.
        </div>
      )}

      <div className="thin-scroll mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {list.length === 0 ? (
          <div className="rounded border border-dashed border-ink-600 p-6 text-center text-[12px] text-ink-400">
            Tidak ada hero yang cocok dengan filter.
          </div>
        ) : (
          <div className={cx('grid gap-1.5', compact ? 'grid-cols-[repeat(auto-fill,minmax(74px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(96px,1fr))]')}>
            {list.map((h) => {
              const usedBy = used[h.id];
              const disabled = !!usedBy;
              const tier = tierOf(meta, h.id);
              const isSel = selectedId === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  data-hero={h.id}
                  disabled={disabled}
                  onClick={() => onSelect(h)}
                  onDoubleClick={() => onDetail?.(h)}
                  title={
                    disabled
                      ? `${h.name} — sudah ${usedBy === 'ban' ? 'di-ban' : 'dipick'}`
                      : `${h.name} — ${h.roles.join(', ')} · ${h.lanes.join(', ')}`
                  }
                  className={cx(
                    'group relative overflow-hidden rounded border text-left transition',
                    disabled
                      ? 'cursor-not-allowed border-ink-700 opacity-35 grayscale'
                      : isSel
                        ? 'border-gold shadow-[0_0_0_2px_rgba(245,196,81,0.35)]'
                        : 'border-ink-600 hover:border-side-blue hover:shadow-[0_0_10px_rgba(47,128,255,0.35)]'
                  )}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-ink-950">
                    <HeroImage hero={h} kind="portrait" className="h-full w-full object-cover object-top" />
                    {tier ? (
                      <span className="absolute left-1 top-1">
                        <TierBadge tier={tier} />
                      </span>
                    ) : null}
                    {disabled ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[9.5px] font-bold uppercase tracking-wider text-side-red">
                        {usedBy === 'ban' ? 'banned' : 'picked'}
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate bg-ink-900 px-1.5 py-1 text-center font-display text-[12.5px] leading-tight tracking-wide text-slate-100">
                    {h.name}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
