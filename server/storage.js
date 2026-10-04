/**
 * server/storage.js
 * ---------------------------------------------------------------------------
 * Lapisan abstraksi penyimpanan (backend JSON).
 *
 * Semua operasi baca/tulis file ada di sini sehingga handler HTTP/Socket.IO di
 * server/index.js tidak menyentuh `fs` langsung. Backend saat ini hanya JSON
 * (single-instance) â€” bila suatu saat butuh multi-instance, cukup ganti modul
 * ini dengan backend lain tanpa mengubah kontrak API/event.
 *
 * Fitur:
 *   - penulisan atomik (tmp + rename) agar proses mati mendadak tidak merusak
 *     file state.
 *   - deteksi perubahan: file tidak ditulis ulang bila revision sama.
 *   - backup berkala dengan retensi terbatas.
 *   - pemulihan otomatis dari backup bila state.json rusak.
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Direktori data bisa dipindahkan lewat env DATA_DIR (uji/terisolasi). */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');

export const MATCH_DIR = path.join(DATA_DIR, 'matches');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const LOGO_DIR = path.join(DATA_DIR, 'logos');
export const STATE_FILE = path.join(DATA_DIR, 'state.json');

export const BACKUP_KEEP = clampInt(process.env.BACKUP_KEEP, 1, 100, 20);
export const BACKUP_INTERVAL_MS = clampInt(process.env.BACKUP_INTERVAL_MS, 1000, 3600000, 30000);

function clampInt(raw, min, max, dflt) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
}

const status = {
  lastSaveAt: null,
  lastSaveOk: true,
  lastSaveError: null,
  lastBackupAt: null,
  lastBackupFile: null,
  lastLoadedFrom: null, // 'state' | 'backup' | 'fresh'
  writes: 0,
  backups: 0
};

export function storageStatus() {
  return { ...status, backupCount: listBackups().length, dir: DATA_DIR };
}

export function ensureDirs() {
  fs.mkdirSync(MATCH_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export function readJsonFile(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Penulisan atomik: file .tmp dulu, baru rename menimpa file tujuan. */
export function atomicWrite(file, contents) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, file);
}

/* --------------------------------------------------------------- backup */

export function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('state-') && f.endsWith('.json'))
      .map((f) => ({ file: f, full: path.join(BACKUP_DIR, f), at: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

function pruneBackups() {
  const all = listBackups();
  all.slice(BACKUP_KEEP).forEach((b) => {
    try {
      fs.unlinkSync(b.full);
    } catch {
      /* abaikan */
    }
  });
}

/** Salin state.json yang sekarang ke backup (dipanggil sebelum ditimpa). */
export function createBackup() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(BACKUP_DIR, `state-${stamp}.json`);
    fs.copyFileSync(STATE_FILE, target);
    status.lastBackupAt = new Date().toISOString();
    status.lastBackupFile = path.basename(target);
    status.backups += 1;
    pruneBackups();
    return target;
  } catch (e) {
    console.warn('[storage] backup gagal:', e.message);
    return null;
  }
}

/** Backup berkala â€” hanya bila ada perubahan dan jeda minimum tercapai. */
function maybeBackup(previousRevision, nextRevision) {
  if (previousRevision === nextRevision) return;
  const now = Date.now();
  if (status.lastBackupAt && now - new Date(status.lastBackupAt).getTime() < BACKUP_INTERVAL_MS) return;
  createBackup();
}

/* --------------------------------------------------------- state aktif */

export function isValidState(obj) {
  return !!obj && typeof obj === 'object' && obj.version === 1 && !!obj.draft && Array.isArray(obj.draft.actions);
}

/** Baca state.json; bila rusak, coba backup terbaru yang valid. */
export function loadStateFile() {
  ensureDirs();
  const direct = readJsonFile(STATE_FILE, null);
  if (isValidState(direct)) {
    status.lastLoadedFrom = 'state';
    return direct;
  }
  if (fs.existsSync(STATE_FILE)) {
    console.warn('[storage] state.json rusak atau tidak valid â€” mencoba backup terbaru.');
  }
  for (const b of listBackups()) {
    const doc = readJsonFile(b.full, null);
    if (isValidState(doc)) {
      status.lastLoadedFrom = 'backup';
      console.warn(`[storage] state dipulihkan dari backup: ${b.file}`);
      // tulis ulang agar state.json valid kembali (backup tidak dihapus)
      try {
        atomicWrite(STATE_FILE, JSON.stringify(doc, null, 2));
      } catch {
        /* biarkan; proses tetap jalan dengan state hasil backup */
      }
      return doc;
    }
  }
  status.lastLoadedFrom = 'fresh';
  return null;
}

/** Simpan state bila revision berubah; buat backup berkala. */
export function saveStateFile(state, { force = false } = {}) {
  if (!state) return false;
  ensureDirs();
  try {
    const existing = readJsonFile(STATE_FILE, null);
    const existingRev = existing && typeof existing.revision === 'number' ? existing.revision : null;
    if (!force && existingRev !== null && existingRev === state.revision) {
      return true; // tidak ada perubahan â€” jangan menulis file percuma
    }
    if (existing && existingRev !== state.revision) maybeBackup(existingRev, state.revision);
    atomicWrite(STATE_FILE, JSON.stringify(state, null, 2));
    status.lastSaveAt = new Date().toISOString();
    status.lastSaveOk = true;
    status.lastSaveError = null;
    status.writes += 1;
    return true;
  } catch (e) {
    status.lastSaveOk = false;
    status.lastSaveError = e.message;
    console.error('[storage] gagal menyimpan state:', e.message);
    return false;
  }
}

/* ------------------------------------------------------------ pertandingan */

export function matchFile(id) {
  // path.basename mencegah path traversal dari klien
  return path.join(MATCH_DIR, `${path.basename(String(id || ''))}.json`);
}

export function writeMatchFile(id, doc) {
  ensureDirs();
  atomicWrite(matchFile(id), JSON.stringify(doc, null, 2));
}

export function readMatchFile(id) {
  const file = matchFile(id);
  if (!fs.existsSync(file)) return null;
  return readJsonFile(file, null);
}

export function deleteMatchFile(id) {
  const file = matchFile(id);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

export function matchFiles() {
  ensureDirs();
  return fs.readdirSync(MATCH_DIR).filter((f) => f.endsWith('.json'));
}

/* ------------------------------------------------------------------ logo */

export function logoFile(name) {
  return path.join(LOGO_DIR, path.basename(String(name || '')));
}
