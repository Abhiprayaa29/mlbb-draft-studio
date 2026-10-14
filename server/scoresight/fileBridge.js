/**
 * server/scoresight/fileBridge.js
 * ---------------------------------------------------------------------------
 * Bridge file output ScoreSight → state MLBB Draft Studio.
 *
 * Sumber: folder lokal (SCORESIGHT_DIR) berisi file teks kecil yang ditulis
 * ScoreSight (lihat scripts/report task audit):
 *   Home Score.txt / Away Score.txt  — integer kills game (bukan series score)
 *   Home Gold.txt  / Away Gold.txt   — gold mentah (integer) atau "31.4k"
 *   Home Turret.txt / Away Turet.txt — turret (integer; nama file ScoreSight
 *                                      punya typo "Turet" di Away)
 *   Home Lord.txt  / Away Lord.txt   — lord (integer)
 *   Time.txt                        — MM:SS (hanya diagnostik; TIDAK diterapkan)
 *
 * Prinsip:
 *   - Hanya baca allowlist di dalam SCORESIGHT_DIR (anti path traversal).
 *   - File kosong / malformed / sedang ditulis → TIDAK dianggap nol.
 *   - Nilai invalid tidak menimpa nilai state valid.
 *   - Tidak ada revision/emit bila nilai tidak berubah.
 *   - Tidak menulis state.json langsung — lewat apply() callback → mutate.
 *   - Home/Away → Blue/Red lewat konfigurasi eksplisit (homeSide).
 *   - Jika homeSide belum dikonfigurasi → status MAPPING_REQUIRED, no patch.
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Allowlist nama file (exact match, case-sensitive seperti ScoreSight).
 * "Away Turet" adalah typo bawaan ScoreSight — dipertahankan agar cocok
 * dengan file aktual di disk.
 */
export const ALLOWLIST_FILES = Object.freeze([
  'Home Score.txt',
  'Away Score.txt',
  'Home Gold.txt',
  'Away Gold.txt',
  'Home Lord.txt',
  'Away Lord.txt',
  'Home Turret.txt',
  'Away Turet.txt',
  'Time.txt'
]);

/** Field yang boleh masuk ke state. */
const STATE_FIELDS = Object.freeze([
  'homeScore',
  'awayScore',
  'homeGold',
  'awayGold',
  'homeLord',
  'awayLord',
  'homeTurret',
  'awayTurret',
  'timeMs'
]);

const MAX_SCORE = 99;
const MAX_GOLD = 999999;
const MAX_TURRET = 20;
const MAX_LORD = 20;

/** Parse integer bulat non-negatif; return null bila invalid. */
function parseCountInt(text, max) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > max) return null;
  return n;
}

/**
 * Gold: dukung integer mentah ("9579"), singkatan ("31.4k" / "31k"),
 * dan (opsional) desimal ribuan bila mode gold = 'thousands'.
 *
 * Mode (`goldMode`):
 *   - 'raw'       : default. Integer = satuan gold asli. Tidak dikalikan.
 *   - 'thousands' : integer kecil (<1000) dianggap ribuan → ×1000.
 *                   Contoh file "16" → state 16000 (HUD ScoreSight 16K).
 *                   Nilai ≥1000 tidak diubah (sudah raw).
 *
 * Return null bila invalid. Unit state = gold mentah (integer).
 * Tidak memutasi input.
 */
export function parseGold(text, goldMode = 'raw') {
  // pemisah desimal koma setara titik (locale HUD bisa keduanya)
  const t = String(text ?? '').trim().replace(',', '.');
  if (!t) return null;
  const kMatch = t.match(/^(\d+(?:\.\d+)?)k$/i);
  if (kMatch) {
    const n = Math.round(Number(kMatch[1]) * 1000);
    if (!Number.isInteger(n) || n < 0 || n > MAX_GOLD) return null;
    return n;
  }
  // desimal titik tanpa suffix k: hanya valid di mode thousands
  // (ScoreSight regex ^\d*$ menolak titik — path ini untuk sumber lain)
  const decMatch = t.match(/^(\d{1,3}(?:\.\d)?)$/);
  if (decMatch && goldMode === 'thousands') {
    const n = Math.round(Number(decMatch[1]) * 1000);
    if (!Number.isInteger(n) || n < 0 || n > MAX_GOLD) return null;
    return n;
  }
  const raw = parseCountInt(t, MAX_GOLD);
  if (raw == null) return null;
  // mode thousands: integer kecil = satuan ribuan (contoh ScoreSight "16" → 16000)
  if (goldMode === 'thousands' && raw < 1000) {
    const scaled = raw * 1000;
    if (scaled > MAX_GOLD) return null;
    return scaled;
  }
  return raw;
}

/**
 * Parse Time.txt MM:SS → milidetik.
 * Return null bila kosong/malformed. Contoh: "03:23" → 203000.
 */
export function parseTimeMs(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) return null;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (!Number.isInteger(min) || !Number.isInteger(sec)) return null;
  return (min * 60 + sec) * 1000;
}

/** Compat: parse Time hanya untuk diagnostik — return string MM:SS valid atau null. */
export function parseTime(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  return /^\d{1,3}:\d{2}$/.test(t) ? t : null;
}

/** Validasi & normalisasi satu field berdasarkan key internal (tanpa .txt). */
function parseFieldByFieldKey(fieldKey, rawText, goldMode = 'raw') {
  if (fieldKey === 'homeGold' || fieldKey === 'awayGold') {
    return parseGold(rawText, goldMode);
  }
  if (fieldKey === 'time') {
    return parseTimeMs(rawText);
  }
  if (fieldKey === 'homeScore' || fieldKey === 'awayScore') {
    return parseCountInt(rawText, MAX_SCORE);
  }
  if (fieldKey === 'homeTurret' || fieldKey === 'awayTurret') {
    return parseCountInt(rawText, MAX_TURRET);
  }
  if (fieldKey === 'homeLord' || fieldKey === 'awayLord') {
    return parseCountInt(rawText, MAX_LORD);
  }
  return null;
}

/** Map nama file → key field internal. */
export const FILE_TO_FIELD = Object.freeze({
  'Home Score.txt': 'homeScore',
  'Away Score.txt': 'awayScore',
  'Home Gold.txt': 'homeGold',
  'Away Gold.txt': 'awayGold',
  'Home Lord.txt': 'homeLord',
  'Away Lord.txt': 'awayLord',
  'Home Turret.txt': 'homeTurret',
  'Away Turet.txt': 'awayTurret',
  'Time.txt': 'time'
});

/**
 * Baca satu file dengan aman: hanya nama di allowlist, hanya di dalam dir.
 * Retry singkat bila konten berubah antar read (file sedang ditulis).
 */
function readAllowlistedFile(dir, fileName, retries = 2) {
  if (!ALLOWLIST_FILES.includes(fileName)) {
    return { ok: false, error: 'not_allowlisted' };
  }
  const abs = path.resolve(dir, fileName);
  const rel = path.relative(path.resolve(dir), abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'path_escape' };
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (!fs.existsSync(abs)) return { ok: false, error: 'not_found' };
      const a = fs.readFileSync(abs);
      const b = fs.readFileSync(abs);
      if (a.equals(b)) {
        // strip UTF-8 BOM bila ada
        let buf = a;
        if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
          buf = buf.subarray(3);
        }
        return { ok: true, text: buf.toString('utf8') };
      }
      // isi berubah saat dibaca — tunggu sebentar lalu ulangi
    } catch (e) {
      if (attempt === retries) return { ok: false, error: `read_error:${e.code || e.message}` };
    }
  }
  return { ok: false, error: 'unstable_read' };
}

/**
 * Petakan field Home/Away → Blue/Red sesuai homeSide ('blue'|'red').
 * Format output = bentuk applyScorePatch: { blue: {kills,gold,...}, red: {...} }.
 * return null bila mapping tidak valid.
 */
export function mapToSides(fields, homeSide) {
  if (homeSide !== 'blue' && homeSide !== 'red') return null;
  const awaySide = homeSide === 'blue' ? 'red' : 'blue';
  const out = { blue: {}, red: {} };
  const pairs = [
    ['homeScore', homeSide, 'kills'],
    ['awayScore', awaySide, 'kills'],
    ['homeGold', homeSide, 'gold'],
    ['awayGold', awaySide, 'gold'],
    ['homeLord', homeSide, 'lord'],
    ['awayLord', awaySide, 'lord'],
    ['homeTurret', homeSide, 'turrets'],
    ['awayTurret', awaySide, 'turrets']
  ];
  for (const [src, side, dest] of pairs) {
    if (fields[src] != null) out[side][dest] = fields[src];
  }
  // timeMs diteruskan sebagai field top-level (bukan per-side)
  if (fields.timeMs != null) out.timeMs = fields.timeMs;
  if (Object.keys(out.blue).length === 0 && Object.keys(out.red).length === 0 && out.timeMs == null) return null;
  return out;
}

/**
 * Buat file bridge instance.
 *
 * @param {object} opts
 * @param {string} opts.dir             direktori output ScoreSight
 * @param {boolean} opts.enabled        status enable
 * @param {'blue'|'red'|null} opts.homeSide pemetaan Home → Blue/Red
 * @param {number} opts.pollIntervalMs  interval polling
 * @param {(patch: object) => {ok:boolean, error?:string}} opts.apply
 *        callback untuk menerapkan patch skor ke state existing
 * @param {(status: object) => void} opts.onStatus optional emit status
 */
export function createScoreSightBridge(opts) {
  let dir = typeof opts.dir === 'string' ? opts.dir.trim() : '';
  let enabled = !!opts.enabled;
  let homeSide = opts.homeSide === 'blue' || opts.homeSide === 'red' ? opts.homeSide : null;
  let pollIntervalMs = Number(opts.pollIntervalMs) > 0 ? Number(opts.pollIntervalMs) : 500;
  let goldMode = opts.goldMode === 'thousands' ? 'thousands' : 'raw';
  const apply = typeof opts.apply === 'function' ? opts.apply : () => ({ ok: false, error: 'no_apply' });
  const onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : () => {};

  let timer = null;
  let lastValues = Object.create(null); // fieldKey → number|string
  let lastRaw = Object.create(null); // fieldKey → raw text (untuk deteksi perubahan cepat)
  let running = false;
  let lastReadAt = 0;
  let lastChangeAt = 0;
  let lastApplyAt = 0;
  let lastError = null;
  let lastPatch = null;
  let fileStatus = Object.create(null); // fileName → { found, stale, error }
  let timeDiagnostic = null;

  function dirOk() {
    if (!dir) return false;
    try {
      return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  }

  function mappingRequired() {
    return homeSide !== 'blue' && homeSide !== 'red';
  }

  function computeStatus() {
    if (!enabled) return 'disabled';
    if (!dir || !dirOk()) return 'invalid_dir';
    if (mappingRequired()) return 'MAPPING_REQUIRED';
    if (!running) return 'stopped';
    if (lastError) return 'error';
    return 'running';
  }

  function statusSnapshot() {
    return {
      status: computeStatus(),
      enabled,
      dirConfigured: !!dir,
      dirOk: dirOk(),
      homeSide,
      awaySide: homeSide === 'blue' ? 'red' : homeSide === 'red' ? 'blue' : null,
      mappingRequired: mappingRequired(),
      pollIntervalMs,
      goldMode,
      running,
      lastReadAt: lastReadAt || null,
      lastChangeAt: lastChangeAt || null,
      lastApplyAt: lastApplyAt || null,
      lastError,
      lastPatch,
      timeDiagnostic,
      files: ALLOWLIST_FILES.map((f) => ({
        name: f,
        found: fileStatus[f]?.found ?? false,
        stale: fileStatus[f]?.stale ?? false,
        error: fileStatus[f]?.error ?? null
      })),
      values: { ...lastValues },
      serverNow: Date.now()
    };
  }

  function emitStatus() {
    onStatus(statusSnapshot());
  }

  /** Baca semua file allowlist → fields valid. */
  function readAllFields() {
    const fields = Object.create(null);
    lastError = null;
    let unstable = false;
    for (const fileName of ALLOWLIST_FILES) {
      const r = readAllowlistedFile(dir, fileName);
      if (!r.ok) {
        fileStatus[fileName] = {
          found: r.error !== 'not_found' && r.error !== 'not_allowlisted',
          stale: false,
          error: r.error
        };
        if (r.error === 'unstable_read') unstable = true;
        continue;
      }
      const fieldKey = FILE_TO_FIELD[fileName];
      lastReadAt = Date.now();
      const parsed = parseFieldByFieldKey(fieldKey, r.text, goldMode);
      if (parsed == null && fieldKey !== 'time') {
        fileStatus[fileName] = { found: true, stale: true, error: 'malformed' };
        continue;
      }
      fileStatus[fileName] = { found: true, stale: false, error: null };
      if (fieldKey === 'time') {
        // timeMs = durasi milidetik dari Time.txt (bukan string diagnostik lagi)
        timeDiagnostic = parsed != null ? `${String(Math.floor(parsed / 60000)).padStart(2, '0')}:${String(Math.floor((parsed % 60000) / 1000)).padStart(2, '0')}` : null;
        fields.timeMs = parsed;
      } else {
        fields[fieldKey] = parsed;
        // deteksi perubahan isi teks
        const rawKey = fileName;
        if (lastRaw[rawKey] !== r.text) {
          lastRaw[rawKey] = r.text;
        }
      }
    }
    return { fields, unstable };
  }

  function tick() {
    if (!running) return;
    if (!dirOk()) {
      lastError = 'invalid_dir';
      running = false;
      emitStatus();
      return;
    }
    const { fields, unstable } = readAllFields();
    if (unstable) {
      // pembacaan tidak stabil — jangan apply apa pun periode ini
      emitStatus();
      return;
    }
    if (mappingRequired()) {
      emitStatus();
      return;
    }

    // deteksi perubahan aktual (hanya field valid)
    // Simpan kandidat dulu; lastValues hanya di-commit bila apply sukses
    // agar apply yang ditolak (manual-only / wrong source) bisa dicoba lagi.
    const candidates = Object.create(null);
    let changed = false;
    for (const f of STATE_FIELDS) {
      const v = fields[f];
      if (v == null) continue;
      candidates[f] = v;
      if (lastValues[f] !== v) changed = true;
    }
    if (!changed) {
      emitStatus();
      return;
    }

    const patch = mapToSides(candidates, homeSide);
    if (!patch || Object.keys(patch).length === 0) {
      // tidak ada field valid — commit apa adanya agar tidak loop
      Object.assign(lastValues, candidates);
      emitStatus();
      return;
    }
    const result = apply(patch);
    if (result?.ok) {
      Object.assign(lastValues, candidates);
      lastChangeAt = Date.now();
      lastApplyAt = Date.now();
      lastPatch = { patch, at: lastApplyAt };
      lastError = null;
    } else {
      // apply ditolak — JANGAN commit lastValues agar retry berikutnya jalan
      lastError = result?.error || 'apply_failed';
    }
    emitStatus();
  }

  return {
    configure(next = {}) {
      if ('dir' in next) dir = typeof next.dir === 'string' ? next.dir.trim() : '';
      if ('enabled' in next) enabled = !!next.enabled;
      if ('homeSide' in next) {
        homeSide = next.homeSide === 'blue' || next.homeSide === 'red' ? next.homeSide : null;
      }
      if ('pollIntervalMs' in next) {
        const n = Number(next.pollIntervalMs);
        if (n > 0) pollIntervalMs = Math.min(60000, Math.max(100, n));
      }
      if ('goldMode' in next) {
        const m = next.goldMode === 'thousands' ? 'thousands' : 'raw';
        if (m !== goldMode) {
          goldMode = m;
          // goldMode berubah → invalidasi cache gold agar re-parse
          delete lastValues.homeGold;
          delete lastValues.awayGold;
        }
      }
      if (running) {
        // restart timer dengan interval baru
        if (timer) clearInterval(timer);
        timer = setInterval(tick, pollIntervalMs);
      }
      emitStatus();
      return statusSnapshot();
    },

    start() {
      if (!enabled) return { ok: false, error: 'ScoreSight bridge nonaktif (enabled=false).' };
      if (!dir || !dirOk()) {
        lastError = 'invalid_dir';
        emitStatus();
        return { ok: false, error: 'Direktori ScoreSight tidak valid atau belum dikonfigurasi.' };
      }
      if (running) return { ok: true, status: statusSnapshot() };
      running = true;
      lastError = null;
      // reset cache agar tick pertama selalu menganggap semua nilai "baru"
      // (penting bila start sebelumnya gagal apply karena gerbang scoreInput)
      lastValues = Object.create(null);
      tick();
      timer = setInterval(tick, pollIntervalMs);
      emitStatus();
      return { ok: true, status: statusSnapshot() };
    },

    stop() {
      running = false;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      emitStatus();
      return { ok: true, status: statusSnapshot() };
    },

    /** Baca paksa (manual refresh dari Control Panel). */
    refresh() {
      tick();
      return statusSnapshot();
    },

    status: statusSnapshot,

    isRunning() {
      return running;
    },

    /** Hanya untuk test: reset cache nilai. */
    _resetCache() {
      lastValues = Object.create(null);
      lastRaw = Object.create(null);
      lastReadAt = 0;
      lastChangeAt = 0;
      lastApplyAt = 0;
      lastError = null;
      lastPatch = null;
      fileStatus = Object.create(null);
      timeDiagnostic = null;
    }
  };
}

/** Parser terbuka untuk unit test. */
export const __test = { parseCountInt, parseFieldByFieldKey, readAllowlistedFile, ALLOWLIST_FILES };
