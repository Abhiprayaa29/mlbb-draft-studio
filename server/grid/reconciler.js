/**
 * server/grid/reconciler.js
 * ---------------------------------------------------------------------------
 * Rekonsiliasi event live: deduplikasi, idempotensi, pengurutan, dan
 * last-known-good.
 *
 * Skenario yang dijamin aman:
 *   A, A, B, (reconnect) A, C   →  A, B, C   (bukan A 3×)
 *   1, 2, 4, 3, 5               →  1, 2, 3, 4, 5 (4 disangga sampai 3 tiba)
 *   eventId sama dengan seq lama / duplikat identik → diabaikan sebagai stale
 *
 * Reconciler bekerja pada RAW event (identitas provider) SEBELUM mapping.
 * ---------------------------------------------------------------------------
 */

function hash(raw) {
  try {
    return JSON.stringify({ t: raw.type, s: raw.seq, a: raw.at, d: raw.data });
  } catch {
    return 'unhashable';
  }
}

export function createReconciler({ maxSeen = 500, maxBuffer = 64 } = {}) {
  /** eventId → hash konten terakhir yang diterima */
  const seen = new Map();
  /** seq → raw event yang menunggu giliran */
  const buffer = new Map();
  let watermark = 0;
  let stats = { applied: 0, duplicates: 0, stale: 0, buffered: 0, skipped: 0, changed: 0 };

  function remember(eventId, h) {
    seen.set(eventId, h);
    if (seen.size > maxSeen) {
      const first = seen.keys().next().value;
      seen.delete(first);
    }
  }

  /** Keluarkan event berurutan yang kini sah (setelah watermark maju). */
  function flush() {
    const drained = [];
    while (buffer.has(watermark + 1)) {
      const seq = watermark + 1;
      const r = buffer.get(seq);
      buffer.delete(seq);
      const id = typeof r.eventId === 'string' ? r.eventId.trim() : '';
      const h = hash(r);
      if (id && seen.has(id) && seen.get(id) === h) {
        stats.duplicates += 1;
        continue;
      }
      watermark = seq;
      if (id) remember(id, h);
      stats.applied += 1;
      drained.push(r);
    }
    return drained;
  }

  /**
   * Tolak event struktural rusak — TETAPI bila seq valid, majukan watermark.
   * Tanpa ini satu event rusak membuat celah permanen: seluruh event
   * berikutnya menumpuk di buffer tanpa pernah keluar (feed macet diam-diam).
   */
  function rejectAndAdvance(raw, reason) {
    const seq = Number(raw?.seq);
    if (Number.isInteger(seq) && seq > watermark) {
      watermark = seq;
      const drained = flush();
      return { verdict: 'reject', reason, drained };
    }
    return { verdict: 'reject', reason, drained: [] };
  }

  /**
   * @returns {{verdict:'apply'|'duplicate'|'stale'|'buffered'|'reject',
   *            event?:raw, reason?:string, changed?:boolean, drained?:raw[]}}
   */
  function admit(raw) {
    if (!raw || typeof raw !== 'object') return { verdict: 'reject', reason: 'payload bukan objek', drained: [] };
    const eventId = typeof raw.eventId === 'string' ? raw.eventId.trim() : '';
    const seq = Number(raw.seq);
    if (!eventId) return rejectAndAdvance(raw, 'eventId hilang');
    if (!Number.isInteger(seq) || seq < 1) return { verdict: 'reject', reason: 'seq tidak sah', drained: [] };

    const h = hash(raw);

    // --- idempotensi: eventId sama ------------------------------------------
    if (seen.has(eventId)) {
      if (seen.get(eventId) === h) {
        stats.duplicates += 1;
        return { verdict: 'duplicate', reason: 'eventId sama (replay/duplikat)', drained: [] };
      }
      if (seq > watermark) {
        // payload berubah dan lebih baru → ganti (audit oleh pemanggil)
        stats.changed += 1;
        watermark = seq;
        remember(eventId, h);
        return { verdict: 'apply', event: raw, changed: true, reason: 'payload berubah', drained: [] };
      }
      stats.stale += 1;
      return { verdict: 'stale', reason: 'payload berubah tapi seq lama', drained: [] };
    }

    // --- urutan -------------------------------------------------------------
    if (seq <= watermark) {
      stats.stale += 1;
      remember(eventId, h);
      return { verdict: 'stale', reason: 'seq di bawah watermark', drained: [] };
    }

    if (seq === watermark + 1) {
      watermark = seq;
      remember(eventId, h);
      stats.applied += 1;
      return { verdict: 'apply', event: raw, drained: flush() };
    }

    // seq jauh di depan → sangga sampai celah tertutup
    buffer.set(seq, raw);
    stats.buffered += 1;

    if (buffer.size > maxBuffer) {
      // celah terlalu besar / provider melompat: paksa maju ke event tertua
      const minSeq = Math.min(...buffer.keys());
      if (minSeq > watermark + 1) {
        watermark = minSeq - 1;
        stats.skipped += 1;
      }
      const drained = flush();
      const applied = drained.some((r) => r === raw);
      return {
        verdict: applied ? 'apply' : 'buffered',
        event: applied ? raw : undefined,
        reason: 'gap terlalu besar — dilewati ke event tertua',
        changed: false,
        drained
      };
    }

    return { verdict: 'buffered', reason: `menunggu seq ${watermark + 1}`, drained: [] };
  }

  function reset() {
    seen.clear();
    buffer.clear();
    watermark = 0;
    stats = { applied: 0, duplicates: 0, stale: 0, buffered: 0, skipped: 0, changed: 0 };
  }

  return {
    admit,
    reset,
    get watermark() {
      return watermark;
    },
    stats() {
      return { ...stats, pending: buffer.size, seen: seen.size };
    }
  };
}
