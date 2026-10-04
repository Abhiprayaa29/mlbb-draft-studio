/**
 * server/index.js
 * ---------------------------------------------------------------------------
 * MLBB Draft Studio — backend Express + Socket.IO.
 *   - Menyediakan REST API untuk database hero & pengelolaan pertandingan.
 *   - Menyiarkan state draft/score secara real-time ke control panel & overlay.
 *   - Menyimpan state ke file JSON lokal (autosave + simpan/muat manual).
 *
 * Konfigurasi lewat environment variable (lihat README bagian Multi-PC):
 *   HOST            alamat bind server      (default 127.0.0.1 — hanya lokal)
 *   PORT            port HTTP               (alias SERVER_PORT, default 5174)
 *   CLIENT_ORIGIN   daftar origin yang diizinkan (pisahkan dengan koma)
 *   APP_AUTH_TOKEN  token wajib untuk aksi operator (mode LAN aman)
 *   DATA_DIR        direktori penyimpanan   (default server/data)
 *
 * Port internal : 5174  (di-proxy oleh Vite di 5173 saat mode dev)
 * ---------------------------------------------------------------------------
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server as SocketServer } from 'socket.io';

import {
  createInitialState,
  pickHero,
  undoLast,
  resetDraft,
  setPreset,
  toggleLock,
  setAllowDuplicates,
  timerCommand,
  tickTimer,
  nextGame,
  setEmergency,
  phase,
  currentAction,
  sanitizeIntegration
} from './draftEngine.js';
import { PRESETS, validatePreset, MAX_PICKS_PER_TEAM } from './presets.js';
import { validateThemePatch, sanitizeTheme } from '../shared/theme.js';
import * as store from './store.js';
import * as storage from './storage.js';
import { createGridController } from './grid/index.js';
import { createBroadcastController } from './grid/broadcast-controller.js';
import { readConfig, redacted, DATA_SOURCES, AUTOMATION_MODES } from './grid/config.js';
import * as gridAudit from './grid/audit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 5174);
const HOST = process.env.HOST || '127.0.0.1';
const IS_PROD = process.env.NODE_ENV === 'production';
const APP_AUTH_TOKEN = String(process.env.APP_AUTH_TOKEN || '');
const CLIENT_ORIGIN = String(process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const DATA_DIR = storage.DATA_DIR;
/**
 * Datasets statis (hero, skill, build, emblem, spell) selalu dibaca dari
 * paket data bawaan — tidak ikut berpindah bila DATA_DIR dipindahkan.
 * DATA_DIR hanya untuk data berubah-ubah (state, match, backup, logo).
 */
const STATIC_DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');

/* ------------------------------------------------------------ dataset lokal */

function readJsonFile(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    console.warn(`[data] gagal membaca ${path.basename(p)}: ${e.message}`);
    return fallback;
  }
}

const heroes = readJsonFile(path.join(STATIC_DATA_DIR, 'heroes.json'), []);
const heroSkills = readJsonFile(path.join(STATIC_DATA_DIR, 'hero-skills.json'), {});
const metaTiers = readJsonFile(path.join(STATIC_DATA_DIR, 'meta-tiers.json'), { lanes: {}, counterPicks: {}, heroTier: {} });
const equipment = readJsonFile(path.join(STATIC_DATA_DIR, 'equipment.json'), { items: [] });
const emblems = readJsonFile(path.join(STATIC_DATA_DIR, 'emblems.json'), { emblems: [] });
const builds = readJsonFile(path.join(STATIC_DATA_DIR, 'builds.json'), { builds: [] });
const manifest = readJsonFile(path.join(PUBLIC_DIR, 'assets', 'manifest.json'), null);

const heroById = new Map(heroes.map((h) => [h.id, h]));

/**
 * Battle spell opsional. Skema (server/data/battle-spells.json):
 *   { "version": 1,
 *     "spells": [ { "id", "name", "icon", "description" } ],
 *     "heroSpells": { "<heroId>": ["<spellId>", ...] } }
 * `icon` adalah path relatif terhadap public/assets/ dan wajib berfile nyata.
 * Bila data tidak ada/tidak valid, endpoint mengembalikan daftar kosong dan
 * UI tidak menampilkan apa pun (tidak ada placeholder menyesatkan).
 */
function loadBattleSpells() {
  const raw = readJsonFile(path.join(STATIC_DATA_DIR, 'battle-spells.json'), null);
  const empty = { spells: [], heroSpells: {} };
  if (!raw || !Array.isArray(raw.spells)) return empty;
  const byId = new Map();
  raw.spells.forEach((s) => {
    if (!s || typeof s.id !== 'string' || typeof s.name !== 'string') return;
    if (!/^[a-z0-9-]{1,40}$/.test(s.id)) return;
    const icon = typeof s.icon === 'string' ? s.icon : '';
    // cegah path traversal & pastikan file ikon benar-benar ada
    const safe = icon && !icon.includes('..') && !path.isAbsolute(icon) ? icon : null;
    const file = safe ? path.join(PUBLIC_DIR, 'assets', safe) : null;
    if (!file || !fs.existsSync(file)) return; // tanpa ikon -> tidak ditampilkan
    byId.set(s.id, {
      id: s.id,
      name: s.name.slice(0, 40),
      icon: `/assets/${safe.replace(/\\/g, '/')}`,
      description: typeof s.description === 'string' ? s.description.slice(0, 240) : ''
    });
  });
  const heroSpells = {};
  Object.entries(raw.heroSpells || {}).forEach(([heroId, list]) => {
    if (!heroById.has(heroId) || !Array.isArray(list)) return;
    const ids = list.filter((x) => byId.has(x));
    if (ids.length) heroSpells[heroId] = ids;
  });
  return { spells: [...byId.values()], heroSpells };
}

const battleSpells = loadBattleSpells();

if (heroes.length === 0) {
  console.warn('[data] heroes.json kosong — jalankan "npm run data:fetch" untuk mengisi database hero.');
}
if (battleSpells.spells.length === 0) {
  console.warn('[data] battle-spells.json kosong/tanpa ikon — bagian battle spell disembunyikan di UI.');
}

/* ------------------------------------------------------------- aplikasi web */

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

/** Origin diizinkan bila CLIENT_ORIGIN kosong (mode lokal/LAN tepercaya). */
function originAllowed(origin) {
  if (!origin) return true;
  if (CLIENT_ORIGIN.length === 0) return true;
  return CLIENT_ORIGIN.includes(origin);
}

// Validasi Origin: blokir permintaan lintas-origin yang tidak terdaftar.
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    if (!originAllowed(origin)) {
      return res.status(403).json({ error: 'Origin tidak diizinkan.' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-operator-token, authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
});

/** Token operator diterima lewat header — TIDAK pernah lewat URL overlay. */
function hasOperatorToken(req) {
  if (!APP_AUTH_TOKEN) return true;
  const h = req.headers['x-operator-token'];
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return h === APP_AUTH_TOKEN || bearer === APP_AUTH_TOKEN;
}

function requireOperator(req, res, next) {
  if (hasOperatorToken(req)) return next();
  res.status(401).json({ error: 'Token operator diperlukan.' });
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    heroes: heroes.length,
    revision: store.getState().revision,
    serverNow: Date.now(),
    presence,
    autosave: store.status(),
    authRequired: !!APP_AUTH_TOKEN,
    host: HOST,
    port: PORT,
    // status integrasi (tanpa secret; CONNECTED hanya bila tervalidasi)
    integration: (() => {
      try {
        return { status: gridStatusPublic().status, enabled: !!store.getState().integration?.enabled };
      } catch {
        return { status: 'disabled', enabled: false };
      }
    })()
  });
});

app.get('/api/state', (_req, res) => res.json({ state: store.getState(), serverNow: Date.now() }));

app.get('/api/heroes', (req, res) => {
  const { q = '', role = '', lane = '' } = req.query;
  const ql = String(q).toLowerCase().trim();
  const list = heroes.filter((h) => {
    if (ql && !h.name.toLowerCase().includes(ql)) return false;
    if (role && !(h.roles || []).some((r) => r.toLowerCase() === String(role).toLowerCase())) return false;
    if (lane && !(h.lanes || []).some((l) => l.toLowerCase() === String(lane).toLowerCase())) return false;
    return true;
  });
  res.json({ total: list.length, heroes: list, facets: facets() });
});

function facets() {
  const roles = new Map();
  const lanes = new Map();
  heroes.forEach((h) => {
    (h.roles || []).forEach((r) => roles.set(r, (roles.get(r) || 0) + 1));
    (h.lanes || []).forEach((l) => lanes.set(l, (lanes.get(l) || 0) + 1));
  });
  return {
    roles: [...roles.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    lanes: [...lanes.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  };
}

app.get('/api/heroes/:id', (req, res) => {
  const h = heroById.get(req.params.id);
  if (!h) return res.status(404).json({ error: 'Hero tidak ditemukan' });
  res.json({ hero: h, skills: heroSkills[h.id] || [], tier: metaTiers.heroTier?.[h.id] || {}, build: builds.builds.find((b) => b.heroId === h.id) || null });
});

app.get('/api/meta', (_req, res) => res.json(metaTiers));
app.get('/api/equipment', (_req, res) => res.json(equipment));
app.get('/api/emblems', (_req, res) => res.json(emblems));
app.get('/api/builds', (_req, res) => res.json(builds));
app.get('/api/presets', (_req, res) =>
  res.json({ presets: PRESETS, maxPicksPerTeam: MAX_PICKS_PER_TEAM })
);
app.get('/api/manifest', (_req, res) => res.json(manifest));

app.get('/api/battle-spells', (_req, res) =>
  res.json({
    spells: battleSpells.spells,
    heroSpells: battleSpells.heroSpells,
    available: battleSpells.spells.length > 0
  })
);

/* ------------------------------------------------------------ unggah logo */

const LOGO_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

function sniffImage(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp';
  if (buf.length > 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  return null;
}

/**
 * Unggah logo tim ke penyimpanan lokal.
 * Nama file dihasilkan server (crypto.randomBytes) — klien tidak pernah
 * menentukan path, sehingga path traversal tidak mungkin terjadi.
 */
app.post('/api/logos', requireOperator, (req, res) => {
  const dataUrl = String(req.body?.dataUrl || '');
  const m = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'Format logo harus data URL base64 berbasis gambar.' });
  if (m[2].length > 2000000) return res.status(400).json({ error: 'Logo terlalu besar (maks 1.5 MB).' });
  let buf;
  try {
    buf = Buffer.from(m[2], 'base64');
  } catch {
    return res.status(400).json({ error: 'Base64 logo tidak valid.' });
  }
  if (buf.length > 1500000) return res.status(400).json({ error: 'Logo terlalu besar (maks 1.5 MB).' });
  const sniffed = sniffImage(buf);
  if (!sniffed) return res.status(400).json({ error: 'Tipe file tidak didukung (png/jpg/webp/gif).' });
  try {
    fs.mkdirSync(storage.LOGO_DIR, { recursive: true });
    const name = `logo-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${LOGO_MIME[sniffed]}`;
    fs.writeFileSync(path.join(storage.LOGO_DIR, name), buf);
    res.json({ ok: true, url: `/assets/logos/${name}`, type: sniffed, size: buf.length });
  } catch (e) {
    console.error('[logos]', e.message);
    res.status(500).json({ error: 'Gagal menyimpan logo.' });
  }
});

/* ------------------------------------------------------------- match routes */

app.get('/api/matches', (_req, res) => res.json({ matches: store.listMatches() }));

app.post('/api/matches', requireOperator, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nama match wajib diisi' });
  const doc = store.saveMatch(name);
  res.json({ ok: true, id: doc.matchId, matches: store.listMatches() });
});

app.get('/api/matches/:id', (req, res) => {
  const doc = store.readMatch(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Match tidak ditemukan' });
  res.json({ match: doc });
});

app.post('/api/matches/:id/load', requireOperator, (req, res) => {
  const doc = store.readMatch(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Match tidak ditemukan' });
  const st = normalizeLoaded(doc);
  store.setState(st);
  broadcast();
  res.json({ ok: true, state: st, serverNow: Date.now() });
});

app.delete('/api/matches/:id', requireOperator, (req, res) => {
  const ok = store.deleteMatch(req.params.id);
  res.json({ ok, matches: store.listMatches() });
});

function normalizeLoaded(doc) {
  const base = createInitialState();
  const st = { ...base, ...doc };
  st.teams = { blue: { ...base.teams.blue, ...doc.teams?.blue }, red: { ...base.teams.red, ...doc.teams?.red } };
  st.score = { ...base.score, ...doc.score };
  st.overlay = { ...base.overlay, ...doc.overlay };
  // konfigurasi tema dari match lama (bisa belum punya tema) disaring ulang
  st.overlay.theme = sanitizeTheme(doc.overlay?.theme, base.overlay.theme);
  st.meta = { ...base.meta, ...doc.meta };
  st.integration = sanitizeIntegration(doc.integration);
  st.draft = { ...base.draft, ...(doc.draft || {}) };
  st.draft.timer = { ...base.draft.timer, ...(doc.draft?.timer || {}), running: false, deadlineAt: null };
  st.draft.log = Array.isArray(doc.draft?.log) ? doc.draft.log : [];
  st.draft.entries = Array.isArray(doc.draft?.entries) ? doc.draft.entries : [];
  st.draft.used = doc.draft?.used && typeof doc.draft.used === 'object' ? doc.draft.used : {};
  if (!Array.isArray(st.draft.actions) || st.draft.actions.length === 0) {
    const p = PRESETS.find((x) => x.id === st.draft.presetId) || PRESETS[0];
    st.draft.actions = p.actions.map((a, i) => ({ i, team: a.team, type: a.type }));
    st.draft.presetId = p.id;
    st.draft.presetName = p.name;
  }
  st.revision = (doc.revision || 0) + 1;
  st.updatedAt = new Date().toISOString();
  return st;
}

/* -------------------------------------------------------------- static web */

app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: IS_PROD ? '7d' : 0, fallthrough: true }));
// logo tim yang diunggah operator (nama file dibuat server)
app.use('/assets/logos', express.static(storage.LOGO_DIR, { maxAge: IS_PROD ? '30d' : 0, fallthrough: true }));
app.use(express.static(PUBLIC_DIR, { index: false }));

if (IS_PROD) {
  if (fs.existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api|socket\.io|assets).*/, (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
  } else {
    app.get('/', (_req, res) =>
      res.status(503).type('text/plain').send('Build belum tersedia. Jalankan "npm run build" lalu "npm start".')
    );
  }
}

// wajib setelah semua static: aset bundler (dist/assets) baru dilayani di atas
app.use('/assets', (_req, res) => res.status(404).type('text/plain').send('aset tidak ditemukan'));

app.use((err, _req, res, _next) => {
  console.error('[http]', err.message);
  res.status(500).json({ error: 'Kesalahan server' });
});

/* ---------------------------------------------------------------- socket.io */

const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: (origin, cb) => cb(null, originAllowed(origin)),
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 8000
});

const presence = { control: 0, overlay: 0 };

/**
 * Peran klien:
 *   - 'overlay' : baca-saja (OBS). TIDAK BOLEH mengubah state apa pun.
 *   - 'control' : operator. Bila APP_AUTH_TOKEN di-set, wajib menyertakan
 *                 token lewat `auth` handshake (bukan lewat URL).
 */
function socketIsOperator(socket) {
  if (socket.data.role !== 'control') return false;
  if (!APP_AUTH_TOKEN) return true;
  const token = socket.handshake.auth?.token;
  return typeof token === 'string' && token === APP_AUTH_TOKEN;
}

/** Penolakan aksi mutasi dari klien overlay / tanpa token operator. */
function denyMutation(socket) {
  if (socket.data.role !== 'control') {
    return { ok: false, error: 'Koneksi overlay bersifat baca-saja.' };
  }
  if (!APP_AUTH_TOKEN) return null;
  if (!socketIsOperator(socket)) {
    return { ok: false, error: 'Token operator tidak valid.', needAuth: true };
  }
  return null;
}

/**
 * Validasi logo: data:image, http/https, atau path lokal /assets/ milik kita.
 * Menolak protocol-relative (//host), javascript:, dan path traversal.
 */
function isUsableLogoUrl(v) {
  if (typeof v !== 'string' || !v) return false;
  if (v.startsWith('data:image/')) return v.length <= 1500000;
  if (v.length > 4096) return false;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(v)) return true;
  if (v.startsWith('/assets/') && !v.includes('..') && !v.includes('\\')) return true;
  return false;
}

/** Status autosave untuk disiarkan ke klien (tanpa path filesystem). */
function autosaveStatus() {
  const s = store.status();
  const { dir, ...rest } = s;
  return rest;
}

function broadcast() {
  io.emit('state', { state: store.getState(), serverNow: Date.now(), autosave: autosaveStatus() });
}

function broadcastPresence() {
  io.emit('presence', { ...presence, serverNow: Date.now() });
}

/** Menjalankan mutator, menolak bila mengembalikan error, lalu siarkan. */
function mutate(fn) {
  const before = store.getState();
  const snapshot = JSON.parse(JSON.stringify(before));
  let result;
  try {
    result = fn(snapshot);
  } catch (e) {
    console.error('[mutate]', e);
    return { ok: false, error: 'Kesalahan internal saat memproses permintaan.' };
  }
  if (result?.error) {
    return { ok: false, error: result.error, state: before, serverNow: Date.now() };
  }
  const next = result?.state || snapshot;
  store.setState(next);
  broadcast();
  return { ok: true, state: next, serverNow: Date.now() };
}

function requireHero(heroId) {
  if (!heroById.has(heroId)) return `Hero tidak dikenal: ${heroId}`;
  return null;
}

/**
 * Terapkan patch skor (dipakai operator `score:update` DAN pipeline GRID
 * secara identik — satu jalur validasi, tanpa duplikasi aturan).
 * Hanya field yang ada di patch yang disentuh (unknown != zero).
 */
function applyScorePatch(s, p) {
  ['blue', 'red'].forEach((side) => {
    if (p[side] && typeof p[side] === 'object') {
      Object.entries(p[side]).forEach(([k, v]) => {
        if (k in s.score[side]) s.score[side][k] = Math.max(0, Number(v) || 0);
      });
    }
  });
  ['durationMs', 'mvpPlayer', 'mvpHeroId', 'winner', 'status', 'notes'].forEach((k) => {
    if (k in p) s.score[k] = p[k];
  });
  if ('durationMs' in p) s.score.durationMs = Math.max(0, Number(p.durationMs) || 0);
  if ('winner' in p && p.winner && !['blue', 'red'].includes(p.winner)) s.score.winner = null;
  return { ok: true };
}

io.on('connection', (socket) => {
  const role = socket.handshake.query?.role === 'control' ? 'control' : 'overlay';
  presence[role] += 1;
  socket.data.role = role;

  // kirim state awal segera agar client tidak menunggu
  socket.emit('hello', {
    state: store.getState(),
    serverNow: Date.now(),
    presence,
    authRequired: !!APP_AUTH_TOKEN,
    operator: socketIsOperator(socket),
    autosave: autosaveStatus(),
    integrationStatus: gridStatusPublic()
  });
  broadcastPresence();

  const handlers = {
    'draft:pick': (payload, ack) => {
      const bad = requireHero(payload?.heroId);
      if (bad) return ack?.({ ok: false, error: bad });
      const r = mutate((s) => pickHero(s, payload.heroId, { by: socket.id }));
      ack?.(r);
    },
    'draft:undo': (payload, ack) => ack?.(mutate((s) => undoLast(s, { force: !!payload?.force }))),
    'draft:reset': (payload, ack) => {
      const pid = payload?.presetId;
      if (pid && pid !== 'custom' && !PRESETS.some((p) => p.id === pid)) {
        return ack?.({ ok: false, error: 'Preset tidak dikenal.' });
      }
      ack?.(mutate((s) => resetDraft(s, pid)));
    },
    'draft:preset': (payload, ack) => {
      if (payload?.actions) {
        const v = validatePreset(payload.actions);
        if (!v.valid) return ack?.({ ok: false, error: v.errors.join(' ') });
        return ack?.(mutate((s) => setPreset(s, null, payload.actions)));
      }
      if (!PRESETS.some((p) => p.id === payload?.presetId)) {
        return ack?.({ ok: false, error: 'Preset tidak dikenal.' });
      }
      return ack?.(mutate((s) => setPreset(s, payload.presetId)));
    },
    'draft:lock': (payload, ack) =>
      ack?.(mutate((s) => toggleLock(s, Number(payload?.entryIndex), payload?.locked))),
    'draft:allowDuplicates': (payload, ack) =>
      ack?.(mutate((s) => setAllowDuplicates(s, payload?.value))),
    'timer': (payload, ack) => ack?.(mutate((s) => timerCommand(s, payload?.cmd, payload?.value))),
    'team:update': (payload, ack) => {
      const side = payload?.side;
      if (!['blue', 'red'].includes(side)) return ack?.({ ok: false, error: 'Sisi tim tidak valid.' });
      return ack?.(
        mutate((s) => {
          const p = { ...(payload.patch || {}) };
          if ('logo' in p) {
            if (p.logo && !isUsableLogoUrl(p.logo)) {
              return { state: s, error: 'Logo harus URL gambar (http/https), path /assets/..., atau data:image.' };
            }
          }
          if ('players' in p) {
            if (!Array.isArray(p.players)) return { state: s, error: 'Roster harus berupa daftar.' };
            p.players = p.players.slice(0, 5).map((x) => String(x || '').slice(0, 24));
          }
          if ('name' in p) p.name = String(p.name || '').slice(0, 32);
          if ('score' in p) p.score = Math.max(0, Math.min(99, Number(p.score) || 0));
          s.teams[side] = { ...s.teams[side], ...p };
          s.revision += 1;
          s.updatedAt = new Date().toISOString();
          return { state: s };
        })
      );
    },
    'meta:update': (payload, ack) =>
      ack?.(
        mutate((s) => {
          const p = payload?.patch || {};
          const allowed = ['tournament', 'stage', 'gameNumber', 'bestOf', 'round'];
          allowed.forEach((k) => {
            if (k in p) {
              s.meta[k] =
                k === 'gameNumber' || k === 'bestOf' ? Math.max(1, Math.min(9, Number(p[k]) || 1)) : String(p[k]).slice(0, 60);
            }
          });
          if ('matchName' in p) s.matchName = String(p.matchName).slice(0, 60);
          s.revision += 1;
          s.updatedAt = new Date().toISOString();
          return { state: s };
        })
      ),
    'score:update': (payload, ack) =>
      ack?.(
        mutate((s) => {
          const applied = applyScorePatch(s, payload?.patch || {});
          if (applied.error) return { state: s, error: applied.error };
          s.revision += 1;
          s.updatedAt = new Date().toISOString();
          return { state: s };
        })
      ),
    'overlay:update': (payload, ack) =>
      ack?.(
        mutate((s) => {
          const p = payload?.patch || {};
          let themeError = null;
          Object.entries(p).forEach(([k, v]) => {
            if (!(k in s.overlay)) return;
            if (k === 'animMs') s.overlay[k] = Math.max(0, Math.min(3000, Number(v) || 0));
            else if (k === 'announce') s.overlay[k] = v;
            else if (k === 'draftLayout') s.overlay[k] = ['full', 'compact', 'lineup'].includes(v) ? v : s.overlay[k];
            else if (k === 'scoreLayout') s.overlay[k] = ['full', 'compact'].includes(v) ? v : s.overlay[k];
            else if (k === 'brandText') s.overlay[k] = String(v || '').slice(0, 60);
            else if (k === 'brandLogo') s.overlay[k] = v ? (isUsableLogoUrl(v) ? v : s.overlay[k]) : null;
            else if (k === 'emergency') setEmergency(s, !!v);
            else if (k === 'theme') {
              // konfigurasi desain: validasi penuh, ditolak utuh bila ada nilai tak sah
              const checked = validateThemePatch(v, s.overlay.theme);
              if (checked.errors.length) {
                themeError = checked.errors.slice(0, 3).join(' ');
              } else {
                s.overlay.theme = checked.theme;
              }
            } else if (typeof s.overlay[k] === 'boolean') s.overlay[k] = !!v;
            else s.overlay[k] = v;
          });
          if (themeError) return { state: s, error: themeError };
          s.revision += 1;
          s.updatedAt = new Date().toISOString();
          return { state: s };
        })
      ),
    'announce': (payload, ack) =>
      ack?.(
        mutate((s) => {
          s.overlay.announce = payload?.type
            ? { type: String(payload.type), text: String(payload.text || '').slice(0, 80), at: Date.now() }
            : null;
          s.revision += 1;
          s.updatedAt = new Date().toISOString();
          return { state: s };
        })
      ),
    'match:save': (payload, ack) => {
      const name = String(payload?.name || '').trim();
      if (!name) return ack?.({ ok: false, error: 'Nama match wajib diisi.' });
      try {
        const doc = store.saveMatch(name);
        return ack?.({ ok: true, id: doc.matchId, matches: store.listMatches() });
      } catch (e) {
        return ack?.({ ok: false, error: 'Gagal menyimpan: ' + e.message });
      }
    },
    'match:load': (payload, ack) => {
      const doc = store.readMatch(payload?.id);
      if (!doc) return ack?.({ ok: false, error: 'Match tidak ditemukan.' });
      const st = normalizeLoaded(doc);
      store.setState(st);
      broadcast();
      return ack?.({ ok: true, state: st, serverNow: Date.now() });
    },
    'match:delete': (payload, ack) => {
      const ok = store.deleteMatch(payload?.id);
      return ack?.({ ok, matches: store.listMatches() });
    },
    'match:new': (_payload, ack) =>
      ack?.(
        mutate((s) => {
          const fresh = createInitialState();
          fresh.meta = { ...s.meta };
          fresh.matchName = 'Pertandingan Baru';
          // konfigurasi siaran dipertahankan (tema, logo, layout, branding)
          fresh.overlay = { ...fresh.overlay, ...s.overlay, announce: null, emergency: false };
          // konfigurasi integrasi data juga tidak hilang saat ganti pertandingan
          fresh.integration = sanitizeIntegration(s.integration);
          return { state: fresh };
        })
      ),
    /** Transisi ke game berikutnya: skor per-game direset, draft dibuat baru. */
    'match:nextGame': (payload, ack) =>
      ack?.(
        mutate((s) => {
          const r = nextGame(s);
          return { state: r.state };
        })
      ),
    /** Emergency stop: membekukan animasi & menghentikan timer tanpa kehilangan data. */
    emergency: (payload, ack) =>
      ack?.(
        mutate((s) => {
          const r = setEmergency(s, !!payload?.on);
          return { state: r.state };
        })
      ),
    'state:request': (_payload, ack) =>
      ack?.({ ok: true, state: store.getState(), serverNow: Date.now() }),

    /**
     * Konfigurasi & kontrol integrasi data eksternal (operator only).
     * payload: { patch: {...}, action?: 'start'|'stop'|'approve'|'reject', id? }
     * Selalu lewat state (persisten) → controller disinkronkan dari state.
     */
    'integration:update': (payload, ack) => {
      const p = payload?.patch || {};
      const errors = [];
      if ('enabled' in p && typeof p.enabled !== 'boolean') errors.push('enabled harus boolean.');
      if ('dataSource' in p && !DATA_SOURCES.includes(p.dataSource)) errors.push('Sumber data tidak valid (manual|grid|fixture).');
      if ('mode' in p && !AUTOMATION_MODES.includes(p.mode)) errors.push('Mode otomasi tidak valid (monitor|semi|auto).');
      if ('autoEnabled' in p && typeof p.autoEnabled !== 'boolean') errors.push('autoEnabled harus boolean.');
      if ('fixture' in p && (typeof p.fixture !== 'string' || !/^[a-z0-9-]{1,40}$/.test(p.fixture))) {
        errors.push('Nama fixture tidak valid.');
      }
      for (const k of ['competitionId', 'seriesId', 'gameId']) {
        if (k in p && p[k] !== null && (typeof p[k] !== 'string' || p[k].length > 64)) {
          errors.push(`${k} tidak valid.`);
        }
      }
      if (errors.length) return ack?.({ ok: false, error: errors.slice(0, 3).join(' ') });

      const r = mutate((s) => {
        if (!s.integration) s.integration = sanitizeIntegration(null);
        if ('enabled' in p) s.integration.enabled = p.enabled;
        if ('dataSource' in p) s.integration.dataSource = p.dataSource;
        if ('mode' in p) s.integration.mode = p.mode;
        if ('autoEnabled' in p) s.integration.autoEnabled = p.autoEnabled;
        if ('fixture' in p) s.integration.fixture = p.fixture;
        for (const k of ['competitionId', 'seriesId', 'gameId']) {
          if (k in p) s.integration[k] = p[k] ? String(p[k]).slice(0, 64) : null;
        }
        s.revision += 1;
        s.updatedAt = new Date().toISOString();
        return { state: s };
      });
      if (!r.ok) return ack?.(r);

      syncGridFromState();
      const action = payload?.action;
      const finish = async () => {
        let extra = null;
        try {
          if (action === 'start') extra = await grid.start();
          else if (action === 'stop') extra = await grid.stop('operator');
          else if (action === 'approve') extra = grid.approve(payload?.id);
          else if (action === 'reject') extra = grid.reject(payload?.id);
        } catch (e) {
          console.error('[grid] aksi gagal:', e.message);
          emitGridStatus();
          return ack?.({ ok: false, error: `Aksi integrasi gagal: ${e.message}`, state: store.getState() });
        }
        emitGridStatus();
        ack?.({ ok: true, state: store.getState(), status: gridStatusPublic(), extra, serverNow: Date.now() });
      };
      finish();
      return undefined;
    }
  };

  /** event yang boleh dikirim klien mana pun (termasuk overlay) */
  const READ_ONLY = new Set(['state:request']);

  Object.entries(handlers).forEach(([event, fn]) => {
    socket.on(event, (payload, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      if (!READ_ONLY.has(event)) {
        const denied = denyMutation(socket);
        if (denied) {
          console.warn(`[socket] ${event} ditolak (${socket.data.role}): ${denied.error}`);
          return respond(denied);
        }
      }
      try {
        fn(payload || {}, respond);
      } catch (e) {
        console.error(`[socket:${event}]`, e);
        respond({ ok: false, error: 'Kesalahan server.' });
      }
    });
  });

  socket.on('disconnect', () => {
    presence[role] = Math.max(0, presence[role] - 1);
    broadcastPresence();
  });
});

/* -------------------------------------------------------------- ticker timer */

setInterval(() => {
  const st = store.getState();
  if (tickTimer(st)) {
    // waktu habis: perbarui status & siarkan
    if (st.draft.status === 'running') st.draft.status = 'paused';
    store.setState(st);
    broadcast();
    io.emit('draft:timeout', { serverNow: Date.now(), cursor: st.draft.cursor });
  }
}, 200);

setInterval(() => {
  // heartbeat ringan untuk sinkronisasi jam antar client
  io.emit('clock', { serverNow: Date.now() });
}, 5000);

process.on('SIGINT', () => {
  store.flushSync();
  process.exit(0);
});
process.on('SIGTERM', () => {
  store.flushSync();
  process.exit(0);
});

store.loadState();
storage.ensureDirs();

/* ------------------------------------------------- integrasi GRID (eksternal) */

/** Konfigurasi dari environment — secret TIDAK PERNAH keluar dari server. */
const gridConfig = readConfig();

/** Titik abstraksi event siaran (OBS scene controller — masa depan, §27). */
const broadcastCtrl = createBroadcastController({
  audit: gridAudit,
  emit: () => {
    /* fase ini tidak menghubungkan OBS WebSocket; kontrak event sudah tersedia */
  }
});

const heroIdSet = new Set(heroes.map((h) => h.id));

/**
 * Penerapan patch tervalidasi → Draft Engine / state.
 * Satu-satunya jembatan GRID → state; tetap lewat mutator resmi (pickHero,
 * applyScorePatch, dsb.) sehingga cursor, used, revision, dan undo tetap benar.
 */
function applyGridPatch(patch) {
  const source = grid.cfg.dataSource;
  return mutate((s) => {
    if (!s.integration) s.integration = sanitizeIntegration(null);
    switch (patch.kind) {
      case 'draft': {
        const r = pickHero(s, patch.heroId, { by: source });
        if (r.error) return { state: s, error: r.error };
        s.integration.draftSource = source;
        return { state: s };
      }
      case 'score': {
        const r = applyScorePatch(s, patch.score || {});
        if (r.error) return { state: s, error: r.error };
        s.integration.scoreSource = source;
        s.revision += 1;
        s.updatedAt = new Date().toISOString();
        return { state: s };
      }
      case 'series': {
        if (patch.teams) {
          for (const side of ['blue', 'red']) {
            const t = patch.teams[side];
            if (!t) continue;
            if (t.name) s.teams[side].name = String(t.name).slice(0, 32);
            if (Number.isInteger(t.seriesScore)) s.teams[side].score = Math.max(0, Math.min(99, t.seriesScore));
          }
        }
        if (patch.tournament) s.meta.tournament = String(patch.tournament).slice(0, 60);
        if (patch.ids) {
          for (const k of ['competitionId', 'seriesId', 'gameId']) {
            if (patch.ids[k]) s.integration[k] = String(patch.ids[k]).slice(0, 64);
          }
        }
        s.revision += 1;
        s.updatedAt = new Date().toISOString();
        return { state: s };
      }
      case 'finished': {
        if ('winner' in patch) s.score.winner = ['blue', 'red'].includes(patch.winner) ? patch.winner : null;
        if (patch.durationMs !== undefined) s.score.durationMs = Math.max(0, Number(patch.durationMs) || 0);
        s.score.status = 'selesai';
        if (patch.seriesScore) {
          for (const side of ['blue', 'red']) {
            if (Number.isInteger(patch.seriesScore[side])) {
              s.teams[side].score = Math.max(0, Math.min(99, patch.seriesScore[side]));
            }
          }
        }
        s.integration.scoreSource = source;
        s.revision += 1;
        s.updatedAt = new Date().toISOString();
        return { state: s };
      }
      default:
        return { state: s, error: `Jenis patch tidak dikenal: ${patch.kind}` };
    }
  });
}

function gridStatusPublic() {
  return { ...grid.status(), configured: gridConfig.configured, competitionId: gridConfig.competitionId, seriesId: gridConfig.seriesId };
}

function emitGridStatus() {
  io.emit('integration:status', { ...gridStatusPublic(), serverNow: Date.now() });
}

const grid = createGridController({
  getSnapshot: () => store.getState(),
  heroIds: heroIdSet,
  resolveHero: (ref) => (heroIdSet.has(ref) ? ref : null),
  apply: (patch) => applyGridPatch(patch),
  emitStatus: () => emitGridStatus(),
  audit: gridAudit,
  broadcast: broadcastCtrl
});

/** Sinkronkan konfigurasi controller dari state (state = sumber kebenaran). */
function syncGridFromState() {
  const it = store.getState().integration || sanitizeIntegration(null);
  grid.configure({
    enabled: it.enabled,
    dataSource: it.dataSource,
    mode: it.mode,
    autoEnabled: it.autoEnabled,
    fixture: it.fixture,
    fixtureIntervalMs: gridConfig.fixtureIntervalMs,
    competitionId: it.competitionId,
    seriesId: it.seriesId,
    gameId: it.gameId
  });
}

app.get('/api/integration', requireOperator, (_req, res) => {
  res.json({
    status: gridStatusPublic(),
    state: store.getState().integration,
    audit: gridAudit.list(20)
  });
});

// start otomatis hanya bila operator menyetelnya lewat env (bukan default)
{
  const it = store.getState().integration;
  if (it?.enabled && it.dataSource && it.dataSource !== 'manual') {
    syncGridFromState();
    setTimeout(() => {
      grid.start().catch((e) => console.error('[grid] start gagal:', e.message));
    }, 0);
  }
}

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' || HOST === '::' ? 'localhost' : HOST;
  const base = `http://${shown}:${PORT}`;
  const s = store.status();
  const lines = [
    'MLBB Draft Studio — server aktif',
    `API + Socket.IO : ${base}`,
    `Control panel   : ${base}/control`,
    `Draft overlay   : ${base}/overlay/draft`,
    `Score overlay   : ${base}/overlay/score`,
    `Database hero   : ${heroes.length} hero`,
    `Battle spell    : ${battleSpells.spells.length} spell (dengan ikon)`,
    `Autosave        : ${s.lastSaveAt || 'belum tersimpan'} (${DATA_DIR})`,
    `Backup          : ${s.backupCount} file retensi ${storage.BACKUP_KEEP}`,
    `Token operator  : ${APP_AUTH_TOKEN ? 'AKTIF' : 'nonaktif (set APP_AUTH_TOKEN untuk LAN)'}`
  ];
  if (HOST !== '127.0.0.1') {
    lines.push(`Akses LAN       : aktif — kontrol ${CLIENT_ORIGIN.length ? `origins: ${CLIENT_ORIGIN.join(', ')}` : 'semua origin (set CLIENT_ORIGIN untuk membatasi)'}`);
  }
  const width = Math.max(...lines.map((l) => l.length));
  const top = '  ┌' + '─'.repeat(width + 2) + '┐';
  const bot = '  └' + '─'.repeat(width + 2) + '┘';
  console.log('');
  console.log(top);
  lines.forEach((l) => {
    console.log(`  │  ${l.padEnd(width)}  │`);
  });
  console.log(bot);
  console.log('');
});
