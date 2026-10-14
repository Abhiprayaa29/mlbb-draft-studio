/**
 * server/scoresight/config.js
 * ---------------------------------------------------------------------------
 * Konfigurasi ScoreSight file bridge — SEMUA dari environment server-side.
 *
 * SCORESIGHT_ENABLED=false
 * SCORESIGHT_DIR=            (path folder output ScoreSight)
 * SCORESIGHT_POLL_INTERVAL_MS=500
 * SCORESIGHT_HOME_SIDE=blue  (blue|red — Home → Blue atau Red)
 * SCORESIGHT_GOLD_MODE=raw   (raw|thousands — satuan file Home/Away Gold)
 *
 * File `.env` dimuat sekali (via grid/config.js loadEnvFile) tanpa menimpa
 * env yang sudah ada. Path Windows (C:\...) tidak valid di Linux — isi
 * SCORESIGHT_DIR dengan path yang ter-mount / shared folder.
 * ---------------------------------------------------------------------------
 */
import { loadEnvFile } from '../grid/config.js';

function bool(v) {
  return String(v || '').toLowerCase() === 'true';
}

/**
 * Baca konfigurasi ScoreSight dari environment.
 * `dirReady` = direktori benar-benar ada & readable di mesin backend.
 */
export function readScoreSightConfig(env = process.env) {
  loadEnvFile();
  const poll = Number(env.SCORESIGHT_POLL_INTERVAL_MS);
  const homeSideRaw = String(env.SCORESIGHT_HOME_SIDE || '').toLowerCase().trim();
  const dir = typeof env.SCORESIGHT_DIR === 'string' ? env.SCORESIGHT_DIR.trim() : '';
  const goldModeRaw = String(env.SCORESIGHT_GOLD_MODE || '').toLowerCase().trim();
  return {
    enabled: bool(env.SCORESIGHT_ENABLED),
    dir,
    pollIntervalMs: Number.isFinite(poll) ? Math.min(60000, Math.max(100, poll)) : 500,
    homeSide: homeSideRaw === 'blue' || homeSideRaw === 'red' ? homeSideRaw : null,
    goldMode: goldModeRaw === 'thousands' ? 'thousands' : 'raw'
  };
}

/** Bentuk aman untuk UI (tanpa path absolut penuh bila tidak diinginkan). */
export function redactedScoreSight(cfg) {
  return {
    enabled: cfg.enabled,
    dirConfigured: !!cfg.dir,
    pollIntervalMs: cfg.pollIntervalMs,
    homeSide: cfg.homeSide,
    goldMode: cfg.goldMode || 'raw'
  };
}
