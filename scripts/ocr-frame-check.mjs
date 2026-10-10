/**
 * Standalone OCR pipeline check on a real frame.
 * Reads frame → processFrame → dumps readings/patch/events.
 * Does NOT touch OBS state or apply patches to the server.
 */
import fs from 'fs';
import { processFrame, disposeOcrEngine } from '../server/ocr/index.js';

const framePath = process.argv[2] || '/tmp/frame-06min.png';
const buf = fs.readFileSync(framePath);
console.log('=== FRAME ===');
console.log('path:', framePath, 'bytes:', buf.length);

const t0 = Date.now();
const result = await processFrame(buf);
const dt = Date.now() - t0;
console.log('\n=== processFrame ===');
console.log('elapsed_ms:', dt);
console.log('frameSize:', JSON.stringify(result.frameSize));
console.log('events:', JSON.stringify(result.events));
console.log('patch:', JSON.stringify(result.patch));

console.log('\n=== readings ===');
for (const [name, r] of Object.entries(result.readings)) {
  console.log(
    `${name.padEnd(12)} ok=${r.ok} conf=${typeof r.confidence === 'number' ? r.confidence.toFixed(2) : r.confidence} ` +
    `value=${JSON.stringify(r.value)} reused=${r.reused} reason=${r.reason ?? '-'} ` +
    `rect=${JSON.stringify(r.rect)}`
  );
  console.log(`  rawText=${JSON.stringify(r.rawText)}`);
  console.log(`  text=${JSON.stringify(r.text)}`);
}

await disposeOcrEngine();
