/**
 * server/grid/audit.js
 * ---------------------------------------------------------------------------
 * Log audit integrasi (in-memory, ring buffer).
 *
 * DICATAT : koneksi, galat, resync, update draft/skor, pergantian sumber data,
 * override manual, perubahan mode otomasi.
 * TIDAK PERNAH : API key, URL privat, atau secret apa pun.
 * ---------------------------------------------------------------------------
 */

const MAX = 200;
const entries = [];

/** @param {{action:string, provider?:string, eventId?:string, entity?:string,
 *           old?:any, new?:any, reason?:string}} e */
export function record(e = {}) {
  const entry = {
    at: Date.now(),
    provider: e.provider || 'grid',
    action: String(e.action || 'EVENT').slice(0, 40),
    eventId: e.eventId ? String(e.eventId).slice(0, 80) : null,
    entity: e.entity || null,
    reason: e.reason ? String(e.reason).slice(0, 160) : null,
    old: e.old === undefined ? undefined : e.old,
    new: e.new === undefined ? undefined : e.new
  };
  entries.push(entry);
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  return entry;
}

export function list(limit = 20) {
  return entries.slice(-Math.max(1, Math.min(MAX, limit)));
}

export function clear() {
  entries.length = 0;
}
