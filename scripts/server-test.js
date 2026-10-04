/**
 * scripts/server-test.js
 * ---------------------------------------------------------------------------
 * Uji backend + kesiapan multi-PC TANPA browser (headless HTTP + Socket.IO).
 *
 * Jalankan:  npm run test:server
 *
 * Yang diuji (semua di direktori data sementara, tidak menyentuh data asli):
 *   1. Health endpoint & status autosave
 *   2. Skema battle-spell (hanya menampilkan data valid berikon)
 *   3. Unggah logo: validasi tipe/ukuran, nama file dibuat server, bisa disajikan
 *   4. Keamanan: token operator untuk REST & socket, CORS/Origin, peran overlay
 *      bersifat baca-saja
 *   5. Field overlay baru (branding, emergency) & penolakan nilai berbahaya
 *   6. Event match:nextGame & emergency
 *   7. Autosave → restart → state pulih; state.json rusak → pulih dari backup
 *   8. Retensi backup (BACKUP_KEEP) dan penulisan atomik (tidak ada file .tmp)
 *
 * Skrip ini sengaja meng-spawn proses server terpisah (port & DATA_DIR khusus)
 * sehingga aman dijalankan bersamaan dengan sesi dev.
 * ---------------------------------------------------------------------------
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io as connectSocket } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(os.tmpdir(), `mlbb-studio-server-test-${process.pid}`);
const TOKEN = 'rahasia-uji-123';

const PORTS = { main: 5192, restart: 5193, corrupt: 5194, retention: 5195 };

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

async function http(url, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, data };
}

/* --------------------------------------------------------- manajemen server */

const children = [];

async function startServer({ port, env = {}, label = 'server' }) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR,
      NODE_ENV: '',
      APP_AUTH_TOKEN: TOKEN,
      ...env
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
      throw new Error(`${label} keluar lebih awal (${JSON.stringify(child.exited)}):\n${output}`);
    }
    try {
      const h = await http(`http://127.0.0.1:${port}/api/health`);
      if (h.status === 200 && h.data?.ok) return { child, port, health: h.data };
      lastErr = `status ${h.status}`;
    } catch (e) {
      lastErr = e.message;
    }
    await sleep(150);
  }
  throw new Error(`${label} tidak siap dalam 20s (${lastErr}):\n${output}`);
}

function stopServer(entry) {
  if (!entry?.child || entry.child.exited) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    entry.child.once('exit', done);
    entry.child.kill('SIGTERM');
    setTimeout(() => {
      if (!entry.child.exited) entry.child.kill('SIGKILL');
      resolve();
    }, 3000).unref?.();
  });
}

function connect(port, { role = 'overlay', token } = {}) {
  return new Promise((resolve, reject) => {
    const s = connectSocket(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
      query: { role },
      auth: token ? { token } : {}
    });
    const timer = setTimeout(() => {
      s.close();
      reject(new Error('konek socket timeout'));
    }, 8000);
    s.once('connect', () => {
      clearTimeout(timer);
      resolve(s);
    });
    s.once('connect_error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function ack(socket, event, payload = {}) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: `timeout ack ${event}` }), 5000);
    socket.emit(event, payload, (res) => {
      clearTimeout(timer);
      resolve(res ?? { ok: false, error: 'ack kosong' });
    });
  });
}

const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function readStateFile() {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'state.json'), 'utf8'));
  } catch (e) {
    return { __error: e.message };
  }
}

function listBackups() {
  const dir = path.join(DATA_DIR, 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.startsWith('state-'));
}

function tmpLeftovers() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .concat(fs.existsSync(path.join(DATA_DIR, 'matches')) ? fs.readdirSync(path.join(DATA_DIR, 'matches')).map((f) => `matches/${f}`) : [])
    .filter((f) => f.endsWith('.tmp'));
}

/* ------------------------------------------------------------- skenario uji */

async function main() {
  console.log('\n=== SERVER / MULTI-PC TEST ===');
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });

  /* --- A: server utama (token aktif + CORS ketat) ------------------------ */
  let A = await startServer({
    port: PORTS.main,
    label: 'server utama',
    env: { CLIENT_ORIGIN: 'https://obs.example', BACKUP_INTERVAL_MS: '1000', BACKUP_KEEP: '3' }
  });
  ok('server utama hidup', `port ${PORTS.main}`);

  // 1. health
  const h = await http(`http://127.0.0.1:${PORTS.main}/api/health`);
  assert(h.status === 200 && h.data.ok, 'GET /api/health OK');
  assert(h.data.heroes > 0, 'health melaporkan jumlah hero', `hero=${h.data.heroes}`);
  assert(h.data.authRequired === true, 'health melaporkan authRequired=true');
  assert(h.data.autosave && typeof h.data.autosave.lastSaveOk === 'boolean', 'health melaporkan status autosave');
  assert(h.data.presence && typeof h.data.presence.overlay === 'number', 'health melaporkan presence');

  // 2. battle spells
  const bs = await http(`http://127.0.0.1:${PORTS.main}/api/battle-spells`);
  assert(bs.status === 200 && Array.isArray(bs.data.spells), 'GET /api/battle-spells OK');
  const spellsOk = bs.data.spells.every((s) => s.id && s.name && typeof s.icon === 'string' && s.icon.startsWith('/assets/'));
  assert(spellsOk, 'semua spell valid berawalan /assets/', `jumlah=${bs.data.spells.length}`);
  assert(
    typeof bs.data.available === 'boolean' && (bs.data.available === bs.data.spells.length > 0),
    'flag available konsisten'
  );

  // hero valid untuk dipakai di seluruh uji (id asli, bukan tebakan)
  const heroRes = await http(`http://127.0.0.1:${PORTS.main}/api/heroes`);
  const heroList = Array.isArray(heroRes.data) ? heroRes.data : heroRes.data?.heroes || heroRes.data?.list || [];
  const HERO = heroList[0]?.id;
  assert(!!HERO, 'database hero dapat dibaca untuk uji pick', `hero=${HERO}`);

  // 3. CORS / Origin
  const evil = await http(`http://127.0.0.1:${PORTS.main}/api/heroes`, { headers: { Origin: 'https://evil.example' } });
  assert(evil.status === 403, 'Origin tidak terdaftar ditolak 403', `status=${evil.status}`);
  const good = await http(`http://127.0.0.1:${PORTS.main}/api/heroes`, { headers: { Origin: 'https://obs.example' } });
  assert(good.status === 200 && good.headers.get('access-control-allow-origin') === 'https://obs.example', 'Origin terdaftar diizinkan');

  // 4. logo upload
  const LH = { 'x-operator-token': TOKEN };
  const logoBad = await http(`http://127.0.0.1:${PORTS.main}/api/logos`, { method: 'POST', body: { dataUrl: 'bukan-data-url' }, headers: LH });
  assert(logoBad.status === 400, 'logo bukan data URL ditolak', `status=${logoBad.status}`);
  const logoTxt = await http(`http://127.0.0.1:${PORTS.main}/api/logos`, {
    method: 'POST',
    body: { dataUrl: `data:text/plain;base64,${Buffer.from('halo').toString('base64')}` },
    headers: LH
  });
  assert(logoTxt.status === 400, 'logo bukan gambar ditolak', `status=${logoTxt.status}`);
  const logoTrav = await http(`http://127.0.0.1:${PORTS.main}/api/logos`, {
    method: 'POST',
    body: { dataUrl: `data:image/png;base64,${Buffer.from('../etc/passwd').toString('base64')}` },
    headers: LH
  });
  assert(logoTrav.status === 400, 'logo dengan isi non-gambar ditolak', `status=${logoTrav.status}`);
  const logo = await http(`http://127.0.0.1:${PORTS.main}/api/logos`, { method: 'POST', body: { dataUrl: PNG_1x1 }, headers: LH });
  assert(logo.status === 200 && logo.data.ok && typeof logo.data.url === 'string', 'unggah logo PNG valid diterima', logo.data?.url || '');
  assert(
    logo.data?.url?.startsWith('/assets/logos/') && !logo.data.url.includes('..'),
    'nama file logo dibuat server (tanpa traversal)'
  );
  const logoGet = await fetch(`http://127.0.0.1:${PORTS.main}${logo.data.url}`);
  assert(logoGet.status === 200 && (logoGet.headers.get('content-type') || '').startsWith('image/'), 'logo bisa disajikan via HTTP');
  const logoNoToken = await fetch(`http://127.0.0.1:${PORTS.main}/api/logos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dataUrl: PNG_1x1 })
  });
  assert(logoNoToken.status === 401, 'unggah logo tanpa token operator ditolak 401');

  // 5. REST match butuh token
  const mNoTok = await http(`http://127.0.0.1:${PORTS.main}/api/matches`, { method: 'POST', body: { name: 'tanpa token' } });
  assert(mNoTok.status === 401, 'simpan match tanpa token ditolak 401');
  const mTok = await http(`http://127.0.0.1:${PORTS.main}/api/matches`, {
    method: 'POST',
    body: { name: 'Grand Final' },
    headers: { 'x-operator-token': TOKEN }
  });
  assert(mTok.status === 200 && mTok.data?.id, 'simpan match dengan token diterima', mTok.data?.id || '');
  const mList = await http(`http://127.0.0.1:${PORTS.main}/api/matches`);
  const list = Array.isArray(mList.data) ? mList.data : mList.data?.matches;
  assert(mList.status === 200 && Array.isArray(list) && list.length >= 1, 'daftar match bisa dibaca', `jumlah=${Array.isArray(list) ? list.length : 'bukan array'}`);
  const mLoad = await http(`http://127.0.0.1:${PORTS.main}/api/matches/${list[0].id}/load`, {
    method: 'POST',
    headers: { 'x-operator-token': TOKEN }
  });
  assert(mLoad.status === 200 && mLoad.data?.ok, 'load match diterima');

  /* --- socket: peran & token -------------------------------------------- */
  const overlay = await connect(PORTS.main, { role: 'overlay' });
  const ro = await ack(overlay, 'state:request');
  assert(ro.ok && ro.state?.version === 1, 'overlay dapat membaca state (baca-saja)');
  const oPick = await ack(overlay, 'draft:pick', { heroId: 'franco' });
  assert(oPick.ok === false && /baca-saja/i.test(oPick.error || ''), 'overlay ditolak mengubah draft');
  const oScore = await ack(overlay, 'score:update', { patch: { blue: { kills: 10 } } });
  assert(oScore.ok === false, 'overlay ditolak mengubah skor');
  const oOverlay = await ack(overlay, 'overlay:update', { patch: { showBranding: true } });
  assert(oOverlay.ok === false, 'overlay ditolak mengubah pengaturan overlay');
  const oTimer = await ack(overlay, 'timer', { cmd: 'toggle' });
  assert(oTimer.ok === false, 'overlay ditolak mengubah timer');

  const controlNoToken = await connect(PORTS.main, { role: 'control' });
  const cDeny = await ack(controlNoToken, 'draft:pick', { heroId: 'franco' });
  assert(cDeny.ok === false && cDeny.needAuth === true, 'control tanpa token ditolak (butuh auth)');

  const control = await connect(PORTS.main, { role: 'control', token: TOKEN });
  const cP = await ack(control, 'draft:pick', { heroId: HERO });
  assert(cP.ok === true && cP.state?.draft?.entries?.length === 1, 'control dengan token bisa pick', `${cP.state?.draft?.entries?.length || 0} entri${cP.error ? ` (${cP.error})` : ''}`);
  const cBad = await ack(control, 'draft:pick', { heroId: 'hero-ngawur' });
  assert(cBad.ok === false, 'hero tidak dikenal ditolak server');
  const cDup = await ack(control, 'draft:pick', { heroId: HERO });
  assert(cDup.ok === false, 'hero ganda ditolak saat allowDuplicates mati');

  /* --- draft dijalankan sampai aksi terakhir (regresi pick terakhir) ----- */
  const totalActions = cDup.state?.draft?.actions?.length || 20;
  const usedNow = new Set(Object.keys(cDup.state?.draft?.used || {}));
  const pool = heroList.map((h) => h.id).filter((id) => id && !usedNow.has(id));
  let pickRes = cDup;
  let step = 0;
  while ((pickRes.state?.draft?.entries?.length || 0) < totalActions && step < pool.length) {
    pickRes = await ack(control, 'draft:pick', { heroId: pool[step] });
    step += 1;
    if (!pickRes.ok) break;
  }
  const doneState = pickRes.state;
  assert(
    pickRes.ok === true && doneState?.draft?.status === 'done',
    'pick terakhir menyelesaikan draft tanpa galat',
    `entri=${doneState?.draft?.entries?.length}/${totalActions} status=${doneState?.draft?.status} err=${pickRes.error || '-'}`
  );
  assert(doneState?.draft?.timer?.running === false, 'timer berhenti saat draft selesai');
  const undoDone = await ack(control, 'draft:undo');
  assert(
    undoDone.ok === true && undoDone.state?.draft?.status === 'running',
    'undo setelah selesai mengembalikan status berjalan',
    `status=${undoDone.state?.draft?.status} err=${undoDone.error || '-'}`
  );
  assert(undoDone.state?.draft?.timer?.running === true, 'timer dilanjutkan setelah undo dari status selesai', `running=${undoDone.state?.draft?.timer?.running}`);

  /* --- 6. field overlay baru -------------------------------------------- */
  const brand = await ack(control, 'overlay:update', { patch: { showBranding: true, brandText: 'Turnamen Natal 2026' } });
  assert(brand.ok && brand.state.overlay.showBranding === true && brand.state.overlay.brandText === 'Turnamen Natal 2026', 'branding dapat diaktifkan');
  const longText = 'X'.repeat(200);
  const brand2 = await ack(control, 'overlay:update', { patch: { brandText: longText } });
  assert(brand2.state?.overlay?.brandText?.length === 60, 'brandText dipotong maks 60 karakter', `panjang=${brand2.state?.overlay?.brandText?.length}`);
  const brandLogoBad = await ack(control, 'overlay:update', { patch: { brandLogo: 'javascript:alert(1)' } });
  assert(brandLogoBad.state?.overlay?.brandLogo == null, 'brandLogo berbahaya ditolak');
  const brandLogoUrl = await ack(control, 'overlay:update', { patch: { brandLogo: 'https://cdn.example/logo.png' } });
  assert(brandLogoUrl.state?.overlay?.brandLogo === 'https://cdn.example/logo.png', 'brandLogo http/https diterima');
  const logoPatch = await ack(control, 'team:update', { side: 'blue', patch: { logo: logo.data.url } });
  assert(logoPatch.ok === true && logoPatch.state.teams.blue.logo === logo.data.url, 'logo URL lokal diterima untuk tim');
  const logoPatchBad = await ack(control, 'team:update', { side: 'red', patch: { logo: '//evil.example/x.png' } });
  assert(logoPatchBad.ok === false, 'logo protocol-relative ditolak');

  /* --- 7. skor → nextGame ------------------------------------------------ */
  const sc = await ack(control, 'score:update', { patch: { blue: { kills: 7, gold: 12000 } } });
  assert(sc.ok && sc.state.score.blue.kills === 7, 'skor dapat diubah operator');
  const ng = await ack(control, 'match:nextGame');
  assert(ng.ok && ng.state.meta.gameNumber === 2, 'match:nextGame menaikkan nomor game', `game=${ng.state.meta.gameNumber}`);
  assert(ng.state.score.blue.kills === 0 && ng.state.score.blue.gold === 0, 'skor per-game direset');
  assert(Array.isArray(ng.state.draft.entries) && ng.state.draft.entries.length === 0, 'draft game baru kosong');
  assert(
    ng.state.draft.log.some((l) => l.kind === 'game'),
    'riwayat mencatat transisi game (terstruktur)'
  );

  /* --- 8. emergency ------------------------------------------------------ */
  await ack(control, 'timer', { cmd: 'start' });
  const em = await ack(control, 'emergency', { on: true });
  assert(em.ok && em.state.overlay.emergency === true, 'emergency ON diaktifkan');
  assert(em.state.draft.timer.running === false, 'emergency menghentikan timer');
  assert(
    em.state.draft.log.some((l) => l.kind === 'emergency'),
    'riwayat mencatat emergency'
  );
  const em2 = await ack(control, 'overlay:update', { patch: { emergency: false } });
  assert(em2.state?.overlay?.emergency === false, 'emergency dapat dilepas via overlay:update');
  const em3 = await ack(control, 'emergency', { on: true });
  assert(em3.state.overlay.emergency === true, 'emergency ON kembali');
  const emEnd = await ack(control, 'emergency', { on: false });
  assert(emEnd.state.overlay.emergency === false, 'emergency dapat dilepas');

  /* --- 9. autosave ------------------------------------------------------- */
  const lastRev = emEnd.state.revision;
  await sleep(600);
  const saved = readStateFile();
  assert(!saved.__error, 'state.json valid setelah autosave', saved.__error || '');
  assert(saved.revision === lastRev, 'revisi tersimpan sama dengan di memori', `file=${saved.revision} memori=${lastRev}`);
  assert(tmpLeftovers().length === 0, 'tidak ada file .tmp tersisa (penulisan atomik)', tmpLeftovers().join(','));

  overlay.close();
  controlNoToken.close();
  control.close();

  await stopServer(A);
  ok('server utama dihentikan');

  /* --- 10. restart: state pulih ----------------------------------------- */
  const before = readStateFile();
  let B = await startServer({ port: PORTS.restart, label: 'server restart', env: { CLIENT_ORIGIN: '' } });
  const s2 = await connect(PORTS.restart, { role: 'control', token: TOKEN });
  const st2 = await ack(s2, 'state:request');
  assert(st2.ok && st2.state.revision === before.revision, 'state pulih persis setelah restart', `rev=${st2.state.revision}`);
  assert(st2.state.meta.gameNumber === before.meta.gameNumber, 'data pertandingan tidak hilang saat restart');
  // satu perubahan agar backup berisi keadaan terakhir sebelum state.json dirusak
  const b2 = await ack(s2, 'meta:update', { patch: { round: 'simpan-untuk-uji' } });
  assert(b2.ok === true, 'perubahan pasca-restart diterima');
  await sleep(500);
  s2.close();
  await stopServer(B);
  ok('server restart dihentikan');

  /* --- 11. state.json rusak → pulih dari backup -------------------------- */
  assert(listBackups().length >= 1, 'backup tersedia', `backup=${listBackups().length}`);
  fs.writeFileSync(path.join(DATA_DIR, 'state.json'), '{ ini bukan json yang valid');
  let C = await startServer({ port: PORTS.corrupt, label: 'server pulih', env: { CLIENT_ORIGIN: '', BACKUP_INTERVAL_MS: '1000', BACKUP_KEEP: '3' } });
  const hC = await http(`http://127.0.0.1:${PORTS.corrupt}/api/health`);
  assert(hC.status === 200 && hC.data.ok, 'server tetap hidup walau state.json rusak');
  assert(hC.data.autosave.lastLoadedFrom === 'backup', 'state dipulihkan dari backup', hC.data.autosave.lastLoadedFrom);
  const sC = await connect(PORTS.corrupt, { role: 'control' });
  const stC = await ack(sC, 'state:request');
  assert(stC.ok && stC.state.version === 1, 'state hasil pemulihan valid');
  assert(stC.state.revision === before.revision, 'revisi hasil pemulihan identik dengan sebelum dirusak', `pulih=${stC.state.revision} asli=${before.revision}`);
  assert(
    Array.isArray(stC.state.draft.log) && stC.state.draft.log.some((l) => l.kind === 'emergency'),
    'riwayat lama masih ada di backup'
  );
  sC.close();

  /* --- 12. retensi backup ------------------------------------------------ */
  // server pulih: BACKUP_KEEP=3 & interval 1s agar backup dibuat tiap perubahan
  const bk = await connect(PORTS.corrupt, { role: 'control', token: TOKEN });
  for (let i = 0; i < 5; i += 1) {
    await ack(bk, 'meta:update', { patch: { round: `R${i}` } });
    await sleep(1150);
  }
  const bks = listBackups();
  assert(bks.length <= 3, 'retensi backup sesuai BACKUP_KEEP=3', `jumlah=${bks.length}`);
  assert(bks.length >= 1, 'backup tetap dibuat saat ada perubahan', `jumlah=${bks.length}`);
  assert(tmpLeftovers().length === 0, 'tidak ada .tmp setelah banyak perubahan');
  bk.close();
  await stopServer(C);

  /* --- ringkasan --------------------------------------------------------- */
  console.log('');
  if (failures.length) {
    console.log(`GAGAL: ${failures.length} asersi`);
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log(`Hasil server-test: ${pass} PASS / ${failures.length} FAIL\n`);
  return failures.length === 0;
}

main()
  .then((success) => {
    cleanup();
    process.exit(success ? 0 : 1);
  })
  .catch((e) => {
    console.error('\nERROR server-test:', e.message);
    if (logs.length) {
      console.log('\n--- log server ---');
      console.log(logs.slice(-40).join(''));
    }
    cleanup();
    process.exit(1);
  });

function cleanup() {
  children.forEach((c) => {
    if (!c.exited) {
      try {
        c.kill('SIGKILL');
      } catch {
        /* abaikan */
      }
    }
  });
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* abaikan */
  }
}
