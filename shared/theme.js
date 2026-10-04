/**
 * shared/theme.js
 * ---------------------------------------------------------------------------
 * Sumber kebenaran tunggal untuk sistem tema scoreboard.
 *   - dipakai server  : menyaring & memvalidasi konfigurasi (server tetap otoritatif)
 *   - dipakai klien   : preview instan + menghasilkan CSS variable
 *
 * Aturan penting:
 *   - Konfigurasi tema terpisah dari data pertandingan (skor/draft tidak
 *     menyentuh tema, tema tidak menyentuh skor).
 *   - Tidak ada nilai "aneh": semua warna harus #RRGGBB, semua angka di-clamp,
 *     semua string dipotong panjang maksimumnya.
 * ---------------------------------------------------------------------------
 */

/** Palet awal (referensi desain) — tersedia untuk color picker. */
export const PALETTE = {
  primaryNavy: '#24374E',
  darkGreen: '#2D4C39',
  teal: '#4FA4A5',
  gold: '#E5A823',
  neutralGray: '#B2B2B2',
  deepBurgundy: '#420217',
  cream: '#F3EFE0'
};

/** Kunci warna wajib pada tema. */
export const COLOR_KEYS = [
  'primary',
  'secondary',
  'accent',
  'border',
  'background',
  'text',
  'teamA',
  'teamB',
  'highlight',
  'timer'
];

export const COLOR_LABELS = {
  primary: 'Primary color',
  secondary: 'Secondary color',
  accent: 'Accent color',
  border: 'Border color',
  background: 'Background color',
  text: 'Text color',
  teamA: 'Team A color',
  teamB: 'Team B color',
  highlight: 'Scoreboard highlight',
  timer: 'Timer & status'
};

/** Batas untuk setiap bagian tema (dicegah nilai ekstrem yang merusak layout). */
const LIMITS = {
  borderPx: [1, 16],
  deco: [0, 100],
  textScale: [0.8, 1.4],
  logoTournamentScale: [0.4, 2],
  logoTeamScale: [0.5, 2],
  logoSponsorScale: [0.5, 2],
  logoX: [-420, 420],
  logoY: [-90, 90],
  maxSponsors: 6,
  maxCustomPresets: 12
};

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#[0-9a-fA-F]{3}$/;

export function isHexColor(v) {
  return typeof v === 'string' && (HEX6.test(v) || HEX3.test(v));
}

function normHex(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (HEX6.test(s)) return s.toUpperCase();
  if (HEX3.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  }
  return null;
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(v, min, max, fallback) {
  return Math.round(clampNum(v, min, max, fallback));
}

function str(v, max) {
  return String(v ?? '').slice(0, max);
}

function bool(v, fallback) {
  return typeof v === 'boolean' ? v : fallback;
}

/* ------------------------------------------------------------------ preset */

/** Warna default (tema generik gelap + aksen emas, aman untuk semua siaran). */
export const DEFAULT_THEME_COLORS = {
  primary: PALETTE.primaryNavy,
  secondary: PALETTE.darkGreen,
  accent: PALETTE.gold,
  border: PALETTE.gold,
  background: PALETTE.primaryNavy,
  text: PALETTE.cream,
  teamA: PALETTE.gold,
  teamB: PALETTE.teal,
  highlight: PALETTE.gold,
  timer: PALETTE.teal
};

/**
 * Preset bawaan. preset = konfigurasi tema, bukan desain terkunci —
 * semuanya tetap bisa diedit setelah dipakai.
 */
export const BUILTIN_PRESETS = [
  {
    id: 'rrq-gold',
    name: 'RRQ-Inspired Gold',
    description: 'Dominan gold & putih, border geometris, header turnamen kuat.',
    colors: {
      primary: PALETTE.gold,
      secondary: PALETTE.cream,
      accent: PALETTE.deepBurgundy,
      border: PALETTE.gold,
      background: PALETTE.cream,
      text: PALETTE.deepBurgundy,
      teamA: PALETTE.deepBurgundy,
      teamB: PALETTE.primaryNavy,
      highlight: PALETTE.gold,
      timer: PALETTE.deepBurgundy
    }
  },
  {
    id: 'navy-tournament',
    name: 'Navy Tournament',
    description: 'Primary #24374E, accent #E5A823, kontras tinggi untuk siaran.',
    colors: {
      primary: PALETTE.primaryNavy,
      secondary: PALETTE.neutralGray,
      accent: PALETTE.gold,
      border: PALETTE.gold,
      background: PALETTE.primaryNavy,
      text: PALETTE.cream,
      teamA: PALETTE.gold,
      teamB: PALETTE.teal,
      highlight: PALETTE.gold,
      timer: PALETTE.gold
    }
  },
  {
    id: 'modern-teal',
    name: 'Modern Teal',
    description: 'Primary #24374E, accent #4FA4A5, secondary #2D4C39 — minimal.',
    colors: {
      primary: PALETTE.primaryNavy,
      secondary: PALETTE.darkGreen,
      accent: PALETTE.teal,
      border: PALETTE.teal,
      background: PALETTE.primaryNavy,
      text: PALETTE.cream,
      teamA: PALETTE.teal,
      teamB: PALETTE.cream,
      highlight: PALETTE.teal,
      timer: PALETTE.teal
    }
  }
];

export const VISIBILITY_KEYS = [
  'header',
  'frame',
  'tournamentLogo',
  'teamLogos',
  'sponsors',
  'caster',
  'info',
  'score',
  'stats',
  'lineup',
  'timer',
  'mvp',
  'winner'
];

const DEFAULT_VISIBILITY = {
  header: true,
  frame: true,
  tournamentLogo: true,
  teamLogos: true,
  sponsors: true,
  caster: true,
  info: true,
  score: true,
  stats: true,
  lineup: true,
  timer: true,
  mvp: true,
  winner: true
};

export function defaultTheme() {
  return {
    presetId: 'navy-tournament',
    colors: { ...DEFAULT_THEME_COLORS },
    frame: { borderPx: 4, deco: 100 },
    text: { scale: 1, uppercase: true },
    logo: {
      tournamentScale: 1,
      tournamentX: 0,
      tournamentY: 0,
      teamScale: 1,
      sponsorScale: 1
    },
    visible: { ...DEFAULT_VISIBILITY },
    sponsors: [],
    caster: '',
    info: '',
    /** preset kustom milik operator */
    presets: []
  };
}

export function builtinPreset(id) {
  return BUILTIN_PRESETS.find((p) => p.id === id) || null;
}

/** Terapkan preset (bawaan ATAU kustom) ke tema; preset lain tetap dipertahankan. */
export function applyPreset(theme, presetId) {
  const t = sanitizeTheme(theme);
  const custom = (t.presets || []).find((p) => p.id === presetId);
  const src = custom || builtinPreset(presetId);
  if (!src) return t;
  const colors = {};
  COLOR_KEYS.forEach((k) => {
    colors[k] = normHex(src.colors?.[k]) || t.colors[k];
  });
  return { ...t, presetId, colors };
}

/* -------------------------------------------------------------- penyaringan */

/**
 * Menyaring tema masuk menjadi tema utuh yang selalu valid.
 * `prev` dipakai untuk mempertahankan nilai lama bila ada field hilang/tidak
 * valid — tidak pernah melempar error, tidak pernah menghasilkan field aneh.
 */
export function sanitizeTheme(input, prev = defaultTheme()) {
  const base = sanitizeThemeShapes(prev);
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = defaultTheme();

  out.presetId = str(raw.presetId || base.presetId, 40) || base.presetId;

  COLOR_KEYS.forEach((k) => {
    const v = normHex(raw.colors?.[k]);
    out.colors[k] = v || base.colors[k];
  });

  out.frame.borderPx = clampInt(raw.frame?.borderPx, LIMITS.borderPx[0], LIMITS.borderPx[1], base.frame.borderPx);
  out.frame.deco = clampInt(raw.frame?.deco, LIMITS.deco[0], LIMITS.deco[1], base.frame.deco);

  out.text.scale = clampNum(raw.text?.scale, LIMITS.textScale[0], LIMITS.textScale[1], base.text.scale);
  out.text.uppercase = bool(raw.text?.uppercase, base.text.uppercase);

  out.logo.tournamentScale = clampNum(
    raw.logo?.tournamentScale,
    LIMITS.logoTournamentScale[0],
    LIMITS.logoTournamentScale[1],
    base.logo.tournamentScale
  );
  out.logo.tournamentX = clampNum(raw.logo?.tournamentX, LIMITS.logoX[0], LIMITS.logoX[1], base.logo.tournamentX);
  out.logo.tournamentY = clampNum(raw.logo?.tournamentY, LIMITS.logoY[0], LIMITS.logoY[1], base.logo.tournamentY);
  out.logo.teamScale = clampNum(
    raw.logo?.teamScale,
    LIMITS.logoTeamScale[0],
    LIMITS.logoTeamScale[1],
    base.logo.teamScale
  );
  out.logo.sponsorScale = clampNum(
    raw.logo?.sponsorScale,
    LIMITS.logoSponsorScale[0],
    LIMITS.logoSponsorScale[1],
    base.logo.sponsorScale
  );

  VISIBILITY_KEYS.forEach((k) => {
    out.visible[k] = bool(raw.visible?.[k], base.visible[k]);
  });

  const rawSponsors = Array.isArray(raw.sponsors) ? raw.sponsors : base.sponsors;
  out.sponsors = rawSponsors
    .map((s) => (isSponsorUrl(s) ? s : null))
    .filter(Boolean)
    .slice(0, LIMITS.maxSponsors);

  out.caster = str(raw.caster, 48);
  out.info = str(raw.info, 80);

  out.presets = sanitizeCustomPresets(raw.presets, base.presets);

  return out;
}

/** Bentuk (tanpa warna) dipertahankan dari tema lama saat field hilang. */
function sanitizeThemeShapes(prev) {
  const d = defaultTheme();
  const p = prev && typeof prev === 'object' ? prev : {};
  return {
    presetId: str(p.presetId, 40) || d.presetId,
    colors: (() => {
      const c = { ...d.colors };
      COLOR_KEYS.forEach((k) => {
        c[k] = normHex(p.colors?.[k]) || c[k];
      });
      return c;
    })(),
    frame: {
      borderPx: clampInt(p.frame?.borderPx, ...LIMITS.borderPx, d.frame.borderPx),
      deco: clampInt(p.frame?.deco, ...LIMITS.deco, d.frame.deco)
    },
    text: {
      scale: clampNum(p.text?.scale, ...[LIMITS.textScale[0], LIMITS.textScale[1]], d.text.scale),
      uppercase: bool(p.text?.uppercase, d.text.uppercase)
    },
    logo: {
      tournamentScale: clampNum(p.logo?.tournamentScale, ...[0.4, 2], d.logo.tournamentScale),
      tournamentX: clampNum(p.logo?.tournamentX, ...[-420, 420], d.logo.tournamentX),
      tournamentY: clampNum(p.logo?.tournamentY, ...[-90, 90], d.logo.tournamentY),
      teamScale: clampNum(p.logo?.teamScale, ...[0.5, 2], d.logo.teamScale),
      sponsorScale: clampNum(p.logo?.sponsorScale, ...[0.5, 2], d.logo.sponsorScale)
    },
    visible: (() => {
      const v = { ...d.visible };
      VISIBILITY_KEYS.forEach((k) => {
        v[k] = bool(p.visible?.[k], v[k]);
      });
      return v;
    })(),
    sponsors: Array.isArray(p.sponsors) ? p.sponsors : [],
    caster: str(p.caster, 48),
    info: str(p.info, 80),
    presets: Array.isArray(p.presets) ? p.presets : []
  };
}

/**
 * URL sponsor: sama ketatnya dengan logo — data:image, http/https milik sendiri,
 * atau path lokal /assets/; tanpa protocol-relative, javascript:, atau `..`.
 */
export function isSponsorUrl(v) {
  if (typeof v !== 'string' || !v) return false;
  if (v.startsWith('data:image/')) return v.length <= 1500000;
  if (v.length > 4096) return false;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(v)) return true;
  if (v.startsWith('/assets/') && !v.includes('..') && !v.includes('\\')) return true;
  return false;
}

function sanitizeCustomPresets(raw, prevRaw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(prevRaw) ? prevRaw : [];
  const seen = new Set();
  const out = [];
  list.forEach((p) => {
    if (!p || typeof p !== 'object' || out.length >= LIMITS.maxCustomPresets) return;
    const id = str(p.id, 40).replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 40);
    const name = str(p.name, 32).trim();
    if (!id || !name || seen.has(id)) return;
    seen.add(id);
    const colors = {};
    COLOR_KEYS.forEach((k) => {
      const v = normHex(p.colors?.[k]);
      if (v) colors[k] = v;
    });
    if (Object.keys(colors).length === 0) return;
    out.push({ id, name, colors });
  });
  return out;
}

/**
 * Menyaring patch parsial (dipakai server): `incoming` di-merge ke `prev`
 * lalu lewat sanitizeTheme penuh. Mengembalikan { theme, errors } — errors
 * berisi pesan validasi bila ada nilai tidak sah (untuk umpan balik operator).
 */
export function validateThemePatch(incoming, prev) {
  const errors = [];
  if (incoming == null) return { theme: sanitizeTheme(prev, prev), errors };
  if (typeof incoming !== 'object' || Array.isArray(incoming)) {
    errors.push('Tema harus berupa objek.');
    return { theme: sanitizeTheme(prev, prev), errors };
  }

  if (incoming.colors != null) {
    if (typeof incoming.colors !== 'object' || Array.isArray(incoming.colors)) {
      errors.push('colors harus berupa objek.');
    } else {
      Object.entries(incoming.colors).forEach(([k, v]) => {
        if (!COLOR_KEYS.includes(k)) return; // kunci tak dikenal: abaikan diam-diam
        if (!isHexColor(v)) errors.push(`Warna ${k} tidak valid (pakai #RRGGBB).`);
      });
    }
  }
  if (incoming.sponsors != null) {
    if (!Array.isArray(incoming.sponsors)) errors.push('sponsors harus berupa daftar.');
    else {
      if (incoming.sponsors.length > LIMITS.maxSponsors) errors.push(`sponsor maksimal ${LIMITS.maxSponsors}.`);
      incoming.sponsors.forEach((s) => {
        if (!isSponsorUrl(s)) errors.push('URL sponsor tidak valid (harus http/https, data:image, atau /assets/...).');
      });
    }
  }
  if (incoming.presets != null && !Array.isArray(incoming.presets)) errors.push('presets harus berupa daftar.');
  if (incoming.visible != null && (typeof incoming.visible !== 'object' || Array.isArray(incoming.visible))) {
    errors.push('visible harus berupa objek.');
  }

  return { theme: sanitizeTheme(incoming, prev), errors };
}

/* --------------------------------------------------------- CSS variables */

/** Nama CSS variable untuk satu kunci warna. */
function colorVar(key) {
  return `--sc-${key === 'background' ? 'bg' : key === 'teamA' ? 'team-a' : key === 'teamB' ? 'team-b' : key}`;
}

/**
 * Objek style React berisi CSS variable — dipasang di root overlay maupun
 * di preview control panel sehingga keduanya selalu identik.
 */
export function themeStyle(theme) {
  const t = sanitizeTheme(theme);
  const style = {};
  COLOR_KEYS.forEach((k) => {
    style[colorVar(k)] = t.colors[k];
  });
  style['--sc-border-px'] = `${t.frame.borderPx}px`;
  style['--sc-deco'] = `${t.frame.deco}`;
  style['--sc-text-scale'] = `${t.text.scale}`;
  style['--sc-logo-t'] = `${t.logo.tournamentScale}`;
  style['--sc-logo-team'] = `${t.logo.teamScale}`;
  style['--sc-logo-sponsor'] = `${t.logo.sponsorScale}`;
  style['--sc-logo-x'] = `${t.logo.tournamentX}px`;
  style['--sc-logo-y'] = `${t.logo.tournamentY}px`;
  return style;
}

/** #RRGGBB + alpha (0..1) → rgba(...) untuk lapisan panel. */
export function withAlpha(hex, alpha) {
  const c = normHex(hex) || '#000000';
  const r = parseInt(c.slice(1, 3), 16);
  const g = parseInt(c.slice(3, 5), 16);
  const b = parseInt(c.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
