/**
 * scripts/ocr-calibrate.js
 * ---------------------------------------------------------------------------
 * Kalibrasi ROI: jalankan processFrame terhadap screenshot uji dan cetak
 * readings mentah. Gunakan hasilnya untuk menyesuaikan DEFAULT_FIELDS di
 * server/ocr/settings.js sampai timer="04:39", kills 10/9, gold 11.5k/12.8k.
 *
 * Jalankan: node scripts/ocr-calibrate.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processFrame, disposeOcrEngine } from '../server/ocr/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const imgPath = path.join(ROOT, 'public', 'assets', 'OCR', 'Gameplayforscoreboard.png');

const buf = fs.readFileSync(imgPath);
console.log(`frame: ${imgPath} (${buf.length} bytes)`);
const t0 = Date.now();
const frame = await processFrame(buf, {});
console.log(`elapsed: ${Date.now() - t0}ms`);
console.log(JSON.stringify(frame, null, 2));
await disposeOcrEngine();
