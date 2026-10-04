/**
 * server/grid/client.js
 * ---------------------------------------------------------------------------
 * Provider data: FIXTURE (lokal, deterministik) dan GRID (live, bila
 * kredensial tersedia).
 *
 * FIXTURE  → dipakai uji & demo tanpa kredensial. Sumber kebenaran satu-satunya
 *            untuk pengujian pipeline (FIXTURE TESTED, bukan VERIFIED LIVE).
 * GRID     → transport + discovery. KONEKSI LIVE TIDAK PERNAH dianggap sukses
 *            hanya karena objek client terbentuk; status CONNECTED hanya bila
 *            ada permintaan data yang tervalidasi. Karena schema asli belum
 *            diverifikasi, provider live berhenti di DEGRADED + alasan jujur.
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDiscovery } from './discovery.js';
import { createWsFeed } from './websocket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.join(__dirname, 'fixtures');

export const FIXTURE_NAMES = (() => {
  try {
    return fs
      .readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
})();

export function loadFixture(name) {
  const safe = String(name || '').replace(/[^a-z0-9-]/gi, '');
  const file = path.join(FIXTURES_DIR, `${safe}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!doc || !Array.isArray(doc.events)) return null;
    return doc;
  } catch {
    return null;
  }
}

/** Provider fixture: memutar daftar event berurutan lewat onEvent(raw). */
export function createFixtureProvider({ name = 'draft', intervalMs = 300, onEvent, onStatus } = {}) {
  let timer = null;
  let stopped = true;

  function play(doc, index, resolve) {
    if (stopped) return resolve('stopped');
    if (index >= doc.events.length) return resolve('done');
    const ev = doc.events[index];
    try {
      onEvent?.(ev);
    } catch {
      /* pemanggil mengelola errornya sendiri */
    }
    if (intervalMs > 0) {
      timer = setTimeout(() => play(doc, index + 1, resolve), intervalMs);
    } else {
      // serentak namun tetap lewat task queue agar urutan event handler tertib
      timer = setTimeout(() => play(doc, index + 1, resolve), 0);
    }
  }

  return {
    kind: 'fixture',
    start() {
      const doc = loadFixture(name);
      if (!doc) {
        onStatus?.('error', `Fixture tidak ditemukan: ${name}`);
        return Promise.resolve({ ok: false, error: `Fixture tidak ditemukan: ${name}` });
      }
      stopped = false;
      onStatus?.('connecting', `Memutar fixture ${name} (${doc.events.length} event)`);
      return new Promise((resolve) => {
        play(doc, 0, (why) => {
          onStatus?.(why === 'stopped' ? 'disconnected' : 'connected', `Fixture ${name} selesai`);
          resolve({ ok: why !== 'stopped', reason: why, events: doc.events.length });
        });
      });
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

/**
 * Provider GRID live.
 * Tahap yang bisa dijalankan TANPA menebak schema:
 *   1. validasi konfigurasi,
 *   2. discovery introspection (standar GraphQL),
 *   3. (opsional) buka WS feed — pesan diteruskan apa adanya; mapper yang
 *      memutuskan dipahami atau tidak (tidak ditebak).
 */
export function createGridProvider({
  cfg,
  onEvent,
  onStatus,
  discover = runDiscovery,
  openFeed = createWsFeed
} = {}) {
  let feed = null;

  return {
    kind: 'grid',
    async connect() {
      if (!cfg?.graphqlUrl || !cfg?.apiKey) {
        onStatus?.('disabled', 'GRID belum dikonfigurasi.');
        return { ok: false, reason: 'belum dikonfigurasi' };
      }
      onStatus?.('connecting', 'Discovery schema…');
      const d = await discover(cfg);
      if (!d.ok) {
        const auth = /autentikasi|401|403/i.test(d.error || '');
        const status = auth ? 'error' : 'error';
        onStatus?.(status, d.reason === 'belum dikonfigurasi' ? 'GRID belum dikonfigurasi.' : `Discovery gagal: ${d.error}`);
        return { ok: false, error: d.error };
      }
      // Schema terbaca ≠ feed pertandingan terverifikasi → jujur: DEGRADED.
      onStatus?.(
        'degraded',
        `Schema ditemukan (${d.summary?.types ?? '?'} tipe) — mapping field live belum diverifikasi (GRID LIVE CONNECTION NOT VERIFIED)`
      );
      if (cfg.wsUrl) {
        feed = openFeed({
          url: cfg.wsUrl,
          onMessage: (msg) => onEvent?.(msg),
          onOpen: () => onStatus?.('reconnecting', 'WS feed terbuka — menunggu event tervalidasi'),
          onClose: () => onStatus?.('reconnecting', 'WS feed terputus — mencoba ulang'),
          onError: () => onStatus?.('reconnecting', 'WS feed galat — mencoba ulang')
        });
        feed.connect();
      }
      return { ok: true, summary: d.summary };
    },
    disconnect() {
      feed?.close();
      feed = null;
      onStatus?.('disconnected', 'Terputus atas permintaan operator');
    }
  };
}
