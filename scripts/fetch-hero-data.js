/**
 * scripts/fetch-hero-data.js
 * ---------------------------------------------------------------------------
 * Mengambil data hero + aset visual dari API publik Moonton (GMS) yang sama
 * dengan yang dipakai repository MIT "warungerik/MLBB-Hero-Scraper".
 *
 * Output:
 *   server/data/heroes.json          -> daftar hero (tanpa skill)
 *   server/data/hero-skills.json     -> data skill per hero (model terpisah)
 *   public/assets/heroes/*.png       -> portrait, avatar, splash
 *   public/assets/skills/<slug>/*.png-> ikon skill
 *   public/assets/manifest.json      -> pemetaan hero -> file aset + checksum size
 *   scripts/report/fetch-report.json -> hasil unduhan & file yang gagal
 *
 * Penggunaan:
 *   node scripts/fetch-hero-data.js            (incremental, lewati file yang ada)
 *   node scripts/fetch-hero-data.js --force    (unduh ulang semua)
 *   node scripts/fetch-hero-data.js --no-skills
 * ---------------------------------------------------------------------------
 */
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API_URL = 'https://api.gms.moontontech.com/api/gms/source/2669606/2756564';

const DATA_DIR = path.join(ROOT, 'server', 'data');
const HERO_IMG_DIR = path.join(ROOT, 'public', 'assets', 'heroes');
const SKILL_IMG_DIR = path.join(ROOT, 'public', 'assets', 'skills');
const REPORT_DIR = path.join(__dirname, 'report');

const FORCE = process.argv.includes('--force');
const WITH_SKILLS = !process.argv.includes('--no-skills');
const CONCURRENCY = Number(process.env.FETCH_CONCURRENCY || 16);

const SOURCE_META = {
  source: 'Moonton GMS API (via metode warungerik/MLBB-Hero-Scraper, MIT)',
  sourceUrl: 'https://github.com/warungerik/MLBB-Hero-Scraper',
  lastUpdated: new Date().toISOString().slice(0, 10)
};

/* ------------------------------------------------------------------ util */

function postJson(url, payload, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} saat memanggil API hero`));
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Respons API bukan JSON valid'));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Timeout API'));
    });
    req.write(data);
    req.end();
  });
}

function download(url, destPath, { force = false, timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    if (!url) return resolve({ ok: false, reason: 'url kosong', dest: destPath });
    if (!force && fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
      return resolve({ ok: true, skipped: true, dest: destPath });
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const client = url.startsWith('https') ? https : http;
    const attempt = (target, depth = 0) => {
      const req = client.get(target, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          if (depth > 5) return resolve({ ok: false, reason: 'terlalu banyak redirect', dest: destPath });
          return attempt(res.headers.location, depth + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return resolve({ ok: false, reason: `HTTP ${res.statusCode}`, dest: destPath });
        }
        const tmp = destPath + '.part';
        const ws = fs.createWriteStream(tmp);
        res.pipe(ws);
        ws.on('finish', () => {
          ws.close(() => {
            if (fs.statSync(tmp).size === 0) {
              fs.unlinkSync(tmp);
              return resolve({ ok: false, reason: 'file kosong', dest: destPath });
            }
            fs.renameSync(tmp, destPath);
            resolve({ ok: true, dest: destPath });
          });
        });
        ws.on('error', () => resolve({ ok: false, reason: 'gagal menulis file', dest: destPath }));
      });
      req.on('error', () => resolve({ ok: false, reason: 'gagal koneksi', dest: destPath }));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve({ ok: false, reason: 'timeout', dest: destPath });
      });
    };
    attempt(url);
  });
}

async function runPool(items, worker, concurrency) {
  let i = 0;
  const results = [];
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

function slugify(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

const clean = (t) => String(t || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------- main */

async function main() {
  console.log('[1/4] Mengambil daftar hero dari API Moonton...');
  const payload = {
    pageSize: 300,
    pageIndex: 1,
    filters: [],
    sorts: [{ data: { field: 'hero_id', order: 'asc' }, type: 'sequence' }],
    fields: [],
    object: []
  };
  const resp = await postJson(API_URL, payload);
  const records = resp?.data?.records;
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('API tidak mengembalikan daftar hero');
  }
  console.log(`      Ditemukan ${records.length} record hero.`);

  const heroes = [];
  const skillsByHero = {};
  const downloadTasks = [];
  const seenIds = new Set();
  const seenSlugs = new Set();
  const issues = [];

  for (const rec of records) {
    const raw = rec.data || {};
    const hero = raw.hero?.data || raw;
    const numericId = Number(raw.hero_id ?? hero.heroid);
    const name = clean(hero.name);
    if (!name) {
      issues.push({ type: 'nama-kosong', id: numericId });
      continue;
    }
    if (seenIds.has(numericId)) issues.push({ type: 'id-duplikat', id: numericId, name });
    seenIds.add(numericId);

    let slug = slugify(name);
    if (seenSlugs.has(slug)) {
      issues.push({ type: 'slug-duplikat', slug, name });
      slug = `${slug}-${numericId}`;
    }
    seenSlugs.add(slug);

    const roles = (Array.isArray(hero.sortlabel) ? hero.sortlabel : [])
      .map((r) => clean(r))
      .filter(Boolean);
    const lanes = (Array.isArray(hero.roadsortlabel) ? hero.roadsortlabel : [])
      .map((l) => clean(l))
      .filter(Boolean);
    const speciality = (Array.isArray(hero.speciality) ? hero.speciality : [])
      .map((s) => clean(s))
      .filter(Boolean);

    const portraitUrl = hero.smallmap || hero.head || '';
    const avatarUrl = hero.head || hero.squarehead || hero.smallmap || '';
    const splashUrl = hero.painting || raw.head_big || '';

    const portraitFile = `/assets/heroes/${slug}-portrait.png`;
    const avatarFile = `/assets/heroes/${slug}-avatar.png`;
    const splashFile = `/assets/heroes/${slug}-splash.jpg`;

    downloadTasks.push({
      url: portraitUrl,
      dest: path.join(HERO_IMG_DIR, `${slug}-portrait.png`),
      label: `portrait ${name}`
    });
    downloadTasks.push({
      url: avatarUrl,
      dest: path.join(HERO_IMG_DIR, `${slug}-avatar.png`),
      label: `avatar ${name}`
    });
    downloadTasks.push({
      url: splashUrl,
      dest: path.join(HERO_IMG_DIR, `${slug}-splash.jpg`),
      label: `splash ${name}`
    });

    const skills = [];
    const skillLists = hero.heroskilllist || [];
    let skillIndex = 0;
    skillLists.forEach((group, gIdx) => {
      if (!group || !Array.isArray(group.skilllist)) return;
      group.skilllist.forEach((skill) => {
        if (!skill || !skill.skillname) return;
        skillIndex += 1;
        const relIcon = `/assets/skills/${slug}/${String(skillIndex).padStart(2, '0')}.png`;
        if (skill.skillicon) {
          downloadTasks.push({
            url: skill.skillicon,
            dest: path.join(SKILL_IMG_DIR, slug, `${String(skillIndex).padStart(2, '0')}.png`),
            label: `skill ${skill.skillname} (${name})`,
            noSkills: false
          });
        }
        skills.push({
          id: skill.skillid ?? null,
          index: skillIndex,
          group: gIdx + 1,
          name: clean(skill.skillname),
          icon: skill.skillicon ? relIcon : null,
          cdCost: clean(skill['skillcd&cost']),
          description: clean(skill.skilldesc)
        });
      });
    });

    skillsByHero[`h${String(numericId).padStart(3, '0')}`] = skills;

    heroes.push({
      id: `h${String(numericId).padStart(3, '0')}`,
      numericId,
      name,
      slug,
      roles,
      lanes,
      speciality,
      difficulty: hero.difficulty ? Number(hero.difficulty) : null,
      assets: {
        portrait: portraitFile,
        avatar: avatarFile,
        splash: splashFile
      },
      metadata: { ...SOURCE_META }
    });
  }

  heroes.sort((a, b) => a.numericId - b.numericId);

  if (!WITH_SKILLS) {
    for (const t of downloadTasks) if (t.label.startsWith('skill ')) t.skip = true;
  }

  console.log(`[2/4] Mengunduh aset (${downloadTasks.filter((t) => !t.skip).length} file, paralel ${CONCURRENCY})...`);
  let done = 0;
  const results = await runPool(
    downloadTasks.filter((t) => !t.skip),
    async (task) => {
      const r = await download(task.url, task.dest, { force: FORCE });
      done += 1;
      if (done % 100 === 0 || done === downloadTasks.length) {
        console.log(`      ${done}/${downloadTasks.length} file diproses`);
      }
      return { ...r, label: task.label, url: task.url };
    },
    CONCURRENCY
  );

  const failed = results.filter((r) => r && !r.ok);
  const downloaded = results.filter((r) => r && r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r && r.skipped).length;

  console.log('[3/4] Menulis file data...');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  fs.writeFileSync(path.join(DATA_DIR, 'heroes.json'), JSON.stringify(heroes, null, 2), 'utf8');
  fs.writeFileSync(path.join(DATA_DIR, 'hero-skills.json'), JSON.stringify(skillsByHero, null, 2), 'utf8');

  // Manifest: hanya file yang benar-benar ada di disk
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: SOURCE_META,
    totalHeroes: heroes.length,
    heroes: {}
  };
  const missing = [];
  for (const h of heroes) {
    const entry = { name: h.name, roles: h.roles, lanes: h.lanes, files: {} };
    for (const [key, rel] of Object.entries(h.assets)) {
      const abs = path.join(ROOT, 'public', rel.replace(/^\//, ''));
      if (fs.existsSync(abs)) {
        entry.files[key] = { path: rel, bytes: fs.statSync(abs).size };
      } else {
        entry.files[key] = null;
        missing.push({ hero: h.name, asset: key, expected: rel });
      }
    }
    const skillFiles = {};
    for (const s of skillsByHero[h.id] || []) {
      if (!s.icon) continue;
      const abs = path.join(ROOT, 'public', s.icon.replace(/^\//, ''));
      skillFiles[s.index] = fs.existsSync(abs) ? s.icon : null;
      if (!fs.existsSync(abs)) missing.push({ hero: h.name, asset: `skill-${s.index}`, expected: s.icon });
    }
    entry.files.skills = skillFiles;
    manifest.heroes[h.id] = entry;
  }

  fs.writeFileSync(path.join(ROOT, 'public', 'assets', 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  const report = {
    generatedAt: new Date().toISOString(),
    apiTotal: records.length,
    heroesWritten: heroes.length,
    download: { total: results.length, downloaded, skipped, failed: failed.length },
    failed: failed.map((f) => ({ label: f.label, reason: f.reason, url: f.url })),
    missingAssets: missing,
    schemaIssues: issues
  };
  fs.writeFileSync(path.join(REPORT_DIR, 'fetch-report.json'), JSON.stringify(report, null, 2), 'utf8');

  console.log(`[4/4] Selesai.`);
  console.log(`      hero          : ${heroes.length}`);
  console.log(`      unduh baru    : ${downloaded}`);
  console.log(`      dilewati      : ${skipped} (sudah ada)`);
  console.log(`      gagal         : ${failed.length}`);
  console.log(`      aset hilang   : ${missing.length}`);
  if (issues.length) console.log(`      masalah skema : ${issues.length}`);
  if (failed.length) {
    console.log('      Contoh gagal :');
    failed.slice(0, 8).forEach((f) => console.log(`        - ${f.label}: ${f.reason}`));
  }
  console.log(`      Laporan       : scripts/report/fetch-report.json`);
}

main().catch((err) => {
  console.error('\n[FATAL] ' + err.message);
  console.error(
    'Gunakan data fallback lokal bila sumber ini tidak tersedia:\n  node scripts/import-database.js --fallback-portraits'
  );
  process.exit(1);
});
