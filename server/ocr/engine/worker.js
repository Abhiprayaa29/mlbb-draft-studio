/**
 * server/ocr/engine/worker.js
 * ---------------------------------------------------------------------------
 * Wrapper tesseract.js v7: satu worker LSTM, bahasa dari tessdata lokal
 * (bukan CDN), param ala ScoreSight (PSM SINGLE_WORD, dawg off, whitelist
 * per-field). API yang diekspor:
 *   createEngine({ langPath, lang }) -> {
 *     recognize(cropBuffer: Buffer, fieldSettings) ->
 *       Promise<{ text, rawText, confidence: number|null, ok, reason }>,
 *     dispose()
 *   }
 * Confidence: data.confidence tesseract (0–100) → /100; jika absen/0 → null
 * (tidak pernah dipalsukan). conf_thresh default ScoreSight = 0.5.
 */
import { createWorker, OEM, PSM } from 'tesseract.js';

const DEFAULT_CONF_THRESH = 0.5;

/** Whitelist per tipe field — port dari ScoreSight tesseract.py L483-494. */
export function whitelistForType(type) {
  if (type === 'number') return '0123456789';
  if (type === 'time') return '0123456789:.';
  return "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,:/-+()%$#@!'\"[]{} ";
}

/**
 * @param {{ langPath?: string, lang?: string, confThresh?: number }} opts
 */
export async function createEngine(opts = {}) {
  const langPath = opts.langPath;
  const lang = opts.lang ?? 'eng';
  const confThresh = opts.confThresh ?? DEFAULT_CONF_THRESH;

  const worker = await createWorker(lang, OEM.LSTM_ONLY, {
    langPath,
    cachePath: langPath,
    gzip: false,
    workerBlobURL: false,
    logger: () => {},
    tessedit_pageseg_mode: PSM.SINGLE_WORD,
    load_system_dawg: 'F',
    load_freq_dawg: 'F'
  });

  return {
    /**
     * @param {Buffer} cropBuffer PNG/JPEG crop yang sudah di-preprocess.
     * @param {{ type?: string, whitelist?: string, confThresh?: number }} fieldSettings
     */
    async recognize(cropBuffer, fieldSettings = {}) {
      const type = fieldSettings.type ?? 'text';
      const whitelist = fieldSettings.whitelist ?? whitelistForType(type);
      const thresh = fieldSettings.confThresh ?? confThresh;
      // PSM per-field: default SINGLE_WORD ('8') ala ScoreSight; field teks
      // frasa (notification) pakai SINGLE_BLOCK ('6') agar kata terhubung.
      await worker.setParameters({
        tessedit_char_whitelist: whitelist,
        tessedit_pageseg_mode: fieldSettings.psm ?? PSM.SINGLE_WORD
      });

      const { data } = await worker.recognize(cropBuffer);
      const rawText = (data.text ?? '').trim();
      const conf = typeof data.confidence === 'number' && data.confidence > 0
        ? data.confidence / 100
        : null;

      if (!rawText) {
        return { text: '', rawText, confidence: conf, ok: false, reason: 'empty' };
      }
      if (conf === null) {
        // Tidak ada confidence → jangan mengklaim lolos threshold.
        return { text: rawText, rawText, confidence: null, ok: false, reason: 'no_confidence' };
      }
      if (conf < thresh) {
        return { text: rawText, rawText, confidence: conf, ok: false, reason: 'low_confidence' };
      }
      return { text: rawText, rawText, confidence: conf, ok: true, reason: null };
    },

    async dispose() {
      await worker.terminate();
    }
  };
}
