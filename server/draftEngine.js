/**
 * server/draftEngine.js
 * ---------------------------------------------------------------------------
 * Mesin state draft yang terpisah dari UI. Semua fungsi bersifat murni:
 * menerima state, mengembalikan state baru + pesan error bila gagal.
 * ---------------------------------------------------------------------------
 */
import { getPreset, validatePreset, MAX_PICKS_PER_TEAM } from './presets.js';
import { defaultTheme } from '../shared/theme.js';

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
      blue: { name: 'Blue Side', logo: null, players: [], score: 0 },
      red: { name: 'Red Side', logo: null, players: [], score: 0 }
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
      notes: ''
    },
    overlay: {
      showPlayerNames: true,
      showTimer: true,
      showTier: true,
      showLogos: true,
      draftLayout: 'full', // full | compact | lineup
      scoreLayout: 'full', // full | compact
      animMs: 600,
      announce: null, // { type:'mvp'|'winner'|'game', text, at }
      /* slot branding turnamen/sponsor (bisa dimatikan) */
      showBranding: false,
      brandText: '',
      brandLogo: null,
      /** emergency stop: membekukan animasi & countdown tanpa menghapus data */
      emergency: false,
      /**
       * Konfigurasi desain scoreboard (warna, preset, frame, logo, sponsor,
       * visibilitas). Terpisah dari data pertandingan — mengubah tema tidak
       * pernah menyentuh skor/draft, dan sebaliknya.
       */
      theme: defaultTheme()
    },
    revision: 0,
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

/** Dipanggil ticker server. Mengembalikan true bila timer baru saja habis. */
export function tickTimer(state) {
  const t = state.draft.timer;
  if (!t.running) return false;
  if (Date.now() >= t.deadlineAt) {
    t.remainingMs = 0;
    t.running = false;
    t.deadlineAt = null;
    bump(state);
    return true;
  }
  return false;
}

export function remainingMs(draft) {
  const t = draft.timer;
  if (t.running) return Math.max(0, t.deadlineAt - Date.now());
  return Math.max(0, t.remainingMs);
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
    notes: ''
  };
  state.overlay.announce = null;
  pushLog(state.draft, { kind: 'game', text: `Game ${state.meta.gameNumber} dimulai` });
  return { state: bump(state) };
}

/**
 * Emergency stop: membekukan animasi overlay & menghentikan countdown
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
