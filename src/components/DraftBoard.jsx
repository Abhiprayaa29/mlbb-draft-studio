import React from 'react';
import { BanSlot, PickSlot } from './slots.jsx';
import { cx, sideLabel } from '../lib/utils.js';

function entriesOf(draft, team, type) {
  return (draft.entries || []).filter((e) => e.team === team && e.type === type);
}

/**
 * Papan draft di control panel: 5 pick + 5 ban per sisi,
 * dengan penanda aksi yang sedang berjalan.
 */
export default function DraftBoard({ state, heroesById, meta, onSlotClick }) {
  const draft = state.draft;
  const act = draft.actions[draft.cursor] || null;
  const revealMs = state.overlay?.animMs ?? 600;
  const roster = {
    blue: state.teams.blue.players || [],
    red: state.teams.red.players || []
  };

  const Side = ({ side }) => {
    const picks = entriesOf(draft, side, 'pick');
    const bans = entriesOf(draft, side, 'ban');
    const totalBans = draft.actions.filter((a) => a.team === side && a.type === 'ban').length;
    const isActive = act && act.team === side;

    return (
      <div
        className={cx(
          'panel flex-1 min-w-0',
          side === 'blue' ? 'border-side-blue/40' : 'border-side-red/40'
        )}
      >
        <header
          className="panel-head"
          style={{
            color: side === 'blue' ? '#9fc7ff' : '#ffb0c1',
            borderBottomColor: side === 'blue' ? 'rgba(47,128,255,.4)' : 'rgba(255,45,85,.4)'
          }}
        >
          <span>{sideLabel(side)} Side — {state.teams[side].name || 'Tanpa Nama'}</span>
          <span className="text-[11px] font-sans tracking-normal text-ink-400">
            pick {picks.length}/5 · ban {bans.length}/{totalBans}
          </span>
        </header>

        <div className="p-2.5">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Pick</div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => {
              const e = picks[i];
              const hero = e ? heroesById[e.heroId] : null;
              return (
                <PickSlot
                  key={i}
                  hero={hero}
                  player={roster[side][i]}
                  side={side}
                  locked={e?.locked}
                  revealMs={revealMs}
                  showTier={!!state.overlay?.showTier}
                  tier={hero ? firstTier(meta, hero.id) : null}
                  active={isActive && act.type === 'pick' && picks.length === i}
                  onClick={e ? () => onSlotClick?.(e) : undefined}
                />
              );
            })}
          </div>

          <div className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Ban</div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: Math.max(totalBans, 1) }).map((_, i) => {
              const e = bans[i];
              const hero = e ? heroesById[e.heroId] : null;
              return (
                <BanSlot
                  key={i}
                  hero={hero}
                  side={side}
                  revealMs={revealMs}
                  active={isActive && act.type === 'ban' && bans.length === i}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2.5 lg:flex-row">
      <Side side="blue" />
      <Side side="red" />
    </div>
  );
}

function firstTier(meta, heroId) {
  const t = meta?.heroTier?.[heroId];
  if (!t) return null;
  const order = ['S-Tier', 'A-Tier', 'B-Tier', 'C-Tier'];
  const lanes = Object.values(t);
  return order.find((x) => lanes.includes(x)) || lanes[0] || null;
}

/** Strip urutan aksi: tiap aksi direpresentasikan sebagai satu pil. */
export function ActionStrip({ draft, onJump }) {
  const act = draft.actions[draft.cursor] || null;
  return (
    <div className="thin-scroll flex items-center gap-1 overflow-x-auto pb-1">
      {draft.actions.map((a, idx) => {
        const done = idx < draft.cursor;
        const isNow = idx === draft.cursor;
        const entry = draft.entries.find((e) => e.i === a.i);
        return (
          <button
            key={idx}
            type="button"
            disabled
            title={`Aksi #${idx + 1} · ${sideLabel(a.team)} · ${a.type === 'ban' ? 'Ban' : 'Pick'}`}
            className={cx(
              'flex h-6 min-w-[26px] shrink-0 items-center justify-center rounded-sm border px-1 text-[10px] font-black uppercase transition',
              isNow
                ? 'border-gold bg-gold/20 text-gold shadow-[0_0_10px_rgba(245,196,81,0.45)]'
                : done
                  ? 'border-ink-600 bg-ink-800 text-ink-400'
                  : a.team === 'blue'
                    ? 'border-side-blue/45 bg-side-blue/10 text-[#8dbaff]'
                    : 'border-side-red/45 bg-side-red/10 text-[#ff9db1]'
            )}
          >
            {a.type === 'ban' ? '✕' : '◆'}
            <span className="ml-0.5 opacity-70">{entry ? '✓' : idx + 1}</span>
          </button>
        );
      })}
    </div>
  );
}
