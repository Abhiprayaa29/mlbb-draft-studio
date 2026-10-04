/**
 * server/grid/mapper.js
 * ---------------------------------------------------------------------------
 * GRID/raw provider → canonical event (model internal).
 *
 * ATURAN:
 *   - Schema provider dan state aplikasi TIDAK pernah dicampur: overlay tidak
 *     pernah membaca raw payload.
 *   - Hanya field yang benar-benar ada yang dibawa; field yang tidak dikirim
 *     tidak pernah dijadikan 0 (unknown != zero).
 *   - Tipe event yang tidak dikenal dilaporkan `unsupported` (diabaikan +
 *     diaudit), bukan ditebak.
 *
 * CATATAN KEBENARAN: tipe event di bawah adalah KONTRAK INPUT adapter
 * (dipakai fixture provider). Field asli GRID harus dipetakan di sini SETELAH
 * discovery schema dengan kredensial nyata — jangan mengarangnya sebelum itu.
 * ---------------------------------------------------------------------------
 */
import { PROVIDER_STATUS, mapProviderStatus } from './lifecycle.js';

const SIDE_KEYS = ['blue', 'red'];
const SCORE_KEYS = ['kills', 'gold', 'turrets', 'lord', 'turtle'];

function isStr(v, max = 120) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
}

function optionalStr(v, max = 120) {
  if (v === undefined || v === null || v === '') return undefined;
  return isStr(v, max) ? v.trim() : null; // null = nilai ada tapi tidak sah
}

function num(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return NaN;
}

/**
 * @param {object} raw   event provider { eventId, seq, at, type, data }
 * @param {object} opts  { source: 'grid'|'fixture', resolveHero(ref) => heroId|null }
 * @returns {{ok:true,event:object}|{ok:false,reason:string,unsupported?:boolean}}
 */
export function mapEvent(raw, { source = 'grid', resolveHero } = {}) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'payload bukan objek' };
  if (!isStr(raw.eventId, 80)) return { ok: false, reason: 'eventId tidak valid' };
  const seq = Number(raw.seq);
  if (!Number.isInteger(seq) || seq < 1) return { ok: false, reason: 'seq tidak valid' };
  const at = Number(raw.at);
  if (!Number.isFinite(at)) return { ok: false, reason: 'timestamp provider tidak valid' };

  const base = {
    source,
    eventId: raw.eventId.trim(),
    seq,
    providerTs: at
  };
  const type = typeof raw.type === 'string' ? raw.type : '';
  const data = raw.data && typeof raw.data === 'object' ? raw.data : {};

  switch (type) {
    case 'series.state':
      return mapSeriesState(base, data);
    case 'draft.action':
      return mapDraftAction(base, data, resolveHero);
    case 'score.update':
      return mapScoreUpdate(base, data);
    case 'match.finished':
      return mapFinished(base, data);
    default:
      return { ok: false, reason: `tipe event tidak dikenal: ${type || '(kosong)'}`, unsupported: true };
  }
}

function mapSeriesState(base, d) {
  const status = typeof d.status === 'string' ? d.status : undefined;
  if (status !== undefined && !PROVIDER_STATUS.includes(status)) {
    return { ok: false, reason: `status provider tidak dikenal: ${status}` };
  }
  const ids = {
    competitionId: optionalStr(d.competitionId, 64),
    seriesId: optionalStr(d.seriesId, 64),
    gameId: optionalStr(d.gameId, 64)
  };
  if (Object.values(ids).some((v) => v === null)) return { ok: false, reason: 'identifier pertandingan tidak valid' };
  const tournament = optionalStr(d.tournament, 60);
  if (tournament === null) return { ok: false, reason: 'nama turnamen tidak valid' };

  const teams = {};
  if (d.teams !== undefined) {
    if (!d.teams || typeof d.teams !== 'object') return { ok: false, reason: 'teams bukan objek' };
    const unknown = Object.keys(d.teams).filter((k) => !SIDE_KEYS.includes(k));
    if (unknown.length) return { ok: false, reason: `sisi tim tidak dikenal: ${unknown.join(',')}` };
    for (const side of SIDE_KEYS) {
      const t = d.teams[side];
      if (t === undefined) continue;
      if (!t || typeof t !== 'object') return { ok: false, reason: `tim ${side} bukan objek` };
      const name = optionalStr(t.name, 32);
      // nama ada tapi kosong/karakter kosong → event ditolak utuh (fail-safe),
      // bukan dihapus diam-diam (agar tidak membuang tim blue secara diam-diam)
      if (t.name !== undefined && t.name !== null && !name) {
        return { ok: false, reason: `nama tim ${side} kosong/tidak sah` };
      }
      const ss = t.seriesScore === undefined ? undefined : num(t.seriesScore);
      if (t.seriesScore !== undefined && (!Number.isInteger(ss) || ss < 0 || ss > 99)) {
        return { ok: false, reason: `skor seri ${side} tidak valid` };
      }
      teams[side] = {
        id: optionalStr(t.id, 64) || undefined,
        name: name || undefined,
        seriesScore: ss === undefined ? undefined : ss
      };
    }
  }

  return {
    ok: true,
    event: {
      ...base,
      kind: 'series',
      status: status !== undefined ? mapProviderStatus(status) : undefined,
      providerStatus: status,
      ids,
      tournament,
      teams: Object.keys(teams).length ? teams : undefined
    }
  };
}

function mapDraftAction(base, d, resolveHero) {
  if (!SIDE_KEYS.includes(d.team)) return { ok: false, reason: `sisi tim tidak valid: ${d.team}` };
  if (!['ban', 'pick'].includes(d.type)) return { ok: false, reason: `tipe aksi tidak valid: ${d.type}` };
  if (!isStr(d.heroRef, 64)) return { ok: false, reason: 'heroRef kosong/tidak valid' };
  const heroId = resolveHero ? resolveHero(d.heroRef) : d.heroRef;
  if (!heroId) return { ok: false, reason: `hero tidak dikenal: ${d.heroRef}` };
  return {
    ok: true,
    event: { ...base, kind: 'draft', team: d.team, type: d.type, heroRef: d.heroRef, heroId }
  };
}

function mapScoreUpdate(base, d) {
  const out = { ...base, kind: 'score', sides: {}, durationMs: undefined };
  let fields = 0;
  for (const side of SIDE_KEYS) {
    const s = d[side];
    if (s === undefined) continue;
    if (!s || typeof s !== 'object') return { ok: false, reason: `skor ${side} bukan objek` };
    const clean = {};
    for (const k of SCORE_KEYS) {
      if (!(k in s)) continue; // field tidak dikirim = TIDAK disentuh (bukan 0)
      const v = num(s[k]);
      if (!Number.isFinite(v)) return { ok: false, reason: `nilai ${side}.${k} bukan angka` };
      clean[k] = v;
      fields += 1;
    }
    if (Object.keys(clean).length) {
      out.sides[side] = clean;
    }
  }
  if (d.durationMs !== undefined) {
    const v = num(d.durationMs);
    if (!Number.isFinite(v)) return { ok: false, reason: 'durationMs bukan angka' };
    out.durationMs = v;
    fields += 1;
  }
  if (fields === 0) return { ok: true, event: { ...out, noop: true } };
  return { ok: true, event: out };
}

function mapFinished(base, d) {
  let winner;
  if ('winner' in d) {
    winner = d.winner;
    if (winner !== null && !SIDE_KEYS.includes(winner)) return { ok: false, reason: `pemenang tidak valid: ${winner}` };
  }
  let durationMs;
  if (d.durationMs !== undefined) {
    durationMs = num(d.durationMs);
    if (!Number.isFinite(durationMs)) return { ok: false, reason: 'durationMs bukan angka' };
  }
  let seriesScore;
  if (d.seriesScore !== undefined) {
    if (!d.seriesScore || typeof d.seriesScore !== 'object') return { ok: false, reason: 'seriesScore bukan objek' };
    seriesScore = {};
    for (const side of SIDE_KEYS) {
      if (!(side in d.seriesScore)) continue;
      const v = num(d.seriesScore[side]);
      if (!Number.isInteger(v) || v < 0 || v > 99) return { ok: false, reason: `seriesScore.${side} tidak valid` };
      seriesScore[side] = v;
    }
    if (!Object.keys(seriesScore).length) seriesScore = undefined;
  }
  return { ok: true, event: { ...base, kind: 'finished', winner: winner ?? null, durationMs, seriesScore } };
}
