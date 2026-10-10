/**
 * server/ocr/index.js
 * ---------------------------------------------------------------------------
 * Orkestrasi pipeline OCR per frame:
 *   frame → gray → Otsu global (sekali) → per-field: crop → skip-similar /
 *   recognize → smoothing → format gate → parse → patch + events.
 *
 * Engine + tracker bersifat singleton (di-reset bila povTeam berubah).
 * Frame diproses serial (antrean promise) — satu worker tesseract.
 */
import { toGrayRaw, otsuBinarize, cropGray, grayToPngBuffer } from './engine/imageops.js';
import { createOcrEngine } from './engine/index.js';
import { scaleRoi } from './roiExtractor.js';
import { createFieldTracker } from './temporalTracker.js';
import { createNotificationDetector } from './notificationDetector.js';
import { createObjectiveDetector } from './objectiveDetector.js';
import { mergeSettings } from './settings.js';
import { parseTimer, parseScore, parseGold, stripOrdinal } from './textNormalizer.js';
import { isOcrDebug, dumpFrame } from './debug.js';

const SCOREBOARD_FIELDS = new Set(['timer', 'scoreBlue', 'scoreRed', 'goldBlue', 'goldRed']);

let enginePromise = null;
let trackers = null;
let notifDetector = null;
let objDetector = null;
let lastPovTeam = null;

async function ensureState(settings) {
  if (!enginePromise) enginePromise = createOcrEngine();
  if (!trackers || lastPovTeam !== settings.povTeam) {
    trackers = new Map();
    for (const name of Object.keys(settings.fields)) trackers.set(name, createFieldTracker());
    notifDetector = createNotificationDetector({ povTeam: settings.povTeam });
    objDetector = createObjectiveDetector({ povTeam: settings.povTeam });
    lastPovTeam = settings.povTeam;
  }
  for (const name of Object.keys(settings.fields)) {
    if (!trackers.has(name)) trackers.set(name, createFieldTracker());
  }
  return enginePromise;
}

function applyPatchForField(patch, name, value) {
  if (name === 'timer') patch.durationMs = value;
  else if (name === 'scoreBlue') patch.blue = { ...(patch.blue ?? {}), kills: value };
  else if (name === 'scoreRed') patch.red = { ...(patch.red ?? {}), kills: value };
  else if (name === 'goldBlue') patch.blue = { ...(patch.blue ?? {}), gold: value };
  else if (name === 'goldRed') patch.red = { ...(patch.red ?? {}), gold: value };
}

function parseFieldValue(name, text) {
  if (name === 'timer') return parseTimer(text);
  if (name === 'scoreBlue' || name === 'scoreRed') return parseScore(text);
  if (name === 'goldBlue' || name === 'goldRed') return parseGold(text);
  return null;
}

async function processFrameInner(frameBuffer, userSettings = {}) {
  const settings = mergeSettings(userSettings);
  const engine = await ensureState(settings);
  const { data: gray, width, height } = await toGrayRaw(frameBuffer);
  const otsu = otsuBinarize(gray);

  const readings = {};
  const patch = {};
  const events = [];

  for (const [name, field] of Object.entries(settings.fields)) {
    const isScoreboard = SCOREBOARD_FIELDS.has(name);
    if (isScoreboard && !settings.enabled.scoreboard) continue;
    if (!isScoreboard && !settings.enabled.notification && !settings.enabled.objective) continue;

    const rect = scaleRoi(field.roi, width, height);
    const tracker = trackers.get(name);
    const grayCrop = cropGray(gray, width, rect.x, rect.y, rect.w, rect.h);

    let text;
    let rawText;
    let confidence;
    let ok;
    let reason;
    let reused = false;
    let fresh = false;

    if (tracker.shouldSkip(grayCrop.data)) {
      ({ text, rawText, confidence, ok, reason } = tracker.reuse());
      reused = true;
    } else {
      const useGray = field.localOtsu || field.noBinarize;
      const result = useGray
        ? await engine.recognizeFromGray(gray, width, rect, field)
        : await engine.recognizeFromOtsu(otsu.data, width, rect, field);
      rawText = result.rawText;
      confidence = result.confidence;
      ok = result.ok;
      reason = result.reason;
      text = field.smoothing ? tracker.smooth(rawText) : rawText;
      fresh = true;
    }

    let value = null;
    if (ok && field.formatRegex) {
      const t = stripOrdinal(text);
      if (!field.formatRegex.test(t)) {
        ok = false;
        reason = 'format_mismatch';
      } else {
        value = parseFieldValue(name, t);
        if (value === null) {
          ok = false;
          reason = 'parse_failed';
        }
      }
    } else if (!ok && reason === 'no_confidence' && field.formatRegex && text) {
      const t = stripOrdinal(text);
      if (field.formatRegex.test(t)) {
        const v = parseFieldValue(name, t);
        if (v !== null) {
          ok = true;
          reason = null;
          value = v;
        }
      }
    }

    // remember() hanya untuk frame segar, dan hanya SETELAH format-gate,
    // agar reuse() di frame berikutnya tidak mengembalikan ok=false dari
    // jalur no_confidence yang sudah diterima lewat format-gate.
    if (fresh) tracker.remember(grayCrop.data, rawText, ok, confidence);

    readings[name] = { text, rawText, confidence, ok, reason, rect, reused, value };
    if (ok && value !== null) applyPatchForField(patch, name, value);

    if (name === 'notification' && ok && text) {
      if (settings.enabled.notification) {
        const tEv = notifDetector.detect(text);
        if (tEv) events.push(tEv);
      }
      if (settings.enabled.objective) events.push(...objDetector.detect(text));
    }
  }

  if (isOcrDebug()) dumpFrame(String(Date.now()), frameBuffer, readings, { events, patch });
  return { frameSize: { width, height }, readings, events, patch };
}

let queue = Promise.resolve();

/**
 * Proses satu frame screenshot → readings + patch + events.
 * @param {Buffer} frameBuffer PNG/JPEG
 * @param {object} [userSettings] override mergeSettings()
 * @returns {Promise<{frameSize, readings, events, patch}>}
 */
export function processFrame(frameBuffer, userSettings = {}) {
  const p = queue.then(() => processFrameInner(frameBuffer, userSettings));
  queue = p.catch(() => {});
  return p;
}

export async function disposeOcrEngine() {
  if (!enginePromise) return;
  const e = await enginePromise;
  await e.dispose();
  enginePromise = null;
  trackers = null;
  notifDetector = null;
  objDetector = null;
  lastPovTeam = null;
}
