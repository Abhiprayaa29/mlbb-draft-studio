import React, { useEffect, useState } from 'react';
import Stage from '../components/Stage.jsx';
import { useOverlayMode } from '../lib/overlay.js';
import { useStore, fmtGold, sideLabel } from '../lib/utils.js';
import { BC } from '../lib/broadcast.js';

/**
 * src/pages/OverlaySponsorEdition.jsx
 * ---------------------------------------------------------------------------
 * Template "Sponsor Edition" — frame Sponsor Edition (SVG dari
 * public/overlay/templates/sponsor-edition.html) + scoreboard fungsional
 * yang memakai state pertandingan yang SAMA dengan scoreboard existing
 * (state.score, state.teams, state.meta) lewat Socket.IO.
 *
 * Layout (koordinat SVG 1920×1080):
 *   - Kills besar        : badan atas panel tim (di atas name tray hijau)
 *   - Nama tim           : name tray hijau (y≈47–81)
 *   - Strip statistik    : panel angular di bawah header (gold/turret/lord)
 *   - Seri + timer       : ornamen tengah (gap di tengah ornamen)
 *   - MVP                : di bawah strip statistik, tengah
 *
 * Layer data mengikuti design system broadcast (teal · emas · cream) —
 * konsisten dengan scoreboard & draft. Frame SVG sponsor tetap utuh.
 * Timer pertandingan = matchTimer internal (start/pause/reset via socket).
 * Placeholder '–' mengikuti perilaku scoreboard existing.
 * ---------------------------------------------------------------------------
 */

const TEAL = BC.teal;
const GOLD = BC.gold;
const GOLD_LIGHT = '#f4c84b';
const WHITE = BC.cream;
const GREEN_FILL = 'rgba(41,67,52,0.93)';
const GREEN_DEEP = 'rgba(20,43,34,0.9)';

/** Placeholder netral — sama dengan scoreboard existing. */
function statValue(value, started, fmt = (v) => v) {
  const n = Number(value) || 0;
  if (!started && n === 0) return '–';
  return fmt(n);
}

function killsValue(value, started) {
  const n = Number(value) || 0;
  return started || n > 0 ? n : '–';
}

/** Format ms → MM:SS. */
function fmtMMSS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/* ----------------------------------------------------------- bagian UI */

function TeamKill({ side, score, started }) {
  const isBlue = side === 'blue';
  // Posisi di badan atas panel header (y≈8–46), terpusat pada lebar panel.
  const cx = isBlue ? 726 : 1194;
  return (
    <div
      data-testid={`se-kills-${side}`}
      className="font-display absolute leading-none"
      style={{
        left: cx,
        top: 6,
        transform: 'translateX(-50%)',
        fontSize: 46,
        color: WHITE,
        textShadow: isBlue ? '0 0 18px rgba(90,184,183,0.45)' : '0 0 18px rgba(232,90,90,0.4)',
        letterSpacing: '0.04em',
        width: 90,
        textAlign: 'center'
      }}
    >
      {killsValue(score?.[side]?.kills, started)}
    </div>
  );
}

function TeamName({ side, teams, show }) {
  const isBlue = side === 'blue';
  // Name tray hijau: blue ≈ x575–891, red ≈ x1029–1345, y≈47–81
  const cx = isBlue ? 733 : 1187;
  const name = teams?.[side]?.name || sideLabel(side);
  return (
    <div
      data-testid={`se-team-${side}`}
      className="font-display absolute truncate"
      style={{
        left: cx,
        top: 52,
        transform: 'translateX(-50%)',
        width: 250,
        textAlign: 'center',
        fontSize: 24,
        lineHeight: '26px',
        color: WHITE,
        letterSpacing: '0.06em',
        textShadow: '0 1px 4px rgba(0,0,0,0.55)',
        opacity: show ? 1 : 0
      }}
    >
      {name}
    </div>
  );
}

function StatItem({ label, value, color, testId }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 72 }}>
      <div
        data-testid={testId}
        className="font-display leading-none tabular-nums"
        style={{ fontSize: 27, color: color || WHITE }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 3,
          fontSize: 9.5,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'rgba(244,244,239,0.5)'
        }}
      >
        {label}
      </div>
    </div>
  );
}

/**
 * Strip statistik angular di bawah header tim — mengikuti bahasa desain
 * frame (sudut tajam, border teal, aksen gold).
 */
function StatsStrip({ side, score, started }) {
  const isBlue = side === 'blue';
  const s = score?.[side] || {};
  const w = 400;
  const h = 62;
  const left = isBlue ? 530 : 990;
  const accent = isBlue ? TEAL : '#e86a6a';
  const gid = `seStatBg-${side}`;
  // Path angular: sisi luar mengikuti kemiringan header
  const panelPath = isBlue
    ? `M0 0H${w - 22}L${w} 18V${h - 6}L${w - 14} ${h}H10L0 ${h - 14}Z`
    : `M22 0H${w}V${h - 14}L${w - 10} ${h}H0L14 ${h - 6}V18Z`;
  const goldLine = isBlue
    ? `M6 5H${w - 28}L${w - 8} 22`
    : `M${w - 6} 5H28L8 22`;
  return (
    <div style={{ position: 'absolute', left, top: 92, width: w, height: h, pointerEvents: 'none' }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', inset: 0, display: 'block' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2c4a3a" stopOpacity="0.95" />
            <stop offset="1" stopColor="#152c23" stopOpacity="0.92" />
          </linearGradient>
        </defs>
        <path d={panelPath} fill={`url(#${gid})`} stroke={TEAL} strokeWidth="2" />
        <path d={goldLine} fill="none" stroke={GOLD} strokeWidth="1.4" opacity="0.92" />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-evenly',
          padding: isBlue ? '0 10px 0 18px' : '0 18px 0 10px'
        }}
      >
        <StatItem label="Gold" value={statValue(s.gold, started, fmtGold)} testId={`se-gold-${side}`} />
        <StatItem label="Turret" value={statValue(s.turrets, started)} testId={`se-turrets-${side}`} />
        <StatItem label="Lord" value={statValue(s.lord, started)} color={GOLD_LIGHT} testId={`se-lord-${side}`} />
      </div>
    </div>
  );
}

/** Blok tengah: seri + timer + meta + status (di gap ornamen tengah). */
function CenterSeries({ state }) {
  const blue = state.teams?.blue?.score ?? 0;
  const red = state.teams?.red?.score ?? 0;
  const meta = [state.meta?.round, state.meta?.gameNumber ? `GAME ${state.meta.gameNumber}` : '', state.meta?.bestOf ? `BO${state.meta.bestOf}` : '']
    .filter(Boolean)
    .join(' · ');
  const mt = state.score?.matchTimer;
  const running = !!mt?.runningAt;
  const status = state.score?.status || 'belum';
  const statusColor = status === 'selesai' ? GOLD : status === 'berlangsung' ? TEAL : 'rgba(244,244,239,0.45)';
  // tick lokal agar angka bergerak tanpa menunggu state update dari server
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const elapsed = (mt?.elapsedMs || 0) + (running && mt?.runningAt ? Date.now() - mt.runningAt : 0);
  return (
    <div
      className="absolute"
      style={{
        left: 960,
        top: 2,
        transform: 'translateX(-50%)',
        width: 156,
        textAlign: 'center',
        pointerEvents: 'none',
        padding: '4px 0 3px',
        background: 'linear-gradient(180deg, rgba(10,18,14,0.88) 0%, rgba(10,18,14,0.78) 100%)',
        clipPath: 'polygon(6% 0, 94% 0, 100% 28%, 100% 100%, 0 100%, 0 28%)'
      }}
      data-testid="se-series"
    >
      <div
        className="font-display leading-none tabular-nums"
        style={{ fontSize: 34, color: WHITE, textShadow: '0 0 14px rgba(225,170,43,0.35)', lineHeight: '34px' }}
      >
        <span data-testid="se-series-blue">{blue}</span>
        <span style={{ color: 'rgba(244,244,239,0.4)', margin: '0 4px' }}>:</span>
        <span data-testid="se-series-red">{red}</span>
      </div>
      <div
        className="font-display tabular-nums"
        data-testid="se-timer"
        style={{
          marginTop: 2,
          fontSize: 17,
          letterSpacing: '0.12em',
          color: running ? TEAL : 'rgba(244,244,239,0.55)',
          lineHeight: '19px'
        }}
      >
        {fmtMMSS(elapsed)}
      </div>
      {meta ? (
        <div
          className="font-display uppercase"
          style={{ marginTop: 2, fontSize: 9, letterSpacing: '0.16em', color: GOLD, lineHeight: '10px' }}
        >
          {meta}
        </div>
      ) : null}
      <div
        data-testid="se-status"
        className="font-display uppercase"
        style={{
          marginTop: 2,
          fontSize: 9,
          letterSpacing: '0.22em',
          color: statusColor,
          border: `1px solid ${statusColor}`,
          padding: '1px 7px',
          display: 'inline-block',
          lineHeight: '11px'
        }}
      >
        {status}
      </div>
    </div>
  );
}

/** MVP di bawah strip statistik, di tengah. */
function MvpBadge({ state }) {
  const name = state.score?.mvpPlayer || '';
  const heroId = state.score?.mvpHeroId;
  if (!name && !heroId) return null;
  return (
    <div
      data-testid="se-mvp"
      className="absolute font-display"
      style={{
        left: 960,
        top: 162,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '4px 18px',
        background: 'linear-gradient(90deg, rgba(20,43,34,0) 0%, rgba(20,43,34,0.88) 18%, rgba(20,43,34,0.88) 82%, rgba(20,43,34,0) 100%)',
        border: `1px solid ${GOLD}`,
        borderRadius: 2,
        pointerEvents: 'none'
      }}
    >
      <span style={{ fontSize: 13, letterSpacing: '0.28em', color: GOLD }}>MVP</span>
      <span style={{ fontSize: 22, color: WHITE, letterSpacing: '0.06em' }}>{name || '–'}</span>
    </div>
  );
}

/** Badge pemenang — di bawah MVP, agar tidak menutupi strip statistik. */
function WinnerBadge({ state }) {
  const winner = state.score?.winner;
  const status = state.score?.status;
  if (!winner || status !== 'selesai') return null;
  const name = state.teams?.[winner]?.name || sideLabel(winner);
  const color = winner === 'blue' ? TEAL : '#e86a6a';
  return (
    <div
      data-testid="se-winner"
      className="absolute font-display"
      style={{
        left: 960,
        top: 200,
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '5px 22px',
        background: 'rgba(10,16,14,0.9)',
        border: `1.5px solid ${color}`,
        pointerEvents: 'none'
      }}
    >
      <span style={{ fontSize: 16, letterSpacing: '0.32em', color: GOLD_LIGHT }}>VICTORY</span>
      <span style={{ fontSize: 22, color, letterSpacing: '0.06em' }}>{name}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- halaman */

export default function OverlaySponsorEdition() {
  useOverlayMode();
  const snap = useStore();
  const state = snap.state || {};
  const [svgMarkup, setSvgMarkup] = useState('');

  // Muat SVG frame (sponsor tertanam) sebagai layer bawah — desain asli
  // dipertahankan 100%; layer React di atas hanya menambah data dinamis.
  useEffect(() => {
    let cancelled = false;
    fetch('/overlay/templates/sponsor-edition.html')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((html) => {
        if (cancelled) return;
        const m = html.match(/<svg[\s\S]*<\/svg>/);
        if (!m) return;
        // Override positioning class agar muat di dalam Stage 1920×1080
        const svg = m[0].replace(
          'class="overlay"',
          'style="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;overflow:visible"'
        );
        setSvgMarkup(svg);
      })
      .catch(() => {
        /* frame kosong — data tetap tampil di layer React */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const score = state.score || {};
  const started = score.status !== 'belum';
  const showLogos = state.overlay?.showLogos !== false;

  return (
    <Stage>
      {/* layer 1: SVG frame Sponsor Edition (desain + 10 logo sponsor) */}
      <div
        data-testid="se-frame"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />

      {/* layer 2: data pertandingan live (state yang sama dengan scoreboard) */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} data-testid="se-data-layer">
        <TeamKill side="blue" score={score} started={started} />
        <TeamKill side="red" score={score} started={started} />
        <TeamName side="blue" teams={state.teams} show={showLogos} />
        <TeamName side="red" teams={state.teams} show={showLogos} />
        <StatsStrip side="blue" score={score} started={started} />
        <StatsStrip side="red" score={score} started={started} />
        <CenterSeries state={state} />
        <WinnerBadge state={state} />
        <MvpBadge state={state} />
      </div>
    </Stage>
  );
}
