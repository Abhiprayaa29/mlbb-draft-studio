/**
 * scripts/import-battle-spells.js
 * ---------------------------------------------------------------------------
 * Impor manual dataset battle spell (opsional) dengan validasi skema.
 *
 *   npm run data:battle-spells -- ./battle-spells.json   # impor & validasi
 *   npm run data:battle-spells -- --check                # cek data tersimpan
 *
 * Skema lengkap: server/data/battle-spells.schema.json
 *
 * Aturan yang dijaga (sesuai spesifikasi "tanpa data palsu"):
 *   - entri wajib punya ikon NYATA di public/assets/ → kalau tidak, entri
 *     dibuang (dan bila tidak ada satu pun, UI menampilkan catatan jujur bahwa
 *     battle spell belum tersedia);
 *   - ID hero/spell yang tidak dikenal dibuang, bukan ditebak;
 *   - file hasil tulis ditulis atomik agar tidak rusak bila proses terputus.
 *
 * Exit code 1 bila ada error (dipakai CI / pemeriksaan otomatis).
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'server', 'data');
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets');
const TARGET = path.join(DATA, 'battle-spells.json');
const SCHEMA = path.join(DATA, 'battle-spells.schema.json');

const ID_RE = /^[a-z0-9-]{1,40}$/;
const ICON_RE = /^spells\/[a-z0-9-]+\.(png|webp|jpg|jpeg)$/;

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const source = args.find((a) => !a.startsWith('--'));

const errors = [];
const warnings = [];

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

/** Validasi dokumen terhadap skema (implementasi ringkas tanpa dependensi). */
function validate(doc, heroIds) {
  const out = { version: 1, spells: [], heroSpells: {} };
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    errors.push('Dokumen harus berupa objek JSON.');
    return out;
  }
  if (!Number.isInteger(doc.version) || doc.version < 1) errors.push('"version" harus bilangan bulat >= 1.');
  if (!Array.isArray(doc.spells) || doc.spells.length === 0) {
    errors.push('"spells" harus berupa array berisi minimal satu battle spell.');
    return out;
  }

  const seen = new Set();
  doc.spells.forEach((s, i) => {
    const tag = `spells[${i}]`;
    if (!s || typeof s !== 'object') {
      errors.push(`${tag}: harus berupa objek.`);
      return;
    }
    if (typeof s.id !== 'string' || !ID_RE.test(s.id)) {
      errors.push(`${tag}.id: wajib pola ^[a-z0-9-]{1,40}$ (dapat: ${JSON.stringify(s.id)}).`);
      return;
    }
    if (seen.has(s.id)) {
      errors.push(`${tag}.id: duplikat "${s.id}".`);
      return;
    }
    if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 40) {
      errors.push(`${tag}.name: wajib string 1-40 karakter.`);
      return;
    }
    if (typeof s.icon !== 'string' || !ICON_RE.test(s.icon)) {
      errors.push(`${tag}.icon: wajib "spells/<id>.png|webp|jpg|jpeg" (dapat: ${JSON.stringify(s.icon)}).`);
      return;
    }
    // pastikan file ikon benar-benar ada & tidak kosong
    const abs = path.join(PUBLIC_ASSETS, s.icon);
    if (!fs.existsSync(abs)) {
      errors.push(`${tag}.icon: file tidak ditemukan -> public/assets/${s.icon}`);
      return;
    }
    if (fs.statSync(abs).size < 32) {
      errors.push(`${tag}.icon: file terlalu kecil/kosong -> public/assets/${s.icon}`);
      return;
    }
    seen.add(s.id);
    out.spells.push({
      id: s.id,
      name: s.name.trim(),
      icon: s.icon,
      ...(typeof s.description === 'string' ? { description: s.description.slice(0, 240) } : {})
    });
  });

  const spellIds = new Set(out.spells.map((s) => s.id));
  const rawHeroSpells = doc.heroSpells || {};
  if (typeof rawHeroSpells !== 'object' || Array.isArray(rawHeroSpells)) {
    warnings.push('heroSpells bukan objek — bagian rekomendasi per hero diabaikan.');
  } else {
    Object.entries(rawHeroSpells).forEach(([heroId, list]) => {
      if (!heroIds.has(heroId)) {
        warnings.push(`heroSpells: hero "${heroId}" tidak dikenal — entri dibuang.`);
        return;
      }
      if (!Array.isArray(list)) {
        warnings.push(`heroSpells.${heroId}: harus berupa array — entri dibuang.`);
        return;
      }
      const keep = list.filter((id) => {
        if (!spellIds.has(id)) {
          warnings.push(`heroSpells.${heroId}: spell "${id}" tidak ada/valid — dibuang.`);
          return false;
        }
        return true;
      });
      if (keep.length) out.heroSpells[heroId] = keep;
    });
  }

  if (out.spells.length === 0) {
    errors.push('Tidak ada entri battle spell valid (semua ikon hilang/invalid) — impor dibatalkan.');
  }
  return out;
}

function atomicWrite(file, contents) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, file);
}

function main() {
  const heroes = readJson(path.join(DATA, 'heroes.json')) || [];
  const heroIds = new Set(heroes.map((h) => h.id));

  if (!fs.existsSync(SCHEMA)) {
    errors.push('Skema tidak ditemukan: server/data/battle-spells.schema.json');
  }

  const file = checkOnly ? TARGET : source ? path.resolve(ROOT, source) : null;
  if (!file) {
    console.log('\nPemakaian:');
    console.log('  npm run data:battle-spells -- ./battle-spells.json   (impor)');
    console.log('  npm run data:battle-spells -- --check                (validasi data tersimpan)');
    console.log(`\nSkema: server/data/battle-spells.schema.json`);
    console.log('Ikon   : public/assets/spells/<id>.png\n');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`\n[GAGAL] File tidak ditemukan: ${file}`);
    process.exit(1);
  }

  let doc = null;
  try {
    doc = readJson(file);
  } catch (e) {
    errors.push(`JSON rusak: ${e.message}`);
  }

  let clean = { version: 1, spells: [], heroSpells: {} };
  if (doc) clean = validate(doc, heroIds);

  if (errors.length) {
    console.error(`\n[GAGAL] ${errors.length} error validasi battle spell:`);
    errors.forEach((e) => console.error(`  - ${e}`));
    if (warnings.length) {
      console.error(`\n${warnings.length} peringatan:`);
      warnings.forEach((w) => console.error(`  - ${w}`));
    }
    console.error(`\nSkema: server/data/battle-spells.schema.json\n`);
    process.exit(1);
  }

  if (checkOnly) {
    console.log(`\n[OK] battle-spells.json valid — ${clean.spells.length} spell, ${Object.keys(clean.heroSpells).length} hero berekomendasi.`);
    warnings.forEach((w) => console.log(`  ! ${w}`));
    console.log('');
    return;
  }

  atomicWrite(TARGET, `${JSON.stringify(clean, null, 2)}\n`);
  console.log(`\n[OK] ${clean.spells.length} battle spell diimpor ke server/data/battle-spells.json`);
  console.log(`     rekomendasi hero: ${Object.keys(clean.heroSpells).length}`);
  console.log(`     ikon: public/assets/spells/ (reload server untuk memuat ulang)`);
  warnings.forEach((w) => console.log(`  ! ${w}`));
  console.log('');
}

try {
  main();
} catch (e) {
  console.error(`\n[GAGAL] ${e.stack || e.message}`);
  process.exit(1);
}
