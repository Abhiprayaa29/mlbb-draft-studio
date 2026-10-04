/**
 * server/grid/graphql.js
 * ---------------------------------------------------------------------------
 * Transport HTTP GraphQL generik (server-side ONLY — tidak pernah dipanggil
 * dari React/OBS). Retry dengan exponential backoff + jitter, timeout per
 * request, dan penanganan error yang tidak pernah menjatuhkan server utama.
 *
 * Auth: header dikonfigurasi lewat GRID_AUTH_HEADER (default "authorization"
 * dengan skema Bearer). Nama header/skema asli harus diverifikasi terhadap
 * dokumentasi GRID saat kredensial tersedia.
 * ---------------------------------------------------------------------------
 */

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @returns {Promise<{ok:boolean, data?:any, error?:string, status?:number, attempts:number}>}
 */
export async function requestGraphQL(
  url,
  query,
  variables = {},
  { apiKey = '', authHeader = 'authorization', timeoutMs = 8000, retries = 2, fetchImpl = fetch } = {}
) {
  if (!url) return { ok: false, error: 'URL GraphQL tidak dikonfigurasi.', attempts: 0 };
  let lastError = 'unknown';
  let status;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      const backoff = 400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
      await sleep(backoff);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers = { 'content-type': 'application/json' };
      if (apiKey) {
        const h = String(authHeader || 'authorization').toLowerCase();
        headers[h] = /^authorization$/i.test(h) || h === 'authorization' ? `Bearer ${apiKey}` : apiKey;
      }
      const res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables }),
        signal: ctrl.signal
      });
      status = res.status;
      if (res.status === 401 || res.status === 403) {
        // auth gagal → percobaan ulang tidak akan membantu
        return { ok: false, error: `Autentikasi ditolak (HTTP ${res.status}).`, status, attempts: attempt + 1 };
      }
      if (res.status === 429) {
        lastError = `Rate limit (HTTP 429)`;
        continue;
      }
      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }
      const body = await res.json();
      if (body?.errors?.length) {
        return {
          ok: false,
          error: `GraphQL error: ${String(body.errors[0]?.message || '').slice(0, 160)}`,
          status,
          attempts: attempt + 1
        };
      }
      if (body?.data === undefined || body.data === null) {
        lastError = 'response tanpa field data';
        continue;
      }
      return { ok: true, data: body.data, status, attempts: attempt + 1 };
    } catch (e) {
      lastError = e?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : String(e?.message || e).slice(0, 160);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastError, status, attempts: retries + 1 };
}
