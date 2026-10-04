/**
 * server/grid/websocket.js
 * ---------------------------------------------------------------------------
 * Klien WebSocket generik untuk feed live (server-side ONLY).
 *
 * Tidak mengasumsikan protokol apa pun: URL disediakan operator lewat
 * GRID_WS_URL (bisa memuat token sesuai mekanisme provider). Pesan masuk
 * diteruskan apa adanya ke pipeline — mapper yang memutuskan apakah dipahami,
 * dan tipe yang tidak dikenal diabaikan + diaudit (bukan ditebak).
 *
 * Reconnect: exponential backoff dengan jitter + heartbeat ping.
 * ---------------------------------------------------------------------------
 */

export function createWsFeed({ url, onMessage, onOpen, onClose, onError, heartbeatMs = 15000 } = {}) {
  let ws = null;
  let closedByUser = false;
  let attempt = 0;
  let heartbeat = null;
  let reconnectTimer = null;

  function connect() {
    if (!url) return false;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      onError?.(e);
      scheduleReconnect();
      return false;
    }
    ws.addEventListener('open', () => {
      attempt = 0;
      if (heartbeatMs > 0) {
        heartbeat = setInterval(() => {
          try {
            ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ping' }));
          } catch {
            /* heartbeat gagal → biarkan mekanisme reconnect bekerja */
          }
        }, heartbeatMs);
      }
      onOpen?.();
    });
    ws.addEventListener('message', (ev) => {
      let parsed = null;
      try {
        parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      } catch {
        onError?.(new Error('pesan WS bukan JSON'));
        return;
      }
      onMessage?.(parsed);
    });
    ws.addEventListener('error', (e) => onError?.(e?.message ? new Error(e.message) : e));
    ws.addEventListener('close', () => {
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      onClose?.();
      if (!closedByUser) scheduleReconnect();
    });
    return true;
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    attempt += 1;
    const delay = Math.min(30000, 500 * 2 ** Math.min(attempt - 1, 6)) + Math.floor(Math.random() * 250);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  return {
    connect,
    close() {
      closedByUser = true;
      if (heartbeat) clearInterval(heartbeat);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* sudah tertutup */
      }
      ws = null;
    },
    get open() {
      return ws?.readyState === WebSocket.OPEN;
    }
  };
}
