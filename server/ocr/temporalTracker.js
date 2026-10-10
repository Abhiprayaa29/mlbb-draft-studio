/**
 * server/ocr/temporalTracker.js
 * ---------------------------------------------------------------------------
 * Port dari ScoreSight temporal machinery:
 *  - OCRResultPerCharacterSmoother (text_detection_target.py): voting mayoritas
 *    per-karakter atas history terakhir (max_history=5) — menghilangkan flicker
 *    karakter tunggal.
 *  - skip_similar_image (tesseract.py): jika crop grayscale berubah < 5%
 *    (mean absdiff /255), hasil OCR terakhir dipakai ulang (SameNoChange).
 *  - smoothing per-field terhadap nilai final.
 */

const MAX_HISTORY = 5; // ScoreSight max_history

/**
 * Per-karakter majority smoother ala ScoreSight.
 * `push(text)` → text hasil voting; history dijaga ≤ MAX_HISTORY.
 */
export function createCharSmoother(maxHistory = MAX_HISTORY) {
  let history = [];
  return {
    push(text) {
      history.push(text);
      if (history.length > maxHistory) history = history.slice(history.length - maxHistory);
      if (history.length === 1) return text;
      const len = Math.min(...history.map((h) => h.length));
      let out = '';
      for (let i = 0; i < len; i += 1) {
        const counts = new Map();
        for (const h of history) {
          const c = h[i];
          counts.set(c, (counts.get(c) ?? 0) + 1);
        }
        let bestC = history[history.length - 1][i];
        let bestN = 0;
        for (const [c, n] of counts) {
          if (n > bestN) {
            bestN = n;
            bestC = c;
          }
        }
        out += bestC;
      }
      return out;
    },
    reset() {
      history = [];
    }
  };
}

/**
 * Per-field state: crop gray terakhir (untuk skip-similar) + smoother + text
 * terakhir. `shouldSkip(crop)` true → panggil `reuse()` tanpa OCR ulang.
 */
export function createFieldTracker(maxHistory = MAX_HISTORY) {
  const smoother = createCharSmoother(maxHistory);
  let lastGray = null;
  let lastText = '';
  let lastOk = false;
  let lastConfidence = null;

  return {
    shouldSkip(crop) {
      if (!lastGray || lastGray.length !== crop.length) return false;
      let sum = 0;
      for (let i = 0; i < crop.length; i += 1) {
        const a = lastGray[i];
        const b = crop[i];
        sum += a > b ? a - b : b - a;
      }
      const diff = sum / (crop.length * 255);
      return diff < 0.05; // ScoreSight skip_similar threshold
    },
    remember(crop, rawText, ok, confidence) {
      lastGray = crop.slice();
      lastText = rawText;
      lastOk = ok;
      lastConfidence = confidence;
    },
    reuse() {
      // SameNoChange: pakai text terakhir, tapi tetap lewati smoother agar
      // state smoother tidak tercemar oleh pengulangan identik.
      return {
        text: smoother.push(lastText),
        rawText: lastText,
        confidence: lastConfidence,
        ok: lastOk,
        reason: lastOk ? null : 'skip_similar_stale'
      };
    },
    smooth(rawText) {
      return smoother.push(rawText);
    },
    reset() {
      lastGray = null;
      lastText = '';
      lastOk = false;
      lastConfidence = null;
      smoother.reset();
    }
  };
}
