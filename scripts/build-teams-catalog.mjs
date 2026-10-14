/**
 * scripts/build-teams-catalog.mjs
 * ---------------------------------------------------------------------------
 * Membangun ulang katalog tim dari file Markdown di folder sumber ML FTI Cup.
 * Hanya membaca *.md — PDF tidak pernah dibuka/diproses.
 *
 * Jalankan: node scripts/build-teams-catalog.mjs
 * Output  : server/data/teams-catalog.json
 * ---------------------------------------------------------------------------
 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.env.TEAMS_MD_DIR || 'C:/Users/user/Documents/Data player ML Fti Cup';
const OUT = path.resolve('server/data/teams-catalog.json');

/** Slug stabil dari nama tim (id katalog). */
function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Baris sel tabel markdown → array sel (trim, buang sel kosong di ujung). */
function rowCells(line) {
  const t = String(line).trim();
  if (!t.startsWith('|') || !t.endsWith('|')) return null;
  return t
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim());
}

function isSeparatorRow(cells) {
  return cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/** Parse satu file markdown tim → { name, players:[{nickname}], warnings[] }. */
function parseTeamFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const warnings = [];
  let name = '';
  const players = [];
  let inPlayers = false;
  let headerCols = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // heading judul "# Data Pemain - X"
    const h1 = line.match(/^#\s+Data Pemain\s*-\s*(.+)$/i);
    if (h1 && !name) name = h1[1].trim();

    if (/^##\s+Daftar Pemain/i.test(line)) {
      inPlayers = true;
      headerCols = null;
      continue;
    }
    // heading lain mengakhiri bagian pemain
    if (inPlayers && /^#{1,3}\s/.test(line)) {
      inPlayers = false;
      continue;
    }

    if (!inPlayers) {
      // metadata "Nama Tim | X"
      const meta = line.match(/^\|\s*Nama Tim\s*\|\s*(.+?)\s*\|/i);
      if (meta && !name) name = meta[1].trim();
      continue;
    }

    const cells = rowCells(line);
    if (!cells) continue;
    if (isSeparatorRow(cells)) continue;
    if (!headerCols) {
      headerCols = cells.map((c) => c.toLowerCase());
      continue; // baris header
    }

    // kolom Nickname in Game
    const idxNick = headerCols.findIndex((c) => c.includes('nickname'));
    if (idxNick < 0) {
      warnings.push(`Baris ${i + 1}: kolom Nickname tidak ditemukan di header tabel.`);
      continue;
    }
    const nick = (cells[idxNick] ?? '').trim();
    if (!nick || nick === '-') {
      warnings.push(`Baris ${i + 1}: nickname kosong — dilewati, tidak ditebak.`);
      continue;
    }
    players.push({ nickname: nick });
  }

  if (!name) {
    // fallback: nama folder
    name = path.basename(path.dirname(filePath));
    warnings.push(`Nama tim tidak ditemukan di markdown — memakai nama folder "${name}".`);
  }
  return { name, players, warnings };
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Folder sumber tidak ditemukan: ${SRC}`);
    process.exit(1);
  }

  // Kumpulkan semua "Data Pemain*.md" per folder tim (kecuali Index di root)
  const entries = fs.readdirSync(SRC, { withFileTypes: true });
  const byId = new Map();
  const issues = [];

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(SRC, ent.name);
    const mds = fs
      .readdirSync(dir)
      .filter((f) => /^Data Pemain.*\.md$/i.test(f))
      .sort(); // "Robotic.md" sebelum "Robotic (2).md" — urutan alfabetis stabil

    if (mds.length === 0) {
      issues.push({ folder: ent.name, problem: 'Tidak ada file Markdown.' });
      continue;
    }

    // Gabungkan semua file Markdown dalam folder (Robotic = 2 file pengajuan ganda)
    let mergedName = '';
    const mergedPlayers = [];
    const folderWarnings = [];
    for (const f of mds) {
      const parsed = parseTeamFile(path.join(dir, f));
      if (!mergedName) mergedName = parsed.name;
      mergedPlayers.push(...parsed.players);
      folderWarnings.push(...parsed.warnings.map((w) => `${f}: ${w}`));
    }

    const id = slugify(mergedName || ent.name);
    if (byId.has(id)) {
      // tabrakan id — pertahankan yang pertama, catat
      issues.push({ folder: ent.name, problem: `Id "${id}" sudah dipakai tim lain — folder dilewati.` });
      continue;
    }

    const players = mergedPlayers.slice(0, 10); // batas wajar
    if (players.length === 0) {
      issues.push({
        folder: ent.name,
        problem: 'Tidak ada pemain terbaca dari Markdown (data kosong — tidak ditebak).',
        team: mergedName
      });
    }
    byId.set(id, {
      id,
      name: mergedName || ent.name,
      players,
      sourceFiles: mds.map((f) => `${ent.name}/${f}`)
    });
    if (folderWarnings.length) issues.push({ folder: ent.name, problem: folderWarnings.join(' | ') });
  }

  // Urutkan berdasarkan nama (case-insensitive) untuk dropdown stabil
  const teams = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'));

  const catalog = {
    tournament: 'ML FTI Cup',
    generatedAt: new Date().toISOString(),
    source: 'Markdown (Index Data Pemain.md + Data Pemain - *.md)',
    teamCount: teams.length,
    teams,
    issues
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2) + '\n', 'utf8');

  console.log(`Katalog ditulis: ${OUT}`);
  console.log(`Tim: ${teams.length}`);
  teams.forEach((t) => console.log(`  - ${t.name} (${t.id}) · ${t.players.length} pemain`));
  if (issues.length) {
    console.log(`\nIsu (${issues.length}):`);
    issues.forEach((i) => console.log(`  [${i.folder}] ${i.problem}`));
  }
}

main();
