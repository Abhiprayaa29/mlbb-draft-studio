import React, { useEffect, useMemo } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import Stage from '../components/Stage.jsx';
import HeroImage from '../components/HeroImage.jsx';
import TeamLogo from '../components/TeamLogo.jsx';
import Branding from '../components/Branding.jsx';
import { useOverlayMode } from '../lib/overlay.js';
import { useStore, cx, fmtClock, fmtGold, sideLabel } from '../lib/utils.js';
import { loadHeroes, loadMeta } from '../lib/data.js';
import { AnimGate, enter, useAnimReady } from '../lib/anim.jsx';

const BLUE = '#2f80ff';
const RED = '#ff2d55';
const GOLD = '#f5c451';
const PANEL = 'rgba(7,11,20,0.88)';

const entriesOf = (draft, team, type) => (draft.entries || []).filter((e) => e.team === team && e.type === type);

/** Angka besar (kills) yang menganimasikan transisi nilai. */
function ScoreNumber({ value, color, size = 76 }) {
  const ready = useAnimReady();
  return (
    <div className="relative flex items-center justify-center" style={{ minWidth: size * 0.8, height: size }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={enter(ready, { y: -size * 0.5, opacity: 0, scale: 1.25 })}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: size * 0.5, opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="font-display leading-none"
          style={{ fontSize: size, color, textShadow: `0 0 26px ${color}55` }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function TeamHead({ state, side }) {
  const t = state.teams[side];
  const color = side === 'blue' ? BLUE : RED;
  return (
    <div className="flex items-center gap-4" style={{ width: 560, flexDirection: side === 'blue' ? 'row' : 'row-reverse' }}>
      <TeamLogo
        src={state.overlay.showLogos ? t.logo : null}
        side={side}
        label={t.name || undefined}
        className="h-[92px] w-[92px] shrink-0 rounded-sm"
        style={{ boxShadow: `0 0 24px ${color}44`, fontSize: 18 }}
      />
      <div className="min-w-0 flex-1" style={{ textAlign: side === 'blue' ? 'left' : 'right' }}>
        <div className="truncate font-display text-[46px] leading-none tracking-[0.05em] text-white">
          {t.name || sideLabel(side)}
        </div>
        <div className="text-[15px] font-semibold uppercase tracking-[0.26em]" style={{ color }}>
          {sideLabel(side)} · SERI {t.score}
        </div>
      </div>
    </div>
  );
}

/** Nilai statistik dengan animasi pop saat nilainya berubah (tampilan saja). */
function PopValue({ value, fmt = (v) => v }) {
  const ready = useAnimReady();
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={String(value)}
        initial={enter(ready, { opacity: 0, y: -12, scale: 1.14 })}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.92 }}
        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        className="inline-block font-display leading-none tabular-nums text-white"
      >
        {fmt(value)}
      </motion.span>
    </AnimatePresence>
  );
}

function StatRow({ label, blue, red, fmt = (v) => v }) {
  return (
    <div className="grid items-center" style={{ gridTemplateColumns: '1fr 190px 1fr' }}>
      <div className="text-right font-display text-[36px]">
        <PopValue value={blue} fmt={fmt} />
      </div>
      <div className="text-center text-[13px] font-bold uppercase tracking-[0.26em] text-white/55">{label}</div>
      <div className="font-display text-[36px]">
        <PopValue value={red} fmt={fmt} />
      </div>
    </div>
  );
}

function LineupRow({ state, side, heroesById, meta, size = 'md' }) {
  const picks = entriesOf(state.draft, side, 'pick');
  const color = side === 'blue' ? BLUE : RED;
  const ready = useAnimReady();
  const w = size === 'lg' ? 128 : 104;
  const hImg = size === 'lg' ? 178 : 146;
  const total = size === 'lg' ? 236 : 194;

  if (picks.length === 0) return null;

  return (
    <div className="flex gap-2" style={{ flexDirection: side === 'blue' ? 'row' : 'row-reverse' }}>
      {picks.map((e, i) => {
        const hero = heroesById[e.heroId];
        return (
          <motion.div
            key={`${e.heroId}-${i}`}
            initial={enter(ready, { opacity: 0, y: 24 })}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden rounded-sm"
            style={{
              width: w,
              height: total,
              background: '#060a12',
              border: `1.5px solid ${hero ? color : 'rgba(255,255,255,0.14)'}`
            }}
          >
            {hero ? (
              <HeroImage hero={hero} kind="portrait" className="w-full object-cover object-top" style={{ height: hImg }} loading="eager" />
            ) : (
              <div className="flex w-full items-center justify-center text-[10px] uppercase tracking-widest text-white/25" style={{ height: hImg }}>
                kosong
              </div>
            )}
            <div
              className="absolute bottom-0 left-0 right-0 px-1 py-1 text-center"
              style={{ background: side === 'blue' ? 'rgba(10,32,66,0.95)' : 'rgba(66,10,24,0.95)' }}
            >
              <div className="truncate font-display text-[17px] leading-[18px] text-white">{hero ? hero.name : '—'}</div>
              {state.overlay.showPlayerNames ? (
                <div className="truncate text-[11px] text-white/70">{(state.teams[side].players || [])[i] || ' '}</div>
              ) : null}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function Announce({ announce, animMs }) {
  const ready = useAnimReady();
  if (!announce) return null;
  const color = announce.type === 'winner' ? GOLD : announce.type === 'mvp' ? '#35d399' : GOLD;
  return (
    <AnimatePresence>
      <motion.div
        key={announce.at}
        initial={enter(ready, { opacity: 0, y: 70 })}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: Math.max(0.2, (animMs || 600) / 1000), ease: [0.16, 1, 0.3, 1] }}
        className="absolute"
        style={{ left: '50%', bottom: 44, transform: 'translateX(-50%)', width: 1100 }}
      >
        <div
          className="flex items-center gap-5 rounded-sm px-8 py-4"
          style={{
            background: 'linear-gradient(90deg, rgba(7,11,20,0.1) 0%, rgba(7,11,20,0.96) 12%, rgba(7,11,20,0.96) 88%, rgba(7,11,20,0.1) 100%)',
            borderTop: `2px solid ${color}`,
            borderBottom: `2px solid ${color}`
          }}
        >
          <span className="font-display text-[22px] tracking-[0.34em]" style={{ color }}>
            {announce.type === 'mvp' ? 'MVP' : announce.type === 'winner' ? 'WINNER' : 'INFO'}
          </span>
          <span className="truncate font-display text-[42px] leading-none tracking-wide text-white">{announce.text}</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------- layout full */

function FullScoreboard({ state, heroesById, meta }) {
  const s = state.score;
  const anim = Math.max(200, state.overlay.animMs || 600);
  const ready = useAnimReady();
  const showVictory = !!s.winner && s.status === 'selesai';

  return (
    <>
      {/* banner kemenangan game */}
      {showVictory ? (
        <div className="absolute left-0 flex w-full justify-center" style={{ top: 46 }}>
          <motion.div
            key={`victory-${state.meta.gameNumber}-${s.winner}`}
            initial={enter(ready, { opacity: 0, y: -28, scale: 0.9 })}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-5 rounded-sm px-10 py-3"
            style={{
              background: 'linear-gradient(90deg, rgba(7,11,20,0) 0%, rgba(7,11,20,0.96) 14%, rgba(7,11,20,0.96) 86%, rgba(7,11,20,0) 100%)',
              borderTop: `2px solid ${GOLD}`,
              borderBottom: `2px solid ${GOLD}`
            }}
          >
            <span className="font-display text-[30px] tracking-[0.36em]" style={{ color: GOLD }}>
              VICTORY
            </span>
            <span
              className="font-display text-[34px] leading-none tracking-wide"
              style={{ color: s.winner === 'blue' ? BLUE : RED }}
            >
              {state.teams[s.winner]?.name || sideLabel(s.winner)}
            </span>
          </motion.div>
        </div>
      ) : null}

      <div
        className="absolute rounded-sm"
        style={{
          left: 160,
          top: 150,
          width: 1600,
          background: PANEL,
          border: '1px solid rgba(255,255,255,0.14)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          borderTop: `3px solid ${GOLD}`
        }}
      >
        {/* header — bertransisi saat game berikutnya dimulai */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={state.meta.gameNumber}
            initial={enter(ready, { opacity: 0, x: 26 })}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -26 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-between px-8 py-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
          >
            <div className="font-display text-[26px] tracking-[0.2em]" style={{ color: GOLD }}>
              {state.meta.tournament || state.matchName || 'MLBB TOURNAMENT'}
            </div>
            <div className="text-[15px] uppercase tracking-[0.3em] text-white/60">
              {[state.meta.round, `GAME ${state.meta.gameNumber}`, `BO${state.meta.bestOf}`].filter(Boolean).join(' · ')}
            </div>
            <div
              className="rounded-sm px-3 py-1 text-[13px] font-bold uppercase tracking-[0.2em]"
              style={{
                border: `1px solid ${s.status === 'selesai' ? '#35d399' : s.status === 'berlangsung' ? GOLD : 'rgba(255,255,255,0.25)'}`,
                color: s.status === 'selesai' ? '#35d399' : s.status === 'berlangsung' ? GOLD : 'rgba(255,255,255,0.6)'
              }}
            >
              {s.status}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* skor utama */}
        <div className="flex items-center justify-between px-8 py-5">
          <TeamHead state={state} side="blue" />
          <div className="flex items-center gap-5">
            <ScoreNumber value={s.blue.kills} color={BLUE} size={84} />
            <div className="flex flex-col items-center">
              <span className="font-display text-[30px] leading-none text-white/45">KILLS</span>
              <span className="mt-1 font-display text-[18px] leading-none tracking-[0.2em]" style={{ color: GOLD }}>
                {fmtClock(s.durationMs)}
              </span>
            </div>
            <ScoreNumber value={s.red.kills} color={RED} size={84} />
          </div>
          <TeamHead state={state} side="red" />
        </div>

        {/* statistik */}
        <div className="space-y-2 px-12 pb-4">
          <StatRow label="Total Gold" blue={s.blue.gold} red={s.red.gold} fmt={fmtGold} />
          <StatRow label="Turret" blue={s.blue.turrets} red={s.red.turrets} />
          <StatRow label="Lord" blue={s.blue.lord} red={s.red.lord} />
          <StatRow label="Turtle" blue={s.blue.turtle} red={s.red.turtle} />
        </div>

        {/* lineup */}
        <div className="flex items-start justify-between gap-6 px-8 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <LineupRow state={state} side="blue" heroesById={heroesById} meta={meta} />
          <div className="flex flex-col items-center gap-1 pt-6">
            <span className="font-display text-[20px] tracking-[0.24em] text-white/50">SERI</span>
            <div className="flex items-center gap-2 font-display text-[54px] leading-none" style={{ color: GOLD }}>
              {state.teams.blue.score}
              <span className="text-white/35">:</span>
              {state.teams.red.score}
            </div>
          </div>
          <LineupRow state={state} side="red" heroesById={heroesById} meta={meta} />
        </div>

        {/* footer: MVP + pemenang */}
        <div className="flex items-center justify-between px-8 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
          <div className="text-[16px] uppercase tracking-[0.2em] text-white/70">
            MVP:{' '}
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={s.mvpPlayer || 'none'}
                initial={enter(ready, { opacity: 0, y: -10, scale: 1.1 })}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="inline-block font-display text-[24px]"
                style={{ color: '#35d399' }}
              >
                {s.mvpPlayer || '—'}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="text-[16px] uppercase tracking-[0.2em] text-white/70">
            Pemenang game:{' '}
            <span className="font-display text-[24px]" style={{ color: s.winner === 'blue' ? BLUE : s.winner === 'red' ? RED : 'rgba(255,255,255,0.45)' }}>
              {s.winner ? state.teams[s.winner]?.name || sideLabel(s.winner) : 'belum ditentukan'}
            </span>
          </div>
        </div>
      </div>

      <Branding overlay={state.overlay} style={{ right: 40, top: 46 }} />
      <Announce announce={state.overlay.announce} animMs={anim} />
    </>
  );
}

/* ---------------------------------------------------------- layout compact */

function CompactScoreboard({ state, heroesById }) {
  const s = state.score;
  const anim = Math.max(200, state.overlay.animMs || 600);
  const bansOrPicks = (side) => entriesOf(state.draft, side, 'pick');

  return (
    <>
      <div
        className="absolute left-0 flex w-full items-center gap-6 px-8"
        style={{
          bottom: 0,
          height: 190,
          background: PANEL,
          borderTop: `3px solid ${GOLD}`
        }}
      >
        {/* blue */}
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center gap-3">
            {state.overlay.showLogos ? (
              <TeamLogo
                src={state.teams.blue.logo}
                side="blue"
                label={state.teams.blue.name || undefined}
                className="h-11 w-11 shrink-0 rounded-sm"
                style={{ fontSize: 12 }}
              />
            ) : null}
            <div className="min-w-0">
              <div className="truncate font-display text-[30px] leading-none text-white">{state.teams.blue.name}</div>
              <div className="text-[12px] uppercase tracking-[0.24em]" style={{ color: BLUE }}>
                BLUE SIDE
              </div>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">Kills</div>
                <div className="font-display text-[26px] leading-none" style={{ color: BLUE }}>
                  {s.blue.kills}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">Gold</div>
                <div className="font-display text-[26px] leading-none text-white">{fmtGold(s.blue.gold)}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">Turret</div>
                <div className="font-display text-[26px] leading-none text-white">{s.blue.turrets}</div>
              </div>
              <div className="font-display text-[46px] leading-none" style={{ color: GOLD }}>
                {state.teams.blue.score}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            {bansOrPicks('blue').map((e, i) => (
              <div key={i} className="relative h-[46px] w-[42px] overflow-hidden rounded-sm" style={{ border: `1px solid ${BLUE}`, background: '#060a12' }}>
                <HeroImage hero={heroesById[e.heroId]} kind="portrait" className="h-full w-full object-cover object-top" />
                {state.overlay.showPlayerNames ? (
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-black/70 text-center text-[9px] text-white">
                    {(state.teams.blue.players || [])[i] || ''}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* tengah */}
        <div className="flex w-[220px] flex-col items-center">
          <div className="font-display text-[17px] tracking-[0.2em]" style={{ color: GOLD }}>
            GAME {state.meta.gameNumber}
          </div>
          <div className="font-display text-[40px] leading-none tabular-nums text-white">{fmtClock(s.durationMs)}</div>
          <div className="mt-1 text-[12px] uppercase tracking-[0.2em] text-white/55">{s.status}</div>
          <div className="mt-1 flex gap-3 text-[12px] uppercase tracking-[0.16em] text-white/60">
            <span>
              Lord <b className="text-white">{s.blue.lord}</b>–<b className="text-white">{s.red.lord}</b>
            </span>
            <span>
              Turtle <b className="text-white">{s.blue.turtle}</b>–<b className="text-white">{s.red.turtle}</b>
            </span>
          </div>
        </div>

        {/* red */}
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center gap-3" style={{ flexDirection: 'row-reverse' }}>
            {state.overlay.showLogos ? (
              <TeamLogo
                src={state.teams.red.logo}
                side="red"
                label={state.teams.red.name || undefined}
                className="h-11 w-11 shrink-0 rounded-sm"
                style={{ fontSize: 12 }}
              />
            ) : null}
            <div className="min-w-0 flex-1" style={{ textAlign: 'right' }}>
              <div className="truncate font-display text-[30px] leading-none text-white">{state.teams.red.name}</div>
              <div className="text-[12px] uppercase tracking-[0.24em]" style={{ color: RED }}>
                RED SIDE
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">Kills</div>
                <div className="font-display text-[26px] leading-none" style={{ color: RED }}>
                  {s.red.kills}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">Gold</div>
                <div className="font-display text-[26px] leading-none text-white">{fmtGold(s.red.gold)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/50">Turret</div>
                <div className="font-display text-[26px] leading-none text-white">{s.red.turrets}</div>
              </div>
              <div className="font-display text-[46px] leading-none" style={{ color: GOLD }}>
                {state.teams.red.score}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5" style={{ flexDirection: 'row-reverse' }}>
            {bansOrPicks('red').map((e, i) => (
              <div key={i} className="relative h-[46px] w-[42px] overflow-hidden rounded-sm" style={{ border: `1px solid ${RED}`, background: '#060a12' }}>
                <HeroImage hero={heroesById[e.heroId]} kind="portrait" className="h-full w-full object-cover object-top" />
                {state.overlay.showPlayerNames ? (
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-black/70 text-center text-[9px] text-white">
                    {(state.teams.red.players || [])[i] || ''}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Branding overlay={state.overlay} style={{ right: 24, bottom: 202 }} />
      <Announce announce={state.overlay.announce} animMs={anim} />
    </>
  );
}

/* ------------------------------------------------------------------ halaman */

export default function OverlayScore() {
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
          <div className="rounded px-8 py-4 font-display text-[26px] tracking-[0.2em]" style={{ background: PANEL, color: GOLD }}>
            MENGHUBUNGI SERVER…
          </div>
        </div>
      </Stage>
    );
  }

  const compact = state.overlay.scoreLayout === 'compact';
  // emergency stop: hentikan gerakan tanpa menghapus data pertandingan
  const frozen = !!state.overlay.emergency;

  return (
    <Stage>
      <MotionConfig reducedMotion={frozen ? 'always' : 'user'}>
        <AnimGate armed delay={700}>
          <ScoreStage compact={compact} state={state} heroesById={heroesById} meta={meta} />
        </AnimGate>
      </MotionConfig>
    </Stage>
  );
}

function ScoreStage({ compact, state, heroesById, meta }) {
  const ready = useAnimReady();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={compact ? 'compact' : 'full'}
        initial={enter(ready, { opacity: 0, y: 10 })}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0"
      >
        {compact ? (
          <CompactScoreboard state={state} heroesById={heroesById} />
        ) : (
          <FullScoreboard state={state} heroesById={heroesById} meta={meta} />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
