/**
 * server/grid/normalizer.js
 * ---------------------------------------------------------------------------
 * Canonical event → patch siap-terapkan untuk state aplikasi.
 *
 * Patch hanya berisi field yang BENAR-BENAR tersedia dari provider.
 * Field yang tidak dikirim tidak muncul sama sekali (unknown != zero) sehingga
 * patch tidak pernah "mengosongkan" data yang belum diketahui.
 * ---------------------------------------------------------------------------
 */

export function toPatch(event) {
  if (!event || !event.kind) return null;
  switch (event.kind) {
    case 'series': {
      const patch = { kind: 'series' };
      if (event.ids && Object.values(event.ids).some(Boolean)) patch.ids = event.ids;
      if (event.tournament) patch.tournament = event.tournament;
      if (event.status) patch.status = event.status;
      if (event.teams) {
        const teams = {};
        for (const side of ['blue', 'red']) {
          const t = event.teams[side];
          if (!t) continue;
          const o = {};
          if (t.name) o.name = t.name;
          if (Number.isInteger(t.seriesScore)) o.seriesScore = t.seriesScore;
          if (Object.keys(o).length) teams[side] = o;
        }
        if (Object.keys(teams).length) patch.teams = teams;
      }
      return Object.keys(patch).length > 1 ? patch : null;
    }
    case 'draft':
      return { kind: 'draft', team: event.team, type: event.type, heroId: event.heroId };
    case 'score': {
      if (event.noop) return null;
      const patch = { kind: 'score', score: {} };
      for (const side of ['blue', 'red']) {
        const s = event.sides?.[side];
        if (s && Object.keys(s).length) patch.score[side] = s;
      }
      if (event.durationMs !== undefined) patch.score.durationMs = event.durationMs;
      return Object.keys(patch.score).length ? patch : null;
    }
    case 'finished': {
      const patch = { kind: 'finished' };
      if (event.winner !== undefined) patch.winner = event.winner;
      if (event.durationMs !== undefined) patch.durationMs = event.durationMs;
      if (event.seriesScore) patch.seriesScore = event.seriesScore;
      return Object.keys(patch).length > 1 ? patch : null;
    }
    default:
      return null;
  }
}

/** Ringkasan singkat untuk UI (monitor/approval) — tanpa data sensitif. */
export function summarize(event) {
  if (!event) return '';
  switch (event.kind) {
    case 'series':
      return `Seri ${event.providerStatus || 'state'}${event.teams?.blue?.name ? ` · ${event.teams.blue.name} vs ${event.teams.red?.name || '?'}` : ''}`;
    case 'draft':
      return `${event.team === 'blue' ? 'Blue' : 'Red'} ${String(event.type || '?').toUpperCase()} · ${event.heroId || '?'}`;
    case 'score': {
      const parts = [];
      for (const side of ['blue', 'red']) {
        const s = event.sides?.[side];
        if (s && Object.keys(s).length) parts.push(`${side}: ${Object.entries(s).map(([k, v]) => `${k}=${v}`).join(' ')}`);
      }
      if (event.durationMs !== undefined) parts.push(`durasi=${event.durationMs}ms`);
      return `Skor ${parts.join(' · ') || '(tanpa perubahan)'}`;
    }
    case 'finished':
      return `Selesai · pemenang ${event.winner || 'tidak ditentukan'}${event.seriesScore ? ` · seri ${event.seriesScore.blue ?? 0}-${event.seriesScore.red ?? 0}` : ''}`;
    default:
      return event.kind || '-';
  }
}
