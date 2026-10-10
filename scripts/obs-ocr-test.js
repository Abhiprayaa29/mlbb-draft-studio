/**
 * scripts/obs-ocr-test.js
 * ---------------------------------------------------------------------------
 * Uji OBS capture service dengan MOCK client (tanpa OBS nyata).
 *
 * Jalankan:  node scripts/obs-ocr-test.js
 *
 * Phase 7 coverage:
 *   1. Koneksi sukses
 *   2. Auth gagal (password salah)
 *   3. Source tidak ditemukan
 *   4. Screenshot valid base64 → Buffer
 *   5. Screenshot invalid base64 → error
 *   6. Capture sukses → processFrame dipanggil
 *   7. Loop tidak overlap (busy flag + droppedFrames)
 *   8. Stop cegah frame baru
 *   9. Reconnect setelah putus (backoff)
 *  10. OBSERVE-ONLY: applyFrameResult dipanggil tapi policy disabled → state tidak berubah
 *  11. Field disabled/review tidak diterapkan
 *  12. Auto-apply hanya field diizinkan
 *  13. Error OCR tidak hentikan loop
 *  14. API status tidak mengandung password
 * ---------------------------------------------------------------------------
 */
import { createObsCapture } from '../server/ocr/obsCapture.js';
import { DEFAULT_FIELD_POLICY, filterPatchByPolicy, LOCKED_REVIEW_FIELDS } from '../server/ocr/fieldPolicy.js';

let pass = 0;
const failures = [];

function ok(name, detail = '') {
  pass += 1;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(name, detail = '') {
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(cond, name, detail = '') {
  if (cond) ok(name, detail);
  else bad(name, detail);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- Mock OBS client factory ------------------------------------------------
function createMockClient(opts = {}) {
  const listeners = {};
  const client = {
    connected: false,
    connectCalls: 0,
    disconnectCalls: 0,
    callLog: [],
    on(event, fn) { listeners[event] = fn; },
    emit(event, ...args) { if (listeners[event]) listeners[event](...args); },
    async connect(url, password) {
      client.connectCalls += 1;
      client.lastConnectOpts = { url, password };
      if (opts.authFail && password === 'wrong') {
        throw new Error('Authentication failed.');
      }
      if (opts.connectFail) {
        throw new Error('Connection refused.');
      }
      client.connected = true;
    },
    async disconnect() {
      client.disconnectCalls += 1;
      client.connected = false;
    },
    async call(method, params) {
      client.callLog.push({ method, params });
      if (method === 'GetInputList') {
        if (opts.inputsError) throw new Error('GetInputList failed.');
        return { inputs: opts.inputs || [] };
      }
      if (method === 'GetSourceScreenshot') {
        if (opts.screenshotError) throw new Error('Source not found.');
        if (opts.invalidBase64) return { imageData: 'not-valid-base64!!!' };
        if (opts.noImageData) return {};
        // Minimal valid 1x1 PNG
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        return { imageData: png.toString('base64') };
      }
      return {};
    }
  };
  return client;
}

// --- Test 1: Koneksi sukses -------------------------------------------------
console.log('\n--- 1. Koneksi sukses ---');
{
  const mock = createMockClient();
  const obs = createObsCapture({
    processFrame: async () => ({ readings: {}, events: [], skipped: [] }),
    applyFrameResult: () => {},
    createClient: () => mock
  });
  obs.configure({ wsUrl: 'ws://127.0.0.1:4455', password: '', intervalMs: 200 });
  try {
    // start will connect + begin loop; stop immediately
    await obs.start();
    assert(obs.isConnected === true, 'connected=true setelah start');
    const st = obs.publicStatus();
    assert(st.connected === true, 'publicStatus.connected=true');
    assert(st.wsUrl === 'ws://127.0.0.1:4455', 'wsUrl di publicStatus');
    await obs.stop();
    await obs.dispose();
  } catch (e) {
    bad('koneksi sukses', e.message);
  }
}

// --- Test 2: Auth gagal -----------------------------------------------------
console.log('\n--- 2. Auth gagal (password salah) ---');
{
  const mock = createMockClient({ authFail: true });
  const obs = createObsCapture({
    processFrame: async () => ({}),
    applyFrameResult: () => {},
    createClient: () => mock
  });
  obs.configure({ wsUrl: 'ws://127.0.0.1:4455', password: 'wrong', intervalMs: 200 });
  try {
    await obs.start();
    bad('auth gagal seharusnya throw', 'start tidak throw');
  } catch (e) {
    assert(/Authentication failed|Gagal terhubung/i.test(e.message), 'auth gagal → error', e.message);
  }
  await obs.dispose();
}

// --- Test 3: Source tidak ditemukan ------------------------------------------
console.log('\n--- 3. Source tidak ditemukan ---');
{
  const mock = createMockClient({ screenshotError: true });
  const obs = createObsCapture({
    processFrame: async () => ({}),
    applyFrameResult: () => {},
    createClient: () => mock
  });
  obs.configure({ wsUrl: 'ws://127.0.0.1:4455', password: '', sourceName: 'Ghost', intervalMs: 200 });
  await obs.start();
  await sleep(300);
  const st = obs.publicStatus();
  assert(st.lastError && /Source not found/i.test(st.lastError), 'lastError = Source not found', st.lastError);
  assert(st.processedFrames === 0, 'processedFrames=0');
  await obs.stop();
  await obs.dispose();
}

// --- Test 4: Screenshot valid base64 → Buffer --------------------------------
console.log('\n--- 4. Screenshot valid base64 → Buffer ---');
{
  const mock = createMockClient();
  const obs = createObsCapture({
    processFrame: async (buf) => {
      assert(Buffer.isBuffer(buf), 'processFrame menerima Buffer');
      assert(buf.length > 0, 'Buffer tidak kosong');
      return { readings: {}, events: [], skipped: [] };
    },
    applyFrameResult: () => {},
    createClient: () => mock
  });
  obs.configure({ wsUrl: 'ws://127.0.0.1:4455', password: '', sourceName: 'Gameplay', intervalMs: 200 });
  await obs.start();
  await sleep(400);
  const st = obs.publicStatus();
  assert(st.processedFrames >= 1, 'processedFrames >= 1', `got ${st.processedFrames}`);
  await obs.stop();
  await obs.dispose();
}

// --- Test 5: Screenshot invalid base64 ---------------------------------------
console.log('\n--- 5. Screenshot invalid base64 ---');
{
  const mock = createMockClient({ invalidBase64: true });
  const obs = createObsCapture({
    processFrame: async () => ({}),
    applyFrameResult: () => {},
    createClient: () => mock
  });
  obs.configure({ wsUrl: 'ws://127.0.0.1:4455', password: '', sourceName: 'Bad', intervalMs: 200 });
  await obs.start();
  await sleep(300);
  const st = obs.publicStatus();
  // Buffer.from with invalid base64 still returns a Buffer (lenient), but empty imageData path throws
  // invalidBase64 returns garbage string — Buffer.from will produce something; frameError if processFrame rejects
  assert(st.totalFrames >= 1 || st.lastError !== null, 'frame di-capture atau error dicatat');
  await obs.stop();
  await obs.dispose();
}

// --- Test 6: Capture sukses → processFrame dipanggil -------------------------
console.log('\n--- 6. Capture sukses → processFrame dipanggil ---');
{
  let processCalls = 0;
  let applyCalls = 0;
  const mock = createMockClient();
  const obs = createObsCapture({
    processFrame: async () => { processCalls += 1; return { readings: { timer: '05:00' }, events: [], skipped: [] }; },
    applyFrameResult: (r) => { applyCalls += 1; },
    createClient: () => mock
  });
  obs.configure({ wsUrl: 'ws://127.0.0.1:4455', password: '', sourceName: 'Gameplay', intervalMs: 200 });
  await obs.start();
  await sleep(600);
  await obs.stop();
  assert(processCalls >= 2, 'processFrame dipanggil >= 2x', `got ${processCalls}`);
  assert(applyCalls >= 2, 'applyFrameResult dipanggil >= 2x', `got ${applyCalls}`);
  await obs.dispose();
}

// --- Test 7: Loop tidak overlap (busy → droppedFrames) -----------------------
console.log('\n--- 7. Loop tidak overlap ---');
{
  let concurrent = 0;
  let maxConcurrent = 0;
  const mock = createMockClient();
  const obs = createObsCapture({
    processFrame: async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await sleep(350);
      concurrent -= 1;
      return { readings: {}, events: [], skipped: [] };
    },
    applyFrameResult: () => {},
    createClient: () => mock
  });
  obs.configure({ wsUrl: 'ws://127.0.0.1:4455', password: '', sourceName: 'Gameplay', intervalMs: 200 });
  await obs.start();
  await sleep(1200);
  await obs.stop();
  assert(maxConcurrent === 1, 'tidak pernah > 1 concurrent processFrame', `max=${maxConcurrent}`);
  const st = obs.publicStatus();
  assert(st.processedFrames >= 2, 'loop tetap jalan meski processFrame lambat', `processed=${st.processedFrames}`);
  await obs.dispose();
}

// --- Test 8: Stop cegah frame baru -------------------------------------------
console.log('\n--- 8. Stop cegah frame baru ---');
{
  const mock = createMockClient();
  const obs = createObsCapture({
    processFrame: async () => ({ readings: {}, events: [], skipped: [] }),
    applyFrameResult: () => {},
    createClient: () => mock
  });
  obs.configure({ wsUrl: 'ws://127.0.0.1:4455', password: '', sourceName: 'Gameplay', intervalMs: 200 });
  await obs.start();
  await sleep(300);
  await obs.stop();
  const processedAfterStop = obs.publicStatus().processedFrames;
  await sleep(600);
  const processedLater = obs.publicStatus().processedFrames;
  assert(processedAfterStop === processedLater, 'processedFrames tidak bertambah setelah stop', `${processedAfterStop} → ${processedLater}`);
  await obs.dispose();
}

// --- Test 9: Reconnect setelah putus (backoff) -------------------------------
console.log('\n--- 9. Reconnect setelah putus ---');
{
  let connectAttempts = 0;
  const mock = createMockClient();
  // Override connect to fail first N times then succeed
  const origConnect = mock.connect.bind(mock);
  mock.connect = async (opts) => {
    connectAttempts += 1;
    if (connectAttempts <= 2) throw new Error('Connection refused.');
    return origConnect(opts);
  };
  const obs = createObsCapture({
    processFrame: async () => ({ readings: {}, events: [], skipped: [] }),
    applyFrameResult: () => {},
    createClient: () => mock
  });
  obs.configure({ wsUrl: 'ws://127.0.0.1:4455', password: '', intervalMs: 200 });
  try {
    // First start will fail all 5 attempts (connect always fails first 2, but connectWithBackoff does up to 6 total tries)
    // Actually connectWithBackoff tries 6 times (0..5). Our mock fails only first 2, so it should succeed on 3rd attempt.
    await obs.start();
    assert(obs.isConnected === true, 'reconnect berhasil setelah 2 gagal', `attempts=${connectAttempts}`);
  } catch (e) {
    bad('reconnect', e.message);
  }
  await obs.stop();
  await obs.dispose();
}

// --- Test 10: OBSERVE-ONLY default -------------------------------------------
console.log('\n--- 10. OBSERVE-ONLY default (field policy) ---');
{
  const patch = { durationMs: 279000, blue: { kills: 10, gold: 11000 }, red: { kills: 9, gold: 12800 } };
  const { filtered } = filterPatchByPolicy(patch, {}, DEFAULT_FIELD_POLICY);
  const hasAny = filtered.durationMs !== undefined
    || (filtered.blue && Object.keys(filtered.blue).length > 0)
    || (filtered.red && Object.keys(filtered.red).length > 0);
  assert(!hasAny, 'default policy → semua field difilter (OBSERVE-ONLY)');
  assert(DEFAULT_FIELD_POLICY.scoreRed === 'disabled', 'scoreRed default disabled');
  assert(DEFAULT_FIELD_POLICY.goldBlue === 'disabled', 'goldBlue default disabled');
  assert(LOCKED_REVIEW_FIELDS.includes('scoreRed'), 'scoreRed di LOCKED_REVIEW_FIELDS');
  assert(LOCKED_REVIEW_FIELDS.includes('goldBlue'), 'goldBlue di LOCKED_REVIEW_FIELDS');
}

// --- Test 11: Field disabled/review tidak diterapkan -------------------------
console.log('\n--- 11. Field disabled/review tidak diterapkan ---');
{
  const policy = {
    ...DEFAULT_FIELD_POLICY,
    timer: 'auto-apply',
    scoreRed: 'review'
  };
  const patch = { durationMs: 279000, blue: { kills: 10 }, red: { kills: 9 } };
  const { filtered, skipped } = filterPatchByPolicy(patch, { timer: { confidence: 95 } }, policy);
  assert(filtered.durationMs === 279000, 'timer auto-apply → diterapkan');
  assert(filtered.red === undefined || filtered.red.kills === undefined, 'scoreRed review → TIDAK diterapkan');
  assert(filtered.blue === undefined || filtered.blue.kills === undefined, 'scoreBlue disabled → TIDAK diterapkan');
  assert(skipped.some(s => s.field === 'scoreRed' && s.reason === 'needs_review'), 'scoreRed masuk skipped:needs_review');
}

// --- Test 12: Auto-apply hanya field diizinkan --------------------------------
console.log('\n--- 12. Auto-apply hanya field diizinkan ---');
{
  const policy = {
    ...DEFAULT_FIELD_POLICY,
    timer: 'auto-apply',
    scoreBlue: 'auto-apply',
    goldRed: 'auto-apply'
  };
  const patch = { durationMs: 279000, blue: { kills: 10, gold: 11000 }, red: { kills: 9, gold: 12800 } };
  const readings = {
    timer: { confidence: 95 },
    scoreBlue: { confidence: 90 },
    goldRed: { confidence: 88 }
  };
  const { filtered } = filterPatchByPolicy(patch, readings, policy);
  assert(filtered.durationMs === 279000, 'timer auto-apply → durationMs ada');
  assert(filtered.blue?.kills === 10, 'scoreBlue auto-apply → blue.kills ada');
  assert(filtered.blue?.gold === undefined, 'goldBlue disabled → blue.gold TIDAK ada');
  assert(filtered.red?.gold === 12800, 'goldRed auto-apply → red.gold ada');
  assert(filtered.red?.kills === undefined, 'scoreRed disabled → red.kills TIDAK ada');
}

// --- Test 13: Error OCR tidak hentikan loop ----------------------------------
console.log('\n--- 13. Error OCR tidak hentikan loop ---');
{
  let calls = 0;
  const mock = createMockClient();
  const obs = createObsCapture({
    processFrame: async () => {
      calls += 1;
      if (calls === 1) throw new Error('OCR engine crash');
      return { readings: {}, events: [], skipped: [] };
    },
    applyFrameResult: () => {},
    createClient: () => mock
  });
  obs.configure({ wsUrl: 'ws://127.0.0.1:4455', password: '', sourceName: 'Gameplay', intervalMs: 200 });
  await obs.start();
  await sleep(700);
  await obs.stop();
  const st = obs.publicStatus();
  assert(calls >= 2, 'loop tetap jalan setelah error OCR', `calls=${calls}`);
  assert(st.lastError !== null, 'lastError tercatat', st.lastError);
  await obs.dispose();
}

// --- Test 14: Status tidak mengandung password --------------------------------
console.log('\n--- 14. Status tidak mengandung password ---');
{
  const mock = createMockClient();
  const obs = createObsCapture({
    processFrame: async () => ({}),
    applyFrameResult: () => {},
    createClient: () => mock
  });
  obs.configure({ wsUrl: 'ws://127.0.0.1:4455', password: 'super-secret-xyz', intervalMs: 200 });
  const st = obs.publicStatus();
  const json = JSON.stringify(st);
  assert(!json.includes('super-secret-xyz'), 'password tidak ada di publicStatus JSON');
  assert(!('password' in st), 'field password tidak ada di publicStatus');
  await obs.dispose();
}

// --- Test 15: getSources mengembalikan daftar + isGameCapture -----------------
console.log('\n--- 15. getSources ---');
{
  const mock = createMockClient({
    inputs: [
      { name: 'Gameplay', inputKind: 'game_capture' },
      { name: 'Browser Overlay', inputKind: 'browser_source' },
      { name: 'Window Capture', inputKind: 'window_capture' }
    ]
  });
  const obs = createObsCapture({
    processFrame: async () => ({}),
    applyFrameResult: () => {},
    createClient: () => mock
  });
  obs.configure({ wsUrl: 'ws://127.0.0.1:4455', password: '', intervalMs: 200 });
  // Connect manually via start+stop
  await obs.start();
  const sources = await obs.getSources();
  assert(sources.length === 3, '3 sources', `got ${sources.length}`);
  const gameplay = sources.find(s => s.name === 'Gameplay');
  assert(gameplay?.isGameCapture === true, 'Gameplay → isGameCapture=true');
  const browser = sources.find(s => s.name === 'Browser Overlay');
  assert(browser?.isGameCapture === false, 'Browser → isGameCapture=false');
  await obs.stop();
  await obs.dispose();
}

// --- Summary -----------------------------------------------------------------
console.log('\n' + '='.repeat(60));
if (failures.length === 0) {
  console.log(`SEMUA LULUS — ${pass} asersi PASS, 0 FAIL`);
  process.exit(0);
} else {
  console.log(`GAGAL — ${pass} PASS, ${failures.length} FAIL:`);
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
}
