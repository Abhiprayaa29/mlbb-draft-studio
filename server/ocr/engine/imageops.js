/**
 * server/ocr/engine/imageops.js
 * ---------------------------------------------------------------------------
 * Operasi citra biner/grayscale murni JS (tanpa OpenCV) untuk pipeline OCR.
 * Setara ringan dari langkah cv2 di ScoreSight `detect_multi_text`:
 * Otsu global, dilasi 3x3, perbandingan absdiff (skip_similar).
 * Semua bekerja pada buffer raw grayscale (Uint8Array, 1 byte/pixel).
 */
import sharp from 'sharp';

/** Konversi gambar (png/jpg) apa pun ke raw grayscale via sharp. */
export async function toGrayRaw(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

/** Ambil piksel area {x,y,w,h} dari buffer grayscale lebar `width`. */
export function cropGray(gray, width, x, y, w, h) {
  const x0 = Math.max(0, Math.min(width - 1, x));
  const y0 = Math.max(0, Math.min(Math.floor(gray.length / width) - 1, y));
  const x1 = Math.max(x0 + 1, Math.min(width, x + w));
  const y1 = Math.max(y0 + 1, Math.min(Math.floor(gray.length / width), y + h));
  const cw = x1 - x0;
  const ch = y1 - y0;
  const out = new Uint8Array(cw * ch);
  for (let row = 0; row < ch; row += 1) {
    const src = (y0 + row) * width + x0;
    out.set(gray.subarray(src, src + cw), row * cw);
  }
  return { data: out, width: cw, height: ch };
}

/**
 * Ambang Otsu (globally-optimal) pada histogram grayscale.
 * Setara `cv2.threshold(gray, 0, 255, THRESH_BINARY | THRESH_OTSU)`.
 * Mengembalikan citra biner 0/255.
 */
export function otsuBinarize(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const total = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t += 1) sumAll += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) out[i] = gray[i] > threshold ? 255 : 0;
  return { data: out, threshold };
}

/**
 * Dilasi biner 3x3, `iterations`× — setara
 * `cv2.dilate(img, np.ones((3,3)), iterations)`. Default ScoreSight: 1.
 */
export function dilateBinary(bin, width, height, iterations = 1) {
  let src = bin;
  for (let it = 0; it < iterations; it += 1) {
    const dst = new Uint8Array(src.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const y0 = y > 0 ? y - 1 : 0;
        const y1 = y < height - 1 ? y + 1 : height - 1;
        const x0 = x > 0 ? x - 1 : 0;
        const x1 = x < width - 1 ? x + 1 : width - 1;
        let v = 0;
        for (let yy = y0; yy <= y1 && !v; yy += 1) {
          const row = yy * width;
          for (let xx = x0; xx <= x1; xx += 1) {
            if (src[row + xx] !== 0) {
              v = 255;
              break;
            }
          }
        }
        dst[y * width + x] = v;
      }
    }
    src = dst;
  }
  return src;
}

/**
 * Perbedaan rata-rata absolut dua citra seukuran (0..1),
 * setara ScoreSight `cv2.absdiff` → dif Sum / (h*w) dengan skala /255.
 * dipakai temporalTracker.skip_similar (threshold < 0.05).
 */
export function meanAbsDiff(a, b) {
  if (a.length !== b.length || a.length === 0) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] > b[i] ? a[i] - b[i] : b[i] - a[i];
    sum += d;
  }
  return sum / (a.length * 255);
}

/** Balik warna (invert_patch) — 255 - x. */
export function invertBinary(bin) {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = 255 - bin[i];
  return out;
}

/** Stretch linear grayscale ke full range 0–255 (min→0, max→255). */
export function contrastStretch(gray) {
  let min = 255;
  let max = 0;
  for (let i = 0; i < gray.length; i += 1) {
    const v = gray[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max <= min) return gray;
  const scale = 255 / (max - min);
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i += 1) out[i] = Math.round((gray[i] - min) * scale);
  return out;
}

/** Raw grayscale → PNG buffer (untuk input tesseract.js). density: 70 default tesseract. */
export function grayToPngBuffer(gray, width, height, density = 70) {
  return sharp(Buffer.from(gray.buffer, gray.byteOffset, gray.length), {
    raw: { width, height, channels: 1 }
  })
    .png({ density })
    .toBuffer();
}

/**
 * Rescale tinggi ke `targetH` px (default 35 = ScoreSight rescale_patch).
 * Interpolasi area-lembut via sharp resize.
 */
export async function rescaleToHeight(gray, width, height, targetH = 35) {
  if (height === targetH) return { data: gray, width, height };
  const targetW = Math.max(1, Math.round(width * (targetH / height)));
  const { data, info } = await sharp(Buffer.from(gray.buffer, gray.byteOffset, gray.length), {
    raw: { width, height, channels: 1 }
  })
    .resize({ width: targetW, height: targetH, kernel: 'cubic' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

/** Rescale tinggi ke 35px (alias ScoreSight default). */
export const rescaleToHeight35 = (gray, width, height) => rescaleToHeight(gray, width, height, 35);
