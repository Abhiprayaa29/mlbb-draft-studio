import React, { useEffect, useMemo } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import Stage from '../components/Stage.jsx';
import HeroImage from '../components/HeroImage.jsx';
import TeamLogo from '../components/TeamLogo.jsx';
import { isUsableLogo } from '../components/TeamLogo.jsx';
import { useOverlayMode } from '../lib/overlay.js';
import { useStore, cx, fmtClock, fmtGold, sideLabel } from '../lib/utils.js';
import { loadHeroes, loadMeta } from '../lib/data.js';
import { AnimGate, enter, useAnimReady } from '../lib/anim.jsx';
import { themeStyle, withAlpha, defaultTheme } from '../../shared/theme.js';

/**
 * src/pages/OverlayScore.jsx
 * ---------------------------------------------------------------------------
 * Scoreboard + frame turnamen untuk OBS (16:9, latar transparan).
 *
 * Tata letak:
 *   A. Header   : identitas tim (kiri) · logo turnamen (tengah) · sponsor &
 *                 caster (kanan)
 *   B. Frame    : garis/bidang geometris emas di atas + sudut bawah kiri/kanan,
 *                 area tengah tetap lapang untuk gameplay
 *   C. Scoreboard (bawah): identitas tim, kill, gold, turret, lord, turtle,
 *                 durasi, seri, status & pemenang
 *
 * Semua warna/ukuran datang dari `state.overlay.theme` lewat CSS variable
 * (shared/theme.js) — tidak ada warna yang di-hardcode di sini, dan perubahan
 * tema tidak pernah menyentuh skor (state tetap milik server).
 * ---------------------------------------------------------------------------
 */

const PANEL_ALPHA = 0.93;

const entriesOf = (draft, team, type) => (draft.entries || []).filter((e) => e.team === team && e.type === type);

/** Tema dengan default aman bila field belum ada (state lama). */
function useTheme(state) {
  return state?.overlay?.theme || defaultTheme();
}

function themeColors(theme) {
  const t = theme.colors || defaultTheme().colors;
  return { ...defaultTheme().colors, ...t };
}

/** Nilai statistik: bila pertandingan belum berjalan dan nilainya 0 → '–'
 *  (bukan angka palsu). Begitu ada nilai/berjalan, angka tampil apa adanya. */
function statValue(value, started, fmt = (v) => v) {
  const n = Number(value) || 0;
  if (!started && n === 0) return '–';
  return fmt(n);
}

/** Angka besar (kills) dengan transisi nilai. */
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
          style={{ fontSize: size, color, textShadow: `0 0 26px ${color}66` }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/** Nilai statistik dengan animasi pop saat berubah (tampilan saja). */
function PopValue({ value, fmt = (v) => v }) {
  const ready = useAnimReady();
  const shown = typeof value === 'string' ? value : fmt(value);
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={String(shown)}
        initial={enter(ready, { opacity: 0, y: -12, scale: 1.14 })}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.92 }}
        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
        className="inline-block font-display leading-none tabular-nums"
        style={{ color: 'var(--sc-text)' }}
      >
        {shown}
      </motion.span>
    </AnimatePresence>
  );
}

/* ------------------------------------------------------- frame dekoratif */

/**
 * Bidang geometris bersudut tajam: pita atas + sudut bawah kiri/kanan.
 * Ketebalan mengikuti `--sc-border-px`, ukuran hiasan mengikuti `--sc-deco`.
 * `pointer-events:none` agar tidak pernah menangkap klik OBS/operator.
 */
function DecoFrame({ colors }) {
  // Pita atas menampung header (tim, turnamen, sponsor, caster) sehingga teks
  // selalu berada di atas bidang berwarna — kontras aman untuk semua preset.
  const bandH = 'max(calc(var(--sc-deco) * 1.7px), calc(var(--sc-border-px) * 12))';
  const corner = 'calc(var(--sc-deco) * 1.7px)';
  const plate = 'calc(var(--sc-deco) * 0.35px)';
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
      {/* pita atas */}
      <div
        className="absolute left-0 top-0 w-full"
        style={{
          height: bandH,
          background: `linear-gradient(90deg, ${colors.border} 0%, ${colors.primary} 28%, ${colors.primary} 72%, ${colors.border} 100%)`
        }}
      />
      {/* pelat geometris kiri/kanan di bawah pita */}
      <div
        className="absolute left-0 top-0"
        style={{
          width: 420,
          height: `calc(${bandH} + ${plate})`,
          background: withAlpha(colors.primary, 0.9),
          clipPath: 'polygon(0 0, 100% 0, 84% 100%, 0 100%)'
        }}
      />
      <div
        className="absolute right-0 top-0"
        style={{
          width: 420,
          height: `calc(${bandH} + ${plate})`,
          background: withAlpha(colors.primary, 0.9),
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 16% 100%)'
        }}
      />
      {/* garis aksen di bawah pita */}
      <div className="absolute left-0 top-0 w-full" style={{ height: 'var(--sc-border-px)', background: 'var(--sc-border)' }} />
      {/* sudut bawah kiri */}
      <div
        className="absolute bottom-0 left-0"
        style={{
          width: corner,
          height: corner,
          background: `linear-gradient(135deg, ${'var(--sc-border)'} 0%, ${'var(--sc-primary)'} 70%)`,
          clipPath: 'polygon(0 0, 100% 0, 100% 26%, 34% 100%, 0 100%)'
        }}
      />
      {/* sudut bawah kanan */}
      <div
        className="absolute bottom-0 right-0"
        style={{
          width: corner,
          height: corner,
          background: `linear-gradient(225deg, ${'var(--sc-border)'} 0%, ${'var(--sc-primary)'} 70%)`,
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 66% 100%, 0 26%)'
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- header */

function TeamPlate({ state, side, theme, colors, size = 74 }) {
  const t = state.teams[side];
  const color = side === 'blue' ? colors.teamA : colors.teamB;
  const show = state.overlay.showLogos && theme.visible.teamLogos;
  const scale = theme.logo.teamScale || 1;
  const px = Math.round(size * scale);
  return (
    <div className="flex items-center gap-3">
      {show ? (
        <TeamLogo
          src={t.logo}
          side={side}
          label={t.name || undefined}
          className="shrink-0"
          style={{
            width: px,
            height: px,
            fontSize: Math.round(px * 0.28),
            background: withAlpha(colors.background, 0.6),
            border: `var(--sc-border-px) solid ${color}`,
            boxShadow: `0 0 18px ${withAlpha(color, 0.35)}`
          }}
        />
      ) : null}
      <div className="min-w-0" style={{ maxWidth: 240 }}>
        <div
          className="truncate font-display leading-none"
          style={{ color: 'var(--sc-text)', fontSize: Math.round(34 * (theme.text.scale || 1)) }}
        >
          {(t.name || sideLabel(side)) + ''}
        </div>
        <div
          className="font-semibold uppercase"
          style={{
            color,
            fontSize: Math.round(13 * (theme.text.scale || 1)),
            letterSpacing: '0.24em'
          }}
        >
          {sideLabel(side)} · SERI {t.score}
        </div>
      </div>
    </div>
  );
}

function Sponsors({ theme }) {
  const list = theme.sponsors || [];
  if (!theme.visible.sponsors || list.length === 0) return null;
  const [broken, setBroken] = React.useState({});
  return (
    <div className="flex items-center justify-end gap-3">
      {list.map((url, i) => (
        <img
          key={`${url}-${i}`}
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken((b) => ({ ...b, [i]: true }))}
          style={{
            height: Math.round(34 * (theme.logo.sponsorScale || 1)),
            maxWidth: Math.round(150 * (theme.logo.sponsorScale || 1)),
            objectFit: 'contain',
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.5))',
            display: broken[i] ? 'none' : 'block'
          }}
        />
      ))}
    </div>
  );
}

function CasterLine({ theme, colors }) {
  if (!theme.visible.caster || !String(theme.caster || '').trim()) return null;
  const txt = theme.text.uppercase ? String(theme.caster).toUpperCase() : String(theme.caster);
  return (
    <div
      className="flex items-center gap-2 px-4 py-1.5"
      style={{
        background: withAlpha(colors.background, 0.85),
        border: `var(--sc-border-px) solid var(--sc-border)`,
        clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)',
        paddingRight: 26
      }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--sc-accent)" strokeWidth="2">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
      <span
        className="font-display leading-none"
        style={{ color: 'var(--sc-text)', fontSize: Math.round(20 * (theme.text.scale || 1)), letterSpacing: '0.14em' }}
      >
        {txt}
      </span>
    </div>
  );
}

function HeaderBar({ state, theme, colors }) {
  if (!theme.visible.header) return null;
  const t = state.meta.tournament || state.matchName || '';
  const logo = isUsableLogo(state.overlay.brandLogo) ? state.overlay.brandLogo : null;
  const showLogo = theme.visible.tournamentLogo && logo && state.overlay.showLogos !== false;
  const sub = state.overlay.showBranding && state.overlay.brandText ? state.overlay.brandText : '';
  const info = theme.visible.info ? String(theme.info || '') : '';
  const scale = theme.text.scale || 1;
  const crop = (s) => (theme.text.uppercase ? String(s).toUpperCase() : String(s));

  return (
    <div className="pointer-events-none absolute left-0 top-0 z-10 flex w-full items-start justify-between px-10" style={{ paddingTop: 'calc(var(--sc-border-px) * 6 + 14px)' }}>
      {/* kiri: identitas tim */}
      <div className="flex items-center gap-6">
        <TeamPlate state={state} side="blue" theme={theme} colors={colors} />
        <span
          className="font-display"
          style={{ color: withAlpha(colors.text, 0.5), fontSize: Math.round(22 * scale), letterSpacing: '0.2em' }}
        >
          VS
        </span>
        <TeamPlate state={state} side="red" theme={theme} colors={colors} />
      </div>

      {/* tengah: logo + nama turnamen */}
      <div
        className="flex flex-col items-center"
        style={{
          transform: `translate(${theme.logo.tournamentX || 0}px, ${theme.logo.tournamentY || 0}px)`,
          maxWidth: 760
        }}
      >
        {showLogo ? (
          <img
            src={logo}
            alt=""
            referrerPolicy="no-referrer"
            style={{
              height: Math.round(64 * (theme.logo.tournamentScale || 1)),
              maxWidth: Math.round(300 * (theme.logo.tournamentScale || 1)),
              objectFit: 'contain',
              filter: 'drop-shadow(0 6px 18px rgba(0,0,0,.55))'
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : null}
        {t ? (
          <div
            className="truncate font-display"
            style={{
              color: 'var(--sc-accent)',
              fontSize: Math.round(32 * scale),
              letterSpacing: '0.18em',
              textShadow: '0 2px 10px rgba(0,0,0,.55)'
            }}
          >
            {crop(t)}
          </div>
        ) : null}
        {sub ? (
          <div
            className="truncate font-display"
            style={{ color: 'var(--sc-text)', fontSize: Math.round(17 * scale), letterSpacing: '0.22em', opacity: 0.85 }}
          >
            {crop(sub)}
          </div>
        ) : null}
        {info ? (
          <div
            className="truncate"
            style={{ color: withAlpha(colors.text, 0.75), fontSize: Math.round(15 * scale), letterSpacing: '0.1em' }}
          >
            {info}
          </div>
        ) : null}
      </div>

      {/* kanan: sponsor + caster */}
      <div className="flex max-w-[520px] flex-col items-end gap-2">
        <Sponsors theme={theme} />
        <CasterLine theme={theme} colors={colors} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ scoreboard */

/** Chip statistik satu sisi (label + nilai, tanpa angka palsu). */
function StatChip({ label, value, started, fmt, color, colors, scale = 1 }) {
  return (
    <div className="flex min-w-[92px] flex-col items-center">
      <span
        className="font-semibold uppercase"
        style={{ color: withAlpha(colors.text, 0.6), fontSize: Math.round(12 * scale), letterSpacing: '0.18em' }}
      >
        {label}
      </span>
      <span className="font-display leading-none tabular-nums" style={{ color, fontSize: Math.round(28 * scale) }}>
        <PopValue value={statValue(value, started, fmt)} />
      </span>
    </div>
  );
}

function LineupRow({ state, side, heroesById, theme, colors, size = 'md' }) {
  const picks = entriesOf(state.draft, side, 'pick');
  const color = side === 'blue' ? colors.teamA : colors.teamB;
  const ready = useAnimReady();
  const w = size === 'lg' ? 120 : 96;
  const hImg = size === 'lg' ? 150 : 122;
  const total = size === 'lg' ? 200 : 164;

  if (picks.length === 0 || !theme.visible.lineup) return null;

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
            className="relative overflow-hidden"
            style={{
              width: w,
              height: total,
              background: withAlpha(colors.background, 0.75),
              border: `1.5px solid ${hero ? color : withAlpha(colors.text, 0.18)}`,
              clipPath: 'polygon(0 0, 100% 0, 100% 86%, 92% 100%, 0 100%)'
            }}
          >
            {hero ? (
              <HeroImage hero={hero} kind="portrait" className="w-full object-cover object-top" style={{ height: hImg }} loading="eager" />
            ) : (
              <div
                className="flex w-full items-center justify-center text-[10px] uppercase tracking-widest"
                style={{ height: hImg, color: withAlpha(colors.text, 0.3) }}
              >
                kosong
              </div>
            )}
            <div
              className="absolute bottom-0 left-0 right-0 px-1 py-1 text-center"
              style={{ background: withAlpha(side === 'blue' ? colors.teamA : colors.teamB, 0.88) }}
            >
              <div className="truncate font-display text-[16px] leading-[17px]" style={{ color: '#fff' }}>
                {hero ? hero.name : '—'}
              </div>
              {state.overlay.showPlayerNames ? (
                <div className="truncate text-[10.5px]" style={{ color: 'rgba(255,255,255,.82)' }}>
                  {(state.teams[side].players || [])[i] || ' '}
                </div>
              ) : null}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/** Blok tengah: game, durasi, seri, status, pemenang. */
function CenterBlock({ state, theme, colors, compact = false }) {
  const s = state.score;
  const started = s.status !== 'belum';
  const scale = theme.text.scale || 1;
  const statusColor =
    s.status === 'selesai' ? 'var(--sc-accent)' : s.status === 'berlangsung' ? 'var(--sc-timer)' : withAlpha(colors.text, 0.55);
  const meta = [state.meta.round, `GAME ${state.meta.gameNumber}`, state.meta.bestOf ? `BO${state.meta.bestOf}` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col items-center justify-center" style={{ minWidth: compact ? 190 : 300 }}>
      {meta ? (
        <div
          className="font-display uppercase"
          style={{ color: 'var(--sc-accent)', fontSize: Math.round((compact ? 15 : 18) * scale), letterSpacing: '0.24em' }}
        >
          {meta}
        </div>
      ) : null}
      <div
        className="font-display leading-none tabular-nums"
        style={{ color: 'var(--sc-text)', fontSize: Math.round((compact ? 34 : 46) * scale) }}
      >
        {theme.visible.timer ? (started || s.durationMs > 0 ? fmtClock(s.durationMs) : '–:–') : ''}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className="px-2.5 py-0.5 font-display uppercase"
          style={{
            border: `var(--sc-border-px) solid ${statusColor}`,
            color: statusColor,
            fontSize: Math.round(13 * scale),
            letterSpacing: '0.2em'
          }}
        >
          {s.status || 'belum'}
        </span>
        {s.winner ? (
          <span
            className="px-2.5 py-0.5 font-display uppercase"
            style={{
              background: s.winner === 'blue' ? colors.teamA : colors.teamB,
              color: '#fff',
              fontSize: Math.round(13 * scale),
              letterSpacing: '0.16em'
            }}
          >
            WINNER · {state.teams[s.winner]?.name || sideLabel(s.winner)}
          </span>
        ) : null}
      </div>
      {!started && theme.visible.stats ? (
        <span
          className="mt-1 uppercase"
          style={{ color: withAlpha(colors.text, 0.45), fontSize: Math.round(11 * scale), letterSpacing: '0.18em' }}
        >
          menunggu data pertandingan
        </span>
      ) : null}
    </div>
  );
}

function SeriesBlock({ state, theme, colors }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="font-display uppercase"
        style={{ color: withAlpha(colors.text, 0.55), fontSize: Math.round(13 * (theme.text.scale || 1)), letterSpacing: '0.24em' }}
      >
        SERI
      </span>
      <div
        className="font-display leading-none"
        style={{ color: 'var(--sc-highlight)', fontSize: Math.round(44 * (theme.text.scale || 1)) }}
      >
        {state.teams.blue.score}
        <span style={{ color: withAlpha(colors.text, 0.35) }}>:</span>
        {state.teams.red.score}
      </div>
    </div>
  );
}

function TeamSide({ state, side, theme, colors }) {
  const t = state.teams[side];
  const color = side === 'blue' ? colors.teamA : colors.teamB;
  const show = state.overlay.showLogos && theme.visible.teamLogos;
  const px = Math.round(66 * (theme.logo.teamScale || 1));
  const scale = theme.text.scale || 1;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3" style={{ flexDirection: side === 'blue' ? 'row' : 'row-reverse' }}>
      {show ? (
        <TeamLogo
          src={t.logo}
          side={side}
          label={t.name || undefined}
          className="shrink-0"
          style={{
            width: px,
            height: px,
            fontSize: Math.round(px * 0.28),
            background: withAlpha(colors.background, 0.55),
            border: `var(--sc-border-px) solid ${color}`
          }}
        />
      ) : null}
      <div className="min-w-0" style={{ textAlign: side === 'blue' ? 'left' : 'right' }}>
        <div
          className="truncate font-display leading-none"
          style={{ color: 'var(--sc-text)', fontSize: Math.round(30 * scale) }}
        >
          {t.name || sideLabel(side)}
        </div>
        <div className="uppercase" style={{ color, fontSize: Math.round(12 * scale), letterSpacing: '0.22em' }}>
          {sideLabel(side)}
        </div>
      </div>
    </div>
  );
}

/** Baris statistik per sisi pada layout full. */
function StatsRow({ state, side, theme, colors }) {
  const s = state.score[side];
  const started = state.score.status !== 'belum';
  const color = side === 'blue' ? colors.teamA : colors.teamB;
  const scale = theme.text.scale || 1;
  return (
    <div className="flex items-start justify-center gap-5">
      <StatChip label="Gold" value={s.gold} started={started} fmt={fmtGold} color="var(--sc-text)" colors={colors} scale={scale} />
      <StatChip label="Turret" value={s.turrets} started={started} color="var(--sc-text)" colors={colors} scale={scale} />
      <StatChip label="Lord" value={s.lord} started={started} color="var(--sc-highlight)" colors={colors} scale={scale} />
      <StatChip label="Turtle" value={s.turtle} started={started} color={color} colors={colors} scale={scale} />
    </div>
  );
}

function Announce({ announce, animMs, colors }) {
  const ready = useAnimReady();
  if (!announce) return null;
  const c = colors || themeColors(defaultTheme());
  const color = announce.type === 'winner' ? 'var(--sc-highlight)' : announce.type === 'mvp' ? 'var(--sc-timer)' : 'var(--sc-accent)';
  return (
    <AnimatePresence>
      <motion.div
        key={announce.at}
        initial={enter(ready, { opacity: 0, y: 70 })}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: Math.max(0.2, (animMs || 600) / 1000), ease: [0.16, 1, 0.3, 1] }}
        className="absolute"
        style={{ left: '50%', bottom: 300, transform: 'translateX(-50%)', width: 1100, zIndex: 30 }}
      >
        <div
          className="flex items-center gap-5 px-8 py-4"
          style={{
            background: `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${withAlpha(c.background, 0.96)} 12%, ${withAlpha(
              c.background,
              0.96
            )} 88%, rgba(0,0,0,0) 100%)`,
            borderTop: `2px solid ${color}`,
            borderBottom: `2px solid ${color}`
          }}
        >
          <span className="font-display text-[22px] tracking-[0.34em]" style={{ color }}>
            {announce.type === 'mvp' ? 'MVP' : announce.type === 'winner' ? 'WINNER' : 'INFO'}
          </span>
          <span className="truncate font-display text-[42px] leading-none tracking-wide" style={{ color: '#fff' }}>
            {announce.text}
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------ layout full */

function FullScoreboard({ state, theme, colors, heroesById, meta }) {
  const s = state.score;
  const started = s.status !== 'belum';
  const ready = useAnimReady();
  const scale = theme.text.scale || 1;
  const showVictory = !!s.winner && s.status === 'selesai';
  const panelTop = 210;
  const panelHeight = 300;

  return (
    <>
      {showVictory && theme.visible.winner ? (
        <div className="absolute left-0 z-20 flex w-full justify-center" style={{ top: 150 }}>
          <motion.div
            key={`victory-${state.meta.gameNumber}-${s.winner}`}
            initial={enter(ready, { opacity: 0, y: -28, scale: 0.9 })}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-5 px-10 py-3"
            style={{
              background: `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${withAlpha(colors.background, 0.96)} 14%, ${withAlpha(
                colors.background,
                0.96
              )} 86%, rgba(0,0,0,0) 100%)`,
              borderTop: `var(--sc-border-px) solid var(--sc-border)`,
              borderBottom: `var(--sc-border-px) solid var(--sc-border)`
            }}
          >
            <span className="font-display text-[30px] tracking-[0.36em]" style={{ color: 'var(--sc-accent)' }}>
              VICTORY
            </span>
            <span
              className="font-display text-[34px] leading-none tracking-wide"
              style={{ color: s.winner === 'blue' ? colors.teamA : colors.teamB }}
            >
              {state.teams[s.winner]?.name || sideLabel(s.winner)}
            </span>
          </motion.div>
        </div>
      ) : null}

      {/* panel scoreboard di bawah — area tengah tetap lapang */}
      <div
        className="absolute bottom-0 left-0 z-10 w-full"
        style={{
          background: withAlpha(colors.background, PANEL_ALPHA),
          borderTop: `var(--sc-border-px) solid var(--sc-border)`,
          boxShadow: '0 -18px 60px rgba(0,0,0,0.45)',
          minHeight: panelHeight
        }}
      >
        {/* lineup + seri */}
        <div className="flex items-start justify-between gap-6 px-10" style={{ paddingTop: 14, paddingBottom: 8 }}>
          <LineupRow state={state} side="blue" heroesById={heroesById} theme={theme} colors={colors} />
          <SeriesBlock state={state} theme={theme} colors={colors} />
          <LineupRow state={state} side="red" heroesById={heroesById} theme={theme} colors={colors} />
        </div>

        {/* utama */}
        <div className="flex items-center gap-6 px-10" style={{ paddingBottom: 10 }}>
          <TeamSide state={state} side="blue" theme={theme} colors={colors} />
          <div className="flex flex-col items-center gap-2">
            <ScoreNumber
              value={started || s.blue.kills > 0 ? s.blue.kills : '–'}
              color={colors.teamA}
              size={Math.round(72 * scale)}
            />
            <span
              className="font-display uppercase"
              style={{ color: withAlpha(colors.text, 0.6), fontSize: Math.round(13 * scale), letterSpacing: '0.26em' }}
            >
              KILLS
            </span>
          </div>
          <CenterBlock state={state} theme={theme} colors={colors} />
          <div className="flex flex-col items-center gap-2">
            <ScoreNumber
              value={started || s.red.kills > 0 ? s.red.kills : '–'}
              color={colors.teamB}
              size={Math.round(72 * scale)}
            />
            <span
              className="font-display uppercase"
              style={{ color: withAlpha(colors.text, 0.6), fontSize: Math.round(13 * scale), letterSpacing: '0.26em' }}
            >
              KILLS
            </span>
          </div>
          <TeamSide state={state} side="red" theme={theme} colors={colors} />
        </div>

        {/* statistik */}
        {theme.visible.stats ? (
          <div className="flex items-start justify-between px-10" style={{ paddingBottom: 14, borderTop: `1px solid ${withAlpha(colors.text, 0.12)}` }}>
            <StatsRow state={state} side="blue" theme={theme} colors={colors} />
            <div
              className="flex items-center gap-4 pt-3 uppercase"
              style={{ color: withAlpha(colors.text, 0.55), fontSize: Math.round(12 * scale), letterSpacing: '0.2em' }}
            >
              {theme.visible.mvp ? (
                <span>
                  MVP:{' '}
                  <b className="font-display" style={{ color: 'var(--sc-timer)', fontSize: Math.round(17 * scale) }}>
                    {s.mvpPlayer || '—'}
                  </b>
                </span>
              ) : null}
            </div>
            <StatsRow state={state} side="red" theme={theme} colors={colors} />
          </div>
        ) : null}
      </div>
    </>
  );
}

/* ---------------------------------------------------------- layout compact */

function CompactScoreboard({ state, theme, colors, heroesById }) {
  const s = state.score;
  const started = s.status !== 'belum';
  const scale = theme.text.scale || 1;
  const picks = (side) => entriesOf(state.draft, side, 'pick');

  return (
    <div
      className="absolute bottom-0 left-0 z-10 flex w-full items-center gap-6 px-8"
      style={{
        height: 170,
        background: withAlpha(colors.background, PANEL_ALPHA),
        borderTop: `var(--sc-border-px) solid var(--sc-border)`,
        boxShadow: '0 -14px 44px rgba(0,0,0,0.42)'
      }}
    >
      {/* blue */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-3">
          <TeamSide state={state} side="blue" theme={theme} colors={colors} />
          <div className="flex items-center gap-4">
            <StatChip label="Kills" value={s.blue.kills} started={started} color={colors.teamA} colors={colors} scale={scale} />
            {theme.visible.stats ? (
              <StatChip label="Gold" value={s.blue.gold} started={started} fmt={fmtGold} color="var(--sc-text)" colors={colors} scale={scale} />
            ) : null}
            <span className="font-display leading-none" style={{ color: 'var(--sc-highlight)', fontSize: Math.round(40 * scale) }}>
              {state.teams.blue.score}
            </span>
          </div>
        </div>
        {theme.visible.lineup ? (
          <div className="flex gap-1.5">
            {picks('blue').map((e, i) => (
              <div
                key={i}
                className="relative h-[42px] w-[38px] overflow-hidden"
                style={{ border: `1px solid ${colors.teamA}`, background: withAlpha(colors.background, 0.6) }}
              >
                <HeroImage hero={heroesById[e.heroId]} kind="portrait" className="h-full w-full object-cover object-top" />
                {state.overlay.showPlayerNames ? (
                  <span
                    className="absolute bottom-0 left-0 right-0 truncate text-center text-[9px]"
                    style={{ background: 'rgba(0,0,0,.7)', color: '#fff' }}
                  >
                    {(state.teams.blue.players || [])[i] || ''}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <CenterBlock state={state} theme={theme} colors={colors} compact />

      {/* red */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-3" style={{ flexDirection: 'row-reverse' }}>
          <TeamSide state={state} side="red" theme={theme} colors={colors} />
          <div className="flex items-center gap-4">
            <StatChip label="Kills" value={s.red.kills} started={started} color={colors.teamB} colors={colors} scale={scale} />
            {theme.visible.stats ? (
              <StatChip label="Gold" value={s.red.gold} started={started} fmt={fmtGold} color="var(--sc-text)" colors={colors} scale={scale} />
            ) : null}
            <span className="font-display leading-none" style={{ color: 'var(--sc-highlight)', fontSize: Math.round(40 * scale) }}>
              {state.teams.red.score}
            </span>
          </div>
        </div>
        {theme.visible.lineup ? (
          <div className="flex gap-1.5" style={{ flexDirection: 'row-reverse' }}>
            {picks('red').map((e, i) => (
              <div
                key={i}
                className="relative h-[42px] w-[38px] overflow-hidden"
                style={{ border: `1px solid ${colors.teamB}`, background: withAlpha(colors.background, 0.6) }}
              >
                <HeroImage hero={heroesById[e.heroId]} kind="portrait" className="h-full w-full object-cover object-top" />
                {state.overlay.showPlayerNames ? (
                  <span
                    className="absolute bottom-0 left-0 right-0 truncate text-center text-[9px]"
                    style={{ background: 'rgba(0,0,0,.7)', color: '#fff' }}
                  >
                    {(state.teams.red.players || [])[i] || ''}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ view */

/**
 * View scoreboard murni (dipakai overlay OBS **dan** preview di control panel)
 * sehingga preview selalu identik dengan siaran.
 */
export function ScoreboardView({ state, heroesById = {}, meta = null }) {
  const theme = useTheme(state);
  const colors = themeColors(theme);
  const anim = Math.max(200, state.overlay.animMs || 600);
  const compact = state.overlay.scoreLayout === 'compact';

  return (
    <div className="absolute inset-0" style={themeStyle(theme)}>
      {theme.visible.frame ? <DecoFrame colors={colors} /> : null}
      <HeaderBar state={state} theme={theme} colors={colors} />
      {theme.visible.score ? (
        compact ? (
          <CompactScoreboard state={state} theme={theme} colors={colors} heroesById={heroesById} />
        ) : (
          <FullScoreboard state={state} theme={theme} colors={colors} heroesById={heroesById} meta={meta} />
        )
      ) : null}
      <Announce announce={state.overlay.announce} animMs={anim} colors={colors} />
    </div>
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
          <div
            className="px-8 py-4 font-display text-[26px] tracking-[0.2em]"
            style={{ background: 'rgba(7,11,20,0.88)', color: '#f5c451' }}
          >
            MENGHUBUNGI SERVER…
          </div>
        </div>
      </Stage>
    );
  }

  const frozen = !!state.overlay.emergency;

  return (
    <Stage>
      <MotionConfig reducedMotion={frozen ? 'always' : 'user'}>
        <AnimGate armed delay={700}>
          <ScoreStage state={state} heroesById={heroesById} meta={meta} />
        </AnimGate>
      </MotionConfig>
    </Stage>
  );
}

function ScoreStage({ state, heroesById, meta }) {
  const ready = useAnimReady();
  const key = state.overlay.scoreLayout === 'compact' ? 'compact' : 'full';
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        initial={enter(ready, { opacity: 0, y: 10 })}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0"
      >
        <ScoreboardView state={state} heroesById={heroesById} meta={meta} />
      </motion.div>
    </AnimatePresence>
  );
}
