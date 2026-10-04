/**
 * server/grid/discovery.js
 * ---------------------------------------------------------------------------
 * Discovery schema via INTROSPECTION GraphQL standar (query `__schema`).
 *
 * Ini BUKAN pengarangan schema: introspection adalah mekanisme bawaan GraphQL.
 * Hasilnya ditulis ke laporan lokal untuk ditinjau manusia sebelum mapping
 * field live diimplementasikan. Tanpa kredensial → tidak ada yang diklaim.
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestGraphQL } from './graphql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const REPORT_DIR = path.join(ROOT, 'scripts', 'report');

const INTROSPECTION_QUERY = `
  query DraftStudioDiscovery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        name
        kind
        fields { name }
      }
    }
  }
`;

/**
 * @returns {Promise<{ok:boolean, reason?:string, error?:string,
 *                    summary?:{types:number, queries:number, mutations:number,
 *                              subscriptions:number, reportPath?:string}}>}
 */
export async function runDiscovery(cfg, { request = requestGraphQL, writeReport = true } = {}) {
  if (!cfg?.graphqlUrl || !cfg?.apiKey) {
    return { ok: false, reason: 'belum dikonfigurasi' };
  }
  const res = await request(cfg.graphqlUrl, INTROSPECTION_QUERY, {}, {
    apiKey: cfg.apiKey,
    authHeader: cfg.authHeader || 'authorization',
    timeoutMs: 8000,
    retries: 1
  });
  if (!res.ok) return { ok: false, error: res.error || 'introspection gagal' };

  const schema = res.data?.__schema;
  if (!schema || !Array.isArray(schema.types)) {
    return { ok: false, error: 'response tidak memuat __schema' };
  }
  const summary = {
    types: schema.types.length,
    queries: schema.queryType?.name || null,
    mutations: schema.mutationType?.name || null,
    subscriptions: schema.subscriptionType?.name || null
  };
  let reportPath;
  if (writeReport) {
    try {
      fs.mkdirSync(REPORT_DIR, { recursive: true });
      reportPath = path.join(REPORT_DIR, 'grid-discovery.json');
      fs.writeFileSync(
        reportPath,
        JSON.stringify(
          { discoveredAt: new Date().toISOString(), summary, schema },
          null,
          2
        )
      );
    } catch (e) {
      reportPath = undefined;
      summary.reportError = e.message;
    }
  }
  if (reportPath) summary.reportPath = path.relative(ROOT, reportPath).replace(/\\/g, '/');
  return { ok: true, summary };
}
