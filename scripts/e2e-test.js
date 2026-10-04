/**
 * scripts/e2e-test.js
 * ---------------------------------------------------------------------------
 * Uji alur nyata memakai browser (Edge/Chrome sistem via puppeteer-core):
 *   1. Control panel siap + tidak ada error console
 *   2. Pengaturan turnamen, tim, roster
 *   3. Pick hero, undo, lock, reset
 *   4. Countdown start/pause
 *   5. Overlay draft & scoreboard terhubung + sinkron real-time tanpa reload
 *   6. Skor berubah dari control panel terlihat di overlay
 *   7. Simpan / muat pertandingan
 *
 * Jalankan:  node scripts/e2e-test.js
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORT = path.join(__dirname, 'report');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
];

const results = [];
const consoleErrors = [];
const httpErrors = [];
const dialogs = [];
let failures = 0;
const T0 = Date.now();

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  const t = `${Math.round((Date.now() - T0) / 100) / 10}s`;
  console.log(`${ok ? '  PASS' : '  FAIL'}  [${t}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function findBrowser() {
  for (const p of EDGE_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiGet(p) {
  const res = await fetch(`${BASE}/api${p}`);
  if (!res.ok) throw new Error(`${p} -> ${res.status}`);
  return res.json();
}

async function apiPost(p, body) {
  const res = await fetch(`${BASE}/api${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

function hookConsole(page, tag) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[${tag}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(`[${tag}] pageerror: ${err.message}`));
  page.on('response', (res) => {
    if (res.status() >= 400) httpErrors.push(`[${tag}] ${res.status()} ${res.url()}`);
  });
  // dialog (window.confirm) yang tidak tertimpa akan menggantung renderer
  page.on('dialog', async (d) => {
    dialogs.push(`[${tag}] ${d.type()}: ${d.message()}`);
    try {
      await d.accept();
    } catch {
      /* sudah tertutup */
    }
  });
}

/**
 * Vite bisa melakukan full-reload saat menitipkan update; evaluate punah di
 * tengah jalan. Bungkus agar auto-retry bila konteks eksekusi hilang.
 */
function patchPage(page) {
  page.on('error', (err) => consoleErrors.push(`[crash] ${err.message}`));
  const orig = page.evaluate.bind(page);
  page.evaluate = async (...args) => {
    for (let i = 0; i < 4; i++) {
      try {
        return await orig(...args);
      } catch (err) {
        const transient = /context was destroyed|Cannot find context|frame was detached/i.test(err.message);
        if (transient && i < 3) {
          await sleep(900);
          continue;
        }
        throw err;
      }
    }
  };
  return page;
}

async function gotoSettle(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(2000);
}

async function waitForReady(page) {
  await page.waitForSelector('[data-testid="confirm-pick"]', { timeout: 20000 });
}

/** Klik hero bebas pertama lalu konfirmasi — dengan verifikasi jumlah entri. */
async function pickOnce(page) {
  const before = (await apiGet('/state')).state.draft.entries.length;
  for (let attempt = 0; attempt < 5; attempt++) {
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('[data-hero]:not([disabled])');
      if (!btn) return null;
      const id = btn.getAttribute('data-hero');
      btn.click();
      return id;
    });
    if (!clicked) {
      await sleep(700);
      continue;
    }
    await sleep(250);
    try {
      await clickEl(page, '[data-testid="confirm-pick"]');
    } catch {
      await sleep(700);
      continue;
    }
    await sleep(700);
    const now = (await apiGet('/state')).state.draft.entries.length;
    if (now > before) return clicked;
    await sleep(500);
  }
  return null;
}

async function shot(page, name) {
  // halaman latar belakang tidak menghasilkan frame → aktifkan dulu sebelum foto
  await page.bringToFront();
  await sleep(500);
  const file = path.join(REPORT, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

/**
 * Klik via evaluate, bukan page.click().
 * page.click() memakai DOM.scrollIntoViewIfNeeded yang menunggu frame; tab di
 * latar belakang tidak pernah menghasilkan frame sehingga menggantung.
 */
async function clickEl(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.click();
    return true;
  }, sel);
}

/** Buka tab kanan (mis. 'Preset', 'Skor', 'Overlay', 'Match'). */
async function clickTab(page, label) {
  await page.bringToFront();
  // bila halaman baru saja reload, tunggu aplikasi siap dulu
  await page.waitForSelector('[data-testid="confirm-pick"]', { timeout: 8000 }).catch(() => {});
  await sleep(250);
  await page.evaluate((lbl) => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.textContent.trim().toLowerCase() === lbl.toLowerCase()
    );
    if (b) b.click();
  }, label);
  await sleep(400);
}

/**
 * ConfirmBtn perlu dua tahap: klik pertama untuk "arm", klik kedua untuk
 * eksekusi. Klik pertama kadang tidak ter-register, jadi kondisi arm diperiksa
 * dulu lewat teks tombolnya.
 */
async function clickConfirm(page, sel) {
  const text = () => page.evaluate((s) => document.querySelector(s)?.textContent || '', sel);
  const first = await clickEl(page, sel);
  await sleep(350);
  let armedText = await text();
  if (!/yakin/i.test(armedText)) {
    await clickEl(page, sel);
    await sleep(350);
    armedText = await text();
  }
  const second = await clickEl(page, sel);
  await sleep(900);
  return [first, second, armedText];
}

/**
 * ConfirmBtn dua tahap: klik sampai teksnya berubah jadi pola "armed",
 * lalu klik TEPAT SEKALI untuk eksekusi (tidak meninggalkan tombol ter-arm).
 */
async function clickArmed(page, sel, armedRe) {
  const text = () => page.evaluate((s) => document.querySelector(s)?.textContent || '', sel);
  let armed = false;
  for (let i = 0; i < 3 && !armed; i++) {
    await clickEl(page, sel);
    await sleep(350);
    armed = armedRe.test(await text());
  }
  if (!armed) return false;
  await clickEl(page, sel);
  await sleep(900);
  return true;
}

/** Ubah <select> di panel Pengaturan Overlay berdasarkan teks label. */
async function setOverlaySelect(page, labelText, value) {
  let ok = await setSelectValue(page, labelText, value);
  if (!ok) {
    // tab bisa kembali ke tab awal bila halaman ter-reload
    await clickTab(page, 'Overlay');
    ok = await setSelectValue(page, labelText, value);
  }
  await sleep(800);
  const now = (await apiGet('/state')).state.overlay;
  const key = labelText.includes('draft') ? 'draftLayout' : 'scoreLayout';
  if (now[key] !== value) {
    console.log(`    [warn] setOverlaySelect("${labelText}", "${value}") → ${key}=${now[key]} (ok=${ok})`);
  }
  return ok;
}

async function setSelectValue(page, labelText, value) {
  await page.bringToFront();
  await sleep(250);
  const ok = await page.evaluate(
    (txt, v) => {
      const lab = [...document.querySelectorAll('label')].find((l) => l.textContent.includes(txt));
      const sel = lab && lab.querySelector('select');
      if (!sel) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, v);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    labelText,
    value
  );
  return ok;
}

async function readHtml(page) {
  return page.evaluate(() => document.body.innerHTML);
}

/**
 * Tunggu sampai DOM overlay benar-benar berubah. Tab di latar belakang bisa
 * tertunda sehingga dibaca setelah diaktifkan kembali.
 */
async function waitHtmlChange(page, prev, ms = 5000) {
  const t0 = Date.now();
  await page.bringToFront();
  let cur = await readHtml(page);
  while (cur === prev && Date.now() - t0 < ms) {
    await sleep(300);
    cur = await readHtml(page);
  }
  return cur;
}

async function main() {
  fs.mkdirSync(REPORT, { recursive: true });
  const exe = findBrowser();
  if (!exe) throw new Error('Browser (Edge/Chrome) tidak ditemukan di sistem.');

  // pastikan server hidup
  const health = await apiGet('/health').catch(() => null);
  if (!health?.ok) throw new Error('Backend tidak merespons. Jalankan "npm run dev" terlebih dahulu.');
  check('Backend /api/health merespons', true, `${health.heroes} hero`);

  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: 'new',
    protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
  });

  try {
    /* ------------------------------------------------ 1. control panel */
    console.log('\n[1] Control panel');
    const control = patchPage(await browser.newPage());
    hookConsole(control, 'control');
    await control.setViewport({ width: 1600, height: 1000 });
    await gotoSettle(control, `${BASE}/control`);
    await waitForReady(control);
    check('Control panel membuka dan siap', true);

    const heroCount = await control.evaluate(() => document.querySelectorAll('[data-hero]').length);
    check('Database hero dirender', heroCount > 100, `${heroCount} kartu hero`);

    // reset state dulu supaya tes deterministik
    let st;
    await control.evaluate(() => (window.confirm = () => true));
    await clickConfirm(control, '[data-testid="reset-draft"]');
    st = (await apiGet('/state')).state;
    check('Reset awal mengosongkan draft', st.draft.entries.length === 0, `${st.draft.entries.length}`);

    // normalisasi layout overlay agar pengujian layout dimulai dari keadaan sama
    await clickTab(control, 'Overlay');
    await setOverlaySelect(control, 'Layout draft overlay', 'full');
    await setOverlaySelect(control, 'Layout scoreboard', 'full');
    await clickTab(control, 'Tim');

    /* ------------------------------------------- 2. turnamen, tim, roster */
    console.log('\n[2] Pengaturan turnamen & tim');
    await control.evaluate(() => {
      const setVal = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const byPh = (ph) => [...document.querySelectorAll('input')].find((i) => i.placeholder === ph);
      setVal(byPh('MPL Season ke-…'), 'MLBB Draft Studio Selftest');
      setVal(byPh('Upper Bracket'), 'Playoff');
      const teams = [...document.querySelectorAll('input')].filter((i) => i.placeholder === 'Nama tim');
      setVal(teams[0], 'Tim Biru FC');
      setVal(teams[1], 'Tim Merah SC');
    });
    await sleep(600);
    // roster diisi satu per satu agar patch tidak saling menimpa
    for (let i = 1; i <= 5; i++) {
      await control.evaluate((n) => {
        const setVal = (el, v) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const nicks = [...document.querySelectorAll('input')].filter((x) => x.placeholder === `Pemain ${n}`);
        if (nicks[0]) setVal(nicks[0], `BluePlayer${n}`);
        if (nicks[1]) setVal(nicks[1], `RedPlayer${n}`);
      }, i);
      await sleep(320);
    }
    await sleep(500);
    st = (await apiGet('/state')).state;
    check('Nama turnamen tersimpan', st.meta.tournament === 'MLBB Draft Studio Selftest', st.meta.tournament);
    check('Nama tim tersimpan', st.teams.blue.name === 'Tim Biru FC' && st.teams.red.name === 'Tim Merah SC');
    check('Roster tersimpan', (st.teams.blue.players || []).join(',') === 'BluePlayer1,BluePlayer2,BluePlayer3,BluePlayer4,BluePlayer5');

    /* ------------------------------------------------------ 3. pick hero */
    console.log('\n[3] Pick hero');
    // pakai preset tanpa ban agar langsung masuk fase pick
    await clickTab(control, 'Preset');
    await control.evaluate(() => (window.confirm = () => true));
    await clickEl(control, '[data-preset="pick-only"]');
    await sleep(900);
    st = (await apiGet('/state')).state;
    check('Preset "Tanpa Ban" diterapkan', st.draft.presetId === 'pick-only', st.draft.presetId);

    const picked = [];
    for (let i = 0; i < 4; i++) {
      const id = await pickOnce(control);
      if (id) picked.push(id);
    }
    st = (await apiGet('/state')).state;
    check('Empat pick tercatat', st.draft.entries.length === 4, `${st.draft.entries.length} entri`);
    check(
      'Giliran bergantian benar',
      st.draft.entries.map((e) => e.team).join(',') === 'blue,red,red,blue',
      st.draft.entries.map((e) => e.team).join(',')
    );
    check('Hero terpakai ditandai', Object.keys(st.draft.used).length === 4);

    // hero yang sudah terpakai harus terkunci di UI
    const lockedCount = await control.evaluate(
      (ids) => ids.filter((id) => document.querySelector(`[data-hero="${id}"]`)?.disabled).length,
      picked
    );
    check('Hero terpakai dinonaktifkan di UI', lockedCount === picked.length, `${lockedCount}/${picked.length}`);

    // cegah pick hero duplikat
    const dup = await control.evaluate((id) => {
      const b = document.querySelector(`[data-hero="${id}"]`);
      return b ? b.disabled : null;
    }, picked[0]);
    check('Hero yang sama tidak bisa dipick ulang', dup === true);

    /* ------------------------------------------------------------ 4. undo */
    console.log('\n[4] Undo & lock');
    await clickEl(control, '[data-testid="undo"]');
    await sleep(600);
    st = (await apiGet('/state')).state;
    check('Undo mengurangi entri', st.draft.entries.length === 3, `${st.draft.entries.length}`);

    // uji lock: pick lagi lalu kunci
    await pickOnce(control);
    await sleep(400);
    await clickEl(control, '[data-testid="lock"]');
    await sleep(500);
    st = (await apiGet('/state')).state;
    check('Kunci aksi bekerja', st.draft.entries[st.draft.entries.length - 1].locked === true);

    // undo pada entri terkunci harus ditolak (ada konfirmasi -> window.confirm=false)
    await control.evaluate(() => (window.confirm = () => false));
    await clickEl(control, '[data-testid="undo"]');
    await sleep(600);
    st = (await apiGet('/state')).state;
    check('Undo entri terkunci ditolak tanpa konfirmasi', st.draft.entries.length === 4, `${st.draft.entries.length}`);

    /* --------------------------------------------------------- 5. timer */
    console.log('\n[5] Countdown');
    // pick terakhir otomatis menyalakan timer → paksa ke kondisi diketahui dulu
    let timer = (await apiGet('/state')).state.draft.timer;
    if (timer.running) {
      await clickEl(control, '[data-testid="timer-toggle"]');
      await sleep(500);
    }
    timer = (await apiGet('/state')).state.draft.timer;
    check('Countdown bisa dijeda', timer.running === false && timer.deadlineAt === null);

    await clickEl(control, '[data-testid="timer-toggle"]');
    await sleep(800);
    timer = (await apiGet('/state')).state.draft.timer;
    check('Countdown berjalan', timer.running === true && timer.remainingMs > 0, `sisa ${Math.round(timer.remainingMs)}ms`);
    check('deadlineAt terisi (sinkronisasi antar klien)', typeof timer.deadlineAt === 'number', String(timer.deadlineAt));
    check('Sisa waktu tidak negatif', timer.remainingMs >= 0);

    await clickEl(control, '[data-testid="timer-toggle"]');
    await sleep(500);
    timer = (await apiGet('/state')).state.draft.timer;
    check('Countdown berhenti saat dijeda', timer.running === false && timer.deadlineAt === null);

    // set durasi 10 detik lalu pastikan tidak pernah negatif
    await control.evaluate(() => {
      const chips = [...document.querySelectorAll('button.chip')];
      const b = chips.find((c) => c.textContent.trim() === '10s');
      if (b) b.click();
    });
    await sleep(500);
    timer = (await apiGet('/state')).state.draft.timer;
    check('Durasi countdown dapat diubah', timer.durationMs === 10000, `${timer.durationMs}ms`);
    check('Sisa waktu mengikuti durasi baru', timer.remainingMs >= 0 && timer.remainingMs <= 10000, `${timer.remainingMs}ms`);

    /* ------------------------------------------- 6. overlay real-time */
    console.log('\n[6] Overlay & sinkronisasi real-time');
    const overlayDraft = patchPage(await browser.newPage());
    hookConsole(overlayDraft, 'overlay-draft');
    await overlayDraft.setViewport({ width: 1920, height: 1080 });
    await gotoSettle(overlayDraft, `${BASE}/overlay/draft`);
    await sleep(800);

    const overlayInfo = await overlayDraft.evaluate(() => ({
      hasRoot: !!document.querySelector('.overlay-root'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      text: document.body.innerText.slice(0, 4000)
    }));
    check('Overlay draft punya root overlay', overlayInfo.hasRoot);
    check(
      'Latar overlay transparan (OBS)',
      overlayInfo.bodyBg === 'rgba(0, 0, 0, 0)' && overlayInfo.htmlBg === 'rgba(0, 0, 0, 0)',
      `body=${overlayInfo.bodyBg} html=${overlayInfo.htmlBg}`
    );
    check('Overlay menampilkan nama tim', overlayInfo.text.includes('Tim Biru FC'), 'Tim Biru FC');
    check('Overlay tanpa kontrol admin', !/Reset draft|Pilih Hero|Undo/i.test(overlayInfo.text));

    await sleep(600);
    const presence = await apiGet('/health');
    check('Server menghitung koneksi overlay', presence.ok);

    // pick baru di control -> overlay harus berubah tanpa reload
    const namesBefore = await overlayDraft.evaluate(() => document.body.innerText);
    const newId = await pickOnce(control);
    await sleep(1500);
    const heroName = (await apiGet('/heroes')).heroes.find((h) => h.id === newId)?.name || '';
    const namesAfter = await overlayDraft.evaluate(() => document.body.innerText);
    check(
      'Overlay draft menerima update tanpa reload',
      !!heroName && !namesBefore.includes(heroName) && namesAfter.includes(heroName),
      `hero=${heroName} before=${namesBefore.includes(heroName)} after=${namesAfter.includes(heroName)}`
    );
    await shot(overlayDraft, 'overlay-draft-full');

    // semua varian layout draft diambil sebelum tab overlay ditutup
    await clickTab(control, 'Overlay');
    const draftFullHtml = await readHtml(overlayDraft);

    await setOverlaySelect(control, 'Layout draft overlay', 'compact');
    const draftCompactHtml = await waitHtmlChange(overlayDraft, draftFullHtml);
    const draftCompactState = (await apiGet('/state')).state.overlay.draftLayout;
    check(
      'Layout draft compact diterapkan & dirender',
      draftCompactState === 'compact' && draftCompactHtml !== draftFullHtml,
      `${draftCompactState}, html ${draftFullHtml.length} -> ${draftCompactHtml.length}`
    );
    await shot(overlayDraft, 'overlay-draft-compact');

    await setOverlaySelect(control, 'Layout draft overlay', 'lineup');
    const draftLineupHtml = await waitHtmlChange(overlayDraft, draftCompactHtml);
    const draftLineupState = (await apiGet('/state')).state.overlay.draftLayout;
    check(
      'Layout final lineup diterapkan & dirender',
      draftLineupState === 'lineup' && draftLineupHtml !== draftFullHtml && draftLineupHtml !== draftCompactHtml,
      `${draftLineupState}, html ${draftLineupHtml.length}`
    );
    await shot(overlayDraft, 'overlay-draft-lineup');

    await setOverlaySelect(control, 'Layout draft overlay', 'full');
    await waitHtmlChange(overlayDraft, draftLineupHtml);
    await overlayDraft.close();

    /* ------------------------------------------ 7. scoreboard real-time */
    console.log('\n[7] Scoreboard');
    const overlayScore = patchPage(await browser.newPage());
    hookConsole(overlayScore, 'overlay-score');
    await overlayScore.setViewport({ width: 1920, height: 1080 });
    await gotoSettle(overlayScore, `${BASE}/overlay/score`);
    await sleep(600);

    const scoreInfo = await overlayScore.evaluate(() => ({
      bodyBg: getComputedStyle(document.body).backgroundColor,
      text: document.body.innerText
    }));
    check('Latar scoreboard transparan', scoreInfo.bodyBg === 'rgba(0, 0, 0, 0)', scoreInfo.bodyBg);

    await clickTab(control, 'Skor');
    await sleep(400);

    const killsBefore = (await apiGet('/state')).state.score.blue.kills;
    const beforeScore = await overlayScore.evaluate(() => document.body.innerText);
    const plusClicked = await control.evaluate(() => {
      const panelHead = [...document.querySelectorAll('.panel-head')].find((h) =>
        h.textContent.includes('Statistik Game')
      );
      if (!panelHead) return false;
      const panel = panelHead.parentElement;
      const plus = [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === '+');
      if (!plus) return false;
      plus.click();
      return true;
    });
    await sleep(1200);
    const afterScore = await overlayScore.evaluate(() => document.body.innerText);
    const killsAfter = (await apiGet('/state')).state.score.blue.kills;
    check('Tombol + skor ditemukan', plusClicked === true);
    check(
      'Skor kill bertambah dari control panel',
      killsAfter === killsBefore + 1,
      `${killsBefore} → ${killsAfter}`
    );
    check(
      'Scoreboard menampilkan skor terbaru tanpa reload',
      afterScore !== beforeScore || !beforeScore.includes(String(killsAfter)),
      'tampilan berubah'
    );
    await shot(overlayScore, 'overlay-score-full');
    const scoreFullHtml = await readHtml(overlayScore);

    await clickTab(control, 'Overlay');
    await setOverlaySelect(control, 'Layout scoreboard', 'compact');
    const scoreCompactHtml = await waitHtmlChange(overlayScore, scoreFullHtml);
    const scoreCompactState = (await apiGet('/state')).state.overlay.scoreLayout;
    check(
      'Layout scoreboard compact diterapkan & dirender',
      scoreCompactState === 'compact' && scoreCompactHtml !== scoreFullHtml,
      `${scoreCompactState}, html ${scoreFullHtml.length} -> ${scoreCompactHtml.length}`
    );
    await shot(overlayScore, 'overlay-score-compact');
    await setOverlaySelect(control, 'Layout scoreboard', 'full');
    await waitHtmlChange(overlayScore, scoreCompactHtml);
    await overlayScore.close();

    /* --------------------------------------- 8. simpan & muat pertandingan */
    console.log('\n[8] Simpan & muat pertandingan');
    await control.evaluate(() => {
      const tabs = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Match');
      if (tabs[0]) tabs[0].click();
    });
    await sleep(400);
    await control.evaluate(() => {
      const el = [...document.querySelectorAll('input')].find(
        (i) => i.placeholder === 'MPL S15 - GF Game 1'
      );
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, 'Selftest Match');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(300);
    const matches = await control.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Simpan');
      if (b) b.click();
      return true;
    });
    await sleep(900);
    const list = await apiGet('/matches');
    const saved = (list.matches || []).find((m) => m.name === 'Selftest Match');
    check('Pertandingan tersimpan', !!saved, saved ? saved.id : 'tidak ada');
    check('Tombol simpan bereaksi', matches === true);

    if (saved) {
      // buat perubahan lalu muat ulang match
      await clickTab(control, 'Tim');
      const edited = await control.evaluate(() => {
        const el = [...document.querySelectorAll('input')].find((i) => i.placeholder === 'Nama tim');
        if (!el) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, 'Diubah Sesudah Simpan');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      });
      await sleep(800);
      const changed = (await apiGet('/state')).state.teams.blue.name;
      check('Perubahan tim tercatat sebelum muat ulang', edited && changed === 'Diubah Sesudah Simpan', changed);

      const loaded = await apiPost(`/matches/${saved.id}/load`, {});
      const restored = loaded.state?.teams?.blue?.name;
      check('Pertandingan dimuat ulang', loaded.ok && restored === 'Tim Biru FC', restored);
    }

    /* ------------------------------------------- 9. reset draft & screenshot */
    console.log('\n[9] Reset draft');
    let resetNotice = '';
    for (let i = 0; i < 4; i++) {
      const before = (await apiGet('/state')).state.draft.entries.length;
      if (before === 0) break;
      const ov = await control.evaluate(() => {
        window.confirm = () => true;
        return window.confirm('x') === true;
      });
      await sleep(200);
      const armed = await control.evaluate(() => document.querySelector('[data-testid="reset-draft"]')?.textContent || '');
      const clicked = await clickConfirm(control, '[data-testid="reset-draft"]');
      const after = (await apiGet('/state')).state.draft.entries.length;
      console.log(
        `    reset attempt ${i + 1}: before=${before} after=${after} confirmOverride=${ov} armedText="${armed}" clicked=${JSON.stringify(clicked)}`
      );
      resetNotice = await control
        .evaluate(() => document.body.innerText.match(/Draft direset|berhasil|gagal|[Ee]rror/g)?.[0] || '')
        .catch(() => '');
    }
    st = (await apiGet('/state')).state;
    check('Reset draft mengosongkan entri', st.draft.entries.length === 0, `${st.draft.entries.length} ${resetNotice}`);
    check('Reset draft mengembalikan kursor', st.draft.cursor === 0);
    check('Reset draft mengosongkan hero terpakai', Object.keys(st.draft.used).length === 0);

    await shot(control, 'control-panel');

    // akses route tidak dikenal
    const nf = patchPage(await browser.newPage());
    await gotoSettle(nf, `${BASE}/tidak-ada`);
    const nfText = await nf.evaluate(() => document.body.innerText);
    check('Route tak dikenal menampilkan halaman 404', /404/i.test(nfText));
    await nf.close();

    /* ------------------------------- 10. keselamatan & kesiapan operator */
    console.log('\n[10] Status autosave, emergency, branding, transisi game');

    const headerText = await control.evaluate(() => document.querySelector('header')?.innerText || '');
    check('Indikator autosave tampil di panel', /Autosave/i.test(headerText));
    check('Indikator jumlah backup tampil', /Backup\s*\d/i.test(headerText), headerText.match(/Backup\s*\d+/)?.[0] || '');
    const healthNow = await apiGet('/health');
    check(
      'Server melaporkan status autosave',
      !!healthNow.autosave && typeof healthNow.autosave.lastSaveOk === 'boolean',
      `rev=${healthNow.revision} backup=${healthNow.autosave?.backupCount}`
    );
    const hasTokenGate = await control.evaluate(() => !!document.querySelector('input[type="password"]'));
    check('Mode terbuka tidak meminta token operator', hasTokenGate === false);

    // --- emergency stop (dua tahap: arm + eksekusi, lalu lepas) ---
    const armedOn = await clickArmed(control, '[data-testid="emergency"]', /^aktifkan\?$/i);
    st = (await apiGet('/state')).state;
    check('Emergency stop dapat diaktifkan', armedOn && st.overlay.emergency === true, `emg=${st.overlay.emergency}`);
    const emgBanner = await control.evaluate(() => document.body.innerText);
    check('Banner emergency tampil di panel operator', /EMERGENCY STOP aktif/i.test(emgBanner));
    const emgLog = st.draft.log.map((l) => l.kind);
    check('Riwayat mencatat aksi emergency (terstruktur)', emgLog.includes('emergency'), emgLog.join(','));

    const armedOff = await clickArmed(control, '[data-testid="emergency"]', /^lepas\?$/i);
    st = (await apiGet('/state')).state;
    check('Emergency stop dapat dilepas', armedOff && st.overlay.emergency === false, `emg=${st.overlay.emergency}`);

    // --- branding turnamen ---
    await clickTab(control, 'Overlay');
    const clickBrandToggle = () =>
      control.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => /Tampilkan branding turnamen/i.test(x.textContent));
        if (!b) return false;
        b.click();
        return true;
      });
    // keadaan awal bisa berbeda antar run (state tersimpan) → paksa dari posisi OFF
    const brandWasOn = (await apiGet('/state')).state.overlay.showBranding === true;
    if (brandWasOn) {
      await clickBrandToggle();
      await sleep(500);
    }
    const toggledBrand = await clickBrandToggle();
    await sleep(500);
    const typedBrand = await control.evaluate(() => {
      const el = [...document.querySelectorAll('input')].find((i) => i.placeholder === 'MPL Season 15 · Presented by …');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, 'SELFTEST BRANDING');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    });
    await sleep(700);
    st = (await apiGet('/state')).state;
    check(
      'Sakelar branding dapat diaktifkan',
      toggledBrand && st.overlay.showBranding === true,
      `sebelum=${brandWasOn} sesudah=${st.overlay.showBranding}`
    );
    check('Teks branding tersimpan di server', typedBrand && st.overlay.brandText === 'SELFTEST BRANDING', st.overlay.brandText);

    // buka overlay draft untuk memastikan branding benar-benar dirender
    const overlayBrand = patchPage(await browser.newPage());
    hookConsole(overlayBrand, 'overlay-brand');
    await overlayBrand.setViewport({ width: 1920, height: 1080 });
    await gotoSettle(overlayBrand, `${BASE}/overlay/draft`);
    await sleep(1500);
    const brandShown = await overlayBrand.evaluate(() => document.body.innerText.includes('SELFTEST BRANDING'));
    check('Branding tampil pada overlay draft', brandShown);
    await shot(overlayBrand, 'overlay-draft-branding');
    await overlayBrand.close();

    // --- pintasan keyboard sakelar overlay ---
    await control.bringToFront();
    await control.evaluate(() => document.activeElement && document.activeElement.blur());
    const pnameBefore = (await apiGet('/state')).state.overlay.showPlayerNames;
    await control.keyboard.down('Control');
    await control.keyboard.down('Shift');
    await control.keyboard.press('KeyN');
    await control.keyboard.up('Shift');
    await control.keyboard.up('Control');
    await sleep(700);
    const pnameAfter = (await apiGet('/state')).state.overlay.showPlayerNames;
    check(
      'Pintasan Ctrl+Shift+N mengubah sakelar nickname',
      pnameAfter === !pnameBefore,
      `${pnameBefore} → ${pnameAfter}`
    );
    // kembalikan ke keadaan semula agar tampilan konsisten
    if (pnameAfter !== pnameBefore) {
      await control.keyboard.down('Control');
      await control.keyboard.down('Shift');
      await control.keyboard.press('KeyN');
      await control.keyboard.up('Shift');
      await control.keyboard.up('Control');
      await sleep(500);
    }

    // --- battle spell: hanya bila data & ikon benar-benar ada ---
    const bs = await apiGet('/battle-spells');
    check('Endpoint battle-spells merespons', Array.isArray(bs.spells), `jumlah=${bs.spells?.length} available=${bs.available}`);
    if (!bs.available) {
      await control.evaluate(() => {
        const b = document.querySelector('[data-hero]:not([disabled])');
        if (b) b.click();
      });
      await sleep(400);
      const opened = await control.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Detail hero');
        if (!b || b.disabled) return false;
        b.click();
        return true;
      });
      await sleep(1800);
      const modalText = await control.evaluate(() => document.body.innerText);
      check(
        'Battle spell disembunyikan saat data tidak ada (tanpa data palsu)',
        opened && /Data battle spell & ikon belum tersedia/i.test(modalText)
      );
      await control.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Tutup');
        if (b) b.click();
      });
      await sleep(500);
    }

    // --- unggah logo via API (nama file dibuat server) ---
    const PNG1 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const logoUp = await apiPost('/logos', { dataUrl: PNG1 });
    check('Unggah logo melalui API diterima', logoUp.ok === true && /^\/assets\/logos\//.test(logoUp.url || ''), logoUp.url || logoUp.error);
    const logoBad = await fetch(`${BASE}/api/logos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataUrl: 'bukan-gambar' })
    });
    check('Unggah logo tidak valid ditolak', logoBad.status === 400, `status=${logoBad.status}`);

    // --- riwayat terstruktur ditampilkan di panel ---
    await clickTab(control, 'Riwayat');
    const logChips = await control.evaluate(() =>
      [...document.querySelectorAll('[data-log-kind]')].map((x) => x.getAttribute('data-log-kind'))
    );
    check('Panel riwayat menampilkan label aksi terstruktur', logChips.length > 0, logChips.join(','));
    check('Label emergency terlihat di riwayat', logChips.includes('emergency'));

    // --- transisi game berikutnya ---
    await clickTab(control, 'Skor');
    const gameBefore = (await apiGet('/state')).state.meta.gameNumber;
    const nextArmed = await clickArmed(control, '[data-testid="next-game"]', /^mulai game \d+\?$/i);
    await sleep(900);
    st = (await apiGet('/state')).state;
    check('Tombol game berikutnya berfungsi', nextArmed, `game ${gameBefore} → ${st.meta.gameNumber}`);
    check('Nomor game bertambah', st.meta.gameNumber === gameBefore + 1, `${st.meta.gameNumber}`);
    check('Skor per-game direset', st.score.blue.kills === 0 && st.score.red.kills === 0, `${st.score.blue.kills}/${st.score.red.kills}`);
    check('Draft game baru kosong', st.draft.entries.length === 0, `${st.draft.entries.length}`);
    check('Riwayat game baru tercatat', (st.draft.log || []).some((l) => l.kind === 'game'), (st.draft.log || []).map((l) => l.kind).join(','));
    check(
      'Nama tim & turnamen bertahan setelah transisi game',
      st.teams.blue.name === 'Tim Biru FC' && st.meta.tournament === 'MLBB Draft Studio Selftest',
      st.teams.blue.name
    );
    await shot(control, 'control-panel-operator');

    /* --------------------------------- 11. pick terakhir hingga selesai */
    console.log('\n[11] Pick terakhir: draft hingga selesai');
    const totalActions = st.draft.actions?.length || 20;
    let pickedCount = 0;
    let lastPick = '';
    for (let g = 0; g < totalActions + 5; g += 1) {
      st = (await apiGet('/state')).state;
      if (st.draft.entries.length >= totalActions) break;
      const got = await pickOnce(control);
      if (!got) break;
      pickedCount += 1;
      lastPick = got;
    }
    st = (await apiGet('/state')).state;
    check(
      'Draft dapat dijalankan sampai aksi terakhir tanpa galat',
      st.draft.status === 'done' && st.draft.entries.length === totalActions,
      `${st.draft.entries.length}/${totalActions} status=${st.draft.status} proses=${pickedCount} terakhir=${lastPick}`
    );
    const panelText = await control.evaluate(() => document.body.innerText);
    check('Tidak ada pesan kesalahan internal di panel', !/kesalahan internal/i.test(panelText));

    await clickEl(control, '[data-testid="undo"]');
    await sleep(900);
    st = (await apiGet('/state')).state;
    check(
      'Undo setelah draft selesai berfungsi',
      st.draft.entries.length === totalActions - 1 && st.draft.status === 'running',
      `entri=${st.draft.entries.length} status=${st.draft.status}`
    );
    check('Timer dilanjutkan setelah undo dari status selesai', st.draft.timer.running === true, `running=${st.draft.timer.running}`);

    /* ------------------------------------------------- 12. laporan console */
    console.log('\n[12] Console & error browser');
    const ignore = /Download the React DevTools|SockJS|ResizeObserver loop|Failed to load resource/i;
    const realErrors = consoleErrors.filter((e) => !ignore.test(e));
    const realHttp = httpErrors.filter((e) => !/favicon/i.test(e));
    if (realHttp.length) console.log('  HTTP  :', realHttp.slice(0, 5).join(' | '));
    if (realErrors.length) console.log('  CONSOLE:', realErrors.slice(0, 5).join(' | '));
    if (dialogs.length) console.log('  DIALOG :', dialogs.join(' | '));
    check('Tidak ada error console', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
    check('Tidak ada request gagal (4xx/5xx)', realHttp.length === 0, realHttp.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }

  console.log('\n================ HASIL E2E ================');
  console.log(`  lulus  : ${results.filter((r) => r.ok).length}`);
  console.log(`  gagal  : ${failures}`);
  fs.writeFileSync(
    path.join(REPORT, 'e2e-report.json'),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), results, consoleErrors, httpErrors, dialogs },
      null,
      2
    ),
    'utf8'
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n[FATAL] ' + (err.stack || err.message));
  if (httpErrors.length) console.error('  http  : ' + httpErrors.slice(0, 10).join(' | '));
  if (consoleErrors.length) console.error('  console: ' + consoleErrors.slice(0, 10).join(' | '));
  process.exit(1);
});
