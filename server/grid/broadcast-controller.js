/**
 * server/grid/broadcast-controller.js
 * ---------------------------------------------------------------------------
 * Titik abstraksi "Broadcast Controller" untuk event siaran (masa depan:
 * OBS WebSocket → pergantian scene). Fase ini HANYA menyediakan kontrak event
 * dan audit — tanpa dependency OBS baru (lihat Phase 13 §27).
 *
 * Event yang disiapkan:
 *   DRAFT_STARTED · GAME_STARTED · GAME_FINISHED · SERIES_FINISHED
 * ---------------------------------------------------------------------------
 */

export const BROADCAST_EVENTS = ['DRAFT_STARTED', 'GAME_STARTED', 'GAME_FINISHED', 'SERIES_FINISHED'];

/**
 * @param {{emit?:(name:string,payload:object)=>void,
 *          audit?:{record:(e:object)=>void}}} deps
 */
export function createBroadcastController({ emit, audit } = {}) {
  const history = [];
  return {
    /** Trigger event siaran; mengembalikan false bila nama tidak dikenal. */
    trigger(name, payload = {}) {
      if (!BROADCAST_EVENTS.includes(name)) return false;
      const entry = { at: Date.now(), name, payload };
      history.push(entry);
      if (history.length > 50) history.shift();
      try {
        emit?.(name, payload);
      } catch (e) {
        audit?.record({ action: 'BROADCAST ERROR', entity: name, reason: e.message });
        return false;
      }
      audit?.record({ action: `BROADCAST ${name}`, entity: 'broadcast' });
      return true;
    },
    history() {
      return [...history];
    }
  };
}
