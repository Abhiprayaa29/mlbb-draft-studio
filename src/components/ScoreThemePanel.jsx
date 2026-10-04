import React, { useEffect, useMemo, useState } from 'react';
import { Panel, Btn, Field, TextInput, Toggle } from './ui.jsx';
import ScorePreview, { SaveBadge } from './ScorePreview.jsx';
import TeamLogo from './TeamLogo.jsx';
import { request } from '../lib/socket.js';
import { store } from '../lib/store.js';
import { assertLogoFile, readAsDataUrl, uploadLogo } from '../lib/assets.js';
import {
  BUILTIN_PRESETS,
  COLOR_KEYS,
  COLOR_LABELS,
  PALETTE,
  VISIBILITY_KEYS,
  applyPreset,
  defaultTheme,
  isSponsorUrl,
  sanitizeTheme
} from '../../shared/theme.js';

/**
 * src/components/ScoreThemePanel.jsx
 * ---------------------------------------------------------------------------
 * Studio konfigurasi scoreboard: warna, preset, frame, logo, sponsor, caster,
 * visibilitas, ukuran/posisi logo & teks — semuanya LIVE preview.
 *
 * Prinsip:
 *   - Perubahan disimpan sebagai DRAFT lokal; overlay OBS baru berubah setelah
 *     tombol Simpan (event `overlay:update` yang sudah ada — tanpa event baru).
 *   - Konfigurasi desain tidak pernah mengubah skor (hanya `overlay`), dan
 *     perubahan skor tidak mengubah tema.
 *   - Data pertandingan (turnamen/babak/game) ditulis langsung lewat
 *     `meta:update` — terpisah dari draft tema.
 * ---------------------------------------------------------------------------
 */

const PALETTE_ENTRIES = Object.entries(PALETTE);
const HEX6 = /^#[0-9a-fA-F]{6}$/;

function PaletteDots({ onPick }) {
  return (
    <span className="flex gap-1">
      {PALETTE_ENTRIES.map(([key, hex]) => (
        <button
          key={key}
          type="button"
          title={`${key} ${hex}`}
          onClick={() => onPick(hex)}
          className="h-4 w-4 rounded-sm border border-ink-600 transition hover:scale-110"
          style={{ background: hex }}
        />
      ))}
    </span>
  );
}

function ColorRow({ label, value, onChange }) {
  const [raw, setRaw] = useState(value);
  useEffect(() => setRaw(value), [value]);
  const valid = HEX6.test(raw);

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-[104px] shrink-0 text-[10.5px] leading-tight text-ink-300">{label}</span>
      <input
        type="color"
        aria-label={label}
        value={HEX6.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-6 w-7 shrink-0 cursor-pointer rounded border border-ink-600 bg-transparent p-0"
      />
      <TextInput
        aria-label={`${label} hex`}
        className="h-6 w-[74px] px-1.5 text-[11px] font-mono uppercase"
        value={raw}
        onChange={(e) => {
          const v = e.target.value;
          setRaw(v);
          if (HEX6.test(v)) onChange(v.toUpperCase());
        }}
        onBlur={() => setRaw(value)}
        spellCheck={false}
      />
      <span className="ml-auto">
        <PaletteDots onPick={onChange} />
      </span>
      {valid ? null : <span className="w-0" />}
    </div>
  );
}

function SliderRow({ label, value, min, max, step = 1, suffix = '', onChange }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[10.5px] text-ink-300">{label}</span>
        <span className="text-[10.5px] font-semibold text-gold">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#f5c451]"
      />
    </div>
  );
}

function LogoThumb({ src, label = 'Logo', size = 44 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const ok = src && !failed;
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden border border-ink-600 bg-ink-950"
      style={{ width: size, height: size }}
      title={label}
    >
      {ok ? (
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain" />
      ) : (
        <span className="text-[9px] uppercase tracking-wider text-ink-500">kosong</span>
      )}
    </div>
  );
}

export default function ScoreThemePanel({ state, heroesById = {}, meta = null }) {
  const serverTheme = state.overlay?.theme || defaultTheme();
  const serverLogo = state.overlay?.brandLogo || '';

  const [draft, setDraft] = useState(() => sanitizeTheme(serverTheme));
  const [logo, setLogo] = useState(serverLogo);
  const [saving, setSaving] = useState(false);
  const [errored, setErrored] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [sponsorUrl, setSponsorUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState(serverLogo || '');

  const serverKey = JSON.stringify(serverTheme);
  const draftKey = JSON.stringify(draft);
  const dirty = draftKey !== serverKey || logo !== serverLogo;

  // bila server mengubah konfigurasi (mis. match dimuat / operator lain)
  // dan tidak ada draft lokal, ikuti perubahan server.
  useEffect(() => {
    if (draftKey === JSON.stringify(sanitizeTheme(serverTheme))) return;
    setDraft(sanitizeTheme(serverTheme));
  }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLogoUrl(logo || '');
  }, [logo]);

  const status = saving ? 'saving' : errored ? 'error' : dirty ? 'dirty' : 'clean';

  const patchDraft = (patch) => {
    setDraft((d) => sanitizeTheme({ ...d, ...patch }));
    setErrored(false);
  };
  const setColor = (key, value) => {
    setDraft((d) => sanitizeTheme({ ...d, colors: { ...d.colors, [key]: value.toUpperCase() } }));
    setErrored(false);
  };

  const previewState = useMemo(
    () => ({
      ...state,
      overlay: { ...state.overlay, theme: draft, brandLogo: logo || null }
    }),
    [state, draft, logo]
  );

  async function save() {
    setSaving(true);
    setErrored(false);
    const res = await request('overlay:update', { patch: { theme: draft, brandLogo: logo || null } });
    setSaving(false);
    if (!res.ok) {
      setErrored(true);
      store.notice(res.error || 'Gagal menyimpan konfigurasi tema.', 'error');
      return;
    }
    setDraft(sanitizeTheme(res.state.overlay.theme));
    setLogo(res.state.overlay.brandLogo || '');
    store.notice('Konfigurasi scoreboard disimpan & disiarkan ke overlay.', 'info');
  }

  function cancel() {
    setDraft(sanitizeTheme(serverTheme));
    setLogo(serverLogo);
    setErrored(false);
    store.notice('Perubahan dibatalkan.', 'info');
  }

  function restoreDefault() {
    setDraft(sanitizeTheme(defaultTheme()));
    setErrored(false);
    store.notice('Tema dikembalikan ke default (belum disimpan).', 'info');
  }

  function resetToPreset() {
    setDraft((d) => applyPreset(d, d.presetId));
    setErrored(false);
    store.notice(`Tema direset ke preset ${draft.presetId}.`, 'info');
  }

  function saveAsPreset() {
    const name = presetName.trim();
    if (!name) return store.notice('Isi nama preset baru.', 'warn');
    const id = `custom-${Date.now().toString(36)}`;
    const presets = [...draft.presets, { id, name, colors: { ...draft.colors } }].slice(-12);
    setDraft((d) => sanitizeTheme({ ...d, presets, presetId: id }));
    setPresetName('');
    store.notice(`Preset "${name}" dibuat (belum disimpan).`, 'info');
  }

  function removePreset(id) {
    setDraft((d) => sanitizeTheme({ ...d, presets: d.presets.filter((p) => p.id !== id) }));
  }

  async function onTournamentFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      assertLogoFile(file);
      const dataUrl = await readAsDataUrl(file);
      const url = await uploadLogo(dataUrl);
      setLogo(url);
      setErrored(false);
      store.notice('Logo turnamen diunggah (tekan Simpan untuk menerapkan).', 'info');
    } catch (err) {
      store.notice(err.message, 'error');
    }
  }

  async function onSponsorFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      assertLogoFile(file);
      const dataUrl = await readAsDataUrl(file);
      const url = await uploadLogo(dataUrl);
      patchDraft({ sponsors: [...draft.sponsors, url] });
      store.notice('Logo sponsor ditambahkan (tekan Simpan).', 'info');
    } catch (err) {
      store.notice(err.message, 'error');
    }
  }

  function addSponsor() {
    const url = sponsorUrl.trim();
    if (!isSponsorUrl(url)) return store.notice('URL sponsor tidak valid (http/https, data:image, atau /assets/...).', 'error');
    patchDraft({ sponsors: [...draft.sponsors, url] });
    setSponsorUrl('');
  }

  function setMetaField(key, value) {
    request('meta:update', { patch: { [key]: value } }).then((res) => {
      if (!res.ok) store.notice(res.error, 'error');
    });
  }

  const allPresets = [
    ...BUILTIN_PRESETS.map((p) => ({ id: p.id, name: p.name })),
    ...draft.presets.map((p) => ({ id: p.id, name: p.name, custom: true }))
  ];

  return (
    <Panel
      title="Tema Scoreboard"
      right={<SaveBadge status={status} />}
      bodyClass="p-2.5 space-y-2.5"
    >
      {/* ---------------------------------------------------- preview + aksi */}
      <ScorePreview state={previewState} heroesById={heroesById} meta={meta} width={294} />

      <div className="grid grid-cols-2 gap-1.5">
        <Btn variant="primary" data-testid="theme-save" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </Btn>
        <Btn data-testid="theme-cancel" onClick={cancel} disabled={!dirty}>
          Batal
        </Btn>
        <Btn size="sm" variant="ghost" onClick={resetToPreset}>
          Reset ke preset
        </Btn>
        <Btn size="sm" variant="ghost" onClick={restoreDefault}>
          Kembalikan default
        </Btn>
      </div>

      {/* ---------------------------------------------------------- preset */}
      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Preset tema</span>
        <Field label="Pilih preset (semua tetap bisa diedit)">
          <select
            className="inp"
            data-testid="theme-preset-select"
            value={draft.presetId}
            onChange={(e) => setDraft((d) => applyPreset(d, e.target.value))}
          >
            {allPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.custom ? ' (kustom)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-1.5">
          <TextInput
            placeholder="Nama preset baru…"
            value={presetName}
            maxLength={32}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <Btn size="sm" onClick={saveAsPreset}>
            Simpan preset
          </Btn>
        </div>
        {draft.presets.length ? (
          <div className="flex flex-wrap gap-1">
            {draft.presets.map((p) => (
              <span key={p.id} className="flex items-center gap-1 rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[10px] text-ink-300">
                {p.name}
                <button type="button" className="text-[#ff8fa5]" title="Hapus preset" onClick={() => removePreset(p.id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* ----------------------------------------------------------- warna */}
      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Warna</span>
        <div className="space-y-1">
          {COLOR_KEYS.map((k) => (
            <ColorRow key={k} label={COLOR_LABELS[k]} value={draft.colors[k]} onChange={(v) => setColor(k, v)} />
          ))}
        </div>
      </div>

      {/* ------------------------------------------------- frame & dekorasi */}
      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Frame & dekorasi</span>
        <SliderRow label="Ketebalan border" value={draft.frame.borderPx} min={1} max={16} suffix="px" onChange={(v) => patchDraft({ frame: { ...draft.frame, borderPx: v } })} />
        <SliderRow label="Intensitas/ukuran dekorasi" value={draft.frame.deco} min={0} max={100} suffix="%" onChange={(v) => patchDraft({ frame: { ...draft.frame, deco: v } })} />
      </div>

      {/* -------------------------------------------------------------- teks */}
      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Teks</span>
        <SliderRow label="Ukuran teks" value={draft.text.scale} min={0.8} max={1.4} step={0.05} suffix="×" onChange={(v) => patchDraft({ text: { ...draft.text, scale: v } })} />
        <Toggle checked={draft.text.uppercase} onChange={(v) => patchDraft({ text: { ...draft.text, uppercase: v } })} label="Teks huruf kapital" />
        <Field label="Nama caster / presenter">
          <TextInput data-testid="theme-caster" value={draft.caster} maxLength={48} placeholder="Snowbee & Cherie" onChange={(e) => patchDraft({ caster: e.target.value })} />
        </Field>
        <Field label="Teks informasi pertandingan" hint="Muncul di bawah nama turnamen pada header.">
          <TextInput data-testid="theme-info" value={draft.info} maxLength={80} placeholder="Group Stage · Best of 3" onChange={(e) => patchDraft({ info: e.target.value })} />
        </Field>
      </div>

      {/* -------------------------------------------------------------- logo */}
      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Logo</span>

        <div className="flex items-center gap-2">
          <LogoThumb src={logo} label="Logo turnamen" />
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-semibold text-ink-300">Logo turnamen</div>
            <div className="flex gap-1">
              <TextInput className="h-6 px-1.5 text-[11px]" value={logoUrl} placeholder="https://… atau /assets/…" onChange={(e) => setLogoUrl(e.target.value)} />
              <Btn size="sm" onClick={() => (isSponsorUrl(logoUrl.trim()) ? setLogo(logoUrl.trim()) : store.notice('URL logo tidak valid.', 'error'))}>
                Pakai
              </Btn>
            </div>
          </div>
        </div>
        <div className="flex gap-1.5">
          <label className="btn btn-sm flex-1 cursor-pointer justify-center">
            Unggah logo turnamen
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onTournamentFile} />
          </label>
          <Btn size="sm" variant="ghost" onClick={() => setLogo('')} disabled={!logo}>
            Hapus
          </Btn>
        </div>

        <div className="flex items-center justify-between gap-1.5 pt-1">
          <span className="text-[10.5px] text-ink-300">Logo tim (kiri & kanan)</span>
          <span className="flex items-center gap-1">
            <TeamLogo src={state.teams.blue.logo} side="blue" label={state.teams.blue.name} className="h-7 w-7" style={{ fontSize: 9 }} />
            <TeamLogo src={state.teams.red.logo} side="red" label={state.teams.red.name} className="h-7 w-7" style={{ fontSize: 9 }} />
            <span className="text-[10px] text-ink-400">→ tab Tim</span>
          </span>
        </div>

        <SliderRow label="Ukuran logo tim" value={draft.logo.teamScale} min={0.5} max={2} step={0.05} suffix="×" onChange={(v) => patchDraft({ logo: { ...draft.logo, teamScale: v } })} />
        <SliderRow label="Ukuran logo turnamen" value={draft.logo.tournamentScale} min={0.4} max={2} step={0.05} suffix="×" onChange={(v) => patchDraft({ logo: { ...draft.logo, tournamentScale: v } })} />
        <SliderRow label="Posisi X logo turnamen" value={draft.logo.tournamentX} min={-420} max={420} suffix="px" onChange={(v) => patchDraft({ logo: { ...draft.logo, tournamentX: v } })} />
        <SliderRow label="Posisi Y logo turnamen" value={draft.logo.tournamentY} min={-90} max={90} suffix="px" onChange={(v) => patchDraft({ logo: { ...draft.logo, tournamentY: v } })} />
        <SliderRow label="Ukuran logo sponsor" value={draft.logo.sponsorScale} min={0.5} max={2} step={0.05} suffix="×" onChange={(v) => patchDraft({ logo: { ...draft.logo, sponsorScale: v } })} />
      </div>

      {/* ----------------------------------------------------------- sponsor */}
      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Sponsor (maks 6)</span>
        <div className="flex gap-1.5">
          <TextInput value={sponsorUrl} placeholder="https://cdn.example/logo.png" onChange={(e) => setSponsorUrl(e.target.value)} />
          <Btn size="sm" onClick={addSponsor}>
            Tambah
          </Btn>
        </div>
        <label className="btn btn-sm w-full cursor-pointer justify-center">
          Unggah logo sponsor
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onSponsorFile} />
        </label>
        {draft.sponsors.length ? (
          <div className="space-y-1">
            {draft.sponsors.map((url, i) => (
              <div key={`${url}-${i}`} className="flex items-center gap-1.5 rounded border border-ink-700 bg-ink-900/60 px-1.5 py-1">
                <LogoThumb src={url} label={`Sponsor ${i + 1}`} size={34} />
                <span className="min-w-0 flex-1 truncate text-[10px] text-ink-400">{url}</span>
                <Btn size="sm" variant="ghost" onClick={() => patchDraft({ sponsors: draft.sponsors.filter((_, x) => x !== i) })}>
                  Hapus
                </Btn>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10.5px] text-ink-400">Belum ada sponsor — slot kanan atas dibiarkan kosong.</p>
        )}
      </div>

      {/* -------------------------------------------------------- visibilitas */}
      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Visibilitas elemen</span>
        <div className="grid grid-cols-2 gap-1">
          {VISIBILITY_KEYS.map((k) => (
            <Toggle
              key={k}
              checked={!!draft.visible[k]}
              onChange={(v) => patchDraft({ visible: { ...draft.visible, [k]: v } })}
              label={VIS_LABEL[k] || k}
            />
          ))}
        </div>
      </div>

      {/* ----------------------------------------------- data pertandingan */}
      <div className="space-y-1.5 border-t border-ink-700 pt-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Info siaran (langsung tersimpan)</span>
        <p className="text-[10px] leading-snug text-ink-400">
          Bagian ini adalah data pertandingan (bukan tema) — langsung dikirim ke server, tidak ikut Simpan/Batal di atas.
        </p>
        <Field label="Nama turnamen">
          <TextInput data-testid="theme-tournament" value={state.meta.tournament} maxLength={60} onChange={(e) => setMetaField('tournament', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-1.5">
          <Field label="Babak / grup">
            <TextInput value={state.meta.stage} maxLength={40} placeholder="Group A" onChange={(e) => setMetaField('stage', e.target.value)} />
          </Field>
          <Field label="Seri">
            <TextInput value={state.meta.round} maxLength={40} placeholder="Upper Final" onChange={(e) => setMetaField('round', e.target.value)} />
          </Field>
          <Field label="Game ke-">
            <TextInput
              type="number"
              min={1}
              max={9}
              value={state.meta.gameNumber}
              onChange={(e) => setMetaField('gameNumber', Math.max(1, Math.min(9, Number(e.target.value) || 1)))}
            />
          </Field>
          <Field label="Best of">
            <TextInput
              type="number"
              min={1}
              max={9}
              value={state.meta.bestOf}
              onChange={(e) => setMetaField('bestOf', Math.max(1, Math.min(9, Number(e.target.value) || 1)))}
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-ink-700 pt-2">
        <SaveBadge status={status} />
        <Btn variant="primary" size="sm" data-testid="theme-save-bottom" onClick={save} disabled={saving || !dirty}>
          Simpan konfigurasi
        </Btn>
      </div>
    </Panel>
  );
}

const VIS_LABEL = {
  header: 'Header turnamen',
  frame: 'Frame dekoratif',
  tournamentLogo: 'Logo turnamen',
  teamLogos: 'Logo tim',
  sponsors: 'Sponsor',
  caster: 'Nama caster',
  info: 'Teks info',
  score: 'Scoreboard',
  stats: 'Statistik',
  lineup: 'Lineup hero',
  timer: 'Waktu & status',
  mvp: 'MVP',
  winner: 'Pemenang'
};
