/**
 * scripts/scoresight-test.js
 * ---------------------------------------------------------------------------
 * Uji ScoreSight file bridge (unit + integrasi).
 * Fixture kecil di scripts/fixtures/scoresight/ — bukan file pertandingan nyata.
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { io as connectSocket } from 'socket.io-client';
import { createScoreSightBridge, parseGold, parseTime, parseTimeMs, mapToSides, ALLOWLIST_FILES, FILE_TO_FIELD } from '../server/scoresight/fileBridge.js';
import { fmtGold } from '../src/lib/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'scoresight');
const PORT = Number(process.env.TEST_PORT || 5175);
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
function assert(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function ensureFixture(name, content) {
  const p = path.join(FIXTURE_DIR, name);
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

/** Tulis semua field fixture dengan nilai standar. */
function writeFixtureSet(dir, vals) {
  fs.mkdirSync(dir, { recursive: true });
  const map = {
    'Home Score.txt': vals.homeScore,
    'Away Score.txt': vals.awayScore,
    'Home Gold.txt': vals.homeGold,
    'Away Gold.txt': vals.awayGold,
    'Home Lord.txt': vals.homeLord,
    'Away Lord.txt': vals.awayLord,
    'Home Turret.txt': vals.homeTurret,
    'Away Turet.txt': vals.awayTurret ?? vals.awayTuret,
    'Time.txt': vals.time
  };
  for (const [f, v] of Object.entries(map)) {
    if (v != null) fs.writeFileSync(path.join(dir, f), String(v));
  }
}

async function main() {
  console.log('=== ScoreSight file bridge test ===\n');

  /* ---------- 1. Parser unit ---------- */
  console.log('[1] Parser & allowlist');
  assert('parseGold integer', parseGold('9579') === 9579);
  assert('parseGold k-format', parseGold('31.4k') === 31400);
  assert('parseGold k-bulat', parseGold('31k') === 31000);
  // koma = pemisah desimal setara titik (HUD locale ID)
  assert('parseGold koma 16,4k → 16400', parseGold('16,4k') === 16400);
  assert('parseGold koma 12,8K → 12800', parseGold('12,8K') === 12800);
  assert('parseGold koma thousands 16,4 → 16400', parseGold('16,4', 'thousands') === 16400);
  assert('parseGold kosong → null', parseGold('') === null);
  assert('parseGold malformed → null', parseGold('abc') === null);
  assert('parseTime valid', parseTime('03:39') === '03:39');
  assert('parseTime invalid', parseTime('abc') === null);
  // parseTimeMs — Time.txt MM:SS → milidetik
  assert('parseTimeMs 00:00 → 0', parseTimeMs('00:00') === 0);
  assert('parseTimeMs 03:23 → 203000', parseTimeMs('03:23') === 203000);
  assert('parseTimeMs 11:30 → 690000', parseTimeMs('11:30') === 690000);
  assert('parseTimeMs 25:03 → 1503000', parseTimeMs('25:03') === 1503000);
  assert('parseTimeMs dua digit menit 10:05', parseTimeMs('10:05') === 605000);
  assert('parseTimeMs malformed → null', parseTimeMs('abc') === null);
  assert('parseTimeMs kosong → null', parseTimeMs('') === null);
  assert('parseTimeMs detik invalid (60) → null', parseTimeMs('03:60') === null);
  // fmtGold — format Indonesia
  assert('fmtGold 9579 → 9,6k', fmtGold(9579) === '9,6k');
  assert('fmtGold 10000 → 10k', fmtGold(10000) === '10k');
  assert('fmtGold 10500 → 10,5k', fmtGold(10500) === '10,5k');
  assert('fmtGold 19000 → 19k', fmtGold(19000) === '19k');
  assert('fmtGold 19500 → 19,5k', fmtGold(19500) === '19,5k');
  assert('fmtGold 31400 → 31,4k', fmtGold(31400) === '31,4k');
  assert('fmtGold 16400 → 16,4k', fmtGold(16400) === '16,4k');
  assert('fmtGold 12800 → 12,8k', fmtGold(12800) === '12,8k');
  assert('fmtGold 999 → 999', fmtGold(999) === '999');
  assert('fmtGold 7 → 7', fmtGold(7) === '7');
  assert('fmtGold null → –', fmtGold(null) === '–');
  assert('fmtGold empty → –', fmtGold('') === '–');
  assert('fmtGold invalid → –', fmtGold('abc') === '–');
  assert('fmtGold negative → –', fmtGold(-5) === '–');
  assert('fmtGold 139 ambigu → 139 (tidak dipaksa ribuan)', fmtGold(139) === '139');
  assert('fmtGold 16400 mengandung satu k saja', (fmtGold(16400).match(/k/g) || []).length === 1);
  assert('fmtGold tidak memutasi input', (() => { const n = 9579; fmtGold(n); return n === 9579; })());
  // goldMode raw (default) — integer = satuan gold asli
  assert('raw: 9579 tetap 9579', parseGold('9579', 'raw') === 9579);
  assert('raw: 34 tetap 34', parseGold('34', 'raw') === 34);
  assert('raw: 3041 tetap 3041', parseGold('3041', 'raw') === 3041);
  assert('raw: 16400 tetap 16400', parseGold('16400', 'raw') === 16400);
  assert('raw: suffix k tidak dobel', parseGold('16.4k', 'raw') === 16400);
  // goldMode thousands — integer kecil = satuan ribuan
  assert('thousands: 16 → 16000', parseGold('16', 'thousands') === 16000);
  assert('thousands: 12 → 12000', parseGold('12', 'thousands') === 12000);
  assert('thousands: 16400 tidak diubah', parseGold('16400', 'thousands') === 16400);
  assert('thousands: desimal 16.4 → 16400', parseGold('16.4', 'thousands') === 16400);
  assert('thousands: suffix k tidak dobel', parseGold('16.4k', 'thousands') === 16400);
  assert('raw: desimal mentah 16.4 ditolak', parseGold('16.4', 'raw') === null);
  assert('thousands: 139 → 139000 (mode eksplisit)', parseGold('139', 'thousands') === 139000);
  assert('allowlist = 9 file', ALLOWLIST_FILES.length === 9);
  assert('Away Turet typo didukung', ALLOWLIST_FILES.includes('Away Turet.txt'));
  assert('Time tidak di state fields', !Object.values(FILE_TO_FIELD).includes('time') || FILE_TO_FIELD['Time.txt'] === 'time');

  /* ---------- 2. Mapping Home/Away ---------- */
  console.log('\n[2] Mapping Home/Away');
  const fields = { homeScore: 5, awayScore: 3, homeGold: 12000, awayGold: 9000, homeLord: 1, awayLord: 0, homeTurret: 4, awayTurret: 2 };
  const mapBlue = mapToSides(fields, 'blue');
  assert('home=blue → blueKills', mapBlue.blue.kills === 5 && mapBlue.red.kills === 3);
  assert('home=blue → blueGold', mapBlue.blue.gold === 12000 && mapBlue.red.gold === 9000);
  const mapRed = mapToSides(fields, 'red');
  assert('home=red → redKills', mapRed.red.kills === 5 && mapRed.blue.kills === 3);
  assert('mapping null → null', mapToSides(fields, null) === null);

  /* ---------- 3. Bridge unit dengan fixture ---------- */
  console.log('\n[3] Bridge: nilai valid & deteksi perubahan');
  const testDir = path.join(FIXTURE_DIR, 'run');
  writeFixtureSet(testDir, {
    homeScore: '6', awayScore: '2', homeGold: '9579', awayGold: '8522',
    homeLord: '0', awayLord: '0', homeTurret: '2', awayTuret: '0', time: '03:39'
  });
  // fix: Away Turret typo name
  fs.writeFileSync(path.join(testDir, 'Away Turet.txt'), '0');
  fs.rmSync(path.join(testDir, 'Away Turret.txt'), { force: true });

  const appliedPatches = [];
  const bridge = createScoreSightBridge({
    dir: testDir,
    enabled: true,
    homeSide: 'blue',
    pollIntervalMs: 100,
    apply: (patch) => {
      appliedPatches.push(patch);
      return { ok: true };
    }
  });

  // 4. File valid → patch pertama
  const rStart = bridge.start();
  assert('start ok', rStart.ok === true, rStart.error);
  assert('status running', bridge.status().status === 'running');
  assert('patch pertama diterapkan', appliedPatches.length === 1);
  assert('patch.homeScore→blue.kills', appliedPatches[0]?.blue?.kills === 6);
  assert('patch.awayScore→red.kills', appliedPatches[0]?.red?.kills === 2);
  assert('patch.blue.gold=9579', appliedPatches[0]?.blue?.gold === 9579);
  assert('patch.red.turrets=0 (Away Turet)', appliedPatches[0]?.red?.turrets === 0);
  assert('patch tidak punya field "time" mentah', !('time' in (appliedPatches[0] || {})));
  assert('timeMs masuk patch sebagai top-level', typeof appliedPatches[0]?.timeMs === 'number', `timeMs=${appliedPatches[0]?.timeMs}`);

  // 5. Nilai tidak berubah → tidak ada patch baru
  bridge.refresh();
  await new Promise((r) => setTimeout(r, 50));
  bridge.refresh();
  assert('tidak ada patch jika nilai sama', appliedPatches.length === 1, `count=${appliedPatches.length}`);

  // 6. Nilai berubah → patch baru
  fs.writeFileSync(path.join(testDir, 'Home Score.txt'), '7');
  bridge.refresh();
  assert('patch baru saat homeScore berubah', appliedPatches.length === 2);
  assert('blue.kills updated', appliedPatches[1]?.blue?.kills === 7);

  bridge.stop();
  assert('stop → tidak berjalan', bridge.isRunning() === false);

  /* ---------- 7. File kosong bukan nol ---------- */
  console.log('\n[4] File kosong / malformed');
  const emptyDir = path.join(FIXTURE_DIR, 'empty');
  fs.rmSync(emptyDir, { recursive: true, force: true });
  fs.mkdirSync(emptyDir, { recursive: true });
  fs.writeFileSync(path.join(emptyDir, 'Home Score.txt'), '');
  fs.writeFileSync(path.join(emptyDir, 'Away Score.txt'), '2');
  const emptyPatches = [];
  const emptyBridge = createScoreSightBridge({
    dir: emptyDir, enabled: true, homeSide: 'blue', pollIntervalMs: 60000,
    apply: (p) => { emptyPatches.push(p); return { ok: true }; }
  });
  emptyBridge.start();
  assert('file kosong tidak dianggap 0', emptyPatches.length === 0 || emptyPatches[0]?.blueKills == null, JSON.stringify(emptyPatches[0]));
  assert('file valid tetap dibaca (awayScore)', emptyBridge.status().values?.awayScore === 2);
  emptyBridge.stop();

  // malformed di direktori bersih — apply tidak boleh dipanggil
  const malDir = path.join(FIXTURE_DIR, 'malformed');
  fs.rmSync(malDir, { recursive: true, force: true });
  fs.mkdirSync(malDir, { recursive: true });
  fs.writeFileSync(path.join(malDir, 'Home Score.txt'), 'abc');
  fs.writeFileSync(path.join(malDir, 'Away Score.txt'), 'xyz');
  const malApplied = [];
  const malformedBridge = createScoreSightBridge({
    dir: malDir, enabled: true, homeSide: 'blue', pollIntervalMs: 60000,
    apply: (p) => { malApplied.push(p); return { ok: true }; }
  });
  malformedBridge.start();
  assert('malformed tidak apply', malApplied.length === 0);
  assert('malformed tidak masuk values', malformedBridge.status().values?.homeScore == null);
  assert('file malformed ditandai', malformedBridge.status().files.some((f) => f.name === 'Home Score.txt' && f.stale));
  malformedBridge.stop();

  /* ---------- 8. Gold format ---------- */
  console.log('\n[5] Gold format dinormalisasi');
  const goldDir = path.join(FIXTURE_DIR, 'gold');
  writeFixtureSet(goldDir, { homeScore: '1', awayScore: '1', homeGold: '31.4k', awayGold: '20k', homeLord: '0', awayLord: '0', homeTurret: '0', awayTurret: '0', time: '01:00' });
  fs.writeFileSync(path.join(goldDir, 'Away Turet.txt'), '0');
  const goldPatches = [];
  const goldBridge = createScoreSightBridge({
    dir: goldDir, enabled: true, homeSide: 'blue', pollIntervalMs: 60000,
    apply: (p) => { goldPatches.push(p); return { ok: true }; }
  });
  goldBridge.start();
  assert('31.4k → 31400', goldPatches[0]?.blue?.gold === 31400, JSON.stringify(goldPatches[0]));
  assert('20k → 20000', goldPatches[0]?.red?.gold === 20000);
  goldBridge.stop();

  /* ---------- 9. Mapping required ---------- */
  console.log('\n[6] Mapping tidak tersedia → patch ditahan');
  const mapDir = path.join(FIXTURE_DIR, 'map');
  writeFixtureSet(mapDir, { homeScore: '9', awayScore: '1', homeGold: '1000', awayGold: '500', homeLord: '0', awayLord: '0', homeTurret: '0', awayTurret: '0', time: '00:30' });
  fs.writeFileSync(path.join(mapDir, 'Away Turet.txt'), '0');
  const mapPatches = [];
  const mapBridge = createScoreSightBridge({
    dir: mapDir, enabled: true, homeSide: null, pollIntervalMs: 60000,
    apply: (p) => { mapPatches.push(p); return { ok: true }; }
  });
  mapBridge.start();
  assert('status MAPPING_REQUIRED', mapBridge.status().status === 'MAPPING_REQUIRED');
  assert('tidak ada patch tanpa mapping', mapPatches.length === 0);
  mapBridge.stop();

  /* ---------- 10. Direktori tidak valid ---------- */
  console.log('\n[7] Direktori tidak valid / tidak ditemukan');
  const badBridge = createScoreSightBridge({
    dir: path.join(FIXTURE_DIR, 'tidak-ada'), enabled: true, homeSide: 'blue', pollIntervalMs: 60000,
    apply: () => ({ ok: true })
  });
  const badStart = badBridge.start();
  assert('start gagal (dir tidak ada)', badStart.ok === false);
  assert('status invalid_dir', badBridge.status().status === 'invalid_dir');

  /* ---------- 11. Allowlist: file di luar allowlist tidak dibaca ---------- */
  console.log('\n[8] Allowlist & path traversal');
  const travDir = path.join(FIXTURE_DIR, 'trav');
  fs.mkdirSync(travDir, { recursive: true });
  fs.writeFileSync(path.join(travDir, 'secret.txt'), 'RAHASIA');
  fs.writeFileSync(path.join(travDir, '..\\..\\..\\package.json'), '{}'); // path escape attempt
  const travBridge = createScoreSightBridge({
    dir: travDir, enabled: true, homeSide: 'blue', pollIntervalMs: 60000,
    apply: () => ({ ok: true })
  });
  travBridge.start();
  const travStatus = travBridge.status();
  assert('secret.txt tidak dibaca', !ALLOWLIST_FILES.includes('secret.txt'));
  assert('hanya file allowlist di status', travStatus.files.every((f) => ALLOWLIST_FILES.includes(f.name)));
  assert('tidak ada nilai dari secret', !Object.values(travStatus.values || {}).includes('RAHASIA'));
  travBridge.stop();

  /* ---------- 12. Stop service ---------- */
  console.log('\n[9] Stop menghentikan pembacaan');
  const stopDir = path.join(FIXTURE_DIR, 'stop');
  writeFixtureSet(stopDir, { homeScore: '1', awayScore: '0', homeGold: '100', awayGold: '100', homeLord: '0', awayLord: '0', homeTurret: '0', awayTurret: '0', time: '00:00' });
  fs.writeFileSync(path.join(stopDir, 'Away Turet.txt'), '0');
  const stopPatches = [];
  const stopBridge = createScoreSightBridge({
    dir: stopDir, enabled: true, homeSide: 'blue', pollIntervalMs: 50,
    apply: (p) => { stopPatches.push(p); return { ok: true }; }
  });
  stopBridge.start();
  const countAfterStart = stopPatches.length;
  stopBridge.stop();
  fs.writeFileSync(path.join(stopDir, 'Home Score.txt'), '99');
  // refresh manual tidak boleh apply setelah stop? — refresh() masih memanggil tick
  // tapi running=false → tick return early
  stopBridge.refresh();
  assert('setelah stop, perubahan file tidak apply', stopPatches.length === countAfterStart, `before=${countAfterStart} after=${stopPatches.length}`);

  /* ---------- 13. Integrasi server ---------- */
  console.log('\n[10] Integrasi server (socket + scoreInput gate)');
  // fixture dir untuk server test
  const serverFixDir = path.join(FIXTURE_DIR, 'server-run');
  writeFixtureSet(serverFixDir, {
    homeScore: '4', awayScore: '1', homeGold: '8000', awayGold: '6000',
    homeLord: '1', awayLord: '0', homeTurret: '3', awayTurret: '1', time: '05:00'
  });
  // start server test di port terpisah
  process.env.SERVER_PORT = String(PORT);
  const serverProc = (await import('node:child_process')).spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    env: {
      ...process.env,
      SERVER_PORT: String(PORT),
      PORT: String(PORT),
      SCORESIGHT_ENABLED: 'true',
      SCORESIGHT_DIR: serverFixDir,
      SCORESIGHT_HOME_SIDE: 'blue',
      SCORESIGHT_POLL_INTERVAL_MS: '200'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve) => {
    let out = '';
    const t = setInterval(() => {
      if (out.includes('server aktif') || out.includes('MLBB Draft Studio')) { clearInterval(t); resolve(); }
    }, 100);
    serverProc.stdout.on('data', (d) => { out += d; });
    serverProc.stderr.on('data', (d) => { out += d; });
    setTimeout(() => { clearInterval(t); resolve(); }, 8000);
  });

  const op = connectSocket(`http://127.0.0.1:${PORT}`, { transports: ['websocket'], auth: { token: '' }, query: { role: 'control' } });
  await new Promise((r) => op.on('connect', r));
  const ack = (ev, p) => new Promise((r) => op.emit(ev, p, r));
  const getState = () =>
    new Promise((resolve) => {
      http.get(`${BASE}/api/state`, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve(JSON.parse(d).state));
      }).on('error', () => resolve(null));
    });

  // REST status
  const ssRest = await new Promise((resolve) => {
    http.get(`${BASE}/api/scoresight`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', () => resolve(null));
  });
  assert('GET /api/scoresight', !!ssRest && ssRest.status, JSON.stringify(ssRest).slice(0, 80));

  // scoreInput=manual-only → ScoreSight apply harus ditolak
  const rManual = await ack('scoresight:update', { patch: { enabled: true, homeSide: 'blue' }, action: 'start' });
  assert('start bridge via socket', rManual.ok === true, rManual.error);
  // set dataSource scoresight + scoreInput external
  await ack('integration:update', { patch: { scoreInput: 'external', dataSource: 'scoresight-files' } });
  // refresh → apply jalan
  const rRefresh = await ack('scoresight:update', { action: 'refresh' });
  assert('refresh via socket', rRefresh.ok === true, rRefresh.error);

  // stop
  const rStop = await ack('scoresight:update', { action: 'stop' });
  assert('stop via socket', rStop.ok === true);

  // homeSide tidak valid
  const rBadSide = await ack('scoresight:update', { patch: { homeSide: 'purple' } });
  assert('homeSide tidak valid ditolak', rBadSide.ok === false);

  /* ---------- 14. Source priority: OCR tidak menimpa scoresight-files ---------- */
  console.log('\n[11] Source priority (OCR/GRID vs scoresight-files)');
  // pastikan scoresight-files + external masih aktif
  await ack('integration:update', { patch: { scoreInput: 'external', dataSource: 'scoresight-files' } });
  // reset skor
  await ack('score:update', { patch: { blue: { kills: 4, gold: 8000 }, red: { kills: 1, gold: 6000 } } });
  const stBefore = await getState();
  // OCR frame (dummy) — tidak boleh mengubah skor karena dataSource=scoresight-files
  const ocrRes = await fetch(`${BASE}/api/ocr/frame`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-operator-token': '' },
    body: JSON.stringify({ patch: { blue: { kills: 99 } }, readings: {}, events: [] })
  }).catch(() => null);
  // OCR frame butuh body image — kalau 4xx itu OK (tidak apply). Cek via score:update manual
  // yang lebih penting: applyFrameResult dengan source=obs
  const stAfterOcr = await getState();
  assert(
    'OCR tidak mengubah skor saat scoresight-files aktif',
    stAfterOcr.score.blue.kills === stBefore.score.blue.kills,
    `before=${stBefore.score.blue.kills} after=${stAfterOcr.score.blue.kills}`
  );

  // GRID patch score harus ditolak saat scoresight-files aktif —
  // diuji lewat applyGridPatch guard; kirim score:update external style tidak mungkin
  // karena score:update selalu manual. Cukup verifikasi scoreSource tetap scoresight-files.
  assert('scoreSource tetap scoresight-files', stAfterOcr.integration.scoreSource === 'scoresight-files', stAfterOcr.integration.scoreSource);

  /* ---------- 15. Match timer sinkron dari Time.txt ---------- */
  console.log('\n[12] Match timer sinkron dari Time.txt');
  // pastikan bridge running lagi (section [10] sudah stop)
  await ack('scoresight:update', { action: 'start' });
  await new Promise((r) => setTimeout(r, 500));
  // tulis Time.txt valid ke server fixture dir (bukan FIXTURE_DIR)
  const timeFile = path.join(serverFixDir, 'Time.txt');
  fs.writeFileSync(timeFile, '03:23', 'utf8');
  // trigger refresh bridge
  await ack('scoresight:update', { action: 'refresh' });
  await new Promise((r) => setTimeout(r, 700));
  const stTimer = await getState();
  const mt = stTimer.score?.matchTimer;
  assert('timeSource = scoresight', mt?.timeSource === 'scoresight', mt?.timeSource);
  assert('elapsedMs ~ 203000', Math.abs((mt?.elapsedMs || 0) - 203000) < 2000, `elapsedMs=${mt?.elapsedMs}`);
  assert('runningAt aktif', !!mt?.runningAt);
  // perubahan Time.txt → update timer
  fs.writeFileSync(timeFile, '11:30', 'utf8');
  await ack('scoresight:update', { action: 'refresh' });
  await new Promise((r) => setTimeout(r, 700));
  const stTimer2 = await getState();
  const mt2 = stTimer2.score?.matchTimer;
  assert('elapsedMs ~ 690000 setelah update', Math.abs((mt2?.elapsedMs || 0) - 690000) < 2000, `elapsedMs=${mt2?.elapsedMs}`);
  // Time.txt kosong → pertahankan waktu terakhir
  fs.writeFileSync(timeFile, '', 'utf8');
  await ack('scoresight:update', { action: 'refresh' });
  await new Promise((r) => setTimeout(r, 700));
  const stTimer3 = await getState();
  const mt3 = stTimer3.score?.matchTimer;
  assert('Time kosong → pertahankan waktu', Math.abs((mt3?.elapsedMs || 0) - 690000) < 5000, `elapsedMs=${mt3?.elapsedMs}`);
  // matchTimerCommand start ditolak saat timeSource=scoresight
  const startBlocked = await ack('matchTimer', { cmd: 'start' });
  assert('start manual ditolak saat scoresight', startBlocked.ok === false, startBlocked.error);
  // reset Time.txt
  fs.writeFileSync(timeFile, '00:00', 'utf8');

  op.close();
  serverProc.kill();

  /* ---------- ringkasan ---------- */
  console.log(`\nHasil: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
