/**
 * src/components/SponsorManagement.jsx
 * ---------------------------------------------------------------------------
 * Manajemen sponsor unggahan lokal (Control Panel).
 *
 * Operator memilih / drag-and-drop banyak gambar (PNG/JPG/WebP, maks 5 MB);
 * file dikirim sebagai multipart ke POST /api/sponsors — server yang menyimpan
 * file fisik + metadata persisten (state.sponsors). Overlay scoreboard ikut
 * terupdate otomatis lewat Socket.IO tanpa reload.
 *
 * objectURL hanya dipakai sebagai preview sementara saat unggahan berjalan —
 * bukan penyimpanan permanen (URL dicabut setelah upload selesai).
 */
import React, { useRef, useState } from 'react';
import { Btn, ConfirmBtn } from './ui.jsx';
import { store } from '../lib/store.js';
import { assertSponsorFile, uploadSponsorFiles, deleteSponsor, reorderSponsors } from '../lib/assets.js';

const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_FILES = 5; // batas file per permintaan (server juga membatasi)
const MAX_TOTAL = 6; // sinkron dengan LIMITS.maxSponsors di shared/theme.js

export default function SponsorManagement({ sponsors = [] }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState([]); // preview "sebelum" upload selesai
  const [errors, setErrors] = useState([]);

  const full = sponsors.length >= MAX_TOTAL;

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (busy) {
      store.notice('Masih ada unggahan yang diproses.', 'warn');
      return;
    }
    const accepted = [];
    const localErrors = [];
    for (const f of files) {
      try {
        assertSponsorFile(f);
        accepted.push(f);
      } catch (e) {
        localErrors.push(`${f.name}: ${e.message}`);
      }
    }
    if (!accepted.length) {
      setErrors(localErrors);
      if (localErrors.length) store.notice(localErrors[0], 'error');
      return;
    }
    if (sponsors.length + accepted.length > MAX_TOTAL) {
      setErrors([...localErrors, `Sponsor maksimal ${MAX_TOTAL}.`]);
      store.notice(`Sponsor maksimal ${MAX_TOTAL}.`, 'error');
      return;
    }
    setErrors(localErrors);

    const previews = accepted.map((f) => ({
      key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`,
      name: f.name,
      url: URL.createObjectURL(f)
    }));
    setPending(previews);
    setBusy(true);
    try {
      const res = await uploadSponsorFiles(accepted);
      store.notice(`${res.added} logo sponsor diunggah & disiarkan ke overlay.`, 'info');
      if (res.errors?.length) setErrors((e) => [...e, ...res.errors]);
    } catch (err) {
      setErrors((e) => [...e, err.message]);
      store.notice(err.message, 'error');
    } finally {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
      setPending([]);
      setBusy(false);
    }
  }

  async function move(index, dir) {
    const j = index + dir;
    if (j < 0 || j >= sponsors.length) return;
    const ids = sponsors.map((s) => s.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      await reorderSponsors(ids);
    } catch (err) {
      store.notice(err.message, 'error');
    }
  }

  async function remove(id) {
    try {
      await deleteSponsor(id);
      store.notice('Sponsor dihapus (file ikut dibersihkan di server).', 'info');
    } catch (err) {
      store.notice(err.message, 'error');
    }
  }

  return (
    <div className="space-y-1.5 border-t border-ink-700 pt-2" data-testid="sponsor-management">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Sponsor Management (maks {MAX_TOTAL})</span>
      <p className="text-[10px] leading-snug text-ink-400">
        Pilih banyak gambar PNG/JPG/WebP (maks 5 MB per file) — tersimpan di server dan tampil otomatis di scoreboard.
      </p>

      <div
        data-testid="sponsor-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFiles(e.dataTransfer?.files);
        }}
        className={`flex flex-col items-center justify-center gap-1.5 rounded border border-dashed px-2 py-3 text-center transition-colors ${
          drag ? 'border-sky-400/80 bg-sky-400/10' : 'border-ink-600 bg-ink-900/40'
        }`}
      >
        <span className="text-[10.5px] text-ink-300">Tarik file gambar ke sini, atau</span>
        <label className={`btn btn-sm cursor-pointer justify-center ${full || busy ? 'pointer-events-none opacity-50' : ''}`}>
          Upload Logo Sponsor
          <input
            ref={inputRef}
            data-testid="sponsor-input"
            type="file"
            accept={ACCEPT}
            multiple
            disabled={full || busy}
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              e.target.value = '';
              handleFiles(files);
            }}
          />
        </label>
      </div>

      {busy && (
        <p className="text-[10px] text-sky-300" data-testid="sponsor-busy">
          Mengunggah… jangan tutup panel ini.
        </p>
      )}
      {pending.map((p) => (
        <div key={p.key} className="flex items-center gap-1.5 rounded border border-ink-700 bg-ink-900/60 px-1.5 py-1" data-testid="sponsor-pending">
          <img src={p.url} alt="" className="h-8 w-8 rounded object-contain" />
          <span className="min-w-0 flex-1 truncate text-[10px] text-ink-400">{p.name}</span>
          <span className="text-[9px] text-sky-300">mengunggah…</span>
        </div>
      ))}
      {errors.length > 0 && (
        <ul className="space-y-0.5 text-[10px] text-red-400" data-testid="sponsor-errors">
          {errors.slice(-4).map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      {sponsors.length ? (
        <div className="space-y-1" data-testid="sponsor-list">
          {sponsors.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5 rounded border border-ink-700 bg-ink-900/60 px-1.5 py-1" data-testid="sponsor-item" data-sponsor-id={s.id}>
              <span className="w-4 text-center text-[9px] font-bold text-ink-500">{i + 1}</span>
              <img src={s.url} alt="" className="h-8 w-8 rounded bg-ink-950 object-contain" />
              <span className="min-w-0 flex-1 truncate text-[10px] text-ink-400" title={s.url}>
                {s.name}
              </span>
              <Btn size="sm" variant="ghost" title="Naik" aria-label="Naik" disabled={i === 0 || busy} onClick={() => move(i, -1)}>
                ↑
              </Btn>
              <Btn size="sm" variant="ghost" title="Turun" aria-label="Turun" disabled={i === sponsors.length - 1 || busy} onClick={() => move(i, 1)}>
                ↓
              </Btn>
              <ConfirmBtn size="sm" confirmText="Hapus?" onConfirm={() => remove(s.id)}>
                Hapus
              </ConfirmBtn>
            </div>
          ))}
        </div>
      ) : (
        !busy &&
        !pending.length && (
          <p className="text-[10.5px] text-ink-400" data-testid="sponsor-empty">
            Belum ada sponsor — logo tampil di pojok kanan atas scoreboard bila tersedia.
          </p>
        )
      )}
    </div>
  );
}
