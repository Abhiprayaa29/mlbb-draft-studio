/**
 * server/ocr/obsCapture.js
 * ---------------------------------------------------------------------------
 * OBS WebSocket capture service (singleton).
 *
 * Tanggung jawab:
 *   - Koneksi ke OBS Studio via obs-websocket-js (WebSocket 5.x)
 *   - Ambil source screenshot via GetSourceScreenshot
 *   - Loop terkontrol (setTimeout, bukan setInterval) — tidak overlap
 *   - Reconnect dengan exponential backoff terbatas
 *   - Status untuk API operator (tanpa password)
 *
 * Password OBS hanya disimpan di memori server; TIDAK PERNAH ke API/state/log.
 * ---------------------------------------------------------------------------
 */
import OBSWebSocket from 'obs-websocket-js';

/** Default env values. */
const DEFAULTS = {
  wsUrl: 'ws://127.0.0.1:4455',
  password: '',
  sourceName: '',
  intervalMs: 1000,
  autoStart: false
};

/** Max reconnect attempts sebelum menyerah (backoff). */
const MAX_RECONNECT_ATTEMPTS = 5;

/** Backoff schedule (ms) — 2^n * BASE. */
const RECONNECT_BASE_MS = 1000;

/**
 * @typedef {Object} ObsCaptureStatus
 * @property {boolean} connected
 * @property {boolean} capturing
 * @property {string} sourceName
 * @property {number} intervalMs
 * @property {number|null} lastCaptureAt
 * @property {number|null} lastProcessedAt
 * @property {string|null} lastError
 * @property {number} totalFrames
 * @property {number} processedFrames
 * @property {number} droppedFrames
 * @property {string} wsUrl  (tanpa password)
 * @property {boolean} autoStart
 * @property {number} reconnectAttempts
 */

/**
 * @typedef {Object} ObsSource
 * @property {string} name
 * @property {string} type
 * @property {boolean} isGameCapture
 */

/**
 * @typedef {Object} ObsCaptureDeps
 * @property {(frameBuffer: Buffer) => Promise<object>} processFrame
 * @property {(result: object) => any} applyFrameResult
 * @property {(event: string, payload: any) => void} [emitStatus]
 * @property {() => any} [createClient]  // factory untuk mock (tests)
 * @property {number} [maxReconnectAttempts]  // override untuk tests
 */

/**
 * Buat capture service singleton.
 * @param {ObsCaptureDeps} deps
 */
export function createObsCapture(deps) {
  if (!deps || typeof deps.processFrame !== 'function' || typeof deps.applyFrameResult !== 'function') {
    throw new Error('createObsCapture memerlukan processFrame dan applyFrameResult.');
  }

  const env = {
    wsUrl: process.env.OCR_OBS_WS_URL || DEFAULTS.wsUrl,
    password: process.env.OCR_OBS_WS_PASSWORD || DEFAULTS.password,
    sourceName: process.env.OCR_OBS_SOURCE_NAME || DEFAULTS.sourceName,
    intervalMs: Math.max(200, Number(process.env.OCR_OBS_INTERVAL_MS) || DEFAULTS.intervalMs),
    autoStart: process.env.OCR_OBS_AUTO_START === 'true' || DEFAULTS.autoStart
  };

  let client = null;
  let connected = false;
  let capturing = false;
  let sourceName = env.sourceName;
  let intervalMs = env.intervalMs;
  let lastCaptureAt = null;
  let lastProcessedAt = null;
  let lastError = null;
  let totalFrames = 0;
  let processedFrames = 0;
  let droppedFrames = 0;
  let reconnectAttempts = 0;
  let loopTimer = null;
  let disposed = false;
  let busy = false;

  /** Sumber terakhir dari GetInputList (untuk getSources). */
  let sourcesCache = [];

  function emit(event, payload) {
    if (deps.emitStatus) {
      try { deps.emitStatus(event, payload); } catch { /* ignore */ }
    }
  }

  function publicStatus() {
    /** @type {ObsCaptureStatus} */
    const status = {
      connected,
      capturing,
      sourceName,
      intervalMs,
      lastCaptureAt,
      lastProcessedAt,
      lastError,
      totalFrames,
      processedFrames,
      droppedFrames,
      wsUrl: env.wsUrl,
      autoStart: env.autoStart,
      reconnectAttempts
    };
    return status;
  }

  async function ensureClient() {
    if (client) return client;
    client = deps.createClient ? deps.createClient() : new OBSWebSocket();
    client.on('ConnectionClosed', () => {
      connected = false;
      emit('connectionClosed', publicStatus());
    });
    client.on('ConnectionError', (err) => {
      connected = false;
      lastError = err?.message || 'Connection error';
      emit('connectionError', publicStatus());
    });
    return client;
  }

  async function tryConnect() {
    const c = await ensureClient();
    // obs-websocket-js@5 signature: connect(url, password) — positional, bukan object.
    await c.connect(env.wsUrl, env.password || undefined);
    connected = true;
    reconnectAttempts = 0;
    lastError = null;
    emit('connected', publicStatus());
  }

  async function connectWithBackoff() {
    const maxAttempts = deps.maxReconnectAttempts ?? MAX_RECONNECT_ATTEMPTS;
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        await tryConnect();
        return;
      } catch (e) {
        reconnectAttempts = attempt + 1;
        lastError = e?.message || 'Connect failed';
        emit('reconnectAttempt', { attempt: reconnectAttempts, error: lastError });
        // Auth error permanen — retry tidak akan membantu, gagal langsung.
        const isAuthError = /auth|password|401|invalid secret/i.test(lastError);
        if (isAuthError || attempt === maxAttempts) {
          emit('reconnectFailed', publicStatus());
          throw new Error(
            isAuthError
              ? `Autentikasi OBS gagal: ${lastError}`
              : `Gagal terhubung ke OBS setelah ${maxAttempts + 1} percobaan: ${lastError}`
          );
        }
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const delay = RECONNECT_BASE_MS * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  async function getSources() {
    if (!connected || !client) {
      throw new Error('Belum terhubung ke OBS.');
    }
    // GetInputList: daftar input (source) di OBS
    const result = await client.call('GetInputList', {});
    const inputs = result?.inputs || [];
    sourcesCache = inputs.map(inp => ({
      name: inp.inputName ?? inp.name,
      type: inp.inputKind || inp.type || 'unknown',
      isGameCapture: /game|window/i.test(inp.inputKind || inp.type || '')
    }));
    // Jangan auto-pilih source — biarkan operator pilih
    return sourcesCache;
  }

  async function captureFrame() {
    if (!connected || !client) {
      throw new Error('Belum terhubung ke OBS.');
    }
    if (!sourceName) {
      throw new Error('Belum ada source yang dipilih. Pilih source dulu via getSources().');
    }
    // GetSourceScreenshot: base64 image
    const result = await client.call('GetSourceScreenshot', {
      sourceName,
      imageFormat: 'png',
      imageWidth: 1920,
      imageHeight: 1080
    });
    const base64 = result?.imageData;
    if (!base64) {
      throw new Error('OBS tidak mengembalikan screenshot.');
    }
    // Strip data URL prefix jika ada
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(base64Data, 'base64');
  }

  async function tick() {
    if (!capturing || disposed) return;
    if (busy) {
      droppedFrames += 1;
      emit('frameDropped', { reason: 'busy', droppedFrames });
    } else {
      busy = true;
      try {
        const frameBuffer = await captureFrame();
        totalFrames += 1;
        lastCaptureAt = Date.now();
        emit('frameCaptured', { totalFrames, lastCaptureAt });

        // Proses frame — processFrame sudah queue serial di OCR module
        const result = await deps.processFrame(frameBuffer);
        lastProcessedAt = Date.now();
        processedFrames += 1;

        // Apply result via shared handler (sama dengan manual POST /api/ocr/frame)
        deps.applyFrameResult(result);
        emit('frameProcessed', { processedFrames, lastProcessedAt });
      } catch (e) {
        lastError = e?.message || 'Capture/process failed';
        emit('frameError', { error: lastError, totalFrames, processedFrames, droppedFrames });
        // Error satu frame tidak menghentikan loop
      } finally {
        busy = false;
      }
    }

    // Jadwalkan capture berikutnya SETELAH selesai (bukan setInterval)
    if (capturing && !disposed) {
      loopTimer = setTimeout(tick, intervalMs);
    }
  }

  async function connect() {
    if (disposed) throw new Error('Service sudah disposed.');
    if (connected) return publicStatus();
    await connectWithBackoff();
    return publicStatus();
  }

  async function start() {
    if (disposed) throw new Error('Service sudah disposed.');
    if (capturing) return publicStatus();
    if (!connected) {
      await connectWithBackoff();
    }
    capturing = true;
    lastError = null;
    emit('started', publicStatus());
    // Mulai loop pertama
    tick();
    return publicStatus();
  }

  async function stop() {
    capturing = false;
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    emit('stopped', publicStatus());
    return publicStatus();
  }

  async function disconnect() {
    await stop();
    if (client && connected) {
      try { await client.disconnect(); } catch { /* ignore */ }
    }
    connected = false;
    emit('disconnected', publicStatus());
    return publicStatus();
  }

  function setSourceName(name) {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Source name tidak valid.');
    }
    sourceName = name.trim();
    return publicStatus();
  }

  function setIntervalMs(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n < 200) {
      throw new Error('Interval harus >= 200ms.');
    }
    intervalMs = Math.floor(n);
    return publicStatus();
  }
  function dispose() {
    disposed = true;
    capturing = false;
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
    if (client) {
      try { client.disconnect(); } catch { /* ignore */ }
      client = null;
    }
    connected = false;
  }

  function configure({ wsUrl, password, sourceName: newName, intervalMs: newInterval } = {}) {
    if (wsUrl) env.wsUrl = String(wsUrl);
    if (password !== undefined) env.password = String(password || '');
    if (newName) setSourceName(newName);
    if (newInterval !== undefined) setIntervalMs(newInterval);
    return publicStatus();
  }

  return {
    publicStatus,
    getSources,
    connect,
    start,
    stop,
    disconnect,
    configure,
    setSourceName,
    setIntervalMs,
    dispose,
    get isConnected() { return connected; },
    get isCapturing() { return capturing; }
  };
}
