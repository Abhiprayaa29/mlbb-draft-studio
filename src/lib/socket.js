/**
 * src/lib/socket.js
 * ---------------------------------------------------------------------------
 * Koneksi Socket.IO tunggal. Menangani reconnect, sinkronisasi jam,
 * dan pendaftaran listener event agar tidak terduplikasi.
 * ---------------------------------------------------------------------------
 */
import { io } from 'socket.io-client';
import { store, getOperatorToken, saveOperatorToken } from './store.js';

let socket = null;
let started = false;

function authPayload() {
  const token = getOperatorToken();
  return token ? { token } : {};
}

export function startSocket(role = 'overlay') {
  if (started) return socket;
  started = true;
  store.patch({ role });

  socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 700,
    reconnectionDelayMax: 4000,
    timeout: 8000,
    query: { role },
    auth: authPayload()
  });

  socket.on('connect', () => {
    store.patch({ connected: true });
    socket.emit('state:request', {}, (res) => {
      if (res?.ok) {
        store.setStateObject(res.state, res.serverNow);
        store.patch({ needAuth: false });
      } else if (res?.needAuth) {
        store.patch({ needAuth: true });
      }
    });
  });

  socket.on('disconnect', () => store.patch({ connected: false }));

  socket.on('connect_error', () => store.patch({ connected: false }));

  socket.on('hello', (p) => {
    if (p?.state) store.setStateObject(p.state, p.serverNow);
    if (p?.presence) store.patch({ presence: p.presence });
    store.patch({
      authRequired: !!p?.authRequired,
      operator: !!p?.operator,
      needAuth: role === 'control' && !!p?.authRequired && !p?.operator
    });
    if (p?.autosave) store.patch({ autosave: p.autosave });
    if (p?.integrationStatus) store.patch({ integrationStatus: p.integrationStatus });
  });

  socket.on('state', (p) => {
    if (!p?.state) return;
    store.setStateObject(p.state, p.serverNow);
    if (p.autosave) store.patch({ autosave: p.autosave });
  });

  socket.on('presence', (p) => {
    store.patch({
      presence: { control: p.control || 0, overlay: p.overlay || 0 },
      serverNow: p.serverNow
    });
  });

  socket.on('clock', (p) => {
    if (!p?.serverNow) return;
    const local = Date.now();
    const nextSkew = p.serverNow - local;
    // rata-rata bergerak lembut agar hitung mundur tidak melompat
    const prev = store.getSnapshot().skew || 0;
    store.patch({ skew: prev === 0 ? nextSkew : prev * 0.7 + nextSkew * 0.3, serverNow: p.serverNow });
  });

  socket.on('draft:timeout', () => {
    store.notice('Waktu habis untuk aksi draft saat ini.', 'warn');
  });

  /** status koneksi integrasi (transien — tidak menyentuh state/revision) */
  socket.on('integration:status', (p) => {
    if (p) store.patch({ integrationStatus: p });
  });

  return socket;
}

export function getSocket() {
  return socket;
}

/**
 * Simpan token operator lalu sambungkan ulang. Token disimpan di localStorage
 * browser (tidak pernah dikirim lewat URL) dan hanya dikirim lewat handshake
 * `auth` Socket.IO.
 */
export function setOperatorToken(token) {
  saveOperatorToken(String(token || '').trim());
  if (socket) {
    socket.auth = authPayload();
    if (socket.connected) socket.disconnect();
    socket.connect();
  }
}

/** Emit dengan ack + timeout, mengembalikan {ok, error, ...}. */
export function request(event, payload = {}, timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) {
      resolve({ ok: false, error: 'Tidak tersambung ke server.' });
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ ok: false, error: 'Server tidak merespons (timeout).' });
      }
    }, timeoutMs);
    socket.emit(event, payload, (res) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = res || { ok: false, error: 'Respons kosong.' };
      if (out.needAuth) store.patch({ needAuth: true });
      resolve(out);
    });
  });
}
