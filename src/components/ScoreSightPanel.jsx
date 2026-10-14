import React, { useCallback, useEffect, useState } from 'react';
import { cx, useStore } from '../lib/utils.js';
import { request } from '../lib/socket.js';
import { store, getOperatorToken } from '../lib/store.js';
import { Btn, Field, Toggle } from './ui.jsx';

function timeLabel(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const SS_STATUS_LABEL = {
  disabled: 'Nonaktif',
  stopped: 'Berhenti',
  invalid_dir: 'Direktori tidak valid',
  MAPPING_REQUIRED: 'Mapping diperlukan',
  running: 'Berjalan',
  error: 'Gagal'
};

const SS_STATUS_CLS = {
  disabled: 'border-ink-600 bg-ink-900 text-ink-300',
  stopped: 'border-ink-600 bg-ink-900 text-ink-300',
  invalid_dir: 'border-side-red/60 bg-side-red/15 text-[#ff9db1]',
  MAPPING_REQUIRED: 'border-gold/60 bg-gold/10 text-gold',
  running: 'border-mint/50 bg-mint/10 text-mint',
  error: 'border-side-red/60 bg-side-red/15 text-[#ff9db1]'
};

/**
 * Panel ScoreSight File Input.
 * - Toggle enable + mapping Home→Blue/Red via scoresight:update.
 * - Start/Stop/Refresh polling file.
 * - Status direktori, file allowlist, last read/change/apply, error.
 * - Nilai skor TIDAK diduplikasi di sini — hanya status bridge.
 */
export default function ScoreSightPanel({ state }) {
  const snap = useStore();
  const ss = snap.scoresightStatus;
  const it = state?.integration || {};
  const ssState = it.scoresight || {};
  const [busy, setBusy] = useState(false);

  const update = useCallback(async (patch, action) => {
    setBusy(true);
    try {
      const res = await request('scoresight:update', { patch, action });
      if (!res.ok) store.notice(res.error || 'Gagal memperbarui ScoreSight.', 'error');
      else if (action === 'start') store.notice('ScoreSight bridge dimulai.', 'info');
      else if (action === 'stop') store.notice('ScoreSight bridge dihentikan.', 'info');
      return res;
    } finally {
      setBusy(false);
    }
  }, []);

  const status = ss?.status || 'disabled';
  const files = ss?.files || [];
  const foundCount = files.filter((f) => f.found).length;
  const running = !!ss?.running;

  return (
    <div className="space-y-2" data-testid="scoresight-panel">
      {/* status utama */}
      <div className="flex items-center gap-2 rounded border border-ink-700 bg-ink-900 px-2.5 py-2">
        <span className={cx('rounded border px-2 py-1 text-[11px] font-bold', SS_STATUS_CLS[status] || SS_STATUS_CLS.disabled)} data-testid="ss-status">
          {SS_STATUS_LABEL[status] || status}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-300" data-testid="ss-dir-status">
          Direktori: {ss?.dirOk ? 'OK' : ss?.dirConfigured ? 'Tidak valid' : 'Belum diisi'}
        </span>
      </div>

      {/* mapping Home/Away */}
      <Field
        label="Home → Blue/Red"
        hint={
          ssState.homeSide === 'blue'
            ? 'Home = Blue, Away = Red.'
            : ssState.homeSide === 'red'
              ? 'Home = Red, Away = Blue.'
              : 'Pilih sisi Home — patch ditahan sampai mapping diisi.'
        }
      >
        <select
          className="inp"
          value={ssState.homeSide || ''}
          data-testid="ss-home-side"
          disabled={busy}
          onChange={(e) => update({ homeSide: e.target.value || null })}
        >
          <option value="">— Pilih —</option>
          <option value="blue">Home → Blue</option>
          <option value="red">Home → Red</option>
        </select>
      </Field>

      {/* enable toggle */}
      <div className="flex items-center justify-between gap-2 rounded border border-ink-700 bg-ink-950/40 px-2.5 py-2">
        <span className="text-[12px] text-ink-200">Aktifkan file bridge</span>
        <Toggle
          checked={!!ssState.enabled}
          data-testid="ss-enabled"
          disabled={busy}
          onChange={(v) => update({ enabled: v })}
        />
      </div>

      {/* kontrol */}
      <div className="flex flex-wrap gap-1.5">
        <Btn
          size="sm"
          variant="primary"
          data-testid="ss-start"
          disabled={busy || running || !ssState.enabled || !ss?.dirOk}
          onClick={() => update({}, 'start')}
        >
          Mulai
        </Btn>
        <Btn
          size="sm"
          data-testid="ss-stop"
          disabled={busy || !running}
          onClick={() => update({}, 'stop')}
        >
          Berhenti
        </Btn>
        <Btn size="sm" variant="ghost" data-testid="ss-refresh" disabled={busy} onClick={() => update({}, 'refresh')}>
          Muat ulang
        </Btn>
      </div>

      {/* sumber skor aktif */}
      <div className="flex flex-wrap gap-1.5 text-[10.5px]">
        <span className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-ink-300" data-testid="ss-score-source">
          Sumber skor: <span className="text-gold">{it.scoreSource || 'manual'}</span>
        </span>
        <span className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-ink-300" data-testid="ss-score-input">
          Tulis skor: <span className="text-gold">{it.scoreInput || 'manual-only'}</span>
        </span>
        <span className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-ink-300" data-testid="ss-datasource">
          Sumber data: <span className="text-gold">{it.dataSource || 'manual'}</span>
        </span>
      </div>

      {/* file allowlist */}
      {files.length ? (
        <div className="space-y-1">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-400">
            File output ({foundCount}/{files.length} ditemukan)
          </div>
          <div className="grid grid-cols-1 gap-0.5" data-testid="ss-files">
            {files.map((f) => (
              <div key={f.name} className="flex items-center gap-2 text-[11px]">
                <span
                  className={cx(
                    'inline-block h-2 w-2 rounded-full',
                    f.found && !f.stale ? 'bg-mint' : f.stale ? 'bg-gold' : f.error === 'not_found' ? 'bg-ink-600' : 'bg-side-red'
                  )}
                />
                <span className="w-36 shrink-0 font-mono text-ink-300">{f.name}</span>
                <span className="text-ink-400">
                  {f.found && !f.stale ? 'OK' : f.stale ? 'Malformed' : f.error || 'Tidak ditemukan'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* timeline */}
      <div className="flex flex-wrap gap-1.5 text-[10.5px]">
        <span className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-ink-300" data-testid="ss-last-read">
          Baca: <span className="text-ink-200">{timeLabel(ss?.lastReadAt)}</span>
        </span>
        <span className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-ink-300" data-testid="ss-last-change">
          Ubah: <span className="text-ink-200">{timeLabel(ss?.lastChangeAt)}</span>
        </span>
        <span className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-ink-300" data-testid="ss-last-apply">
          Apply: <span className="text-ink-200">{timeLabel(ss?.lastApplyAt)}</span>
        </span>
      </div>

      {/* nilai terakhir (diagnostik — bukan input skor) */}
      {ss?.values && Object.keys(ss.values).length ? (
        <div className="rounded border border-ink-700 bg-ink-950/40 px-2.5 py-2">
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-400">Nilai terbaca</div>
          <div className="font-mono text-[11px] text-ink-200" data-testid="ss-values">
            {Object.entries(ss.values)
              .map(([k, v]) => `${k}=${v}`)
              .join(' · ')}
          </div>
          {ss?.timeDiagnostic ? (
            <div className="mt-1 text-[10.5px] text-ink-400" data-testid="ss-time-diag">
              Time (diagnostik saja, tidak diterapkan): {ss.timeDiagnostic}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* error */}
      {ss?.lastError ? (
        <div className="rounded border border-side-red/60 bg-side-red/15 px-2.5 py-2 text-[11.5px] text-[#ff9db1]" data-testid="ss-error">
          {ss.lastError}
        </div>
      ) : null}

      {/* catatan konfigurasi */}
      {!ss?.dirConfigured ? (
        <p className="text-[10.5px] leading-relaxed text-ink-400" data-testid="ss-help">
          Isi <code className="text-gold">SCORESIGHT_DIR</code> di file <code className="text-gold">.env</code> server
          dengan path folder output ScoreSight. Di Linux, path Windows (C:\...) tidak valid — gunakan shared folder
          yang ter-mount (mis. /mnt/scoresight) atau jalankan backend di mesin yang sama. Restart server setelah mengubah .env.
        </p>
      ) : null}
      <p className="text-[10.5px] leading-relaxed text-ink-400">
        ScoreSight hanya membaca 9 file yang diizinkan. Nilai Time hanya untuk diagnostik — timer overlay tidak
        dibuat dari ScoreSight. Untuk menulis skor, set <span className="text-gold">scoreInput=external</span> dan{' '}
        <span className="text-gold">dataSource=scoresight-files</span> di panel GRID.
      </p>
    </div>
  );
}
