import React, { useCallback, useEffect, useState } from 'react';
import { cx, useStore } from '../lib/utils.js';
import { store, getOperatorToken } from '../lib/store.js';
import { Btn, Field, TextInput } from './ui.jsx';

const STATUS_CLS = {
  idle: 'border-ink-600 bg-ink-900 text-ink-300',
  connected: 'border-mint/50 bg-mint/10 text-mint',
  capturing: 'border-gold/60 bg-gold/10 text-gold',
  error: 'border-side-red/60 bg-side-red/15 text-[#ff9db1]'
};

function fmtTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const FIELD_MODES = [
  ['disabled', 'Disabled'],
  ['review', 'Review'],
  ['auto-apply', 'Auto Apply']
];

export default function ObsOcrPanel({ state }) {
  const snap = useStore();
  const [obsStatus, setObsStatus] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [sources, setSources] = useState([]);
  const [sourceName, setSourceName] = useState('');
  const [intervalMs, setIntervalMs] = useState(1000);
  const [wsUrl, setWsUrl] = useState('ws://127.0.0.1:4455');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastReadings, setLastReadings] = useState(null);
  const [lastSkipped, setLastSkipped] = useState([]);
  const [lastEvents, setLastEvents] = useState([]);

  const fetchStatus = useCallback(async () => {
    const headers = {};
    const token = getOperatorToken();
    if (token) headers['x-operator-token'] = token;
    try {
      const r = await fetch('/api/ocr/obs/status', { headers });
      if (!r.ok) return;
      const j = await r.json();
      setObsStatus(j.status);
      setPolicy(j.policy);
      if (j.status?.sourceName) setSourceName(j.status.sourceName);
      if (j.status?.intervalMs) setIntervalMs(j.status.intervalMs);
      if (j.status?.wsUrl) setWsUrl(j.status.wsUrl);
    } catch { /* ignore */ }
  }, []);

  const fetchSources = useCallback(async () => {
    const headers = {};
    const token = getOperatorToken();
    if (token) headers['x-operator-token'] = token;
    try {
      const r = await fetch('/api/ocr/obs/sources', { headers });
      if (!r.ok) return;
      const j = await r.json();
      setSources(j.sources || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 4000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  useEffect(() => {
    const onReading = (p) => {
      setLastReadings(p.readings);
      setLastSkipped(p.skipped || []);
      setLastEvents(p.events || []);
    };
    const onObs = () => { fetchStatus(); };
    const sock = window.__mlbbSocket;
    if (sock?.on) {
      sock.on('ocr:reading', onReading);
      sock.on('ocr:obs:status', onObs);
      return () => { sock.off('ocr:reading', onReading); sock.off('ocr:obs:status', onObs); };
    }
  }, [fetchStatus]);

  const act = useCallback(async (path, body) => {
    setBusy(true);
    try {
      const headers = { 'content-type': 'application/json' };
      const token = getOperatorToken();
      if (token) headers['x-operator-token'] = token;
      const r = await fetch(`/api/ocr/obs/${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body || {})
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) store.notice(j.error || 'Gagal.', 'error');
      else fetchStatus();
      return j;
    } catch (e) {
      store.notice(e.message || 'Gagal.', 'error');
      return { error: e.message };
    } finally { setBusy(false); }
  }, [fetchStatus]);

  const connected = !!obsStatus?.connected;
  const capturing = !!obsStatus?.capturing;
  const statusKey = capturing ? 'capturing' : connected ? 'connected' : obsStatus?.lastError ? 'error' : 'idle';

  const scoreRedMode = policy?.scoreRed || 'disabled';
  const goldBlueMode = policy?.goldBlue || 'disabled';

  return (
    <div className="space-y-2" data-testid="obs-ocr-panel">
      <div className="flex items-center gap-2 rounded border border-ink-700 bg-ink-900 px-2.5 py-2">
        <span className={cx('rounded border px-2 py-1 text-[11px] font-bold', STATUS_CLS[statusKey])} data-testid="obs-status-badge">
          {statusKey === 'capturing' ? 'CAPTURING' : statusKey === 'connected' ? 'TERSAMBUNG' : statusKey === 'error' ? 'ERROR' : 'IDLE'}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-300">
          {obsStatus?.lastError || (capturing ? `FPS: ${(1000 / (obsStatus?.intervalMs || 1000)).toFixed(1)}` : 'Belum terhubung')}
        </span>
      </div>

      <fieldset className="rounded border border-ink-700 bg-ink-950/40 p-2">
        <legend className="px-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-400">Koneksi OBS WebSocket</legend>
        <div className="space-y-2">
          <Field label="WebSocket URL">
            <TextInput value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} placeholder="ws://127.0.0.1:4455" data-testid="obs-ws-url" />
          </Field>
          <Field label="Password">
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Wajib jika auth aktif di OBS" data-testid="obs-password" />
          </Field>
          <div className="flex gap-2">
            <Btn size="sm" disabled={busy || connected} onClick={() => act('connect', { wsUrl, password })} data-testid="obs-connect-btn">
              Connect
            </Btn>
            <Btn size="sm" variant="ghost" disabled={busy || !connected} onClick={() => act('disconnect')} data-testid="obs-disconnect-btn">
              Disconnect
            </Btn>
          </div>
        </div>
      </fieldset>

      {connected ? (
        <fieldset className="rounded border border-ink-700 bg-ink-950/40 p-2">
          <legend className="px-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-400">Source & Capture</legend>
          <div className="space-y-2">
            <div className="flex gap-2">
              <select
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                className="flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-[12px] text-ink-100"
                data-testid="obs-source-select"
              >
                <option value="">— Pilih source —</option>
                {sources.map((s) => (
                  <option key={s.name} value={s.name}>{s.name} ({s.type})</option>
                ))}
              </select>
              <Btn size="sm" variant="ghost" disabled={busy} onClick={fetchSources} data-testid="obs-refresh-sources">
                Refresh
              </Btn>
            </div>
            <Field label={`Interval (ms) — ${intervalMs}ms`}>
              <input
                type="range" min="200" max="5000" step="100"
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                className="w-full"
                data-testid="obs-interval-slider"
              />
            </Field>
            <div className="flex gap-2">
              <Btn size="sm" disabled={busy || capturing || !sourceName} onClick={() => act('start', { sourceName, intervalMs })} data-testid="obs-start-btn">
                Start Capture
              </Btn>
              <Btn size="sm" variant="ghost" disabled={busy || !capturing} onClick={() => act('stop')} data-testid="obs-stop-btn">
                Stop Capture
              </Btn>
            </div>
          </div>
        </fieldset>
      ) : null}

      <fieldset className="rounded border border-ink-700 bg-ink-950/40 p-2">
        <legend className="px-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-400">Kebijakan Apply per Field</legend>
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center justify-between">
            <span>Mode global</span>
            <span className={cx('rounded border px-2 py-0.5 text-[10px] font-bold', capturing && Object.values(policy || {}).some(v => v === 'auto-apply') ? 'border-gold/60 bg-gold/10 text-gold' : 'border-ink-600 bg-ink-900 text-ink-300')}>
              {Object.values(policy || {}).some(v => v === 'auto-apply') ? 'AUTO-APPLY' : 'OBSERVE-ONLY'}
            </span>
          </div>
          <div className="text-[10px] text-ink-400">scoreRed & goldBlue terkunci "review" (kalibrasi OCR belum akurat).</div>
          {['timer', 'scoreBlue', 'scoreRed', 'goldBlue', 'goldRed'].map((f) => (
            <div key={f} className="flex items-center justify-between">
              <span>{f}</span>
              <select
                value={policy?.[f] || 'disabled'}
                onChange={(e) => act('policy', { policy: { [f]: e.target.value } })}
                className="rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[11px]"
                data-testid={`obs-policy-${f}`}
                disabled={f === 'scoreRed' || f === 'goldBlue'}
              >
                {FIELD_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
      </fieldset>

      {obsStatus ? (
        <div className="rounded border border-ink-700 bg-ink-950/40 p-2 text-[11px] text-ink-300">
          <div className="font-bold uppercase tracking-[0.1em] text-ink-400 text-[10px] mb-1">Statistik</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span>Total frames: <b className="text-ink-100">{obsStatus.totalFrames}</b></span>
            <span>Processed: <b className="text-ink-100">{obsStatus.processedFrames}</b></span>
            <span>Dropped: <b className="text-ink-100">{obsStatus.droppedFrames}</b></span>
            <span>Last capture: <b className="text-ink-100">{fmtTime(obsStatus.lastCaptureAt)}</b></span>
            <span>Last processed: <b className="text-ink-100">{fmtTime(obsStatus.lastProcessedAt)}</b></span>
          </div>
        </div>
      ) : null}

      {lastReadings ? (
        <div className="rounded border border-ink-700 bg-ink-950/40 p-2 text-[11px]" data-testid="obs-last-readings">
          <div className="font-bold uppercase tracking-[0.1em] text-ink-400 text-[10px] mb-1">OCR Terakhir</div>
          {Object.entries(lastReadings).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-ink-300">{k}</span>
              <span className="text-ink-100">{v?.text || '—'} <span className="text-ink-400">({v?.confidence ?? 0}%)</span></span>
            </div>
          ))}
          {lastSkipped.length > 0 ? (
            <div className="mt-1 text-[10px] text-ink-400">Skipped: {lastSkipped.map(s => `${s.field}(${s.reason})`).join(', ')}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
