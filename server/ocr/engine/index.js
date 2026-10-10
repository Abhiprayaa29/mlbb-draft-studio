/**
 * server/ocr/engine/index.js
 * ---------------------------------------------------------------------------
 * Pipeline OCR per-field mengikuti ScoreSight `detect_multi_text` (tesseract.py),
 * versi JS: frame → gray → Otsu GLOBAL sekali → per-ROI: crop → dilate 3x3 (1×)
 * → invert → rescale h=35 → tesseract LSTM.
 *
 * Urutan dilate→invert mengikuti ScoreSight (bukan sebaliknya — dilate bekerja
 * pada teks putih hasil Otsu sebelum dibalik jadi hitam-di-putih).
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  toGrayRaw,
  cropGray,
  otsuBinarize,
  dilateBinary,
  invertBinary,
  contrastStretch,
  rescaleToHeight,
  grayToPngBuffer
} from './imageops.js';
import { createEngine } from './worker.js';

const DEFAULT_TESSDATA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tessdata');

/**
 * @param {{ langPath?: string, lang?: string, confThresh?: number }} [opts]
 */
export async function createOcrEngine(opts = {}) {
  const worker = await createEngine({
    langPath: opts.langPath ?? DEFAULT_TESSDATA,
    lang: opts.lang,
    confThresh: opts.confThresh
  });

  return {
    /**
     * OCR satu ROI dari citra yang sudah di-grayscale & di-Otsu global.
     * @param {Uint8Array} otsu full-frame biner (0/255) hasil otsuBinarize
     * @param {number} frameW lebar frame
     * @param {{x:number,y:number,w:number,h:number}} pxRect rect piksel
     * @param {{ type?:string, whitelist?:string, confThresh?:number,
     *           psm?:string, dilate?:boolean, rescale?:boolean }} [fieldSettings]
     */
    async recognizeFromOtsu(otsu, frameW, pxRect, fieldSettings = {}) {
      let { data: crop, width: cw, height: ch } = cropGray(
        otsu, frameW, pxRect.x, pxRect.y, pxRect.w, pxRect.h
      );
      if (cw < 2 || ch < 2) {
        return { text: '', rawText: '', confidence: null, ok: false, reason: 'empty' };
      }

      if (fieldSettings.dilate !== false) {
        crop = dilateBinary(crop, cw, ch, 1);
      }
      crop = invertBinary(crop);

      let png;
      if (fieldSettings.rescale !== false && ch !== 35) {
        const rs = await rescaleToHeight(crop, cw, ch, 35);
        png = await grayToPngBuffer(rs.data, rs.width, rs.height);
      } else {
        png = await grayToPngBuffer(crop, cw, ch);
      }

      const result = await worker.recognize(png, fieldSettings);
      return result;
    },

    /**
     * OCR ROI dari grayscale frame (tanpa Otsu global).
     * localOtsu: binerisasi Otsu di dalam crop (kontras ROI berbeda dari frame).
     * noBinarize: invert grayscale langsung — pertahankan anti-alias stroke.
     */
    async recognizeFromGray(gray, frameW, pxRect, fieldSettings = {}) {
      const { data: crop, width: cw, height: ch } = cropGray(
        gray, frameW, pxRect.x, pxRect.y, pxRect.w, pxRect.h
      );
      if (cw < 2 || ch < 2) {
        return { text: '', rawText: '', confidence: null, ok: false, reason: 'empty' };
      }

      let work;
      if (fieldSettings.noBinarize) {
        work = invertBinary(fieldSettings.contrastStretch ? contrastStretch(crop) : crop);
      } else {
        const src = fieldSettings.contrastStretch ? contrastStretch(crop) : crop;
        const local = otsuBinarize(src);
        let bin = local.data;
        if (fieldSettings.dilate) bin = dilateBinary(bin, cw, ch, 1);
        work = invertBinary(bin);
      }

      let png;
      const density = fieldSettings.density ?? 70;
      const forceUpscale = fieldSettings.upscale === true;
      const targetH = fieldSettings.targetH ?? (forceUpscale || cw < 60 ? Math.max(70, ch * 2) : 35);
      if (fieldSettings.rescale !== false && (ch !== 35 || cw < 60 || forceUpscale)) {
        const rs = await rescaleToHeight(work, cw, ch, targetH);
        png = await grayToPngBuffer(rs.data, rs.width, rs.height, density);
      } else {
        png = await grayToPngBuffer(work, cw, ch, density);
      }

      return worker.recognize(png, fieldSettings);
    },

    /**
     * OCR frame penuh + rect piksel (dekomoditas; internal: gray + Otsu sekali).
     * @param {Buffer} frameBuffer
     */
    async recognize(frameBuffer, pxRect, fieldSettings = {}) {
      const { data: gray, width: fw } = await toGrayRaw(frameBuffer);
      const otsu = otsuBinarize(gray);
      return this.recognizeFromOtsu(otsu.data, fw, pxRect, fieldSettings);
    },

    dispose: () => worker.dispose()
  };
}
