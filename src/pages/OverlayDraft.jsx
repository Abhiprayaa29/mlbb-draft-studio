import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import Stage from '../components/Stage.jsx';
import HeroImage from '../components/HeroImage.jsx';
import TeamLogo from '../components/TeamLogo.jsx';
import Branding from '../components/Branding.jsx';
import { useOverlayMode } from '../lib/overlay.js';
import { useStore, cx, sideLabel } from '../lib/utils.js';
import { loadHeroes, loadMeta } from '../lib/data.js';
import { AnimGate, enter, useAnimReady } from '../lib/anim.jsx';
import { BC } from '../lib/broadcast.js';

/**
 * Identitas visual draft diselaraskan dengan scoreboard existing
 * (navy panel · aksen teal · emas terbatas · teks cream · sudut geometris).
 * Sisi tim tetap biru/merah sebagai pembeda fungsional, tetapi nada warnanya
 * mengikuti design system broadcast — bukan neon terang.
 */
const BLUE = BC.blue;
const RED = BC.red;
const GOLD = BC.gold;
const PANEL = BC.panel;
const TEAL = BC.teal;
const CREAM = BC.cream;
const SLOT = BC.slot;
const SLOT_STRONG = BC.slotStrong;
const OK = BC.ok;

const entriesOf = (draft, team, type) => (draft.entries || []).filter((e) => e.team === team && e.type === type);

/* ------------------------------------------------------------------ potongan */

function TeamBadge({ state, side, align = 'left', active = false }) {
  const t = state.teams[side];
  const color = side === 'blue' ? BLUE : RED;
  const done = entriesOf(state.draft, side, 'pick').length;
  const ready = useAnimReady();

  const logo = (
    <TeamLogo
      src={state.overlay.showLogos ? t.logo : null}
      side={side}
      label={t.name || (side === 'blue' ? 'BLU' : 'RED')}
      className="h-[64px] w-[64px] shrink-0"
      style={{
        border: `2px solid ${active ? TEAL : color}`,
        background: 'rgba(16,28,44,0.8)',
        transition: 'border-color .25s ease',
        fontSize: 13
      }}
    />
  );

  const name = (
    <div className="min-w-0" style={{ textAlign: align === 'right' ? 'right' : 'left' }}>
      <div
        className="truncate font-display text-[38px] leading-none tracking-[0.06em]"
        style={{ color: CREAM, textShadow: active ? `0 2px 12px rgba(0,0,0,0.55)` : 'none' }}
      >
        {state.overlay.showLogos ? t.name || sideLabel(side) : sideLabel(side)}
      </div>
      <div className="text-[15px] font-semibold uppercase tracking-[0.24em]" style={{ color: active ? TEAL : color }}>
        {sideLabel(side)} SIDE · {done}/5 PICK
      </div>
    </div>
  );

  const score = (
    <div className="shrink-0 font-display text-[64px] leading-none" style={{ color: GOLD }}>
      {t.score}
    </div>
  );

  return (
    <motion.div
      className="flex h-full items-center gap-4"
      initial={enter(ready, { opacity: 0, y: -24 })}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        paddingLeft: 30,
        paddingRight: 30,
        background: `linear-gradient(${align === 'right' ? '270deg' : '90deg'}, ${color}28 0%, transparent 78%)`,
        borderBottom: `2px solid ${active ? TEAL : color}`,
        transition: 'border-color .25s ease'
      }}
    >
      {align === 'left' ? (
        <>
          {logo}
          {name}
          <div style={{ flex: 1 }} />
          {score}
        </>
      ) : (
        <>
          {score}
          <div style={{ flex: 1 }} />
          {name}
          {logo}
        </>
      )}
    </motion.div>
  );
}

function OverlayPick({ hero, player, side, active, revealMs, showPlayer, showTier, tier }) {
  const color = side === 'blue' ? BLUE : RED;
  const anim = Math.max(120, revealMs);
  const ready = useAnimReady();
  return (
    <div
      className={cx('relative overflow-hidden', active && 'turn-active')}
      style={{
        width: 126,
        height: 158,
        background: 'rgba(16,28,44,0.9)',
        border: `2px solid ${active ? TEAL : hero ? color : SLOT_STRONG}`,
        clipPath: BC.clipCard,
        boxShadow: hero || active ? BC.shadow : 'none',
        '--anim-ms': `${anim}ms`,
        transition: 'border-color .25s ease, box-shadow .25s ease'
      }}
    >
      <AnimatePresence mode="wait">
        {hero ? (
          <motion.div
            key={hero.id}
            initial={enter(ready, { opacity: 0, scale: 1.35, filter: 'brightness(2.6) saturate(0.2)' })}
            animate={{ opacity: 1, scale: 1, filter: 'brightness(1) saturate(1)' }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: anim / 1000, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
          >
            <HeroImage hero={hero} kind="portrait" className="h-[118px] w-full object-cover object-top" loading="eager" />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!hero ? (
        <div className="flex h-[118px] items-center justify-center text-[11px] uppercase tracking-[0.24em]" style={{ color: SLOT }}>
          slot
        </div>
      ) : null}

      {showTier && tier ? (
        <span
          className="absolute left-1 top-1 px-1 text-[11px] font-black"
          style={{ background: GOLD, color: '#0a0f1a' }}
        >
          {tier.replace('-Tier', '')}
        </span>
      ) : null}

      <div
        className="absolute bottom-0 left-0 right-0 px-1 py-1 text-center"
        style={{
          background: side === 'blue' ? 'rgba(24,52,82,0.94)' : 'rgba(66,24,34,0.94)',
          borderTop: `1px solid ${color}88`,
          height: 40
        }}
      >
        <div className="truncate font-display text-[17px] leading-[18px] tracking-wide" style={{ color: CREAM }}>
          {hero ? hero.name : '—'}
        </div>
        {showPlayer ? (
          <div className="truncate text-[11.5px] leading-[14px] text-white/70">{player || ' '}</div>
        ) : null}
      </div>
    </div>
  );
}

function OverlayBan({ hero, side, revealMs }) {
  const anim = Math.max(120, revealMs);
  const color = side === 'blue' ? BLUE : RED;
  const ready = useAnimReady();
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: 64,
        height: 64,
        background: 'rgba(16,28,44,0.9)',
        border: `2px solid ${hero ? color : SLOT_STRONG}`,
        clipPath: BC.clipChip,
        '--anim-ms': `${anim}ms`
      }}
    >
      <AnimatePresence mode="wait">
        {hero ? (
          <motion.div
            key={hero.id}
            initial={enter(ready, { opacity: 0, scale: 1.3 })}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: anim / 1000, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
          >
            <HeroImage hero={hero} kind="portrait" className="h-full w-full object-cover object-top opacity-40 grayscale" />
          </motion.div>
        ) : null}
      </AnimatePresence>
      {hero ? (
        <motion.svg
          viewBox="0 0 64 64"
          className="absolute inset-0 h-full w-full"
          initial={enter(ready, { opacity: 0, scale: 1.5 })}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: Math.max(0.15, anim / 1400), ease: [0.16, 1, 0.3, 1] }}
        >
          <line x1="6" y1="6" x2="58" y2="58" stroke={RED} strokeWidth="4" strokeLinecap="round" />
          <line x1="58" y1="6" x2="6" y2="58" stroke={RED} strokeWidth="4" strokeLinecap="round" />
        </motion.svg>
      ) : null}
    </div>
  );
}

function PhaseCore({ state, heroesById, meta }) {
  const draft = state.draft;
  const act = draft.actions[draft.cursor] || null;
  const last = draft.entries[draft.entries.length - 1];
  const lastHero = last ? heroesById[last.heroId] : null;
  const phaseLabel = act ? (act.type === 'ban' ? 'FASE BAN' : 'FASE PICK') : 'DRAFT SELESAI';
  const phaseColor = act ? (act.type === 'ban' ? RED : TEAL) : OK;
  const anim = Math.max(150, state.overlay.animMs || 600);
  const ready = useAnimReady();

  return (
    <div className="flex flex-col items-center" style={{ width: 760 }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={phaseLabel + (act?.team || '')}
          initial={enter(ready, { opacity: 0, y: -18, filter: 'blur(6px)' })}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
          transition={{ duration: anim / 1000, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center"
        >
          <div
            className="font-display text-[46px] leading-none tracking-[0.22em]"
            style={{ color: phaseColor, textShadow: '0 2px 14px rgba(0,0,0,0.45)' }}
          >
            {phaseLabel}
          </div>
          {act ? (
            <div
              className="mt-1.5 px-5 py-1 font-display text-[26px] tracking-[0.18em]"
              style={{
                background: act.team === 'blue' ? `${BLUE}28` : `${RED}28`,
                border: `1px solid ${act.team === 'blue' ? BLUE : RED}`,
                color: CREAM,
                clipPath: BC.clipChip
              }}
            >
              {sideLabel(act.team).toUpperCase()} SIDE
            </div>
          ) : (
            <div className="mt-1.5 text-[17px] uppercase tracking-[0.3em] text-white/60">Menunggu reset</div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* aksi terakhir */}
      <div style={{ width: 660, marginTop: 22, minHeight: 62 }}>
        <AnimatePresence mode="wait">
          {last && lastHero ? (
            <motion.div
              key={`${last.phaseIndex}-${last.heroId}`}
              initial={enter(ready, { opacity: 0, scale: 1.08 })}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: anim / 1000, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-4 px-4 py-2.5"
              style={{ background: PANEL, border: `1px solid ${TEAL}55`, clipPath: BC.clipChip, boxShadow: BC.shadow }}
            >
              <div
                className="flex h-[62px] w-[62px] shrink-0 items-center justify-center overflow-hidden"
                style={{ border: `2px solid ${last.type === 'ban' ? RED : last.team === 'blue' ? BLUE : RED}` }}
              >
                <HeroImage hero={lastHero} kind="portrait" className="h-full w-full object-cover object-top" loading="eager" />
              </div>
              <div className="min-w-0">
                <div className="font-display text-[26px] leading-none tracking-[0.1em]" style={{ color: last.type === 'ban' ? RED : TEAL }}>
                  {last.team === 'blue' ? 'BLUE' : 'RED'} {last.type === 'ban' ? 'BAN' : 'PICK'}
                </div>
                <div className="truncate font-display text-[30px] leading-tight" style={{ color: CREAM }}>{lastHero.name}</div>
              </div>
              <div className="ml-auto text-right text-[13px] uppercase tracking-[0.18em] text-white/50">
                Aksi #{draft.entries.length}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="px-4 py-3 text-center text-[15px] uppercase tracking-[0.3em] text-white/45"
              style={{ background: PANEL, border: `1px dashed ${SLOT_STRONG}` }}
            >
              Belum ada aksi
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Announce({ announce, animMs }) {
  const ready = useAnimReady();
  if (!announce) return null;
  const color = announce.type === 'winner' ? GOLD : announce.type === 'mvp' ? OK : TEAL;
  return (
    <AnimatePresence>
      <motion.div
        key={announce.at}
        initial={enter(ready, { opacity: 0, y: 60, scale: 0.96 })}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ duration: Math.max(0.2, (animMs || 600) / 1000), ease: [0.16, 1, 0.3, 1] }}
        className="absolute"
        style={{
          left: '50%',
          bottom: 132,
          transform: 'translateX(-50%)',
          width: 1040
        }}
      >
        <div
          className="flex items-center gap-5 px-8 py-4"
          style={{
            background: 'linear-gradient(90deg, rgba(16,28,44,0.2) 0%, rgba(16,28,44,0.95) 12%, rgba(16,28,44,0.95) 88%, rgba(16,28,44,0.2) 100%)',
            borderTop: `2px solid ${color}`,
            borderBottom: `2px solid ${color}`
          }}
        >
          <span className="font-display text-[22px] tracking-[0.34em]" style={{ color }}>
            {announce.type === 'mvp' ? 'MVP' : announce.type === 'winner' ? 'WINNER' : 'INFO'}
          </span>
          <span className="truncate font-display text-[40px] leading-none tracking-wide" style={{ color: CREAM }}>{announce.text}</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ layouts */

function FullLayout({ state, heroesById, meta }) {
  const draft = state.draft;
  const revealMs = state.overlay.animMs || 600;
  const showPlayer = state.overlay.showPlayerNames;
  const showTier = state.overlay.showTier;
  const act = draft.actions[draft.cursor] || null;

  const Column = ({ side }) => {
    const picks = entriesOf(draft, side, 'pick');
    const color = side === 'blue' ? BLUE : RED;
    return (
      <div
        className="absolute flex flex-col gap-[10px]"
        style={side === 'blue' ? { left: 30, top: 124 } : { right: 30, top: 124 }}
      >
        {Array.from({ length: 5 }).map((_, i) => {
          const e = picks[i];
          const hero = e ? heroesById[e.heroId] : null;
          const tier = hero ? firstTier(meta, hero.id) : null;
          return (
            <OverlayPick
              key={i}
              hero={hero}
              player={(state.teams[side].players || [])[i]}
              side={side}
              active={!!act && act.team === side && act.type === 'pick' && picks.length === i}
              revealMs={revealMs}
              showPlayer={showPlayer}
              showTier={showTier}
              tier={tier}
            />
          );
        })}
      </div>
    );
  };

  const bans = (side) => {
    const list = entriesOf(draft, side, 'ban');
    const total = draft.actions.filter((a) => a.team === side && a.type === 'ban').length;
    return Array.from({ length: Math.max(total, 1) }).map((_, i) => {
      const e = list[i];
      return <OverlayBan key={i} hero={e ? heroesById[e.heroId] : null} side={side} revealMs={revealMs} />;
    });
  };

  return (
    <>
      {/* header */}
      <div className="absolute left-0 top-0 flex h-[110px] w-full" style={{ background: PANEL, borderBottom: `2px solid ${TEAL}66` }}>
        <div style={{ width: 620 }}>
          <TeamBadge state={state} side="blue" align="left" active={!!act && act.team === 'blue'} />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="truncate font-display text-[34px] leading-none tracking-[0.14em]" style={{ color: GOLD }}>
            {state.meta.tournament || 'MLBB TOURNAMENT'}
          </div>
          <div className="mt-1 text-[15px] uppercase tracking-[0.3em]" style={{ color: 'rgba(243,239,224,0.6)' }}>
            {[state.meta.round, `GAME ${state.meta.gameNumber}`, `BO${state.meta.bestOf}`].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ width: 620 }}>
          <TeamBadge state={state} side="red" align="right" active={!!act && act.team === 'red'} />
        </div>
      </div>

      <Column side="blue" />
      <Column side="red" />

      {/* tengah */}
      <div className="absolute" style={{ left: 960 - 380, top: 150 }}>
        <PhaseCore state={state} heroesById={heroesById} meta={meta} />
      </div>

      {/* bar bawah: ban + nama tim */}
      <div
        className="absolute bottom-0 left-0 flex h-[112px] w-full items-center"
        style={{ background: PANEL, borderTop: `2px solid ${TEAL}66` }}
      >
        <div className="flex flex-1 items-center gap-4 pl-[30px]">
          <span className="font-display text-[24px] tracking-[0.2em]" style={{ color: BLUE }}>
            BAN
          </span>
          <div className="flex gap-2">{bans('blue')}</div>
        </div>

        <div className="flex flex-col items-center px-6">
          <div className="font-display text-[26px] tracking-[0.18em]" style={{ color: CREAM }}>
            {state.matchName || 'MLBB DRAFT'}
          </div>
          <div className="text-[13px] uppercase tracking-[0.26em] text-white/45">
            {state.teams.blue.name || 'Blue'} vs {state.teams.red.name || 'Red'}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-4 pr-[30px]">
          <div className="flex gap-2">{bans('red')}</div>
          <span className="font-display text-[24px] tracking-[0.2em]" style={{ color: RED }}>
            BAN
          </span>
        </div>
      </div>

      <Branding overlay={state.overlay} style={{ right: 30, bottom: 124 }} />
      <Announce announce={state.overlay.announce} animMs={revealMs} />
    </>
  );
}

function CompactLayout({ state, heroesById, meta }) {
  const draft = state.draft;
  const revealMs = state.overlay.animMs || 600;
  const act = draft.actions[draft.cursor] || null;
  const ready = useAnimReady();

  const Row = ({ side }) => {
    const picks = entriesOf(draft, side, 'pick');
    const bans = entriesOf(draft, side, 'ban');
    const color = side === 'blue' ? BLUE : RED;
    return (
      <div className="flex items-center gap-3" style={{ flexDirection: side === 'blue' ? 'row' : 'row-reverse' }}>
        <div className="flex h-[54px] w-[190px] items-center gap-2 px-3" style={{ background: `${color}28`, borderRight: side === 'blue' ? `2px solid ${color}` : 'none', borderLeft: side === 'red' ? `2px solid ${color}` : 'none' }}>
          {state.overlay.showLogos ? (
            <TeamLogo
              src={state.teams[side].logo}
              side={side}
              label={state.teams[side].name || undefined}
              className="h-9 w-9 shrink-0"
              style={{ border: `1.5px solid ${color}`, background: 'rgba(16,28,44,0.8)', fontSize: 11 }}
            />
          ) : null}
          <div className="min-w-0 flex-1" style={{ textAlign: side === 'blue' ? 'left' : 'right' }}>
            <div className="truncate font-display text-[24px] leading-none" style={{ color: CREAM }}>{state.teams[side].name}</div>
            <div className="text-[11px] tracking-[0.2em]" style={{ color }}>
              {sideLabel(side).toUpperCase()}
            </div>
          </div>
          <div className="font-display text-[34px] leading-none" style={{ color: GOLD }}>
            {state.teams[side].score}
          </div>
        </div>

        <div className="flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => {
            const hero = picks[i] ? heroesById[picks[i].heroId] : null;
            return (
              <div
                key={i}
                className="relative h-[54px] w-[46px] overflow-hidden"
                style={{
                  border: `1.5px solid ${hero ? color : SLOT_STRONG}`,
                  background: 'rgba(16,28,44,0.9)',
                  clipPath: BC.clipChip,
                  '--anim-ms': `${revealMs}ms`
                }}
              >
                {hero ? (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={hero.id}
                      initial={enter(ready, { opacity: 0, scale: 1.3 })}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: revealMs / 1000, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0"
                    >
                      <HeroImage hero={hero} kind="portrait" className="h-full w-full object-cover object-top" />
                    </motion.div>
                  </AnimatePresence>
                ) : null}
                {state.overlay.showPlayerNames && hero ? (
                  <span
                    className="absolute bottom-0 left-0 right-0 truncate px-0.5 text-center text-[9.5px]"
                    style={{ background: 'rgba(0,0,0,.75)', color: CREAM }}
                  >
                    {(state.teams[side].players || [])[i] || ''}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex gap-1">
          {bans.map((e, i) => (
            <OverlayBanSmall key={i} hero={heroesById[e.heroId]} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="absolute left-0 top-0 flex h-[86px] w-full flex-col justify-center gap-1.5 px-4" style={{ background: PANEL, borderBottom: `2px solid ${TEAL}66` }}>
        <div className="flex items-center justify-between gap-4">
          <Row side="blue" />
          <div className="flex flex-col items-center">
            <div className="font-display text-[20px] leading-none tracking-[0.2em]" style={{ color: act ? (act.type === 'ban' ? RED : TEAL) : OK }}>
              {act ? (act.type === 'ban' ? 'BAN' : 'PICK') : 'SELESAI'}
            </div>
            <div className="text-[11px] tracking-[0.16em] text-white/50">
              {act ? `${sideLabel(act.team).toUpperCase()} · ${draft.cursor + 1}/${draft.actions.length}` : ''}
            </div>
          </div>
          <Row side="red" />
        </div>
        <div className="truncate text-center text-[13px] uppercase tracking-[0.24em] text-white/55">
          {state.meta.tournament || state.matchName}
          {state.meta.tournament && state.matchName ? ' · ' : ''}
          {state.matchName && state.meta.tournament ? `GAME ${state.meta.gameNumber}` : `GAME ${state.meta.gameNumber}`}
        </div>
      </div>
      <Branding overlay={state.overlay} style={{ right: 16, top: 94 }} />
      <Announce announce={state.overlay.announce} animMs={revealMs} />
    </>
  );
}

function OverlayBanSmall({ hero }) {
  const ready = useAnimReady();
  return (
    <div className="relative h-[46px] w-[46px] overflow-hidden" style={{ background: 'rgba(16,28,44,0.9)', border: `1.5px solid ${hero ? RED : SLOT_STRONG}`, clipPath: BC.clipChip }}>
      {hero ? (
        <HeroImage hero={hero} kind="portrait" className="h-full w-full object-cover object-top opacity-40 grayscale" />
      ) : null}
      {hero ? (
        <motion.svg
          viewBox="0 0 46 46"
          className="absolute inset-0 h-full w-full"
          initial={enter(ready, { opacity: 0, scale: 1.5 })}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <line x1="5" y1="5" x2="41" y2="41" stroke={RED} strokeWidth="3" />
          <line x1="41" y1="5" x2="5" y2="41" stroke={RED} strokeWidth="3" />
        </motion.svg>
      ) : null}
    </div>
  );
}

function LineupLayout({ state, heroesById, meta }) {
  const revealMs = Math.max(200, state.overlay.animMs || 600);
  const ready = useAnimReady();
  const Team = ({ side }) => {
    const picks = entriesOf(state.draft, side, 'pick');
    const color = side === 'blue' ? BLUE : RED;
    return (
      <div className="flex flex-col items-center" style={{ width: 740 }}>
        <div
          className="mb-4 w-full py-2 text-center font-display text-[34px] tracking-[0.2em]"
          style={{ background: `${color}28`, borderBottom: `2px solid ${color}`, color: CREAM }}
        >
          {state.teams[side].name || sideLabel(side)}
        </div>
        <div className="flex gap-2.5">
          {Array.from({ length: 5 }).map((_, i) => {
            const e = picks[i];
            const hero = e ? heroesById[e.heroId] : null;
            return (
              <motion.div
                key={i}
                initial={enter(ready, { opacity: 0, y: 40, scale: 0.9 })}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: (i * revealMs) / 2000, duration: revealMs / 1000, ease: [0.16, 1, 0.3, 1] }}
                className="relative overflow-hidden"
                style={{
                  width: 140,
                  height: 296,
                  background: 'rgba(16,28,44,0.9)',
                  border: `2px solid ${hero ? color : SLOT_STRONG}`,
                  clipPath: BC.clipCard,
                  boxShadow: hero ? BC.shadow : 'none'
                }}
              >
                {hero ? (
                  <HeroImage hero={hero} kind="portrait" className="h-[244px] w-full object-cover object-top" loading="eager" />
                ) : (
                  <div className="flex h-[244px] items-center justify-center text-[11px] uppercase tracking-[0.2em]" style={{ color: SLOT }}>
                    kosong
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 px-1 py-1 text-center" style={{ background: side === 'blue' ? 'rgba(24,52,82,0.94)' : 'rgba(66,24,34,0.94)' }}>
                  <div className="truncate font-display text-[21px] leading-[23px]" style={{ color: CREAM }}>{hero ? hero.name : '—'}</div>
                  {state.overlay.showPlayerNames ? (
                    <div className="truncate text-[12.5px] text-white/70">{(state.teams[side].players || [])[i] || ' '}</div>
                  ) : null}
                </div>
                {state.overlay.showTier && hero && firstTier(meta, hero.id) ? (
                  <span className="absolute left-1 top-1 px-1 text-[12px] font-black" style={{ background: GOLD, color: '#0a0f1a' }}>
                    {firstTier(meta, hero.id).replace('-Tier', '')}
                  </span>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="absolute left-0 top-0 flex h-[74px] w-full items-center justify-center" style={{ background: PANEL, borderBottom: `2px solid ${TEAL}66` }}>
        <div className="font-display text-[30px] tracking-[0.3em]" style={{ color: GOLD }}>
          FINAL LINEUP
        </div>
        <div className="ml-6 text-[15px] uppercase tracking-[0.24em] text-white/55">
          {state.meta.tournament || state.matchName} · GAME {state.meta.gameNumber}
        </div>
      </div>

      <div className="absolute flex" style={{ left: 80, top: 132, gap: 40 }}>
        <Team side="blue" />
        <div className="flex w-[200px] flex-col items-center justify-center">
          <div className="font-display text-[76px] leading-none" style={{ color: GOLD }}>
            {state.teams.blue.score}
            <span className="mx-3 text-white/35">:</span>
            {state.teams.red.score}
          </div>
          <div className="mt-2 font-display text-[30px] tracking-[0.3em] text-white/70">VS</div>
        </div>
        <Team side="red" />
      </div>

      <div className="absolute bottom-0 left-0 flex h-[96px] w-full items-center justify-center gap-8" style={{ background: PANEL, borderTop: `2px solid ${TEAL}66` }}>
        {[
          ['BLUE BAN', 'blue'],
          ['RED BAN', 'red']
        ].map(([label, side]) => (
          <div key={side} className="flex items-center gap-2">
            <span className="font-display text-[20px] tracking-[0.18em]" style={{ color: side === 'blue' ? BLUE : RED }}>
              {label}
            </span>
            <div className="flex gap-1.5">
              {entriesOf(state.draft, side, 'ban').map((e, i) => (
                <OverlayBanSmall key={i} hero={heroesById[e.heroId]} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Announce announce={state.overlay.announce} animMs={revealMs} />
    </>
  );
}

function firstTier(meta, heroId) {
  const t = meta?.heroTier?.[heroId];
  if (!t) return null;
  const order = ['S-Tier', 'A-Tier', 'B-Tier', 'C-Tier'];
  const lanes = Object.values(t);
  return order.find((x) => lanes.includes(x)) || lanes[0] || null;
}

/* -------------------------------------------------------------------- halaman */

function LayoutStage({ layout, state, heroesById, meta }) {
  const ready = useAnimReady();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={layout}
        initial={enter(ready, { opacity: 0, y: 10 })}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0"
      >
        {layout === 'lineup' ? (
          <LineupLayout state={state} heroesById={heroesById} meta={meta} />
        ) : layout === 'compact' ? (
          <CompactLayout state={state} heroesById={heroesById} meta={meta} />
        ) : (
          <FullLayout state={state} heroesById={heroesById} meta={meta} />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default function OverlayDraft() {
  useOverlayMode();
  const snap = useStore();
  const [heroes, setHeroes] = React.useState([]);
  const [meta, setMeta] = React.useState(null);

  useEffect(() => {
    loadHeroes().then(setHeroes).catch(() => {});
    loadMeta().then(setMeta).catch(() => {});
  }, []);

  const heroesById = useMemo(() => Object.fromEntries(heroes.map((h) => [h.id, h])), [heroes]);
  const state = snap.state;

  if (!state) {
    return (
      <Stage>
        <div className="flex h-full w-full items-center justify-center">
          <div
            className="px-8 py-4 font-display text-[26px] tracking-[0.2em]"
            style={{ background: PANEL, color: GOLD, border: `1px solid ${TEAL}55` }}
          >
            MENGHUBUNGI SERVER…
          </div>
        </div>
      </Stage>
    );
  }

  const layout = state.overlay.draftLayout;
  // emergency stop: hentikan seluruh gerakan tanpa menghapus data pertandingan
  const frozen = !!state.overlay.emergency;

  return (
    <Stage>
      <MotionConfig reducedMotion={frozen ? 'always' : 'user'}>
        <AnimGate armed delay={700}>
          <LayoutStage layout={layout} state={state} heroesById={heroesById} meta={meta} />
        </AnimGate>
      </MotionConfig>
    </Stage>
  );
}
