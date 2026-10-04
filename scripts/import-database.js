/**
 * scripts/import-database.js
 * ---------------------------------------------------------------------------
 * Mengimpor dataset pendukung dari repository publik
 *   https://github.com/Ceplin03/database-mlbb.Mobile-Legends-Bang-Bang
 * (README menyatakan lisensi MIT; file LICENSE tidak ada di dalam repo)
 *
 * Data yang diimpor:
 *   meta-draftpick-ml.json -> server/data/meta-tiers.json   (tier meta per lane)
 *   equipment.json         -> server/data/equipment.json    (+ ikon item)
 *   emblem.json            -> server/data/emblems.json
 *   build-item.json        -> server/data/builds.json       (build rekomendasi)
 *
 * Bila jaringan gagal, gunakan clone lokal:
 *   set MLBB_DB_PATH=C:\path\ke\database-mlbb  lalu jalankan skrip ini lagi.
 * ---------------------------------------------------------------------------
 */
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'server', 'data');
const ITEM_IMG_DIR = path.join(ROOT, 'public', 'assets', 'items');
const REPORT_DIR = path.join(__dirname, 'report');

const RAW_BASE = 'https://raw.githubusercontent.com/Ceplin03/database-mlbb.Mobile-Legends-Bang-Bang/master';
const LOCAL_BASE = process.env.MLBB_DB_PATH || '';
const FILES = ['meta-draftpick-ml.json', 'equipment.json', 'emblem.json', 'build-item.json'];

const SOURCE_META = {
  source: 'github.com/Ceplin03/database-mlbb.Mobile-Legends-Bang-Bang',
  sourceUrl: 'https://github.com/Ceplin03/database-mlbb.Mobile-Legends-Bang-Bang',
  licenseDeclared: 'MIT (dinyatakan di README; file LICENSE tidak tersedia di repo)',
  importedAt: new Date().toISOString()
};

function httpGet(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'mlbb-draft-studio-data-import' } },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          return resolve(httpGet(res.headers.location, timeoutMs));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} untuk ${url}`));
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve(body));
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
  });
}

async function loadFile(name) {
  if (LOCAL_BASE) {
    const p = path.join(LOCAL_BASE, name);
    if (fs.existsSync(p)) {
      console.log(`  - ${name}: lokal (${p})`);
      return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
    }
    console.log(`  - ${name}: tidak ada di lokal, coba jaringan...`);
  }
  const txt = await httpGet(`${RAW_BASE}/${name}`);
  console.log(`  - ${name}: jaringan OK (${(txt.length / 1024).toFixed(0)} KB)`);
  return txt.replace(/^\uFEFF/, '');
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ITEM_IMG_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const heroes = fs.existsSync(path.join(DATA_DIR, 'heroes.json'))
    ? JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'heroes.json'), 'utf8'))
    : [];
  const byName = new Map();
  heroes.forEach((h) => byName.set(normName(h.name), h));

  const raw = {};
  console.log('[1/3] Mengambil dataset Ceplin03...');
  for (const f of FILES) {
    try {
      raw[f] = JSON.parse(await loadFile(f));
    } catch (e) {
      console.error(`  ! ${f} gagal: ${e.message}`);
      raw[f] = null;
    }
  }

  const unmatched = [];

  /* ---------------------------------------------------- meta draft tiers */
  console.log('[2/3] Menormalkan meta tier, equipment, emblem, build...');
  const metaOut = { metadata: { ...(raw['meta-draftpick-ml.json']?.metadata || {}), ...SOURCE_META }, lanes: {}, counterPicks: {} };
  const srcMeta = raw['meta-draftpick-ml.json'];
  if (srcMeta) {
    const mapLane = (key) => {
      const out = {};
      for (const item of srcMeta.meta_draft_picks?.[key] || []) {
        const h = byName.get(normName(item.hero_name));
        if (!h) {
          unmatched.push({ source: 'meta', name: item.hero_name, lane: key });
          continue;
        }
        out[h.id] = { heroId: h.id, name: h.name, tier: item.priority_tier };
      }
      return out;
    };
    ['exp_lane', 'roamer', 'mid_lane', 'gold_lane', 'jungler'].forEach((k) => {
      metaOut.lanes[k] = mapLane(k);
    });
    const mapCounter = (key) =>
      (srcMeta.alternative_counter_picks?.[key] || [])
        .map((item) => {
          const h = byName.get(normName(item.hero_name));
          if (!h) {
            unmatched.push({ source: 'counter', name: item.hero_name, lane: key });
            return null;
          }
          return { heroId: h.id, name: h.name, tier: item.priority_tier };
        })
        .filter(Boolean);
    ['exp_lane', 'roamer', 'mid_lane', 'gold_lane', 'jungler'].forEach((k) => {
      metaOut.counterPicks[k] = mapCounter(k);
    });
    // lookup tier hero -> {lane: tier}
    metaOut.heroTier = {};
    Object.entries(metaOut.lanes).forEach(([lane, map]) => {
      Object.values(map).forEach(({ heroId, tier }) => {
        metaOut.heroTier[heroId] = metaOut.heroTier[heroId] || {};
        metaOut.heroTier[heroId][lane] = tier;
      });
    });
  }
  fs.writeFileSync(path.join(DATA_DIR, 'meta-tiers.json'), JSON.stringify(metaOut, null, 2), 'utf8');

  /* ------------------------------------------------------------ equipment */
  const eqRaw = raw['equipment.json'];
  const equipment = [];
  if (Array.isArray(eqRaw)) {
    eqRaw.forEach((e) => {
      equipment.push({
        id: e.id_equip,
        name: e['name-equipment'],
        priceGold: e['prize-gold'],
        icon: `/assets/items/${e['logo-equipment']}`
      });
    });
  }
  fs.writeFileSync(path.join(DATA_DIR, 'equipment.json'), JSON.stringify({ metadata: { ...SOURCE_META }, items: equipment }, null, 2), 'utf8');

  /* --------------------------------------------------------------- emblem */
  const emRaw = raw['emblem.json'];
  fs.writeFileSync(
    path.join(DATA_DIR, 'emblems.json'),
    JSON.stringify({ metadata: { ...SOURCE_META }, emblems: emRaw?.emblems || [] }, null, 2),
    'utf8'
  );

  /* ---------------------------------------------------------------- build */
  const bdRaw = raw['build-item.json'];
  const builds = [];
  if (Array.isArray(bdRaw)) {
    bdRaw.forEach((b) => {
      const h = byName.get(normName(b.hero_name));
      if (!h) {
        unmatched.push({ source: 'build', name: b.hero_name });
        return;
      }
      builds.push({
        heroId: h.id,
        name: h.name,
        role: b.role,
        speciality: b.speciality || [],
        topBuilds: (b.top_builds || []).map((t) => ({
          battleSpell: t.battle_spell || '',
          emblems: t.emblems || [],
          items: t.items || []
        }))
      });
    });
  }
  fs.writeFileSync(path.join(DATA_DIR, 'builds.json'), JSON.stringify({ metadata: { ...SOURCE_META }, builds }, null, 2), 'utf8');

  /* ------------------------------------------------------- unduh ikon item */
  let itemOk = 0;
  let itemFail = 0;
  const itemTasks = equipment.filter((e) => e.icon);
  console.log(`[3/3] Mengunduh ikon item (${itemTasks.length} file)...`);
  await Promise.all(
    itemTasks.map(
      (e) =>
        new Promise((resolve) => {
          const dest = path.join(ITEM_IMG_DIR, path.basename(e.icon));
          if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
            itemOk += 1;
            return resolve();
          }
          const url = `${RAW_BASE}/logo-equipment/${encodeURIComponent(path.basename(e.icon))}`;
          https
            .get(url, { headers: { 'User-Agent': 'mlbb-draft-studio' } }, (res) => {
              if (res.statusCode !== 200) {
                res.resume();
                itemFail += 1;
                return resolve();
              }
              const ws = fs.createWriteStream(dest);
              res.pipe(ws);
              ws.on('finish', () => {
                ws.close(() => {
                  itemOk += 1;
                  resolve();
                });
              });
            })
            .on('error', () => {
              itemFail += 1;
              resolve();
            });
        })
    )
  );

  const report = {
    generatedAt: new Date().toISOString(),
    source: SOURCE_META,
    imported: {
      metaLanes: Object.keys(metaOut.lanes).length,
      metaEntries: Object.values(metaOut.lanes).reduce((a, b) => a + Object.keys(b).length, 0),
      equipment: equipment.length,
      emblems: metaOut ? (emRaw?.emblems || []).length : 0,
      builds: builds.length,
      itemIcons: { ok: itemOk, failed: itemFail }
    },
    unmatchedHeroNames: unmatched
  };
  fs.writeFileSync(path.join(REPORT_DIR, 'import-report.json'), JSON.stringify(report, null, 2), 'utf8');

  console.log(`      meta entries : ${report.imported.metaEntries}`);
  console.log(`      equipment    : ${equipment.length} (ikon OK ${itemOk}, gagal ${itemFail})`);
  console.log(`      emblems      : ${report.imported.emblems}`);
  console.log(`      builds       : ${builds.length}`);
  console.log(`      nama tak cocok: ${unmatched.length}`);
  if (unmatched.length) {
    const uniq = [...new Set(unmatched.map((u) => `${u.source}:${u.name}`))];
    uniq.slice(0, 20).forEach((u) => console.log(`        - ${u}`));
  }
}

main().catch((err) => {
  console.error('\n[FATAL] ' + err.message);
  console.error('Bila offline, set MLBB_DB_PATH ke clone lokal repository Ceplin03 lalu jalankan ulang.');
  process.exit(1);
});
