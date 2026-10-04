import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore, cx, fmtDate, sideLabel } from '../lib/utils.js';
import { startSocket, request, setOperatorToken } from '../lib/socket.js';
import { store } from '../lib/store.js';
import { loadHeroes, loadMeta, loadPresets, loadHeroDetail } from '../lib/data.js';

import { Btn, Panel, Tabs, Modal, ConfirmBtn, Notice, Field, TextInput } from '../components/ui.jsx';
import HeroPicker from '../components/HeroPicker.jsx';
import DraftBoard, { ActionStrip } from '../components/DraftBoard.jsx';
import TimerBar from '../components/TimerBar.jsx';
import HeroImage from '../components/HeroImage.jsx';
import {
  MatchMetaPanel,
  TeamPanel,
  ScorePanel,
  OverlayPanel,
  MatchManagerPanel,
  PresetPanel,
  HistoryPanel
} from '../components/sidepanels.jsx';

function LoadingScreen({ text }) {
  return (
    <div className="flex h-full min-h-screen items-center justify-center bg-ink-950">
      <div className="panel px-8 py-6 text-center">
        <div className="font-display text-[26px] tracking-[0.2em] text-gold">MLBB DRAFT STUDIO</div>
        <div className="mt-1 text-[12px] text-ink-300">{text}</div>
          <div className="mx-auto mt-3 h-[3px] w-40 overflow-hidden rounded bg-ink-700">
            <div className="h-full w-1/3 animate-pulse bg-gold" />
          </div>
      </div>
    </div>
  );
}

export default function Control() {
  const snap = useStore();
  const [heroes, setHeroes] = useState([]);
  const [meta, setMeta] = useState(null);
  const [presets, setPresets] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('tim');
  const [boot, setBoot] = useState({ loading: true, error: null });
  const [spells, setSpells] = useState({ spells: [], heroSpells: {}, available: false });

  useEffect(() => {
    startSocket('control');
    let alive = true;
    (async () => {
      try {
        const [h, m, p, sp] = await Promise.all([
          loadHeroes(),
          loadMeta(),
          loadPresets(),
          fetch('/api/battle-spells')
            .then((r) => r.json())
            .catch(() => ({ spells: [], heroSpells: {}, available: false }))
        ]);
        if (!alive) return;
        setHeroes(h);
        setMeta(m);
        setPresets(p);
        setSpells(sp);
        setBoot({ loading: false, error: null });
      } catch (e) {
        if (!alive) return;
        setBoot({ loading: false, error: e.message });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const state = snap.state;
  const heroesById = useMemo(() => Object.fromEntries(heroes.map((h) => [h.id, h])), [heroes]);

  const act = state ? state.draft.actions[state.draft.cursor] || null : null;

  const pickSelected = useCallback(async () => {
    if (!selected) return store.notice('Pilih hero terlebih dahulu.', 'warn');
    const res = await request('draft:pick', { heroId: selected.id });
    if (!res.ok) return store.notice(res.error, 'error');
    setSelected(null);
  }, [selected]);

  const undo = useCallback(async (force = false) => {
    const res = await request('draft:undo', { force });
    if (!res.ok) {
      if (!force && /terkunci/i.test(res.error || '')) {
        if (window.confirm(`${res.error}\nTetap paksa undo?`)) return undo(true);
      }
      return store.notice(res.error, 'error');
    }
    store.notice('Aksi terakhir dibatalkan.', 'info');
  }, []);

  const resetDraft = useCallback(async () => {
    const res = await request('draft:reset', { presetId: undefined });
    if (!res.ok) return store.notice(res.error, 'error');
    setSelected(null);
    store.notice('Draft direset.', 'info');
  }, []);

  // pintasan keyboard (hindari saat mengetik di input)
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        undo();
      }
      if (mod && !e.shiftKey && e.key === 'Enter' && !typing) {
        e.preventDefault();
        pickSelected();
      }
      // pintasan sakelar overlay (tanpa membuka panel)
      if (mod && e.shiftKey && !typing) {
        const map = { KeyN: 'showPlayerNames', KeyT: 'showTimer', KeyL: 'showLogos' };
        const key = map[e.code];
        if (key) {
          e.preventDefault();
          toggleOverlayFlag(key);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, pickSelected]);

  if (boot.loading) return <LoadingScreen text="Memuat database hero…" />;
  if (boot.error)
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 p-6">
        <div className="panel max-w-lg p-6 text-center">
          <div className="font-display text-[24px] text-side-red">GAGAL TERHUBUNG</div>
          <p className="mt-2 text-[13px] text-ink-300">{boot.error}</p>
          <p className="mt-1 text-[12px] text-ink-400">
            Pastikan backend berjalan: <code className="text-gold">npm run dev</code> lalu muat ulang halaman.
          </p>
          <Btn className="mt-4" variant="primary" onClick={() => location.reload()}>
            Muat ulang
          </Btn>
        </div>
      </div>
    );
  if (!state) return <LoadingScreen text="Menyambungkan ke server…" />;

  const draft = state.draft;
  const overlayCount = snap.presence.overlay || 0;
  const selectedEntry = draft.entries.length ? draft.entries[draft.entries.length - 1] : null;
  const av = snap.autosave;
  const saveOk = av?.lastSaveOk !== false;
  const saveTime = av?.lastSaveAt
    ? new Date(av.lastSaveAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const tabs = [
    { id: 'tim', label: 'Tim' },
    { id: 'skor', label: 'Skor' },
    { id: 'overlay', label: 'Overlay' },
    { id: 'match', label: 'Match' },
    { id: 'preset', label: 'Preset' },
    { id: 'riwayat', label: 'Riwayat' }
  ];

  return (
    <div className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-ink-950">
      {/* ----------------------------------------------------------- header */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-700 bg-gradient-to-b from-ink-850 to-ink-900 px-3 py-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-gold/60 bg-gold/10">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#f5c451" strokeWidth="1.8">
              <path d="M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7l7-4z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div className="leading-none">
            <div className="font-display text-[19px] tracking-[0.16em] text-white">MLBB DRAFT STUDIO</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-400">Control Panel Operator</div>
          </div>
        </div>

        <div className="hidden min-w-0 items-baseline gap-3 md:flex">
          <span className="truncate font-display text-[17px] tracking-wide text-gold">
            {state.meta.tournament || 'Turnamen belum diatur'}
          </span>
          <span className="truncate text-[11.5px] text-ink-300">
            {state.matchName} · {state.meta.round || '—'} · BO{state.meta.bestOf} · Game {state.meta.gameNumber}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={cx(
              'rounded border px-2 py-1 text-[11px]',
              saveOk ? 'border-ink-600 bg-ink-900 text-ink-300' : 'border-side-red/60 bg-side-red/15 text-[#ff8fa5]'
            )}
            title={`Autosave otomatis ke file state.json · backup tersimpan: ${av?.backupCount ?? 0}`}
          >
            Autosave {saveOk ? saveTime : 'GAGAL'}
          </span>
          <span className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-[11px] text-ink-300" title="Jumlah backup otomatis yang disimpan di server">
            Backup {av?.backupCount ?? 0}
          </span>
          <span
            className={cx(
              'flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-semibold',
              snap.connected ? 'border-mint/50 bg-mint/10 text-mint' : 'border-side-red/50 bg-side-red/10 text-[#ff9db1]'
            )}
          >
            <span className={cx('dot', snap.connected ? 'dot-on' : 'dot-off')} />
            {snap.connected ? 'Server tersambung' : 'Terputus'}
          </span>
          <span className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-[11px] text-ink-300">
            Overlay aktif: {overlayCount}
          </span>
          <ConfirmBtn
            size="sm"
            data-testid="emergency"
            confirmText={state.overlay.emergency ? 'Lepas?' : 'Aktifkan?'}
            onConfirm={() => send('emergency', { on: !state.overlay.emergency })}
          >
            {state.overlay.emergency ? 'Lepas emergency' : 'Emergency stop'}
          </ConfirmBtn>
          <a className="btn btn-sm" href="/overlay/draft" target="_blank" rel="noreferrer">
            Draft Overlay
          </a>
          <a className="btn btn-sm" href="/overlay/score" target="_blank" rel="noreferrer">
            Scoreboard
          </a>
        </div>
      </header>

      {/* banner darurat: terlihat jelas agar tidak terlewat saat siaran */}
      {state.overlay.emergency ? (
        <div className="flex shrink-0 items-center gap-2 bg-side-red px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.18em] text-white">
          <span className="dot dot-on" style={{ background: '#fff' }} />
          Emergency stop aktif — animasi overlay dibekukan & countdown berhenti. Data pertandingan tidak dihapus.
        </div>
      ) : null}

      {/* ------------------------------------------------------------ body */}
      <div className="thin-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        <DraftBoard
          state={state}
          heroesById={heroesById}
          meta={meta}
          onSlotClick={(entry) => {
            const h = heroesById[entry.heroId];
            if (h) setDetail(h);
          }}
        />

        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_330px]">
          {/* kolom kerja */}
          <div className="flex min-w-0 flex-col gap-2">
            <Panel
              title={
                <span className="flex items-center gap-2">
                  <span className={draft.actions.length && act ? 'text-gold' : 'text-mint'}>
                    {act ? (act.type === 'ban' ? 'FASE BAN' : 'FASE PICK') : 'DRAFT SELESAI'}
                  </span>
                  {act && (
                    <span className="font-sans text-[11px] tracking-normal text-ink-300">
                      {sideLabel(act.team)} Side · aksi {draft.cursor + 1}/{draft.actions.length}
                    </span>
                  )}
                </span>
              }
              right={
                <span className="font-sans text-[10.5px] tracking-normal text-ink-400">
                  preset: {draft.presetName} · {draft.entries.length} aksi tercatat
                </span>
              }
              bodyClass="p-2.5 space-y-2"
            >
              <ActionStrip draft={draft} />

              <div className="flex flex-wrap items-center gap-2">
                <TimerBar draft={draft} onCmd={(cmd, value) => send('timer', { cmd, value })} />
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <Btn
                    variant="primary"
                    data-testid="confirm-pick"
                    disabled={!selected || !act}
                    onClick={pickSelected}
                    title="Ctrl+Enter"
                  >
                    {act ? `${act.type === 'ban' ? 'Ban' : 'Pick'} ${selected?.name || ''}` : 'Draft selesai'}
                  </Btn>
                  <Btn disabled={!selected} onClick={() => setDetail(selected)}>
                    Detail hero
                  </Btn>
                  <Btn data-testid="undo" onClick={() => undo()} disabled={draft.entries.length === 0} title="Ctrl+Z">
                    Undo
                  </Btn>
                  <Btn
                    data-testid="lock"
                    onClick={() => {
                      if (!selectedEntry) return;
                      send('draft:lock', {
                        entryIndex: selectedEntry.phaseIndex,
                        locked: !selectedEntry.locked
                      });
                    }}
                    disabled={!selectedEntry}
                  >
                    {selectedEntry?.locked ? 'Buka kunci' : 'Kunci pilihan'}
                  </Btn>
                  <ConfirmBtn data-testid="reset-draft" confirmText="Yakin reset?" onConfirm={resetDraft} disabled={draft.entries.length === 0}>
                    Reset draft
                  </ConfirmBtn>
                </div>
              </div>

              {selected ? (
                <div className="flex items-center gap-2 rounded border border-gold/40 bg-gold/8 px-2.5 py-1.5">
                  <HeroImage hero={selected} kind="avatar" className="h-8 w-8 rounded object-cover" />
                  <div className="min-w-0">
                    <div className="font-display text-[15px] leading-none tracking-wide text-white">
                      {selected.name}
                    </div>
                    <div className="text-[10.5px] text-ink-300">
                      {selected.roles.join(' · ')} — {selected.lanes.join(' · ')}
                    </div>
                  </div>
                  <Btn size="sm" className="ml-auto" variant="ghost" onClick={() => setSelected(null)}>
                    Bersihkan
                  </Btn>
                </div>
              ) : null}
            </Panel>

            <Panel
              title="Pilih Hero"
              right={
                <span className="font-sans text-[10.5px] tracking-normal text-ink-400">
                  klik ganda untuk detail skill
                </span>
              }
              bodyClass="p-3 h-[430px]"
            >
              <HeroPicker
                heroes={heroes}
                meta={meta}
                draft={draft}
                selectedId={selected?.id}
                onSelect={setSelected}
                onDetail={setDetail}
              />
            </Panel>
          </div>

          {/* kolom kanan */}
          <div className="flex min-w-0 flex-col gap-2">
            <MatchMetaPanel state={state} />
            <div className="panel overflow-hidden">
              <Tabs tabs={tabs} active={tab} onChange={setTab} />
              <div className="thin-scroll max-h-[560px] overflow-y-auto p-2">
                {tab === 'tim' && (
                  <div className="space-y-2">
                    <TeamPanel side="blue" team={state.teams.blue} />
                    <TeamPanel side="red" team={state.teams.red} />
                  </div>
                )}
                {tab === 'skor' && <ScorePanel state={state} />}
                {tab === 'overlay' && <OverlayPanel state={state} />}
                {tab === 'match' && <MatchManagerPanel state={state} />}
                {tab === 'preset' && (
                  <PresetPanel state={state} presets={presets} onLoaded={setPresets} />
                )}
                {tab === 'riwayat' && <HistoryPanel state={state} heroesById={heroesById} />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------- footer */}
      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-700 bg-ink-900 px-3 py-1.5 text-[10.5px] text-ink-400">
        <span>
          Hero database: <span className="text-ink-300">{heroes.length} hero</span>
        </span>
        <span>
          Revision: <span className="text-ink-300">{state.revision}</span>
        </span>
        <span>Diubah: {fmtDate(state.updatedAt)}</span>
        <span className="ml-auto">
          Pintasan: <span className="text-ink-300">Ctrl+Z</span> undo · <span className="text-ink-300">Ctrl+Enter</span>{' '}
          konfirmasi pick · <span className="text-ink-300">Ctrl+Shift+N</span> nickname ·{' '}
          <span className="text-ink-300">Ctrl+Shift+T</span> countdown ·{' '}
          <span className="text-ink-300">Ctrl+Shift+L</span> logo
        </span>
      </footer>

      <HeroDetailModal hero={detail} onClose={() => setDetail(null)} meta={meta} spells={spells} />

      {/* tautan overlay untuk memverifikasi koneksi */}
      <ConnectHint visible={!overlayCount} />
      <TokenGate open={snap.needAuth} />
      <Notice notice={snap.notice} />
    </div>
  );
}

function send(event, payload) {
  request(event, payload).then((res) => {
    if (!res.ok) store.notice(res.error || 'Gagal memproses.', 'error');
  });
}

/**
 * Sakelar pengaturan overlay dari pintasan keyboard. Membaca state terkini
 * dari store sehingga tidak perlu dependensi render ulang.
 */
function toggleOverlayFlag(key) {
  const s = store.getSnapshot().state;
  if (!s?.overlay) return;
  const next = !s.overlay[key];
  request('overlay:update', { patch: { [key]: next } }).then((res) => {
    if (!res.ok) return store.notice(res.error, 'error');
    const label = { showPlayerNames: 'Nickname', showTimer: 'Countdown', showLogos: 'Logo & nama tim' }[key] || key;
    store.notice(`${label}: ${next ? 'aktif' : 'nonaktif'}`, 'info');
  });
}

function ConnectHint({ visible }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed bottom-10 right-3 z-40 max-w-[320px] rounded border border-ink-600 bg-ink-850/95 px-3 py-2 text-[11px] text-ink-300 shadow-lg">
      <b className="text-gold">Overlay belum terbuka.</b> Buka tab overlay agar operator dapat memantau tampilan
      penonton selama siaran.
    </div>
  );
}

/**
 * Gerbang token operator — muncul saat server berjalan dengan APP_AUTH_TOKEN
 * dan koneksi ini belum diakui sebagai operator. Token disimpan di localStorage
 * dan dikirim lewat handshake Socket.IO (tidak pernah lewat URL).
 */
function TokenGate({ open }) {
  const [val, setVal] = useState('');
  const [checking, setChecking] = useState(false);

  if (!open) return null;

  const submit = () => {
    const token = val.trim();
    if (!token) return;
    setChecking(true);
    setOperatorToken(token);
    setTimeout(() => {
      setChecking(false);
      if (store.getSnapshot().needAuth) store.notice('Token ditolak. Periksa kembali APP_AUTH_TOKEN di server.', 'error');
      else {
        store.notice('Terhubung sebagai operator.', 'info');
        setVal('');
      }
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
      <div className="panel w-full max-w-md fade-in">
        <header className="panel-head">
          <span>Token operator diperlukan</span>
        </header>
        <div className="space-y-3 p-4">
          <p className="text-[12px] leading-relaxed text-ink-300">
            Server berjalan dalam mode aman (<code className="text-gold">APP_AUTH_TOKEN</code>). Mode ini dipakai
            saat control panel diakses dari PC lain melalui LAN. Masukkan token operator untuk mengendalikan draft,
            skor, dan overlay.
          </p>
          <Field label="Token operator">
            <TextInput
              type="password"
              value={val}
              autoFocus
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="tempel token dari server"
            />
          </Field>
          <div className="flex gap-2">
            <Btn variant="primary" onClick={submit} disabled={!val.trim() || checking}>
              {checking ? 'Memeriksa…' : 'Sambungkan ulang'}
            </Btn>
            <Btn variant="ghost" onClick={() => store.patch({ needAuth: false })}>
              Nanti
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroDetailModal({ hero, onClose, meta, spells }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hero) {
      setData(null);
      return;
    }
    setLoading(true);
    loadHeroDetail(hero.id)
      .then(setData)
      .catch(() => setData({ hero, skills: [], tier: {}, build: null }))
      .finally(() => setLoading(false));
  }, [hero]);

  if (!hero) return null;
  const tier = data?.tier || {};
  const build = data?.build;

  /**
   * Battle spell hanya ditampilkan bila datanya lengkap DAN ikonnya benar-benar
   * ada (server sudah menyaring). Tanpa ikon, barisnya tidak dirender agar
   * penonton/operator tidak melihat label tanpa gambar yang membingungkan.
   */
  const spellCatalog = (spells?.spells || []).reduce((acc, s) => {
    acc.set(String(s.id).toLowerCase(), s);
    acc.set(String(s.name).toLowerCase(), s);
    return acc;
  }, new Map());
  const heroSpellIds = (spells?.heroSpells || {})[hero.id] || [];
  const spellIcon = (s, size = 16) =>
    s?.icon ? (
      <img
        src={s.icon}
        alt=""
        width={size}
        height={size}
        className="object-contain"
        style={{ width: size, height: size }}
        onError={(e) => {
          e.currentTarget.style.visibility = 'hidden';
        }}
        referrerPolicy="no-referrer"
      />
    ) : null;
  const spellByName = (name) => (name ? spellCatalog.get(String(name).toLowerCase()) : null);

  return (
    <Modal open={!!hero} onClose={onClose} title={`Detail — ${hero.name}`} width="max-w-3xl">
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="w-full max-w-[260px] shrink-0">
          <div className="overflow-hidden rounded border border-ink-600">
            <HeroImage hero={hero} kind="splash" className="h-[300px] w-full object-cover" />
          </div>
          <div className="mt-2 rounded border border-ink-700 bg-ink-900 p-2 text-[11.5px] text-ink-300">
            <div className="mb-1 flex flex-wrap gap-1">
              {hero.roles.map((r) => (
                <span key={r} className="chip" data-active="true">
                  {r}
                </span>
              ))}
            </div>
            <div className="mb-1 flex flex-wrap gap-1">
              {hero.lanes.map((l) => (
                <span key={l} className="chip">
                  {l}
                </span>
              ))}
            </div>
            {hero.speciality?.length ? (
              <div>Speciality: {hero.speciality.join(', ')}</div>
            ) : null}
            <div className="mt-1 text-ink-400">
              Sumber: {hero.metadata?.source} · diperbarui {hero.metadata?.lastUpdated}
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Tier meta</div>
            {Object.keys(tier).length ? (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(tier).map(([lane, t]) => (
                  <span key={lane} className="chip" data-active="true">
                    {lane.replace('_', ' ')}: {t}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[11.5px] text-ink-400">Tidak ada data tier untuk hero ini.</span>
            )}
          </div>

          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Skill</div>
            {loading ? (
              <span className="text-[11.5px] text-ink-400">Memuat…</span>
            ) : (data?.skills || []).length === 0 ? (
              <span className="text-[11.5px] text-ink-400">Data skill tidak tersedia.</span>
            ) : (
              <div className="space-y-2">
                {data.skills.map((s) => (
                  <div key={s.index} className="flex gap-2 rounded border border-ink-700 bg-ink-900 p-2">
                    {s.icon ? (
                      <img
                        src={s.icon}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded border border-ink-600 object-contain"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.visibility = 'hidden';
                        }}
                      />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded border border-ink-600 bg-ink-800" />
                    )}
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold text-white">
                        {s.name}
                        {s.cdCost ? <span className="ml-2 text-[10.5px] font-normal text-ink-400">{s.cdCost}</span> : null}
                      </div>
                      <div className="line-clamp-3 text-[11px] leading-snug text-ink-300">{s.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Battle spell</div>
            {heroSpellIds.length ? (
              <div className="flex flex-wrap gap-1.5">
                {heroSpellIds.map((id) => {
                  const s = spellCatalog.get(String(id).toLowerCase());
                  if (!s) return null;
                  return (
                    <span key={id} className="chip items-center gap-1.5" data-active="true">
                      {spellIcon(s, 18)}
                      {s.name}
                    </span>
                  );
                })}
              </div>
            ) : spells && spells.available ? (
              <span className="text-[11.5px] text-ink-400">Tidak ada rekomendasi battle spell untuk hero ini.</span>
            ) : (
              <span className="text-[11.5px] text-ink-400">
                Data battle spell &amp; ikon belum tersedia — sengaja tidak ditampilkan agar tidak menyesatkan.
              </span>
            )}
          </div>

          {build?.topBuilds?.length ? (
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">
                Build rekomendasi (dataset)
              </div>
              {build.topBuilds.slice(0, 2).map((b, i) => {
                const sp = spellByName(b.battleSpell);
                return (
                  <div key={i} className="mb-1 rounded border border-ink-700 bg-ink-900 p-2 text-[11.5px]">
                    {sp ? (
                      <div className="flex items-center gap-1.5 text-gold">
                        {spellIcon(sp, 14)}
                        Spell: {sp.name}
                      </div>
                    ) : null}
                    <div className="text-ink-300">Emblem: {(b.emblems || []).join(' · ') || '-'}</div>
                    <div className="text-ink-400">{(b.items || []).join(' → ')}</div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
