# TASK 15 — Katalog Tim ML FTI Cup dari Markdown

**Status: SELESAI (belum commit)** · HEAD `d47bfab` · 14 Okt 2026

---

## 1. File sumber yang digunakan (Markdown saja — PDF tidak dibaca)

Sumber: `C:\Users\user\Documents\Data player ML Fti Cup\`

| File | Peran |
|------|-------|
| `Index Data Pemain.md` | Daftar 17 tim (No, Nama Tim, Program Studi, Contact Person, Jumlah Pemain) |
| `<Tim>/Data Pemain - <Nama Tim>.md` | Metadata tim + tabel `Daftar Pemain` (Nickname in Game) |
| `Robotic/Data Pemain - Robotic (2).md` | File kedua Robotic (pengajuan ganda) |

**Tidak ada nama yang ditemukan sendiri.** Semua nickname diambil persis dari kolom `Nickname in Game` di Markdown.

---

## 2. Katalog (`server/data/teams-catalog.json`)

Dibangun oleh `scripts/build-teams-catalog.mjs` (jalankan ulang: `node scripts/build-teams-catalog.mjs`).

```
{
  tournament: "ML FTI Cup",
  generatedAt: "…",
  source: "Markdown (Index Data Pemain.md + Data Pemain - *.md)",
  teamCount: 17,
  teams: [
    { id: "arsuges", name: "Arsuges",
      players: [ { nickname: "AR¹." }, … ],
      sourceFiles: ["Arsuges/Data Pemain - Arsuges.md"] }
  ],
  issues: [ "[Chemen] Tidak ada pemain terbaca dari Markdown" ]
}
```

### Ringkasan 17 tim

| Tim | id | Pemain | Catatan |
|-----|-----|--------|---------|
| Arsuges | arsuges | 5 | |
| Ayam Jago | ayam-jago | 5 | |
| **Chemen** | chemen | **0** | File MD tanpa baris pemain — **tidak ditebak** |
| Chernobyl | chernobyl | 5 | Nickname mengandung unicode (☘ ᴀᶦʳᵃ) — dipertahankan |
| DANCOP | dancop | 5 | |
| EmEmSi | ememsi | 6 | Draft pakai 5 pertama |
| ERROR 505 | error-505 | 5 | |
| IF 24 x 25 | if-24-x-25 | 5 | |
| Kepencet Party | kepencet-party | 5 | |
| LAST DANCE | last-dance | 5 | |
| Mode On AktIF | mode-on-aktif | 5 | |
| Pedhooth | pedhooth | 6 | |
| **Robotic** | robotic | **10** | Digabung dari 2 file (urut nama file) |
| Tanpa Rafidd | tanpa-rafidd | 5 | |
| Teambangan | teambangan | 6 | |
| Terrarosa | terrarosa | 6 | |
| yessir | yessir | 5 | |

### Data yang tidak diproses / isu

- **Chemen (0 pemain)** — file MD hanya header + catatan `_Tidak ada data pemain yang terbaca dari PDF._`. Dropdown tetap menampilkan tim (nama valid), tapi roster kosong.
- **Robotic beda nickname antar-file** — player ke-3: `rrq*EVOS_arul*pro` (file 1) vs `Jujuu.` (file 2). Digabung urut nama file (file 1 dulu), jadi 10 pemain — keduanya masuk.
- **Nickname mengandung karakter garbled** (Chernobyl p1, Mode On AktIF p3, yessir p1) — dipertahankan persis seperti di MD, **tidak dikoreksi**.
- **Tim dengan 6 pemain** — state hanya menyimpan 5 slot draft; pemain ke-6 tetap ada di katalog JSON (bisa dipakai cadangan).

---

## 3. Perubahan kode

### Backend

| File | Perubahan |
|------|-----------|
| `scripts/build-teams-catalog.mjs` | **Baru** — parser Markdown → JSON katalog |
| `server/data/teams-catalog.json` | **Baru** — 17 tim, 82 nickname |
| `server/index.js` | Load katalog saat start; `GET /api/teams-catalog`; `team:update` menerima `catalogId` (validasi server-side, isi `name` + 5 `players` pertama); normalisasi `catalogId` saat load state lama |
| `server/store.js` | Normalisasi `catalogId` (string atau null) saat muat state |
| `server/draftEngine.js` | Default `catalogId: null` pada kedua tim |

### Frontend

| File | Perubahan |
|------|-----------|
| `src/lib/data.js` | `loadTeamsCatalog()` + cache + invalidate |
| `src/components/sidepanels.jsx` | `TeamPanel`: dropdown “Pilih tim (katalog ML FTI Cup)” (opsi: `— Manual —` + 17 tim + jumlah pemain) |

### Alur pemilihan tim

1. Operator buka dropdown **Pilih tim** di panel Blue/Red.
2. Pilih salah satu tim → `team:update { side, patch: { catalogId: "pedhooth" } }`.
3. Server validasi `catalogId` terhadap katalog → jika valid, tim diisi `name` + 5 nickname pertama; `catalogId` disimpan di state.
4. Jika `catalogId` tidak dikenal → **ditolak** dengan pesan error (`Tim katalog tidak dikenal: …`), state tidak berubah.
5. Edit manual (nama/roster) tetap diizinkan setelahnya tanpa menghapus referensi katalog.
6. Pilih `— Manual —` → `catalogId: null` (kembali manual).

### Overlay

Tidak ada perubahan komponen overlay — `state.teams.blue/red.name` dan `players[]` sudah dirender oleh:

- `/overlay/draft` — header tim + nickname per slot (toggle `showPlayerNames` tetap berlaku)
- `/overlay/score` (classic) — nama tim kiri/kanan
- `/overlay/score` (`sponsor-edition`) — TeamName kiri/kanan

---

## 4. Hasil verifikasi

| Cek | Hasil |
|-----|-------|
| Katalog 17 tim, Chemen 0, Robotic 10 | PASS |
| Dropdown tampil (18 opsi termasuk Manual) | PASS |
| Pilih Pedhooth via UI → state + roster 5 | PASS |
| Draft overlay: nama tim + semua nickname blue & red | PASS |
| Scoreboard classic: nama tim | PASS |
| Sponsor Edition: nama tim | PASS |
| Skor (kills 2–1) **tidak reset** saat ganti tim | PASS |
| Id tidak dikenal ditolak | PASS |
| 10 slot sponsor intact | PASS |
| Background transparan | PASS |
| `npx vite build` | hijau |
| `npm run test:server` | **166/0** |
| `npm test` (e2e) | **121/0** |

**Screenshot bukti:**

- `scripts/report/task15-draft-teams.png` — draft overlay: PEDHOOTH vs DANCOP, nickname 5 slot per sisi
- `scripts/report/task15-score-teams.png` — scoreboard classic: PEDHOOTH 2 – 1 DANCOP

---

## 5. Regresi TASK 14

- Tema broadcast (`broadcast.js` BC tokens) tidak diubah.
- Draft overlay: header `rgba(36,55,78,0.92)`, border teal, clip-paths — tetap.
- Scoreboard: preset `navy-tournament` (gold/teal) — tetap.
- Sponsor Edition: frame sponsor SVG, 10 slot, transparan — tetap.
- e2e 121/0 mencakup seluruh suite visual TASK 14.

---

## 6. Cara rebuild katalog

```bash
# default
node scripts/build-teams-catalog.mjs

# lokasi folder sumber lain (opsional)
TEAMS_MD_DIR="D:/path/ke/folder" node scripts/build-teams-catalog.mjs
```

Server membaca `server/data/teams-catalog.json` saat start — **restart server** setelah rebuild.
