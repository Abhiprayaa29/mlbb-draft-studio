import React, { useCallback, useEffect, useState } from 'react';
import { cx, useStore } from '../lib/utils.js';
import { request } from '../lib/socket.js';
import { store, getOperatorToken } from '../lib/store.js';
import { Btn, Field } from './ui.jsx';

const STATUS_LABEL = {
  disabled: 'Nonaktif',
  disconnected: 'Terputus',
  connecting: 'Menghubungkan',
  connected: 'Tersambung',
  degraded: 'Degraded',
  reconnecting: 'Sambung ulang',
  error: 'Gagal'
};

const STATUS_CLS = {
  disabled: 'border-ink-600 bg-ink-900 text-ink-300',
  disconnected: 'border-ink-600 bg-ink-900 text-ink-300',
  connecting: 'border-gold/60 bg-gold/10 text-gold',
  connected: 'border-mint/50 bg-mint/10 text-mint',
  degraded: 'border-gold/60 bg-gold/10 text-gold',
  reconnecting: 'border-gold/60 bg-gold/10 text-gold',
  error: 'border-side-red/60 bg-side-red/15 text-[#ff9db1]'
};

function timeLabel(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Panel GRID DATA SOURCE.
 *
 * - Mengubah sumber data & mode otomasi lewat `integration:update` (operator).
 * - Menampilkan status koneksi (event `integration:status`, transien).
 * - Mode semi: daftar pengajuan [Aktifkan] / [Tolak].
 * - TIDAK PERNAH menampilkan API key — credential hanya via environment server.
 */
export default function IntegrationPanel({ state }) {
  const snap = useStore();
  const st = snap.integrationStatus;
  const it = state?.integration || {};
  const [audit, setAudit] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadAudit = useCallback(() => {
    const headers = {};
    const token = getOperatorToken();
    if (token) headers['x-operator-token'] = token;
    fetch('/api/integration', { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setAudit(j?.audit || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  const update = useCallback(async (patch, action, id) => {
    setBusy(true);
    try {
      const res = await request('integration:update', { patch, action, id });
      if (!res.ok) store.notice(res.error || 'Gagal memperbarui integrasi.', 'error');
      else if (action === 'approve' || action === 'reject') store.notice(action === 'approve' ? 'Pengajuan diterapkan.' : 'Pengajuan ditolak.', 'info');
      loadAudit();
      return res;
    } finally {
      setBusy(false);
    }
  }, [loadAudit]);

  const status = st?.status || 'disabled';
  const configured = !!st?.configured;
  const mode = it.mode || 'monitor';
  const source = it.dataSource || 'manual';
  const pending = st?.pending || [];
  const observations = st?.observations || [];
  const counts = st?.counts || {};
  const errorish = status === 'error' || status === 'degraded';

  const setSource = (v) => update({ dataSource: v, enabled: v !== 'manual' });
  const setMode = (v) => update({ mode: v });

  return (
    <div className="space-y-2" data-testid="integration-panel">
      {/* status koneksi */}
      <div className="flex items-center gap-2 rounded border border-ink-700 bg-ink-900 px-2.5 py-2">
        <span className={cx('rounded border px-2 py-1 text-[11px] font-bold', STATUS_CLS[status] || STATUS_CLS.disabled)} data-testid="grid-status">
          {STATUS_LABEL[status] || status}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-300" data-testid="grid-status-reason" title={st?.reason || ''}>
          {st?.reason || '—'}
        </span>
      </div>

      {source === 'grid' && !configured ? (
        <div className="rounded border border-gold/50 bg-gold/10 px-2.5 py-2 text-[11.5px] leading-relaxed text-gold" data-testid="grid-unconfigured">
          GRID belum dikonfigurasi. Tambahkan credentials melalui environment server.
        </div>
      ) : null}
      {errorish && source !== 'manual' ? (
        <div className="flex items-center gap-2 rounded border border-side-red/60 bg-side-red/15 px-2.5 py-2">
          <span className="min-w-0 flex-1 text-[11.5px] text-[#ff9db1]">{st?.reason}</span>
          <Btn size="sm" variant="ghost" data-testid="switch-manual" onClick={() => setSource('manual')}>
            Switch to Manual
          </Btn>
        </div>
      ) : null}

      {/* sumber data */}
      <fieldset className="rounded border border-ink-700 bg-ink-950/40 p-2">
        <legend className="px-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-400">Sumber data</legend>
        <div className="flex flex-wrap gap-3">
          {[
            ['manual', 'Manual (operator)'],
            ['grid', 'GRID live'],
            ['fixture', 'Fixture (uji)']
          ].map(([v, label]) => (
            <label key={v} className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink-200">
              <input
                type="radio"
                name="data-source"
                checked={source === v}
                onChange={() => setSource(v)}
                data-testid={`data-source-${v}`}
              />
              {label}
            </label>
          ))}
        </div>
        {source === 'fixture' ? (
          <Field label="Fixture" className="mt-2">
            <select
              className="inp"
              value={it.fixture || 'draft'}
              data-testid="grid-fixture-select"
              onChange={(e) => update({ fixture: e.target.value })}
            >
              {(st?.fixtures || ['draft', 'live', 'finished']).map((f) => (
                <option key={f} value={f}>
                  {f}.json
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </fieldset>

      {/* mode otomasi */}
      <Field
        label="Mode otomasi"
        hint={
          mode === 'monitor'
            ? 'Monitor: data hanya dipantau, state tidak diubah otomatis.'
            : mode === 'semi'
              ? 'Semi: setiap perubahan menunggu persetujuan operator.'
              : 'Auto: diterapkan otomatis — hanya bila AUTOMATION_ENABLED aktif.'
        }
      >
        <select className="inp" value={mode} data-testid="automation-mode" onChange={(e) => setMode(e.target.value)}>
          <option value="monitor">monitor (pantau saja)</option>
          <option value="semi">semi (perlu persetujuan)</option>
          <option value="auto">auto (otomatis)</option>
        </select>
      </Field>

      {mode === 'auto' ? (
        <div className="flex items-center justify-between gap-2 rounded border border-gold/50 bg-gold/10 px-2.5 py-2">
          <span className="text-[11.5px] text-gold">Gerbang kedua mode auto</span>
          <Btn
            size="sm"
            variant={it.autoEnabled ? 'primary' : 'ghost'}
            data-testid="automation-enabled"
            onClick={() => update({ autoEnabled: !it.autoEnabled })}
          >
            {it.autoEnabled ? 'AUTOMATION_ENABLED: aktif' : 'AUTOMATION_ENABLED: nonaktif'}
          </Btn>
        </div>
      ) : null}

      {/* kontrol koneksi */}
      <div className="flex flex-wrap gap-1.5">
        <Btn
          size="sm"
          variant="primary"
          data-testid="grid-start"
          disabled={busy || source === 'manual' || (st?.status === 'connected' || st?.status === 'connecting')}
          onClick={() => update({}, 'start')}
        >
          Sambungkan
        </Btn>
        <Btn
          size="sm"
          data-testid="grid-stop"
          disabled={busy || source === 'manual' || st?.status === 'disabled' || st?.status === 'disconnected'}
          onClick={() => update({}, 'stop')}
        >
          Putuskan
        </Btn>
        <Btn size="sm" variant="ghost" data-testid="grid-resync" disabled={busy} onClick={loadAudit}>
          Muat ulang status
        </Btn>
      </div>

      {/* jejak sumber data */}
      <div className="flex flex-wrap gap-1.5 text-[10.5px]">
        <span className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-ink-300" data-testid="draft-source">
          Draft: <span className="text-gold">{it.draftSource || 'manual'}</span>
        </span>
        <span className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-ink-300" data-testid="score-source">
          Skor: <span className="text-gold">{it.scoreSource || 'manual'}</span>
        </span>
        <span className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-ink-300" data-testid="grid-last-sync">
          Sinkron: <span className="text-ink-200">{timeLabel(st?.lastSyncAt)}</span>
        </span>
        <span className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-ink-300">
          Terima: <span className="text-ink-200">{counts.applied ?? 0}</span> · Tolak:{' '}
          <span className="text-ink-200">{counts.rejected ?? 0}</span>
        </span>
      </div>

      {/* pengajuan mode semi */}
      {mode === 'semi' && pending.length ? (
        <div className="space-y-1.5">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-400">Menunggu persetujuan ({pending.length})</div>
          {pending.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded border border-gold/40 bg-gold/8 px-2 py-1.5" data-testid="grid-pending">
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-200" title={p.summary}>
                {p.summary}
              </span>
              <Btn size="sm" variant="primary" data-testid="grid-approve" disabled={busy} onClick={() => update({}, 'approve', p.id)}>
                Aktifkan
              </Btn>
              <Btn size="sm" data-testid="grid-reject" disabled={busy} onClick={() => update({}, 'reject', p.id)}>
                Tolak
              </Btn>
            </div>
          ))}
        </div>
      ) : null}

      {/* observasi mode monitor */}
      {mode === 'monitor' && observations.length ? (
        <div className="space-y-1">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-400">Observasi terakhir</div>
          {observations.slice(-5).reverse().map((o) => (
            <div key={o.id} className="truncate rounded border border-ink-700 bg-ink-900 px-2 py-1 text-[11px] text-ink-300" title={o.summary}>
              {o.summary}
            </div>
          ))}
        </div>
      ) : null}

      {/* jejak audit */}
      {audit.length ? (
        <div className="space-y-1">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-400">Aktivitas terakhir</div>
          {audit.slice(0, 6).map((a, i) => (
            <div key={`${a.at}-${i}`} className="truncate text-[10.5px] text-ink-400" title={`${a.action} ${a.entity || ''} ${a.reason || ''}`}>
              <span className="text-ink-300">{timeLabel(a.at)}</span> · {a.action}
              {a.entity ? ` · ${a.entity}` : ''}
              {a.new ? ` → ${a.new}` : ''}
            </div>
          ))}
        </div>
      ) : null}

      <p className="text-[10.5px] leading-relaxed text-ink-400">
        Tanpa credentials di environment server, koneksi GRID live tidak tersedia — fixture dipakai untuk pengujian
        pipeline. Klaim status: <span className="text-gold">GRID LIVE CONNECTION NOT VERIFIED</span>.
      </p>
    </div>
  );
}
