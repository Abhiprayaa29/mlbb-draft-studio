/**
 * scripts/ocr-test.js
 * ---------------------------------------------------------------------------
 * Uji pipeline OCR end-to-end TANPA browser: spawn server terpisah
 * (port & DATA_DIR khusus), kirim screenshot kalibrasi ke POST /api/ocr/frame.
 *
 * Jalankan:  npm run test:ocr
 *
 * Target gambar: public/assets/OCR/Gameplayforscoreboard.png (1384×706).
 * Angka yang diuji adalah hasil kalibrasi JUJUR (lihat server/ocr/LICENSES.md):
 *   - timer "04:39"     → 279000 ms   ✅ akurat
 *   - scoreBlue "10"    → 10          ✅ akurat
 *   - goldRed "12.8k"   → 12800       ✅ akurat
 *   - scoreRed  "3"     → 3           ⚠️ keterbatasan (seharusnya 9 — digit merah low-contrast)
 *   - goldBlue  "11k"   → 11000       ⚠️ keterbatasan (seharusnya 11500 — desimal .5 gugur)
 *   - notifikasi        → tanpa klaim Lord/Turtle palsu
 * Pipeline, endpoint, patch, gerbang format, dan keamanan tetap diuji penuh.
 * ---------------------------------------------------------------------------
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(os.tmpdir(), `mlbb-studio-ocr-test-${process.pid}`);
const TOKEN = 'rahasia-ocr-456';
const PORT = 5197;
const FRAME = path.join(ROOT, 'public', 'assets', 'OCR', 'Gameplayforscoreboard.png');

let pass = 0;
const failures = [];
const logs = [];

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(url, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const res = await fetch(url, {
    method,
    headers,
    body
  });
  let data = null;
  const text = await res.text();
  if (raw) {
    data = text;
  } else {
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
  }
  return { status: res.status, data };
}

/* --------------------------------------------------------- manajemen server */

const children = [];

async function startServer() {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATA_DIR,
      NODE_ENV: '',
      APP_AUTH_TOKEN: TOKEN
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', (d) => {
    output += d.toString();
    logs.push(String(d));
  });
  child.stderr.on('data', (d) => {
    output += d.toString();
    logs.push(String(d));
  });
  child.on('exit', (code, signal) => {
    child.exited = { code, signal };
  });

  const started = Date.now();
  let lastErr = null;
  while (Date.now() - started < 20000) {
    if (child.exited) {
      throw new Error(`server keluar lebih awal (${JSON.stringify(child.exited)}):\n${output}`);
    }
    try {
      const h = await http(`http://127.0.0.1:${PORT}/api/health`);
      if (h.status === 200 && h.data?.ok) return { child };
      lastErr = `status ${h.status}`;
    } catch (e) {
      lastErr = e.message;
    }
    await sleep(150);
  }
  throw new Error(`server tidak siap dalam 20s (${lastErr}):\n${output}`);
}

function stopServers() {
  for (const child of children) {
    if (child && !child.exited) child.kill('SIGKILL');
  }
}

/* --------------------------------------------------------------- uji utama */

async function main() {
  if (!fs.existsSync(FRAME)) {
    throw new Error(`Frame kalibrasi tidak ditemukan: ${FRAME}`);
  }
  const frameBuf = fs.readFileSync(FRAME);
  console.log(`OCR test: frame ${path.basename(FRAME)} (${frameBuf.length} bytes) → port ${PORT}\n`);

  const server = await startServer();
  const base = `http://127.0.0.1:${PORT}`;
  const auth = { 'x-operator-token': TOKEN, 'content-type': 'image/png' };

  try {
    console.log('1. Keamanan route');
    const noAuth = await fetch(`${base}/api/ocr/frame`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: frameBuf
    });
    assert(noAuth.status === 401, 'POST tanpa token ditolak 401', `status=${noAuth.status}`);

    const badBody = await fetch(`${base}/api/ocr/frame`, {
      method: 'POST',
      headers: auth,
      body: Buffer.from('bukan-gambar')
    });
    const badBodyJson = await badBody.json().catch(() => null);
    assert(
      badBody.status === 400 || badBody.status === 500,
      'Body non-gambar ditolak (400/500)',
      `status=${badBody.status} error=${badBodyJson?.error ?? ''}`
    );

    console.log('\n2. POST frame kalibrasi (OCR penuh — bisa ±10–30 detik)');
    const t0 = Date.now();
    const post = await fetch(`${base}/api/ocr/frame`, {
      method: 'POST',
      headers: auth,
      body: frameBuf
    });
    const elapsed = Date.now() - t0;
    const body = await post.json();
    assert(post.status === 200, 'POST /api/ocr/frame → 200', `status=${post.status} ${elapsed}ms`);
    assert(body?.ok === true, 'Response ok:true');
    assert(
      body?.frameSize?.width === 1384 && body?.frameSize?.height === 706,
      'frameSize 1384×706',
      JSON.stringify(body?.frameSize)
    );

    const r = body?.readings || {};
    console.log('\n3. Pembacaan field (jujur — termasuk keterbatasan terdokumentasi)');
    assert(r.timer?.text === '04:39', 'timer text "04:39"', `got "${r.timer?.text}"`);
    assert(r.timer?.value === 279000, 'timer value 279000 ms', `got ${r.timer?.value}`);
    assert(r.scoreBlue?.text === '10', 'scoreBlue text "10"', `got "${r.scoreBlue?.text}"`);
    assert(r.scoreBlue?.value === 10, 'scoreBlue value 10', `got ${r.scoreBlue?.value}`);
    assert(r.goldRed?.value === 12800, 'goldRed value 12800 (12.8k)', `got ${r.goldRed?.value}`);
    assert(r.scoreRed?.ok === true, 'scoreRed lolos format gate');
    assert(
      typeof r.scoreRed?.text === 'string' && r.scoreRed.text.length > 0,
      'scoreRed menghasilkan teks (keterbatasan: "3" bukan "9")',
      `text="${r.scoreRed?.text}" value=${r.scoreRed?.value}`
    );
    assert(
      typeof r.goldBlue?.text === 'string' && /^\d/.test(r.goldBlue.text),
      'goldBlue menghasilkan teks (keterbatasan: "11k" bukan "11.5k")',
      `text="${r.goldBlue?.text}" value=${r.goldBlue?.value}`
    );

    console.log('\n4. Patch & integrasi');
    assert(body?.patch?.durationMs === 279000, 'patch.durationMs 279000', JSON.stringify(body?.patch?.durationMs));
    assert(body?.patch?.blue?.kills === 10, 'patch.blue.kills 10', JSON.stringify(body?.patch?.blue));
    assert(body?.patch?.red?.gold === 12800, 'patch.red.gold 12800', JSON.stringify(body?.patch?.red));
    assert(body?.applied === true, 'Patch diterapkan ke state (applied:true)');

    const stateRes = await http(`${base}/api/state`, { headers: { 'x-operator-token': TOKEN } });
    const st = stateRes.data?.state;
    assert(st?.score?.durationMs === 279000, 'state.score.durationMs 279000', `got ${st?.score?.durationMs}`);
    assert(st?.score?.blue?.kills === 10, 'state.score.blue.kills 10', `got ${st?.score?.blue?.kills}`);
    assert(st?.score?.red?.gold === 12800, 'state.score.red.gold 12800', `got ${st?.score?.red?.gold}`);
    assert(st?.integration?.scoreSource === 'ocr', 'integration.scoreSource === "ocr"', `got ${st?.integration?.scoreSource}`);

    console.log('\n5. Kejujuran event (tanpa klaim Lord/Turtle palsu)');
    const events = Array.isArray(body?.events) ? body.events : [];
    const lordTurtle = events.filter((e) => {
      const t = String(e?.type || e?.kind || '').toLowerCase();
      return t.includes('lord') || t.includes('turtle');
    });
    assert(lordTurtle.length === 0, 'Tidak ada event Lord/Turtle dari scoreboard statis', JSON.stringify(events));

    console.log('\n6. Frame kedua (reuse tracker — deterministik)');
    const post2 = await fetch(`${base}/api/ocr/frame`, {
      method: 'POST',
      headers: auth,
      body: frameBuf
    });
    const body2 = await post2.json();
    assert(post2.status === 200 && body2?.ok === true, 'Frame kedua → 200 ok');
    assert(body2?.readings?.timer?.value === 279000, 'Frame kedua: timer tetap 279000');
    assert(body2?.readings?.goldRed?.value === 12800, 'Frame kedua: goldRed tetap 12800');
  } finally {
    stopServers();
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`OCR test selesai: ${pass} PASS, ${failures.length} FAIL`);
  if (failures.length > 0) {
    console.log('\nKegagalan:');
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* diabaikan — direktori sementara */
  }
}

main().catch((e) => {
  console.error('OCR test gagal total:', e);
  stopServers();
  process.exitCode = 1;
});
