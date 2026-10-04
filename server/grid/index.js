/**
 * server/grid/index.js
 * ---------------------------------------------------------------------------
 * GRID controller — orkestrasi pipeline data eksternal.
 *
 *   provider (fixture | grid)
 *        ↓ raw event
 *   reconciler  (dedup · ordering · idempotency · last-known-good)
 *        ↓
 *   mapper      (raw → canonical; tipe tak dikenal → unsupported)
 *        ↓
 *   validator   (hero di dataset 133 · angka wajar · urutan draft · lifecycle)
 *        ↓
 *   normalizer  (canonical → patch; field tak tersedia tidak pernah jadi 0)
 *        ↓ mode gate (monitor | semi | auto)
 *   apply()     → dibungkus mutate() oleh server utama (tetap lewat Draft Engine)
 *
 * ATURAN:
 *   - Monitor (default) TIDAK pernah mengubah state.
 *   - Auto memerlukan mode=auto DAN autoEnabled=true (gerbang ganda).
 *   - Gagal → tolak event, pertahankan last-known-good, catat audit, beri tahu
 *     operator. Tidak pernah menulis state sebagian.
 *   - Overlay tidak pernah membaca payload provider — hanya state internal.
 * ---------------------------------------------------------------------------
 */
import { createReconciler } from './reconciler.js';
import { mapEvent } from './mapper.js';
import { validateEvent } from './validator.js';
import { toPatch, summarize } from './normalizer.js';
import { initialLifecycle } from './lifecycle.js';
import { createFixtureProvider, createGridProvider, FIXTURE_NAMES } from './client.js';
import * as auditMod from './audit.js';
import { DATA_SOURCES, AUTOMATION_MODES } from './config.js';

const MAX_PENDING = 20;
const MAX_OBSERVATIONS = 20;

export function createGridController({
  getSnapshot,
  apply,
  emitStatus,
  resolveHero,
  heroIds,
  audit = auditMod,
  broadcast = null,
  providers: providerFactory = { fixture: createFixtureProvider, grid: createGridProvider }
} = {}) {
  const reconciler = createReconciler();

  const cfg = {
    enabled: false,
    dataSource: 'manual',
    mode: 'monitor',
    autoEnabled: false,
    fixture: 'draft',
    fixtureIntervalMs: 300,
    competitionId: null,
    seriesId: null,
    gameId: null
  };

  const live = {
    status: 'disabled',
    reason: 'integrasi belum diaktifkan',
    connectedAt: null,
    lastEventAt: null,
    lastSyncAt: null,
    lifecycle: initialLifecycle()
  };

  const counts = { applied: 0, rejected: 0, unsupported: 0, observed: 0, proposed: 0, noop: 0 };
  let pending = [];
  let observations = [];
  let provider = null;
  let obsSeq = 0;
  let pendSeq = 0;
  let started = false;
  let unsupportedAudited = 0;

  function publicStatus() {
    const rstats = reconciler.stats();
    return {
      status: live.status,
      reason: live.reason,
      enabled: cfg.enabled,
      dataSource: cfg.dataSource,
      mode: cfg.mode,
      autoEnabled: cfg.autoEnabled,
      configured: false, // diisi oleh server (readConfig) — tidak pernah membocorkan secret
      competitionId: cfg.competitionId,
      seriesId: cfg.seriesId,
      gameId: cfg.gameId,
      connectedAt: live.connectedAt,
      lastEventAt: live.lastEventAt,
      lastSyncAt: live.lastSyncAt,
      lifecycle: live.lifecycle,
      counts: { ...counts, duplicates: rstats.duplicates, stale: rstats.stale, skipped: rstats.skipped },
      pending: pending.map((p) => ({ id: p.id, at: p.at, summary: p.summary, kind: p.kind })),
      observations: observations.map((o) => ({ id: o.id, at: o.at, summary: o.summary, kind: o.kind })),
      fixtures: FIXTURE_NAMES
    };
  }

  function setStatus(status, reason) {
    if (live.status === status && live.reason === reason) return;
    live.status = status;
    live.reason = reason || live.reason;
    if (status === 'connected' && !live.connectedAt) live.connectedAt = Date.now();
    if (status === 'disabled' || status === 'disconnected') live.connectedAt = null;
    emitStatus?.(publicStatus());
  }

  function snapshotStatus() {
    emitStatus?.(publicStatus());
  }

  function providerStatusHook(status, reason) {
    if (status === 'connected' && live.status === 'connecting') live.connectedAt = Date.now();
    setStatus(status, reason);
  }

  /* ------------------------------------------------------- mode & konfigurasi */

  function configure(partial = {}) {
    const before = { dataSource: cfg.dataSource, mode: cfg.mode, enabled: cfg.enabled };
    for (const k of ['enabled', 'mode', 'autoEnabled', 'fixture', 'fixtureIntervalMs', 'competitionId', 'seriesId', 'gameId']) {
      if (k in partial && partial[k] !== undefined) cfg[k] = partial[k];
    }
    if (partial.dataSource && DATA_SOURCES.includes(partial.dataSource)) cfg.dataSource = partial.dataSource;
    if (partial.mode && AUTOMATION_MODES.includes(partial.mode)) cfg.mode = partial.mode;
    if (before.dataSource !== cfg.dataSource || before.mode !== cfg.mode || before.enabled !== cfg.enabled) {
      audit.record({
        action: 'CONFIG',
        entity: 'data-source',
        old: `${before.dataSource}/${before.mode}/${before.enabled}`,
        new: `${cfg.dataSource}/${cfg.mode}/${cfg.enabled}`
      });
    }
    if (partial.mode) audit.record({ action: 'AUTOMATION MODE', entity: 'mode', new: cfg.mode });
    return publicStatus();
  }

  async function start() {
    if (started) await stop('restart');
    if (!cfg.enabled || cfg.dataSource === 'manual') {
      setStatus('disabled', cfg.enabled ? 'sumber data manual' : 'integrasi nonaktif');
      snapshotStatus();
      return publicStatus();
    }
    started = true;
    // sesi provider baru = awal aliran baru: dedup/ordering dimulai dari nol
    // (reconnect DI DALAM satu sesi provider tidak me-reset — tugas provider)
    reconciler.reset();
    // pengajuan/observasi dari sesi sebelumnya tidak berlaku lagi
    pending = [];
    observations = [];
    setStatus('connecting', `Menghubungkan provider ${cfg.dataSource}…`);
    audit.record({ action: 'CONNECT', provider: cfg.dataSource });

    if (cfg.dataSource === 'fixture') {
      provider = providerFactory.fixture({
        name: cfg.fixture,
        intervalMs: cfg.fixtureIntervalMs,
        onEvent: (raw) => ingest(raw),
        onStatus: providerStatusHook
      });
      await provider.start();
      if (live.status === 'connecting') setStatus('connected', 'fixture selesai');
      snapshotStatus();
      return publicStatus();
    }

    provider = providerFactory.grid({
      cfg,
      onEvent: (raw) => ingest(raw),
      onStatus: providerStatusHook
    });
    const res = await provider.connect();
    if (!res.ok && live.status === 'connecting') setStatus('error', res.error || 'koneksi gagal');
    snapshotStatus();
    return publicStatus();
  }

  async function stop(reason = 'operator') {
    provider?.stop?.();
    provider?.disconnect?.();
    provider = null;
    started = false;
    audit.record({ action: 'DISCONNECT', reason });
    setStatus('disconnected', reason);
    snapshotStatus();
    return publicStatus();
  }

  /* ------------------------------------------------------------- pipeline */

  function makeCtx(enforceOrder = false) {
    const st = getSnapshot?.() || {};
    return {
      heroIds,
      draft: st.draft,
      score: st.score,
      currentLifecycle: live.lifecycle,
      enforceOrder
    };
  }

  function handleOne(raw) {
    // mode auto hanya bila gerbang ganda terbuka — saat itulah urutan draft
    // divalidasi terhadap cursor internal (karena event akan menulis state)
    const willApply = cfg.mode === 'auto' && cfg.autoEnabled;

    // 1. mapping
    const mapped = mapEvent(raw, { source: cfg.dataSource === 'fixture' ? 'fixture' : 'grid', resolveHero });
    if (!mapped.ok) {
      if (mapped.unsupported) {
        counts.unsupported += 1;
        if (unsupportedAudited < 5) {
          unsupportedAudited += 1;
          audit.record({ action: 'UNSUPPORTED', eventId: raw?.eventId, reason: mapped.reason });
        }
      } else {
        counts.rejected += 1;
        audit.record({ action: 'REJECT', eventId: raw?.eventId, reason: mapped.reason });
      }
      return 'rejected';
    }
    const event = mapped.event;

    // 2. validasi
    const v = validateEvent(event, makeCtx(willApply));
    if (!v.ok) {
      counts.rejected += 1;
      audit.record({ action: 'REJECT', eventId: event.eventId, reason: v.errors.slice(0, 2).join('; ') });
      return 'rejected';
    }

    // 3. normalisasi
    const patch = toPatch(event);
    if (!patch) {
      counts.noop += 1;
      return 'noop';
    }

    live.lastEventAt = Date.now();

    // 4. gerbang mode
    if (cfg.mode === 'monitor') {
      counts.observed += 1;
      observations = [...observations, { id: `obs-${++obsSeq}`, at: Date.now(), kind: event.kind, summary: summarize(event), patch }].slice(-MAX_OBSERVATIONS);
      audit.record({ action: 'OBSERVE', eventId: event.eventId, entity: event.kind });
      return 'observed';
    }
    if (cfg.mode === 'semi') {
      counts.proposed += 1;
      pending = [...pending, { id: `p-${++pendSeq}`, at: Date.now(), kind: event.kind, summary: summarize(event), patch, eventId: event.eventId, event }].slice(-MAX_PENDING);
      audit.record({ action: 'PROPOSE', eventId: event.eventId, entity: event.kind });
      return 'proposed';
    }
    // mode auto
    if (!cfg.autoEnabled) {
      counts.observed += 1;
      observations = [...observations, { id: `obs-${++obsSeq}`, at: Date.now(), kind: event.kind, summary: `${summarize(event)} (auto dinonaktifkan)`, patch }].slice(-MAX_OBSERVATIONS);
      audit.record({ action: 'AUTO PAUSED', eventId: event.eventId, reason: 'AUTOMATION_ENABLED=false' });
      return 'observed';
    }
    return applyPatch(event, patch);
  }

  function applyPatch(event, patch) {
    let res;
    try {
      res = apply?.(patch);
    } catch (e) {
      res = { ok: false, error: e.message };
    }
    if (!res?.ok) {
      counts.rejected += 1;
      audit.record({ action: 'APPLY FAILED', eventId: event?.eventId, entity: patch.kind, reason: res?.error || 'apply tidak tersedia' });
      return 'rejected';
    }
    counts.applied += 1;
    live.lastSyncAt = Date.now();
    updateLifecycle(event, patch);
    audit.record({ action: 'APPLY', eventId: event?.eventId, entity: patch.kind, new: summarize(event) });
    return 'applied';
  }

  function updateLifecycle(event, patch) {
    let next = null;
    if (patch.kind === 'series' && patch.status) next = patch.status;
    if (patch.kind === 'finished') next = 'finished';
    if (patch.kind === 'draft' && live.lifecycle === 'idle') next = 'draft';
    if (patch.kind === 'score' && (live.lifecycle === 'idle' || live.lifecycle === 'draft')) next = live.lifecycle === 'draft' ? 'draft' : 'in_game';
    if (!next || next === live.lifecycle) return;
    const before = live.lifecycle;
    live.lifecycle = next;
    if (before !== next) {
      if (next === 'draft') broadcast?.trigger('DRAFT_STARTED', { at: Date.now() });
      if (next === 'in_game') broadcast?.trigger('GAME_STARTED', { at: Date.now() });
      if (next === 'finished') {
        broadcast?.trigger('GAME_FINISHED', { at: Date.now() });
        broadcast?.trigger('SERIES_FINISHED', { at: Date.now() });
      }
    }
  }

  /**
   * Titik masuk satu raw event (dipakai provider & uji).
   * @returns {string} verdict: apply|duplicate|stale|buffered|reject|...
   */
  function ingest(raw) {
    const res = reconciler.admit(raw);
    const list = [];
    if (res.event) list.push(res.event);
    for (const d of res.drained || []) if (!list.includes(d)) list.push(d);

    let last = res.verdict;
    if (res.verdict === 'reject') {
      counts.rejected += 1;
      audit.record({ action: 'REJECT', reason: res.reason });
    } else if (res.verdict === 'duplicate' || res.verdict === 'stale') {
      live.lastEventAt = Date.now();
      snapshotStatus();
      return last;
    }
    for (const r of list) {
      const outcome = handleOne(r);
      if (outcome === 'applied') last = 'apply';
    }
    if (list.length || res.verdict === 'reject') snapshotStatus();
    return last;
  }

  /* ---------------------------------------------------- persetujuan (semi) */

  function approve(id) {
    const idx = pending.findIndex((p) => p.id === id);
    if (idx < 0) return { ok: false, error: 'Pengajuan tidak ditemukan.' };
    const item = pending[idx];
    // Validasi ulang terhadap state TERKINI (operator bisa saja mengubah state
    // manual sejak pengajuan dibuat) — urutan draft wajib cocok saat ini.
    if (item.event) {
      const v = validateEvent(item.event, makeCtx(true));
      if (!v.ok) {
        const reason = v.errors.slice(0, 2).join('; ');
        audit.record({ action: 'APPROVE REJECTED', eventId: item.eventId, reason });
        return { ok: false, error: `Pengajuan tidak bisa diterapkan: ${reason}` };
      }
    }
    pending = pending.filter((p) => p.id !== id);
    const outcome = applyPatch(item.event || { eventId: item.eventId, kind: item.kind }, item.patch);
    snapshotStatus();
    return { ok: outcome === 'applied', outcome, id };
  }

  function reject(id) {
    const idx = pending.findIndex((p) => p.id === id);
    if (idx < 0) return { ok: false, error: 'Pengajuan tidak ditemukan.' };
    const item = pending[idx];
    pending = pending.filter((p) => p.id !== id);
    audit.record({ action: 'PROPOSE REJECTED', eventId: item.eventId, entity: item.kind });
    snapshotStatus();
    return { ok: true, id };
  }

  function resetReconciler() {
    reconciler.reset();
  }

  return {
    configure,
    start,
    stop,
    ingest,
    approve,
    reject,
    status: publicStatus,
    resetReconciler,
    get cfg() {
      return { ...cfg };
    },
    audit
  };
}
