/**
 * server/ocr/roiExtractor.js
 * ---------------------------------------------------------------------------
 * ROI model DEVIASI dari ScoreSight: ROI proporsional 0–1 (bukan piksel
 * absolut) supaya berlaku lintas resolusi layar. Dipetakan ke piksel per frame.
 */
import { cropGray } from './engine/imageops.js';

/**
 * Skala ROI proporsional → rect piksel, di-clamp ke dimensi frame.
 * @param {{x:number,y:number,w:number,h:number}} roi 0..1
 * @param {number} frameW
 * @param {number} frameH
 */
export function scaleRoi(roi, frameW, frameH) {
  const x = Math.max(0, Math.min(frameW - 1, Math.round(roi.x * frameW)));
  const y = Math.max(0, Math.min(frameH - 1, Math.round(roi.y * frameH)));
  const w = Math.max(1, Math.min(frameW - x, Math.round(roi.w * frameW)));
  const h = Math.max(1, Math.min(frameH - y, Math.round(roi.h * frameH)));
  return { x, y, w, h };
}

/**
 * Crop grayscale frame — dipakai unit-test & skip-similar tracker.
 * @param {Uint8Array} gray
 * @param {number} frameW
 * @param {{x:number,y:number,w:number,h:number}} pxRect
 */
export function extractCrop(gray, frameW, pxRect) {
  return cropGray(gray, frameW, pxRect.x, pxRect.y, pxRect.w, pxRect.h);
}
