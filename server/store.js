/**
 * server/store.js
 * ---------------------------------------------------------------------------
 * State aktif pertandingan di memori + penyimpanan ke JSON.
 * Semua operasi file dilakukan lewat lapisan `storage.js`.
 *
 *   - state aktif  : server/data/state.json   (autosave, debounce + deteksi perubahan)
 *   - backup       : server/data/backups/*.json (retensi terbatas)
 *   - daftar match : server/data/matches/*.json (simpan/muat manual)
 * ---------------------------------------------------------------------------
 */
import path from 'node:path';
import { createInitialState } from './draftEngine.js';
import * as storage from './storage.js';

let state = null;
let saveTimer = null;
let dirty = false;

function safeClone(v) {
  return JSON.parse(JSON.stringify(v));
}

export function loadState() {
  const doc = storage.loadStateFile();
  if (doc) {
    state = doc;
    // jangan lanjutkan timer mati dari sesi sebelumnya
    state.draft.timer.running = false;
    state.draft.timer.deadlineAt = null;
    // kunci kembali entri yang terkunci hilang tidak mungkin — cukup normalisasi
    if (!Array.isArray(state.draft.log)) state.draft.log = [];
    return state;
  }
  state = createInitialState();
  storage.saveStateFile(state, { force: true });
  return state;
}

export function getState() {
  if (!state) loadState();
  return state;
}

export function setState(next) {
  state = next;
  dirty = true;
  scheduleSave();
  return state;
}

export function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushSync();
  }, 250);
}

export function flushSync() {
  if (!state) return;
  if (!dirty && !storage.storageStatus().lastSaveAt) {
    // belum pernah tersimpan sama sekali → paksa tulis
    storage.saveStateFile(state, { force: true });
    dirty = false;
    return;
  }
  if (!dirty) return;
  const ok = storage.saveStateFile(state);
  if (ok) dirty = false;
}

/** Status autosave untuk indikator operator. */
export function status() {
  return {
    ...storage.storageStatus(),
    dirty,
    revision: state ? state.revision : null
  };
}

/* ----------------------------------------------------------- match manual */

export function slugifyId(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'match'}-${Date.now().toString(36)}`;
}

export function matchExists(id) {
  return storage.readMatchFile(id) !== null;
}

export function saveMatch(name, st = getState()) {
  const id = st.matchId && st.matchId !== 'aktif' ? st.matchId : slugifyId(name);
  const doc = {
    ...safeClone(st),
    matchId: id,
    matchName: name || st.matchName,
    savedAt: new Date().toISOString()
  };
  storage.writeMatchFile(id, doc);
  writeIndex();
  return doc;
}

const INDEX_FILE = 'matches-index.json';

function listIndexFile() {
  return path.join(storage.DATA_DIR, INDEX_FILE);
}

function writeIndex() {
  const idx = storage
    .matchFiles()
    .map((f) => {
      const d = storage.readMatchFile(f.replace(/\.json$/, ''));
      if (!d) return null;
      return {
        id: d.matchId,
        name: d.matchName,
        savedAt: d.savedAt || null,
        tournament: d.meta?.tournament || '',
        gameNumber: d.meta?.gameNumber || 1,
        blue: d.teams?.blue?.name || '',
        red: d.teams?.red?.name || '',
        blueScore: d.teams?.blue?.score ?? 0,
        redScore: d.teams?.red?.score ?? 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
  storage.atomicWrite(listIndexFile(), JSON.stringify(idx, null, 2));
  return idx;
}

export function listMatches() {
  const cached = storage.readJsonFile(listIndexFile(), null);
  if (Array.isArray(cached)) return cached;
  return writeIndex();
}

export function readMatch(id) {
  return storage.readMatchFile(id);
}

export function deleteMatch(id) {
  if (storage.deleteMatchFile(id)) {
    writeIndex();
    return true;
  }
  return false;
}
