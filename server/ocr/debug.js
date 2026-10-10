/**
 * server/ocr/debug.js
 * ---------------------------------------------------------------------------
 * OCR_DEBUG=1 → dump crop PNG per-field + readings JSON ke
 * .omop/ocr-debug/<timestamp>-<frameSeq>/ untuk inspeksi manual.
 * Nonaktif (no-op) bila OCR_DEBUG tidak bernilai truthy.
 */
import fs from 'node:fs';
import path from 'node:path';

const DEBUG_ENABLED = process.env.OCR_DEBUG === '1' || process.env.OCR_DEBUG === 'true';

let seq = 0;

/** @returns {boolean} apakah debug aktif */
export function isOcrDebug() {
  return DEBUG_ENABLED;
}

/**
 * @param {string} frameId id unik frame (timestamp)
 * @param {Buffer} frameBuffer frame asli
 * @param {Record<string, { text: string, confidence: number|null, ok: boolean, reason: string|null, crop?: Buffer }>} readings
 * @param {object} [extra]
 */
export function dumpFrame(frameId, frameBuffer, readings, extra = {}) {
  if (!DEBUG_ENABLED) return null;
  seq += 1;
  const dir = path.join(process.cwd(), '.omop', 'ocr-debug', `${frameId}-${seq}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'frame.png'), frameBuffer);
  const summary = {};
  for (const [name, r] of Object.entries(readings)) {
    summary[name] = {
      text: r.text,
      confidence: r.confidence,
      ok: r.ok,
      reason: r.reason,
      rect: r.rect,
      smoothed: r.smoothed
    };
    if (r.crop) fs.writeFileSync(path.join(dir, `${name}.png`), r.crop);
  }
  fs.writeFileSync(
    path.join(dir, 'readings.json'),
    JSON.stringify({ frameId, at: new Date().toISOString(), readings: summary, ...extra }, null, 2)
  );
  return dir;
}
