/**
 * server/draftEngine.js
 * ---------------------------------------------------------------------------
 * Mesin state draft yang terpisah dari UI. Semua fungsi bersifat murni:
 * menerima state, mengembalikan state baru + pesan error bila gagal.
 * ---------------------------------------------------------------------------
 */
import { getPreset, validatePreset, MAX_PICKS_PER_TEAM } from './presets.js';
import { defaultTheme, LIMITS } from '../shared/theme.js';

export const DEFAULT_TIMER_MS = 30 * 1000;

export function nowIso() {
  return new Date().toISOString();
}

export function createDraftState(presetId = 'standard-5ban-5pick') {
  const preset = getPreset(presetId);
  const actions = preset.actions.map((a, i) => ({ i, team: a.team, type: a.type }));
  return {
    presetId: preset.id,
    presetName: preset.name,
    actions,
    /** indeks aksi yang sedang berjalan; === actions.length artinya selesai */
    cursor: 0,
    /** entri aksi yang sudah dieksekusi */
    entries: [],
    /** heroId -> 'ban' | 'pick' */
    used: {},
    /** apakah hero yang sama boleh muncul lebih dari sekali (mode latihan) */
    allowDuplicates: false,
    status: 'idle', // idle | running | paused | done
    /**
     * Sisa waktu aksi (warisan countdown). UI countdown sudah dihapus —
     * giliran sepenuhnya digerakkan operator. Field dipertahankan agar
     * struktur state/API lama tetap sah (running flag dipakai beberapa uji).
     */
    timer: {
      durationMs: DEFAULT_TIMER_MS,
      remainingMs: DEFAULT_TIMER_MS,
      deadlineAt: null,
      running: false
    },
    log: [],
    updatedAt: nowIso()
  };
}

/**
 * Konfigurasi integrasi data eksternal (GRID) pada state.
 *
 * YANG DISIMPAN DI SINI hanya konfigurasi & identitas (persisten, ikut
 * autosave/backup). Status koneksi transien (CONNECTING/CONNECTED/DEGRADED/
 * ERROR, lastEventAt, lastSyncAt) disiarkan lewat event `integration:status`
 * agar setiap perubahan status tidak membump revision dan memicu tulisan
 * state.json (lihat Phase 13 §32 — performa).
 *
 * Secret TIDAK PERNAH masuk state.
 */
export const DATA_SOURCES = ['manual', 'grid', 'fixture', 'scoresight-files'];
export const AUTOMATION_MODES = ['monitor', 'semi', 'auto'];

export function createIntegrationState(env = process.env) {
  const bool = (v) => String(v || '').toLowerCase() === 'true';
  return {
    provider: 'grid',
    enabled: bool(env.GRID_ENABLED),
    /** sumber data aktif: manual (default) | grid | fixture | scoresight-files */
    dataSource: DATA_SOURCES.includes(String(env.GRID_DATA_SOURCE || '').toLowerCase())
      ? String(env.GRID_DATA_SOURCE).toLowerCase()
      : 'manual',
    /** mode otomasi: monitor (default) | semi | auto */
    mode: AUTOMATION_MODES.includes(String(env.AUTOMATION_MODE || '').toLowerCase())
      ? String(env.AUTOMATION_MODE).toLowerCase()
      : 'monitor',
    /** gerbang kedua mode auto — off kecuali diaktifkan eksplisit */
    autoEnabled: bool(env.AUTOMATION_ENABLED),
    fixture: String(env.GRID_FIXTURE || 'draft').slice(0, 40) || 'draft',
    competitionId: null,
    seriesId: null,
    gameId: null,
    /** asal data terakhir yang diterapkan (jejak untuk operator) */
    draftSource: 'manual',
    scoreSource: 'manual',
    /**
     * Kebijakan tulis skor: 'manual-only' (default — hanya operator via
     * score:update) | 'external' (OCR/GRID/ScoreSight file boleh menulis skor).
     * Sengaja TIDAK dibaca dari env: pergantian ke mode external harus
     * keputusan eksplisit operator.
     */
    scoreInput: 'manual-only',
    /**
     * Konfigurasi ScoreSight file bridge (persisten — diubah operator).
     * `enabled` berbeda dari env SCORESIGHT_ENABLED: env hanya default awal;
     * toggle operator di Control Panel menimpa via integration:update.
     */
    scoresight: {
      enabled: bool(env.SCORESIGHT_ENABLED),
      /** Home → Blue atau Red. null = MAPPING_REQUIRED (jangan apply). */
      homeSide: String(env.SCORESIGHT_HOME_SIDE || '').toLowerCase() === 'red' ? 'red' : 'blue'
    }
  };
}

export function sanitizeIntegration(doc) {
  const base = createIntegrationState();
  if (!doc || typeof doc !== 'object') return base;
  const out = { ...base };
  if (typeof doc.enabled === 'boolean') out.enabled = doc.enabled;
  if (DATA_SOURCES.includes(doc.dataSource)) out.dataSource = doc.dataSource;
  if (AUTOMATION_MODES.includes(doc.mode)) out.mode = doc.mode;
  if (typeof doc.autoEnabled === 'boolean') out.autoEnabled = doc.autoEnabled;
  if (typeof doc.fixture === 'string' && doc.fixture) out.fixture = doc.fixture.slice(0, 40);
  for (const k of ['competitionId', 'seriesId', 'gameId']) {
    if (typeof doc[k] === 'string' && doc[k]) out[k] = doc[k].slice(0, 64);
  }
  if (doc.draftSource === 'manual' || doc.draftSource === 'grid' || doc.draftSource === 'fixture') {
    out.draftSource = doc.draftSource;
  }
  if (doc.scoreSource === 'manual' || doc.scoreSource === 'grid' || doc.scoreSource === 'fixture' || doc.scoreSource === 'ocr') {
    out.scoreSource = doc.scoreSource;
  }
  if (doc.scoreInput === 'manual-only' || doc.scoreInput === 'external') {
    out.scoreInput = doc.scoreInput;
  }
  // ScoreSight config — sanitize ketat
  const ss = doc.scoresight;
  if (ss && typeof ss === 'object') {
    if (typeof ss.enabled === 'boolean') out.scoresight.enabled = ss.enabled;
    if (ss.homeSide === 'blue' || ss.homeSide === 'red') out.scoresight.homeSide = ss.homeSide;
  }
  return out;
}

/** Pola ID sponsor yang dihasilkan server: sp-<16 hex>. */
const SPONSOR_ID_RE = /^sp-[a-f0-9]{16}$/;
const SPONSOR_FILE_RE = /^sp-[a-f0-9]{16}\.(?:jpg|png|webp)$/;

/**
 * Normalisasi daftar sponsor hasil upload (metadata persisten — file gambarnya
 * ada di disk, bukan base64). Entri rusak/duplikat/berlebih dibuang; URL selalu
 * merujuk ke /assets/sponsors/ sehingga path traversal tidak mungkin lolos.
 */
export function sanitizeSponsors(doc) {
  if (!Array.isArray(doc)) return [];
  const out = [];
  const seen = new Set();
  for (const s of doc) {
    if (!s || typeof s !== 'object') continue;
    const id = String(s.id || '');
    const file = String(s.file || '');
    if (!SPONSOR_ID_RE.test(id) || !SPONSOR_FILE_RE.test(file) || !file.startsWith(id)) continue;
    if (seen.has(id)) continue;
    const url = String(s.url || '');
    if (url !== `/assets/sponsors/${file}`) continue;
    out.push({
      id,
      name: typeof s.name === 'string' && s.name ? s.name.slice(0, 80) : file,
      file,
      url,
      at: typeof s.at === 'string' ? s.at.slice(0, 40) : ''
    });
    seen.add(id);
    if (out.length >= LIMITS.maxSponsors) break;
  }
  return out;
}

export function createInitialState() {
  return {
    version: 1,
    matchId: 'aktif',
    matchName: 'Pertandingan Baru',
    meta: {
      tournament: '',
      stage: '',
      gameNumber: 1,
      bestOf: 3,
      round: ''
    },
    teams: {
      blue: { name: 'Blue Side', logo: null, players: [], score: 0, catalogId: null },
      red: { name: 'Red Side', logo: null, players: [], score: 0, catalogId: null }
    },
    draft: createDraftState(),
    score: {
      blue: { kills: 0, gold: 0, turrets: 0, lord: 0, turtle: 0 },
      red: { kills: 0, gold: 0, turrets: 0, lord: 0, turtle: 0 },
      durationMs: 0,
      mvpPlayer: '',
      mvpHeroId: null,
      winner: null, // 'blue' | 'red' | null
      status: 'belum', // belum | berlangsung | selesai
      notes: '',
      /**
       * Timer pertandingan internal (bukan countdown draft, bukan timer HUD
       * MLBB, bukan Time.txt ScoreSight). Operator kontrol start/pause/reset.
       * `elapsedMs` akumulasi; `runningAt` timestamp saat running (epoch ms).
       * Sisa = elapsedMs + (now - runningAt) bila running.
       * `timeSource`: 'manual' | 'scoresight' — sumber waktu aktif.
       */
      matchTimer: { elapsedMs: 0, runningAt: null, timeSource: 'manual' }
    },
    overlay: {
      showPlayerNames: true,
      showTimer: true,
      showTier: true,
      showLogos: true,
      draftLayout: 'full', // full | compact | lineup
      scoreLayout: 'full', // full | compact
      /**
       * Template overlay pilihan operator di control panel:
       * draft | score | sponsor-edition. Hanya penanda pilihan — tiap template
       * tetap memakai URL sendiri (OBS memakai Browser Source terpisah).
       */
      template: 'draft',
      animMs: 600,
      announce: null, // { type:'mvp'|'winner'|'game', text, at }
      /* slot branding turnamen/sponsor (bisa dimatikan) */
      showBranding: false,
      brandText: '',
      brandLogo: null,
      /** emergency stop: membekukan animasi overlay tanpa menghapus data */
      emergency: false,
      /**
       * Konfigurasi desain scoreboard (warna, preset, frame, logo, sponsor,
       * visibilitas). Terpisah dari data pertandingan — mengubah tema tidak
       * pernah menyentuh skor/draft, dan sebaliknya.
       */
      theme: defaultTheme()
    },
    revision: 0,
    /** konfigurasi integrasi data eksternal (GRID) — tanpa secret */
    integration: createIntegrationState(),
    /**
     * Sponsor unggahan operator — metadata persisten (id, nama file asli,
     * file tersimpan, url relatif /assets/sponsors/…, urutan = indeks array).
     * Gambar disimpan sebagai file di DATA_DIR/sponsors, bukan base64.
     */
    sponsors: [],
    updatedAt: nowIso()
  };
}

/* ------------------------------------------------------------ turunan state */

export function currentAction(draft) {
  if (!draft || draft.cursor >= draft.actions.length) return null;
  return draft.actions[draft.cursor] || null;
}

export function phase(draft) {
  const a = currentAction(draft);
  if (!a) return 'selesai';
  return a.type === 'ban' ? 'ban' : 'pick';
}

export function slotsFor(draft, team, type) {
  return draft.entries.filter((e) => e.team === team && e.type === type);
}

export function usedHeroIds(draft) {
  return new Set(Object.keys(draft.used));
}

export function heroUnavailableReason(draft, heroId) {
  if (draft.allowDuplicates) return null;
  const t = draft.used[heroId];
  if (!t) return null;
  return t === 'ban' ? 'Hero sudah di-ban.' : 'Hero sudah dipick tim lain/sendiri.';
}

export function validatePick(draft, heroId, { team, type } = {}) {
  if (!heroId) return { ok: false, reason: 'Hero belum dipilih.' };
  const act = currentAction(draft);
  if (!act) return { ok: false, reason: 'Draft sudah selesai. Reset untuk memulai lagi.' };
  const target = { team: act.team, type: act.type, ...(team && type ? { team, type } : {}) };
  if (team && type && (team !== act.team || type !== act.type)) {
    return { ok: false, reason: 'Bukan giliran aksi tersebut.' };
  }
  const taken = heroUnavailableReason(draft, heroId);
  if (taken) return { ok: false, reason: taken };
  if (target.type === 'pick') {
    const picked = slotsFor(draft, target.team, 'pick');
    if (picked.length >= MAX_PICKS_PER_TEAM) {
      return { ok: false, reason: `Tim ${target.team} sudah penuh (${MAX_PICKS_PER_TEAM} pick).` };
    }
  }
  if (target.type === 'ban') {
    const banned = slotsFor(draft, target.team, 'ban');
    if (banned.length >= draft.actions.filter((a) => a.team === target.team && a.type === 'ban').length) {
      return { ok: false, reason: 'Slot ban tim ini sudah penuh.' };
    }
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ mutasi */

function bump(state) {
  state.revision = (state.revision || 0) + 1;
  state.updatedAt = nowIso();
  return state;
}

/**
 * Catatan riwayat terstruktur: timestamp, jenis aksi, tim, tipe, hero, indeks,
 * dan hasil. `text` tetap disertakan agar panel riwayat lama tetap berfungsi.
 */
function pushLog(draft, rec) {
  draft.log.push({ at: nowIso(), ok: true, ...rec });
  if (draft.log.length > 200) draft.log.splice(0, draft.log.length - 200);
}

export function pickHero(state, heroId, meta = {}) {
  const draft = state.draft;
  const check = validatePick(draft, heroId);
  if (!check.ok) return { state, error: check.reason };
  const act = currentAction(draft);
  const entry = {
    i: act.i,
    team: act.team,
    type: act.type,
    heroId,
    phaseIndex: draft.entries.length,
    locked: false,
    at: nowIso(),
    by: meta.by || 'operator'
  };
  draft.entries.push(entry);
  draft.used[heroId] = act.type;
  draft.cursor += 1;
  if (draft.cursor >= draft.actions.length) {
    draft.status = 'done';
    pauseTimer(draft);
  } else if (draft.status === 'idle') {
    draft.status = 'running';
    startTimer(draft);
  }
  pushLog(draft, {
    kind: act.type === 'ban' ? 'ban' : 'pick',
    team: act.team,
    type: act.type,
    heroId,
    entryIndex: draft.entries.length - 1,
    text: `${act.team === 'blue' ? 'Blue' : 'Red'} ${act.type === 'ban' ? 'BAN' : 'PICK'} #${draft.entries.length}`
  });
  draft.updatedAt = nowIso();
  return { state: bump(state) };
}

export function undoLast(state, { force = false } = {}) {
  const draft = state.draft;
  if (draft.entries.length === 0) return { state, error: 'Tidak ada aksi untuk di-undo.' };
  const last = draft.entries[draft.entries.length - 1];
  if (last.locked && !force) {
    return { state, error: 'Aksi terakhir terkunci. Buka kunci atau gunakan undo paksa.' };
  }
  draft.entries.pop();
  delete draft.used[last.heroId];
  draft.cursor = Math.max(0, draft.cursor - 1);
  if (draft.status === 'done') {
    draft.status = 'running';
    // pick terakhir menahan timer (pauseTimer) → lanjutkan lagi dari sisa waktu
    if (!draft.timer.running) startTimer(draft);
  }
  pushLog(draft, {
    kind: 'undo',
    team: last.team,
    type: last.type,
    heroId: last.heroId,
    entryIndex: draft.entries.length,
    force,
    text: force ? 'UNDO paksa aksi terkunci' : 'UNDO aksi terakhir'
  });
  draft.updatedAt = nowIso();
  return { state: bump(state) };
}

export function resetDraft(state, presetId) {
  const keep = state.draft.allowDuplicates;
  state.draft = createDraftState(presetId || state.draft.presetId);
  state.draft.allowDuplicates = keep;
  pushLog(state.draft, { kind: 'reset', text: 'Draft direset' });
  return { state: bump(state) };
}

export function setPreset(state, presetId, customActions) {
  if (state.draft.entries.length > 0) {
    return { state, error: 'Preset hanya bisa diubah saat draft masih kosong.' };
  }
  if (customActions) {
    const v = validatePreset(customActions);
    if (!v.valid) return { state, error: v.errors.join(' ') };
    const keep = state.draft.allowDuplicates;
    const timer = state.draft.timer;
    state.draft = createDraftState('custom');
    state.draft.allowDuplicates = keep;
    state.draft.timer = timer;
    state.draft.presetId = 'custom';
    state.draft.presetName = 'Preset Kustom';
    state.draft.actions = customActions.map((a, i) => ({ i, team: a.team, type: a.type }));
  } else {
    const p = getPreset(presetId);
    const keep = state.draft.allowDuplicates;
    const timer = state.draft.timer;
    state.draft = createDraftState(p.id);
    state.draft.allowDuplicates = keep;
    state.draft.timer = timer;
  }
  pushLog(state.draft, { kind: 'preset', text: `Preset draft diubah (${state.draft.presetName})` });
  return { state: bump(state) };
}

export function toggleLock(state, entryIndex, locked) {
  const draft = state.draft;
  const e = draft.entries.find((x) => x.i === entryIndex || x.phaseIndex === entryIndex);
  if (!e) return { state, error: 'Entri tidak ditemukan.' };
  e.locked = locked === undefined ? !e.locked : !!locked;
  pushLog(draft, {
    kind: 'lock',
    team: e.team,
    type: e.type,
    heroId: e.heroId,
    entryIndex: e.phaseIndex,
    text: e.locked ? 'Kunci pilihan diaktifkan' : 'Kunci pilihan dilepas'
  });
  draft.updatedAt = nowIso();
  return { state: bump(state) };
}

export function setAllowDuplicates(state, value) {
  state.draft.allowDuplicates = !!value;
  return { state: bump(state) };
}

/* ------------------------------------------------------------------ timer */

export function startTimer(draft) {
  const t = draft.timer;
  if (t.remainingMs <= 0) t.remainingMs = t.durationMs;
  t.deadlineAt = Date.now() + t.remainingMs;
  t.running = true;
}

export function pauseTimer(draft) {
  const t = draft.timer;
  if (t.running) {
    t.remainingMs = Math.max(0, t.deadlineAt - Date.now());
    t.running = false;
    t.deadlineAt = null;
  }
}

export function resetTimer(draft) {
  const t = draft.timer;
  t.running = false;
  t.deadlineAt = null;
  t.remainingMs = t.durationMs;
}

export function timerCommand(state, cmd, value) {
  const t = state.draft.timer;
  switch (cmd) {
    case 'start':
      startTimer(state.draft);
      break;
    case 'pause':
      pauseTimer(state.draft);
      break;
    case 'toggle':
      t.running ? pauseTimer(state.draft) : startTimer(state.draft);
      break;
    case 'reset':
      resetTimer(state.draft);
      break;
    case 'setDuration': {
      const ms = Math.max(1000, Math.min(300000, Number(value) || DEFAULT_TIMER_MS));
      t.durationMs = ms;
      if (!t.running) {
        t.remainingMs = ms;
        t.deadlineAt = null;
      }
      break;
    }
    case 'add': {
      const add = Math.max(0, Number(value) || 0);
      if (t.running) t.deadlineAt += add;
      else t.remainingMs = Math.min(300000, t.remainingMs + add);
      break;
    }
    default:
      return { state, error: `Perintah timer tidak dikenal: ${cmd}` };
  }
  return { state: bump(state) };
}

export function remainingMs(draft) {
  const t = draft.timer;
  if (t.running) return Math.max(0, t.deadlineAt - Date.now());
  return Math.max(0, t.remainingMs);
}

/* ------------------------------------------------------- match timer */

/**
 * Timer pertandingan internal (terpisah dari countdown draft & timer HUD MLBB).
 * cmd: 'start' | 'pause' | 'reset' | 'set'
 * 'set' = set elapsedMs langsung (value = ms).
 * Saat running: elapsedMs = akumulasi, runningAt = epoch ms mulai berjalan.
 * Saat paused:  runningAt = null, elapsedMs = akumulasi terakhir.
 */
export function matchTimerCommand(state, cmd, value) {
  if (!state.score.matchTimer) state.score.matchTimer = { elapsedMs: 0, runningAt: null, timeSource: 'manual' };
  const t = state.score.matchTimer;
  if (!t.timeSource) t.timeSource = 'manual';
  const now = Date.now();
  switch (cmd) {
    case 'start':
      // Saat sumber scoresight aktif, ScoreSight yang mengendalikan running.
      // Operator hanya boleh start manual bila timeSource manual.
      if (t.timeSource === 'scoresight') {
        return { state, error: 'Timer dikendalikan ScoreSight — gunakan pause/manual set untuk override.' };
      }
      if (t.runningAt) break; // sudah jalan
      t.runningAt = now;
      if (state.score.status === 'belum') state.score.status = 'berlangsung';
      break;
    case 'pause':
      if (t.runningAt) {
        t.elapsedMs += now - t.runningAt;
        t.runningAt = null;
      }
      break;
    case 'reset':
      t.elapsedMs = 0;
      t.runningAt = null;
      break;
    case 'set': {
      const ms = Math.max(0, Number(value) || 0);
      t.elapsedMs = ms;
      t.runningAt = t.runningAt ? now : null;
      break;
    }
    default:
      return { state, error: `Perintah match timer tidak dikenal: ${cmd}` };
  }
  state.revision += 1;
  state.updatedAt = nowIso();
  return { state };
}

/**
 * Sinkronkan timer internal dari Time.txt ScoreSight (milidetik).
 * Jadikan ScoreSight authoritative: elapsedMs = timeMs, runningAt = now.
 * Tidak emit revision bila nilai tidak berubah (anti lonjakan).
 * @param {object} state
 * @param {number|null} timeMs durasi milidetik dari Time.txt
 * @param {object} [opts]
 * @param {boolean} [opts.stale] true bila file tidak diperbarui/gagal baca
 */
export function syncMatchTimerFromScoreSight(state, timeMs, opts = {}) {
  if (!state.score.matchTimer) state.score.matchTimer = { elapsedMs: 0, runningAt: null, timeSource: 'manual' };
  const t = state.score.matchTimer;
  // tandai sumber
  if (t.timeSource !== 'scoresight') {
    t.timeSource = 'scoresight';
  }
  // file stale / tidak valid → pertahankan waktu terakhir, jangan reset
  if (opts.stale || timeMs == null || !Number.isFinite(timeMs) || timeMs < 0) {
    return { state, changed: false, stale: true };
  }
  const ms = Math.max(0, Math.round(timeMs));
  // deteksi perubahan: bandingkan dengan elapsed yang sedang berjalan
  const current = (t.elapsedMs || 0) + (t.runningAt ? Date.now() - t.runningAt : 0);
  // toleransi 500ms agar detik-tick tidak memicu revision berulang
  if (Math.abs(current - ms) < 500 && t.runningAt) {
    return { state, changed: false };
  }
  // sinkronkan: set elapsedMs = timeMs, runningAt = now (timer dianggap jalan)
  t.elapsedMs = ms;
  t.runningAt = Date.now();
  if (state.score.status === 'belum') state.score.status = 'berlangsung';
  state.revision += 1;
  state.updatedAt = nowIso();
  return { state, changed: true };
}

/** Elapsed ms match timer (akumulasi saat ini bila running). */
export function matchElapsedMs(score) {
  const t = score?.matchTimer;
  if (!t) return 0;
  return Math.max(0, (t.elapsedMs || 0) + (t.runningAt ? Date.now() - t.runningAt : 0));
}

/* ------------------------------------------------------- transisi game */

/**
 * Game berikutnya: menaikkan nomor game, mengosongkan statistik game,
 * dan memulai draft baru dengan preset yang sama. Skor seri tim TIDAK direset.
 */
export function nextGame(state) {
  const prev = state.draft;
  const isCustom = prev.presetId === 'custom';
  const keepDup = prev.allowDuplicates;
  const durationMs = prev.timer.durationMs;

  state.draft = createDraftState(prev.presetId);
  if (isCustom) {
    state.draft.presetId = 'custom';
    state.draft.presetName = prev.presetName || 'Preset Kustom';
    state.draft.actions = prev.actions.map((a) => ({ i: a.i, team: a.team, type: a.type }));
  }
  state.draft.allowDuplicates = keepDup;
  state.draft.timer.durationMs = durationMs;
  state.draft.timer.remainingMs = durationMs;

  state.meta.gameNumber = Math.min(9, Math.max(1, (Number(state.meta.gameNumber) || 1) + 1));
  state.score = {
    blue: { kills: 0, gold: 0, turrets: 0, lord: 0, turtle: 0 },
    red: { kills: 0, gold: 0, turrets: 0, lord: 0, turtle: 0 },
    durationMs: 0,
    mvpPlayer: '',
    mvpHeroId: null,
    winner: null,
    status: 'belum',
    notes: '',
    matchTimer: { elapsedMs: 0, runningAt: null, timeSource: 'manual' }
  };
  state.overlay.announce = null;
  pushLog(state.draft, { kind: 'game', text: `Game ${state.meta.gameNumber} dimulai` });
  return { state: bump(state) };
}

/**
 * Emergency stop: membekukan animasi overlay & menahan timer
 * TANPA menghapus data pertandingan apa pun.
 */
export function setEmergency(state, on) {
  const enable = !!on;
  state.overlay.emergency = enable;
  if (enable) pauseTimer(state.draft);
  pushLog(state.draft, {
    kind: 'emergency',
    text: enable ? 'EMERGENCY STOP diaktifkan' : 'EMERGENCY STOP dilepas'
  });
  return { state: bump(state) };
}
