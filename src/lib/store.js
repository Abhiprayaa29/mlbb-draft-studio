/**
 * src/lib/store.js
 * ---------------------------------------------------------------------------
 * Store tunggal di sisi client. Server adalah satu-satunya sumber kebenaran;
 * store hanya menyalin state yang disiarkan dan status koneksi.
 * ---------------------------------------------------------------------------
 */
const TOKEN_KEY = 'mlbb-operator-token';

const initial = {
  state: null,
  presence: { control: 0, overlay: 0 },
  connected: false,
  role: 'overlay',
  /** perkiraan selisih jam server - klien (ms) */
  skew: 0,
  serverNow: 0,
  lastEvent: null,
  /** pesan error dari server untuk ditampilkan operator */
  notice: null,
  /** server membutuhkan token operator (mode LAN aman) */
  authRequired: false,
  /** koneksi ini diakui server sebagai operator */
  operator: false,
  /** ada aksi yang ditolak karena token tidak valid */
  needAuth: false,
  /** status autosave/backup dari server */
  autosave: null
};

let snapshot = { ...initial };
const listeners = new Set();

function emit() {
  snapshot = { ...snapshot };
  listeners.forEach((fn) => fn());
}

export const store = {
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot() {
    return snapshot;
  },
  patch(p) {
    snapshot = { ...snapshot, ...p };
    listeners.forEach((fn) => fn());
  },
  setStateObject(state, serverNow) {
    snapshot = {
      ...snapshot,
      state,
      serverNow: serverNow ?? Date.now(),
      skew: serverNow != null ? serverNow - Date.now() : snapshot.skew
    };
    listeners.forEach((fn) => fn());
  },
  notice(msg, kind = 'info') {
    snapshot = { ...snapshot, notice: msg ? { msg, kind, at: Date.now() } : null };
    listeners.forEach((fn) => fn());
    if (msg) {
      setTimeout(() => {
        if (snapshot.notice && snapshot.notice.msg === msg) {
          snapshot = { ...snapshot, notice: null };
          listeners.forEach((fn) => fn());
        }
      }, 4200);
    }
  },
  reset() {
    snapshot = { ...initial, role: snapshot.role };
    listeners.forEach((fn) => fn());
  }
};

/* ------------------------------------------------------------- token operator */

export function getOperatorToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function saveOperatorToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* mode private browser: abaikan */
  }
}

/** Waktu server yang disinkronkan (bukan jam lokal). */
export function serverTime() {
  return Date.now() + (store.getSnapshot().skew || 0);
}
