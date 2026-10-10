/**
 * server/ocr/fieldPolicy.js
 * ---------------------------------------------------------------------------
 * Kebijakan per-field untuk pipeline OCR (manual & OBS).
 *
 * Modes per field:
 *   - "disabled"    : field dibaca & ditampilkan, tidak pernah di-apply ke state
 *   - "review"      : field dibaca, operator harus review sebelum apply
 *   - "auto-apply"  : field di-apply otomatis bila confidence cukup
 *
 * Default (setelah restart): OBSERVE-ONLY — semua field "disabled" untuk apply.
 * scoreRed & goldBlue: SELALU "review" (kalibrasi buruk — ROI tidak akurat).
 * ---------------------------------------------------------------------------
 */

/** Default policy saat server restart — semua field observe-only. */
export const DEFAULT_FIELD_POLICY = Object.freeze({
  timer: 'disabled',
  scoreBlue: 'disabled',
  scoreRed: 'disabled', // wajib non-auto-apply (kalibrasi buruk)
  goldBlue: 'disabled',
  goldRed: 'disabled',
  notification: 'disabled',
  lord: 'disabled',
  turtle: 'disabled'
});

/** Field yang SELALU "review" — tidak pernah auto-apply, tidak bisa di-upgrade. */
export const LOCKED_REVIEW_FIELDS = Object.freeze(['scoreRed', 'goldBlue']);

/** Semua mode yang valid. */
export const VALID_MODES = Object.freeze(['disabled', 'review', 'auto-apply']);

/** Ambang confidence minimum untuk auto-apply (tanpa confidence buatan). */
export const AUTO_APPLY_MIN_CONFIDENCE = 80;

/**
 * Validasi & sanitize policy dari body request.
 * @param {object} patch - partial policy { field: mode }
 * @param {object} current - policy saat ini
 * @returns {{ok: boolean, error?: string, policy?: object}}
 */
export function sanitizeFieldPolicy(patch, current = DEFAULT_FIELD_POLICY) {
  if (!patch || typeof patch !== 'object') {
    return { ok: false, error: 'Policy harus berupa object.' };
  }
  const next = { ...current };
  for (const [field, mode] of Object.entries(patch)) {
    if (!(field in DEFAULT_FIELD_POLICY)) {
      return { ok: false, error: `Field tidak dikenal: ${field}` };
    }
    if (!VALID_MODES.includes(mode)) {
      return { ok: false, error: `Mode tidak valid untuk ${field}: ${mode}. Gunakan disabled | review | auto-apply.` };
    }
    // Field terkunci tidak boleh di-upgrade ke auto-apply
    if (LOCKED_REVIEW_FIELDS.includes(field) && mode === 'auto-apply') {
      return { ok: false, error: `Field ${field} terkunci di review (kalibrasi OCR belum akurat).` };
    }
    next[field] = mode;
  }
  return { ok: true, policy: next };
}

/**
 * Filter patch OCR berdasarkan policy + confidence.
 * Hanya field yang diizinkan masuk ke patch apply.
 *
 * @param {object} patch - patch dari processFrame()
 * @param {object} readings - readings dari processFrame()
 * @param {object} policy - field policy aktif
 * @returns {{filtered: object, skipped: Array<{field: string, mode: string, reason: string}>}}
 */
export function filterPatchByPolicy(patch, readings, policy = DEFAULT_FIELD_POLICY) {
  const filtered = {};
  const skipped = [];

  if (!patch || typeof patch !== 'object') return { filtered, skipped };

  // Mapping field → path di patch
  const fieldToPath = {
    timer: ['durationMs'],
    scoreBlue: ['blue', 'kills'],
    scoreRed: ['red', 'kills'],
    goldBlue: ['blue', 'gold'],
    goldRed: ['red', 'gold']
  };

  for (const [field, path] of Object.entries(fieldToPath)) {
    const mode = policy[field] || 'disabled';
    if (mode === 'disabled') {
      skipped.push({ field, mode, reason: 'disabled' });
      continue;
    }

    // Cek apakah field ada di patch (ok && value !== null di processFrame)
    let value;
    if (path.length === 1) {
      if (!(path[0] in patch)) continue;
      value = patch[path[0]];
    } else {
      const [side, key] = path;
      if (!patch[side] || !(key in patch[side])) continue;
      value = patch[side][key];
    }

    if (mode === 'auto-apply') {
      // Cek confidence dari readings
      const reading = readings?.[field];
      if (reading && typeof reading.confidence === 'number' && reading.confidence < AUTO_APPLY_MIN_CONFIDENCE) {
        skipped.push({ field, mode, reason: 'low_confidence' });
        continue;
      }
      // Masukkan ke filtered
      if (path.length === 1) {
        filtered[path[0]] = value;
      } else {
        const [side, key] = path;
        filtered[side] = { ...(filtered[side] || {}), [key]: value };
      }
    } else {
      // review: tidak auto-apply, tapi dicatat untuk operator
      skipped.push({ field, mode, reason: 'needs_review' });
    }
  }

  return { filtered, skipped };
}

/**
 * Format policy untuk response API (tanpa field internal).
 */
export function publicFieldPolicy(policy = DEFAULT_FIELD_POLICY) {
  const out = {};
  for (const [k, v] of Object.entries(policy)) {
    out[k] = v;
  }
  return out;
}
