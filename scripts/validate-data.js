/**
 * scripts/validate-data.js
 * ---------------------------------------------------------------------------
 * Validasi integritas dataset lokal: ID duplikat, nama file hilang,
 * referensi hero yang tidak valid, dan file aset yang rusak/kosong.
 * Exit code 1 bila ada error (dipakai oleh CI / pemeriksaan otomatis).
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'server', 'data');
const PUBLIC = path.join(ROOT, 'public');

const errors = [];
const warnings = [];
const info = [];

function readJson(name, fallback = null) {
  const p = path.join(DATA, name);
  if (!fs.existsSync(p)) {
    errors.push(`file hilang: server/data/${name}`);
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    errors.push(`JSON rusak: server/data/${name} (${e.message})`);
    return fallback;
  }
}

function fileOk(rel, label) {
  if (!rel) return false;
  const abs = path.join(PUBLIC, rel.replace(/^\//, ''));
  if (!fs.existsSync(abs)) {
    errors.push(`${label}: file tidak ada -> ${rel}`);
    return false;
  }
  if (fs.statSync(abs).size === 0) {
    errors.push(`${label}: file kosong -> ${rel}`);
    return false;
  }
  return true;
}

console.log('[1/4] Memeriksa heroes.json...');
const heroes = readJson('heroes.json', []);
const skills = readJson('hero-skills.json', {});

const ids = new Set();
const slugs = new Set();
const names = new Set();
const heroById = new Map();
heroes.forEach((h) => {
  if (!h.id) errors.push(`hero tanpa id: ${JSON.stringify(h.name)}`);
  if (ids.has(h.id)) errors.push(`ID duplikat: ${h.id} (${h.name})`);
  ids.add(h.id);
  if (slugs.has(h.slug)) errors.push(`slug duplikat: ${h.slug}`);
  slugs.add(h.slug);
  const n = String(h.name || '').toLowerCase();
  if (names.has(n)) warnings.push(`nama hero sama: ${h.name}`);
  names.add(n);
  heroById.set(h.id, h);
  if (!Array.isArray(h.roles) || h.roles.length === 0) warnings.push(`role kosong: ${h.name}`);
  if (!Array.isArray(h.lanes) || h.lanes.length === 0) warnings.push(`lane kosong: ${h.name}`);
  ['portrait', 'avatar', 'splash'].forEach((k) => fileOk(h.assets?.[k], `${h.name} ${k}`));
  if (skills[h.id] === undefined) warnings.push(`skill tidak ada untuk ${h.name} (${h.id})`);
});
info.push(`${heroes.length} hero, ${Object.keys(skills).length} entri skill`);

console.log('[2/4] Memeriksa ikon skill...');
let skillFiles = 0;
let skillMissing = 0;
Object.entries(skills).forEach(([hid, list]) => {
  if (!heroById.has(hid)) {
    errors.push(`hero-skills.json merujuk hero tak dikenal: ${hid}`);
    return;
  }
  (list || []).forEach((s) => {
    skillFiles += 1;
    if (s.icon && !fileOk(s.icon, `skill ${s.name} (${hid})`)) skillMissing += 1;
    if (!s.name) warnings.push(`skill tanpa nama di ${hid}`);
  });
});
info.push(`${skillFiles} skill terdaftar, ${skillMissing} ikon hilang`);

console.log('[3/4] Memeriksa meta tier, equipment, emblem, build...');
const meta = readJson('meta-tiers.json', null);
if (meta) {
  let metaCount = 0;
  Object.entries(meta.lanes || {}).forEach(([lane, map]) => {
    Object.entries(map).forEach(([hid, v]) => {
      metaCount += 1;
      if (!heroById.has(hid)) errors.push(`meta tier merujuk hero tak dikenal: ${hid} (${lane})`);
      if (!v.tier) warnings.push(`tier kosong: ${v.name} (${lane})`);
    });
  });
  Object.entries(meta.counterPicks || {}).forEach(([lane, list]) => {
    (list || []).forEach((v) => {
      if (!heroById.has(v.heroId)) errors.push(`counter pick merujuk hero tak dikenal: ${v.heroId} (${lane})`);
    });
  });
  info.push(`${metaCount} entri meta tier`);
}

const equip = readJson('equipment.json', null);
if (equip) {
  const eqIds = new Set();
  equip.items.forEach((e) => {
    if (eqIds.has(e.id)) errors.push(`equipment ID duplikat: ${e.id}`);
    eqIds.add(e.id);
    fileOk(e.icon, `equipment ${e.name}`);
  });
  info.push(`${equip.items.length} equipment, ikon diperiksa`);
}

const emblems = readJson('emblems.json', null);
if (emblems) info.push(`${(emblems.emblems || []).length} emblem`);

const builds = readJson('builds.json', null);
if (builds) {
  builds.builds.forEach((b) => {
    if (!heroById.has(b.heroId)) errors.push(`build merujuk hero tak dikenal: ${b.heroId}`);
  });
  info.push(`${builds.builds.length} build hero`);
}

console.log('[4/4] Memeriksa manifest & struktur aset...');
const manifestPath = path.join(PUBLIC, 'assets', 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  warnings.push('public/assets/manifest.json tidak ada (jalankan npm run data:fetch)');
} else {
  try {
    const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (man.totalHeroes !== heroes.length) {
      warnings.push(`manifest totalHeroes=${man.totalHeroes} berbeda dengan heroes.json=${heroes.length}`);
    }
    Object.entries(manifestPath ? man.heroes || {} : {}).forEach(([hid, entry]) => {
      if (!heroById.has(hid)) warnings.push(`manifest berisi hero tak dikenal: ${hid}`);
      if (entry.name && heroById.has(hid) && heroById.get(hid).name !== entry.name) {
        warnings.push(`nama beda di manifest: ${hid} (${entry.name} vs ${heroById.get(hid).name})`);
      }
    });
    info.push(`manifest: ${man.totalHeroes} hero`);
  } catch (e) {
    errors.push(`manifest rusak: ${e.message}`);
  }
}

const dirs = [
  ['public/assets/heroes', 'hero image'],
  ['public/assets/skills', 'skill image'],
  ['public/assets/items', 'item icon']
];
dirs.forEach(([d, label]) => {
  const abs = path.join(ROOT, d);
  if (!fs.existsSync(abs)) {
    warnings.push(`folder ${label} tidak ada: ${d}`);
    return;
  }
  const n = fs
    .readdirSync(abs, { recursive: true })
    .filter((f) => fs.statSync(path.join(abs, f)).isFile()).length;
  info.push(`${d}: ${n} file`);
});

/* ------------------------------------------------------------- hasil lapor */
console.log('\n================ HASIL VALIDASI ================');
info.forEach((i) => console.log(`  INFO  ${i}`));
warnings.forEach((w) => console.log(`  WARN  ${w}`));
errors.forEach((e) => console.log(`  ERROR ${e}`));
console.log(`------------------------------------------------`);
console.log(`  info=${info.length}  warning=${warnings.length}  error=${errors.length}`);

const out = {
  generatedAt: new Date().toISOString(),
  info,
  warnings,
  errors,
  ok: errors.length === 0
};
fs.mkdirSync(path.join(__dirname, 'report'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'report', 'validation-report.json'), JSON.stringify(out, null, 2), 'utf8');

if (errors.length) {
  console.log('\nVALIDASI GAGAL.');
  process.exit(1);
}
console.log('\nVALIDASI LULUS.');
