import React, { useEffect, useState } from 'react';
import { Panel, Btn, Field, TextInput, Toggle, ConfirmBtn } from './ui.jsx';
import { cx, fmtDate, fmtDuration, fmtGold, sideLabel, sideColor } from '../lib/utils.js';
import { request } from '../lib/socket.js';
import { store, getOperatorToken } from '../lib/store.js';
import { loadPresets } from '../lib/data.js';
import TeamLogo from './TeamLogo.jsx';
import { uploadLogo, assertLogoFile, readAsDataUrl } from '../lib/assets.js';

async function send(event, payload, okMsg) {
  const res = await request(event, payload);
  if (!res.ok) store.notice(res.error || 'Gagal.', 'error');
  else if (okMsg) store.notice(okMsg, 'info');
  return res;
}


/* ------------------------------------------------------------- meta match */

export function MatchMetaPanel({ state }) {
  const m = state.meta;
  const patch = (p) => send('meta:update', { patch: p });

  return (
    <Panel title="Info Turnamen" bodyClass="p-2.5 space-y-2">
      <Field label="Nama pertandingan">
        <TextInput
          value={state.matchName || ''}
          onChange={(e) => patch({ matchName: e.target.value })}
          placeholder="Grand Final"
        />
      </Field>
      <Field label="Nama turnamen">
        <TextInput
          value={m.tournament}
          onChange={(e) => patch({ tournament: e.target.value })}
          placeholder="MPL Season ke-…"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Stage / Ronde">
          <TextInput value={m.round} onChange={(e) => patch({ round: e.target.value })} placeholder="Upper Bracket" />
        </Field>
        <Field label="Best Of">
          <select className="inp" value={m.bestOf} onChange={(e) => patch({ bestOf: Number(e.target.value) })}>
            <option value={1}>BO1</option>
            <option value={3}>BO3</option>
            <option value={5}>BO5</option>
            <option value={7}>BO7</option>
          </select>
        </Field>
        <Field label="Game ke-">
          <TextInput
            type="number"
            min={1}
            max={9}
            value={m.gameNumber}
            onChange={(e) => patch({ gameNumber: Number(e.target.value) })}
          />
        </Field>
        <Field label="Stage label">
          <TextInput value={m.stage} onChange={(e) => patch({ stage: e.target.value })} placeholder="Game 1" />
        </Field>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------ panel tim */

export function TeamPanel({ side, team }) {
  const [logoName, setLogoName] = useState('');
  const [logoUrl, setLogoUrl] = useState(team.logo || '');
  const [busy, setBusy] = useState(false);
  const players = team.players || [];

  useEffect(() => {
    setLogoUrl(team.logo || '');
  }, [team.logo]);

  const update = (patch) => send('team:update', { side, patch });
  const setPlayer = (i, val) => {
    const next = [...players];
    next[i] = val;
    update({ players: next });
  };

  /**
   * Logo diunggah ke penyimpanan lokal server (/api/logos) agar file state
   * tetap kecil. Nama file dibuat server — klien tidak menentukan path.
   * Bila endpoint menolak, operator mendapat pesan error (tanpa fallback
   * diam-diam agar tidak ada data yang disimpan di tempat tak terduga).
   */
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1500000) {
      store.notice('Logo terlalu besar (maks 1.5 MB).', 'error');
      e.target.value = '';
      return;
    }
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
      store.notice('Logo harus berupa gambar PNG/JPG/WEBP/GIF.', 'error');
      e.target.value = '';
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Gagal membaca file logo.'));
        reader.readAsDataURL(file);
      });
      const url = await uploadLogo(dataUrl);
      update({ logo: url });
      setLogoName(file.name);
      store.notice('Logo tersimpan di server.', 'info');
    } catch (err) {
      store.notice(err.message || 'Gagal mengunggah logo.', 'error');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const accent = sideColor(side);

  return (
    <Panel
      title={
        <span style={{ color: accent }}>
          {sideLabel(side)} — {team.name || 'Tanpa Nama'}
        </span>
      }
      bodyClass="p-2.5 space-y-2.5"
      className={cx('border-t-2', side === 'blue' ? 'border-t-side-blue' : 'border-t-side-red')}
    >
      <div className="flex items-start gap-2.5">
        <TeamLogo src={team.logo} side={side} label={team.name} className="h-16 w-16 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <TextInput value={team.name} onChange={(e) => update({ name: e.target.value })} placeholder="Nama tim" />
          <div className="flex items-center gap-1.5">
            <label className={cx('btn btn-sm flex-1 cursor-pointer', busy && 'opacity-60')}>
              {busy ? 'Mengunggah…' : logoName || (team.logo ? 'Ganti logo' : 'Unggah logo')}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onFile} disabled={busy} />
            </label>
            {team.logo ? (
              <Btn size="sm" onClick={() => update({ logo: null })}>
                Hapus
              </Btn>
            ) : null}
          </div>
        </div>
      </div>

      <Field label="URL logo" hint="https://… atau /assets/logos/… (unggahan lokal)">
        <div className="flex gap-1.5">
          <TextInput
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://cdn.example/logo.png"
          />
          <Btn size="sm" onClick={() => update({ logo: logoUrl.trim() || null })}>
            Pakai
          </Btn>
        </div>
      </Field>

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Skor seri</span>
        <div className="flex items-center gap-1.5">
          <Btn size="sm" onClick={() => update({ score: Math.max(0, team.score - 1) })} aria-label="kurangi">
            −
          </Btn>
          <span
            className="min-w-[38px] text-center font-display text-[26px] leading-none"
            style={{ color: accent }}
          >
            {team.score}
          </span>
          <Btn size="sm" onClick={() => update({ score: team.score + 1 })} aria-label="tambah">
            +
          </Btn>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Roster (5 pemain)</span>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className="w-4 shrink-0 text-center text-[11px] font-bold"
              style={{ color: accent }}
            >
              {i + 1}
            </span>
            <TextInput
              value={players[i] || ''}
              onChange={(e) => setPlayer(i, e.target.value)}
              placeholder={`Pemain ${i + 1}`}
            />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ----------------------------------------------------------- panel skor */

export function ScorePanel({ state }) {
  const s = state.score;
  const patch = (p) => send('score:update', { patch: p });
  const patchSide = (side, key, val) => patch({ [side]: { [key]: val } });

  return (
    <Panel title="Statistik Game (input manual)" bodyClass="p-2.5 space-y-2">
      <div className="grid grid-cols-[64px_1fr_1fr] items-center gap-x-2 border-b border-ink-700 pb-1.5">
        <span />
        <span className="text-center font-display text-[14px] text-[#8dbaff]">BLUE</span>
        <span className="text-center font-display text-[14px] text-[#ff9db1]">RED</span>
      </div>

      {[
        ['Kill', 'kills', 1, (v) => v],
        ['Gold', 'gold', 500, (v) => fmtGold(v)],
        ['Turret', 'turrets', 1, (v) => v],
        ['Lord', 'lord', 1, (v) => v],
        ['Turtle', 'turtle', 1, (v) => v]
      ].map(([label, keyName, step, fmt]) => (
        <React.Fragment key={keyName}>
          <div className="grid grid-cols-[64px_1fr_1fr] items-center gap-x-2">
            <span className="text-[11.5px] font-semibold text-ink-300">{label}</span>
            <div className="flex items-center justify-between gap-1">
              <Btn size="sm" onClick={() => patchSide('blue', keyName, Math.max(0, (s.blue[keyName] || 0) - step))}>
                −
              </Btn>
              <span className="min-w-[54px] text-center font-display text-[17px] tabular-nums text-white">
                {fmt(s.blue[keyName] || 0)}
              </span>
              <Btn size="sm" onClick={() => patchSide('blue', keyName, (s.blue[keyName] || 0) + step)}>
                +
              </Btn>
            </div>
            <div className="flex items-center justify-between gap-1">
              <Btn size="sm" onClick={() => patchSide('red', keyName, Math.max(0, (s.red[keyName] || 0) - step))}>
                −
              </Btn>
              <span className="min-w-[54px] text-center font-display text-[17px] tabular-nums text-white">
                {fmt(s.red[keyName] || 0)}
              </span>
              <Btn size="sm" onClick={() => patchSide('red', keyName, (s.red[keyName] || 0) + step)}>
                +
              </Btn>
            </div>
          </div>
        </React.Fragment>
      ))}

      <div className="grid grid-cols-2 gap-2 border-t border-ink-700 pt-2">
        <Field label="Durasi (mm:ss)">
          <TextInput
            value={fmtDuration(s.durationMs)}
            onChange={(e) => {
              const [m, sec] = String(e.target.value).split(':');
              const ms = (Number(m || 0) * 60 + Number(sec || 0)) * 1000;
              patch({ durationMs: ms });
            }}
          />
        </Field>
        <Field label="Status">
          <select className="inp" value={s.status} onChange={(e) => patch({ status: e.target.value })}>
            <option value="belum">Belum</option>
            <option value="berlangsung">Berlangsung</option>
            <option value="selesai">Selesai</option>
          </select>
        </Field>
        <Field label="MVP (nickname)" className="col-span-2">
          <TextInput value={s.mvpPlayer} onChange={(e) => patch({ mvpPlayer: e.target.value })} placeholder="Nama pemain MVP" />
        </Field>
      </div>

      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Pemenang game</span>
        <div className="flex gap-1.5">
          <Btn
            variant={s.winner === 'blue' ? 'primary' : ''}
            className="flex-1"
            onClick={() => patch({ winner: s.winner === 'blue' ? null : 'blue' })}
          >
            Blue menang
          </Btn>
          <Btn
            variant={s.winner === 'red' ? 'primary' : ''}
            className="flex-1"
            onClick={() => patch({ winner: s.winner === 'red' ? null : 'red' })}
          >
            Red menang
          </Btn>
        </div>
        <div className="flex gap-1.5">
          <ConfirmBtn
            size="sm"
            className="flex-1"
            confirmText="Hapus hasil?"
            onConfirm={() => patch({ winner: null, status: 'belum', durationMs: 0 })}
          >
            Bersihkan hasil
          </ConfirmBtn>
          <Btn className="flex-1" onClick={() => send('announce', { type: 'winner', text: winnerText(state) })}>
            Umumkan pemenang
          </Btn>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Transisi game</span>
        <ConfirmBtn
          data-testid="next-game"
          className="w-full"
          confirmText={`Mulai game ${state.meta.gameNumber + 1}?`}
          onConfirm={async () => {
            const res = await request('match:nextGame');
            if (!res.ok) return store.notice(res.error, 'error');
            store.notice(`Game ${state.meta.gameNumber + 1} dimulai.`, 'info');
          }}
        >
          Game berikutnya →
        </ConfirmBtn>
        <p className="text-[10.5px] leading-snug text-ink-400">
          Skor statistik per-game direset, draft dibuat ulang, dan nomor game bertambah. Nama tim, turnamen, serta
          pengaturan overlay tetap tersimpan.
        </p>
      </div>
    </Panel>
  );
}

function winnerText(state) {
  const w = state.score.winner;
  if (!w) return 'Tidak ada pemenang';
  return `${state.teams[w].name || sideLabel(w)} memenangkan game ${state.meta.gameNumber}`;
}

/* --------------------------------------------------------- panel overlay */

export function OverlayPanel({ state }) {
  const o = state.overlay;
  const patch = (p) => send('overlay:update', { patch: p });
  const [brandLogoUrl, setBrandLogoUrl] = useState(o.brandLogo || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBrandLogoUrl(o.brandLogo || '');
  }, [o.brandLogo]);

  const onBrandFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1500000) {
      store.notice('Logo terlalu besar (maks 1.5 MB).', 'error');
      e.target.value = '';
      return;
    }
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
      store.notice('Logo harus berupa gambar PNG/JPG/WEBP/GIF.', 'error');
      e.target.value = '';
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Gagal membaca file.'));
        reader.readAsDataURL(file);
      });
      const url = await uploadLogo(dataUrl);
      patch({ brandLogo: url });
      store.notice('Logo branding tersimpan.', 'info');
    } catch (err) {
      store.notice(err.message || 'Gagal mengunggah logo branding.', 'error');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <Panel title="Pengaturan Overlay" bodyClass="p-2.5 space-y-2">
      <Field label="Layout draft overlay">
        <select className="inp" value={o.draftLayout} onChange={(e) => patch({ draftLayout: e.target.value })}>
          <option value="full">Full (1920×1080)</option>
          <option value="compact">Compact</option>
          <option value="lineup">Final lineup</option>
        </select>
      </Field>
      <Field label="Layout scoreboard">
        <select className="inp" value={o.scoreLayout} onChange={(e) => patch({ scoreLayout: e.target.value })}>
          <option value="full">Full</option>
          <option value="compact">Compact (lower bar)</option>
        </select>
      </Field>
      <Field label={`Durasi animasi — ${o.animMs} ms`}>
        <input
          type="range"
          min={0}
          max={2000}
          step={50}
          value={o.animMs}
          onChange={(e) => patch({ animMs: Number(e.target.value) })}
          className="w-full accent-[#f5c451]"
        />
      </Field>

      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <Toggle checked={o.showPlayerNames} onChange={(v) => patch({ showPlayerNames: v })} label="Tampilkan nickname" />
        <Toggle checked={o.showTimer} onChange={(v) => patch({ showTimer: v })} label="Tampilkan countdown" />
        <Toggle checked={o.showTier} onChange={(v) => patch({ showTier: v })} label="Tampilkan lencana tier meta" />
        <Toggle checked={o.showLogos} onChange={(v) => patch({ showLogos: v })} label="Tampilkan logo & nama tim" />
        <Toggle
          checked={!!o.showBranding}
          onChange={(v) => patch({ showBranding: v })}
          label="Tampilkan branding turnamen"
          description="Slot kanan bawah pada overlay draft & scoreboard."
        />
      </div>

      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <Field label="Teks branding">
          <TextInput
            value={o.brandText || ''}
            onChange={(e) => patch({ brandText: e.target.value })}
            placeholder="MPL Season 15 · Presented by …"
            maxLength={60}
          />
        </Field>
        <Field label="Logo branding" hint="https://… atau unggah gambar (png/jpg/webp/gif)">
          <div className="flex gap-1.5">
            <TextInput
              value={brandLogoUrl}
              onChange={(e) => setBrandLogoUrl(e.target.value)}
              placeholder="https://cdn.example/sponsor.png"
            />
            <Btn size="sm" onClick={() => patch({ brandLogo: brandLogoUrl.trim() || null })}>
              Pakai
            </Btn>
            <label className={cx('btn btn-sm cursor-pointer', busy && 'opacity-60')}>
              {busy ? '…' : 'Unggah'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={onBrandFile}
                disabled={busy}
              />
            </label>
          </div>
        </Field>
        <p className="text-[10.5px] leading-snug text-ink-400">
          Branding hanya tampil bila sakelar di atas aktif dan minimal satu dari teks/logo diisi.
        </p>
      </div>

      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Pengumuman (lower third)</span>
        <div className="flex flex-wrap gap-1.5">
          <Btn size="sm" onClick={() => send('announce', { type: 'mvp', text: `MVP: ${state.score.mvpPlayer || '—'}` })}>
            Umumkan MVP
          </Btn>
          <Btn size="sm" onClick={() => send('announce', { type: 'winner', text: winnerText(state) })}>
            Umumkan pemenang
          </Btn>
          <Btn size="sm" variant="ghost" onClick={() => send('announce', { type: null })}>
            Sembunyikan
          </Btn>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 border-t border-ink-700 pt-2">
        <a className="btn btn-sm justify-center" href="/overlay/draft" target="_blank" rel="noreferrer">
          Buka draft overlay
        </a>
        <a className="btn btn-sm justify-center" href="/overlay/score" target="_blank" rel="noreferrer">
          Buka scoreboard
        </a>
      </div>
      <p className="text-[10.5px] leading-snug text-ink-400">
        Untuk OBS: tambahkan Browser Source 1920×1080 dengan URL di atas, background transparan.
      </p>
    </Panel>
  );
}

/* -------------------------------------------------------- panel pertandingan */

export function MatchManagerPanel({ state }) {
  const [matches, setMatches] = useState([]);
  const [name, setName] = useState(state.matchName || '');

  const refresh = async () => {
    try {
      const res = await fetch('/api/matches');
      const data = await res.json();
      setMatches(data.matches || []);
    } catch {
      /* diabaikan */
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    const n = (name || '').trim();
    if (!n) return store.notice('Nama match wajib diisi.', 'error');
    const res = await request('match:save', { name: n });
    if (!res.ok) return store.notice(res.error, 'error');
    store.notice(`Disimpan: ${n}`, 'info');
    refresh();
  };

  const load = async (id, label) => {
    if (!window.confirm(`Muat match "${label}"? State saat ini akan diganti.`)) return;
    const res = await request('match:load', { id });
    if (!res.ok) return store.notice(res.error, 'error');
    store.notice('Match dimuat.', 'info');
  };

  const del = async (id, label) => {
    if (!window.confirm(`Hapus match "${label}"? Tidak bisa dibatalkan.`)) return;
    const res = await request('match:delete', { id });
    if (!res.ok) return store.notice(res.error, 'error');
    refresh();
  };

  const newMatch = async () => {
    if (!window.confirm('Buat pertandingan baru? State saat ini akan diganti (belum tentu tersimpan).')) return;
    const res = await request('match:new');
    if (!res.ok) return store.notice(res.error, 'error');
    store.notice('Pertandingan baru dibuat.', 'info');
    setName('Pertandingan Baru');
    refresh();
  };

  return (
    <Panel title="Pertandingan" bodyClass="p-2.5 space-y-2">
      <Field label="Nama untuk disimpan">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="MPL S15 - GF Game 1" />
      </Field>
      <div className="flex gap-1.5">
        <Btn variant="primary" className="flex-1" onClick={save}>
          Simpan
        </Btn>
        <Btn className="flex-1" onClick={newMatch}>
          Baru
        </Btn>
      </div>

      <div className="thin-scroll max-h-56 space-y-1.5 overflow-y-auto border-t border-ink-700 pt-2">
        {matches.length === 0 ? (
          <p className="text-[11.5px] text-ink-400">Belum ada match tersimpan.</p>
        ) : (
          matches.map((m) => (
            <div key={m.id} className="flex items-center gap-1.5 rounded border border-ink-700 bg-ink-900 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold text-slate-100">{m.name}</div>
                <div className="truncate text-[10px] text-ink-400">
                  {m.blue} {m.blueScore}–{m.redScore} {m.red} · {fmtDate(m.savedAt)}
                </div>
              </div>
              <Btn size="sm" onClick={() => load(m.id, m.name)}>
                Muat
              </Btn>
              <ConfirmBtn size="sm" confirmText="Hapus?" onConfirm={() => del(m.id, m.name)}>
                Hapus
              </ConfirmBtn>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------ panel preset */

export function PresetPanel({ state, presets, onLoaded }) {
  const draft = state.draft;
  const [custom, setCustom] = useState(null);

  useEffect(() => {
    if (!presets) loadPresets().then(onLoaded).catch(() => {});
  }, [presets, onLoaded]);

  const applyPreset = async (id) => {
    if (draft.entries.length > 0) {
      if (!window.confirm('Mengganti preset akan mereset draft yang sedang berjalan. Lanjutkan?')) return;
    }
    const res = await request('draft:reset', { presetId: id });
    if (!res.ok) return store.notice(res.error, 'error');
    store.notice('Preset diterapkan.', 'info');
    setCustom(null);
  };

  const seq = draft.actions.map((a) => `${a.team === 'blue' ? 'B' : 'R'}${a.type === 'ban' ? 'b' : 'p'}`).join(' ');

  const toggleAction = (idx, field) => {
    setCustom((cur) => {
      const base = (cur || draft.actions.map((a) => ({ team: a.team, type: a.type }))).map((a) => ({ ...a }));
      base[idx][field] = field === 'team' ? (base[idx][field] === 'blue' ? 'red' : 'blue') : base[idx][field] === 'ban' ? 'pick' : 'ban';
      return base;
    });
  };

  const applyCustom = async () => {
    if (!custom) return;
    const res = await request('draft:preset', { actions: custom });
    if (!res.ok) return store.notice(res.error, 'error');
    store.notice('Preset kustom diterapkan.', 'info');
  };

  const actions = custom || draft.actions.map((a) => ({ team: a.team, type: a.type }));

  return (
    <Panel title="Preset Urutan Draft" bodyClass="p-2.5 space-y-2">
      <p className="text-[10.5px] leading-snug text-ink-400">
        Preset adalah konfigurasi turnamen, bukan aturan resmi MPL. Anda bebas mengubah urutannya.
      </p>

      <div className="space-y-1.5">
        {(presets?.presets || []).map((p) => (
          <button
            key={p.id}
            type="button"
            data-preset={p.id}
            onClick={() => applyPreset(p.id)}
            className={cx(
              'w-full rounded border px-2.5 py-1.5 text-left transition',
              draft.presetId === p.id
                ? 'border-gold/70 bg-gold/10'
                : 'border-ink-600 bg-ink-900 hover:border-ink-400'
            )}
          >
            <span className="block text-[12.5px] font-semibold text-slate-100">{p.name}</span>
            <span className="block text-[10.5px] text-ink-400">{p.description}</span>
          </button>
        ))}
      </div>

      <div className="border-t border-ink-700 pt-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Sunting urutan</span>
          <div className="flex gap-1.5">
            <Btn size="sm" onClick={() => setCustom(actions.map((a) => ({ ...a })))}>
              Edit
            </Btn>
            <Btn size="sm" variant="primary" disabled={!custom} onClick={applyCustom}>
              Terapkan
            </Btn>
          </div>
        </div>
        <div className="mb-1.5 rounded border border-ink-700 bg-ink-950 px-2 py-1 font-mono text-[10.5px] text-ink-300">
          {seq || '(kosong)'}
        </div>
        {custom ? (
          <div className="thin-scroll flex max-h-40 flex-wrap gap-1 overflow-y-auto">
            {custom.map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleAction(i, 'team')}
                onContextMenu={(e) => {
                  e.preventDefault();
                  toggleAction(i, 'type');
                }}
                title="Klik: ganti sisi · Klik kanan: ganti ban/pick"
                className={cx(
                  'rounded-sm border px-1.5 py-0.5 text-[10.5px] font-bold',
                  a.team === 'blue'
                    ? 'border-side-blue/50 bg-side-blue/15 text-[#9fc7ff]'
                    : 'border-side-red/50 bg-side-red/15 text-[#ffb0c1]'
                )}
              >
                {i + 1}. {a.team === 'blue' ? 'B' : 'R'}·{a.type === 'ban' ? 'ban' : 'pick'}
              </button>
            ))}
            <Btn size="sm" variant="ghost" onClick={() => setCustom([...actions, { team: 'blue', type: 'ban' }])}>
              + Tambah
            </Btn>
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => setCustom(actions.slice(0, -1))}
              disabled={actions.length <= 2}
            >
              − Hapus
            </Btn>
          </div>
        ) : null}
      </div>

      <div className="border-t border-ink-700 pt-2">
        <Toggle
          checked={!!draft.allowDuplicates}
          onChange={(v) => send('draft:allowDuplicates', { value: v })}
          label="Izinkan hero duplikat"
          description="Untuk latihan. Secara default hero yang sudah terpakai terkunci."
        />
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------- panel riwayat */

const LOG_KIND = {
  pick: { label: 'PICK', cls: 'border-side-blue/50 bg-side-blue/15 text-[#9fc7ff]' },
  ban: { label: 'BAN', cls: 'border-side-red/50 bg-side-red/15 text-[#ffb0c1]' },
  undo: { label: 'UNDO', cls: 'border-ink-500 bg-ink-800 text-ink-300' },
  reset: { label: 'RESET', cls: 'border-gold/50 bg-gold/12 text-gold' },
  preset: { label: 'PRESET', cls: 'border-ink-500 bg-ink-800 text-ink-300' },
  lock: { label: 'KUNCI', cls: 'border-ink-500 bg-ink-800 text-ink-300' },
  game: { label: 'GAME', cls: 'border-mint/50 bg-mint/12 text-mint' },
  emergency: { label: 'EMERGENCY', cls: 'border-side-red/70 bg-side-red/20 text-[#ff8fa5]' }
};

export function HistoryPanel({ state, heroesById = {} }) {
  const draft = state.draft;
  const heroes = heroesById;
  const log = [...(draft.log || [])].reverse();

  return (
    <Panel title="Riwayat Aksi" bodyClass="p-0">
      <div className="thin-scroll max-h-[260px] overflow-y-auto">
        {log.length === 0 ? (
          <p className="p-3 text-[11.5px] text-ink-400">Belum ada aksi.</p>
        ) : (
          log.map((l, i) => {
            const kind = LOG_KIND[l.kind];
            return (
              <div key={i} className="flex items-center gap-2 border-b border-ink-800 px-2.5 py-1.5 last:border-0">
                <span className="w-[52px] shrink-0 font-mono text-[10px] text-ink-500">
                  {new Date(l.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                {kind ? (
                  <span
                    data-log-kind={l.kind}
                    className={cx('shrink-0 rounded-sm border px-1 text-[9px] font-bold tracking-wider', kind.cls)}
                  >
                    {kind.label}
                  </span>
                ) : null}
                <span className="shrink-0 text-[11px] font-semibold text-ink-300">{l.text}</span>
                {l.heroId && (
                  <span className="truncate font-display text-[13px] tracking-wide text-white">
                    {heroes[l.heroId]?.name || l.heroId}
                  </span>
                )}
                {l.team ? (
                  <span
                    className={cx(
                      'shrink-0 text-[9.5px] font-bold uppercase',
                      l.team === 'blue' ? 'text-[#8dbaff]' : 'text-[#ff9db1]'
                    )}
                  >
                    {l.team}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}
