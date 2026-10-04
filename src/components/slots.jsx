import React from 'react';
import HeroImage from './HeroImage.jsx';
import { cx } from '../lib/utils.js';

const TIER_COLOR = {
  'S-Tier': '#f5c451',
  'A-Tier': '#35d399',
  'B-Tier': '#2f80ff',
  'C-Tier': '#8b9ac0'
};

export function TierBadge({ tier, className }) {
  if (!tier) return null;
  return (
    <span
      className={cx('rounded-sm px-1 py-px text-[9px] font-black uppercase tracking-wider', className)}
      style={{
        color: '#0a0f1a',
        background: TIER_COLOR[tier] || '#8b9ac0',
        boxShadow: `0 0 8px ${(TIER_COLOR[tier] || '#8b9ac0')}66`
      }}
    >
      {tier.replace('-Tier', '')}
    </span>
  );
}

/** Slot pick: portrait hero + nama hero + nickname pemain. */
export function PickSlot({
  hero,
  player,
  side,
  active = false,
  locked = false,
  revealMs = 600,
  showPlayer = true,
  showTier = false,
  tier,
  size = 'md',
  onClick
}) {
  return (
    <div
      className={cx(
        'slot flex flex-col',
        side === 'blue' ? 'slot-blue' : 'slot-red',
        !hero && 'slot-empty',
        active && 'turn-active',
        onClick && 'cursor-pointer'
      )}
      style={{ '--anim-ms': `${revealMs}ms` }}
      onClick={onClick}
      title={hero ? hero.name : 'Slot kosong'}
    >
      <div className={cx('relative w-full overflow-hidden bg-ink-950', size === 'lg' ? 'h-[120px]' : size === 'sm' ? 'h-[64px]' : 'h-[96px]')}>
        {hero ? (
          <HeroImage
            hero={hero}
            kind="portrait"
            className="hero-reveal h-full w-full object-cover object-top"
            loading="eager"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.18em] text-ink-500">
            kosong
          </div>
        )}
        {locked ? (
          <span className="absolute right-1 top-1 rounded-sm bg-black/75 px-1 text-[9px] font-bold uppercase tracking-wider text-gold">
            lock
          </span>
        ) : null}
        {tier && showTier ? (
          <span className="absolute left-1 top-1">
            <TierBadge tier={tier} />
          </span>
        ) : null}
      </div>
      <div
        className={cx(
          'flex flex-1 flex-col justify-center border-t px-1 text-center',
          side === 'blue' ? 'border-side-blue/40 bg-[#0b1b33]' : 'border-side-red/40 bg-[#280b15]'
        )}
      >
        <div className="truncate font-display text-[13px] leading-none tracking-wide text-white">
          {hero ? hero.name : '—'}
        </div>
        {showPlayer ? (
          <div className="truncate text-[10px] leading-tight text-ink-300">{player || '\u00A0'}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Slot ban: desaturasi + silang merah. */
export function BanSlot({ hero, side, active = false, revealMs = 600, size = 'sm' }) {
  const dims = size === 'md' ? 'h-16 w-16' : 'h-12 w-12';
  return (
    <div
      className={cx(
        'slot ban-mark',
        side === 'blue' ? 'slot-blue' : 'slot-red',
        !hero && 'slot-empty',
        active && 'turn-active'
      )}
      style={{ '--anim-ms': `${revealMs}ms` }}
      title={hero ? `Ban: ${hero.name}` : 'Slot ban kosong'}
    >
      <div className={cx('relative w-full overflow-hidden', dims)}>
        {hero ? (
          <HeroImage hero={hero} kind="portrait" className="h-full w-full object-cover object-top opacity-45 grayscale" />
        ) : null}
      </div>
    </div>
  );
}
