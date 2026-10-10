/**
 * server/ocr/textNormalizer.js
 * ---------------------------------------------------------------------------
 * Normalisasi teks OCR → nilai domain. Port dari ScoreSight
 * `parse_time` / `parse_number` + aturan MLBB:
 *  - timer "MM:SS" atau "M:SS" → durationMs
 *  - kills "10" → 10 (leading zero dibuang: ScoreSight remove_leading_zeros)
 *  - gold "11.5k" / "12.8K" → 11500 / 12800 (suffix k/K = ribuan)
 *  - ordinal indicator ScoreSight (º/ª suffix) dibuang
 * Regex filter mengikuti ScoreSight format_regex (fullmatch).
 */

/** Fullmatch regex per tipe field (setara ScoreSight format_regex). */
export const FORMAT_REGEX = {
  // ScoreSight TIME: ^(?:(?:[0-5]?\d:[0-5]\d)|(?:[0-5]?\d\.\d))$
  time: /^(?:[0-5]?\d:[0-5]?\d)$/,
  // ScoreSight NUMBER (score): ^\d{1,3}$
  score: /^\d{1,3}$/,
  // gold MLBB: angka + opsional desimal + opsional suffix k/K
  gold: /^\d{1,4}(?:\.\d+)?[kKmM]?$/
};

/** Buang ordinal indicator º/ª yang menempel (ScoreSight ordinal_indicator). */
export function stripOrdinal(text) {
  return text.replace(/[ºª]/g, '').trim();
}

/** "04:39" | "4:39" → 279000 (ms). Bukan format valid → null. */
export function parseTimer(text) {
  const t = stripOrdinal(text);
  const m = FORMAT_REGEX.time.exec(t);
  if (!m) return null;
  const [mm, ss] = t.split(':').map(Number);
  return ((mm * 60) + ss) * 1000;
}

/** "10" → 10 (dengan remove_leading_zeros ala ScoreSight). Bukan → null. */
export function parseScore(text) {
  const t = stripOrdinal(text).replace(/^0+(?=\d)/, '');
  return FORMAT_REGEX.score.test(t) ? Number(t) : null;
}

/**
 * "11.5k" → 11500, "12.8K" → 12800, "743" → 743, "1.2m" → 1200000.
 * Suffix k/K = ×1000, m/M = ×1000000 (konvensi gold MLBB).
 */
export function parseGold(text) {
  const t = stripOrdinal(text);
  if (!FORMAT_REGEX.gold.test(t)) return null;
  const suffix = t.slice(-1).toLowerCase();
  const num = Number(suffix === 'k' || suffix === 'm' ? t.slice(0, -1) : t);
  if (Number.isNaN(num)) return null;
  if (suffix === 'k') return Math.round(num * 1000);
  if (suffix === 'm') return Math.round(num * 1000000);
  return Math.round(num);
}

/** Cocokkan teks terhadap format_regex field (fullmatch). */
export function matchesFormat(text, type) {
  const re = FORMAT_REGEX[type];
  if (!re) return false;
  return re.test(stripOrdinal(text));
}
