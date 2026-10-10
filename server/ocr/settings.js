/**
 * server/ocr/settings.js
 * ---------------------------------------------------------------------------
 * Default pengaturan OCR — port dari ScoreSight defaults.py, disesuaikan
 * untuk MLBB scoreboard. DEVIASI utama (dokumentasikan di LICENSES.md):
 *  - ROI proporsional 0–1 (bukan piksel absolut) → lintas resolusi.
 *  - conf_thresh 0.5 dibandingkan terhadap confidence 0–1 hasil normalisasi
 *    tesseract (ScoreSight membandingkan 0.5 dengan MeanTextConf 0–100 —
 *    bug skala yang secara efektif tidak pernah menolak; kami perbaiki).
 *
 * Default ROI dikalibrasi terhadap public/assets/OCR/Gameplayforscoreboard.png
 * (1384×706) — lihat kalibrasi di scripts/ocr-calibrate.js.
 */

/** Field pembacaan papan skor. `type` menentukan whitelist + regex. */
export const DEFAULT_FIELDS = Object.freeze({
  /** Timer tengah bar atas: "04:39" → durationMs. */
  timer: {
    roi: { x: 0.482, y: 0.006, w: 0.058, h: 0.05 },
    type: 'time',
    dilate: false,
    formatRegex: /^(?:[0-5]?\d:[0-5]?\d)$/,
    confThresh: 0.5,
    smoothing: true,
    updateOnChange: true
  },
  /** Kill biru (kiri timer). */
  scoreBlue: {
    roi: { x: 0.434, y: 0.006, w: 0.038, h: 0.05 },
    type: 'number',
    dilate: false,
    formatRegex: /^\d{1,3}$/,
    confThresh: 0.5,
    smoothing: true,
    updateOnChange: true
  },
  /** Kill merah (kanan timer). Faint digit — localOtsu + contrastStretch. */
  scoreRed: {
    roi: { x: 0.544, y: 0.006, w: 0.032, h: 0.05 },
    type: 'number',
    localOtsu: true,
    contrastStretch: true,
    upscale: true,
    formatRegex: /^\d{1,3}$/,
    confThresh: 0.5,
    smoothing: true,
    updateOnChange: true
  },
  /** Gold biru "11.5k" (kiri kill biru). ROI mulai setelah ikon $. */
  goldBlue: {
    roi: { x: 0.378, y: 0.006, w: 0.058, h: 0.05 },
    type: 'text',
    noBinarize: true,
    contrastStretch: true,
    whitelist: '0123456789.kmKM',
    formatRegex: /^\d{1,4}(?:\.\d+)?[kKmM]?$/,
    confThresh: 0.5,
    smoothing: true,
    updateOnChange: true
  },
  /** Gold merah "12.8k" (kanan kill merah). ROI mulai setelah ikon $. */
  goldRed: {
    roi: { x: 0.590, y: 0.006, w: 0.052, h: 0.05 },
    type: 'text',
    localOtsu: true,
    whitelist: '0123456789.kmKM',
    formatRegex: /^\d{1,4}(?:\.\d+)?[kKmM]?$/,
    confThresh: 0.5,
    smoothing: true,
    updateOnChange: true
  },
  /**
   * Area notifikasi tengah layar ("Enemy Turret Destroyed", "Lord has been
   * slain", dll.). ROI besar karena posisi teks bervariasi antar perangkat.
   */
  notification: {
    roi: { x: 0.25, y: 0.23, w: 0.5, h: 0.14 },
    type: 'text',
    psm: '6',
    confThresh: 0.4,
    smoothing: false,
    updateOnChange: false
  }
});

/** Default global. */
export const DEFAULT_SETTINGS = Object.freeze({
  /** Tim yang dilihat operator — menentukan arah event turret. */
  povTeam: 'blue',
  /** Fitur aktif. */
  enabled: {
    scoreboard: true,
    notification: true,
    // Lord/Turtle HANYA dari teks notifikasi — lihat objectiveDetector.js.
    objective: true
  },
  fields: DEFAULT_FIELDS
});

/**
 * Merge pengaturan user di atas default (deep-merge per-field).
 * @param {object} userSettings
 */
export function mergeSettings(userSettings = {}) {
  const base = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  // JSON round-trip mengubah RegExp menjadi {} — pasang ulang formatRegex.
  for (const [name, f] of Object.entries(base.fields)) {
    const src = DEFAULT_FIELDS[name];
    if (src?.formatRegex) f.formatRegex = src.formatRegex;
  }
  if (!userSettings || typeof userSettings !== 'object') return base;
  if (userSettings.povTeam === 'blue' || userSettings.povTeam === 'red') {
    base.povTeam = userSettings.povTeam;
  }
  if (userSettings.enabled && typeof userSettings.enabled === 'object') {
    for (const k of Object.keys(base.enabled)) {
      if (typeof userSettings.enabled[k] === 'boolean') base.enabled[k] = userSettings.enabled[k];
    }
  }
  if (userSettings.fields && typeof userSettings.fields === 'object') {
    for (const [name, over] of Object.entries(userSettings.fields)) {
      if (!base.fields[name] || !over || typeof over !== 'object') continue;
      const f = base.fields[name];
      if (over.roi && typeof over.roi === 'object') {
        for (const rk of ['x', 'y', 'w', 'h']) {
          if (typeof over.roi[rk] === 'number') f.roi[rk] = over.roi[rk];
        }
      }
      if (typeof over.confThresh === 'number') f.confThresh = over.confThresh;
      if (typeof over.smoothing === 'boolean') f.smoothing = over.smoothing;
      if (typeof over.updateOnChange === 'boolean') f.updateOnChange = over.updateOnChange;
      if (over.formatRegex instanceof RegExp) f.formatRegex = over.formatRegex;
    }
  }
  return base;
}
