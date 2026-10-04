/**
 * server/grid/config.js
 * ---------------------------------------------------------------------------
 * Konfigurasi integrasi GRID — SEMUA dibaca dari environment server-side.
 *
 *   - Secret (API key, URL privat) TIDAK PERNAH masuk state, Socket.IO,
 *     React, URL browser, maupun repository.
 *   - File `.env` (opsional) dimuat sekali tanpa menimpa env yang sudah ada.
 *   - `redacted()` adalah satu-satunya cara config dibagikan ke klien.
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

export const DATA_SOURCES = ['manual', 'grid', 'fixture'];
export const AUTOMATION_MODES = ['monitor', 'semi', 'auto'];
/** Status koneksi provider — CONNECTED hanya setelah probe/data tervalidasi. */
export const GRID_STATUS = [
  'disabled',
  'disconnected',
  'connecting',
  'connected',
  'degraded',
  'reconnecting',
  'error'
];

let envLoaded = false;

/** Muat .env sederhana (KEY=VALUE) — hanya mengisi yang belum ada. */
export function loadEnvFile(file = path.join(ROOT, '.env')) {
  if (envLoaded) return;
  envLoaded = true;
  try {
    if (!fs.existsSync(file)) return;
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq <= 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (e) {
    console.warn('[grid] gagal membaca .env:', e.message);
  }
}

function bool(v) {
  return String(v || '').toLowerCase() === 'true';
}

function str(v, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * Baca konfigurasi dari environment.
 * `configured` = kredensial minimum untuk mencoba transport live (URL + key).
 * Endpoint GraphQL tanpa key tetap dianggap belum dikonfigurasi.
 */
export function readConfig(env = process.env) {
  loadEnvFile();
  const mode = AUTOMATION_MODES.includes(String(env.AUTOMATION_MODE || '').toLowerCase())
    ? String(env.AUTOMATION_MODE).toLowerCase()
    : 'monitor';
  const source = DATA_SOURCES.includes(String(env.GRID_DATA_SOURCE || '').toLowerCase())
    ? String(env.GRID_DATA_SOURCE).toLowerCase()
    : 'manual';
  const interval = Number(env.GRID_FIXTURE_INTERVAL_MS);
  return {
    enabled: bool(env.GRID_ENABLED),
    apiKey: str(env.GRID_API_KEY, 400),
    graphqlUrl: str(env.GRID_GRAPHQL_URL, 400),
    wsUrl: str(env.GRID_WS_URL, 400),
    competitionId: str(env.GRID_COMPETITION_ID, 64),
    seriesId: str(env.GRID_SERIES_ID, 64),
    dataSource: source,
    fixture: str(env.GRID_FIXTURE, 40) || 'draft',
    fixtureIntervalMs: Number.isFinite(interval) ? Math.max(0, Math.min(10000, interval)) : 300,
    automationMode: mode,
    automationEnabled: bool(env.AUTOMATION_ENABLED),
    get configured() {
      return !!(this.graphqlUrl && this.apiKey);
    }
  };
}

/**
 * Bentuk aman untuk dikirim ke klien/UI.
 * Tidak pernah menyertakan apiKey maupun URL internal apa pun.
 */
export function redacted(cfg) {
  return {
    configured: !!(cfg.graphqlUrl && cfg.apiKey),
    hasApiKey: !!cfg.apiKey,
    competitionId: cfg.competitionId || null,
    seriesId: cfg.seriesId || null,
    fixture: cfg.fixture || 'draft'
  };
}
